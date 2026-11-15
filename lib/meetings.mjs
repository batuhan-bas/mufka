// Meetings: a note made from the Meeting notes template (type: meeting) or
// brought in from Wispr Flow (source: Wispr Flow): when it was, who was there,
// and its action items. Pure; drawn by src/meetings-view.js.
import { readProps } from './properties.mjs';

const prop = (props, ...names) => {
  const p = props.find((x) => names.includes(String(x.key).toLowerCase()));
  if (!p || p.value == null) return '';
  if (p.value instanceof Date) return p.value.toISOString().slice(0, 10);
  return Array.isArray(p.value) ? p.value : String(p.value).trim();
};

const frontmatter = (lines) => {
  if (lines[0].trimEnd() !== '---') return -1;
  return lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---');
};
// A meeting note: type: meeting, or one Mufka brought in from Wispr Flow.
export function isMeetingNote(content) {
  const lines = String(content || '').split(/\r?\n/);
  const end = frontmatter(lines);
  if (end < 0) return false;
  const fm = lines.slice(1, end);
  return fm.some((l) => /^source:\s*["']?Wispr Flow["']?\s*$/.test(l) || /^type:\s*["']?meeting["']?\s*$/.test(l));
}

// The action items of a meeting note: the "- [ ]" / "- [x]" lines under
// "## Action items" or "## Tasks" (Wispr Flow's), with their line (0-based
// in the note) and text.
function actionLines(content) {
  const lines = String(content || '').split(/\r?\n/);
  const end = frontmatter(lines);
  const out = [];
  let inActions = false;
  for (let i = end + 1; i < lines.length; i += 1) {
    const l = lines[i];
    if (/^#{1,6}\s/.test(l)) { inActions = /^##\s+(Action items|Tasks)\s*$/i.test(l); continue; }
    if (/^>/.test(l)) inActions = false;
    const m = inActions && /^[-*+] \[(.)\] (.+)$/.exec(l);
    if (m && m[2].trim()) out.push({ line: i, text: m[2].trim(), done: m[1] !== ' ' });
  }
  return out;
}

// The open action items, to put on a task board: [{ line, text }]. A note
// that is not a meeting: [].
export function meetingTodos(content) {
  if (!isMeetingNote(content)) return [];
  return actionLines(content).filter((t) => !t.done).map(({ line, text }) => ({ line, text }));
}

// The meeting a note is, or null: { rel, date, time, attendees, actions: { done, total } }.
export function meetingOf(rel, src) {
  if (!isMeetingNote(src)) return null;
  const r = readProps(src);
  const props = r.props || [];
  const who = prop(props, 'attendees', 'who', 'people');
  const all = actionLines(src);
  return {
    rel,
    date: String(prop(props, 'date') || ''),
    time: String(prop(props, 'time') || ''),
    attendees: (Array.isArray(who) ? who : String(who || '').split(',')).map((x) => String(x).replace(/^\[\[|\]\]$/g, '').trim()).filter(Boolean),
    actions: { done: all.filter((t) => t.done).length, total: all.length },
  };
}
