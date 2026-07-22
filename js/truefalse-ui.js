import { drawTrueFalseSet, incrementPuzzlesCompleted } from './puzzle-engine.js';
import { TIER_TOKENS, marksForFind } from './gems.js';
import { recordFind } from './supabase-client.js';

export function renderTrueFalse(container, { questionsData, playerName, onExhausted, onMarksEarned }) {
  const claims = drawTrueFalseSet(playerName, questionsData, 10);

  if (!claims) {
    container.innerHTML = `
      <div class="exhausted panel">
        <h2>You've seen everything here!</h2>
        <p>You've worked through every Business Analytics term at every level. Nice work.</p>
        <button class="primary" id="switch-mode-btn">Try Word Search instead</button>
      </div>`;
    container.querySelector('#switch-mode-btn').addEventListener('click', onExhausted);
    return;
  }

  container.innerHTML = `<div id="truefalse-cards"></div><div class="panel"><span id="completion-banner"></span></div>`;
  const cardsEl = container.querySelector('#truefalse-cards');
  const answered = new Map();

  claims.forEach((claim, index) => {
    const token = TIER_TOKENS[claim.difficulty];
    const card = document.createElement('div');
    card.className = 'panel truefalse-card';
    card.innerHTML = `
      <p class="truefalse-term">Term: <strong>${claim.word}</strong></p>
      <p>${claim.claimText}</p>
      <div class="controls">
        <span class="hint-token">${token.icon}</span>
        <button class="primary" data-answer="true" data-idx="${index}">True</button>
        <button class="secondary" data-answer="false" data-idx="${index}">False</button>
        <button class="secondary" data-show="${index}">Show answer</button>
      </div>
      <div class="feedback" data-feedback="${index}"></div>
    `;
    cardsEl.appendChild(card);

    function lockButtons() {
      card.querySelectorAll('button').forEach((b) => (b.disabled = true));
    }

    function answer(guessTrue) {
      if (answered.has(index)) return;
      const feedback = card.querySelector(`[data-feedback="${index}"]`);
      const correct = guessTrue === claim.isTrue;
      lockButtons();
      if (correct) {
        answered.set(index, 'self');
        feedback.textContent = `Correct! This claim is actually ${claim.isTrue ? 'true' : 'false'}.`;
        const marks = marksForFind(claim.difficulty, 'truefalse');
        onMarksEarned(marks); // immediate, local, independent of Supabase
        checkCompletion(); // don't gate user-facing completion on a network round-trip
        recordFind(playerName, claim.difficulty, marks, 'truefalse');
      } else {
        answered.set(index, 'wrong');
        feedback.textContent = `Not quite - this claim is actually ${claim.isTrue ? 'true' : 'false'}.`;
        checkCompletion();
      }
    }

    card.querySelector(`[data-answer="true"][data-idx="${index}"]`).addEventListener('click', () => answer(true));
    card.querySelector(`[data-answer="false"][data-idx="${index}"]`).addEventListener('click', () => answer(false));

    card.querySelector(`[data-show="${index}"]`).addEventListener('click', () => {
      if (answered.has(index)) return;
      answered.set(index, 'shown');
      lockButtons();
      card.querySelector(`[data-feedback="${index}"]`).textContent = `Shown - this claim is actually ${claim.isTrue ? 'true' : 'false'}. No marks earned.`;
      checkCompletion();
    });
  });

  function checkCompletion() {
    if (answered.size < claims.length) return;
    incrementPuzzlesCompleted(playerName);
    const marksEarned = claims.reduce(
      (sum, claim, i) => sum + (answered.get(i) === 'self' ? marksForFind(claim.difficulty, 'truefalse') : 0),
      0
    );
    const banner = container.querySelector('#completion-banner');
    banner.innerHTML = `
      <strong>Set complete! +${marksEarned} marks.</strong>
      <button class="primary" id="next-set-btn">Next set</button>`;
    banner.querySelector('#next-set-btn').addEventListener('click', () => {
      renderTrueFalse(container, { questionsData, playerName, onExhausted, onMarksEarned });
    });
  }
}
