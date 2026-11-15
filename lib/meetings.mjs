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

// --- when an action item says it happens -----------------------------------
// "Send the deck by Friday", "Call the designer tomorrow at 15:00", "Book the
// room for 25 Nov 09:30", "yarın 10:00 Ayşe'yi ara": the day (and time) the
// text names, counted from `base` (the meeting's day), or null. Rule-based,
// English and Turkish; a time alone is not enough.
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS = [
  ['january', 'jan', 'ocak'], ['february', 'feb', 'şubat', 'subat'], ['march', 'mar', 'mart'],
  ['april', 'apr', 'nisan'], ['may', 'mayıs', 'mayis'], ['june', 'jun', 'haziran'],
  ['july', 'jul', 'temmuz'], ['august', 'aug', 'ağustos', 'agustos'], ['september', 'sep', 'sept', 'eylül', 'eylul'],
  ['october', 'oct', 'ekim'], ['november', 'nov', 'kasım', 'kasim'], ['december', 'dec', 'aralık', 'aralik'],
];
const MONTH = new Map(MONTHS.flatMap((names, i) => names.map((n) => [n, i])));
const DAYS = [
  ['sunday', 'pazar'], ['monday', 'pazartesi'], ['tuesday', 'salı', 'sali'], ['wednesday', 'çarşamba', 'carsamba'],
  ['thursday', 'perşembe', 'persembe'], ['friday', 'cuma'], ['saturday', 'cumartesi'],
];
const DAY = new Map(DAYS.flatMap((names, i) => names.map((n) => [n, i])));
// Letters, Turkish ones too, for word edges (\b knows only ASCII).
const L = 'a-zçğıöşü';
const word = (alts) => new RegExp(`(?<![${L}])(${alts})(?![${L}])`, 'i');
const byLength = (m) => [...m.keys()].sort((a, b) => b.length - a.length).join('|');
const DAY_RE = word(byLength(DAY));
const MONTH_ALT = byLength(MONTH);
const DM_RE = new RegExp(`(?<!\\d)(\\d{1,2})(?:st|nd|rd|th|\\.)?\\s+(${MONTH_ALT})(?![${L}])`, 'i');
const MD_RE = new RegExp(`(?<![${L}])(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)`, 'i');
const ISO_RE = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/;
const TIME_RE = /(?<![\d:.])([01]?\d|2[0-3])[:.]([0-5]\d)(?![\d:])|(?<!\d)(1[0-2]|0?[1-9])\s?(am|pm)(?![a-z])/i;

function timeIn(text) {
  const m = TIME_RE.exec(text);
  if (!m) return '';
  if (m[1] != null) return `${pad(m[1])}:${m[2]}`;
  const h = (Number(m[3]) % 12) + (m[4].toLowerCase() === 'pm' ? 12 : 0);
  return `${pad(h)}:00`;
}

export function todoWhen(text, base = new Date()) {
  const s = String(text || '').toLocaleLowerCase('tr');
  const b = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const at = (d) => ({ date: keyOf(d), time: timeIn(s) });
  let m = ISO_RE.exec(s);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d.getMonth() === Number(m[2]) - 1) return at(d);
  }
  const dm = DM_RE.exec(s); const md = MD_RE.exec(s);
  if (dm || md) {
    const day = Number(dm ? dm[1] : md[2]);
    const month = MONTH.get((dm ? dm[2] : md[1]).toLowerCase());
    let d = new Date(b.getFullYear(), month, day);
    if (d.getMonth() === month) {
      if (d < b) d = new Date(b.getFullYear() + 1, month, day);
      return at(d);
    }
  }
  if (word('day after tomorrow|öbür gün|obur gun|ertesi gün').test(s)) return at(new Date(b.getFullYear(), b.getMonth(), b.getDate() + 2));
  if (word('tomorrow|yarın|yarin').test(s)) return at(new Date(b.getFullYear(), b.getMonth(), b.getDate() + 1));
  if (word('today|tonight|bugün|bugun|bu akşam|bu aksam').test(s)) return at(b);
  m = DAY_RE.exec(s);
  if (m) {
    const want = DAY.get(m[1].toLowerCase());
    // The next one after the meeting's day ("Monday" said on a Monday is a week on).
    const ahead = (want - b.getDay() + 7) % 7 || 7;
    return at(new Date(b.getFullYear(), b.getMonth(), b.getDate() + ahead));
  }
  return null;
}
