import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byTimeThenCreated, plansFor, genId, matchesQuery } from '../lib/plans.mjs';

const items = [
  { id: 'a', scope: 'day', key: '2026-10-03', title: 'Geç', time: '', done: false, created: 2 },
  { id: 'b', scope: 'day', key: '2026-10-03', title: 'Erken', time: '09:00', done: false, created: 5 },
  { id: 'c', scope: 'day', key: '2026-10-03', title: 'İlk kayıt', time: '', done: false, created: 1 },
  { id: 'd', scope: 'week', key: '2026-W40', title: 'Hafta', time: '', done: false, created: 3 },
  { id: 'e', scope: 'day', key: '2026-10-03', title: 'Öğlen', time: '12:30', done: false, created: 4 },
];

test('plansFor filters by scope and key', () => {
  const r = plansFor(items, 'week', '2026-W40');
  assert.deepEqual(r.map((p) => p.id), ['d']);
});

test('byTimeThenCreated: timed ascending, then untimed by created', () => {
  const r = plansFor(items, 'day', '2026-10-03');
  assert.deepEqual(r.map((p) => p.id), ['b', 'e', 'c', 'a']);
});

test('plansFor does not mutate the input array', () => {
  const copy = items.slice();
  plansFor(items, 'day', '2026-10-03');
  assert.deepEqual(items, copy);
});

test('genId is deterministic given now and rnd', () => {
  assert.equal(genId(1000, () => 0.5), `p-1000-${(0.5).toString(36).slice(2, 8)}`);
  assert.notEqual(genId(1, () => 0.1), genId(2, () => 0.1));
});

test('matchesQuery is Turkish-aware and case-insensitive', () => {
  const p = { title: 'İstanbul gezisi' };
  assert.ok(matchesQuery(p, 'istanbul'));
  assert.ok(matchesQuery(p, 'GEZ'));
  assert.ok(!matchesQuery(p, 'ankara'));
  assert.ok(!matchesQuery(p, '   ')); // empty query matches nothing
});
