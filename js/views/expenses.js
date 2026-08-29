// Income and spending for the selected month.

import { expenses } from '../db.js';
import {
  el, clear, toast, openModal, confirmDelete, emptyState, loading,
  todayISO, prettyDate, money,
} from '../ui.js';

const CATEGORIES = [
  'Food', 'Transport', 'Bills', 'Shopping', 'Health',
  'Fun', 'Home', 'Education', 'Salary', 'Other',
];

let container = null;
let month = todayISO().slice(0, 7); // YYYY-MM
let rows = [];      // entries in the selected month
let allRows = [];   // every entry ever, for the running balance

export async function render(root) {
  container = root;
  await load();
}

export function destroy() {
  container = null;
}

/** First and last day of `month`, as ISO dates. */
function bounds(ym) {
  const first = `${ym}-01`;
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate(); // day 0 of next month = last of this one
  return [first, `${ym}-${String(last).padStart(2, '0')}`];
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function load() {
  clear(container).append(loading());
  try {
    const [from, to] = bounds(month);
    [rows, allRows] = await Promise.all([expenses.range(from, to), expenses.allTime()]);
    if (!container) return;
    draw();
  } catch (err) {
    if (!container) return;
    clear(container).append(
      el('div.card', {}, [
        el('h2', { text: 'Could not load expenses' }),
        el('p.muted', { text: err.message, style: 'margin:8px 0 0' }),
      ])
    );
  }
}

function draw() {
  clear(container);

  const income = sum(rows.filter((r) => r.kind === 'income'));
  const spent = sum(rows.filter((r) => r.kind === 'expense'));
  const net = income - spent;
  const currency = allRows[0]?.currency ?? rows[0]?.currency ?? 'USD';

  // Running total across every month — "what I actually have".
  const receivedEver = sum(allRows.filter((r) => r.kind === 'income'));
  const spentEver = sum(allRows.filter((r) => r.kind === 'expense'));
  const balance = receivedEver - spentEver;

  const [y, m] = month.split('-').map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  container.append(
    el('div.card', {}, [
      el('div.stat-label', { text: 'Balance' }),
      el('div.balance', {
        text: money(balance, currency),
        style: `color:${balance >= 0 ? 'var(--text)' : 'var(--bad)'}`,
      }),
      el('div.stat-sub', {
        text: `${money(receivedEver, currency)} received · ${money(spentEver, currency)} spent, all time`,
      }),
    ]),

    el('div.card', {}, [
      el('div.card-head', { style: 'margin-bottom:0' }, [
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
    ]),

    el('div.stat-grid', {}, [
      stat('Received', money(income, currency), 'var(--good)'),
      stat('Spent', money(spent, currency)),
      stat('Net', money(net, currency), net >= 0 ? 'var(--good)' : 'var(--bad)'),
    ])
  );

  if (!rows.length) {
    container.append(
      emptyState('◈', 'Nothing logged this month.', 'Add an entry', () => entryForm())
    );
  } else {
    container.append(
      el('div.section-title', { text: 'By category' }),
      el('div.card', {}, categoryRows(currency)),
      el('div.section-title', { text: 'Entries' }),
      el('div.card', {}, rows.map(entryRow))
    );
  }

  container.append(
    el('button.btn.btn-primary.btn-block', {
      text: '+ Add entry',
      onclick: () => entryForm(),
    })
  );
}

function sum(list) {
  return list.reduce((t, r) => t + Number(r.amount), 0);
}

function stat(label, value, color) {
  return el('div.stat', {}, [
    el('div.stat-label', { text: label }),
    el('div.stat-value', { text: value, style: color ? `color:${color}` : '' }),
  ]);
}

function categoryRows(currency) {
  const totals = new Map();
  for (const r of rows) {
    if (r.kind !== 'expense') continue;
    totals.set(r.category, (totals.get(r.category) ?? 0) + Number(r.amount));
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return [el('p.muted', { text: 'No spending yet.', style: 'margin:0' })];

  const max = sorted[0][1];
  return sorted.map(([cat, total]) =>
    el('div.row', {}, [
      el('div.row-main', {}, [
        el('div.row-title', { text: cat }),
        el('div', {
          style:
            `height:5px;border-radius:3px;background:var(--accent);opacity:.75;margin-top:6px;` +
            `width:${Math.max(4, (total / max) * 100)}%`,
        }),
      ]),
      el('div', { text: money(total, currency), style: 'font-weight:600' }),
    ])
  );
}

function entryRow(r) {
  const isIncome = r.kind === 'income';
  return el('div.row', {}, [
    el('div.row-main', {}, [
      el('div.row-title', { text: r.note || r.category }),
      el('div.row-sub', { text: `${prettyDate(r.date)} · ${r.category}` }),
    ]),
    el('div', {
      text: `${isIncome ? '+' : '−'}${money(Number(r.amount), r.currency)}`,
      style: `font-weight:600;color:${isIncome ? 'var(--good)' : 'var(--text)'}`,
    }),
    el('div.row-actions', {}, [
      el('button.icon-btn', { text: '⋯', title: 'Edit', onclick: () => entryForm(r) }),
    ]),
  ]);
}

function entryForm(existing = null) {
  const kindSel = el('select', { name: 'kind' }, [
    el('option', { value: 'expense', text: 'Money spent', selected: existing?.kind !== 'income' }),
    el('option', { value: 'income', text: 'Money received', selected: existing?.kind === 'income' }),
  ]);

  const catSel = el(
    'select',
    { name: 'category' },
    CATEGORIES.map((c) =>
      el('option', { value: c, text: c, selected: (existing?.category ?? 'Food') === c })
    )
  );

  const body = el('div', {}, [
    el('div.field-row', {}, [
      el('label.field', {}, [el('span', { text: 'Type' }), kindSel]),
      el('label.field', {}, [el('span', { text: 'Category' }), catSel]),
    ]),
    el('div.field-row', {}, [
      el('label.field', {}, [
        el('span', { text: 'Amount' }),
        el('input', {
          name: 'amount',
          type: 'number',
          step: '0.01',
          min: '0',
          required: true,
          inputmode: 'decimal',
          placeholder: '0.00',
          value: existing?.amount ?? '',
        }),
      ]),
      el('label.field', {}, [
        el('span', { text: 'Currency' }),
        el('input', {
          name: 'currency',
          maxlength: '3',
          placeholder: 'USD',
          value: existing?.currency ?? 'USD',
        }),
      ]),
    ]),
    el('label.field', {}, [
      el('span', { text: 'Date' }),
      el('input', { name: 'date', type: 'date', required: true, value: existing?.date ?? todayISO() }),
    ]),
    el('label.field', {}, [
      el('span', { text: 'Note' }),
      el('input', { name: 'note', maxlength: '200', placeholder: 'Optional', value: existing?.note ?? '' }),
    ]),
  ]);

  openModal({
    title: existing ? 'Edit entry' : 'New entry',
    body,
    extraAction:
      existing &&
      el('button.btn.btn-danger.btn-block', {
        type: 'button',
        text: 'Delete entry',
        style: 'margin-top:9px',
        onclick: (e) => {
          e.currentTarget.closest('.modal-backdrop').remove();
          confirmDelete('this entry', async () => {
            await expenses.remove(existing.id);
            toast('Entry deleted');
            await load();
          });
        },
      }),
    onSubmit: async (v) => {
      const amount = Number(v.amount);
      if (!Number.isFinite(amount) || amount < 0) throw new Error('Enter a valid amount');

      const payload = {
        date: v.date,
        amount,
        kind: v.kind,
        category: v.category,
        note: v.note.trim() || null,
        currency: (v.currency || 'USD').toUpperCase().slice(0, 3),
      };

      if (existing) await expenses.update(existing.id, payload);
      else await expenses.create(payload);

      // Jump to the month the entry belongs to, so it is visible after saving.
      month = v.date.slice(0, 7);
      toast(existing ? 'Entry updated' : 'Entry added');
      await load();
    },
  });
}
