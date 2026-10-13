import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, applyTemplate } from '../lib/template.mjs';

const d = new Date(2026, 9, 4, 14, 5, 9); // Sunday 4 October 2026, 14:05:09

test('moment-style tokens', () => {
  assert.equal(formatDate(d, 'YYYY-MM-DD'), '2026-10-04');
  assert.equal(formatDate(d, 'dddd, D MMMM YYYY'), 'Sunday, 4 October 2026');
  assert.equal(formatDate(d, 'ddd Do MMM YY'), 'Sun 4th Oct 26');
  assert.equal(formatDate(d, 'HH:mm:ss h A'), '14:05:09 2 PM');
  assert.equal(formatDate(d, '[Week] ww, [day] E'), 'Week 40, day 7');
  assert.equal(formatDate(d, 'DDDD'), '277');
});

test('template variables', () => {
  const ctx = { title: 'Plan', date: d };
  assert.equal(applyTemplate('# {{title}}\n{{date}} {{time}}', ctx), '# Plan\n2026-10-04 14:05');
  assert.equal(applyTemplate('{{date:MMMM YYYY}} / {{ time:HH }}', ctx), 'October 2026 / 14');
  assert.equal(applyTemplate('{{date}}', { ...ctx, dateFormat: 'DD.MM.YYYY' }), '04.10.2026');
  assert.equal(applyTemplate('{{unknown}} {{Title}}', ctx), '{{unknown}} Plan');
});
