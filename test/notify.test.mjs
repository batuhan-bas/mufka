import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duePlans } from '../lib/notify.mjs';

// Fix "now" at 2026-10-03 09:00:30 local.
const now = new Date(2026, 9, 3, 9, 0, 30);
const key = '2026-10-03';
const at = (h, m) => new Date(2026, 9, 3, h, m, 0, 0).getTime();

function plan(over) {
  return {
    id: 'p', scope: 'day', key, title: 'T', time: '09:00',
    done: false, created: 1, recur: null, doneDates: {}, exceptions: {}, ...over,
  };
}

test('fires when the scheduled minute falls in (since, now]', () => {
  const since = at(8, 59); // just before 09:00
  const due = duePlans([plan()], now, since);
  assert.equal(due.length, 1);
  assert.deepEqual(due[0], { id: 'p', title: 'T', time: '09:00' });
});

test('does not fire for times already past before the window', () => {
  const since = at(9, 0); // 09:00 already elapsed at/behind window start
  assert.equal(duePlans([plan()], now, since).length, 0);
});

test('does not fire for future times', () => {
  const since = at(8, 0);
  assert.equal(duePlans([plan({ time: '10:00' })], now, since).length, 0);
});

test('skips done, wrong-day, non-day, and timeless plans', () => {
  const since = at(8, 59);
  assert.equal(duePlans([plan({ done: true })], now, since).length, 0);
  assert.equal(duePlans([plan({ key: '2026-10-04' })], now, since).length, 0);
  assert.equal(duePlans([plan({ scope: 'week', key: '2026-W40' })], now, since).length, 0);
  assert.equal(duePlans([plan({ time: '' })], now, since).length, 0);
});

test('recurring occurrence fires, respecting exceptions and per-date done', () => {
  const since = at(8, 59);
  const r = plan({ recur: { type: 'daily' }, key: '2026-09-01' });
  assert.equal(duePlans([r], now, since).length, 1);
  assert.equal(duePlans([{ ...r, exceptions: { [key]: true } }], now, since).length, 0);
  assert.equal(duePlans([{ ...r, doneDates: { [key]: true } }], now, since).length, 0);
});

test('ignores malformed times', () => {
  const since = at(0, 0);
  assert.equal(duePlans([plan({ time: '25:99' })], now, since, at(23, 59)).length, 0);
});
