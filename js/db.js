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

/* ---------------- settings ---------------- */

/**
 * Defaults for a brand-new row. These are personal facts rather than schema defaults:
 * a migration run in the SQL editor has no auth.uid() to attach a row to, so the row
 * is created here on first read instead.
 */
const SETTINGS_DEFAULTS = {
  display_name: 'Mohammad',
  currency: 'JOD',
  week_start: 0, // Sunday, matching PSUT's week
  prior_gpa: 64.6,
  prior_credits: 27,
  target_gpa: null,
};

export const settings = {
  /** Reads the user's settings, creating the row with defaults the first time. */
  async get() {
    const rows = unwrap(await supabase.from('settings').select('*').limit(1));
    if (rows.length) return rows[0];

    const created = unwrap(
      await supabase
        .from('settings')
        .insert({ user_id: await uid(), ...SETTINGS_DEFAULTS })
        .select()
    );
    return created[0];
  },

  async update(patch) {
    const rows = unwrap(
      await supabase
        .from('settings')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('user_id', await uid())
        .select()
    );
    return rows[0];
  },
};

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

/* ---------------- tasks ---------------- */

/**
 * A link decides the category, never the other way round. Keeping this in one place is
 * what stops the app and the database disagreeing about whether something is
 * university work.
 */
export function categoryFor({ category = 'personal', course_id = null, project_id = null }) {
  if (course_id) return 'university';
  if (project_id) return 'project';
  return category === 'university' || category === 'project' ? 'personal' : category;
}

export const tasks = {
  /** Everything not yet done, plus anything completed recently enough to still be visible. */
  async list() {
    return unwrap(
      await supabase
        .from('tasks')
        .select('*')
        // Undated tasks sort last; nullsFirst:false keeps "someday" below real deadlines.
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
    );
  },

  /** Tasks with a deadline inside [from, to] — what the calendar draws dots from. */
  async range(from, to) {
    return unwrap(
      await supabase
        .from('tasks')
        .select('*')
        .gte('due_date', from)
        .lte('due_date', to)
        .order('due_date', { ascending: true })
    );
  },

  /**
   * `category` must agree with course_id / project_id or the database rejects the row —
   * see the tasks_category_matches_link constraint. Callers pass the link and let
   * categoryFor() derive the category rather than setting both by hand.
   */
  async create({
    title,
    due_date = null,
    due_time = null,
    priority = 2,
    category = 'personal',
    kind = 'task',
    course_id = null,
    project_id = null,
    estimate_min = null,
    notes = null,
  }) {
    const rows = unwrap(
      await supabase
        .from('tasks')
        .insert({
          user_id: await uid(),
          title, due_date, due_time, priority, kind,
          category: categoryFor({ category, course_id, project_id }),
          course_id, project_id, estimate_min, notes,
        })
        .select()
    );
    return rows[0];
  },

  /** Open work for one project or course, newest deadline first. */
  async byLink({ project_id = null, course_id = null } = {}) {
    let q = supabase.from('tasks').select('*').order('due_date', { ascending: true, nullsFirst: false });
    if (project_id) q = q.eq('project_id', project_id);
    if (course_id) q = q.eq('course_id', course_id);
    return unwrap(await q);
  },

  async get(id) {
    const rows = unwrap(await supabase.from('tasks').select('*').eq('id', id));
    return rows[0] ?? null;
  },

  /**
   * Normalises category against the links before writing.
   *
   * The database rejects a row whose category disagrees with course_id / project_id, so
   * a patch touching any one of the three has to be resolved against the row's current
   * state — otherwise editing a project task's title through a form whose category
   * selector only offers personal/other would be rejected, or worse, silently strip it
   * out of its project.
   */
  async update(id, patch) {
    const p = { ...patch };

    if ('project_id' in p || 'course_id' in p || 'category' in p) {
      const current = await this.get(id);
      if (!current) throw new Error('That task no longer exists');

      const project_id = 'project_id' in p ? p.project_id : current.project_id;
      const course_id = 'course_id' in p ? p.course_id : current.course_id;

      p.project_id = project_id;
      p.course_id = course_id;
      p.category = categoryFor({
        category: p.category ?? current.category,
        course_id,
        project_id,
      });
    }

    return unwrap(await supabase.from('tasks').update(p).eq('id', id).select());
  },

  /** completed_at is stamped alongside `done` so "finished today" stays answerable. */
  async setDone(id, done) {
    return unwrap(
      await supabase
        .from('tasks')
        .update({ done, completed_at: done ? new Date().toISOString() : null })
        .eq('id', id)
        .select()
    );
  },

  async remove(id) {
    return unwrap(await supabase.from('tasks').delete().eq('id', id));
  },
};

/* ---------------- projects ---------------- */

export const projects = {
  async list({ includeArchived = false } = {}) {
    let q = supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (!includeArchived) q = q.eq('archived', false);
    return unwrap(await q);
  },

  async get(id) {
    const rows = unwrap(await supabase.from('projects').select('*').eq('id', id));
    return rows[0] ?? null;
  },

  async create({ name, description = null, status = 'active', deadline = null }) {
    const rows = unwrap(
      await supabase
        .from('projects')
        .insert({ user_id: await uid(), name, description, status, deadline })
        .select()
    );
    return rows[0];
  },

  async update(id, patch) {
    return unwrap(await supabase.from('projects').update(patch).eq('id', id).select());
  },

  /** Cascades to the project's tasks — the UI warns, and offers archive instead. */
  async remove(id) {
    return unwrap(await supabase.from('projects').delete().eq('id', id));
  },

  /**
   * Task counts for every project in one query, rather than one query per project.
   * Returns a Map of project_id -> { total, done }.
   */
  async taskCounts() {
    const rows = unwrap(
      await supabase.from('tasks').select('project_id, done').not('project_id', 'is', null)
    );

    const counts = new Map();
    for (const r of rows) {
      const c = counts.get(r.project_id) ?? { total: 0, done: 0 };
      c.total++;
      if (r.done) c.done++;
      counts.set(r.project_id, c);
    }
    return counts;
  },
};

/* ---------------- events (appointments) ---------------- */

export const events = {
  async range(from, to) {
    return unwrap(
      await supabase
        .from('events')
        .select('*')
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: true })
        .order('time', { ascending: true, nullsFirst: true })
    );
  },

  async create({ title, date, time = null, note = null }) {
    const rows = unwrap(
      await supabase
        .from('events')
        .insert({ user_id: await uid(), title, date, time, note })
        .select()
    );
    return rows[0];
  },

  async update(id, patch) {
    return unwrap(await supabase.from('events').update(patch).eq('id', id).select());
  },

  async remove(id) {
    return unwrap(await supabase.from('events').delete().eq('id', id));
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

  /**
   * Every entry ever, trimmed to the three columns the balance needs. Personal-scale
   * data, so summing client-side is cheaper than adding a database view for it.
   */
  async allTime() {
    return unwrap(await supabase.from('expenses').select('amount, kind, currency'));
  },

  async create({ date, amount, kind, category, note, currency = 'JOD' }) {
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
