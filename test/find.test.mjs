import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMatches, replaceMatches, matchAtOrAfter, foldCase } from '../lib/find.mjs';

test('matches ignore case, and the Turkish i in all its forms', () => {
  assert.deepEqual(findMatches('Ankara, İstanbul, ISTANBUL, ıstanbul', 'istanbul').map((m) => m.start), [8, 18, 28]);
  assert.equal(foldCase('İIıi').length, 4, 'folding keeps offsets');
  assert.deepEqual(findMatches('Şeker ŞEKER şeker', 'şeker').length, 3);
});

test('match case finds only the exact text', () => {
  assert.deepEqual(findMatches('Plan plan PLAN', 'plan', { caseSensitive: true }), [{ start: 5, end: 9 }]);
});

test('matches do not overlap; an empty query finds nothing', () => {
  assert.deepEqual(findMatches('aaaa', 'aa').map((m) => m.start), [0, 2]);
  assert.deepEqual(findMatches('abc', ''), []);
});

test('replace keeps everything between the matches', () => {
  const text = 'one two one, one';
  assert.equal(replaceMatches(text, findMatches(text, 'one'), '1'), '1 two 1, 1');
  assert.equal(replaceMatches(text, findMatches(text, 'one'), ''), ' two , ');
  assert.equal(replaceMatches(text, [], 'x'), text);
});

test('the first match shown is the one at or after the caret, wrapping', () => {
  const ms = findMatches('a.a.a', 'a');
  assert.equal(matchAtOrAfter(ms, 1), 1);
  assert.equal(matchAtOrAfter(ms, 5), 0);
  assert.equal(matchAtOrAfter([], 0), -1);
});
