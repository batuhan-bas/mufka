import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBacklinkIndex, backlinksFor } from '../lib/backlinks.mjs';

test('index maps targets to their linking notes with excerpts', () => {
  const notes = [
    { rel: 'A.md', content: 'intro\nsee [[B]] for more' },
    { rel: 'C.md', content: 'also [[B|the b]] here' },
    { rel: 'B.md', content: '# B' },
  ];
  const idx = buildBacklinkIndex(notes);
  const back = backlinksFor(idx, 'B.md');
  assert.equal(back.length, 2);
  assert.deepEqual(back.map((e) => e.rel).sort(), ['A.md', 'C.md']);
  assert.equal(back.find((e) => e.rel === 'A.md').line, 'see [[B]] for more');
});

test('missing targets and self-links are excluded', () => {
  const notes = [
    { rel: 'A.md', content: '[[Nonexistent]] and [[A]] self' },
  ];
  const idx = buildBacklinkIndex(notes);
  assert.equal(backlinksFor(idx, 'A.md').length, 0);
  assert.equal(idx.size, 0);
});

test('links in code do not count', () => {
  const notes = [
    { rel: 'A.md', content: 'real [[B]]\n`[[B]]`\n```\n[[B]]\n```' },
    { rel: 'B.md', content: '' },
  ];
  const idx = buildBacklinkIndex(notes);
  assert.equal(backlinksFor(idx, 'B.md').length, 1);
});

test('path and folder-resolved links are indexed', () => {
  const notes = [
    { rel: 'X/note.md', content: '[[Y/Target]]' },
    { rel: 'Y/Target.md', content: '' },
  ];
  const idx = buildBacklinkIndex(notes);
  assert.equal(backlinksFor(idx, 'Y/Target.md').length, 1);
});

test('backlinksFor is empty for unknown rel', () => {
  assert.deepEqual(backlinksFor(buildBacklinkIndex([]), 'Z.md'), []);
  assert.deepEqual(backlinksFor(null, 'Z.md'), []);
});
