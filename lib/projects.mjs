// Projects: each project is a note (type: project, status, start, due) whose
// checklist is its progress; a ```projects block shows them all as a board by
// status. Pure; drawn by src/projects-view.js with the job board's parts.
//
// ```projects
// folder: Projects
// ```
import { readProps } from './properties.mjs';
import { daysSince } from './jobs.mjs';

export const PROJECT_STAGES = ['Planning', 'Active', 'Done'];
export const ON_HOLD = 'On hold';

const prop = (props, ...names) => {
  const p = props.find((x) => names.includes(String(x.key).toLowerCase()));
  if (!p || p.value == null) return '';
  if (p.value instanceof Date) return p.value.toISOString().slice(0, 10);
  return String(p.value).trim();
};
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export function projectsSettings(code) {
  const out = { folder: '', template: '' };
  for (const line of String(code || '').split('\n')) {
    const m = /^\s*([\w-]+)\s*:\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    if (m[1].toLowerCase() === 'folder') out.folder = m[2].replace(/^\/+|\/+$/g, '');
    if (m[1].toLowerCase() === 'template') out.template = m[2];
  }
  return out;
}

// The checklist of a note: { done, total } (outside code blocks, any depth).
export function taskProgress(src) {
  let done = 0; let total = 0; let fence = null;
  for (const line of String(src || '').split('\n')) {
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (f) { if (!fence) fence = f[1][0]; else if (f[1][0] === fence) fence = null; continue; }
    if (fence) continue;
    const m = /^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[(.)\]/.exec(line);
    if (!m) continue;
    total += 1;
    if (m[1] !== ' ') done += 1;
  }
  return { done, total };
}

export const mayBeProject = (src) => /^---\r?\n/.test(src) && /^type:\s*["']?project\b/m.test(src);

// The project a note is, or null. The status as the board names it.
export function projectOf(rel, src) {
  if (!mayBeProject(String(src || ''))) return null;
  const r = readProps(src);
  if (!r.props) return null;
  if (prop(r.props, 'type').toLowerCase() !== 'project') return null;
  const raw = prop(r.props, 'status');
  const status = [...PROJECT_STAGES, ON_HOLD].find((s) => same(s, raw) || (same(raw, 'hold') && s === ON_HOLD)) || raw || PROJECT_STAGES[0];
  return { rel, status, start: prop(r.props, 'start'), due: prop(r.props, 'due', 'deadline'), owner: prop(r.props, 'owner'), ...taskProgress(src) };
}

// Days until the due date (negative when late), or null.
export function daysLeft(due, now = new Date()) {
  const d = daysSince(due, now);
  return d == null ? null : -d;
}

// The board's columns: Planning, Active, On hold, any other status, Done.
// Soonest due first, then by name.
export function projectColumns(projects) {
  const order = [PROJECT_STAGES[0], PROJECT_STAGES[1], ON_HOLD, PROJECT_STAGES[2]];
  const cols = order.map((stage) => ({ stage, items: [] }));
  for (const p of projects) {
    let c = cols.find((x) => same(x.stage, p.status));
    if (!c) { c = { stage: p.status, items: [] }; cols.splice(cols.length - 1, 0, c); } // before Done
    c.items.push(p);
  }
  const key = (p) => (p.due || '9999');
  for (const c of cols) c.items.sort((a, b) => key(a).localeCompare(key(b)) || a.rel.localeCompare(b.rel));
  return cols;
}

// The numbers over the board. now: for what is late or due this week.
export function projectStats(projects, now = new Date()) {
  const open = projects.filter((p) => !same(p.status, PROJECT_STAGES[2]));
  const left = (p) => daysLeft(p.due, now);
  return {
    active: projects.filter((p) => same(p.status, PROJECT_STAGES[1])).length,
    dueSoon: open.filter((p) => { const d = left(p); return d != null && d >= 0 && d <= 7; }).length,
    late: open.filter((p) => { const d = left(p); return d != null && d < 0; }).length,
    done: projects.length - open.length,
    total: projects.length,
  };
}
