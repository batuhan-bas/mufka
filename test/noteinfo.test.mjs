import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outline, outgoingLinks, findMentions, unlinkedMentions, linkMention } from '../lib/noteinfo.mjs';

test('outline: headings with depth, text and line; not in code', () => {
  const src = '---\ntitle: x\n---\n# One *two*\ntext\n## Sub [[Link|al]]\n```\n# not a heading\n```\n> ### Quoted\n';
  assert.deepEqual(outline(src), [
    { depth: 1, text: 'One two', line: 3 },
    { depth: 2, text: 'Sub al', line: 5 },
    { depth: 3, text: 'Quoted', line: 9 },
  ]);
  assert.deepEqual(outline(''), []);
});

test('outgoing links: unique, resolved or not, no attachments', () => {
  const notes = [{ rel: 'A.md' }, { rel: 'Dir/B.md' }];
  assert.deepEqual(outgoingLinks('[[B]] [[b|x]] [[Yok]] ![[p.png]] [[A#h]]', 'A.md', notes), [
    { target: 'B', rel: 'Dir/B.md' },
    { target: 'Yok', rel: null },
    { target: 'A', rel: 'A.md' },
  ]);
});

test('mentions: whole words, folded, not in links/code/frontmatter', () => {
  const src = '---\ntags: mufka\n---\nMufka is great, mufkaish no.\n[[Mufka]] and `mufka` and [x](mufka.md)\nİstanbul MUFKA';
  assert.deepEqual(findMentions(src, 'Mufka'), [
    { line: 3, start: 0, end: 5 },
    { line: 5, start: 9, end: 14 },
  ]);
  assert.deepEqual(findMentions('istanbul', 'İstanbul'), [{ line: 0, start: 0, end: 8 }]);
  assert.deepEqual(findMentions('a', 'a'), [], 'one-letter titles are ignored');
});

test('unlinked mentions skip notes that already link', () => {
  const notes = [
    { rel: 'Mufka.md', content: 'self Mufka' },
    { rel: 'A.md', content: 'about mufka here\nand Mufka again' },
    { rel: 'B.md', content: '[[Mufka]] and Mufka' },
    { rel: 'C.md', content: 'nothing' },
  ];
  assert.deepEqual(unlinkedMentions(notes, 'Mufka.md'), [
    { rel: 'A.md', line: 0, text: 'about mufka here', start: 6, end: 11 },
    { rel: 'A.md', line: 1, text: 'and Mufka again', start: 4, end: 9 },
  ]);
});

test('linkMention keeps the written case and refuses stale offsets', () => {
  assert.equal(linkMention('about mufka here', { line: 0, start: 6, end: 11 }, 'Mufka'), 'about [[Mufka|mufka]] here');
  assert.equal(linkMention('x Mufka', { line: 0, start: 2, end: 7 }, 'Mufka'), 'x [[Mufka]]');
  assert.equal(linkMention('changed text', { line: 0, start: 2, end: 7 }, 'Mufka'), 'changed text');
});
