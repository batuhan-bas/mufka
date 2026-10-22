import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isBoard, parseBoard, serializeBoard, newBoard, parseCard, composeCard, urlLabel,
  addCard, updateCard, removeCard, moveCard, addColumn, renameColumn, removeColumn, moveColumn,
  setCompleteColumn, cardMatches, boardTags, DEFAULT_COLUMNS,
  isDefaultColumn, missingDefaults, addDefaultColumn,
} from '../lib/kanban.mjs';

// What Obsidian's Kanban plugin writes.
const OBSIDIAN = `---

kanban-plugin: board

---

## To do

- [ ] Write the docs #chore
- [ ] Fix the menu #bug !P1 @{2026-10-30}
	It does not open on Windows.
	- [x] reproduce
	- [ ] fix


## Done

**Complete**
- [x] Ship 1.5.2 #feature


***

## Archive

- [x] Old card

%% kanban:settings
\`\`\`
{"kanban-plugin":"board","list-collapse":[false,false]}
\`\`\`
%%`;

test('isBoard: only notes whose front matter says kanban-plugin', () => {
  assert.equal(isBoard(OBSIDIAN), true);
  assert.equal(isBoard('---\nkanban-plugin: basic\n---\n'), true);
  assert.equal(isBoard('# Note\n\nkanban-plugin: board'), false);
  assert.equal(isBoard('---\ntags: x\n---\n'), false);
  assert.equal(isBoard(''), false);
});

test('parseBoard reads columns, cards, bodies and the complete column', () => {
  const b = parseBoard(OBSIDIAN);
  assert.deepEqual(b.columns.map((c) => c.title), ['To do', 'Done']);
  assert.equal(b.columns[0].cards.length, 2);
  assert.equal(b.columns[0].cards[1].text, 'Fix the menu #bug !P1 @{2026-10-30}\nIt does not open on Windows.\n- [x] reproduce\n- [ ] fix');
  assert.equal(b.columns[1].complete, true);
  assert.equal(b.columns[0].complete, false);
  assert.equal(b.columns[1].cards[0].checked, true);
  assert.match(b.tail, /^\*\*\*\n\n## Archive/);
  assert.match(b.tail, /kanban:settings/);
});

test('serializeBoard round-trips an Obsidian board without losing anything', () => {
  const once = serializeBoard(parseBoard(OBSIDIAN));
  const twice = serializeBoard(parseBoard(once));
  assert.equal(twice, once);
  const b = parseBoard(once);
  assert.deepEqual(b, parseBoard(OBSIDIAN));
  assert.match(once, /## Archive\n\n- \[x\] Old card/);
  assert.match(once, /\t- \[x\] reproduce/);
});

test('blank lines inside a card body survive', () => {
  const b = addCard(newBoard(), 0, 'Title\nfirst paragraph\n\nsecond paragraph');
  const back = parseBoard(serializeBoard(b));
  assert.equal(back.columns[0].cards[0].text, 'Title\nfirst paragraph\n\nsecond paragraph');
  assert.equal(back.columns[1].cards.length, 0);
});

test('a new board has the default columns, the last one complete, and is a board', () => {
  const b = newBoard();
  assert.deepEqual(b.columns.map((c) => c.title), DEFAULT_COLUMNS);
  assert.deepEqual(b.columns.map((c) => c.complete), [false, false, false, true]);
  const text = serializeBoard(b);
  assert.equal(isBoard(text), true);
  assert.match(text, /## Done\n\n\*\*Complete\*\*/);
  assert.deepEqual(parseBoard(text).columns.map((c) => c.title), DEFAULT_COLUMNS);
});

test('text outside any card is kept: text before the columns, loose lines', () => {
  const b = parseBoard('---\nkanban-plugin: board\n---\nIntro line\n\n## A\n\nloose text\n');
  assert.equal(b.preamble, 'Intro line');
  assert.equal(b.columns[0].cards[0].text, 'loose text');
  assert.match(serializeBoard(b), /Intro line\n\n## A/);
});

test('cards without a checkbox and with Windows line endings', () => {
  const b = parseBoard('---\r\nkanban-plugin: board\r\n---\r\n## A\r\n\r\n- plain\r\n- [X] done\r\n');
  assert.deepEqual(b.columns[0].cards, [{ checked: false, text: 'plain' }, { checked: true, text: 'done' }]);
});

test('parseCard pulls out title, type, priority, due, link, tags and sub-tasks', () => {
  const c = parseCard('Fix the menu #bug #ui !p1 @{2026-10-30} https://github.com/a/b/issues/12\nWhy\n- [x] one\n- [ ] two\n  - [x] nested');
  assert.equal(c.title, 'Fix the menu');
  assert.equal(c.type, 'bug');
  assert.equal(c.priority, 'P1');
  assert.equal(c.due, '2026-10-30');
  assert.equal(c.url, 'https://github.com/a/b/issues/12');
  assert.deepEqual(c.tags, ['ui']);
  assert.equal(c.body, 'Why\n- [x] one\n- [ ] two\n  - [x] nested');
  assert.deepEqual(c.subtasks, { done: 2, total: 3 });
});

test('parseCard: plain text and [[links]] stay in the title', () => {
  const c = parseCard('See [[Roadmap]] and C# notes');
  assert.equal(c.title, 'See [[Roadmap]] and C# notes');
  assert.equal(c.type, null);
  assert.deepEqual(c.tags, []);
  assert.deepEqual(c.subtasks, { done: 0, total: 0 });
});

test('composeCard writes markers in a fixed order and parseCard reads them back', () => {
  const fields = { title: 'Store  package', type: 'chore', priority: 'P2', due: '2026-11-01', url: 'https://x.dev/a', tags: ['#windows', 'release'], body: '\nMSIX\n- [ ] appx\n' };
  const text = composeCard(fields);
  assert.equal(text, 'Store package #chore #windows #release !P2 @{2026-11-01} https://x.dev/a\nMSIX\n- [ ] appx');
  const back = parseCard(text);
  assert.equal(back.title, 'Store package');
  assert.equal(back.type, 'chore');
  assert.deepEqual(back.tags, ['windows', 'release']);
  assert.equal(back.priority, 'P2');
  assert.equal(back.due, '2026-11-01');
  assert.equal(back.body, 'MSIX\n- [ ] appx');
  assert.equal(composeCard({ title: 'Only' }), 'Only');
});

test('urlLabel: GitHub issues and PRs as #n, else the host', () => {
  assert.equal(urlLabel('https://github.com/batuhan-bas/mufka/pull/6'), '#6');
  assert.equal(urlLabel('https://github.com/a/b/issues/12'), '#12');
  assert.equal(urlLabel('https://www.figma.com/file/x'), 'figma.com');
  assert.equal(urlLabel('not a url'), 'not a url');
});

test('addCard, updateCard and removeCard do not touch the input board', () => {
  const b0 = newBoard();
  const b1 = addCard(b0, 0, 'A');
  const b2 = addCard(b1, 0, 'B', { top: true });
  assert.equal(b0.columns[0].cards.length, 0);
  assert.deepEqual(b2.columns[0].cards.map((c) => c.text), ['B', 'A']);
  assert.equal(addCard(b0, 0, '   ').columns[0].cards.length, 0);
  assert.equal(addCard(b0, 3, 'Done one').columns[3].cards[0].checked, true);
  assert.equal(updateCard(b2, 0, 1, 'A2').columns[0].cards[1].text, 'A2');
  assert.deepEqual(removeCard(b2, 0, 0).columns[0].cards.map((c) => c.text), ['A']);
});

test('moveCard: between columns, within a column, and checking in the complete column', () => {
  let b = newBoard();
  for (const t of ['a', 'b', 'c']) b = addCard(b, 0, t);
  const moved = moveCard(b, { col: 0, card: 0 }, { col: 0, card: 3 });
  assert.deepEqual(moved.columns[0].cards.map((c) => c.text), ['b', 'c', 'a']);
  const up = moveCard(b, { col: 0, card: 2 }, { col: 0, card: 0 });
  assert.deepEqual(up.columns[0].cards.map((c) => c.text), ['c', 'a', 'b']);
  const done = moveCard(b, { col: 0, card: 1 }, { col: 3, card: 0 });
  assert.equal(done.columns[3].cards[0].text, 'b');
  assert.equal(done.columns[3].cards[0].checked, true);
  const back = moveCard(done, { col: 3, card: 0 }, { col: 1, card: 0 });
  assert.equal(back.columns[1].cards[0].checked, false);
  assert.deepEqual(moveCard(b, { col: 0, card: 9 }, { col: 1, card: 0 }), b);
});

test('columns: add, rename, move, remove (cards go to the column before)', () => {
  let b = addCard(newBoard(), 2, 'testing');
  b = addColumn(b, 'Review', 2);
  assert.deepEqual(b.columns.map((c) => c.title), ['To do', 'In progress', 'Review', 'Test', 'Done']);
  b = renameColumn(b, 2, '  Code review ');
  assert.equal(b.columns[2].title, 'Code review');
  assert.equal(renameColumn(b, 2, ' ').columns[2].title, 'Code review');
  assert.equal(renameColumn(b, 0, 'Backlog').columns[0].title, 'To do', 'default columns keep their names');
  b = moveColumn(b, 2, 0);
  assert.deepEqual(b.columns.map((c) => c.title), ['Code review', 'To do', 'In progress', 'Test', 'Done']);
  b = removeColumn(b, 3);
  assert.deepEqual(b.columns.map((c) => c.title), ['Code review', 'To do', 'In progress', 'Done']);
  assert.deepEqual(b.columns[2].cards.map((c) => c.text), ['testing']);
  const one = { ...newBoard(['Only']) };
  assert.equal(removeColumn(one, 0).columns.length, 1);
});

test('setCompleteColumn moves the done mark and checks its cards', () => {
  let b = addCard(addCard(newBoard(), 2, 'in test'), 3, 'shipped');
  b = setCompleteColumn(b, 2);
  assert.deepEqual(b.columns.map((c) => c.complete), [false, false, true, false]);
  assert.equal(b.columns[2].cards[0].checked, true);
  assert.equal(b.columns[3].cards[0].checked, false);
  b = setCompleteColumn(b, 2, false);
  assert.deepEqual(b.columns.map((c) => c.complete), [false, false, false, false]);
});

test('cardMatches and boardTags drive the filter', () => {
  const text = 'Fix #bug #ui !P1';
  assert.equal(cardMatches(text, {}), true);
  assert.equal(cardMatches(text, { type: 'bug' }), true);
  assert.equal(cardMatches(text, { type: 'feature' }), false);
  assert.equal(cardMatches(text, { priority: 'P1', tag: 'UI' }), true);
  assert.equal(cardMatches(text, { text: 'fix' }), true);
  assert.equal(cardMatches(text, { text: 'nope' }), false);
  const b = addCard(addCard(newBoard(), 0, 'a #ui #web'), 1, 'b #api #feature');
  assert.deepEqual(boardTags(b), ['api', 'ui', 'web']);
});

test('default columns: known by name, removed and put back in their place', () => {
  assert.equal(isDefaultColumn(' in Progress '), true);
  assert.equal(isDefaultColumn('Review'), false);
  let b = addColumn(newBoard(), 'Review', 2);
  b = removeColumn(removeColumn(b, b.columns.findIndex((c) => c.title === 'Test')), b.columns.length - 2);
  assert.deepEqual(b.columns.map((c) => c.title), ['To do', 'In progress', 'Review']);
  assert.deepEqual(missingDefaults(b), ['Test', 'Done']);
  b = addDefaultColumn(b, 'Done');
  assert.deepEqual(b.columns.map((c) => c.title), ['To do', 'In progress', 'Review', 'Done']);
  assert.equal(b.columns[3].complete, true);
  b = addDefaultColumn(b, 'Test');
  assert.deepEqual(b.columns.map((c) => c.title), ['To do', 'In progress', 'Review', 'Test', 'Done']);
  b = removeColumn(b, 0);
  b = addDefaultColumn(b, 'To do');
  assert.equal(b.columns[0].title, 'To do');
  assert.deepEqual(missingDefaults(b), []);
  assert.deepEqual(addDefaultColumn(b, 'Done'), b, 'an existing default is not added twice');
});
