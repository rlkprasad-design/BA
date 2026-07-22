<img src="assets/logo.svg" alt="BA Quest logo" width="96" />

# BA Quest

A calm, laptop-first recall game for Business Analytics terms - word search,
spelling/unscramble, true/false, and card grouping modes, with a shared
class scoreboard. Built the same way as its sister app (a Values-Oriented
Management recall game), reusing the same proven engine and avoiding the
same previously-shipped bugs.

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
  - `scenario` is a short situational description grounded in the actual
    course material (see below) - written as "given this situation, what
    term applies" rather than a plain definition, so the recall itself is
    application-oriented, not just rote.
  - `source` is a free-text category tag for the curator's own
    organization (e.g. "Unit 1: Types of Analytics") - never shown to
    players.
  - An entry can use `scenarios` (a non-empty array of strings) instead of
    a single `scenario` string, when one word has many distinct confusing
    examples worth asking about rather than just one. `js/puzzle-engine.js`
    picks one at random every time that word is drawn - so the same word
    can present a completely different tricky question on each of its
    exposures, without needing fake duplicate word+difficulty entries.
    `NOMINAL`/`ORDINAL`/`INTERVAL`/`RATIO` use this with 13 scenarios each
    (52 total), since those four words are the only possible answers for
    "which measurement scale is this?" but the confusing examples worth
    asking about are practically endless.
  - **Multi-word terms** (e.g. `COVERAGE ERROR`, `SURVIVOR BIAS`) keep a
    real space rather than being mashed into one unbroken blob like
    `COVERAGEERROR` - typing the natural two-word phrase in Spelling mode
    should work, not get silently rejected for not matching a compressed
    form nobody would guess. In Word Search, the space places as a genuine
    blank grid cell (still part of the drag path); in Spelling, the jumbled
    letters keep the space fixed at its original position rather than
    scrambling it into a random spot, and a typed attempt matches whether
    or not the player includes the space themselves.
- The 40-entry term bank is grounded in the course's own slides: **Unit I -
  Introduction to Business Analytics** (the science of data-driven
  decisions, the descriptive/predictive/prescriptive spectrum, the four Vs
  of big data, machine learning families, web & social analytics) and
  **Unit II - Data Collection** (collection methods, data formats and
  dimensions, the four measurement scales, problem formulation, research
  types, and common collection challenges). Meanings and scenarios reuse
  the units' own examples where they fit naturally - Abraham Wald's
  survivorship-bias story, the Netflix/Uber data-as-asset narratives, and
  the "sales are down, why?" research-type walkthrough.
- `data/levels.json` - grid size range and filler mode. Currently one level;
  the concept exists for future expansion.
- `scripts/validate-content.js` - run with `node scripts/validate-content.js`
  before shipping any content change. No dependencies. Checks for duplicate
  word+difficulty pairs, words that can never fit any grid, overlong
  meanings, and difficulty tiers that would feel starved at the smallest
  grid size.

### Decisions made explicit (per the build brief)

- **Tracing/handwriting mode**: not included. Skipped by request.
- **Max grid size**: 14x14 - originally 15x15, lowered to 13 after real play
  (on the sibling DBMS Quest app, same engine) found the largest grids
  uncomfortably big, then raised back to 14 to fit multi-word terms with
  a real space (`COVERAGE ERROR`, 14 chars) rather than mashing them into
  one unbroken blob - see "Multi-word terms" below.
- **Reward tiers**: Bronze / Silver / Gold for easy / medium / difficult,
  worth 1 / 3 / 6 base marks - mapped to grouped Bloom's Taxonomy levels
  (easy = Remember+Understand, medium = Apply+Analyze, difficult =
  Evaluate+Create).
- **Mode multiplier**: Word Search ("crossword") and Card Grouping award
  double a tier's base marks per find; Spelling and True/False award the
  base value as-is. Finding a word hidden among filler letters, or
  correctly recalling which category a term belongs to, is a harder recall
  task than assembling a word from an already-isolated letter tray or
  making a binary true/false call - see `MODE_MULTIPLIERS` in `js/gems.js`.
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
- Word search, spelling, and true/false all share the same per-difficulty
  pools, draw queues, and exposure counts - playing any one of them counts
  as "being asked" a word for the others' rotation too. Card grouping draws
  from the same exposure counts as well, but groups by category rather than
  by difficulty tier (see below).
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
- A word found by dragging it yourself earns its tier's token + marks
  (doubled for Word Search vs Spelling - see the mode multiplier above). A
  word revealed via "Show answer" completes the puzzle but earns nothing,
  and is shown in a visually distinct color in the grid.
- A persistent local marks total (`baquest.totalMarks`, `localStorage`) is
  shown in the header as "Marks: N", updated the instant a word is
  genuinely found - not gated behind full puzzle completion or any
  Supabase call. This is independent of the shared Supabase scoreboard, so
  a player always has visible proof their marks are accumulating even if
  Supabase is unreachable or misconfigured.
- Every Supabase call (`js/supabase-client.js`) is wrapped in try/catch, not
  just an `{ error }` field check - a missing table, CORS failure, or any
  other network-level problem can make the underlying fetch *reject*
  rather than resolve with an error, and local UI feedback should never be
  at the mercy of that.

### True/False mode

- `drawTrueFalseSet` (`js/puzzle-engine.js`) draws from the same mixed
  difficulty pool as word search/spelling. For each drawn word, it flips a
  coin: heads, the claim shown is that word's own meaning/scenario (true);
  tails, the claim is borrowed from a different entry - preferring one of
  the same difficulty tier so an impostor claim doesn't stand out just by
  looking harder or easier. The borrowed entry isn't itself counted as
  exposed, since it isn't really being asked about.
- Marks are only awarded for a genuine correct guess. "Show answer" reveals
  the truth and locks the card, but earns nothing, matching the same
  convention as word search/spelling.

### Card Grouping mode

- `drawGroupingRound` needs no new content: it buckets by each entry's
  existing `source` tag (already present purely for curator organization
  elsewhere) rather than any new taxonomy. It only offers categories with 2
  or more not-yet-exposure-capped members, and returns `null` (triggering
  the "seen everything" screen) once fewer than 2 such categories remain.
- Placing a card correctly awards marks immediately and removes it from the
  tray; placing it in the wrong bucket shakes that bucket and leaves the
  card selected for another attempt. A round completes once every drawn
  card has been correctly placed.

## Known gap from this environment

This app was built and tested in a sandboxed dev environment whose network
policy blocks arbitrary external hosts, including `esm.sh` (used to load
`@supabase/supabase-js`) and the Supabase project's own domain. Everything
that doesn't require reaching those hosts was verified in a real Chromium
browser: the name gate and history notice, word-search drag-to-find
(including the gem-burst animation's actual rendered bounding box, not just
its DOM presence), the "Show answer" visual distinction, spelling mode's
letter-click-to-build flow, true/false's answer/lock/reveal flow, card
grouping's select-then-place flow (including the wrong-bucket shake), and
the scoreboard's graceful no-crash fallback when Supabase can't be reached.
The actual round-trip to Supabase (writing
a score, reading the scoreboard back, submitting a flag) could not be
exercised from this environment and should be checked once deployed.

## Deployment

Deployed via GitHub Pages from `main`. Enable it once under the repo's
Settings > Pages > Deploy from a branch > `main` / root, if not already on.
Development happens on feature branches with one focused PR per change,
squash-merged to `main`.
