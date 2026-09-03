// Tasks: four saved views over one list.
//
// Overdue is deliberately loud, and nothing here offers to sort by "quickest" — the
// failure mode this app exists for is doing easy work to avoid hard work, and a
// shortest-first affordance would serve exactly that.

import { tasks } from '../db.js';
import { rank, bucketOf, PRIORITY } from '../rank.js';
import {
  el, clear, toast, openModal, confirmDelete, emptyState, loading,
  todayISO, prettyDate,
} from '../ui.js';

const VIEWS = [
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'completed', label: 'Done' },
];

const PRIORITY_LABEL = { 1: 'Low', 2: 'Medium', 3: 'High' };
const CATEGORY_LABEL = {
  university: 'University',
  project: 'Project',
  personal: 'Personal',
  other: 'Other',
};

let container = null;
let all = [];
let view = 'today';

export async function render(root) {
  container = root;
  await load();
}

export function destroy() {
  container = null;
}

async function load() {
  if (!container) return;
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
        el('button.btn', { text: 'Retry', style: 'margin-top:12px', onclick: load }),
      ])
    );
  }
}

/**
 * Today shows overdue work too, pinned above today's — an overdue task is not
 * yesterday's problem, and hiding it in another tab is how it stays undone.
 */
function tasksFor(id, today) {
  if (id === 'completed') {
    return all
      .filter((t) => t.done)
      .sort((a, b) => String(b.completed_at ?? '').localeCompare(String(a.completed_at ?? '')));
  }

  const ranked = rank(all, today);
  if (id === 'today') return ranked.filter((t) => ['overdue', 'today'].includes(bucketOf(t, today)));
  if (id === 'overdue') return ranked.filter((t) => bucketOf(t, today) === 'overdue');
  return ranked.filter((t) => ['upcoming', 'someday'].includes(bucketOf(t, today)));
}

function draw() {
  clear(container);
  const today = todayISO();

  const counts = {
    today: tasksFor('today', today).length,
    upcoming: tasksFor('upcoming', today).length,
    overdue: tasksFor('overdue', today).length,
    completed: all.filter((t) => t.done).length,
  };

  container.append(
    el('div.tabs', { role: 'tablist' }, VIEWS.map((v) =>
      el(`button.tab${v.id === view ? '.is-active' : ''}`, {
        role: 'tab',
        onclick: () => { view = v.id; draw(); },
      }, [
        el('span', { text: v.label }),
        counts[v.id] > 0 && el('span.tab-count', {
          text: String(counts[v.id]),
          style: v.id === 'overdue' ? 'color:var(--bad)' : '',
        }),
      ])
    ))
  );

  const list = tasksFor(view, today);

  if (!list.length) {
    container.append(emptyFor(view));
  } else {
    container.append(el('div.card', {}, list.map((t) => taskRow(t, today))));
  }

  container.append(
    el('button.btn.btn-primary.btn-block', { text: '+ Add task', onclick: () => taskForm() })
  );
}

function emptyFor(id) {
  if (id === 'overdue') {
    return el('div.card', {}, [el('p', { text: '✓ Nothing overdue.', style: 'margin:0' })]);
  }
  if (id === 'completed') {
    return el('div.card', {}, [
      el('p.muted', { text: 'Nothing completed yet.', style: 'margin:0' }),
    ]);
  }
  if (id === 'today') {
    return el('div.card', {}, [
      el('p', { text: '✓ Nothing due today.', style: 'margin:0' }),
    ]);
  }
  return emptyState('☑', 'Nothing scheduled ahead.', 'Add a task', () => taskForm());
}

function taskRow(t, today) {
  const overdue = !t.done && t.due_date && t.due_date < today;

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

  return el(`div.row${overdue ? '.is-overdue' : ''}`, {}, [
    check,
    el('div.row-main', {}, [
      // dir="auto" because titles are frequently Arabic, sometimes mixed with Latin
      // and digits — without it the parentheses and numbers land on the wrong side.
      el('div.row-title', {
        text: t.title,
        dir: 'auto',
        style: t.done ? 'text-decoration:line-through;color:var(--text-dim)' : '',
      }),
      el('div.row-sub', {}, metaFor(t, today)),
    ]),
    el('div.row-actions', {}, [
      el('button.icon-btn', { text: '⋯', title: 'Edit', onclick: () => taskForm(t) }),
    ]),
  ]);
}

/** The one line under a title: when it is due, how important, and what it belongs to. */
function metaFor(t, today) {
  const bits = [];

  if (t.priority === PRIORITY.HIGH) {
    bits.push(el('span.pill.pill-bad', { text: 'High' }));
  } else if (t.priority === PRIORITY.LOW) {
    bits.push(el('span.pill', { text: 'Low' }));
  }

  if (t.due_date) {
    const late = !t.done && t.due_date < today;
    const when = t.due_date === today ? 'Today' : prettyDate(t.due_date);
    bits.push(el('span', {
      text: t.due_time ? `${when} ${t.due_time.slice(0, 5)}` : when,
      style: late ? 'color:var(--bad);font-weight:600' : '',
    }));
  } else if (!t.done) {
    bits.push(el('span', { text: 'No deadline' }));
  }

  if (t.category && t.category !== 'personal') {
    bits.push(el('span', { text: CATEGORY_LABEL[t.category] ?? t.category }));
  }
  if (t.estimate_min) bits.push(el('span', { text: formatEstimate(t.estimate_min) }));
  if (t.notes) bits.push(el('span', { text: t.notes, dir: 'auto' }));

  // Interleave with separators rather than joining strings, so each part can be styled.
  const out = [];
  bits.forEach((b, i) => {
    if (i) out.push(el('span.row-sep', { text: '·', 'aria-hidden': 'true' }));
    out.push(b);
  });
  return out;
}

function formatEstimate(min) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * The task form.
 *
 * Deliberately two-tier: title and deadline are always visible, everything else sits
 * behind "More". Capturing a task has to take seconds, or it will not happen — and a
 * task that never gets captured is the thing this app is trying to prevent.
 *
 * `onSaved` lets Quick Add and other views reuse this without the Tasks view's own
 * reload running against a container it no longer owns.
 */
export function taskForm(existing = null, preset = {}, onSaved = null) {
  let showMore = Boolean(existing?.notes || existing?.estimate_min || existing?.due_time);

  const notes = el('textarea', { name: 'notes', maxlength: '1000', dir: 'auto', placeholder: 'Optional' });
  notes.value = existing?.notes ?? '';

  const more = el('div', { hidden: !showMore }, [
    el('div.field-row', {}, [
      el('label.field', {}, [
        el('span', { text: 'Priority' }),
        el('select', { name: 'priority' }, [3, 2, 1].map((p) =>
          el('option', {
            value: String(p),
            text: PRIORITY_LABEL[p],
            selected: (existing?.priority ?? preset.priority ?? 2) === p,
          })
        )),
      ]),
      el('label.field', {}, [
        el('span', { text: 'Time' }),
        el('input', {
          name: 'due_time',
          type: 'time',
          value: existing?.due_time ? existing.due_time.slice(0, 5) : '',
        }),
      ]),
    ]),
    el('div.field-row', {}, [
      el('label.field', {}, [
        el('span', { text: 'Category' }),
        el('select', { name: 'category' }, ['personal', 'other'].map((c) =>
          el('option', {
            value: c,
            text: CATEGORY_LABEL[c],
            selected: (existing?.category ?? 'personal') === c,
          })
        )),
      ]),
      el('label.field', {}, [
        el('span', { text: 'Estimate (min)' }),
        el('input', {
          name: 'estimate_min',
          type: 'number',
          min: '0',
          inputmode: 'numeric',
          placeholder: '30',
          value: existing?.estimate_min ?? '',
        }),
      ]),
    ]),
    el('label.field', {}, [el('span', { text: 'Notes' }), notes]),
  ]);

  const moreToggle = el('button.btn.btn-sm', {
    type: 'button',
    text: showMore ? 'Fewer options' : 'More options',
    onclick: () => {
      showMore = !showMore;
      more.hidden = !showMore;
      moreToggle.textContent = showMore ? 'Fewer options' : 'More options';
    },
  });

  const body = el('div', {}, [
    el('label.field', {}, [
      el('span', { text: 'Task' }),
      el('input', {
        name: 'title',
        required: true,
        maxlength: '200',
        dir: 'auto',
        placeholder: 'Finish the report',
        value: existing?.title ?? '',
      }),
    ]),
    el('label.field', {}, [
      el('span', { text: 'Deadline (empty for someday)' }),
      el('input', {
        name: 'due_date',
        type: 'date',
        value: existing?.due_date ?? preset.due_date ?? todayISO(),
      }),
    ]),
    el('div', { style: 'margin-bottom:6px' }, [moreToggle]),
    more,
  ]);

  const done = onSaved ?? load;

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
            await done();
          });
        },
      }),
    onSubmit: async (v) => {
      const title = v.title.trim();
      if (!title) throw new Error('Give the task a title');

      const payload = {
        title,
        due_date: v.due_date || null,
        due_time: v.due_time || null,
        priority: Number(v.priority ?? existing?.priority ?? 2),
        category: v.category ?? existing?.category ?? 'personal',
        kind: existing?.kind ?? preset.kind ?? 'task',
        course_id: existing?.course_id ?? preset.course_id ?? null,
        project_id: existing?.project_id ?? preset.project_id ?? null,
        estimate_min: v.estimate_min ? Number(v.estimate_min) : null,
        notes: notes.value.trim() || null,
      };

      // A deadline-less task cannot carry a time.
      if (!payload.due_date) payload.due_time = null;

      if (existing) await tasks.update(existing.id, payload);
      else await tasks.create(payload);

      toast(existing ? 'Task updated' : 'Task added');
      await done();
    },
  });
}
