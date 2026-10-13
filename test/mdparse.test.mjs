import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, frontmatterRows } from '../lib/mdparse.mjs';

test('parseMarkdown understands GFM and frontmatter', () => {
  const types = parseMarkdown('---\na: 1\n---\n\n| x |\n| - |\n| 1 |\n\n- [ ] t').children.map((n) => n.type);
  assert.deepEqual(types, ['yaml', 'table', 'list']);
});

test('frontmatterRows: scalars, quotes, inline and block lists, comments', () => {
  assert.deepEqual(frontmatterRows('title: "Bir: başlık"\n# yorum\ntags: [a, \'b\']\nlist:\n  - x\n  - y\nempty:'), [
    { key: 'title', value: 'Bir: başlık' },
    { key: 'tags', value: 'a, b' },
    { key: 'list', value: 'x, y' },
    { key: 'empty', value: '' },
  ]);
});

test('frontmatterRows returns null for data it does not understand', () => {
  assert.equal(frontmatterRows('{ a: 1 }'), null);
  assert.equal(frontmatterRows('- orphan item'), null);
  assert.equal(frontmatterRows('key:value-without-space'), null);
});
