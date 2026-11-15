import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayPlans, menubarTitle, menubarRows, duration } from '../lib/menubar.mjs';

const at = (h, m) => new Date(2026, 10, 16, h, m); // Monday 16 Nov 2026
const plan = (o) => ({ id: o.title, scope: 'day', key: '2026-11-16', ...o });

test('today\'s plans: done, other days and week plans left out; timed first', () => {
  const items = [
    plan({ title: 'Read' }),
    plan({ title: 'Tennis', time: '18:00', endTime: '19:00' }),
    plan({ title: 'Standup', time: '09:30' }),
    plan({ title: 'Done one', time: '08:00', done: true }),
    plan({ title: 'Tomorrow', key: '2026-11-17', time: '10:00' }),
    { id: 'w', scope: 'week', key: '2026-W47', title: 'Week goal' },
    plan({ title: 'Gym', key: '2026-11-02', time: '07:00', recur: { type: 'weekdays', days: [1, 3] } }),
    plan({ title: 'Skipped', key: '2026-11-02', time: '12:00', recur: { type: 'daily' }, exceptions: { '2026-11-16': true } }),
  ];
  assert.deepEqual(todayPlans(items, at(8, 0)).map((p) => p.title), ['Gym', 'Standup', 'Tennis', 'Read']);
});

test('the title: next plan, a plan going on, nothing left', () => {
  const plans = todayPlans([
    plan({ title: 'Standup', time: '09:30' }),
    plan({ title: 'Tennis', time: '18:00', endTime: '19:00' }),
  ], at(8, 0));
  assert.equal(menubarTitle(plans, at(8, 0)), 'Standup · in 1h 30m');
  assert.equal(menubarTitle(plans, at(9, 30)), 'Standup · now');
  assert.equal(menubarTitle(plans, at(9, 31)), 'Tennis · in 8h 29m');
  assert.equal(menubarTitle(plans, at(18, 35)), 'Tennis · 25m left');
  assert.equal(menubarTitle(plans, at(19, 0)), '');
});

test('long titles are shortened; untimed plans never show in the title', () => {
  const plans = todayPlans([plan({ title: 'A very long plan title that keeps going', time: '10:00' }), plan({ title: 'Read' })], at(9, 0));
  assert.equal(menubarTitle(plans, at(9, 0)), 'A very long plan title… · in 1h');
  assert.equal(menubarTitle(todayPlans([plan({ title: 'Read' })], at(9, 0)), at(9, 0)), '');
});

test('menu rows, with plans already over marked', () => {
  const plans = todayPlans([
    plan({ title: 'Standup', time: '09:30' }),
    plan({ title: 'Tennis', time: '18:00', endTime: '19:00' }),
    plan({ title: 'Read' }),
  ], at(12, 0));
  assert.deepEqual(menubarRows(plans, at(12, 0)), [
    { label: '09:30  Standup', past: true },
    { label: '18:00–19:00  Tennis', past: false },
    { label: 'Read', past: false },
  ]);
});

test('duration', () => {
  assert.deepEqual([5, 60, 80, 600].map(duration), ['5m', '1h', '1h 20m', '10h']);
});
