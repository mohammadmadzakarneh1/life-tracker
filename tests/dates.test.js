// Date and formatting helpers. These are load-bearing: every deadline, streak and
// calendar occurrence depends on them, and a UTC slip here silently moves a whole
// day's work into yesterday.

import { test, eq, ok } from './assert.js';
import { todayISO, addDays, dateRange, prettyDate, money } from '../js/ui.js';

test('todayISO formats as YYYY-MM-DD', () => {
  eq(todayISO(new Date(2026, 9, 4)), '2026-10-04');
  eq(todayISO(new Date(2027, 0, 1)), '2027-01-01', 'single-digit month and day pad');
});

test('todayISO uses local time, not UTC', () => {
  // 23:30 local on 4 Oct is already 5 Oct in UTC for eastern timezones.
  // toISOString() would return the wrong day here; this must not.
  const lateEvening = new Date(2026, 9, 4, 23, 30);
  eq(todayISO(lateEvening), '2026-10-04');

  const earlyMorning = new Date(2026, 9, 4, 0, 15);
  eq(todayISO(earlyMorning), '2026-10-04');
});

test('addDays crosses month and year boundaries', () => {
  eq(addDays('2026-10-04', 1), '2026-10-05');
  eq(addDays('2026-10-31', 1), '2026-11-01');
  eq(addDays('2026-12-31', 1), '2027-01-01');
  eq(addDays('2027-01-01', -1), '2026-12-31');
  eq(addDays('2026-10-04', 0), '2026-10-04');
});

test('addDays handles February in a leap and a common year', () => {
  eq(addDays('2028-02-28', 1), '2028-02-29', '2028 is a leap year');
  eq(addDays('2027-02-28', 1), '2027-03-01', '2027 is not');
});

test('addDays spans the whole first semester', () => {
  // 4 Oct 2026 to 14 Jan 2027 — the real semester length.
  let d = '2026-10-04';
  let n = 0;
  while (d !== '2027-01-14' && n < 400) {
    d = addDays(d, 1);
    n++;
  }
  eq(n, 102, 'classes run 102 days');
});

test('dateRange is inclusive at both ends', () => {
  eq(dateRange('2026-10-04', '2026-10-06'), ['2026-10-04', '2026-10-05', '2026-10-06']);
  eq(dateRange('2026-10-04', '2026-10-04'), ['2026-10-04'], 'single day');
});

test('dateRange returns empty when the range is inverted', () => {
  eq(dateRange('2026-10-06', '2026-10-04'), []);
});

test('prettyDate names today and yesterday', () => {
  const t = todayISO();
  eq(prettyDate(t), 'Today');
  eq(prettyDate(addDays(t, -1)), 'Yesterday');
  ok(prettyDate(addDays(t, -8)) !== 'Yesterday', 'older dates get a real date');
});

test('money formats without throwing on an odd currency', () => {
  ok(money(12.5, 'JOD').includes('12.5'), 'JOD renders the amount');
  ok(String(money(1, 'NOTACURRENCY')).includes('1'), 'falls back rather than throwing');
});

test('money handles zero and negatives', () => {
  ok(money(0, 'JOD').includes('0'));
  ok(money(-5, 'JOD').includes('5'));
});
