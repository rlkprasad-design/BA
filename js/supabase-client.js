// Thin Supabase wrapper. All BA Quest tables are prefixed `ba_` so they
// don't collide with any other app sharing this same Supabase project.
// If config.js is left blank, every function below becomes a no-op - the
// game still works fully offline (see README).
//
// The supabase-js import is loaded lazily (dynamic import), not at the
// top of the module: a static top-level import of a CDN URL would make
// the WHOLE APP fail to load the instant that CDN is unreachable - even
// for a player with no Supabase configured at all. Loading it only when
// SUPABASE_URL/KEY are actually set (and swallowing a failed fetch) is
// what makes "local-only mode" a real, working fallback rather than a
// comment that lies the moment the network misbehaves.
//
// Every exported function below is wrapped in try/catch, not just an
// `{ error }` check on the result: a missing table, a CORS failure, a
// paused/misconfigured project, or a bad URL can make the underlying
// fetch REJECT rather than resolve with an error field. An unhandled
// rejection here previously meant recordFind() could abort silently -
// which, when a caller awaited it before doing anything else, meant
// local UI updates that had nothing to do with Supabase never ran
// either. See main.js's onMarksEarned callback: local marks are now
// tracked and displayed independent of any of this ever succeeding.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const TIER_COLUMN = { easy: 'bronze_count', medium: 'silver_count', difficult: 'gold_count' };
const MODE_COLUMN = {
  wordsearch: 'wordsearch_marks',
  spelling: 'spelling_marks',
  truefalse: 'truefalse_marks',
  grouping: 'grouping_marks',
};

let clientPromise = null;

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import('https://esm.sh/@supabase/supabase-js@2')
      .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY))
      .catch((err) => {
        console.warn('Supabase client unavailable, running in local-only mode:', err);
        return null;
      });
  }
  return clientPromise;
}

export async function recordFind(playerName, difficulty, marksDelta, mode) {
  try {
    const supabase = await getClient();
    if (!supabase) return { localOnly: true };

    const { data: existing, error: selectError } = await supabase
      .from('ba_scores')
      .select('*')
      .eq('player_name', playerName)
      .maybeSingle();
    if (selectError) console.error('recordFind select failed:', selectError.message);

    const row = existing || {
      player_name: playerName,
      bronze_count: 0,
      silver_count: 0,
      gold_count: 0,
      total_marks: 0,
      wordsearch_marks: 0,
      spelling_marks: 0,
      truefalse_marks: 0,
      grouping_marks: 0,
    };

    const column = TIER_COLUMN[difficulty];
    row[column] = (row[column] || 0) + 1;
    row.total_marks = (row.total_marks || 0) + marksDelta;

    const modeColumn = MODE_COLUMN[mode];
    row[modeColumn] = (row[modeColumn] || 0) + marksDelta;

    const { error } = await supabase.from('ba_scores').upsert(row, { onConflict: 'player_name' });
    if (error) console.error('recordFind upsert failed:', error.message);
    return { localOnly: false };
  } catch (err) {
    console.warn('recordFind failed unexpectedly, continuing in local-only mode:', err);
    return { localOnly: true };
  }
}

export async function fetchTopScores(limit = 50) {
  try {
    const supabase = await getClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('ba_scores')
      .select(
        'player_name, bronze_count, silver_count, gold_count, total_marks, wordsearch_marks, spelling_marks, truefalse_marks, grouping_marks'
      )
      .order('total_marks', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('fetchTopScores failed:', error.message);
      return [];
    }
    return data;
  } catch (err) {
    console.warn('fetchTopScores failed unexpectedly:', err);
    return [];
  }
}

export async function flagTerm({ word, meaning, difficulty, sourceMode, flaggedBy }) {
  try {
    const supabase = await getClient();
    if (!supabase) return { localOnly: true };
    const { error } = await supabase.from('ba_flagged_terms').insert({
      word,
      meaning,
      difficulty,
      source_mode: sourceMode,
      flagged_by: flaggedBy,
    });
    if (error) console.error('flagTerm failed:', error.message);
    return { localOnly: false };
  } catch (err) {
    console.warn('flagTerm failed unexpectedly, continuing in local-only mode:', err);
    return { localOnly: true };
  }
}

export async function fetchFlaggedTerms(limit = 50) {
  try {
    const supabase = await getClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('ba_flagged_terms')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('fetchFlaggedTerms failed:', error.message);
      return [];
    }
    return data;
  } catch (err) {
    console.warn('fetchFlaggedTerms failed unexpectedly:', err);
    return [];
  }
}
