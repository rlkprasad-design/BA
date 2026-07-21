# BA Quest

A calm, laptop-first recall game for Business Analytics terms - word search
and spelling/unscramble modes, with a shared class scoreboard. Built the
same way as its sister app (a Values-Oriented Management recall game),
reusing the same proven engine and avoiding the same previously-shipped
bugs.

## Running locally

No build step. Serve the folder with any static file server and open it:

```
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Setting up Supabase

This app is configured to share a Supabase project with another app. All of
its tables are prefixed `ba_` (`ba_scores`, `ba_flagged_terms`) so nothing
collides with the other app's tables in the same project.

1. Open your Supabase project's SQL Editor.
2. Run `supabase/schema.sql` once to create the tables, enable RLS, and add
   the (intentionally open, no-login) policies.
3. `js/config.js` already has this project's `SUPABASE_URL` and anon
   (publishable) key filled in.

If `js/config.js` is ever left blank, the game runs fully offline: puzzles,
spelling sets, and local progress all work, but scores stay on that device
and never reach the shared scoreboard. The Supabase client is loaded lazily
(dynamic `import()` only when a URL/key are present) specifically so a
missing or unreachable Supabase project can never break the rest of the
app - see the comment at the top of `js/supabase-client.js`.

## Content

- `data/questions.json` - the term bank: `{ word, meaning, scenario, difficulty, source }`.
  - `difficulty` is one of `easy | medium | difficult`, mixed together in
    every puzzle.
  - `scenario` is an optional short situational description (e.g. "a vendor
    offers a gift to speed up a PO - what value applies?" style, adapted
    here to BA scenarios) - included from day one, unused by v1's UI, so a
    later "apply this concept" exercise type is just new content, not a
    schema migration.
  - `source` is a free-text category tag for the curator's own
    organization (e.g. "Descriptive Statistics") - never shown to players.
- `data/levels.json` - grid size range and filler mode. Currently one level;
  the concept exists for future expansion.
- `scripts/validate-content.js` - run with `node scripts/validate-content.js`
  before shipping any content change. No dependencies. Checks for duplicate
  word+difficulty pairs, words that can never fit any grid, overlong
  meanings, and difficulty tiers that would feel starved at the smallest
  grid size.

### Decisions made explicit (per the build brief)

- **Tracing/handwriting mode**: not included. Skipped by request.
- **Max grid size**: 15x15 (laptop-bound, chosen to comfortably fit longer
  single-word BA terms like STANDARDIZATION/AUTOCORRELATION).
- **Reward tiers**: Bronze / Silver / Gold for easy / medium / difficult,
  worth 1 / 3 / 6 marks respectively - mapped to grouped Bloom's Taxonomy
  levels (easy = Remember+Understand, medium = Apply+Analyze, difficult =
  Evaluate+Create).
- **`scenario` field**: added to the schema now, even though v1's UI only
  displays it as an alternate hint text (falls back to `meaning` if empty).

These were all deliberate calls made for this build - change any of them by
editing the relevant constant (`data/levels.json` for grid size, `js/gems.js`
for tokens/marks) rather than treating them as fixed.

## Puzzle engine notes

- Each difficulty has its own shuffled draw queue so a player cycles
  through every eligible word before any repeats. A word too long for a
  particular grid-size roll stays queued (skipped, not discarded) - it
  reappears once a bigger grid rolls. A fresh cycle is only reshuffled once
  the queue is completely empty.
- Word search and spelling mode share the same per-difficulty pools, draw
  queues, and exposure counts - playing one counts as "being asked" a word
  for the other's rotation too.
- Each word is retired from rotation after being asked 10 times
  (`EXPOSURE_CAP` in `js/puzzle-engine.js`). Once every word in the pool
  has hit that cap, players see a "you've seen everything" screen with a
  button to switch modes - this only fires when the pool is genuinely
  exhausted, not just when one unlucky small-grid roll can't fit whatever
  is left (see the comment above `generatePuzzle` for why that distinction
  needed a guaranteed max-grid-size fallback roll, not just a random retry).
- Difficulty mix ramps from mostly-easy toward a balanced mix over a
  player's first ~30 completed puzzles; grid size independently ramps from
  the level minimum to its full max over the first ~50.
- A word found by dragging it yourself earns its tier's token + marks. A
  word revealed via "Show answer" completes the puzzle but earns nothing,
  and is shown in a visually distinct color in the grid.

## Known gap from this environment

This app was built and tested in a sandboxed dev environment whose network
policy blocks arbitrary external hosts, including `esm.sh` (used to load
`@supabase/supabase-js`) and the Supabase project's own domain. Everything
that doesn't require reaching those hosts was verified in a real Chromium
browser: the name gate and history notice, word-search drag-to-find
(including the gem-burst animation's actual rendered bounding box, not just
its DOM presence), the "Show answer" visual distinction, spelling mode's
letter-click-to-build flow, and the scoreboard's graceful no-crash fallback
when Supabase can't be reached. The actual round-trip to Supabase (writing
a score, reading the scoreboard back, submitting a flag) could not be
exercised from this environment and should be checked once deployed.

## Deployment

Deployed via GitHub Pages from `main`. Enable it once under the repo's
Settings > Pages > Deploy from a branch > `main` / root, if not already on.
Development happens on feature branches with one focused PR per change,
squash-merged to `main`.
