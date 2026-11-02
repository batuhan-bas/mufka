import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekDays, weekSummary, addWeekTask, editWeekTask, moveWeekTask, moveOpenToNextDay, nextWeekTodoText } from '../lib/weekly.mjs';

const NOTE = `---
type: weekly-todo
week: 2026-W45
---
\`\`\`week
\`\`\`

## Monday
- [x] Plan the week
- [ ] Call the bank

## Tuesday
Gym day.

## Wednesday
- [ ] Send the invoice

## Notes
- [ ] not a day
`;

test('weekDays reads each day and its tasks, not other sections', () => {
  const d = weekDays(NOTE);
  assert.deepEqual(d.map((x) => x.day), [0, 1, 2]);
  assert.deepEqual(d[0].tasks, [{ line: 8, done: true, text: 'Plan the week' }, { line: 9, done: false, text: 'Call the bank' }]);
  assert.equal(d[1].tasks.length, 0);
  assert.equal(d[2].end, 15);
  assert.deepEqual(weekDays('## Pazartesi\n- [ ] a\n## Salı · 3 Kasım\n- [ ] b').map((x) => [x.day, x.tasks.length]), [[0, 1], [1, 1]]);
});

test('weekSummary counts', () => {
  const s = weekSummary(NOTE);
  assert.deepEqual([s.total, s.done, s.open], [3, 1, 2]);
});

test('addWeekTask: after the last task, or under the heading and its note', () => {
  assert.equal(addWeekTask(NOTE, 0, ' Buy  milk ').split('\n')[10], '- [ ] Buy milk');
  const tue = addWeekTask(NOTE, 1, 'Gym').split('\n');
  assert.deepEqual(tue.slice(11, 14), ['## Tuesday', 'Gym day.', '- [ ] Gym']);
  assert.equal(addWeekTask(NOTE, 4, 'x'), NOTE); // no Friday
  assert.equal(addWeekTask(NOTE, 0, '  '), NOTE);
});

test('editWeekTask changes the words, keeps the box; empty deletes', () => {
  assert.equal(editWeekTask(NOTE, 8, 'Plan it').split('\n')[8], '- [x] Plan it');
  assert.equal(weekSummary(editWeekTask(NOTE, 9, '')).total, 2);
});

test('moveWeekTask and moveOpenToNextDay', () => {
  const moved = moveWeekTask(NOTE, 9, 2);
  const d = weekDays(moved);
  assert.deepEqual(d[2].tasks.map((t) => t.text), ['Send the invoice', 'Call the bank']);
  assert.equal(d[0].tasks.length, 1);
  const two = addWeekTask(NOTE, 0, 'Second open');
  const next = weekDays(moveOpenToNextDay(two, 0));
  assert.deepEqual(next[0].tasks.map((t) => t.text), ['Plan the week']);
  assert.deepEqual(next[1].tasks.map((t) => t.text), ['Call the bank', 'Second open']);
});

test('nextWeekTodoText: same days, open tasks carried to Monday', () => {
  const out = nextWeekTodoText(NOTE, '2026-W46');
  assert.match(out, /^week: 2026-W46$/m);
  const d = weekDays(out);
  assert.deepEqual(d[0].tasks.map((t) => t.text), ['Call the bank', 'Send the invoice']);
  assert.equal(d[2].tasks.length, 0);
  assert.match(out, /## Tuesday\nGym day\./);
  assert.equal(weekSummary(nextWeekTodoText(NOTE, '2026-W46', { carry: false })).total, 0);
});

test('the review starts empty next week', () => {
  const note = `${NOTE}\n## Review\n- **What went well:** shipped it\n- **What to change:**\n`;
  const out = nextWeekTodoText(note, '2026-W46');
  assert.match(out, /- \*\*What went well:\*\*\n- \*\*What to change:\*\*\n/);
});
