import { getCurrentPlayer, hasHistory, setActivePlayer, clearActivePlayer } from './identity.js';
import { renderWordSearch } from './wordsearch-ui.js';
import { renderSpelling } from './spelling-ui.js';
import { renderScoreboard } from './scoreboard.js';

const appEl = document.getElementById('app');

async function loadJson(path) {
  const res = await fetch(path);
  return res.json();
}

function renderNameGate(onReady) {
  appEl.innerHTML = `
    <div class="name-gate">
      <img class="app-logo app-logo--large" src="assets/logo.svg" alt="" />
      <h1>BA Quest</h1>
      <p>Enter a display name to play. No account needed.</p>
      <input id="name-input" type="text" maxlength="40" placeholder="Your name" />
      <div id="history-slot"></div>
      <button class="primary" id="name-submit">Play</button>
    </div>`;

  const input = document.getElementById('name-input');
  const submit = document.getElementById('name-submit');
  const historySlot = document.getElementById('history-slot');

  function trySubmit() {
    const name = input.value.trim();
    if (!name) return;

    if (hasHistory(name) && !historySlot.dataset.confirmed) {
      historySlot.innerHTML = `
        <div class="history-notice">
          This name has history - if that's you, great; if not, your scores will merge with theirs.
        </div>`;
      historySlot.dataset.confirmed = 'true';
      return; // require a second click to proceed, so the notice is seen
    }

    setActivePlayer(name);
    onReady(name);
  }

  submit.addEventListener('click', trySubmit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') trySubmit();
  });
  input.addEventListener('input', () => {
    delete historySlot.dataset.confirmed;
    historySlot.innerHTML = '';
  });
}

function renderShell(playerName, questionsData, levelsData) {
  const level = levelsData[0];

  appEl.innerHTML = `
    <div class="app">
      <header class="app-header">
        <div style="display: flex; align-items: center; gap: 10px;">
          <img class="app-logo" src="assets/logo.svg" alt="" />
          <h1>BA Quest</h1>
        </div>
        <div>
          <span style="color: var(--muted); margin-right: 12px;">Playing as <strong>${playerName}</strong></span>
          <nav class="app-nav">
            <button data-view="wordsearch" class="active">Word Search</button>
            <button data-view="spelling">Spelling</button>
            <button data-view="scoreboard">Scoreboard</button>
            <button id="switch-player-btn">Switch player</button>
          </nav>
        </div>
      </header>
      <div id="view-content"></div>
    </div>`;

  const contentEl = document.getElementById('view-content');
  const navButtons = [...document.querySelectorAll('[data-view]')];

  function setActiveNav(view) {
    navButtons.forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  }

  function showView(view) {
    setActiveNav(view);
    if (view === 'wordsearch') {
      renderWordSearch(contentEl, {
        questionsData,
        level,
        playerName,
        onExhausted: () => showView('spelling'),
      });
    } else if (view === 'spelling') {
      renderSpelling(contentEl, {
        questionsData,
        playerName,
        onExhausted: () => showView('wordsearch'),
      });
    } else if (view === 'scoreboard') {
      renderScoreboard(contentEl);
    }
  }

  navButtons.forEach((btn) => btn.addEventListener('click', () => showView(btn.dataset.view)));
  document.getElementById('switch-player-btn').addEventListener('click', () => {
    clearActivePlayer();
    renderNameGate((name) => renderShell(name, questionsData, levelsData));
  });
  showView('wordsearch');
}

async function boot() {
  const [questionsData, levelsData] = await Promise.all([
    loadJson('data/questions.json'),
    loadJson('data/levels.json'),
  ]);

  const existingPlayer = getCurrentPlayer();
  if (existingPlayer) {
    renderShell(existingPlayer, questionsData, levelsData);
  } else {
    renderNameGate((name) => renderShell(name, questionsData, levelsData));
  }
}

boot();
