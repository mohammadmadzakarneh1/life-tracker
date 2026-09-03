// Global Quick Add.
//
// Reachable from every page, because the cost of capturing something has to be near
// zero — anything that makes it a chore gets postponed, and postponed means forgotten.
//
// It reuses each section's real form rather than duplicating it. Those forms take an
// `onSaved` callback so this can refresh the current page instead of the form's own
// view, which may not be mounted.

import { el, clear, toast } from './ui.js';
import { t } from './strings.js';

/**
 * Each option lazily imports its section. `phase` marks the ones whose section is not
 * built yet — they say so instead of pretending.
 */
const OPTIONS = [
  {
    id: 'task',
    icon: '☑',
    label: 'Task',
    hint: 'Something to do, with or without a deadline',
    open: async (refresh) => (await import('./views/tasks.js')).taskForm(null, {}, refresh),
  },
  {
    id: 'event',
    icon: '▦',
    label: 'Appointment',
    hint: 'Something at a time, on a day',
    open: async (refresh) => (await import('./views/calendar.js')).eventForm(null, refresh),
  },
  {
    id: 'expense',
    icon: '◈',
    label: 'Money',
    hint: 'Received or spent',
    open: async (refresh) => (await import('./views/money.js')).entryForm(null, refresh),
  },
  {
    id: 'habit',
    icon: '✓',
    label: 'Habit',
    hint: 'Something to repeat',
    open: async (refresh) => (await import('./views/habits.js')).habitForm(null, refresh),
  },
  { id: 'coursework', icon: '✦', label: 'University work', hint: 'Assignment, quiz or exam', phase: 4 },
  { id: 'project', icon: '◆', label: 'Project', hint: 'Something with its own tasks', phase: 3 },
];

let sheet = null;

/**
 * `refresh` re-renders whatever page is currently open, so a task added from the
 * Calendar appears on the Calendar without a manual reload.
 */
export function openQuickAdd(refresh = () => {}) {
  if (sheet) return;

  const panel = el('div.sheet', {}, [
    el('div.sheet-handle', { 'aria-hidden': 'true' }),
    el('div.sheet-title', { text: t.nav.add }),
    el('div.qa-grid', {}, OPTIONS.map((o) =>
      el(`button.qa-item${o.phase ? '.is-soon' : ''}`, {
        type: 'button',
        onclick: async () => {
          close();
          if (o.phase) {
            toast(`${o.label} arrives in phase ${o.phase}`);
            return;
          }
          await o.open(refresh);
        },
      }, [
        el('span.qa-ico', { text: o.icon, 'aria-hidden': 'true' }),
        el('span.qa-label', { text: o.label }),
        el('span.qa-hint', { text: o.phase ? `Phase ${o.phase}` : o.hint }),
      ])
    )),
  ]);

  const backdrop = el('div.sheet-backdrop', {
    onclick: (e) => { if (e.target === backdrop) close(); },
  }, panel);

  sheet = backdrop;
  document.addEventListener('keydown', onKey);
  document.getElementById('modal-root').append(backdrop);
}

export function closeQuickAdd() {
  close();
}

function close() {
  if (!sheet) return;
  sheet.remove();
  sheet = null;
  document.removeEventListener('keydown', onKey);
}

function onKey(e) {
  if (e.key === 'Escape') close();
}
