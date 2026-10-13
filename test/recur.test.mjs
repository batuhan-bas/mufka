import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occursOn, normalizeRecur, describeRecur, isoDow } from '../lib/recur.mjs';

const anchor = new Date(2026, 9, 1); // Thu 1 Oct 2026

test('isoDow: Monday=1 .. Sunday=7', () => {
  assert.equal(isoDow(new Date(2026, 8, 28)), 1); // Monday
  assert.equal(isoDow(new Date(2026, 9, 4)), 7);  // Sunday
});

test('daily occurs every day on/after anchor, never before', () => {
  const r = { type: 'daily' };
  assert.ok(occursOn(r, anchor, new Date(2026, 9, 1)));
  assert.ok(occursOn(r, anchor, new Date(2026, 9, 20)));
  assert.ok(!occursOn(r, anchor, new Date(2026, 8, 30))); // before anchor
});

test('weekdays occurs only on listed ISO days', () => {
  const r = { type: 'weekdays', days: [1, 3, 5] }; // Mon/Wed/Fri
  assert.ok(occursOn(r, anchor, new Date(2026, 9, 5)));  // Mon
  assert.ok(occursOn(r, anchor, new Date(2026, 9, 7)));  // Wed
  assert.ok(!occursOn(r, anchor, new Date(2026, 9, 6))); // Tue
});

test('monthday occurs on that day each month, from anchor on', () => {
  const r = { type: 'monthday', day: 15 };
  assert.ok(occursOn(r, anchor, new Date(2026, 9, 15)));
  assert.ok(occursOn(r, anchor, new Date(2026, 10, 15)));
  assert.ok(!occursOn(r, anchor, new Date(2026, 9, 16)));
});

test('null recurrence never occurs', () => {
  assert.ok(!occursOn(null, anchor, anchor));
});

test('normalizeRecur validates and cleans', () => {
  assert.equal(normalizeRecur(null), null);
  assert.deepEqual(normalizeRecur({ type: 'daily' }), { type: 'daily' });
  assert.deepEqual(
    normalizeRecur({ type: 'weekdays', days: [5, 1, 1, 9, 3] }),
    { type: 'weekdays', days: [1, 3, 5] },
  );
  assert.equal(normalizeRecur({ type: 'weekdays', days: [] }), null);
  assert.deepEqual(normalizeRecur({ type: 'monthday', day: '12' }), { type: 'monthday', day: 12 });
  assert.equal(normalizeRecur({ type: 'monthday', day: 40 }), null);
});

test('describeRecur gives Turkish labels', () => {
  assert.equal(describeRecur({ type: 'daily' }), 'Every day');
  assert.equal(describeRecur({ type: 'weekdays', days: [1, 5] }), 'Mon, Fri');
  assert.equal(describeRecur({ type: 'monthday', day: 3 }), 'Monthly on day 3');
});

test('repeat choices round-trip through recur objects', async () => {
  const { repeatChoices, recurFromChoice, choiceFromRecur } = await import('../lib/recur.mjs');
  const wed = new Date(2026, 9, 14); // Wednesday 14 October
  assert.deepEqual(repeatChoices(wed).map((c) => c.id), ['none', 'daily', 'weekdays', 'weekly', 'custom', 'monthly']);
  assert.equal(repeatChoices(wed)[3].label, 'Every week on Wednesday');
  assert.equal(repeatChoices(wed)[5].label, 'Every month on day 14');
  assert.equal(recurFromChoice('none', wed), null);
  assert.deepEqual(recurFromChoice('weekly', wed), { type: 'weekdays', days: [3] });
  assert.deepEqual(recurFromChoice('custom', wed, [5, 1, 1]), { type: 'weekdays', days: [1, 5] });
  assert.equal(recurFromChoice('custom', wed, []), null, 'no days chosen: does not repeat');
  assert.deepEqual(recurFromChoice('monthly', wed), { type: 'monthday', day: 14 });
  for (const id of ['daily', 'weekdays', 'weekly', 'monthly']) assert.equal(choiceFromRecur(recurFromChoice(id, wed), wed).id, id);
  assert.deepEqual(choiceFromRecur({ type: 'weekdays', days: [2, 4] }, wed), { id: 'custom', days: [2, 4] });
});
