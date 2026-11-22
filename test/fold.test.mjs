import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBlocks, blockText } from '../lib/blocks.mjs';
import { headingOf, foldPlan, headingFor, foldsHiding } from '../lib/fold.mjs';

const src = `# Trip

Five days.

## Flights

- Out
- Back

## The flat

Address.

### Keys

At the cafe.

## To see

Belém.

## To see

Again.
`;
const blocks = parseBlocks(src);
const plan = (keys) => foldPlan(blocks, (b) => blockText(src, b), new Set(keys));
const shown = (p) => blocks.filter((b) => !p.hidden.has(b.start)).map((b) => blockText(src, b).split('\n')[0]);

test('reading headings', () => {
  assert.deepEqual(headingOf('## Flights'), { level: 2, text: 'Flights' });
  assert.deepEqual(headingOf('### Closed ###'), { level: 3, text: 'Closed' });
  assert.deepEqual(headingOf('Title\n====='), { level: 1, text: 'Title' });
  assert.equal(headingOf('Just text'), null);
});

test('a fold hides its section, down to the next heading as high', () => {
  assert.deepEqual(shown(plan([])).length, blocks.length);
  assert.deepEqual(shown(plan(['The flat'])), ['# Trip', 'Five days.', '## Flights', '- Out', '## The flat', '## To see', 'Belém.', '## To see', 'Again.']);
  const p = plan(['The flat']);
  assert.equal(p.heads.find((h) => h.key === 'The flat').hidden, 3);
  // The top heading holds everything.
  assert.deepEqual(shown(plan(['Trip'])), ['# Trip']);
  // The same text twice: each has its own key.
  assert.deepEqual(plan([]).heads.map((h) => h.key), ['Trip', 'Flights', 'The flat', 'Keys', 'To see', 'To see#2']);
  assert.deepEqual(shown(plan(['To see#2'])).slice(-2), ['Belém.', '## To see']);
  // A heading with nothing under it does not fold.
  assert.equal(foldPlan(parseBlocks('## A\n## B\n'), (b) => blockText('## A\n## B\n', b), new Set(['A'])).hidden.size, 0);
});

test('finding the heading of a block and what hides it', () => {
  const p = plan(['Trip', 'The flat']);
  const keysIdx = blocks.findIndex((b) => blockText(src, b) === 'At the cafe.');
  assert.equal(headingFor(p, keysIdx).text, 'Keys');
  assert.equal(headingFor(p, 0).text, 'Trip');
  assert.deepEqual(foldsHiding(p, keysIdx), ['Trip', 'The flat']);
  assert.deepEqual(foldsHiding(p, 0), []);
});
