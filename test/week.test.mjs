import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekDates, toMinutes, toTime, snap, span, layoutDay, moveTo, resizeTo, isMissed, firstHour } from '../lib/week.mjs';
import { dayKey } from '../lib/dates.mjs';

const p = (time, endTime = '', extra = {}) => ({ id: time + endTime, title: 'x', time, endTime, done: false, ...extra });

test('week runs Monday to Sunday', () => {
  const days = weekDates(new Date(2026, 9, 15)); // Thursday
  assert.deepEqual(days.map(dayKey), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
  assert.equal(dayKey(weekDates(new Date(2026, 9, 18))[0]), '2026-10-12', 'Sunday belongs to the week before');
});

test('times and snapping', () => {
  assert.equal(toMinutes('09:30'), 570);
  assert.equal(toMinutes(''), null);
  assert.equal(toTime(570), '09:30');
  assert.equal(toTime(24 * 60), '23:59');
  assert.equal(snap(577), 570);
  assert.equal(snap(583), 585);
  assert.deepEqual(span(p('09:00')), { start: 540, end: 600 });
  assert.deepEqual(span(p('23:30')), { start: 1410, end: 1440 });
  assert.deepEqual(span(p('09:00', '08:00')), { start: 540, end: 600 }, 'a bad end falls back to 1h');
});

test('overlapping plans share lanes', () => {
  const l = layoutDay([p('09:00', '10:00'), p('09:30', '11:00'), p('10:00', '10:30'), p('12:00'), p('')]);
  const by = Object.fromEntries(l.map((x) => [x.plan.time + x.plan.endTime, [x.lane, x.lanes]]));
  assert.deepEqual(by['09:0010:00'], [0, 2]);
  assert.deepEqual(by['09:3011:00'], [1, 2]);
  assert.deepEqual(by['10:0010:30'], [0, 2], 'reuses the lane that freed up');
  assert.deepEqual(by['12:00'], [0, 1]);
  assert.equal(l.length, 4, 'untimed plans are left out');
});

test('moving keeps the length; resizing keeps the start', () => {
  assert.deepEqual(moveTo(p('09:00', '10:30'), 14 * 60 + 7), { time: '14:00', endTime: '15:30' });
  assert.deepEqual(moveTo(p('09:00'), 600), { time: '10:00', endTime: '' }, 'start-only stays start-only');
  assert.deepEqual(moveTo(p('09:00', '10:00'), 23.5 * 60), { time: '23:30', endTime: '23:59' });
  assert.deepEqual(resizeTo(p('09:00', '10:00'), 11 * 60 + 20), { time: '09:00', endTime: '11:15' });
  assert.deepEqual(resizeTo(p('09:00', '10:00'), 500), { time: '09:00', endTime: '09:15' }, 'at least one step');
});

test('missed: past days, and today once the time has gone', () => {
  const now = new Date(2026, 9, 14, 13, 0);
  assert.ok(isMissed(p(''), '2026-10-13', now));
  assert.ok(!isMissed(p('', '', { done: true }), '2026-10-13', now));
  assert.ok(!isMissed(p(''), '2026-10-14', now), 'untimed today is not missed yet');
  assert.ok(isMissed(p('09:00', '10:00'), '2026-10-14', now));
  assert.ok(!isMissed(p('12:30', '14:00'), '2026-10-14', now));
  assert.ok(!isMissed(p('09:00'), '2026-10-15', now));
});

test('first hour to show', () => {
  assert.equal(firstHour([[], []]), 7);
  assert.equal(firstHour([layoutDay([p('09:30')]), layoutDay([p('06:15')])]), 5);
  assert.equal(firstHour([layoutDay([p('22:00')])]), 16);
});
