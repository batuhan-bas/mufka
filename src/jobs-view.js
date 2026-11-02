// A job search (lib/jobs.mjs): the strip at the top of an application note
// (its stage, one click to move it on; company, place, pay, link), the
// ```jobs board of all applications by stage, and the form for a new one.
import { jobColumns, jobStats, daysSince, REJECTED } from '../lib/jobs.mjs';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const ago = (date) => {
  const d = daysSince(date);
  if (d == null) return '';
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  return d < 60 ? `${d} days ago` : `${Math.round(d / 30)} months ago`;
};
// A stage's colour: the last one (the offer) green, Rejected red, the others
// from the accent towards amber as they go on.
function stageClass(stage, stages) {
  if (same(stage, REJECTED)) return 'job-s-rejected';
  const i = stages.findIndex((s) => same(s, stage));
  if (i === stages.length - 1) return 'job-s-offer';
  return i <= 0 ? 'job-s-0' : `job-s-${Math.min(i, 3)}`;
}

// Steps to click through: the stages in order, past ones done, and an
// aside one (Rejected, On hold) at the end. classOf(stage) gives the colour.
export function stageSteps({ stages, aside, current, classOf, onStage }) {
  const steps = el('div', 'job-steps');
  steps.setAttribute('role', 'radiogroup'); steps.setAttribute('aria-label', 'Stage');
  const off = same(current, aside);
  const at = stages.findIndex((s) => same(s, current));
  const step = (s, cls) => {
    const on = same(s, current) && (s === aside || !off);
    const b = el('button', `job-step ${classOf(s)}${cls}${on ? ' on' : ''}`);
    b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(on));
    b.append(el('span', 'job-step-dot'), el('span', 'job-step-name', s));
    b.addEventListener('click', () => onStage(s));
    return b;
  };
  stages.forEach((s, i) => steps.append(step(s, !off && i < at ? ' past' : '')));
  if (aside) steps.append(step(aside, ' job-reject'));
  return steps;
}

// Facts under the steps: [label, value] pairs (empty ones left out) and
// extra elements.
export function factsRow(pairs, extra = []) {
  const facts = el('div', 'job-facts');
  for (const [label, value, cls] of pairs) {
    if (!value) continue;
    const f = el('span', `job-fact${cls ? ` ${cls}` : ''}`);
    f.append(el('span', 'job-fact-label', label), document.createTextNode(value));
    facts.append(f);
  }
  for (const x of extra) if (x) facts.append(x);
  return facts;
}

// The strip under an application's title. onStage(stage); onLink().
export function jobStrip(job, { stages, onStage, onLink }) {
  const box = el('div', 'job-strip');
  box.append(stageSteps({ stages, aside: REJECTED, current: job.status, classOf: (s) => stageClass(s, stages), onStage }));
  let link = null;
  if (job.link && /^https?:\/\//i.test(job.link)) {
    link = el('button', 'job-link', 'Open the posting ↗'); link.type = 'button';
    link.addEventListener('click', () => onLink(job.link));
  }
  const facts = factsRow([['Company', job.company], ['Role', job.role], ['Where', job.location], ['Pay', job.salary],
    ['Applied', job.applied ? `${job.applied}${ago(job.applied) ? ` · ${ago(job.applied)}` : ''}` : '']], [link]);
  if (facts.children.length) box.append(facts);
  return box;
}

// A board of notes by stage: the numbers and a "+ New" button above,
// a column per stage with cards to open and drag.
//   columns: [{ stage, cls, items: [{ rel, … }] }]; stats: [{ label, value, cls }]
//   card(item) → the card's content; current(item) → its stage
//   onOpen(rel), onMove(rel, stage), onNew(); newLabel, empty: texts
export function stageBoard({ columns, stats, card, current, newLabel, empty, onOpen, onMove, onNew }) {
  const box = el('div', 'job-board-box');
  const head = el('div', 'job-head');
  const row = el('div', 'job-stats');
  for (const st of stats) { const x = el('div', `job-stat ${st.cls || ''}`); x.append(el('div', 'job-stat-value', String(st.value)), el('div', 'job-stat-label', st.label)); row.append(x); }
  head.append(row);
  const add = el('button', 'btn primary job-new', newLabel); add.type = 'button';
  add.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onNew(); });
  head.append(add);
  box.append(head);
  const board = el('div', 'job-board');
  const all = columns.flatMap((c) => c.items);
  for (const col of columns) {
    const c = el('div', `job-col ${col.cls}`);
    c.dataset.stage = col.stage;
    const h = el('div', 'job-col-head');
    h.append(el('span', 'job-step-dot'), el('span', 'job-col-name', col.stage), el('span', 'job-col-count', String(col.items.length)));
    c.append(h);
    const list = el('div', 'job-cards');
    for (const it of col.items) {
      const b = el('button', 'job-card'); b.type = 'button';
      b.draggable = true;
      b.dataset.rel = it.rel;
      b.append(...card(it));
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onOpen(it.rel); });
      b.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-mufka-card', it.rel); e.dataTransfer.effectAllowed = 'move'; b.classList.add('dragging'); });
      b.addEventListener('dragend', () => b.classList.remove('dragging'));
      list.append(b);
    }
    if (!col.items.length) list.append(el('div', 'job-empty', 'Nothing here'));
    c.append(list);
    c.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-mufka-card')) { e.preventDefault(); c.classList.add('drop'); } });
    c.addEventListener('dragleave', (e) => { if (!c.contains(e.relatedTarget)) c.classList.remove('drop'); });
    c.addEventListener('drop', (e) => {
      const rel = e.dataTransfer.getData('text/x-mufka-card');
      c.classList.remove('drop');
      if (!rel) return;
      e.preventDefault(); e.stopPropagation();
      const it = all.find((x) => x.rel === rel);
      if (it && !same(current(it), col.stage)) onMove(rel, col.stage);
    });
    board.append(c);
  }
  box.append(board);
  if (!all.length) box.append(el('p', 'bud-empty', empty));
  return box;
}

export const noteName = (rel) => rel.replace(/^.*\//, '').replace(/\.md$/i, '');

// The board of applications. onOpen(rel), onMove(rel, stage), onNew().
export function jobsBoard(jobs, { stages, onOpen, onMove, onNew }) {
  const st = jobStats(jobs, stages);
  const columns = jobColumns(jobs, stages)
    .filter((col) => col.jobs.length || stages.some((s) => same(s, col.stage)) || same(col.stage, REJECTED))
    .map((col) => ({ stage: col.stage, cls: stageClass(col.stage, stages), items: col.jobs }));
  return stageBoard({
    columns,
    stats: [
      { label: 'Applications', value: st.total },
      { label: 'Active', value: st.active },
      { label: 'Interviewing', value: st.interviewing, cls: 'job-s-2' },
      { label: 'Offers', value: st.offers, cls: 'job-s-offer' },
      { label: 'Heard back', value: `${Math.round(st.responseRate * 100)}%` },
    ],
    card: (j) => {
      const out = [el('div', 'job-card-company', j.company || noteName(j.rel))];
      if (j.role) out.push(el('div', 'job-card-role', j.role));
      const meta = el('div', 'job-card-meta');
      if (j.location) meta.append(el('span', 'job-chip', j.location));
      if (ago(j.applied)) meta.append(el('span', 'job-card-ago', ago(j.applied)));
      if (meta.children.length) out.push(meta);
      return out;
    },
    current: (j) => j.status,
    newLabel: '+ New application',
    empty: 'No applications yet. Add one, or give any note company: and status: properties.',
    onOpen, onMove, onNew,
  });
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// The new application form. onSave({ company, role, link, location, applied }).
export function openJobDialog(onSave) {
  const layer = el('div', 'palette-layer');
  const box = el('div', 'palette plan-dialog bud-dialog');
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'New application');
  box.append(el('div', 'plan-dialog-title', 'New application'));
  let n = 0;
  const field = (label, input) => {
    const id = `job-f${(n += 1)}`; input.id = id;
    const f = el('div', 'bud-field'); const l = el('label', '', label); l.htmlFor = id;
    f.append(l, input);
    return f;
  };
  const input = (cls, attrs = {}) => Object.assign(el('input', `ask-input ${cls}`), attrs);
  const company = input('job-company', { placeholder: 'Acme' });
  const role = input('job-role', { placeholder: 'Senior Frontend Developer' });
  const link = input('job-url', { placeholder: 'https://…', type: 'url' });
  const applied = input('job-date', { type: 'date', value: today() });
  const two = el('div', 'bud-two');
  two.append(field('Company', company), field('Role', role));
  box.append(two);
  const two2 = el('div', 'bud-two');
  two2.append(field('Link to the posting', link), field('Applied on', applied));
  box.append(two2);
  const where = el('div', 'bud-field');
  where.append(el('div', 'bud-field-label', 'Where'));
  const pills = el('div', 'bud-pills');
  pills.setAttribute('role', 'radiogroup'); pills.setAttribute('aria-label', 'Where');
  let location = '';
  for (const p of ['Remote', 'Hybrid', 'On-site']) {
    const b = el('button', 'bud-pill bud-chip bud-c0', p); b.type = 'button'; b.dataset.name = p; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false');
    b.addEventListener('click', () => { location = location === p ? '' : p; for (const x of pills.children) x.setAttribute('aria-checked', String(x.dataset.name === location)); });
    pills.append(b);
  }
  where.append(pills);
  box.append(where);
  const restore = document.activeElement;
  const close = () => { layer.remove(); if (restore && restore.isConnected) restore.focus(); };
  const save = () => {
    if (!company.value.trim() && !role.value.trim()) { company.focus(); return; }
    close();
    onSave({ company: company.value.trim(), role: role.value.trim(), link: link.value.trim(), location, applied: applied.value || today() });
  };
  const actions = el('div', 'plan-dialog-actions');
  actions.append(el('span', 'bud-keys', '↵ add · esc cancel'));
  const cancel = el('button', 'btn quiet', 'Cancel'); cancel.type = 'button'; cancel.addEventListener('click', close);
  const ok = el('button', 'btn primary', 'Add'); ok.type = 'button'; ok.addEventListener('click', save);
  actions.append(cancel, ok);
  box.append(actions);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  layer.append(box);
  layer.addEventListener('mousedown', (e) => { if (e.target === layer) close(); });
  document.body.append(layer);
  company.focus();
}
