import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBlocks, blockText, replaceBlockText, insertBlockAfter } from '../lib/blocks.mjs';

const MIXED = [
  '# Başlık',            // 0 heading
  '',                    // 1
  'Bir paragraf ilk',    // 2 paragraph (2-3)
  'satır devam',         // 3
  '',                    // 4
  '- [ ] görev',         // 5 list (5-6)
  '- madde',             // 6
  '',                    // 7
  '> alıntı bir',        // 8 quote (8-9)
  '> alıntı iki',        // 9
  '',                    // 10
  '```',                 // 11 code (11-13)
  'kod [[x]]',           // 12
  '```',                 // 13
  '',                    // 14
  '---',                 // 15 rule
  '',                    // 16
  '![r](Ekler/a.png)',   // 17 image
].join('\n');

test('parseBlocks finds every block type with line ranges', () => {
  const b = parseBlocks(MIXED);
  assert.deepEqual(b, [
    { type: 'heading', start: 0, end: 0 },
    { type: 'paragraph', start: 2, end: 3 },
    { type: 'list', start: 5, end: 6 },
    { type: 'quote', start: 8, end: 9 },
    { type: 'code', start: 11, end: 13 },
    { type: 'rule', start: 15, end: 15 },
    { type: 'image', start: 17, end: 17 },
  ]);
});

test('blockText extracts exact source of each block', () => {
  const b = parseBlocks(MIXED);
  assert.equal(blockText(MIXED, b[1]), 'Bir paragraf ilk\nsatır devam');
  assert.equal(blockText(MIXED, b[4]), '```\nkod [[x]]\n```');
});

test('replaceBlockText with the same text is byte-identical (round-trip)', () => {
  const b = parseBlocks(MIXED);
  for (const blk of b) {
    assert.equal(replaceBlockText(MIXED, blk, blockText(MIXED, blk)), MIXED);
  }
});

test('leading/trailing blank lines are preserved on round-trip', () => {
  const src = '\n\n# H\n\nson\n';
  const b = parseBlocks(src);
  for (const blk of b) assert.equal(replaceBlockText(src, blk, blockText(src, blk)), src);
});

test('re-parse after an edit that splits a paragraph into two blocks', () => {
  const src = 'bir satır\nikinci';
  const [p] = parseBlocks(src);
  const edited = replaceBlockText(src, p, 'bir satır\n\n# Yeni başlık'); // blank splits it
  const b2 = parseBlocks(edited);
  assert.deepEqual(b2.map((x) => x.type), ['paragraph', 'heading']);
  assert.equal(blockText(edited, b2[1]), '# Yeni başlık');
});

test('re-parse after a merge (two paragraphs joined)', () => {
  const src = 'A\n\nB';
  const b = parseBlocks(src);
  assert.equal(b.length, 2);
  const merged = replaceBlockText(src, b[1], ''); // blank out second -> gap
  // After removing B, only A remains plus trailing blanks.
  assert.deepEqual(parseBlocks(merged).map((x) => x.type), ['paragraph']);
});

test('insertBlockAfter adds a separated block and reports its start', () => {
  const src = '# H\n\npara';
  const b = parseBlocks(src);
  const { src: s2, start } = insertBlockAfter(src, b[0], 'yeni');
  const b2 = parseBlocks(s2);
  const inserted = b2.find((x) => x.start === start);
  assert.ok(inserted);
  assert.equal(blockText(s2, inserted), 'yeni');
});

test('empty source yields no blocks', () => {
  assert.deepEqual(parseBlocks(''), []);
  assert.deepEqual(parseBlocks(null), []);
});

test('a table, a nested list and the frontmatter are each one block', () => {
  const src = [
    '---', 'tags: [a]', '---', '',            // 0-2 frontmatter
    '- bir', '  - iki', '    - üç', '',         // 4-6 list
    '| a | b |', '| - | - |', '| 1 | 2 |',      // 8-10 table
  ].join('\n');
  assert.deepEqual(parseBlocks(src), [
    { type: 'frontmatter', start: 0, end: 2 },
    { type: 'list', start: 4, end: 6 },
    { type: 'table', start: 8, end: 10 },
  ]);
  for (const blk of parseBlocks(src)) assert.equal(replaceBlockText(src, blk, blockText(src, blk)), src);
});

test('addBlock keeps the new block apart from its neighbours', async () => {
  const { addBlock } = await import('../lib/blocks.mjs');
  assert.deepEqual(addBlock('', null, '![i](a.png)'), { src: '![i](a.png)', start: 0 });
  assert.deepEqual(addBlock('a\n\nb\n', null, 'X'), { src: 'a\n\nb\n\nX', start: 4 });
  assert.deepEqual(addBlock('a\n\nb', 0, 'X'), { src: 'a\n\nX\n\nb', start: 2 });
  assert.deepEqual(addBlock('# H\ntext', 0, 'X'), { src: '# H\n\nX\n\ntext', start: 2 });
  assert.deepEqual(addBlock('a\n\nb', -1, 'X'), { src: 'X\n\na\n\nb', start: 0 });
  assert.equal(addBlock('a', 99, 'X').src, 'a\n\nX', 'unknown block: at the end');
});
