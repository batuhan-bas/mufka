import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isExternalChange } from '../lib/watch.mjs';

const root = '/v';
const now = 10_000;

test('changes by other apps are reported', () => {
  assert.equal(isExternalChange(root, 'Proje/Plan.md', new Map(), now, 1500), true);
  assert.equal(isExternalChange(root, '', new Map(), now, 1500), true, 'unknown file: refresh to be safe');
});

test('dot folders, dot files and our .tmp files are ignored', () => {
  for (const rel of ['.obsidian/workspace.json', '.git/index', 'Proje/.DS_Store', '.trash/x.md', 'Not.md.tmp']) {
    assert.equal(isExternalChange(root, rel, new Map(), now, 1500), false, rel);
  }
});

test("Mufka's own recent writes are ignored, older ones are not", () => {
  const own = new Map([['/v/Not.md', now - 200], ['/v/Eski.md', now - 5000]]);
  assert.equal(isExternalChange(root, 'Not.md', own, now, 1500), false);
  assert.equal(isExternalChange(root, 'Eski.md', own, now, 1500), true);
});
