// Today at a glance, pulled from all four trackers.

import { habits, habitLogs, mood, workouts, expenses } from '../db.js';
import { FACES, LABELS } from './mood.js';
import {
  el, clear, toast, loading,
  todayISO, addDays, dateRange, prettyDate, money,
} from '../ui.js';

const WINDOW = 30; // days of history behind the sparklines

let container = null;

export async function render(root) {
  container = root;
  await load();
}

export function destroy() {
  container = null;
}

async function load() {
  clear(container).append(loading());

  const today = todayISO();
  const from = addDays(today, -(WINDOW - 1));

  try {
    const [habitList, logs, moods, sessions, spend] = await Promise.all([
      habits.list(),
      habitLogs.range(from, today),
      mood.range(from, today),
      workouts.range(from, today),
      expenses.range(today.slice(0, 8) + '01', today),
    ]);

    // Guard against a view swap while the requests were in flight.
    if (!container) return;
    draw({ today, from, habitList, logs, moods, sessions, spend });
  } catch (err) {
    if (!container) return;
    clear(container).append(
      el('div.card', {}, [
        el('h2', { text: 'Could not load your dashboard' }),
        el('p.muted', { text: err.message, style: 'margin:8px 0 0' }),
        el('button.btn', { text: 'Retry', style: 'margin-top:12px', onclick: load }),
      ])
    );
  }
}

function draw({ today, from, habitList, logs, moods, sessions, spend }) {
  clear(container);

  const doneKeys = new Set(logs.filter((l) => l.done).map((l) => `${l.habit_id}|${l.date}`));
  const doneToday = habitList.filter((h) => doneKeys.has(`${h.id}|${today}`)).length;
  const moodToday = moods.find((m) => m.date === today) ?? null;
  const workedOutToday = sessions.some((w) => w.date === today);

  const spent = spend
    .filter((r) => r.kind === 'expense')
    .reduce((t, r) => t + Number(r.amount), 0);
  const income = spend
    .filter((r) => r.kind === 'income')
    .reduce((t, r) => t + Number(r.amount), 0);
  const currency = spend[0]?.currency ?? 'USD';

  container.append(
    el('p.muted', {
      text: greeting() + ' · ' + prettyDate(today),
      style: 'margin:0 0 14px;font-size:13.5px',
    }),

    el('div.stat-grid', {}, [
      stat('Habits', habitList.length ? `${doneToday}/${habitList.length}` : '—',
        habitList.length ? (doneToday === habitList.length ? 'All done' : 'done today') : 'none yet'),
      stat('Mood', moodToday ? FACES[moodToday.score] : '—',
        moodToday ? LABELS[moodToday.score] : 'not logged'),
      stat('Fitness', workedOutToday ? '✓' : '—',
        workedOutToday ? 'trained today' : 'rest day'),
      stat('This month', money(income - spent, currency), 'net'),
    ])
  );

  // Habits still open today
  if (habitList.length) {
    const remaining = habitList.filter((h) => !doneKeys.has(`${h.id}|${today}`));
    container.append(
      el('div.section-title', { text: 'Habits' }),
      el('div.card', {}, remaining.length
        ? remaining.map((h) => habitRow(h, today, doneKeys))
        : [el('p', { text: '✓ Everything done today. Nice.', style: 'margin:0' })])
    );
  }

  // 30-day habit completion trend
  if (habitList.length) {
    const days = dateRange(from, today);
    const values = days.map(
      (d) => habitList.filter((h) => doneKeys.has(`${h.id}|${d}`)).length / habitList.length
    );
    container.append(
      el('div.section-title', { text: `Last ${WINDOW} days` }),
      el('div.card', {}, [
        el('div.spark', {}, values.map((v) =>
          el(`div.spark-bar${v === 0 ? '.is-empty' : ''}`, {
            style: `height:${Math.max(4, v * 100)}%`,
            title: `${Math.round(v * 100)}%`,
          })
        )),
        el('div.row-sub', {
          text: `${Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100)}% average completion`,
          style: 'margin-top:9px',
        }),
      ])
    );
  }

  if (!habitList.length && !moods.length && !sessions.length && !spend.length) {
    container.append(
      el('div.card', {}, [
        el('h2', { text: 'Welcome 👋' }),
        el('p.muted', {
          style: 'margin:9px 0 14px;font-size:13.5px',
          text: 'Nothing logged yet. Start with a habit — the other tabs work the same way.',
        }),
        el('a.btn.btn-primary', { href: '#/habits', text: 'Add your first habit' }),
      ])
    );
  }
}

function stat(label, value, sub) {
  return el('div.stat', {}, [
    el('div.stat-label', { text: label }),
    el('div.stat-value', { text: value }),
    el('div.stat-sub', { text: sub }),
  ]);
}

function habitRow(h, today, doneKeys) {
  const check = el('button.check', {
    type: 'button',
    text: '✓',
    'aria-label': `Mark ${h.name}`,
    onclick: async () => {
      check.classList.add('is-done');
      try {
        await habitLogs.set(h.id, today, true);
        doneKeys.add(`${h.id}|${today}`);
        await load();
      } catch (err) {
        check.classList.remove('is-done');
        toast(err.message, 'bad');
      }
    },
  });

  return el('div.row', {}, [
    check,
    el('div.row-main', {}, [el('div.row-title', { text: `${h.icon} ${h.name}` })]),
  ]);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
