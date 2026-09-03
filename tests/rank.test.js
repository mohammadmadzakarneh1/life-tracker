// Next-action ranking.
//
// The behaviour under test is a product constraint, not just arithmetic: a short easy
// task must never outrank important work. If these assertions ever loosen, the app
// starts rewarding the avoidance it exists to prevent.

import { test, eq, ok } from './assert.js';
import { score, rank, nextAction, reasons, bucketOf, daysBetween, PRIORITY } from '../js/rank.js';

const TODAY = '2026-10-04';

const task = (over = {}) => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  title: 'x',
  done: false,
  priority: PRIORITY.MEDIUM,
  kind: 'task',
  due_date: null,
  created_at: '2026-10-01T00:00:00Z',
  ...over,
});

test('daysBetween counts in both directions', () => {
  eq(daysBetween(TODAY, TODAY), 0);
  eq(daysBetween(TODAY, '2026-10-05'), 1);
  eq(daysBetween(TODAY, '2026-10-01'), -3);
  eq(daysBetween('2026-12-30', '2027-01-02'), 3, 'crosses the year');
});

test('overdue beats everything else', () => {
  const overdue = task({ due_date: '2026-10-01', priority: PRIORITY.LOW });
  const dueToday = task({ due_date: TODAY, priority: PRIORITY.HIGH, kind: 'exam' });
  ok(score(overdue, TODAY) > score(dueToday, TODAY), 'a low-priority overdue task still wins');
});

test('the longer something is overdue the higher it climbs', () => {
  const a = task({ due_date: '2026-10-03' });
  const b = task({ due_date: '2026-09-20' });
  ok(score(b, TODAY) > score(a, TODAY));
});

test('deadlines are ordered today > tomorrow > this week > later > undated', () => {
  const s = (d) => score(task({ due_date: d }), TODAY);
  ok(s(TODAY) > s('2026-10-05'));
  ok(s('2026-10-05') > s('2026-10-09'));
  ok(s('2026-10-09') > s('2026-11-30'));
  ok(s('2026-11-30') > score(task({ due_date: null }), TODAY));
});

test('priority breaks a tie between equal deadlines', () => {
  const high = task({ due_date: TODAY, priority: PRIORITY.HIGH });
  const low = task({ due_date: TODAY, priority: PRIORITY.LOW });
  ok(score(high, TODAY) > score(low, TODAY));
});

test('an exam outranks a plain task due the same day', () => {
  const exam = task({ due_date: '2026-10-06', kind: 'exam' });
  const plain = task({ due_date: '2026-10-06', kind: 'task' });
  ok(score(exam, TODAY) > score(plain, TODAY));
});

test('a quick task cannot outrank a midterm — the whole point', () => {
  const errand = task({ due_date: TODAY, priority: PRIORITY.LOW, estimate_min: 5 });
  const midterm = task({ due_date: TODAY, priority: PRIORITY.HIGH, kind: 'exam', estimate_min: 240 });
  ok(score(midterm, TODAY) > score(errand, TODAY));
});

test('estimate_min is not an input to the score at all', () => {
  const short = task({ due_date: TODAY, estimate_min: 5 });
  const long = task({ due_date: TODAY, estimate_min: 600 });
  eq(score(short, TODAY), score(long, TODAY), 'duration must not move the score');
});

test('done tasks score below everything', () => {
  ok(score(task({ done: true, due_date: '2026-09-01' }), TODAY) < score(task({}), TODAY));
});

test('rank excludes completed work and is stable', () => {
  const list = [
    task({ id: 'a', due_date: '2026-10-09' }),
    task({ id: 'b', done: true, due_date: '2026-10-01' }),
    task({ id: 'c', due_date: '2026-10-01' }),
    task({ id: 'd', due_date: TODAY }),
  ];
  eq(rank(list, TODAY).map((t) => t.id), ['c', 'd', 'a']);
});

test('equal scores fall back to the earlier deadline then the older task', () => {
  const later = task({ id: 'later', due_date: '2026-10-20', created_at: '2026-10-01T00:00:00Z' });
  const sooner = task({ id: 'sooner', due_date: '2026-10-19', created_at: '2026-10-02T00:00:00Z' });
  eq(rank([later, sooner], TODAY).map((t) => t.id), ['sooner', 'later']);

  const old = task({ id: 'old', due_date: '2026-10-20', created_at: '2026-09-01T00:00:00Z' });
  const recent = task({ id: 'recent', due_date: '2026-10-20', created_at: '2026-10-03T00:00:00Z' });
  eq(rank([recent, old], TODAY).map((t) => t.id), ['old', 'recent']);
});

test('nextAction skips deferred tasks but rank still lists them', () => {
  const list = [task({ id: 'hard', due_date: TODAY }), task({ id: 'other', due_date: '2026-10-06' })];
  eq(nextAction(list, TODAY).id, 'hard');
  eq(nextAction(list, TODAY, ['hard']).id, 'other', 'skipped task is not recommended');
  ok(rank(list, TODAY).some((t) => t.id === 'hard'), 'but it is not hidden from the list');
});

test('nextAction returns null when there is nothing to do', () => {
  eq(nextAction([], TODAY), null);
  eq(nextAction([task({ done: true })], TODAY), null);
  eq(nextAction([task({ id: 'x' })], TODAY, ['x']), null, 'all skipped');
});

test('reasons explain the choice', () => {
  eq(reasons(task({ due_date: TODAY }), TODAY), ['Due today']);
  eq(reasons(task({ due_date: '2026-10-05' }), TODAY), ['Due tomorrow']);
  eq(reasons(task({ due_date: '2026-10-03' }), TODAY), ['1 day overdue']);
  eq(reasons(task({ due_date: '2026-09-30' }), TODAY), ['4 days overdue']);
  eq(
    reasons(task({ due_date: '2026-10-05', priority: PRIORITY.HIGH, kind: 'exam' }), TODAY),
    ['Due tomorrow', 'High priority', 'Exam']
  );
  eq(reasons(task({}), TODAY), [], 'an undated medium task needs no explanation');
});

test('bucketOf sorts tasks into the four views', () => {
  eq(bucketOf(task({ done: true }), TODAY), 'completed');
  eq(bucketOf(task({ due_date: null }), TODAY), 'someday');
  eq(bucketOf(task({ due_date: '2026-10-03' }), TODAY), 'overdue');
  eq(bucketOf(task({ due_date: TODAY }), TODAY), 'today');
  eq(bucketOf(task({ due_date: '2026-10-05' }), TODAY), 'upcoming');
});
