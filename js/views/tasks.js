// Task list grouped by deadline: overdue, today, upcoming, someday, done.

import { tasks } from '../db.js';
import {
  el, clear, toast, openModal, confirmDelete, emptyState, loading,
  todayISO, addDays, prettyDate,
} from '../ui.js';

let container = null;
let all = [];
let showDone = false;

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
    all = await tasks.list();
    if (!container) return;
    draw();
  } catch (err) {
    if (!container) return;
    clear(container).append(
      el('div.card', {}, [
        el('h2', { text: 'Could not load tasks' }),
        el('p.muted', { text: err.message, style: 'margin:8px 0 0' }),
      ])
    );
  }
}

/** Which bucket a task belongs to. Order here is the order they render in. */
function bucketOf(t, today) {
  if (t.done) return 'done';
  if (!t.due_date) return 'someday';
  if (t.due_date < today) return 'overdue';
  if (t.due_date === today) return 'today';
  return 'upcoming';
}

function draw() {
  clear(container);

  const today = todayISO();
  const buckets = { overdue: [], today: [], upcoming: [], someday: [], done: [] };
  for (const t of all) buckets[bucketOf(t, today)].push(t);

  const open = all.filter((t) => !t.done);

  container.append(
    el('div.stat-grid', {}, [
      el('div.stat', {}, [
        el('div.stat-label', { text: 'Open' }),
        el('div.stat-value', { text: String(open.length) }),
        el('div.stat-sub', { text: open.length === 1 ? 'task' : 'tasks' }),
      ]),
      el('div.stat', {}, [
        el('div.stat-label', { text: 'Overdue' }),
        el('div.stat-value', {
          text: String(buckets.overdue.length),
          style: buckets.overdue.length ? 'color:var(--bad)' : '',
        }),
        el('div.stat-sub', { text: buckets.overdue.length ? 'needs attention' : 'all clear' }),
      ]),
    ])
  );

  if (!all.length) {
    container.append(
      emptyState('☑', 'No tasks yet. Add something you need to get done.', 'Add a task', () =>
        taskForm()
      ),
      addButton()
    );
    return;
  }

  const sections = [
    ['Overdue', buckets.overdue],
    ['Today', buckets.today],
    ['Upcoming', buckets.upcoming],
    ['Someday', buckets.someday],
  ];

  for (const [label, list] of sections) {
    if (!list.length) continue;
    container.append(
      el('div.section-title', { text: label }),
      el('div.card', {}, list.map((t) => taskRow(t, today)))
    );
  }

  if (!open.length) {
    container.append(
      el('div.card', {}, [el('p', { text: '✓ Nothing open. All caught up.', style: 'margin:0' })])
    );
  }

  if (buckets.done.length) {
    container.append(
      el('div.section-title', {}, [
        el('button.btn.btn-sm', {
          text: `${showDone ? 'Hide' : 'Show'} completed (${buckets.done.length})`,
          onclick: () => { showDone = !showDone; draw(); },
        }),
      ]),
      showDone && el('div.card', {}, buckets.done.map((t) => taskRow(t, today)))
    );
  }

  container.append(addButton());
}

function addButton() {
  return el('button.btn.btn-primary.btn-block', {
    text: '+ Add task',
    onclick: () => taskForm(),
  });
}

function taskRow(t, today) {
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

  const overdue = !t.done && t.due_date && t.due_date < today;

  return el('div.row', {}, [
    check,
    el('div.row-main', {}, [
      el('div.row-title', {
        text: t.title,
        style: t.done ? 'text-decoration:line-through;color:var(--text-dim)' : '',
      }),
      el('div.row-sub', {
        text: deadlineLabel(t, today),
        style: overdue ? 'color:var(--bad)' : '',
      }),
    ]),
    el('div.row-actions', {}, [
      el('button.icon-btn', { text: '⋯', title: 'Edit', onclick: () => taskForm(t) }),
    ]),
  ]);
}

function deadlineLabel(t, today) {
  if (!t.due_date) return t.notes || 'No deadline';
  const days = daysBetween(today, t.due_date);
  let when;
  if (days === 0) when = 'Due today';
  else if (days === 1) when = 'Due tomorrow';
  else if (days === -1) when = 'Due yesterday';
  else if (days < 0) when = `${Math.abs(days)} days overdue`;
  else when = `Due ${prettyDate(t.due_date)}`;
  return t.notes ? `${when} · ${t.notes}` : when;
}

/** Whole days from `a` to `b`, both YYYY-MM-DD. */
function daysBetween(a, b) {
  let n = 0;
  if (a === b) return 0;
  if (a < b) { while (a < b && n < 3650) { a = addDays(a, 1); n++; } return n; }
  while (a > b && n < 3650) { a = addDays(a, -1); n++; }
  return -n;
}

export function taskForm(existing = null, presetDate = null, onSaved = null) {
  const notes = el('textarea', { name: 'notes', maxlength: '1000', placeholder: 'Optional' });
  notes.value = existing?.notes ?? '';

  const body = el('div', {}, [
    el('label.field', {}, [
      el('span', { text: 'Task' }),
      el('input', {
        name: 'title',
        required: true,
        maxlength: '200',
        placeholder: 'Finish the report',
        value: existing?.title ?? '',
      }),
    ]),
    el('label.field', {}, [
      el('span', { text: 'Deadline (leave empty for someday)' }),
      el('input', {
        name: 'due_date',
        type: 'date',
        value: existing?.due_date ?? presetDate ?? todayISO(),
      }),
    ]),
    el('label.field', {}, [el('span', { text: 'Notes' }), notes]),
  ]);

  openModal({
    title: existing ? 'Edit task' : 'New task',
    body,
    submitLabel: existing ? 'Save' : 'Add task',
    extraAction:
      existing &&
      el('button.btn.btn-danger.btn-block', {
        type: 'button',
        text: 'Delete task',
        style: 'margin-top:9px',
        onclick: (e) => {
          e.currentTarget.closest('.modal-backdrop').remove();
          confirmDelete('this task', async () => {
            await tasks.remove(existing.id);
            toast('Task deleted');
            await (onSaved ?? load)();
          });
        },
      }),
    onSubmit: async (v) => {
      const title = v.title.trim();
      if (!title) throw new Error('Give the task a title');

      const payload = {
        title,
        due_date: v.due_date || null,
        notes: notes.value.trim() || null,
      };

      if (existing) await tasks.update(existing.id, payload);
      else await tasks.create(payload);

      toast(existing ? 'Task updated' : 'Task added');
      await (onSaved ?? load)();
    },
  });
}
