#!/usr/bin/env node
// Content validator for data/questions.json + data/levels.json.
// No dependencies. Run with: node scripts/validate-content.js
//
// Exit code 0 = no hard errors (warnings may still be printed).
// Exit code 1 = at least one hard error.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const MEANING_SOFT_LIMIT = 120;
const SCENARIO_SOFT_LIMIT = 220;
const MIN_WORD_LENGTH = 2;
const DIFFICULTIES = ['easy', 'medium', 'difficult'];

function loadJson(relativePath) {
  const raw = readFileSync(join(ROOT, relativePath), 'utf8');
  return JSON.parse(raw);
}

function main() {
  const errors = [];
  const warnings = [];

  const { entries } = loadJson('data/questions.json');
  const levels = loadJson('data/levels.json');

  const maxGridSizeEver = Math.max(...levels.map((l) => l.gridSizeMax));
  const minGridSizeEver = Math.min(...levels.map((l) => l.gridSizeMin));

  const seenWordDifficulty = new Set();

  for (const entry of entries) {
    const { word, meaning, difficulty } = entry;
    const label = `"${word}" (${difficulty})`;

    if (!word || typeof word !== 'string') {
      errors.push(`Entry missing a valid "word": ${JSON.stringify(entry)}`);
      continue;
    }
    if (!DIFFICULTIES.includes(difficulty)) {
      errors.push(`${label}: difficulty must be one of ${DIFFICULTIES.join(', ')}`);
    }

    const key = `${word.toUpperCase()}::${difficulty}`;
    if (seenWordDifficulty.has(key)) {
      errors.push(`Duplicate word+difficulty combination: ${label}`);
    }
    seenWordDifficulty.add(key);

    if (word.length < MIN_WORD_LENGTH) {
      errors.push(`${label}: word must be at least ${MIN_WORD_LENGTH} characters`);
    }

    // A single interior space is allowed (e.g. "COVERAGE ERROR") - the grid
    // places it as a blank cell and the letter jumble keeps it fixed in
    // place. Leading/trailing/double spaces would just be a malformed
    // typo, not a real multi-word term.
    if (/^\s|\s$|\s{2,}/.test(word)) {
      errors.push(`${label}: word has leading/trailing/double spaces - check for a typo`);
    }

    if (word.length > maxGridSizeEver) {
      errors.push(
        `${label}: word length ${word.length} exceeds the largest grid any level can ever roll (${maxGridSizeEver}) — it can never fit.`
      );
    }

    if (meaning && meaning.length > MEANING_SOFT_LIMIT) {
      warnings.push(
        `${label}: meaning is ${meaning.length} chars, above the soft limit of ${MEANING_SOFT_LIMIT}`
      );
    }

    // `scenarios` (a pool of alternate situational clues for entries with
    // only one possible answer, e.g. NOMINAL/ORDINAL/INTERVAL/RATIO) is an
    // alternative to a single `scenario` string - exactly one form is
    // expected per entry.
    if (entry.scenarios != null) {
      if (!Array.isArray(entry.scenarios) || entry.scenarios.length === 0) {
        errors.push(`${label}: "scenarios" must be a non-empty array when present`);
      } else {
        entry.scenarios.forEach((s, i) => {
          if (typeof s !== 'string' || !s.trim()) {
            errors.push(`${label}: scenarios[${i}] must be a non-empty string`);
          } else if (s.length > SCENARIO_SOFT_LIMIT) {
            warnings.push(
              `${label}: scenarios[${i}] is ${s.length} chars, above the soft limit of ${SCENARIO_SOFT_LIMIT}`
            );
          }
        });
      }
    } else if (entry.scenario && entry.scenario.length > SCENARIO_SOFT_LIMIT) {
      warnings.push(
        `${label}: scenario is ${entry.scenario.length} chars, above the soft limit of ${SCENARIO_SOFT_LIMIT}`
      );
    }

    // A scenario/scenarios lead-in must be a plain situational description,
    // not a question - js/puzzle-engine.js's drawTrueFalseSet glues it
    // directly onto "This describes <label>." to form the actual True/False
    // claim, so a trailing question mark here would mean the resulting
    // sentence reads as "<situation>? This describes <label>."
    const leadinTexts = entry.scenario ? [entry.scenario] : (Array.isArray(entry.scenarios) ? entry.scenarios : []);
    leadinTexts.forEach((text, i) => {
      if (typeof text === 'string' && text.trim().endsWith('?')) {
        const suffix = entry.scenario ? '' : `[${i}]`;
        errors.push(`${label}: scenario${suffix} ends with "?" - True/False needs a plain situational lead-in, since it's appended to "This describes <label>." to form the claim`);
      }
    });

    if (entry.label != null && (typeof entry.label !== 'string' || !entry.label.trim())) {
      errors.push(`${label}: "label" must be a non-empty string when present`);
    } else if (!entry.label || !entry.label.trim()) {
      errors.push(`${label}: "label" is missing - True/False needs it to build "<lead-in> This describes <label>." for every entry it can draw`);
    }
  }

  // Starved-tier check: for each level's smallest rollable grid size (the
  // tightest constraint, since eligibility only grows as grid size grows),
  // warn if a difficulty has fewer than 2 eligible words.
  for (const level of levels) {
    for (const difficulty of DIFFICULTIES) {
      const eligible = entries.filter(
        (e) => e.difficulty === difficulty && e.word.length <= level.gridSizeMin
      );
      if (eligible.length < 2) {
        warnings.push(
          `Level ${level.levelNumber}: only ${eligible.length} "${difficulty}" word(s) fit at the minimum grid size (${level.gridSizeMin}x${level.gridSizeMin}) — this tier may feel starved early on.`
        );
      }
    }
  }

  console.log(`Checked ${entries.length} entries across levels with grid sizes ${minGridSizeEver}-${maxGridSizeEver}.`);

  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  ! ${w}`);
  }

  if (errors.length) {
    console.log(`\n${errors.length} error(s):`);
    for (const e of errors) console.log(`  x ${e}`);
    process.exit(1);
  }

  console.log('\nNo errors.');
}

main();
