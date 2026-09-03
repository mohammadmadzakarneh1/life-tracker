// Deciding what to do next.
//
// Pure functions, no DOM and no I/O, so this is unit-tested. It is also the piece most
// worth getting right: the stated failure mode is "I do easy tasks and avoid the hard
// one", which means a ranking that rewards triviality would actively make things worse.
//
// Two rules follow from that, and both are deliberate:
//
//   1. `estimate_min` is NOT an input. Duration informs planning; it must never make a
//      five-minute errand outrank a midterm.
//   2. Deadline and priority dominate everything else.

import { addDays } from './ui.js';

export const PRIORITY = { LOW: 1, MEDIUM: 2, HIGH: 3 };

const PRIORITY_POINTS = { 1: 0, 2: 30, 3: 60 };

// Exams and graded work carry more consequence than a generic task of the same urgency.
const KIND_POINTS = { exam: 40, quiz: 20, assignment: 20, study: 0, task: 0 };

/** Whole days from `a` to `b`; negative when `b` is earlier. Both YYYY-MM-DD. */
export function daysBetween(a, b) {
  if (a === b) return 0;
  let n = 0;
  if (a < b) {
    while (a < b && n < 3650) { a = addDays(a, 1); n++; }
    return n;
  }
  while (a > b && n < 3650) { a = addDays(a, -1); n++; }
  return -n;
}

/**
 * Score one task. Higher is more urgent. `today` is passed in rather than read from the
 * clock so this stays pure and testable.
 */
export function score(task, today) {
  if (task.done) return -1;

  let points = 0;

  if (!task.due_date) {
    points += 10; // undated work exists, but never outranks a real deadline
  } else {
    const days = daysBetween(today, task.due_date);
    if (days < 0) points += 1000 + Math.abs(days) * 10; // overdue, worse the longer it sits
    else if (days === 0) points += 500;
    else if (days === 1) points += 300;
    else if (days <= 7) points += 100 + (7 - days) * 5;
    else points += 20;
  }

  points += PRIORITY_POINTS[task.priority] ?? PRIORITY_POINTS[2];
  points += KIND_POINTS[task.kind] ?? 0;

  return points;
}

/** Descending by score, then earlier deadline, then older. A total order — no ties left. */
export function compare(a, b, today) {
  const diff = score(b, today) - score(a, today);
  if (diff !== 0) return diff;

  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }

  return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
}

export function rank(tasks, today) {
  return [...tasks].filter((t) => !t.done).sort((a, b) => compare(a, b, today));
}

/**
 * The single recommended task, or null.
 *
 * `skipped` holds ids the user pressed "Not now" on today. They are excluded from the
 * recommendation but not from the list — deferring something must not hide it.
 */
export function nextAction(tasks, today, skipped = []) {
  const skip = new Set(skipped);
  return rank(tasks, today).find((t) => !skip.has(t.id)) ?? null;
}

/**
 * Why this task was chosen, as short chips. Showing the reason is what makes the
 * recommendation trustworthy instead of magic.
 */
export function reasons(task, today) {
  const out = [];

  if (task.due_date) {
    const days = daysBetween(today, task.due_date);
    if (days < 0) out.push(days === -1 ? '1 day overdue' : `${Math.abs(days)} days overdue`);
    else if (days === 0) out.push('Due today');
    else if (days === 1) out.push('Due tomorrow');
    else if (days <= 7) out.push(`Due in ${days} days`);
  }

  if (task.priority === PRIORITY.HIGH) out.push('High priority');
  if (task.kind && task.kind !== 'task') {
    out.push(task.kind.charAt(0).toUpperCase() + task.kind.slice(1));
  }

  return out;
}

/** Which of the four task views a task belongs to. */
export function bucketOf(task, today) {
  if (task.done) return 'completed';
  if (!task.due_date) return 'someday';
  if (task.due_date < today) return 'overdue';
  if (task.due_date === today) return 'today';
  return 'upcoming';
}
