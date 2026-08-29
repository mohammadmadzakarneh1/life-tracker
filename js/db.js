// Every database call in the app goes through this module. Views never talk to Supabase
// directly, so error handling, the user_id stamp, and date filtering live in one place.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from './config.js';

// createClient throws on a malformed URL, and that would happen at import time — before
// app.js gets a chance to show the setup instructions. Fall back to a dummy origin when
// the keys are still placeholders; app.js checks isConfigured and never calls out.
export const supabase = createClient(
  isConfigured ? SUPABASE_URL : 'https://placeholder.supabase.co',
  isConfigured ? SUPABASE_ANON_KEY : 'placeholder-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true } }
);

/** Throws on error so callers can use a single try/catch instead of checking every result. */
function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

/** The signed-in user's id, stamped onto every row we insert. */
async function uid() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Not signed in');
  return data.user.id;
}

/* ---------------- habits ---------------- */

export const habits = {
  async list({ includeArchived = false } = {}) {
    let q = supabase.from('habits').select('*').order('created_at', { ascending: true });
    if (!includeArchived) q = q.eq('archived', false);
    return unwrap(await q);
  },

  async create({ name, icon = '✦', color = null, target_days = 7 }) {
    const rows = unwrap(
      await supabase
        .from('habits')
        .insert({ user_id: await uid(), name, icon, color, target_days })
        .select()
    );
    return rows[0];
  },

  async update(id, patch) {
    return unwrap(await supabase.from('habits').update(patch).eq('id', id).select());
  },

  async remove(id) {
    // habit_logs cascade via the FK, so this cleans up its history too.
    return unwrap(await supabase.from('habits').delete().eq('id', id));
  },
};

/* ---------------- habit logs ---------------- */

export const habitLogs = {
  /** All logs in [from, to] inclusive — used by both the checklist and the streak maths. */
  async range(from, to) {
    return unwrap(
      await supabase
        .from('habit_logs')
        .select('*')
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: true })
    );
  },

  /** Idempotent: upsert on (habit_id, date) so double-tapping cannot create duplicates. */
  async set(habit_id, date, done) {
    return unwrap(
      await supabase
        .from('habit_logs')
        .upsert(
          { user_id: await uid(), habit_id, date, done },
          { onConflict: 'habit_id,date' }
        )
        .select()
    );
  },
};

/* ---------------- mood ---------------- */

export const mood = {
  async range(from, to) {
    return unwrap(
      await supabase
        .from('mood_entries')
        .select('*')
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: false })
    );
  },

  async recent(limit = 30) {
    return unwrap(
      await supabase
        .from('mood_entries')
        .select('*')
        .order('date', { ascending: false })
        .limit(limit)
    );
  },

  async get(date) {
    const rows = unwrap(await supabase.from('mood_entries').select('*').eq('date', date));
    return rows[0] ?? null;
  },

  /** One entry per day — upsert keeps editing today's mood simple. */
  async set(date, score, note) {
    return unwrap(
      await supabase
        .from('mood_entries')
        .upsert({ user_id: await uid(), date, score, note }, { onConflict: 'user_id,date' })
        .select()
    );
  },

  async remove(id) {
    return unwrap(await supabase.from('mood_entries').delete().eq('id', id));
  },
};

/* ---------------- workouts ---------------- */

export const workouts = {
  /** Sets come back nested under each workout via the FK relationship. */
  async recent(limit = 40) {
    return unwrap(
      await supabase
        .from('workouts')
        .select('*, workout_sets(*)')
        .order('date', { ascending: false })
        .limit(limit)
    );
  },

  async range(from, to) {
    return unwrap(
      await supabase.from('workouts').select('*').gte('date', from).lte('date', to)
    );
  },

  async create({ date, type, duration_min, notes }) {
    const rows = unwrap(
      await supabase
        .from('workouts')
        .insert({ user_id: await uid(), date, type, duration_min, notes })
        .select()
    );
    return rows[0];
  },

  async update(id, patch) {
    return unwrap(await supabase.from('workouts').update(patch).eq('id', id).select());
  },

  async remove(id) {
    return unwrap(await supabase.from('workouts').delete().eq('id', id));
  },

  async addSet(workout_id, { exercise, sets, reps, weight_kg }) {
    return unwrap(
      await supabase
        .from('workout_sets')
        .insert({ user_id: await uid(), workout_id, exercise, sets, reps, weight_kg })
        .select()
    );
  },

  async removeSet(id) {
    return unwrap(await supabase.from('workout_sets').delete().eq('id', id));
  },
};

/* ---------------- expenses ---------------- */

export const expenses = {
  async range(from, to) {
    return unwrap(
      await supabase
        .from('expenses')
        .select('*')
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: false })
    );
  },

  async create({ date, amount, kind, category, note, currency = 'USD' }) {
    const rows = unwrap(
      await supabase
        .from('expenses')
        .insert({ user_id: await uid(), date, amount, kind, category, note, currency })
        .select()
    );
    return rows[0];
  },

  async update(id, patch) {
    return unwrap(await supabase.from('expenses').update(patch).eq('id', id).select());
  },

  async remove(id) {
    return unwrap(await supabase.from('expenses').delete().eq('id', id));
  },
};
