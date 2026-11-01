import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery, matchNote, searchDoc, isPlainQuery, hitTerms, snippetFor, hitsIn } from '../lib/search.mjs';

const notes = [
  { rel: 'Work/Plan.md', title: 'Plan', content: '---\nstatus: active\ntags: [work, q4]\n---\n# Goals\nShip the release\n- [ ] write docs\n- [x] fix İstanbul bug\n\n# Notes\nrelease party on friday #fun/party' },
  { rel: 'Home/Shopping.md', title: 'Shopping', content: 'milk and bread\n- [ ] buy apples\nrelease notes' },
  { rel: 'Work/Ideas.md', title: 'Ideas', content: 'a red car\nthe car is fast\nhttps://example.com/x' },
];
const docs = notes.map(searchDoc);
const hits = (q) => docs.filter((d) => matchNote(parseQuery(q), d)).map((d) => d.title);

test('plain words: all of them, in the title or the text, case and Turkish i ignored', () => {
  assert.deepEqual(hits('release'), ['Plan', 'Shopping']);
  assert.deepEqual(hits('release party'), ['Plan']);
  assert.deepEqual(hits('ISTANBUL'), ['Plan']);
  assert.deepEqual(hits('shop'), ['Shopping']);
  assert.deepEqual(hits('https://example.com'), ['Ideas'], 'an unknown "op:" is plain text');
});

test('phrases, OR, exclusion and groups', () => {
  assert.deepEqual(hits('"red car"'), ['Ideas']);
  assert.deepEqual(hits('"car red"'), []);
  assert.deepEqual(hits('milk OR car'), ['Shopping', 'Ideas']);
  assert.deepEqual(hits('release -party'), ['Shopping']);
  assert.deepEqual(hits('-(release OR car)'), []);
  assert.deepEqual(hits('(milk OR fast) -red'), ['Shopping']);
});

test('file:, path:, content: and regular expressions', () => {
  assert.deepEqual(hits('file:plan'), ['Plan']);
  assert.deepEqual(hits('path:Work'), ['Plan', 'Ideas']);
  assert.deepEqual(hits('path:Work -file:ideas'), ['Plan']);
  assert.deepEqual(hits('content:plan'), [], 'the title is not the text');
  assert.deepEqual(hits('/c[a]r\\b/'), ['Ideas']);
  assert.deepEqual(hits('/[/'), [], 'a bad pattern is plain text, found nowhere');
});

test('line:, section: and tasks', () => {
  assert.deepEqual(hits('line:(red car)'), ['Ideas']);
  assert.deepEqual(hits('line:(red fast)'), [], 'not on one line');
  assert.deepEqual(hits('section:(release party)'), ['Plan']);
  assert.deepEqual(hits('section:(docs party)'), [], 'not under one heading');
  assert.deepEqual(hits('task:docs'), ['Plan']);
  assert.deepEqual(hits('task-todo:apples'), ['Shopping']);
  assert.deepEqual(hits('task-done:docs'), []);
  assert.deepEqual(hits('task-done:istanbul'), ['Plan']);
});

test('tags and properties', () => {
  assert.deepEqual(hits('#work'), ['Plan'], 'a frontmatter tag');
  assert.deepEqual(hits('tag:fun'), ['Plan'], 'a nested tag counts for its parent');
  assert.deepEqual(hits('#fu'), [], 'a tag is not a prefix match');
  assert.deepEqual(hits('[status]'), ['Plan']);
  assert.deepEqual(hits('[status:act]'), ['Plan']);
  assert.deepEqual(hits('[status:done]'), []);
  assert.deepEqual(hits('[tags:q4]'), ['Plan']);
});

test('plain queries, and what is marked', () => {
  assert.equal(isPlainQuery(parseQuery('weekly review')), true);
  assert.equal(isPlainQuery(parseQuery('#work')), false);
  assert.equal(isPlainQuery(parseQuery('a -b')), false);
  assert.deepEqual(hitTerms(parseQuery('car -red file:x line:(fast)')).map((t) => t.text), ['car', 'fast']);
  const s = snippetFor(docs[2], hitTerms(parseQuery('car')));
  assert.equal(s.text, 'a red car');
  assert.deepEqual(s.hits, [{ start: 6, end: 9 }]);
  assert.deepEqual(hitsIn('aa bb aa', [{ text: 'aa' }, { re: /b+/ }]).map((h) => h.start), [0, 3, 6]);
});

test('odd input never throws', () => {
  for (const q of ['(', ')', '"', '-', 'OR', 'a OR', '[', '[x', 'line:', 'file:"', '((a)', '-(']) {
    assert.doesNotThrow(() => docs.forEach((d) => matchNote(parseQuery(q), d)), q);
  }
});
