import { drawSpellingSet, incrementPuzzlesCompleted } from './puzzle-engine.js';
import { TIER_TOKENS, celebrateFind } from './gems.js';
import { recordFind, flagTerm } from './supabase-client.js';

function shuffledLetters(word) {
  const letters = word.split('');
  if (letters.length < 2) return letters;
  let shuffled;
  do {
    shuffled = letters
      .map((l) => ({ l, k: Math.random() }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.l);
  } while (shuffled.join('') === word);
  return shuffled;
}

export function renderSpelling(container, { questionsData, playerName, onExhausted }) {
  const words = drawSpellingSet(playerName, questionsData, 8);

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

  words.forEach((entry, index) => {
    const token = TIER_TOKENS[entry.difficulty];
    const jumbled = shuffledLetters(entry.word);

    const card = document.createElement('div');
    card.className = 'panel spelling-card';
    card.style.position = 'relative';
    card.innerHTML = `
      <p>${entry.scenario || entry.meaning}</p>
      <div class="letter-bank" data-idx="${index}"></div>
      <div class="answer-area" data-idx="${index}" style="min-height: 2.2em; letter-spacing: 3px; font-weight: 600; margin: 8px 0;"></div>
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

    const bankEl = card.querySelector(`.letter-bank[data-idx="${index}"]`);
    const answerEl = card.querySelector(`.answer-area[data-idx="${index}"]`);
    let built = [];
    let usedIndices = new Set();

    function renderBank() {
      bankEl.innerHTML = '';
      jumbled.forEach((letter, i) => {
        const btn = document.createElement('button');
        btn.className = 'secondary';
        btn.textContent = letter;
        btn.disabled = usedIndices.has(i);
        btn.addEventListener('click', () => {
          if (solved.has(index)) return;
          built.push({ letter, i });
          usedIndices.add(i);
          answerEl.textContent = built.map((b) => b.letter).join('');
          renderBank();
        });
        bankEl.appendChild(btn);
      });
    }

    function reset() {
      built = [];
      usedIndices = new Set();
      answerEl.textContent = '';
      renderBank();
    }

    card.querySelector(`[data-clear="${index}"]`).addEventListener('click', reset);

    card.querySelector(`[data-submit="${index}"]`).addEventListener('click', async () => {
      if (solved.has(index)) return;
      const feedback = card.querySelector(`[data-feedback="${index}"]`);
      const attempt = built.map((b) => b.letter).join('');
      if (attempt === entry.word) {
        solved.set(index, 'self');
        answerEl.textContent = entry.word;
        feedback.textContent = 'Correct!';
        celebrateFind(card, answerEl, entry.difficulty);
        await recordFind(playerName, entry.difficulty, token.marks);
        card.querySelectorAll('button').forEach((b) => (b.disabled = true));
        checkCompletion();
      } else {
        feedback.textContent = 'Not quite - try again.';
      }
    });

    card.querySelector(`[data-show="${index}"]`).addEventListener('click', () => {
      if (solved.has(index)) return;
      solved.set(index, 'shown');
      answerEl.textContent = entry.word;
      card.querySelector(`[data-feedback="${index}"]`).textContent = 'Shown - no marks earned.';
      card.querySelectorAll('button').forEach((b) => (b.disabled = true));
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

    renderBank();
  });

  function checkCompletion() {
    if (solved.size < words.length) return;
    incrementPuzzlesCompleted(playerName);
    const marksEarned = words.reduce(
      (sum, entry, i) => sum + (solved.get(i) === 'self' ? TIER_TOKENS[entry.difficulty].marks : 0),
      0
    );
    const banner = container.querySelector('#completion-banner');
    banner.innerHTML = `
      <strong>Set complete! +${marksEarned} marks.</strong>
      <button class="primary" id="next-set-btn">Next set</button>`;
    banner.querySelector('#next-set-btn').addEventListener('click', () => {
      renderSpelling(container, { questionsData, playerName, onExhausted });
    });
  }
}
