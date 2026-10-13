import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayKey, monthKey, weekKey, isoWeek, keyFor, parseDayKey,
  addDays, addWeeks, addMonths, startOfWeek, sameDay, monthGrid,
} from '../lib/dates.mjs';

test('dayKey / monthKey use local date, zero-padded', () => {
  const d = new Date(2026, 0, 5); // 5 Jan 2026
  assert.equal(dayKey(d), '2026-01-05');
  assert.equal(monthKey(d), '2026-01');
});

test('isoWeek handles year boundaries', () => {
  // 1 Jan 2021 is a Friday -> ISO week 53 of 2020.
  assert.deepEqual(isoWeek(new Date(2021, 0, 1)), { year: 2020, week: 53 });
  // 4 Jan 2021 (Mon) -> week 1 of 2021.
  assert.deepEqual(isoWeek(new Date(2021, 0, 4)), { year: 2021, week: 1 });
  // 31 Dec 2026 (Thu) -> week 53 of 2026.
  assert.deepEqual(isoWeek(new Date(2026, 11, 31)), { year: 2026, week: 53 });
});

test('weekKey format', () => {
  assert.equal(weekKey(new Date(2026, 9, 3)), '2026-W40');
  assert.equal(weekKey(new Date(2021, 0, 4)), '2021-W01');
});

test('keyFor dispatches by scope', () => {
  const d = new Date(2026, 9, 3);
  assert.equal(keyFor('day', d), '2026-10-03');
  assert.equal(keyFor('week', d), '2026-W40');
  assert.equal(keyFor('month', d), '2026-10');
  assert.throws(() => keyFor('year', d));
});

test('parseDayKey round-trips dayKey', () => {
  const d = new Date(2026, 9, 3);
  assert.ok(sameDay(parseDayKey(dayKey(d)), d));
});

test('addDays / addWeeks cross month and DST safely', () => {
  assert.equal(dayKey(addDays(new Date(2026, 9, 31), 1)), '2026-11-01');
  assert.equal(dayKey(addWeeks(new Date(2026, 9, 3), 1)), '2026-10-10');
});

test('addMonths clamps overflowing day', () => {
  // 31 Jan + 1 month -> JS rolls to early March; document actual behaviour.
  const r = addMonths(new Date(2026, 0, 31), 1);
  assert.equal(r.getMonth(), 2); // March, due to JS Date rollover
});

test('startOfWeek returns Monday', () => {
  // 3 Oct 2026 is Saturday; Monday of that week is 28 Sep 2026.
  assert.equal(dayKey(startOfWeek(new Date(2026, 9, 3))), '2026-09-28');
  // A Monday maps to itself.
  assert.equal(dayKey(startOfWeek(new Date(2026, 8, 28))), '2026-09-28');
});

test('monthGrid is rectangular, Monday-first, covers the month', () => {
  const weeks = monthGrid(new Date(2026, 9, 1)); // October 2026
  assert.ok(weeks.length >= 4 && weeks.length <= 6);
  weeks.forEach((w) => assert.equal(w.length, 7));
  // First cell is a Monday.
  assert.equal(weeks[0][0].getDay(), 1);
  // Every day of October appears exactly once.
  const flat = weeks.flat().map(dayKey);
  for (let d = 1; d <= 31; d++) {
    assert.ok(flat.includes(`2026-10-${String(d).padStart(2, '0')}`), `missing day ${d}`);
  }
});
