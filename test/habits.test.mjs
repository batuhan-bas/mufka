import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayIndex, isDone, habitTable, habitSummary, toggleHabit, addHabit, weekMonday, shiftWeek, habitWeek, nextWeekText } from '../lib/habits.mjs';

const NOTE = `---
type: habits
week: 2026-W44
---
\`\`\`habits
\`\`\`

## This week
| Habit | Goal | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| 💧 Water | 7 | x | x | x |  |  |  |  |
| 🏃 Move | 3 | x |  | ✓ | - |  |  |  |
|  |  |  |  |  |  |  |  |  |

## Notes
| a | b |
|---|---|
`;

test('day names in English and Turkish', () => {
  assert.equal(dayIndex('Mon'), 0);
  assert.equal(dayIndex('Sunday'), 6);
  assert.equal(dayIndex('Çar'), 2);
  assert.equal(dayIndex('Cumartesi'), 5);
  assert.equal(dayIndex('Goal'), -1);
});

test('isDone: anything but empty, dash, no or a cross', () => {
  for (const v of ['x', 'X', '✓', '✅', '1', 'yes']) assert.ok(isDone(v), v);
  for (const v of ['', ' ', '-', '0', 'no', '✗']) assert.ok(!isDone(v), v);
});

test('habitTable finds the table with the day columns', () => {
  const t = habitTable(NOTE);
  assert.equal(t.start, 8);
  assert.equal(t.nameCol, 0);
  assert.equal(t.goalCol, 1);
  assert.deepEqual(t.dayCols, [2, 3, 4, 5, 6, 7, 8]);
  assert.equal(t.rows.length, 2);
  assert.deepEqual(t.rows[1].days, [true, false, true, false, false, false, false]);
  assert.deepEqual(t.blank, [12]);
  assert.equal(habitTable('| a | b |\n|---|---|\n| 1 | 2 |'), null);
});

test('habitSummary: done against goals, today, perfect days', () => {
  const s = habitSummary(NOTE, 2);
  assert.deepEqual(s.habits.map((h) => [h.name, h.done, h.goal, h.met]), [['💧 Water', 3, 7, false], ['🏃 Move', 2, 3, false]]);
  assert.equal(s.done, 5);
  assert.equal(s.goal, 10);
  assert.equal(s.todayDone, 2);
  assert.equal(s.todayCount, 2);
  assert.equal(s.perfectDays, 2); // Monday and Wednesday
  assert.equal(habitSummary(NOTE).todayCount, 0);
});

test('toggleHabit ticks and unticks one cell', () => {
  const on = toggleHabit(NOTE, 10, 3);
  assert.equal(on.split('\n')[10], '| 💧 Water | 7 | x | x | x | x |  |  |  |');
  const off = toggleHabit(on, 10, 0);
  assert.equal(off.split('\n')[10], '| 💧 Water | 7 |  | x | x | x |  |  |  |');
  assert.equal(toggleHabit(NOTE, 3, 0), NOTE); // not a habit row
});

test('addHabit fills the empty row, or adds a table', () => {
  const out = addHabit(NOTE, { name: '📖 Read', goal: 5 });
  assert.equal(out.split('\n')[12], '| 📖 Read | 5 |  |  |  |  |  |  |  |');
  assert.equal(habitTable(out).rows.length, 3);
  const fresh = addHabit('# Week\n', { name: 'Walk', goal: 4 });
  assert.equal(habitTable(fresh).rows[0].goal, 4);
});

test('weeks: Monday, shifting, reading and the next one', () => {
  const m = weekMonday('2026-W44');
  assert.deepEqual([m.getFullYear(), m.getMonth(), m.getDate()], [2026, 9, 26]);
  assert.equal(shiftWeek('2026-W53', 1), '2027-W01');
  assert.equal(shiftWeek('2026-W01', -1), '2025-W52');
  assert.equal(habitWeek([{ key: 'week', value: '2026-W44' }], ''), '2026-W44');
  assert.equal(habitWeek([], '2026 Week 9 habits'), '2026-W09');
  const next = nextWeekText(NOTE, '2026-W45');
  assert.match(next, /^week: 2026-W45$/m);
  assert.equal(habitSummary(next).done, 0);
  assert.match(next, /\| 🏃 Move \| 3 \|/);
});
