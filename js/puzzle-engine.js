// Puzzle generation + anti-repetition rotation.
//
// Two independent ramps, both functions of the player's own history:
//  - difficulty mix ramps from mostly-easy toward a balanced mix over the
//    player's first ~30 completed puzzles.
//  - grid size ramps from the level minimum up to its full max over the
//    first ~50 completed puzzles (a big board is intimidating on its own,
//    independent of word difficulty, so it gets a longer window).
//
// Anti-repetition: each difficulty has its own shuffled draw queue - a
// puzzle cycles through every eligible word once before any repeats.
// IMPORTANT bug this avoids (shipped once, reported as "repetition"):
// never filter the persisted queue down to "words that fit this roll's
// grid size" before deciding what to draw. A word briefly too long for a
// small-grid roll must stay queued (skipped this round, not discarded),
// and a fresh cycle is only reshuffled once the queue is completely empty
// - not just low on words that happen to fit the current roll.

import { readPlayerJson, writePlayerJson } from './storage.js';

export const EXPOSURE_CAP = 10;
export const DIFFICULTY_RAMP_PUZZLES = 30;
export const GRID_SIZE_RAMP_PUZZLES = 50;
export const DIFFICULTIES = ['easy', 'medium', 'difficult'];
export const DIRECTIONS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

const PUZZLES_COMPLETED_KEY = 'baquest.puzzlesCompleted';
const EXPOSURE_COUNTS_KEY = 'baquest.exposureCounts';
const QUEUE_KEY_PREFIX = 'baquest.drawQueue';
const TOTAL_MARKS_KEY = 'baquest.totalMarks';

function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Some entries carry a `scenarios` array (a pool of alternate situational
// clues, e.g. many distinct "which scale is this?" examples for a single
// word like NOMINAL) instead of a single `scenario` string. This lets a
// word with only one possible answer still present a large, non-repeating
// set of confusing questions across its exposures, without needing fake
// duplicate word+difficulty entries. Resolved once per draw - not
// re-randomized on every re-render within the same puzzle/round.
export function resolveScenario(entry) {
  if (Array.isArray(entry.scenarios) && entry.scenarios.length > 0) {
    const picked = entry.scenarios[randInt(0, entry.scenarios.length - 1)];
    return { ...entry, scenario: picked };
  }
  return entry;
}

export function getPuzzlesCompleted(playerName) {
  return readPlayerJson(PUZZLES_COMPLETED_KEY, playerName, 0);
}

export function incrementPuzzlesCompleted(playerName) {
  const n = getPuzzlesCompleted(playerName) + 1;
  writePlayerJson(PUZZLES_COMPLETED_KEY, playerName, n);
  return n;
}

// Tracked and displayed entirely client-side, independent of whether any
// Supabase write ever succeeds - so a player always sees proof their marks
// are accumulating, even fully offline. This is separate from (and adds
// up the same values as) the shared Supabase scoreboard.
export function getTotalMarks(playerName) {
  return readPlayerJson(TOTAL_MARKS_KEY, playerName, 0);
}

export function addTotalMarks(playerName, delta) {
  const n = getTotalMarks(playerName) + delta;
  writePlayerJson(TOTAL_MARKS_KEY, playerName, n);
  return n;
}

function getExposureCounts(playerName) {
  return readPlayerJson(EXPOSURE_COUNTS_KEY, playerName, {});
}

function setExposureCounts(playerName, counts) {
  writePlayerJson(EXPOSURE_COUNTS_KEY, playerName, counts);
}

function getQueue(difficulty, playerName) {
  return readPlayerJson(`${QUEUE_KEY_PREFIX}.${difficulty}`, playerName, []);
}

function setQueue(difficulty, playerName, queue) {
  writePlayerJson(`${QUEUE_KEY_PREFIX}.${difficulty}`, playerName, queue);
}

function eligibleWords(entries, difficulty, exposureCounts) {
  return entries.filter(
    (e) => e.difficulty === difficulty && (exposureCounts[e.word] || 0) < EXPOSURE_CAP
  );
}

function difficultyMix(puzzlesCompleted) {
  const t = Math.min(puzzlesCompleted / DIFFICULTY_RAMP_PUZZLES, 1);
  const start = { easy: 0.7, medium: 0.2, difficult: 0.1 };
  const end = { easy: 0.34, medium: 0.33, difficult: 0.33 };
  return {
    easy: start.easy + (end.easy - start.easy) * t,
    medium: start.medium + (end.medium - start.medium) * t,
    difficult: start.difficult + (end.difficult - start.difficult) * t,
  };
}

function gridSizeCeiling(level, puzzlesCompleted) {
  const t = Math.min(puzzlesCompleted / GRID_SIZE_RAMP_PUZZLES, 1);
  return Math.round(level.gridSizeMin + (level.gridSizeMax - level.gridSizeMin) * t);
}

export function rollGridSize(level, puzzlesCompleted) {
  const ceiling = gridSizeCeiling(level, puzzlesCompleted);
  return randInt(level.gridSizeMin, Math.max(level.gridSizeMin, ceiling));
}

// Largest-remainder rounding: rounds each share while keeping the total
// exactly equal to `total`.
function largestRemainderRound(shares, total) {
  const floors = shares.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = shares
    .map((s, i) => ({ i, frac: s - Math.floor(s) }))
    .sort((a, b) => b.frac - a.frac);
  const result = floors.slice();
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) {
    result[order[k].i]++;
  }
  return result;
}

function drawWordsForDifficulty(entries, difficulty, count, gridSize, playerName, exposureCounts) {
  if (count <= 0) return [];

  let queue = getQueue(difficulty, playerName);
  const selected = [];

  function tryDraw() {
    let i = 0;
    while (selected.length < count && i < queue.length) {
      const word = queue[i];
      const entry = entries.find((e) => e.word === word && e.difficulty === difficulty);
      if (!entry || (exposureCounts[word] || 0) >= EXPOSURE_CAP) {
        queue.splice(i, 1); // no longer a valid/eligible entry, drop it
        continue;
      }
      if (entry.word.length <= gridSize) {
        selected.push(entry);
        queue.splice(i, 1); // drawn - leave the array index in place
      } else {
        i++; // too long for THIS roll - skip, stays queued for next time
      }
    }
  }

  tryDraw();

  // Reshuffle a fresh cycle only once the queue is completely empty -
  // never because it's merely "low on words that fit this grid size".
  if (selected.length < count && queue.length === 0) {
    const elig = eligibleWords(entries, difficulty, exposureCounts)
      .map((e) => e.word)
      .filter((w) => !selected.some((s) => s.word === w));
    if (elig.length > 0) {
      queue = shuffle(elig);
      tryDraw();
    }
  }

  setQueue(difficulty, playerName, queue);
  return selected;
}

function placeWordsOnGrid(words, gridSize, fillerMode) {
  const grid = Array.from({ length: gridSize }, () => Array(gridSize).fill(null));
  const placements = [];
  const usedLetters = [];

  const byLengthDesc = words.slice().sort((a, b) => b.word.length - a.word.length);

  for (const entry of byLengthDesc) {
    const letters = entry.word.toUpperCase();
    let placed = false;

    for (let attempt = 0; attempt < 400 && !placed; attempt++) {
      const [dx, dy] = DIRECTIONS[randInt(0, DIRECTIONS.length - 1)];
      const row = randInt(0, gridSize - 1);
      const col = randInt(0, gridSize - 1);
      const endRow = row + dy * (letters.length - 1);
      const endCol = col + dx * (letters.length - 1);
      if (endRow < 0 || endRow >= gridSize || endCol < 0 || endCol >= gridSize) continue;

      let fits = true;
      for (let k = 0; k < letters.length; k++) {
        const r = row + dy * k;
        const c = col + dx * k;
        const existing = grid[r][c];
        if (existing != null && existing !== letters[k]) {
          fits = false;
          break;
        }
      }
      if (!fits) continue;

      const path = [];
      for (let k = 0; k < letters.length; k++) {
        const r = row + dy * k;
        const c = col + dx * k;
        grid[r][c] = letters[k];
        usedLetters.push(letters[k]);
        path.push({ row: r, col: c });
      }
      placements.push({ word: entry.word, difficulty: entry.difficulty, meaning: entry.meaning, scenario: entry.scenario, path });
      placed = true;
    }
  }

  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (grid[r][c] != null) continue;
      const useCurated = fillerMode === 'curated' && usedLetters.length > 0 && Math.random() < 0.7;
      grid[r][c] = useCurated
        ? usedLetters[randInt(0, usedLetters.length - 1)]
        : ALPHABET[randInt(0, ALPHABET.length - 1)];
    }
  }

  return { grid, placements };
}

// Shared by every exercise type: word search and spelling draw from the
// SAME per-difficulty pools/queues/exposure counts, so a word's exposure
// cap and rotation position are exercise-type-agnostic - playing spelling
// still counts as "being asked" the word, and vice versa. `sizeLimit`
// constrains word length (a grid can only fit words up to its size);
// pass Infinity for exercise types with no such constraint.
function drawMixedWordSet(playerName, entries, totalCount, sizeLimit) {
  const puzzlesCompleted = getPuzzlesCompleted(playerName);
  const mix = difficultyMix(puzzlesCompleted);

  const shares = DIFFICULTIES.map((d) => mix[d] * totalCount);
  const counts = largestRemainderRound(shares, totalCount);
  const targetCounts = Object.fromEntries(DIFFICULTIES.map((d, i) => [d, counts[i]]));

  const exposureCounts = getExposureCounts(playerName);
  const selected = [];
  for (const difficulty of DIFFICULTIES) {
    selected.push(
      ...drawWordsForDifficulty(entries, difficulty, targetCounts[difficulty], sizeLimit, playerName, exposureCounts)
    );
  }

  if (selected.length === 0) return { selected: [], puzzlesCompleted };

  for (const entry of selected) {
    exposureCounts[entry.word] = (exposureCounts[entry.word] || 0) + 1;
  }
  setExposureCounts(playerName, exposureCounts);

  return { selected: selected.map(resolveScenario), puzzlesCompleted };
}

// Returns null only when the pool is genuinely exhausted (every word at
// the exposure cap) - callers should show the "you've seen it all" screen
// only in that case.
//
// The bug this avoids: a single roll's grid size can legitimately be too
// small to fit every remaining not-yet-capped word - e.g. once the short
// tiers run dry, only a handful of long words are left, and a small-grid
// roll can't fit any of them. That is NOT the same thing as "seen
// everything". A RANDOM retry only shrinks the odds of a false exhaustion
// screen, it doesn't eliminate them - so the guaranteed fallback is a
// forced roll at the level's own gridSizeMax. The content validator
// already hard-errors any word longer than that, so if even a max-size
// grid draws nothing, the pool is genuinely exhausted - no need to guess.
export function generatePuzzle(playerName, questionsData, level) {
  const entries = questionsData.entries;
  const puzzlesCompletedBefore = getPuzzlesCompleted(playerName);

  const attemptSizes = [rollGridSize(level, puzzlesCompletedBefore), level.gridSizeMax];

  for (const gridSize of attemptSizes) {
    const totalWords = Math.max(6, Math.round(gridSize * 0.9));
    const { selected, puzzlesCompleted } = drawMixedWordSet(playerName, entries, totalWords, gridSize);
    if (selected.length > 0) {
      const { grid, placements } = placeWordsOnGrid(selected, gridSize, level.fillerMode);
      return { gridSize, grid, placements, puzzlesCompleted };
    }
  }

  return null;
}

// Returns null when every word in the pool has hit the exposure cap.
export function drawSpellingSet(playerName, questionsData, count = 8) {
  const { selected } = drawMixedWordSet(playerName, questionsData.entries, count, Infinity);
  if (selected.length === 0) return null;
  return selected;
}

export function isPoolExhausted(playerName, questionsData) {
  const exposureCounts = getExposureCounts(playerName);
  return questionsData.entries.every((e) => (exposureCounts[e.word] || 0) >= EXPOSURE_CAP);
}

function buildClaim(leadin, label) {
  return `${leadin} This describes ${label}.`;
}

// True/False mode reuses the same draw/exposure/queue machinery as
// Word Search and Spelling (drawn words count as "asked" for rotation
// purposes the same way). For each drawn word, a claim is built pairing
// its OWN situational lead-in (scenario/meaning) with either its OWN
// `label` (true) or a DIFFERENT entry's label (false) - the impostor
// entry only lends its label, not its lead-in, and does NOT itself count
// as exposed, since it isn't really being asked about. The lead-in never
// names its own answer, so swapping in a different label always produces
// a complete, grammatical sentence - see README.md's "Editing content"
// notes for how `label` is meant to read as the tail end of
// "<lead-in> This describes <label>."
export function drawTrueFalseSet(playerName, questionsData, count = 10) {
  const { selected } = drawMixedWordSet(playerName, questionsData.entries, count, Infinity);
  if (selected.length === 0) return null;

  return selected.map((entry) => {
    const isTrue = Math.random() < 0.5;
    const leadin = entry.scenario || entry.meaning;
    if (isTrue) {
      return { word: entry.word, difficulty: entry.difficulty, isTrue, claimText: buildClaim(leadin, entry.label) };
    }
    const sameTier = questionsData.entries.filter((e) => e.word !== entry.word && e.difficulty === entry.difficulty);
    const pool = sameTier.length > 0 ? sameTier : questionsData.entries.filter((e) => e.word !== entry.word);
    const impostor = pool[randInt(0, pool.length - 1)];
    return { word: entry.word, difficulty: entry.difficulty, isTrue, claimText: buildClaim(leadin, impostor.label) };
  });
}

// Card Grouping mode: sort word cards into their correct `source` category
// bucket. Categories are drawn from each entry's existing `source` tag
// (already used purely for curator organization elsewhere), so this needs
// no new content - just enough distinct categories with 2+ not-yet-capped
// members. Returns null when fewer than 2 such categories remain (either
// the pool is genuinely exhausted, or what's left is too thin to group
// meaningfully) - callers should show the "seen everything" screen.
export function drawGroupingRound(playerName, questionsData, { categoryCount = 3, cardsPerCategory = 3 } = {}) {
  const exposureCounts = getExposureCounts(playerName);

  const bySource = new Map();
  for (const entry of questionsData.entries) {
    if ((exposureCounts[entry.word] || 0) >= EXPOSURE_CAP) continue;
    if (!bySource.has(entry.source)) bySource.set(entry.source, []);
    bySource.get(entry.source).push(entry);
  }

  const eligibleSources = [...bySource.entries()].filter(([, list]) => list.length >= 2);
  if (eligibleSources.length < 2) return null;

  const chosenSources = shuffle(eligibleSources).slice(0, categoryCount);
  const categories = chosenSources.map(([source, list]) => ({
    source,
    cards: shuffle(list)
      .slice(0, Math.min(cardsPerCategory, list.length))
      .map((e) => ({ word: e.word, difficulty: e.difficulty })),
  }));

  for (const category of categories) {
    for (const card of category.cards) {
      exposureCounts[card.word] = (exposureCounts[card.word] || 0) + 1;
    }
  }
  setExposureCounts(playerName, exposureCounts);

  return categories;
}
