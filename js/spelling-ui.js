import { drawSpellingSet, incrementPuzzlesCompleted } from './puzzle-engine.js';
import { TIER_TOKENS, celebrateFind, marksForFind } from './gems.js';
import { recordFind, recordTimeSpent, flagTerm } from './supabase-client.js';
import { randomAffirmation } from './affirmations.js';

// Multi-word terms (e.g. "COVERAGE ERROR") keep their space fixed in place
// rather than shuffling it into a random spot - it reads as a structural
// hint (where the word breaks), not something to hide, and a space
// wandering into the middle of a jumbled letter run would just look broken.
function shuffledLetters(word) {
  const chars = word.split('');
  const spaceIndices = [];
  const letters = [];
  chars.forEach((c, i) => {
    if (c === ' ') spaceIndices.push(i);
    else letters.push(c);
  });

  if (letters.length < 2) return chars;

  let shuffled;
  do {
    shuffled = letters
      .map((l) => ({ l, k: Math.random() }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.l);
  } while (shuffled.join('') === letters.join(''));

  for (const idx of spaceIndices) shuffled.splice(idx, 0, ' ');
  return shuffled;
}

export function renderSpelling(container, { questionsData, playerName, onExhausted, onMarksEarned }) {
  const words = drawSpellingSet(playerName, questionsData, 10);

  if (!words) {
    container.innerHTML = `
      <div class="exhausted panel">
        <h2>You've seen everything here!</h2>
        <p>You've worked through every Business Analytics term at every level. Nice work.</p>
        <button class="primary" id="switch-mode-btn">Try Word Search instead</button>
      </div>`;
    container.querySelector('#switch-mode-btn').addEventListener('click', onExhausted);
    return;
  }

  container.innerHTML = `<div id="spelling-cards"></div><div class="panel"><span id="completion-banner"></span></div>`;
  const cardsEl = container.querySelector('#spelling-cards');
  const solved = new Map();
  const startedAt = Date.now();

  words.forEach((entry, index) => {
    const token = TIER_TOKENS[entry.difficulty];
    const jumbled = shuffledLetters(entry.word);

    const card = document.createElement('div');
    card.className = 'panel spelling-card';
    card.style.position = 'relative';
    card.innerHTML = `
      <p>${entry.scenario || entry.meaning}</p>
      <p class="jumbled-letters" data-idx="${index}">${jumbled.join(' ')}</p>
      <input type="text" class="answer-input" data-idx="${index}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Type your answer" />
      <div class="controls">
        <span class="hint-token">${token.icon}</span>
        <button class="secondary" data-clear="${index}">Clear</button>
        <button class="primary" data-submit="${index}">Submit</button>
        <button class="secondary" data-show="${index}">Show answer</button>
        <button class="flag-icon" data-word="${entry.word}" aria-label="Flag this term">🚩</button>
        <span class="flag-caption" data-caption-for="${entry.word}"></span>
      </div>
      <div class="feedback" data-feedback="${index}"></div>
    `;
    cardsEl.appendChild(card);

    const inputEl = card.querySelector(`.answer-input[data-idx="${index}"]`);
    const allButtons = () => card.querySelectorAll('button');

    function submitAttempt() {
      if (solved.has(index)) return;
      const feedback = card.querySelector(`[data-feedback="${index}"]`);
      // Whitespace-tolerant: a multi-word answer like "COVERAGE ERROR"
      // matches whether or not the player actually types the space.
      const attempt = inputEl.value.trim().toUpperCase().replace(/\s+/g, ' ');
      const target = entry.word.replace(/\s+/g, ' ');
      if (attempt === target || attempt.replace(/\s/g, '') === target.replace(/\s/g, '')) {
        solved.set(index, 'self');
        inputEl.value = entry.word;
        inputEl.disabled = true;
        feedback.textContent = 'Correct!';
        celebrateFind(card, inputEl, entry.difficulty);
        allButtons().forEach((b) => (b.disabled = true));
        const marks = marksForFind(entry.difficulty, 'spelling');
        onMarksEarned(marks); // immediate, local, independent of Supabase
        checkCompletion(); // don't gate user-facing completion on a network round-trip
        recordFind(playerName, entry.difficulty, marks, 'spelling');
      } else {
        feedback.textContent = 'Not quite - try again.';
      }
    }

    card.querySelector(`[data-clear="${index}"]`).addEventListener('click', () => {
      if (solved.has(index)) return;
      inputEl.value = '';
      inputEl.focus();
    });

    card.querySelector(`[data-submit="${index}"]`).addEventListener('click', submitAttempt);

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitAttempt();
    });

    card.querySelector(`[data-show="${index}"]`).addEventListener('click', () => {
      if (solved.has(index)) return;
      solved.set(index, 'shown');
      inputEl.value = entry.word;
      inputEl.disabled = true;
      card.querySelector(`[data-feedback="${index}"]`).textContent = 'Shown - no marks earned.';
      allButtons().forEach((b) => (b.disabled = true));
      checkCompletion();
    });

    card.querySelector('.flag-icon').addEventListener('click', async () => {
      const caption = card.querySelector(`[data-caption-for="${entry.word}"]`);
      caption.textContent = 'Flagging...';
      const result = await flagTerm({
        word: entry.word,
        meaning: entry.meaning,
        difficulty: entry.difficulty,
        sourceMode: 'spelling',
        flaggedBy: playerName,
      });
      caption.textContent = result.localOnly
        ? 'Not saved - shared flagging needs Supabase configured.'
        : 'Thanks - flagged for review.';
    });
  });

  function checkCompletion() {
    if (solved.size < words.length) return;
    incrementPuzzlesCompleted(playerName);
    const marksEarned = words.reduce(
      (sum, entry, i) => sum + (solved.get(i) === 'self' ? marksForFind(entry.difficulty, 'spelling') : 0),
      0
    );
    recordTimeSpent(playerName, Math.round((Date.now() - startedAt) / 1000));
    const banner = container.querySelector('#completion-banner');
    banner.innerHTML = `
      <strong>Set complete! +${marksEarned} marks.</strong>
      <p class="affirmation">${randomAffirmation()}</p>
      <button class="primary" id="next-set-btn">Next set</button>`;
    banner.querySelector('#next-set-btn').addEventListener('click', () => {
      renderSpelling(container, { questionsData, playerName, onExhausted, onMarksEarned });
    });
  }
}
