import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEntry, formatPlanText } from '../lib/plans.mjs';
import { formatDayNumeric, formatWeekdayLong, formatDayPretty } from '../lib/dates.mjs';

test('parseEntry pulls a leading HH:MM time', () => {
  assert.deepEqual(parseEntry('18:30 Spor'), { time: '18:30', endTime: '', title: 'Spor' });
});

test('parseEntry parses a time range', () => {
  assert.deepEqual(parseEntry('18:30-19:30 Spor'), { time: '18:30', endTime: '19:30', title: 'Spor' });
  assert.deepEqual(parseEntry('18:30 - 19:30 Spor'), { time: '18:30', endTime: '19:30', title: 'Spor' });
});

test('parseEntry accepts a dot separator and pads', () => {
  assert.deepEqual(parseEntry('9.30 Spor'), { time: '09:30', endTime: '', title: 'Spor' });
  assert.deepEqual(parseEntry('9.00-10.00 Spor'), { time: '09:00', endTime: '10:00', title: 'Spor' });
});

test('parseEntry leaves plain text as title', () => {
  assert.deepEqual(parseEntry('Spor'), { time: '', endTime: '', title: 'Spor' });
  assert.deepEqual(parseEntry('  Market  '), { time: '', endTime: '', title: 'Market' });
});

test('parseEntry ignores invalid times and time with no title', () => {
  assert.deepEqual(parseEntry('25:00 x'), { time: '', endTime: '', title: '25:00 x' });
  assert.deepEqual(parseEntry('10:70 x'), { time: '', endTime: '', title: '10:70 x' });
  assert.deepEqual(parseEntry('09:30'), { time: '', endTime: '', title: '09:30' });
});

test('parseEntry treats only the first token as time', () => {
  assert.deepEqual(parseEntry('12:00 öğle 13:00'), { time: '12:00', endTime: '', title: 'öğle 13:00' });
});

test('formatPlanText round-trips with parseEntry', () => {
  assert.equal(formatPlanText({ time: '', endTime: '', title: 'Market' }), 'Market');
  assert.equal(formatPlanText({ time: '18:30', endTime: '', title: 'Spor' }), '18:30 Spor');
  assert.equal(formatPlanText({ time: '18:30', endTime: '19:30', title: 'Spor' }), '18:30-19:30 Spor');
  const p = parseEntry(formatPlanText({ time: '18:30', endTime: '19:30', title: 'Spor' }));
  assert.deepEqual(p, { time: '18:30', endTime: '19:30', title: 'Spor' });
});

test('date format helpers (en-GB)', () => {
  assert.equal(formatDayNumeric(new Date(2026, 9, 4)), '4 October 2026');
  assert.equal(formatWeekdayLong(new Date(2026, 9, 4)), 'Sunday');
  assert.equal(formatDayPretty(new Date(2026, 9, 4)), 'Sunday, 4 October');
});
