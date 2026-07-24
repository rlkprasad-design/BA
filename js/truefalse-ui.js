import { drawTrueFalseSet, incrementPuzzlesCompleted } from './puzzle-engine.js';
import { TIER_TOKENS, marksForFind } from './gems.js';
import { recordFind, recordTimeSpent } from './supabase-client.js';
import { randomAffirmation } from './affirmations.js';

// Every scenario is authored as "[situation]. [What/Which ... is this?]" -
// that trailing question is exactly what Word Search/Spelling need (the
// player supplies the missing term), but it leaves True/False with nothing
// but a dangling question next to a term, no actual claim to judge as true
// or false. Stripping that last question sentence and pairing the
// situation with an explicit "Claim: this is an example of X" statement
// gives the player something grammatically real to evaluate.
function situationOnly(text) {
  const sentences = text.match(/[^.!?]+[.!?]+['"’”]?/g);
  if (!sentences || sentences.length < 2) return text;
  const last = sentences[sentences.length - 1].trim();
  if (!last.endsWith('?')) return text; // last sentence isn't a question - nothing to strip
  // Join with '' (not ' ') - each matched sentence already carries its own
  // leading space from the original text, so adding another would double
  // it up (e.g. "Mr." + " Singh's..." -> "Mr.  Singh's" with two spaces).
  return sentences.slice(0, -1).join('').trim();
}

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
  const startedAt = Date.now();

  claims.forEach((claim, index) => {
    const token = TIER_TOKENS[claim.difficulty];
    const card = document.createElement('div');
    card.className = 'panel truefalse-card';
    card.innerHTML = `
      <p>${situationOnly(claim.claimText)}</p>
      <p class="truefalse-claim">Claim: this is an example of <strong>${claim.word}</strong>.</p>
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
    recordTimeSpent(playerName, Math.round((Date.now() - startedAt) / 1000));
    const banner = container.querySelector('#completion-banner');
    banner.innerHTML = `
      <strong>Set complete! +${marksEarned} marks.</strong>
      <p class="affirmation">${randomAffirmation()}</p>
      <button class="primary" id="next-set-btn">Next set</button>`;
    banner.querySelector('#next-set-btn').addEventListener('click', () => {
      renderTrueFalse(container, { questionsData, playerName, onExhausted, onMarksEarned });
    });
  }
}
