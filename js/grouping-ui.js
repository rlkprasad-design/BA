import { drawGroupingRound, incrementPuzzlesCompleted } from './puzzle-engine.js';
import { celebrateFind, marksForFind } from './gems.js';
import { recordFind } from './supabase-client.js';

export function renderGrouping(container, { questionsData, playerName, onExhausted, onMarksEarned }) {
  const categories = drawGroupingRound(playerName, questionsData, { categoryCount: 3, cardsPerCategory: 3 });

  if (!categories) {
    container.innerHTML = `
      <div class="exhausted panel">
        <h2>You've seen everything here!</h2>
        <p>You've worked through every Business Analytics term at every level. Nice work.</p>
        <button class="primary" id="switch-mode-btn">Try Word Search instead</button>
      </div>`;
    container.querySelector('#switch-mode-btn').addEventListener('click', onExhausted);
    return;
  }

  const cardMeta = new Map();
  for (const category of categories) {
    for (const card of category.cards) {
      cardMeta.set(card.word, { ...card, correctSource: category.source });
    }
  }

  const shuffledWords = [...cardMeta.keys()]
    .map((w) => ({ w, k: Math.random() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.w);

  container.innerHTML = `
    <div class="panel">
      <p>Sort each term into the category it belongs to. Click a term, then click its category.</p>
      <div class="grouping-buckets" id="grouping-buckets">
        ${categories
          .map(
            (cat) => `
          <div class="bucket" data-source="${cat.source}">
            <h4 class="bucket-title">${cat.source}</h4>
            <div class="bucket-slot" data-source="${cat.source}"></div>
          </div>`
          )
          .join('')}
      </div>
      <div class="card-tray" id="card-tray">
        ${shuffledWords.map((word) => `<button class="card" data-word="${word}">${word}</button>`).join('')}
      </div>
    </div>
    <div class="panel"><span id="completion-banner"></span></div>
  `;

  const bucketsEl = container.querySelector('#grouping-buckets');
  const trayEl = container.querySelector('#card-tray');
  const placed = new Map(); // word -> true once correctly placed
  let selectedWord = null;

  function setSelected(word) {
    selectedWord = word;
    trayEl.querySelectorAll('.card').forEach((btn) => btn.classList.toggle('selected', btn.dataset.word === word));
  }

  trayEl.querySelectorAll('.card').forEach((btn) => {
    btn.addEventListener('click', () => setSelected(btn.dataset.word === selectedWord ? null : btn.dataset.word));
  });

  // One listener per bucket (not also on its inner slot) - a click on the
  // slot bubbles up to the bucket anyway, and listening on both would fire
  // the same placement attempt twice for a single click.
  bucketsEl.querySelectorAll('.bucket').forEach((bucketEl) => {
    bucketEl.addEventListener('click', () => attemptPlacement(bucketEl.dataset.source));
  });

  function attemptPlacement(bucketSource) {
    if (!selectedWord) return;
    const meta = cardMeta.get(selectedWord);
    const cardBtn = trayEl.querySelector(`.card[data-word="${selectedWord}"]`);
    const bucketEl = bucketsEl.querySelector(`.bucket[data-source="${bucketSource}"]`);
    const slotEl = bucketEl.querySelector('.bucket-slot');

    if (meta.correctSource === bucketSource) {
      placed.set(selectedWord, true);
      cardBtn.remove();
      const chip = document.createElement('div');
      chip.className = 'placed-chip';
      chip.textContent = selectedWord;
      slotEl.appendChild(chip);
      celebrateFind(bucketsEl, slotEl, meta.difficulty);
      const marks = marksForFind(meta.difficulty, 'grouping');
      onMarksEarned(marks); // immediate, local, independent of Supabase
      selectedWord = null;
      checkCompletion(); // don't gate user-facing completion on a network round-trip
      recordFind(playerName, meta.difficulty, marks);
    } else {
      bucketEl.classList.add('bucket-wrong');
      window.setTimeout(() => bucketEl.classList.remove('bucket-wrong'), 400);
    }
  }

  function checkCompletion() {
    if (placed.size < cardMeta.size) return;
    incrementPuzzlesCompleted(playerName);
    const marksEarned = [...cardMeta.values()].reduce((sum, meta) => sum + marksForFind(meta.difficulty, 'grouping'), 0);
    const banner = container.querySelector('#completion-banner');
    banner.innerHTML = `
      <strong>Round complete! +${marksEarned} marks.</strong>
      <button class="primary" id="next-round-btn">Next round</button>`;
    banner.querySelector('#next-round-btn').addEventListener('click', () => {
      renderGrouping(container, { questionsData, playerName, onExhausted, onMarksEarned });
    });
  }
}
