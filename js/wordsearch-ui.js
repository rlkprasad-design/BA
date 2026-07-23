import { generatePuzzle, incrementPuzzlesCompleted } from './puzzle-engine.js';
import { TIER_TOKENS, celebrateFind, marksForFind } from './gems.js';
import { recordFind, recordTimeSpent, flagTerm } from './supabase-client.js';

function sameCells(a, b) {
  if (a.length !== b.length) return false;
  return a.every((cell, i) => cell.row === b[i].row && cell.col === b[i].col);
}

function reversed(path) {
  return path.slice().reverse();
}

function computeDragPath(start, current, gridSize) {
  const dRow = current.row - start.row;
  const dCol = current.col - start.col;
  const isStraight = dRow === 0 || dCol === 0 || Math.abs(dRow) === Math.abs(dCol);
  if (!isStraight) return null;

  const stepRow = Math.sign(dRow);
  const stepCol = Math.sign(dCol);
  const length = Math.max(Math.abs(dRow), Math.abs(dCol)) + 1;

  const path = [];
  for (let i = 0; i < length; i++) {
    const row = start.row + stepRow * i;
    const col = start.col + stepCol * i;
    if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) return null;
    path.push({ row, col });
  }
  return path;
}

export function renderWordSearch(container, { questionsData, level, playerName, onExhausted, onMarksEarned }) {
  const puzzle = generatePuzzle(playerName, questionsData, level);

  if (!puzzle) {
    container.innerHTML = `
      <div class="exhausted panel">
        <h2>You've seen everything here!</h2>
        <p>You've worked through every Business Analytics term at every level. Nice work.</p>
        <button class="primary" id="switch-mode-btn">Try Spelling mode instead</button>
      </div>`;
    container.querySelector('#switch-mode-btn').addEventListener('click', onExhausted);
    return;
  }

  const { gridSize, grid, placements } = puzzle;
  const solved = new Map(); // word -> 'self' | 'shown'
  const startedAt = Date.now();

  container.innerHTML = `
    <div class="panel">
      <div class="grid-container" id="grid" style="grid-template-columns: repeat(${gridSize}, 34px);"></div>
    </div>
    <div class="panel">
      <h3>Find these terms</h3>
      <ul class="hint-list" id="hint-list"></ul>
      <div class="controls">
        <span id="completion-banner"></span>
      </div>
    </div>`;

  const gridEl = container.querySelector('#grid');
  const hintListEl = container.querySelector('#hint-list');

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      // A space (the gap in a multi-word term like "COVERAGE ERROR") is
      // still a real cell in the drag path - matching is by coordinates,
      // not displayed character, so this is purely cosmetic. Shown as a
      // small centered dot rather than a truly empty square, so it reads
      // as "intentionally blank" instead of looking like a render glitch.
      if (grid[r][c] === ' ') {
        cell.classList.add('grid-cell-blank');
        cell.textContent = '·';
      } else {
        cell.textContent = grid[r][c];
      }
      gridEl.appendChild(cell);
    }
  }

  function cellEl(row, col) {
    return gridEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
  }

  function renderHints() {
    hintListEl.innerHTML = '';
    for (const p of placements) {
      const token = TIER_TOKENS[p.difficulty];
      const status = solved.get(p.word);
      const li = document.createElement('li');
      li.className = status ? 'solved' : '';
      li.innerHTML = `
        <span class="hint-token">${token.icon}</span>
        <span class="hint-text">
          ${p.scenario || p.meaning}
          <button class="flag-icon" data-word="${p.word}" aria-label="Flag this term">🚩</button>
          <span class="flag-caption" data-caption-for="${p.word}"></span>
        </span>
        ${!status ? `<button class="secondary" data-show="${p.word}">Show answer</button>` : `<em>${status === 'self' ? 'found' : 'shown'}</em>`}
      `;
      hintListEl.appendChild(li);
    }

    hintListEl.querySelectorAll('[data-show]').forEach((btn) => {
      btn.addEventListener('click', () => revealWord(btn.dataset.show));
    });
    hintListEl.querySelectorAll('.flag-icon').forEach((btn) => {
      btn.addEventListener('click', () => onFlag(btn.dataset.word));
    });
  }

  async function onFlag(word) {
    const placement = placements.find((p) => p.word === word);
    const caption = hintListEl.querySelector(`[data-caption-for="${word}"]`);
    caption.textContent = 'Flagging...';
    const result = await flagTerm({
      word,
      meaning: placement.meaning,
      difficulty: placement.difficulty,
      sourceMode: 'wordsearch',
      flaggedBy: playerName,
    });
    caption.textContent = result.localOnly
      ? 'Not saved - shared flagging needs Supabase configured.'
      : 'Thanks - flagged for review.';
  }

  function markCellsFound(path, cssClass) {
    for (const { row, col } of path) {
      const el = cellEl(row, col);
      el.classList.remove('dragging');
      el.classList.add(cssClass);
    }
  }

  function revealWord(word) {
    if (solved.has(word)) return;
    const placement = placements.find((p) => p.word === word);
    solved.set(word, 'shown');
    markCellsFound(placement.path, 'found-shown');
    renderHints();
    checkCompletion();
  }

  function onGenuineFind(placement) {
    solved.set(placement.word, 'self');
    markCellsFound(placement.path, 'found-self');
    const firstCell = cellEl(placement.path[0].row, placement.path[0].col);
    celebrateFind(gridEl, firstCell, placement.difficulty);
    renderHints();
    const marks = marksForFind(placement.difficulty, 'wordsearch');
    onMarksEarned(marks); // immediate, local, independent of Supabase
    checkCompletion(); // don't gate user-facing completion on a network round-trip
    recordFind(playerName, placement.difficulty, marks, 'wordsearch');
  }

  function checkCompletion() {
    if (solved.size < placements.length) return;
    incrementPuzzlesCompleted(playerName);
    const marksEarned = placements
      .filter((p) => solved.get(p.word) === 'self')
      .reduce((sum, p) => sum + marksForFind(p.difficulty, 'wordsearch'), 0);
    recordTimeSpent(playerName, Math.round((Date.now() - startedAt) / 1000));
    const banner = container.querySelector('#completion-banner');
    banner.innerHTML = `
      <strong>Puzzle complete! +${marksEarned} marks.</strong>
      <button class="primary" id="next-puzzle-btn">Next puzzle</button>`;
    banner.querySelector('#next-puzzle-btn').addEventListener('click', () => {
      renderWordSearch(container, { questionsData, level, playerName, onExhausted, onMarksEarned });
    });
  }

  // --- Drag-to-find interaction (mouse + touch) ---
  let dragging = false;
  let startCell = null;
  let currentPath = [];

  function clearDragHighlight() {
    for (const { row, col } of currentPath) cellEl(row, col).classList.remove('dragging');
  }

  function beginDrag(row, col) {
    dragging = true;
    startCell = { row, col };
    currentPath = [{ row, col }];
    cellEl(row, col).classList.add('dragging');
  }

  function updateDrag(row, col) {
    if (!dragging) return;
    const path = computeDragPath(startCell, { row, col }, gridSize);
    if (!path) return;
    clearDragHighlight();
    currentPath = path;
    for (const cell of currentPath) cellEl(cell.row, cell.col).classList.add('dragging');
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    const match = placements.find(
      (p) => !solved.has(p.word) && (sameCells(p.path, currentPath) || sameCells(p.path, reversed(currentPath)))
    );
    clearDragHighlight();
    if (match) onGenuineFind(match);
    currentPath = [];
  }

  function cellFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el || !el.classList.contains('grid-cell')) return null;
    return { row: Number(el.dataset.row), col: Number(el.dataset.col) };
  }

  gridEl.addEventListener('mousedown', (e) => {
    const el = e.target.closest('.grid-cell');
    if (el) beginDrag(Number(el.dataset.row), Number(el.dataset.col));
  });
  gridEl.addEventListener('mousemove', (e) => {
    const el = e.target.closest('.grid-cell');
    if (el) updateDrag(Number(el.dataset.row), Number(el.dataset.col));
  });
  window.addEventListener('mouseup', endDrag);

  gridEl.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    const cell = cellFromPoint(t.clientX, t.clientY);
    if (cell) beginDrag(cell.row, cell.col);
  });
  gridEl.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    const cell = cellFromPoint(t.clientX, t.clientY);
    if (cell) updateDrag(cell.row, cell.col);
    e.preventDefault();
  }, { passive: false });
  window.addEventListener('touchend', endDrag);

  renderHints();
}
