import { TIER_TOKENS } from './gems.js';
import { fetchTopScores, fetchFlaggedTerms } from './supabase-client.js';

const DEFAULT_VISIBLE = 10;

export async function renderScoreboard(container) {
  container.innerHTML = `<div class="panel"><p>Loading scoreboard...</p></div>`;

  const [scores, flagged] = await Promise.all([fetchTopScores(), fetchFlaggedTerms()]);

  let visibleCount = DEFAULT_VISIBLE;

  function renderTable() {
    const rows = scores
      .slice(0, visibleCount)
      .map(
        (row, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${row.player_name}</td>
          <td>${TIER_TOKENS.easy.icon} ${row.bronze_count}</td>
          <td>${TIER_TOKENS.medium.icon} ${row.silver_count}</td>
          <td>${TIER_TOKENS.difficult.icon} ${row.gold_count}</td>
          <td>${row.wordsearch_marks || 0}</td>
          <td>${row.spelling_marks || 0}</td>
          <td>${row.truefalse_marks || 0}</td>
          <td>${row.grouping_marks || 0}</td>
          <td><strong>${row.total_marks}</strong></td>
        </tr>`
      )
      .join('');

    tableWrapper.innerHTML = `
      <div class="table-scroll">
      <table class="scoreboard">
        <thead>
          <tr>
            <th>#</th><th>Player</th><th>Bronze</th><th>Silver</th><th>Gold</th>
            <th>Word Search</th><th>Spelling</th><th>True/False</th><th>Grouping</th><th>Marks</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="10">No scores yet - be the first!</td></tr>'}</tbody>
      </table>
      </div>
      ${
        scores.length > DEFAULT_VISIBLE
          ? `<button class="secondary" id="toggle-visible">${visibleCount >= scores.length ? 'Show less' : 'Show more'}</button>`
          : ''
      }
      <div class="legend">
        <span><span class="token">${TIER_TOKENS.easy.icon} Bronze</span> = ${TIER_TOKENS.easy.marks} mark (Remember/Understand)</span>
        <span><span class="token">${TIER_TOKENS.medium.icon} Silver</span> = ${TIER_TOKENS.medium.marks} marks (Apply/Analyze)</span>
        <span><span class="token">${TIER_TOKENS.difficult.icon} Gold</span> = ${TIER_TOKENS.difficult.marks} marks (Evaluate/Create)</span>
        <span>Word Search and Grouping are worth double these marks per find; Spelling and True/False award the base value.</span>
        <span>"Show answer" earns no token or marks.</span>
        <span>The Word Search/Spelling/True-False/Grouping columns show marks earned in that mode specifically.</span>
      </div>
    `;

    const toggleBtn = tableWrapper.querySelector('#toggle-visible');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        visibleCount = visibleCount >= scores.length ? DEFAULT_VISIBLE : scores.length;
        renderTable();
      });
    }
  }

  const flaggedRows = flagged
    .map(
      (f) => `
      <tr>
        <td>${f.word}</td>
        <td>${f.difficulty || ''}</td>
        <td>${f.source_mode || ''}</td>
        <td>${f.flagged_by || ''}</td>
        <td>${new Date(f.created_at).toLocaleDateString()}</td>
      </tr>`
    )
    .join('');

  container.innerHTML = `
    <div class="panel" id="scoreboard-panel">
      <h2>Class Scoreboard</h2>
      <div id="scoreboard-table"></div>
    </div>
    <div class="panel">
      <h3>Flagged terms</h3>
      <p style="color: var(--muted); font-size: 0.85rem;">Terms players have flagged as unclear or wrong. Fix the source in <code>data/questions.json</code> to resolve.</p>
      <table class="scoreboard">
        <thead><tr><th>Word</th><th>Difficulty</th><th>Mode</th><th>Flagged by</th><th>Date</th></tr></thead>
        <tbody>${flaggedRows || '<tr><td colspan="5">No flags yet.</td></tr>'}</tbody>
      </table>
    </div>
  `;

  const tableWrapper = container.querySelector('#scoreboard-table');
  renderTable();
}
