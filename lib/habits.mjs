// A habit tracker note: one week as a Markdown table, a habit per row and a
// column per day, "x" on the days it was done; a ```habits block shows how
// the week is going. Pure, on the note's text; drawn by src/habits-view.js.
//
// | Habit    | Goal | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
// |----------|-----:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
// | 💧 Water |    7 |  x  |  x  |     |     |     |     |     |
//
// In Obsidian it stays that table.
import { tableCells, findTables, tableRow, escapeCell } from './mdtable.mjs';
import { dateOfIsoWeek, weekKey, addDays } from './dates.mjs';

const DAY_NAMES = [
  ['mon', 'monday', 'mo', 'pzt', 'pts', 'pazartesi'],
  ['tue', 'tuesday', 'tu', 'sal', 'salı', 'sali'],
  ['wed', 'wednesday', 'we', 'çar', 'çarşamba', 'car', 'carsamba'],
  ['thu', 'thursday', 'th', 'per', 'perşembe', 'persembe'],
  ['fri', 'friday', 'fr', 'cum', 'cuma'],
  ['sat', 'saturday', 'sa', 'cmt', 'cts', 'cumartesi'],
  ['sun', 'sunday', 'su', 'paz', 'pazar'],
];
const GOAL = /^(goal|target|hedef)$/i;
const NOT_DONE = new Set(['', '-', '–', '—', '0', 'no', '✗', '❌', '×', '[ ]']);

// Which day of the week (Mon = 0) a header cell names, or -1.
export function dayIndex(cell) {
  const c = String(cell || '').trim().toLowerCase().replace(/\.$/, '');
  return DAY_NAMES.findIndex((names) => names.includes(c));
}

export const isDone = (cell) => !NOT_DONE.has(String(cell == null ? '' : cell).trim().toLowerCase());

// The habit table: the first one with at least five day columns.
//   null, or { start, end, header, nameCol, goalCol, dayCols: [col per Mon..Sun or -1],
//     rows: [{ line, name, goal, days: [true/false/null per Mon..Sun] }], blank: [lines] }
export function habitTable(src) {
  const lines = String(src == null ? '' : src).split('\n');
  for (const tab of findTables(src)) {
    const header = tableCells(lines[tab.start]);
    const dayCols = [-1, -1, -1, -1, -1, -1, -1];
    header.forEach((c, k) => { const d = dayIndex(c); if (d !== -1 && dayCols[d] === -1) dayCols[d] = k; });
    if (dayCols.filter((k) => k !== -1).length < 5) continue;
    const goalCol = header.findIndex((c) => GOAL.test(c));
    const nameCol = header.findIndex((_, k) => k !== goalCol && !dayCols.includes(k));
    const rows = []; const blank = [];
    for (let r = tab.start + 2; r <= tab.end; r++) {
      const c = tableCells(lines[r]);
      if (c.every((x) => !x)) { blank.push(r); continue; }
      const days = dayCols.map((k) => (k === -1 ? null : isDone(c[k])));
      const g = goalCol === -1 ? NaN : parseInt(c[goalCol], 10);
      const open = days.filter((d) => d !== null).length;
      rows.push({ line: r, name: nameCol === -1 ? '' : (c[nameCol] || ''), goal: Number.isFinite(g) && g > 0 ? Math.min(g, open) : open, days });
    }
    return { start: tab.start, end: tab.end, header, nameCol, goalCol, dayCols, rows, blank };
  }
  return null;
}

// How the week is going. today: Mon = 0 … Sun = 6, or -1 when the note is
// not this week.
//   { habits: [{ name, done, goal, met }], done, goal, share, todayDone, todayCount, perfectDays }
export function habitSummary(src, today = -1) {
  const t = habitTable(src);
  const habits = (t ? t.rows : []).map((r) => {
    const done = r.days.filter(Boolean).length;
    return { name: r.name, done, goal: r.goal, met: done >= r.goal && r.goal > 0, days: r.days };
  });
  const goal = habits.reduce((s, h) => s + h.goal, 0);
  const done = habits.reduce((s, h) => s + Math.min(h.done, h.goal), 0);
  const perfectDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => habits.length && habits.every((h) => h.days[d])).length;
  const todayDone = today >= 0 ? habits.filter((h) => h.days[today]).length : 0;
  return { habits, done, goal, share: goal ? done / goal : 0, todayDone, todayCount: today >= 0 ? habits.length : 0, perfectDays, table: t };
}

// Tick or untick one day of one habit; returns the new text.
export function toggleHabit(src, line, day) {
  const text = String(src == null ? '' : src);
  const t = habitTable(text);
  if (!t || t.dayCols[day] === -1 || !t.rows.some((r) => r.line === line)) return text;
  const lines = text.split('\n');
  const c = tableCells(lines[line]);
  while (c.length < t.header.length) c.push('');
  const k = t.dayCols[day];
  c[k] = isDone(c[k]) ? '' : 'x';
  lines[line] = tableRow(c);
  return lines.join('\n');
}

// A new habit as a row; goal: days a week (empty when there is no goal column).
export function addHabit(src, { name, goal }) {
  const text = String(src == null ? '' : src);
  const t = habitTable(text);
  const lines = text.split('\n');
  if (!t) {
    const head = ['| Habit | Goal | Mon | Tue | Wed | Thu | Fri | Sat | Sun |', '|---|---:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|', `| ${escapeCell(name)} | ${goal || 7} |  |  |  |  |  |  |  |`];
    const tail = text.replace(/\s+$/, '');
    return `${tail}${tail ? '\n\n' : ''}${head.join('\n')}\n`;
  }
  const row = t.header.map((_, k) => (k === t.nameCol ? escapeCell(name) : k === t.goalCol ? String(goal || 7) : ''));
  const last = t.rows.length ? t.rows[t.rows.length - 1].line : t.start + 1;
  const free = t.blank.find((r) => r > last);
  if (free != null) lines[free] = tableRow(row);
  else lines.splice(t.end + 1, 0, tableRow(row));
  return lines.join('\n');
}

// "2026-W44" → the Monday it starts, and the week some weeks later.
export function weekMonday(week) {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(String(week || ''));
  return m ? dateOfIsoWeek(Number(m[1]), Number(m[2])) : null;
}
export function shiftWeek(week, delta) {
  const m = weekMonday(week);
  return m ? weekKey(addDays(m, delta * 7)) : null;
}

// The week a habit note is for: its week property, or "2026 Week 44" /
// "2026-W44" in its name.
export function habitWeek(props, title) {
  const p = (props || []).find((x) => String(x.key).toLowerCase() === 'week');
  const v = p ? String(p.value).trim() : '';
  const m = /^(\d{4})-W(\d{1,2})$/.exec(v) || /(\d{4})(?:-W| Week )(\d{1,2})\b/.exec(String(title || ''));
  return m ? `${m[1]}-W${String(Number(m[2])).padStart(2, '0')}` : null;
}

// Next week's note from this one: the same habits and goals, no ticks.
export function nextWeekText(src, week) {
  const text = String(src == null ? '' : src);
  const t = habitTable(text);
  const lines = text.split('\n');
  if (t) {
    for (const r of t.rows) {
      const c = tableCells(lines[r.line]);
      for (const k of t.dayCols) if (k !== -1 && k < c.length) c[k] = '';
      lines[r.line] = tableRow(c);
    }
  }
  return lines.join('\n').replace(/^(---\n[\s\S]*?^week:[ \t]*)\S.*$/m, `$1${week}`);
}
