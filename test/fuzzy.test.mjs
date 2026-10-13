import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuzzyMatch, fuzzyFilter, pushRecent } from '../lib/fuzzy.mjs';

test('characters in order, case and i/ı folded', () => {
  assert.ok(fuzzyMatch('gv', 'Graph view'));
  assert.equal(fuzzyMatch('vg', 'Graph view'), null);
  assert.deepEqual(fuzzyMatch('GRV', 'Graph view').indices, [0, 1, 6]);
  assert.ok(fuzzyMatch('isik', 'Işık'));
  assert.deepEqual(fuzzyMatch('', 'x'), { score: 0, indices: [] });
  assert.ok(fuzzyMatch('new note', 'New note'));
});

test('ranking: prefix and word starts beat scattered matches', () => {
  const items = ['Unread notes', 'Notes about Electron', 'Annotations', 'Daily/Note'];
  const r = fuzzyFilter('note', items, (s) => s).map((x) => x.item);
  assert.equal(r[0], 'Notes about Electron');
  assert.ok(!r.includes('Annotations'), 'no e: no match');
  assert.deepEqual(fuzzyMatch('note', 'Unread notes').indices, [7, 8, 9, 10], 'the word, not the scattered letters');
  assert.deepEqual(fuzzyFilter('zzz', items, (s) => s), []);
});

test('shorter target wins a tie; empty query keeps order', () => {
  const r = fuzzyFilter('ab', ['abcdef', 'ab'], (s) => s).map((x) => x.item);
  assert.deepEqual(r, ['ab', 'abcdef']);
  assert.deepEqual(fuzzyFilter('', ['b', 'a'], (s) => s).map((x) => x.item), ['b', 'a']);
});

test('recent list: newest first, unique, capped', () => {
  let l = [];
  l = pushRecent(l, 'a'); l = pushRecent(l, 'b'); l = pushRecent(l, 'a');
  assert.deepEqual(l, ['a', 'b']);
  assert.equal(pushRecent(Array.from({ length: 40 }, (_, i) => String(i)), 'x').length, 30);
});
