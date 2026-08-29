// Daily habit checklist with streaks.

import { habits, habitLogs } from '../db.js';
import {
  el, clear, toast, openModal, confirmDelete, emptyState, loading,
  todayISO, addDays, prettyDate,
} from '../ui.js';

const ICONS = ['✦', '💧', '📚', '🏃', '🧘', '💊', '🌙', '☀️', '🎯', '✍️', '🥗', '🚭'];
const STREAK_WINDOW = 90; // days of history to pull for streak maths

let container = null;
let state = { date: todayISO(), habits: [], logs: new Map() };

export async function render(root) {
  container = root;
  await load();
}

export function destroy() {
  container = null;
}

async function load() {
  clear(container).append(loading());
  try {
    const [list, logs] = await Promise.all([
      habits.list(),
      habitLogs.range(addDays(todayISO(), -STREAK_WINDOW), todayISO()),
    ]);
    state.habits = list;
    // key: `${habit_id}|${date}` -> done
    state.logs = new Map(logs.map((l) => [`${l.habit_id}|${l.date}`, l.done]));
    draw();
  } catch (err) {
    clear(container).append(
      el('div.card', {}, [
        el('h2', { text: 'Could not load habits' }),
        el('p.muted', { text: err.message, style: 'margin:8px 0 0' }),
      ])
    );
  }
}

function isDone(habitId, date) {
  return state.logs.get(`${habitId}|${date}`) === true;
}

/** Consecutive done-days ending at `date` (today counts only if already ticked). */
function streak(habitId, date) {
  let n = 0;
  let cur = date;
  while (n < STREAK_WINDOW && isDone(habitId, cur)) {
    n++;
    cur = addDays(cur, -1);
  }
  return n;
}

function draw() {
  clear(container);

  if (!state.habits.length) {
    container.append(
      emptyState('✓', 'No habits yet. Add the first one you want to keep.', 'Add a habit', () =>
        habitForm()
      )
    );
    return;
  }

  const doneToday = state.habits.filter((h) => isDone(h.id, state.date)).length;

  container.append(
    el('div.card', {}, [
      el('div.card-head', {}, [
        el('h2', { text: prettyDate(state.date) }),
        el('span.pill' + (doneToday === state.habits.length ? '.pill-good' : ''), {
          text: `${doneToday} / ${state.habits.length}`,
        }),
      ]),
      el('div', {}, state.habits.map(habitRow)),
    ]),
    el('button.btn.btn-block', { text: '+ Add habit', onclick: () => habitForm() })
  );
}

function habitRow(h) {
  const done = isDone(h.id, state.date);
  const s = streak(h.id, state.date);

  const check = el(`button.check${done ? '.is-done' : ''}`, {
    type: 'button',
    text: '✓',
    'aria-label': `Mark ${h.name}`,
    onclick: () => toggle(h, check),
  });

  return el('div.row', {}, [
    check,
    el('div.row-main', {}, [
      el('div.row-title', { text: `${h.icon} ${h.name}` }),
      el('div.row-sub', {
        text: s > 0 ? `${s} day streak` : 'No streak yet — start today',
      }),
    ]),
    el('div.row-actions', {}, [
      el('button.icon-btn', { text: '⋯', title: 'Edit', onclick: () => habitForm(h) }),
    ]),
  ]);
}

async function toggle(h, checkEl) {
  const key = `${h.id}|${state.date}`;
  const next = !isDone(h.id, state.date);

  // Optimistic: flip immediately, roll back if the write fails.
  state.logs.set(key, next);
  checkEl.classList.toggle('is-done', next);

  try {
    await habitLogs.set(h.id, state.date, next);
    draw();
  } catch (err) {
    state.logs.set(key, !next);
    checkEl.classList.toggle('is-done', !next);
    toast(err.message, 'bad');
  }
}

function habitForm(existing = null) {
  let icon = existing?.icon ?? ICONS[0];

  const iconPicker = el(
    'div',
    { style: 'display:flex;flex-wrap:wrap;gap:6px' },
    ICONS.map((i) =>
      el('button.btn.btn-sm', {
        type: 'button',
        text: i,
        style: i === icon ? 'border-color:var(--accent)' : '',
        onclick: (e) => {
          icon = i;
          [...iconPicker.children].forEach((c) => (c.style.borderColor = ''));
          e.currentTarget.style.borderColor = 'var(--accent)';
        },
      })
    )
  );

  const body = el('div', {}, [
    el('label.field', {}, [
      el('span', { text: 'Habit name' }),
      el('input', {
        name: 'name',
        required: true,
        maxlength: '80',
        placeholder: 'Drink 2L of water',
        value: existing?.name ?? '',
      }),
    ]),
    el('label.field', {}, [el('span', { text: 'Icon' }), iconPicker]),
  ]);

  openModal({
    title: existing ? 'Edit habit' : 'New habit',
    body,
    submitLabel: existing ? 'Save' : 'Add habit',
    extraAction:
      existing &&
      el('button.btn.btn-danger.btn-block', {
        type: 'button',
        text: 'Delete habit',
        style: 'margin-top:9px',
        onclick: (e) => {
          e.currentTarget.closest('.modal-backdrop').remove();
          confirmDelete('this habit', async () => {
            await habits.remove(existing.id);
            toast('Habit deleted');
            await load();
          });
        },
      }),
    onSubmit: async ({ name }) => {
      const clean = name.trim();
      if (!clean) throw new Error('Give the habit a name');
      if (existing) await habits.update(existing.id, { name: clean, icon });
      else await habits.create({ name: clean, icon });
      toast(existing ? 'Habit updated' : 'Habit added');
      await load();
    },
  });
}
