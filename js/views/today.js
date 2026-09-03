// Today — the page the app exists for.
//
// Ordered by what you do with it, not by data type: what needs attention, the one
// thing to start, today's list, today's schedule, habits. Statistics are limited to a
// single progress line, because a wall of numbers is something to read rather than
// something to act on.

import { habits, habitLogs, tasks, events, settings } from '../db.js';
import { rank, nextAction, reasons, bucketOf, PRIORITY } from '../rank.js';
import { taskForm } from './tasks.js';
import { el, clear, toast, loading, todayISO } from '../ui.js';

let container = null;
let state = null;

export async function render(root) {
  container = root;
  await load();
}

export function destroy() {
  container = null;
}

/* ---------------- deferred suggestions ----------------
 * "Not now" hides a task from the recommendation for the rest of today only, and
 * never from the list below. Deferring must not be a way to make something vanish.
 */

const SKIP_KEY = 'skipped-today';

function readSkipped(today) {
  try {
    const raw = JSON.parse(localStorage.getItem(SKIP_KEY) ?? '{}');
    return raw.date === today && Array.isArray(raw.ids) ? raw.ids : [];
  } catch {
    return [];
  }
}

function skip(id, today) {
  try {
    const ids = [...new Set([...readSkipped(today), id])];
    localStorage.setItem(SKIP_KEY, JSON.stringify({ date: today, ids }));
  } catch { /* a deferral is not worth a crash */ }
}

/* ---------------- load ---------------- */

async function load() {
  if (!container) return;
  clear(container).append(loading());

  const today = todayISO();

  try {
    const [me, habitList, logs, taskList, todayEvents] = await Promise.all([
      settings.get(),
      habits.list(),
      habitLogs.range(today, today),
      tasks.list(),
      events.range(today, today),
    ]);

    if (!container) return;
    state = { today, me, habitList, logs, taskList, todayEvents };
    draw();
  } catch (err) {
    if (!container) return;
    clear(container).append(
      el('div.card', {}, [
        el('h2', { text: 'Could not load Today' }),
        el('p.muted', { text: err.message, style: 'margin:8px 0 0' }),
        el('button.btn', { text: 'Retry', style: 'margin-top:12px', onclick: load }),
      ])
    );
  }
}

/* ---------------- draw ---------------- */

function draw() {
  const { today, me, habitList, logs, taskList, todayEvents } = state;
  clear(container);

  const open = taskList.filter((t) => !t.done);
  const overdue = open.filter((t) => bucketOf(t, today) === 'overdue');
  const dueToday = open.filter((t) => bucketOf(t, today) === 'today');
  const actionable = [...overdue, ...dueToday];

  const completedToday = taskList.filter(
    (t) => t.done && String(t.completed_at ?? '').slice(0, 10) === today
  );

  const doneHabitIds = new Set(logs.filter((l) => l.done).map((l) => l.habit_id));
  const habitsLeft = habitList.filter((h) => !doneHabitIds.has(h.id));

  container.append(greeting(me, today));

  // Attention line, only when it applies, stated plainly. No exclamation marks.
  if (overdue.length) {
    container.append(
      el('div.attention', {}, [
        el('span', {
          text: overdue.length === 1
            ? '1 task needs your attention'
            : `${overdue.length} tasks need your attention`,
        }),
        el('a', { href: '#/tasks', text: 'View' }),
      ])
    );
  }

  container.append(progressLine(actionable, completedToday, habitList, doneHabitIds));

  // The one recommendation.
  const suggestion = nextAction(taskList, today, readSkipped(today));
  if (suggestion) container.append(nextActionCard(suggestion, today));

  // Today's tasks, in the same order the recommendation uses — never reorderable to
  // put comfortable work on top.
  if (actionable.length) {
    container.append(
      el('div.section-title', { text: "Today's tasks" }),
      el('div.card', {}, rank(actionable, today).map((t) => taskRow(t, today)))
    );
  } else if (!suggestion && taskList.length) {
    container.append(
      el('div.card', {}, [el('p', { text: '✓ Nothing due today.', style: 'margin:0' })])
    );
  }

  // Schedule. University classes join this in phase 4.
  if (todayEvents.length) {
    container.append(
      el('div.section-title', { text: "Today's schedule" }),
      el('div.card', {}, todayEvents.map(eventRow))
    );
  }

  if (habitList.length) {
    container.append(
      el('div.section-title', { text: 'Habits' }),
      el('div.card', {}, habitsLeft.length
        ? habitsLeft.map((h) => habitRow(h, today))
        : [el('p', { text: '✓ All habits done today.', style: 'margin:0' })])
    );
  }

  if (!taskList.length && !habitList.length && !todayEvents.length) {
    container.append(welcome());
  }
}

function greeting(me, today) {
  const h = new Date().getHours();
  const part =
    h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const name = me?.display_name?.trim();

  return el('div.greeting', {}, [
    el('h2.greeting-title', { text: name ? `${part}, ${name}` : part, dir: 'auto' }),
    el('div.greeting-date', { text: longDate(today) }),
  ]);
}

function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** One line and one bar. Deliberately not a chart. */
function progressLine(actionable, completedToday, habitList, doneHabitIds) {
  const habitsDone = habitList.filter((h) => doneHabitIds.has(h.id)).length;

  const units = actionable.length + completedToday.length + habitList.length;
  const done = completedToday.length + habitsDone;
  const pct = units ? Math.round((done / units) * 100) : 0;

  const parts = [`${actionable.length} remaining`];
  if (completedToday.length) parts.push(`${completedToday.length} done`);
  if (habitList.length) parts.push(`${habitsDone}/${habitList.length} habits`);

  return el('div.card', {}, [
    el('div.today-progress-head', {}, [
      el('span.stat-label', { text: 'Today' }),
      el('span.today-pct', { text: `${pct}%` }),
    ]),
    el('div.bar', {}, [el('div.bar-fill', { style: `width:${pct}%` })]),
    el('div.row-sub', { text: parts.join(' · '), style: 'margin-top:8px' }),
  ]);
}

/**
 * The recommendation. It always shows why it was chosen — that is what makes it
 * trustworthy rather than magic — and "Not now" exists so it cannot become a nag.
 *
 * [Start] arrives with time tracking in phase 6; a button that only apologised for
 * not working yet would be worse than its absence.
 */
function nextActionCard(task, today) {
  const chips = reasons(task, today);

  return el('div.card.next-action', {}, [
    el('div.stat-label', { text: 'Next action' }),
    el('div.next-title', { text: task.title, dir: 'auto' }),
    chips.length && el('div.next-why', {}, chips.map((c) =>
      el(`span.pill${c.includes('overdue') ? '.pill-bad' : ''}`, { text: c })
    )),
    el('div.next-actions', {}, [
      el('button.btn.btn-primary', {
        text: 'Done',
        onclick: async () => {
          try {
            await tasks.setDone(task.id, true);
            toast('Done');
            await load();
          } catch (err) {
            toast(err.message, 'bad');
          }
        },
      }),
      el('button.btn', { text: 'Edit', onclick: () => taskForm(task, {}, load) }),
      el('button.btn', {
        text: 'Not now',
        onclick: () => { skip(task.id, today); draw(); },
      }),
    ]),
  ]);
}

function taskRow(t, today) {
  const late = t.due_date && t.due_date < today;

  const check = el('button.check', {
    type: 'button',
    text: '✓',
    'aria-label': `Mark ${t.title}`,
    onclick: async () => {
      check.classList.add('is-done');
      try {
        await tasks.setDone(t.id, true);
        await load();
      } catch (err) {
        check.classList.remove('is-done');
        toast(err.message, 'bad');
      }
    },
  });

  const meta = [];
  if (t.priority === PRIORITY.HIGH) meta.push('High');
  if (late) meta.push('Overdue');
  else if (t.due_time) meta.push(t.due_time.slice(0, 5));
  if (t.estimate_min) {
    meta.push(t.estimate_min < 60 ? `${t.estimate_min}m` : `${Math.round(t.estimate_min / 60)}h`);
  }

  return el(`div.row${late ? '.is-overdue' : ''}`, {}, [
    check,
    el('div.row-main', {}, [
      el('div.row-title', { text: t.title, dir: 'auto' }),
      meta.length && el('div.row-sub', {
        text: meta.join(' · '),
        style: late ? 'color:var(--bad)' : '',
      }),
    ]),
  ]);
}

function eventRow(e) {
  return el('div.row', {}, [
    el('span.cal-time', { text: e.time ? e.time.slice(0, 5) : 'All day' }),
    el('div.row-main', {}, [
      el('div.row-title', { text: e.title, dir: 'auto' }),
      e.note && el('div.row-sub', { text: e.note, dir: 'auto' }),
    ]),
  ]);
}

function habitRow(h, today) {
  const check = el('button.check', {
    type: 'button',
    text: '✓',
    'aria-label': `Mark ${h.name}`,
    onclick: async () => {
      check.classList.add('is-done');
      try {
        await habitLogs.set(h.id, today, true);
        await load();
      } catch (err) {
        check.classList.remove('is-done');
        toast(err.message, 'bad');
      }
    },
  });

  return el('div.row', {}, [
    check,
    el('div.row-main', {}, [el('div.row-title', { text: `${h.icon} ${h.name}`, dir: 'auto' })]),
  ]);
}

function welcome() {
  return el('div.card', {}, [
    el('h2', { text: 'Welcome 👋' }),
    el('p.muted', {
      style: 'margin:9px 0 14px;font-size:13.5px',
      text: 'Nothing here yet. Add a task and this page will tell you what to start with.',
    }),
    el('button.btn.btn-primary', { text: '+ Add a task', onclick: () => taskForm(null, {}, load) }),
  ]);
}
