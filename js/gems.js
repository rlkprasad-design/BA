// Reward tiers map to grouped Bloom's Taxonomy levels:
//   easy = Remember + Understand, medium = Apply + Analyze,
//   difficult = Evaluate + Create.
// Each tier has a distinct token AND an increasing marks value - higher-order
// recall is worth visibly more, not just a different-colored badge.
export const TIER_TOKENS = {
  easy: { name: 'Bronze', icon: '🥉', marks: 1 },
  medium: { name: 'Silver', icon: '🥈', marks: 3 },
  difficult: { name: 'Gold', icon: '🥇', marks: 6 },
};

const CELEBRATION_DURATION_MS = 1300;

// Appended to the GRID CONTAINER, not the found cell. A cell needs
// overflow:hidden so long words don't spill into neighbors, and that same
// overflow would silently clip this animation the instant it grows past
// the cell's edge - it'd exist in the DOM and animate correctly while
// being completely invisible. The grid container has position:relative
// and no overflow clipping, so the burst is positioned using the found
// cell's own offset relative to it instead.
export function celebrateFind(gridContainerEl, cellEl, difficulty) {
  const token = TIER_TOKENS[difficulty];
  const containerRect = gridContainerEl.getBoundingClientRect();
  const cellRect = cellEl.getBoundingClientRect();

  const burst = document.createElement('div');
  burst.className = 'gem-burst';
  burst.textContent = token.icon;
  burst.style.left = `${cellRect.left - containerRect.left + cellRect.width / 2}px`;
  burst.style.top = `${cellRect.top - containerRect.top + cellRect.height / 2}px`;

  gridContainerEl.appendChild(burst);
  window.setTimeout(() => burst.remove(), CELEBRATION_DURATION_MS);
}
