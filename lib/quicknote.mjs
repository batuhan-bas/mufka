// Quick note (⌃⌥N): one line typed or dictated from anywhere. "Groceries: oat
// milk" goes to the note named Groceries; anything else to today's daily note,
// with the time. Pure; main.js reads and writes the files.
import { foldTR } from './plans.mjs';
import { titleOf } from './notestree.mjs';

const fold = (s) => foldTR(String(s).trim().replace(/\s+/g, ' '));

// Where a quick note goes: { rel, title, body } for a named note, or
// { rel: null, body } for the daily note. A name that is no note's title
// stays part of the text ("Note: the printer is out of paper").
export function quickTarget(text, rels) {
  const body = String(text || '').trim();
  const m = /^([^:\n]{1,80}):\s*(\S[\s\S]*)$/.exec(body);
  if (m) {
    const want = fold(m[1]);
    const rel = [...rels].sort((a, b) => a.length - b.length).find((r) => fold(titleOf(r)) === want);
    if (rel) return { rel, title: titleOf(rel), body: m[2].trim() };
  }
  return { rel: null, body };
}

// The note with one more list line at its end ("- text"), with a blank line
// before the list when the note ends in a paragraph.
export function appendLine(content, line) {
  const text = String(content || '');
  const item = `- ${String(line).replace(/\s*\n\s*/g, ' ').trim()}`;
  if (!text.trim()) return `${item}\n`;
  const trimmed = text.replace(/\s+$/, '');
  const last = trimmed.split('\n').pop();
  const inList = /^\s*([-*+]|\d+[.)])\s/.test(last);
  return `${trimmed}\n${inList ? '' : '\n'}${item}\n`;
}

// The daily note's line: "14:05 text".
export function dailyLine(body, now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(now.getHours())}:${p(now.getMinutes())} ${body}`;
}
