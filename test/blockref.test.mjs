import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockChoices, findBlock, ensureBlockId, stripBlockIds, idOfLine } from '../lib/blockref.mjs';
import { embedSection } from '../lib/embed.mjs';

const note = `---
tags: [trip]
---
# Trip

## Flights

- Out: 12 May ^out
- Back: 17 May
  - Seat 14A

## The flat

Rua das Flores 28,
keys with Ana. ^flat

| a | b |
|---|---|
| 1 | 2 |

^table

> Bring the adapter.

\`\`\`
code ^notanid
\`\`\`
`;

test('the blocks a note offers', () => {
  const c = blockChoices(note);
  assert.deepEqual(c.map((x) => [x.kind, x.text, x.heading, x.id]), [
    ['item', 'Out: 12 May', 'Flights', 'out'],
    ['item', 'Back: 17 May', 'Flights', null],
    ['item', 'Seat 14A', 'Flights', null],
    ['paragraph', 'Rua das Flores 28, keys with Ana.', 'The flat', 'flat'],
    ['quote', 'Bring the adapter.', 'The flat', null],
  ]);
  assert.equal(idOfLine('text ^a-1 '), 'a-1');
  assert.equal(idOfLine('x^a'), null);
});

test('finding a block by id', () => {
  assert.deepEqual(findBlock(note, 'flat'), { start: 13, end: 14, line: 14, text: 'Rua das Flores 28,\nkeys with Ana.' });
  assert.equal(findBlock(note, '^out').text, '- Out: 12 May');
  assert.equal(findBlock(note, 'table').text, '| a | b |\n|---|---|\n| 1 | 2 |');
  assert.equal(findBlock(note, 'nope'), null);
  assert.equal(embedSection(note, '^flat'), 'Rua das Flores 28,\nkeys with Ana.');
  assert.equal(embedSection(note, '^nope'), null);
});

test('adding an id when there is none; ids are hidden from text', () => {
  const seat = blockChoices(note).find((x) => x.text === 'Seat 14A');
  let n = 0;
  const r = ensureBlockId(note, seat, () => [0.5, 0.1, 0.2, 0.3, 0.4, 0.6][n++ % 6]);
  assert.match(r.id, /^[a-z0-9]{6}$/);
  assert.ok(r.content.includes(`  - Seat 14A ^${r.id}\n`));
  assert.equal(findBlock(r.content, r.id).text, '- Seat 14A');
  const flat = blockChoices(note).find((x) => x.id === 'flat');
  assert.deepEqual(ensureBlockId(note, flat), { content: note, id: 'flat' });
  assert.equal(stripBlockIds('a ^x\n^y\nb'), 'a\nb');
});

test('typing [[Note#^ asks for a block', async () => {
  const { detectTrigger, applySuggestion } = await import('../lib/suggest.mjs');
  const v = 'See [[Trip#^fl';
  const t = detectTrigger(v, v.length);
  assert.deepEqual(t, { kind: 'block', note: 'Trip', query: 'fl', start: 4 });
  assert.equal(detectTrigger('[[Trip#Flights', 14), null);
  assert.deepEqual(applySuggestion(`${v}]] ok`, v.length, t, '[[Trip#^flat]]'), { value: 'See [[Trip#^flat]] ok', caret: 18 });
});
