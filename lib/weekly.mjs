// A weekly to-do note: a heading per day ("## Monday") with that day's tasks
// under it ("- [ ] …"); a ```week block shows the week as seven columns to
// tick, add to and drag between. Pure, on the note's text; drawn by
// src/weekly-view.js. In Obsidian it is headings and checklists.
import { dayIndex } from './habits.mjs';

const TASK = /^[-*+] \[(.)\] ?(.*)$/;

// The days of the note, Mon = 0 … Sun = 6.
//   [{ day, heading (line), level, end (last line of the section), tasks:
//      [{ line, done, text }] }] — only the days the note has, in its order.
export function weekDays(src) {
  const lines = String(src == null ? '' : src).split('\n');
  const out = [];
  let cur = null; let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (f) { if (!fence) fence = f[1][0]; else if (f[1][0] === fence) fence = null; if (cur) cur.end = i; continue; }
    if (fence) { if (cur) cur.end = i; continue; }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      const level = h[1].length;
      if (cur && level <= cur.level) cur = null;
      const word = h[2].replace(/[^\p{L}].*$/u, '');
      const day = dayIndex(word);
      if (day !== -1 && !out.some((d) => d.day === day)) { cur = { day, heading: i, level, end: i, tasks: [] }; out.push(cur); }
      continue;
    }
    if (!cur) continue;
    if (line.trim()) cur.end = i;
    const t = TASK.exec(line);
    if (t) cur.tasks.push({ line: i, done: t[1] !== ' ', text: t[2] });
  }
  return out;
}

// How the week is going: per day and in all.
export function weekSummary(src) {
  const days = weekDays(src);
  const total = days.reduce((s, d) => s + d.tasks.length, 0);
  const done = days.reduce((s, d) => s + d.tasks.filter((t) => t.done).length, 0);
  return { days, total, done, open: total - done };
}

// Where a new task of a day goes: after its last task, else under its heading.
function insertAt(day, lines) {
  if (day.tasks.length) return day.tasks[day.tasks.length - 1].line + 1;
  let at = day.heading + 1;
  // past a line of text right under the heading (a note about the day)
  while (at <= day.end && lines[at].trim() && !TASK.test(lines[at])) at += 1;
  return at;
}

export function addWeekTask(src, day, text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return String(src);
  const lines = String(src).split('\n');
  const d = weekDays(src).find((x) => x.day === day);
  if (!d) return String(src);
  lines.splice(insertAt(d, lines), 0, `- [ ] ${t}`);
  return lines.join('\n');
}

// Change a task's words; empty words delete it.
export function editWeekTask(src, line, text) {
  const lines = String(src).split('\n');
  const m = TASK.exec(lines[line] || '');
  if (!m) return String(src);
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) lines.splice(line, 1);
  else lines[line] = `- [${m[1]}] ${t}`;
  return lines.join('\n');
}

// Move a task to another day (to the end of its list).
export function moveWeekTask(src, line, toDay) {
  const lines = String(src).split('\n');
  const task = lines[line];
  if (!TASK.test(task || '')) return String(src);
  lines.splice(line, 1);
  const without = lines.join('\n');
  const d = weekDays(without).find((x) => x.day === toDay);
  if (!d) return String(src);
  lines.splice(insertAt(d, lines), 0, task);
  return lines.join('\n');
}

// The open tasks of a day moved, in order, to the next day the note has.
export function moveOpenToNextDay(src, day) {
  const days = weekDays(src);
  const from = days.find((d) => d.day === day);
  const to = days.filter((d) => d.day > day).sort((a, b) => a.day - b.day)[0];
  if (!from || !to) return String(src);
  const open = from.tasks.filter((t) => !t.done);
  if (!open.length) return String(src);
  const gone = new Set(open.map((t) => t.line));
  const lines = String(src).split('\n').filter((_, i) => !gone.has(i));
  const target = weekDays(lines.join('\n')).find((d) => d.day === to.day);
  lines.splice(insertAt(target, lines), 0, ...open.map((t) => `- [ ] ${t.text}`));
  return lines.join('\n');
}

// The review at the end of the week starts empty again: its "- **Question:**"
// lines lose their answers.
const REVIEW = /^(#{1,6})\s+(review|weekly review|değerlendirme|haftanın değerlendirmesi)\b/i;
function clearReview(text) {
  const lines = text.split('\n');
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const h = /^(#{1,6})\s/.exec(lines[i]);
    if (h) { const r = REVIEW.exec(lines[i]); level = r ? r[1].length : (level && h[1].length > level ? level : 0); continue; }
    if (level) lines[i] = lines[i].replace(/^([-*+] \*\*[^*]+:\*\*).*$/, '$1');
  }
  return lines.join('\n');
}

// Next week's note: the same days, no tasks; with carry, this week's open
// tasks start on Monday. week: "2026-W46".
export function nextWeekTodoText(src, week, { carry = true } = {}) {
  const text = String(src == null ? '' : src);
  const days = weekDays(text);
  const open = carry ? days.flatMap((d) => d.tasks.filter((t) => !t.done).map((t) => t.text)) : [];
  const drop = new Set(days.flatMap((d) => d.tasks.map((t) => t.line)));
  let out = text.split('\n').filter((_, i) => !drop.has(i)).join('\n');
  out = out.replace(/^(---\n[\s\S]*?^week:[ \t]*)\S.*$/m, `$1${week}`);
  out = clearReview(out);
  const first = weekDays(out).sort((a, b) => a.day - b.day)[0];
  if (first && open.length) {
    const lines = out.split('\n');
    lines.splice(first.heading + 1, 0, ...open.map((t) => `- [ ] ${t}`));
    out = lines.join('\n');
  }
  return out;
}
