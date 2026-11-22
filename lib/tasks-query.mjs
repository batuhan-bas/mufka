// Queries of the Obsidian Tasks plugin: a ```tasks block lists the vault's
// tasks that pass its filters, sorted, grouped and limited. Tasks are read in
// the plugin's emoji format (📅 due, ⏳ scheduled, 🛫 start, ➕ created,
// ✅ done, ❌ cancelled, 🔁 recurrence, 🔺⏫🔼🔽⏬ priority). Dates are
// 'YYYY-MM-DD' strings, compared as text. Pure.
import { TASK_RE } from './taskline.mjs';
import { frontmatterEnd } from './properties.mjs';
import { dayKey as key, addDays } from './dates.mjs';

export class TaskQueryError extends Error {}

// --- reading tasks ------------------------------------------------------------------

const DATE = '(\\d{4}-\\d{2}-\\d{2})';
const FIELDS = [['due', '📅'], ['scheduled', '⏳'], ['start', '🛫'], ['created', '➕'], ['done', '✅'], ['cancelled', '❌']];
const PRIORITY = [['🔺', 'highest'], ['⏫', 'high'], ['🔼', 'medium'], ['🔽', 'low'], ['⏬', 'lowest']];
export const PRIORITY_RANK = { highest: 0, high: 1, medium: 2, none: 3, low: 4, lowest: 5 };
const TAG_RE = /(^|\s)#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;

function statusType(ch) {
  if (ch === ' ') return 'TODO';
  if (ch === 'x' || ch === 'X') return 'DONE';
  if (ch === '/') return 'IN_PROGRESS';
  if (ch === '-') return 'CANCELLED';
  return 'TODO';
}
const STATUS_NAMES = { TODO: 'Todo', DONE: 'Done', IN_PROGRESS: 'In Progress', CANCELLED: 'Cancelled' };

// One task line → its parts, or null. heading: the heading above it.
export function parseTaskLine(line, { rel = '', lineNo = 0, heading = null } = {}) {
  const m = TASK_RE.exec(line);
  if (!m) return null;
  const rest = line.slice(m[0].length);
  const t = { rel, line: lineNo, raw: line, status: m[2], heading, indent: /^((?:\s*>)*)(\s*)/.exec(m[1])[2].replace(/\t/g, '    ').length };
  t.statusType = statusType(m[2]);
  t.statusName = STATUS_NAMES[t.statusType];
  let desc = rest;
  for (const [key, emoji] of FIELDS) {
    const r = new RegExp(`${emoji}\\uFE0F?\\s*${DATE}`, 'u');
    const f = r.exec(desc);
    t[key] = f ? f[1] : null;
    if (f) desc = desc.replace(f[0], '');
  }
  t.priority = 'none';
  for (const [emoji, name] of PRIORITY) {
    if (desc.includes(emoji)) { t.priority = name; desc = desc.split(emoji).join('').replace(/️/g, ''); break; }
  }
  const rec = /🔁️?\s*([^📅⏳🛫➕✅❌🔺⏫🔼🔽⏬🏁🆔⛔]*)/u.exec(desc);
  t.recurrence = rec ? rec[1].trim() : null;
  if (rec) desc = desc.replace(rec[0], '');
  desc = desc.replace(/🏁️?\s*\S+/u, '').replace(/🆔️?\s*\S+/u, '').replace(/⛔️?\s*\S+/u, '');
  t.description = desc.replace(/\s+/g, ' ').trim();
  t.tags = [...rest.matchAll(TAG_RE)].map((x) => `#${x[2]}`);
  t.happens = [t.start, t.scheduled, t.due].filter(Boolean).sort()[0] || null;
  const slash = rel.lastIndexOf('/');
  t.folder = slash === -1 ? '/' : `${rel.slice(0, slash)}/`;
  t.filename = rel.slice(slash + 1);
  t.root = slash === -1 ? '/' : `${rel.slice(0, rel.indexOf('/'))}/`;
  return t;
}

// Every task in the notes: [{ rel, content }] → tasks, in file order.
export function collectTasks(notes) {
  const out = [];
  for (const n of notes || []) {
    if (!n || !/\.md$/i.test(n.rel) || !n.content) continue;
    const lines = String(n.content).split('\n');
    let heading = null; let fence = false; let i = 0;
    i = frontmatterEnd(lines) + 1;
    for (; i < lines.length; i++) {
      const l = lines[i];
      if (/^\s*(```|~~~)/.test(l)) { fence = !fence; continue; }
      if (fence) continue;
      const h = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(l);
      if (h) { heading = h[1]; continue; }
      const t = parseTaskLine(l, { rel: n.rel, lineNo: i, heading });
      if (t) out.push(t);
    }
  }
  return out;
}

// --- dates in queries ------------------------------------------------------------------

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const NUMBERS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

// A date or range in words → { from, to } ('YYYY-MM-DD'), or null.
export function dateRange(text, today = new Date()) {
  const s = String(text).trim().toLowerCase().replace(/\s+/g, ' ');
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const one = (d) => ({ from: key(d), to: key(d) });
  let m;
  if ((m = /^(\d{4}-\d{2}-\d{2}) (\d{4}-\d{2}-\d{2})$/.exec(s))) return { from: m[1], to: m[2] };
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { from: s, to: s };
  if (s === 'today') return one(t0);
  if (s === 'tomorrow') return one(addDays(t0, 1));
  if (s === 'yesterday') return one(addDays(t0, -1));
  if ((m = /^(\d{4})-(\d{2})$/.exec(s))) { const a = new Date(+m[1], +m[2] - 1, 1); return { from: key(a), to: key(new Date(+m[1], +m[2], 0)) }; }
  if ((m = /^(\d{4})-w(\d{1,2})$/.exec(s))) {
    const jan4 = new Date(+m[1], 0, 4);
    const mon = addDays(jan4, -((jan4.getDay() + 6) % 7) + (+m[2] - 1) * 7);
    return { from: key(mon), to: key(addDays(mon, 6)) };
  }
  if ((m = /^(\d{4})$/.exec(s))) return { from: `${m[1]}-01-01`, to: `${m[1]}-12-31` };
  if ((m = /^(last|this|next) (week|month|quarter|year)$/.exec(s))) {
    const step = m[1] === 'last' ? -1 : m[1] === 'next' ? 1 : 0;
    if (m[2] === 'week') { const mon = addDays(t0, -((t0.getDay() + 6) % 7) + step * 7); return { from: key(mon), to: key(addDays(mon, 6)) }; }
    if (m[2] === 'month') { const a = new Date(t0.getFullYear(), t0.getMonth() + step, 1); return { from: key(a), to: key(new Date(a.getFullYear(), a.getMonth() + 1, 0)) }; }
    if (m[2] === 'quarter') { const q = Math.floor(t0.getMonth() / 3) + step; const a = new Date(t0.getFullYear(), q * 3, 1); return { from: key(a), to: key(new Date(a.getFullYear(), a.getMonth() + 3, 0)) }; }
    const y = t0.getFullYear() + step; return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  if ((m = /^(?:(next|last|this) )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.exec(s))) {
    const want = WEEKDAYS.indexOf(m[2]); const now = t0.getDay();
    let diff = want - now;
    if (m[1] === 'next') diff = diff <= 0 ? diff + 7 : diff;
    else if (m[1] === 'last') diff = diff >= 0 ? diff - 7 : diff;
    else if (!m[1]) diff = diff < 0 ? diff + 7 : diff;
    return one(addDays(t0, diff));
  }
  if ((m = /^in (\w+) (day|week|month|year)s?$/.exec(s)) || (m = /^(\w+) (day|week|month|year)s? (?:from now|later)$/.exec(s))) {
    const n = NUMBERS[m[1]] ?? Number(m[1]);
    if (!Number.isFinite(n)) return null;
    return one(shift(t0, m[2], n));
  }
  if ((m = /^(\w+) (day|week|month|year)s? ago$/.exec(s))) {
    const n = NUMBERS[m[1]] ?? Number(m[1]);
    if (!Number.isFinite(n)) return null;
    return one(shift(t0, m[2], -n));
  }
  return null;
}
function shift(d, unit, n) {
  if (unit === 'day') return addDays(d, n);
  if (unit === 'week') return addDays(d, 7 * n);
  if (unit === 'month') return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
  return new Date(d.getFullYear() + n, d.getMonth(), d.getDate());
}

// --- filters -------------------------------------------------------------------------------

const DATE_FIELDS = { due: 'due', scheduled: 'scheduled', starts: 'start', start: 'start', done: 'done', created: 'created', cancelled: 'cancelled', happens: 'happens' };
const TEXT_FIELDS = { description: (t) => t.description, path: (t) => t.rel, folder: (t) => t.folder, filename: (t) => t.filename, heading: (t) => t.heading || '', root: (t) => t.root, recurrence: (t) => t.recurrence || '', 'status.name': (t) => t.statusName };
const isDone = (t) => t.statusType === 'DONE' || t.statusType === 'CANCELLED';

function regexOf(src) {
  const m = /^\/(.*)\/([gimsuy]*)$/.exec(src.trim());
  if (!m) throw new TaskQueryError(`a regular expression is written /like this/: ${src}`);
  return new RegExp(m[1], m[2].replace('g', ''));
}

// One filter line → test(task), or null when it is not a filter.
function simpleFilter(line, today) {
  const s = line.trim();
  const l = s.toLowerCase();
  if (l === 'done') return isDone;
  if (l === 'not done') return (t) => !isDone(t);
  if (l === 'is recurring') return (t) => !!t.recurrence;
  if (l === 'is not recurring') return (t) => !t.recurrence;
  if (l === 'has tags') return (t) => t.tags.length > 0;
  if (l === 'no tags') return (t) => t.tags.length === 0;
  if (l === 'exclude sub-items') return (t) => t.indent === 0;
  let m;
  if ((m = /^(has|no) (due|scheduled|start|done|created|cancelled|happens) date$/.exec(l))) {
    const f = DATE_FIELDS[m[2]]; const want = m[1] === 'has';
    return (t) => !!t[f] === want;
  }
  if ((m = /^(due|scheduled|start|done|created|cancelled|happens) date is invalid$/.exec(l))) return () => false;
  if ((m = /^(due|scheduled|starts|done|created|cancelled|happens)\s+(on or before|on or after|in or before|in or after|before|after|on|in)?\s*(.+)$/.exec(l))) {
    const f = DATE_FIELDS[m[1]]; const op = (m[2] || 'on').replace('in', 'on');
    const r = dateRange(m[3], today);
    if (!r) throw new TaskQueryError(`could not read the date "${m[3]}"`);
    const test = (d) => {
      if (op === 'before') return d < r.from;
      if (op === 'after') return d > r.to;
      if (op === 'on or before') return d <= r.to;
      if (op === 'on or after') return d >= r.from;
      return d >= r.from && d <= r.to;
    };
    if (f === 'happens') return (t) => [t.start, t.scheduled, t.due].some((d) => d && test(d));
    // A task without a start date has started.
    if (f === 'start') return (t) => !t.start || test(t.start);
    return (t) => !!t[f] && test(t[f]);
  }
  if ((m = /^priority is (?:(above|below|not) )?(lowest|low|none|medium|high|highest)$/.exec(l))) {
    const want = PRIORITY_RANK[m[2]];
    return (t) => {
      const p = PRIORITY_RANK[t.priority];
      return m[1] === 'above' ? p < want : m[1] === 'below' ? p > want : m[1] === 'not' ? p !== want : p === want;
    };
  }
  if ((m = /^status\.type (is|is not) (todo|done|in_progress|on_hold|cancelled|non_task)$/.exec(l))) {
    const want = m[2].toUpperCase(); return (t) => (t.statusType === want) === (m[1] === 'is');
  }
  if ((m = /^tags? (include|includes|do not include|does not include|regex matches|regex does not match) (.+)$/i.exec(s))) {
    const op = m[1].toLowerCase();
    if (op.startsWith('regex')) { const re = regexOf(m[2]); const want = !op.includes('not'); return (t) => t.tags.some((x) => re.test(x)) === want; }
    const needle = m[2].trim().replace(/^#/, '').toLowerCase();
    const has = (t) => t.tags.some((x) => x.slice(1).toLowerCase().includes(needle));
    return op.includes('not') ? (t) => !has(t) : has;
  }
  if ((m = /^(description|path|folder|filename|heading|root|recurrence|status\.name) (includes|does not include|regex matches|regex does not match) (.+)$/i.exec(s))) {
    const get = TEXT_FIELDS[m[1].toLowerCase()]; const op = m[2].toLowerCase();
    if (op.startsWith('regex')) { const re = regexOf(m[3]); const want = !op.includes('not'); return (t) => re.test(get(t)) === want; }
    const needle = m[3].trim().toLowerCase();
    return op === 'includes' ? (t) => get(t).toLowerCase().includes(needle) : (t) => !get(t).toLowerCase().includes(needle);
  }
  return null;
}

// "(a) AND (b)", "NOT (a)", "(a) OR ((b) AND NOT (c))" … → test(task).
function booleanFilter(line, today) {
  const s = line.trim();
  let i = 0;
  const ws = () => { while (s[i] === ' ') i += 1; };
  const word = () => { ws(); const m = /^(AND NOT|OR NOT|AND|OR|XOR|NOT)\b/.exec(s.slice(i)); return m ? m[1] : null; };
  const group = () => {
    ws();
    const open = s[i];
    const close = { '(': ')', '[': ']', '{': '}', '"': '"' }[open];
    if (!close) throw new TaskQueryError(`could not read "${line}"`);
    let depth = 0; let j = i;
    for (; j < s.length; j++) {
      if (open !== '"' && s[j] === open) depth += 1;
      else if (s[j] === close && (open !== '"' || j > i)) { if (open === '"' || --depth === 0) break; }
    }
    if (j >= s.length) throw new TaskQueryError(`a bracket is not closed in "${line}"`);
    const inner = s.slice(i + 1, j).trim();
    i = j + 1;
    if (/^[([{"]/.test(inner) || /^NOT\b/.test(inner)) return booleanFilter(inner, today);
    const f = simpleFilter(inner, today);
    if (!f) throw new TaskQueryError(`could not read "${inner}"`);
    return f;
  };
  const operand = () => {
    const w = word();
    if (w === 'NOT') { i = s.indexOf('NOT', i) + 3; const f = operand(); return (t) => !f(t); }
    return group();
  };
  let left = operand();
  for (;;) {
    ws();
    if (i >= s.length) return left;
    const w = word();
    if (!w || w === 'NOT') throw new TaskQueryError(`could not read "${line}"`);
    i = s.indexOf(w, i) + w.length;
    const right = operand(); const a = left;
    left = w === 'AND' ? (t) => a(t) && right(t)
      : w === 'OR' ? (t) => a(t) || right(t)
        : w === 'XOR' ? (t) => a(t) !== right(t)
          : w === 'AND NOT' ? (t) => a(t) && !right(t)
            : (t) => a(t) || !right(t);
  }
}

// --- sorting and grouping ------------------------------------------------------------------

const cmpText = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
const cmpDate = (a, b) => (a === b ? 0 : !a ? 1 : !b ? -1 : a < b ? -1 : 1);
const SORTS = {
  status: (a, b) => Number(isDone(a)) - Number(isDone(b)),
  'status.name': (a, b) => cmpText(a.statusName, b.statusName),
  'status.type': (a, b) => cmpText(a.statusType, b.statusType),
  priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  description: (a, b) => cmpText(a.description, b.description),
  path: (a, b) => cmpText(a.rel, b.rel) || a.line - b.line,
  filename: (a, b) => cmpText(a.filename, b.filename),
  heading: (a, b) => cmpText(a.heading || '', b.heading || ''),
  tag: (a, b) => cmpText(a.tags[0] || '￿', b.tags[0] || '￿'),
  recurring: (a, b) => Number(!a.recurrence) - Number(!b.recurrence),
};
for (const [word, f] of Object.entries(DATE_FIELDS)) SORTS[word] = (a, b) => cmpDate(a[f], b[f]);
const DEFAULT_SORT = [SORTS.status, SORTS.due, SORTS.priority, SORTS.path];

const GROUPS = {
  status: (t) => [isDone(t) ? 'Done' : 'Todo'],
  'status.name': (t) => [t.statusName],
  'status.type': (t) => [t.statusType],
  priority: (t) => [`${t.priority[0].toUpperCase()}${t.priority.slice(1)} priority`],
  path: (t) => [t.rel.replace(/\.md$/i, '')],
  folder: (t) => [t.folder],
  filename: (t) => [t.filename.replace(/\.md$/i, '')],
  root: (t) => [t.root],
  heading: (t) => [t.heading || '(No heading)'],
  backlink: (t) => [t.heading ? `${t.filename.replace(/\.md$/i, '')} > ${t.heading}` : t.filename.replace(/\.md$/i, '')],
  tags: (t) => (t.tags.length ? t.tags : ['(No tags)']),
  recurring: (t) => [t.recurrence ? 'Recurring' : 'Not Recurring'],
  recurrence: (t) => [t.recurrence || 'None'],
};
const DATE_GROUP_NAMES = { due: 'due', scheduled: 'scheduled', start: 'start', done: 'done', created: 'created', cancelled: 'cancelled', happens: 'happens' };

// --- the query -------------------------------------------------------------------------------

// The text of a ```tasks block → { filters, sorts, group, limit, groupLimit, hide }.
export function parseTasksQuery(src, today = new Date()) {
  const q = { filters: [], sorts: [], group: null, limit: null, groupLimit: null, hide: new Set() };
  const lines = String(src || '').split('\n');
  lines.forEach((raw, n) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const l = line.toLowerCase();
    const fail = (why) => { throw new TaskQueryError(`could not read "${line}" (line ${n + 1})${why ? `: ${why}` : ''}`); };
    let m;
    if (['explain', 'short mode', 'full mode', 'short', 'full', 'ignore global query'].includes(l)) return;
    if ((m = /^(hide|show) (.+)$/.exec(l))) { if (m[1] === 'hide') q.hide.add(m[2]); else q.hide.delete(m[2]); return; }
    if ((m = /^limit groups (?:to )?(\d+)(?: tasks?)?$/.exec(l))) { q.groupLimit = Number(m[1]); return; }
    if ((m = /^limit (?:to )?(\d+)(?: tasks?)?$/.exec(l))) { q.limit = Number(m[1]); return; }
    if ((m = /^sort by ([a-z.]+)( reverse)?$/.exec(l))) {
      const f = SORTS[m[1]];
      if (!f) fail(`Mufka cannot sort by ${m[1]} yet`);
      q.sorts.push(m[2] ? (a, b) => -f(a, b) : f);
      return;
    }
    if ((m = /^group by ([a-z.]+)( reverse)?$/.exec(l))) {
      const date = DATE_GROUP_NAMES[m[1] === 'starts' ? 'start' : m[1]];
      if (!date && !GROUPS[m[1]]) fail(`Mufka cannot group by ${m[1]} yet`);
      q.group = { field: m[1], date: date || null, reverse: !!m[2] };
      return;
    }
    let f;
    try {
      f = /^(\(|\[|\{|"|NOT\b)/.test(line) ? booleanFilter(line, today) : simpleFilter(line, today);
    } catch (err) {
      if (err instanceof TaskQueryError) fail(err.message);
      throw err;
    }
    if (!f) fail('');
    q.filters.push(f);
  });
  return q;
}

// Run a ```tasks block over the vault's tasks.
// → { groups: [{ key, label, date, tasks }], total, shown, hide, error }
export function runTasksQuery(src, tasks, today = new Date()) {
  try {
    const q = parseTasksQuery(src, today);
    let list = tasks.filter((t) => q.filters.every((f) => f(t)));
    const total = list.length;
    const sorts = q.sorts.length ? [...q.sorts, SORTS.path] : DEFAULT_SORT;
    list = list.slice().sort((a, b) => { for (const s of sorts) { const c = s(a, b); if (c) return c; } return 0; });
    if (q.limit != null) list = list.slice(0, q.limit);
    const todayKey = key(today);
    let groups;
    if (!q.group) groups = [{ key: null, label: null, tasks: list }];
    else {
      const by = new Map();
      const add = (k, label, t, date) => { if (!by.has(k)) by.set(k, { key: k, label, date, tasks: [] }); by.get(k).tasks.push(t); };
      for (const t of list) {
        if (q.group.date) {
          const d = t[q.group.date];
          // Open tasks from before today are all late, in one group.
          if (d && d < todayKey && !isDone(t) && ['due', 'scheduled', 'happens', 'start'].includes(q.group.date)) add('0000-overdue', 'Overdue', t, 'overdue');
          else if (d) add(d, d, t, d);
          else add('9999-none', `No ${q.group.date} date`, t, null);
        } else for (const k of GROUPS[q.group.field](t)) add(k, k, t, null);
      }
      // "(No tags)", "(No heading)": after the rest.
      const k = (g) => (String(g.key).startsWith('(') ? `\uffff${g.key}` : g.key);
      groups = [...by.values()].sort((a, b) => cmpText(k(a), k(b)));
      if (q.group.reverse) groups.reverse();
      if (q.groupLimit != null) for (const g of groups) g.tasks = g.tasks.slice(0, q.groupLimit);
    }
    return { groups, total, shown: groups.reduce((s, g) => s + g.tasks.length, 0), hide: q.hide, today: todayKey, error: null };
  } catch (err) {
    if (err instanceof TaskQueryError) return { groups: [], total: 0, shown: 0, hide: new Set(), error: err.message };
    throw err;
  }
}

// Tick or untick a task line the way the Tasks plugin does: the box, and a
// ✅ date when it is ticked (removed when it is unticked).
export function completeTaskLine(line, done, todayKey) {
  const m = TASK_RE.exec(line);
  if (!m) return line;
  let rest = line.slice(m[0].length).replace(/\s*✅️?\s*\d{4}-\d{2}-\d{2}/u, '');
  if (done && /[📅⏳🛫➕🔁🔺⏫🔼🔽⏬]/u.test(rest)) rest = `${rest.replace(/\s+$/, '')} ✅ ${todayKey}`;
  return `${m[1]}[${done ? 'x' : ' '}]${rest}`;
}
