import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectTrigger, applySuggestion, linkTextFor } from '../lib/suggest.mjs';

const at = (s) => detectTrigger(s.replace('^', ''), s.indexOf('^')); // ^ marks the caret

test('link trigger', () => {
  assert.deepEqual(at('see [[Muf^'), { kind: 'link', query: 'Muf', start: 4 });
  assert.deepEqual(at('[[^'), { kind: 'link', query: '', start: 0 });
  assert.deepEqual(at('a\nb [[x y^'), { kind: 'link', query: 'x y', start: 4 });
  assert.equal(at('[[Done]] after^'), null);
  assert.equal(at('[[Title|ali^'), null, 'alias part is free text');
  assert.equal(at('[[Title#He^'), null);
});

test('tag trigger', () => {
  assert.deepEqual(at('text #pro^'), { kind: 'tag', query: 'pro', start: 5 });
  assert.deepEqual(at('#a/b^'), { kind: 'tag', query: 'a/b', start: 0 });
  assert.equal(at('# Heading^'), null);
  assert.equal(at('## Head^'), null);
  assert.equal(at('#1^'), null, 'needs a letter first');
  assert.equal(at('a#b^'), null, 'not inside a word');
  assert.equal(at('#^'), null);
});

test('applying a suggestion', () => {
  const v = 'see [[Muf]] ok';
  const t = detectTrigger(v, 9);
  assert.deepEqual(applySuggestion(v, 9, t, '[[Mufka]]'), { value: 'see [[Mufka]] ok', caret: 13 });
  const w = 'go #pr';
  assert.deepEqual(applySuggestion(w, 6, detectTrigger(w, 6), '#project '), { value: 'go #project ', caret: 12 });
});

test('link text is the title unless ambiguous', () => {
  const all = ['A/Plan.md', 'B/Plan.md', 'Solo.md'];
  assert.equal(linkTextFor('Solo.md', all), 'Solo');
  assert.equal(linkTextFor('A/Plan.md', all), 'A/Plan');
});
