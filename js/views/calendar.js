// Month grid showing task deadlines and appointments, with a detail panel for the
// selected day. Appointments are created here.

import { tasks, events } from '../db.js';
import { taskForm } from './tasks.js';
import {
  el, clear, toast, openModal, confirmDelete, loading,
  todayISO, addDays, prettyDate,
} from '../ui.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let container = null;
let month = todayISO().slice(0, 7); // YYYY-MM
let selected = todayISO();
let monthTasks = [];
let monthEvents = [];

export async function render(root) {
  container = root;
  await load();
}

export function destroy() {
  container = null;
}

/* ---------------- month maths ---------------- */

function firstOfMonth(ym) {
  return `${ym}-01`;
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * The 42 dates drawn in the grid: six weeks starting on the Sunday on or before
 * the 1st, so every month renders at the same height and no row jumps.
 */
function gridDates(ym) {
  const [y, m] = ym.split('-').map(Number);
  const weekdayOfFirst = new Date(y, m - 1, 1).getDay(); // 0 = Sunday
  const start = addDays(firstOfMonth(ym), -weekdayOfFirst);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

async function load() {
  clear(container).append(loading());
  const dates = gridDates(month);

  try {
    const [t, e] = await Promise.all([
      tasks.range(dates[0], dates[41]),
      events.range(dates[0], dates[41]),
    ]);
    monthTasks = t;
    monthEvents = e;
    if (!container) return;
    draw();
  } catch (err) {
    if (!container) return;
    clear(container).append(
      el('div.card', {}, [
        el('h2', { text: 'Could not load the calendar' }),
        el('p.muted', { text: err.message, style: 'margin:8px 0 0' }),
        el('button.btn', { text: 'Retry', style: 'margin-top:12px', onclick: load }),
      ])
    );
  }
}

function draw() {
  clear(container);

  const today = todayISO();
  const [y, m] = month.split('-').map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const grid = el('div.cal-grid', {},
    WEEKDAYS.map((w) => el('div.cal-weekday', { text: w }))
      .concat(gridDates(month).map((d) => dayCell(d, today)))
  );

  container.append(
    el('div.card', {}, [
      el('div.card-head', {}, [
        el('button.icon-btn', {
          text: '‹',
          'aria-label': 'Previous month',
          onclick: () => { month = shiftMonth(month, -1); load(); },
        }),
        el('h2', { text: label }),
        el('button.icon-btn', {
          text: '›',
          'aria-label': 'Next month',
          onclick: () => { month = shiftMonth(month, 1); load(); },
        }),
      ]),
      grid,
      el('div.cal-legend', {}, [
        legend('var(--accent)', 'Task due'),
        legend('var(--bad)', 'Overdue'),
        legend('var(--warn)', 'Appointment'),
      ]),
    ]),
    dayPanel(today)
  );
}

function legend(color, text) {
  return el('span.cal-legend-item', {}, [
    el('span.cal-dot', { style: `background:${color}` }),
    el('span', { text }),
  ]);
}

function dayCell(date, today) {
  const inMonth = date.slice(0, 7) === month;
  const dayTasks = monthTasks.filter((t) => t.due_date === date);
  const dayEvents = monthEvents.filter((e) => e.date === date);

  const dots = [];
  if (dayTasks.some((t) => !t.done && date < today)) dots.push('var(--bad)');
  else if (dayTasks.some((t) => !t.done)) dots.push('var(--accent)');
  else if (dayTasks.length) dots.push('var(--border)');
  if (dayEvents.length) dots.push('var(--warn)');

  const classes = [
    'button.cal-day',
    inMonth ? '' : '.is-outside',
    date === today ? '.is-today' : '',
    date === selected ? '.is-selected' : '',
  ].join('');

  return el(classes, {
    type: 'button',
    'aria-label': prettyDate(date),
    onclick: () => { selected = date; draw(); },
  }, [
    el('span.cal-daynum', { text: String(Number(date.slice(8, 10))) }),
    el('span.cal-dots', {}, dots.map((c) => el('span.cal-dot', { style: `background:${c}` }))),
  ]);
}

function dayPanel(today) {
  const dayTasks = monthTasks.filter((t) => t.due_date === selected);
  const dayEvents = monthEvents.filter((e) => e.date === selected);

  const rows = [];

  for (const e of dayEvents) {
    rows.push(
      el('div.row', {}, [
        el('span.cal-time', { text: e.time ? e.time.slice(0, 5) : 'All day' }),
        el('div.row-main', {}, [
          el('div.row-title', { text: e.title }),
          e.note && el('div.row-sub', { text: e.note }),
        ]),
        el('div.row-actions', {}, [
          el('button.icon-btn', { text: '⋯', title: 'Edit', onclick: () => eventForm(e) }),
        ]),
      ])
    );
  }

  for (const t of dayTasks) {
    const check = el(`button.check${t.done ? '.is-done' : ''}`, {
      type: 'button',
      text: '✓',
      'aria-label': `Mark ${t.title}`,
      onclick: async () => {
        const next = !t.done;
        check.classList.toggle('is-done', next);
        try {
          await tasks.setDone(t.id, next);
          await load();
        } catch (err) {
          check.classList.toggle('is-done', !next);
          toast(err.message, 'bad');
        }
      },
    });

    rows.push(
      el('div.row', {}, [
        check,
        el('div.row-main', {}, [
          el('div.row-title', {
            text: t.title,
            style: t.done ? 'text-decoration:line-through;color:var(--text-dim)' : '',
          }),
          el('div.row-sub', {
            text: !t.done && selected < today ? 'Overdue' : 'Task due',
            style: !t.done && selected < today ? 'color:var(--bad)' : '',
          }),
        ]),
        el('div.row-actions', {}, [
          el('button.icon-btn', {
            text: '⋯',
            title: 'Edit',
            onclick: () => taskForm(t, selected, load),
          }),
        ]),
      ])
    );
  }

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('h2', { text: prettyDate(selected) }),
      selected !== today &&
        el('button.btn.btn-sm', {
          text: 'Today',
          onclick: () => {
            selected = today;
            const t = today.slice(0, 7);
            if (t !== month) { month = t; load(); } else { draw(); }
          },
        }),
    ]),

    rows.length
      ? el('div', {}, rows)
      : el('p.muted', { text: 'Nothing on this day.', style: 'margin:0 0 14px' }),

    el('div.modal-actions', { style: 'margin-top:14px' }, [
      el('button.btn', { text: '+ Task', onclick: () => taskForm(null, selected, load) }),
      el('button.btn.btn-primary', { text: '+ Appointment', onclick: () => eventForm() }),
    ]),
  ]);
}

function eventForm(existing = null) {
  const note = el('textarea', { name: 'note', maxlength: '1000', placeholder: 'Optional' });
  note.value = existing?.note ?? '';

  const body = el('div', {}, [
    el('label.field', {}, [
      el('span', { text: 'Appointment' }),
      el('input', {
        name: 'title',
        required: true,
        maxlength: '200',
        placeholder: 'Dentist',
        value: existing?.title ?? '',
      }),
    ]),
    el('div.field-row', {}, [
      el('label.field', {}, [
        el('span', { text: 'Date' }),
        el('input', {
          name: 'date',
          type: 'date',
          required: true,
          value: existing?.date ?? selected,
        }),
      ]),
      el('label.field', {}, [
        el('span', { text: 'Time (optional)' }),
        el('input', {
          name: 'time',
          type: 'time',
          value: existing?.time ? existing.time.slice(0, 5) : '',
        }),
      ]),
    ]),
    el('label.field', {}, [el('span', { text: 'Note' }), note]),
  ]);

  openModal({
    title: existing ? 'Edit appointment' : 'New appointment',
    body,
    submitLabel: existing ? 'Save' : 'Add',
    extraAction:
      existing &&
      el('button.btn.btn-danger.btn-block', {
        type: 'button',
        text: 'Delete appointment',
        style: 'margin-top:9px',
        onclick: (e) => {
          e.currentTarget.closest('.modal-backdrop').remove();
          confirmDelete('this appointment', async () => {
            await events.remove(existing.id);
            toast('Appointment deleted');
            await load();
          });
        },
      }),
    onSubmit: async (v) => {
      const title = v.title.trim();
      if (!title) throw new Error('Give the appointment a title');

      const payload = {
        title,
        date: v.date,
        time: v.time || null,
        note: note.value.trim() || null,
      };

      if (existing) await events.update(existing.id, payload);
      else await events.create(payload);

      // Follow the appointment if it was moved to another day or month.
      selected = v.date;
      month = v.date.slice(0, 7);
      toast(existing ? 'Appointment updated' : 'Appointment added');
      await load();
    },
  });
}
