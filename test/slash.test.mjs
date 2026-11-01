import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSlash, slashItems } from '../lib/slash.mjs';
import { detectTrigger, applySuggestion } from '../lib/suggest.mjs';

test('"/" opens the menu at a line start or after a space, not in paths or code', () => {
  assert.deepEqual(detectSlash('/', 1), { kind: 'slash', query: '', start: 0, atLineStart: true });
  assert.deepEqual(detectSlash('abc\n  /h2', 9), { kind: 'slash', query: 'h2', start: 6, atLineStart: true });
  assert.equal(detectSlash('text /ta', 8).atLineStart, false);
  assert.equal(detectSlash('a/b', 3), null, 'a path');
  assert.equal(detectSlash('https://x', 9), null, 'an address');
  assert.equal(detectSlash('/ ', 2), null, 'a space right after the slash');
  assert.equal(detectSlash('```\n/', 5), null, 'inside a code block');
  assert.equal(detectTrigger('x\n/tas', 6).kind, 'slash', 'the editor triggers find it');
});

test('typing filters, English or Turkish words', () => {
  assert.equal(slashItems('h2')[0].id, 'h2');
  assert.equal(slashItems('task')[0].id, 'task');
  assert.equal(slashItems('tablo')[0].id, 'table');
  assert.equal(slashItems('görev')[0].id, 'task');
  assert.deepEqual(slashItems('zzzz'), []);
  assert.ok(!slashItems('').some((r) => r.id === 'daily'), 'no daily link without a daily note name');
});

test('what is inserted, and where the caret goes', () => {
  const at = (id, opts) => slashItems('', opts).find((r) => r.id === id);
  const code = at('code');
  const { value, caret } = applySuggestion('/co', 3, detectSlash('/co', 3), code.insert, code.caret);
  assert.equal(value, '```\n\n```');
  assert.equal(caret, 4, 'on the empty line inside the fence');
  assert.equal(at('task', { atLineStart: false }).insert, '\n- [ ] ', 'mid-line: a new line');
  const now = new Date(2026, 10, 1, 9, 5);
  assert.equal(at('date', { now }).insert, '2026-11-01');
  assert.equal(at('time', { now }).insert, '09:05');
  assert.equal(at('daily', { dailyLink: '2026-11-01' }).insert, '[[2026-11-01]]');
  assert.equal(at('attach').action, 'attach');
});
