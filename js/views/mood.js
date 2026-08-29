// Daily mood rating (1-5) plus an optional journal note. One entry per day.

import { mood } from '../db.js';
import {
  el, clear, toast, openModal, confirmDelete, loading,
  todayISO, prettyDate,
} from '../ui.js';

export const FACES = ['', '😞', '😕', '😐', '🙂', '😄'];
export const LABELS = ['', 'Rough', 'Low', 'Okay', 'Good', 'Great'];

let container = null;
let entries = [];

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
    entries = await mood.recent(60);
    draw();
  } catch (err) {
    clear(container).append(
      el('div.card', {}, [
        el('h2', { text: 'Could not load mood entries' }),
        el('p.muted', { text: err.message, style: 'margin:8px 0 0' }),
      ])
    );
  }
}

function draw() {
  clear(container);

  const today = todayISO();
  const todayEntry = entries.find((e) => e.date === today) ?? null;

  container.append(todayCard(todayEntry));

  const history = entries.filter((e) => e.date !== today);
  if (history.length) {
    container.append(
      el('div.section-title', { text: 'History' }),
      el('div.card', {}, history.map(historyRow))
    );
  }
}

function todayCard(entry) {
  let selected = entry?.score ?? null;

  const opts = el(
    'div.mood-scale',
    {},
    [1, 2, 3, 4, 5].map((n) =>
      el(`button.mood-opt${selected === n ? '.is-sel' : ''}`, {
        type: 'button',
        text: FACES[n],
        title: LABELS[n],
        'aria-label': LABELS[n],
        onclick: (e) => {
          selected = n;
          [...opts.children].forEach((c) => c.classList.remove('is-sel'));
          e.currentTarget.classList.add('is-sel');
        },
      })
    )
  );

  const note = el('textarea', {
    name: 'note',
    placeholder: 'What happened today? (optional)',
    maxlength: '2000',
  });
  note.value = entry?.note ?? '';

  const save = el('button.btn.btn-primary.btn-block', {
    text: entry ? 'Update today' : 'Save today',
    onclick: async () => {
      if (!selected) return toast('Pick how the day felt', 'bad');
      save.disabled = true;
      try {
        await mood.set(todayISO(), selected, note.value.trim() || null);
        toast('Mood saved');
        await load();
      } catch (err) {
        toast(err.message, 'bad');
        save.disabled = false;
      }
    },
  });

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('h2', { text: 'How was today?' }),
      entry && el('span.pill.pill-good', { text: 'Logged' }),
    ]),
    opts,
    el('label.field', { style: 'margin-top:14px' }, [
      el('span', { text: 'Journal' }),
      note,
    ]),
    save,
  ]);
}

function historyRow(e) {
  return el('div.row', {}, [
    el('div', { text: FACES[e.score], style: 'font-size:22px' }),
    el('div.row-main', {}, [
      el('div.row-title', { text: prettyDate(e.date) }),
      el('div.row-sub', { text: e.note || LABELS[e.score] }),
    ]),
    el('div.row-actions', {}, [
      el('button.icon-btn', { text: '⋯', title: 'Edit', onclick: () => editEntry(e) }),
    ]),
  ]);
}

function editEntry(entry) {
  let selected = entry.score;

  const opts = el(
    'div.mood-scale',
    {},
    [1, 2, 3, 4, 5].map((n) =>
      el(`button.mood-opt${selected === n ? '.is-sel' : ''}`, {
        type: 'button',
        text: FACES[n],
        title: LABELS[n],
        onclick: (ev) => {
          selected = n;
          [...opts.children].forEach((c) => c.classList.remove('is-sel'));
          ev.currentTarget.classList.add('is-sel');
        },
      })
    )
  );

  const note = el('textarea', { name: 'note', maxlength: '2000' });
  note.value = entry.note ?? '';

  openModal({
    title: prettyDate(entry.date),
    body: el('div', {}, [
      opts,
      el('label.field', { style: 'margin-top:14px' }, [
        el('span', { text: 'Journal' }),
        note,
      ]),
    ]),
    extraAction: el('button.btn.btn-danger.btn-block', {
      type: 'button',
      text: 'Delete entry',
      style: 'margin-top:9px',
      onclick: (e) => {
        e.currentTarget.closest('.modal-backdrop').remove();
        confirmDelete('this entry', async () => {
          await mood.remove(entry.id);
          toast('Entry deleted');
          await load();
        });
      },
    }),
    onSubmit: async () => {
      await mood.set(entry.date, selected, note.value.trim() || null);
      toast('Entry updated');
      await load();
    },
  });
}
