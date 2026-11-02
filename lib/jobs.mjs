// A job search: each application is a note with properties (company, role,
// status, application_date, location, salary, link), as Notion keeps a row
// of a database; a ```jobs block shows them all as a board by status. Pure;
// drawn by src/jobs-view.js.
//
// ```jobs
// stages: Applied, Phone Screen, Technical, Final, Offer
// template: Job Tracker
// folder: Jobs
// ```
import { readProps } from './properties.mjs';

export const DEFAULT_STAGES = ['Applied', 'Phone Screen', 'Technical', 'Final', 'Offer'];
export const REJECTED = 'Rejected';

const key = (props, ...names) => {
  const p = props.find((x) => names.includes(String(x.key).toLowerCase()));
  if (!p || p.value == null) return '';
  if (p.value instanceof Date) return p.value.toISOString().slice(0, 10);
  if (Array.isArray(p.value)) return p.value.join(', ');
  return String(p.value).trim();
};

// The block's settings.
export function jobsSettings(code) {
  const out = { stages: DEFAULT_STAGES.slice(), template: '', folder: '' };
  for (const line of String(code || '').split('\n')) {
    const m = /^\s*([\w-]+)\s*:\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    const k = m[1].toLowerCase();
    if (k === 'stages') { const s = m[2].split(',').map((x) => x.trim()).filter((x) => x && x.toLowerCase() !== REJECTED.toLowerCase()); if (s.length) out.stages = s; }
    if (k === 'template') out.template = m[2];
    if (k === 'folder') out.folder = m[2].replace(/^\/+|\/+$/g, '');
  }
  return out;
}

// Quick look before reading the YAML: could this note be an application?
export const mayBeJob = (src) => /^---\n/.test(src) && (/^type:\s*["']?job/m.test(src) || (/^company:/m.test(src) && /^status:/m.test(src)));

// The application a note is, or null.
export function jobOf(rel, src) {
  if (!mayBeJob(String(src || ''))) return null;
  const r = readProps(src);
  if (!r.props || !r.props.length) return null;
  const props = r.props;
  const type = key(props, 'type').toLowerCase();
  const company = key(props, 'company', 'şirket', 'sirket');
  const status = key(props, 'status', 'stage', 'durum');
  if (type !== 'job' && type !== 'job-application' && !(company && props.some((p) => String(p.key).toLowerCase() === 'status'))) return null;
  return {
    rel,
    company,
    role: key(props, 'role', 'position', 'title', 'pozisyon'),
    status,
    applied: key(props, 'application_date', 'applied', 'applied_on', 'date_applied', 'date'),
    location: key(props, 'location', 'konum'),
    salary: key(props, 'salary', 'salary_expectations', 'maaş', 'maas'),
    link: key(props, 'link', 'url', 'posting'),
  };
}

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

// The board's columns: the stages in order, anything else after them, then
// Rejected. [{ stage, jobs }]
export function jobColumns(jobs, stages = DEFAULT_STAGES) {
  const cols = stages.map((stage) => ({ stage, jobs: [] }));
  const other = new Map();
  const rejected = { stage: REJECTED, jobs: [] };
  for (const j of jobs) {
    if (same(j.status, REJECTED)) { rejected.jobs.push(j); continue; }
    const c = cols.find((x) => same(x.stage, j.status)) || (!j.status ? cols[0] : null);
    if (c) { c.jobs.push(j); continue; }
    if (!other.has(j.status.toLowerCase())) other.set(j.status.toLowerCase(), { stage: j.status, jobs: [] });
    other.get(j.status.toLowerCase()).jobs.push(j);
  }
  const byDate = (a, b) => String(b.applied).localeCompare(String(a.applied)) || a.company.localeCompare(b.company);
  const all = [...cols, ...other.values(), rejected];
  for (const c of all) c.jobs.sort(byDate);
  return all;
}

// The numbers over the board.
//   { total, active, interviewing, offers, rejected, responseRate }
export function jobStats(jobs, stages = DEFAULT_STAGES) {
  const first = stages[0];
  const offer = stages[stages.length - 1];
  const total = jobs.length;
  const rejected = jobs.filter((j) => same(j.status, REJECTED)).length;
  const offers = jobs.filter((j) => same(j.status, offer)).length;
  const waiting = jobs.filter((j) => !j.status || same(j.status, first)).length;
  const interviewing = total - rejected - offers - waiting;
  return { total, active: total - rejected - offers, interviewing, offers, rejected, responseRate: total ? (total - waiting) / total : 0 };
}

// Whole days since a YYYY-MM-DD date, or null.
export function daysSince(date, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - d) / 86400000);
}

// A note name for a new application: "Company – Role".
export function jobNoteName({ company, role }) {
  const clean = (s) => String(s || '').replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  const c = clean(company); const r = clean(role);
  return c && r ? `${c} – ${r}` : c || r || 'New application';
}

// Move an application to a stage. The status line keeps its quotes and its
// comment ("Applied" # Applied, Phone Screen, …), which a template may use to
// list the stages; a note without one gets the property.
export function setJobStatus(src, stage, setProp) {
  const text = String(src == null ? '' : src);
  const fm = /^---\n([\s\S]*?)\n(?:---|\.\.\.)(?:\n|$)/.exec(text);
  if (fm) {
    const re = /^(status:[ \t]*)(["']?)([^"'#\n]*?)\2([ \t]+#.*)?[ \t]*$/m;
    const block = fm[1];
    if (re.test(block)) {
      const next = block.replace(re, (_m, head, q, _v, comment) => `${head}${q || (/[:#]/.test(stage) ? '"' : '')}${stage}${q || (/[:#]/.test(stage) ? '"' : '')}${comment || ''}`);
      return `---\n${next}${text.slice(4 + block.length)}`;
    }
  }
  return setProp(text, 'status', stage);
}
