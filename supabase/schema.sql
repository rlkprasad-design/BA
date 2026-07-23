-- BA Quest schema. Tables are prefixed `ba_` because this project is
-- shared with another app - keeps everything independent, no collisions.
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).

create table if not exists ba_scores (
  player_name text primary key,
  bronze_count integer not null default 0,
  silver_count integer not null default 0,
  gold_count integer not null default 0,
  total_marks integer not null default 0,
  wordsearch_marks integer not null default 0,
  spelling_marks integer not null default 0,
  truefalse_marks integer not null default 0,
  grouping_marks integer not null default 0,
  total_seconds integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Safe to re-run against an already-created table: `create table if not
-- exists` above never adds columns to a table that already exists, so an
-- existing deployment needs these explicitly. Each one is itself
-- idempotent, so running this whole file again is always safe.
alter table ba_scores add column if not exists wordsearch_marks integer not null default 0;
alter table ba_scores add column if not exists spelling_marks integer not null default 0;
alter table ba_scores add column if not exists truefalse_marks integer not null default 0;
alter table ba_scores add column if not exists grouping_marks integer not null default 0;
alter table ba_scores add column if not exists total_seconds integer not null default 0;

create table if not exists ba_flagged_terms (
  id bigint generated always as identity primary key,
  word text not null,
  meaning text,
  difficulty text,
  source_mode text,
  flagged_by text,
  created_at timestamptz not null default now()
);

alter table ba_scores enable row level security;
alter table ba_flagged_terms enable row level security;

-- No login, so every visitor uses the anon (publishable) key. Anyone can
-- read the scoreboard and flagged-terms panel; anyone can write their own
-- score row or submit a flag. This matches the "no accounts, trusted
-- display name" identity model described in the brief - there is no
-- server-side way to verify identity, so RLS here is intentionally open
-- rather than pretending otherwise.
--
-- `create policy` has no `if not exists` form, unlike the table/column
-- statements above - re-running this file against an already-set-up
-- project would otherwise fail with "policy already exists" the moment it
-- reached these. `drop policy if exists` immediately before each one makes
-- the whole file safely re-runnable end to end.
drop policy if exists "Anyone can read scores" on ba_scores;
create policy "Anyone can read scores" on ba_scores
  for select using (true);
drop policy if exists "Anyone can upsert their own score row" on ba_scores;
create policy "Anyone can upsert their own score row" on ba_scores
  for insert with check (true);
drop policy if exists "Anyone can update score rows" on ba_scores;
create policy "Anyone can update score rows" on ba_scores
  for update using (true);

drop policy if exists "Anyone can read flagged terms" on ba_flagged_terms;
create policy "Anyone can read flagged terms" on ba_flagged_terms
  for select using (true);
drop policy if exists "Anyone can submit a flag" on ba_flagged_terms;
create policy "Anyone can submit a flag" on ba_flagged_terms
  for insert with check (true);
