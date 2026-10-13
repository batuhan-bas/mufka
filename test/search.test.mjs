import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchPlans, foldTR } from '../lib/plans.mjs';
import { dateFromKey, dateOfIsoWeek, weekKey, dayKey } from '../lib/dates.mjs';

const items = [
  { id: '1', scope: 'day', key: '2026-10-03', title: 'İstanbul gezisi', created: 1 },
  { id: '2', scope: 'week', key: '2026-W40', title: 'Haftalık rapor', created: 3 },
  { id: '3', scope: 'month', key: '2026-10', title: 'Istanbul taşınma', created: 2 },
  { id: '4', scope: 'day', key: '2026-10-05', title: 'ISPANAK al', created: 4 },
];

test('searchPlans matches across scopes, newest first', () => {
  const r = searchPlans(items, 'istanbul');
  assert.deepEqual(r.map((p) => p.id), ['3', '1']); // created 2 before 1
});

test('i, ı, İ, I are all the same letter in search', () => {
  // "istanbul" matches both dotted-İ ("İstanbul") and ASCII-I ("Istanbul").
  assert.deepEqual(searchPlans(items, 'istanbul').map((p) => p.id).sort(), ['1', '3']);
  assert.deepEqual(searchPlans(items, 'ıstanbul').map((p) => p.id).sort(), ['1', '3']);
  assert.deepEqual(searchPlans(items, 'İSTANBUL').map((p) => p.id).sort(), ['1', '3']);
  // "ispanak" (any I-form) matches the ASCII-I, dotless-ı, and caps title.
  assert.deepEqual(searchPlans(items, 'ispanak').map((p) => p.id), ['4']);
  assert.deepEqual(searchPlans(items, 'ıspanak').map((p) => p.id), ['4']);
});

test('foldTR unifies the four I forms', () => {
  assert.equal(foldTR('İ'), 'i');
  assert.equal(foldTR('I'), 'i');
  assert.equal(foldTR('ı'), 'i');
  assert.equal(foldTR('i'), 'i');
  assert.equal(foldTR('Şişli'), 'şişli');
});

test('empty query returns nothing and input is not mutated', () => {
  const copy = items.slice();
  assert.deepEqual(searchPlans(items, '   '), []);
  assert.deepEqual(items, copy);
});

test('dateOfIsoWeek round-trips with weekKey', () => {
  assert.equal(weekKey(dateOfIsoWeek(2026, 40)), '2026-W40');
  assert.equal(weekKey(dateOfIsoWeek(2021, 1)), '2021-W01');
});

test('dateFromKey lands on the right period per scope', () => {
  assert.equal(dayKey(dateFromKey('day', '2026-10-03')), '2026-10-03');
  const m = dateFromKey('month', '2026-10');
  assert.equal(m.getFullYear(), 2026);
  assert.equal(m.getMonth(), 9);
  assert.equal(m.getDate(), 1);
  assert.equal(weekKey(dateFromKey('week', '2026-W40')), '2026-W40');
});
