import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayPlans, menubarTitle, menubarRows, duration, todayEvents, mergeDay, menubarTasks } from '../lib/menubar.mjs';

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

test('calendar events join the plans; an event can be the next thing', () => {
  const events = [
    { title: 'Standup call', allDay: false, start: new Date(2026, 10, 16, 9, 0).toISOString(), end: new Date(2026, 10, 16, 9, 15).toISOString() },
    { title: 'Holiday', allDay: true, startDate: '2026-11-16', endDate: '2026-11-17' },
    { title: 'Tomorrow', allDay: false, start: new Date(2026, 10, 17, 9, 0).toISOString(), end: new Date(2026, 10, 17, 10, 0).toISOString() },
  ];
  const ev = todayEvents(events, at(8, 0));
  assert.deepEqual(ev.map((e) => [e.title, e.time, e.kind]), [['Holiday', '', 'event'], ['Standup call', '09:00', 'event']]);
  const day = mergeDay(todayPlans([plan({ title: 'Tennis', time: '18:00', endTime: '19:00' }), plan({ title: 'Read' })], at(8, 0)), ev);
  assert.deepEqual(day.map((x) => x.title), ['Standup call', 'Tennis', 'Read', 'Holiday']);
  assert.equal(menubarTitle(day, at(8, 0)), 'Standup call · in 1h');
  assert.equal(menubarTitle(day, at(9, 5)), 'Standup call · 10m left');
  assert.deepEqual(menubarRows(day, at(8, 0)).map((r) => r.label), ['09:00–09:15  📅 Standup call', '18:00–19:00  Tennis', 'Read', '📅 Holiday']);
});

test('menu tasks: late ones first, then due today, by priority', () => {
  const t = (title, why, priority = null) => ({ title, why, priority, board: 'Sprint' });
  assert.deepEqual(menubarTasks([t('Doing', 'doing'), t('Today', 'due'), t('Urgent today', 'due', 'P1'), t('Old', 'late')]).map((x) => x.label),
    ['Old · late', 'P1 · Urgent today · Sprint', 'Today · Sprint']);
});
