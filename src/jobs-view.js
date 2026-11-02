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

// The strip under an application's title. onStage(stage); onLink().
export function jobStrip(job, { stages, onStage, onLink }) {
  const box = el('div', 'job-strip');
  const steps = el('div', 'job-steps');
  steps.setAttribute('role', 'radiogroup'); steps.setAttribute('aria-label', 'Stage');
  const at = stages.findIndex((s) => same(s, job.status));
  const rejected = same(job.status, REJECTED);
  stages.forEach((s, i) => {
    const b = el('button', `job-step ${stageClass(s, stages)}${!rejected && i < at ? ' past' : ''}${!rejected && i === at ? ' on' : ''}`);
    b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(!rejected && i === at));
    b.append(el('span', 'job-step-dot'), el('span', 'job-step-name', s));
    b.addEventListener('click', () => onStage(s));
    steps.append(b);
  });
  const rej = el('button', `job-step job-s-rejected job-reject${rejected ? ' on' : ''}`);
  rej.type = 'button'; rej.setAttribute('role', 'radio'); rej.setAttribute('aria-checked', String(rejected));
  rej.append(el('span', 'job-step-dot'), el('span', 'job-step-name', REJECTED));
  rej.addEventListener('click', () => onStage(REJECTED));
  steps.append(rej);
  box.append(steps);

  const facts = el('div', 'job-facts');
  const fact = (label, value) => { if (!value) return; const f = el('span', 'job-fact'); f.append(el('span', 'job-fact-label', label), document.createTextNode(value)); facts.append(f); };
  fact('Company', job.company);
  fact('Role', job.role);
  fact('Where', job.location);
  fact('Pay', job.salary);
  if (job.applied) fact('Applied', `${job.applied}${ago(job.applied) ? ` · ${ago(job.applied)}` : ''}`);
  if (job.link && /^https?:\/\//i.test(job.link)) {
    const a = el('button', 'job-link', 'Open the posting ↗'); a.type = 'button';
    a.addEventListener('click', () => onLink(job.link));
    facts.append(a);
  }
  if (facts.children.length) box.append(facts);
  return box;
}

// The board. onOpen(rel), onMove(rel, stage), onNew().
export function jobsBoard(jobs, { stages, onOpen, onMove, onNew }) {
  const box = el('div', 'job-board-box');
  const st = jobStats(jobs, stages);
  const head = el('div', 'job-head');
  const stats = el('div', 'job-stats');
  const stat = (label, value, cls = '') => { const s = el('div', `job-stat ${cls}`); s.append(el('div', 'job-stat-value', String(value)), el('div', 'job-stat-label', label)); stats.append(s); };
  stat('Applications', st.total);
  stat('Active', st.active);
  stat('Interviewing', st.interviewing, 'job-s-2');
  stat('Offers', st.offers, 'job-s-offer');
  stat('Heard back', `${Math.round(st.responseRate * 100)}%`);
  head.append(stats);
  const add = el('button', 'btn primary job-new', '+ New application'); add.type = 'button';
  add.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onNew(); });
  head.append(add);
  box.append(head);

  const board = el('div', 'job-board');
  for (const col of jobColumns(jobs, stages)) {
    if (!col.jobs.length && !stages.some((s) => same(s, col.stage)) && !same(col.stage, REJECTED)) continue;
    const c = el('div', `job-col ${stageClass(col.stage, stages)}`);
    c.dataset.stage = col.stage;
    const h = el('div', 'job-col-head');
    h.append(el('span', 'job-step-dot'), el('span', 'job-col-name', col.stage), el('span', 'job-col-count', String(col.jobs.length)));
    c.append(h);
    const list = el('div', 'job-cards');
    for (const j of col.jobs) {
      const card = el('button', 'job-card'); card.type = 'button';
      card.draggable = true;
      card.dataset.rel = j.rel;
      card.append(el('div', 'job-card-company', j.company || j.rel.replace(/^.*\//, '').replace(/\.md$/i, '')));
      if (j.role) card.append(el('div', 'job-card-role', j.role));
      const meta = el('div', 'job-card-meta');
      if (j.location) meta.append(el('span', 'job-chip', j.location));
      if (ago(j.applied)) meta.append(el('span', 'job-card-ago', ago(j.applied)));
      if (meta.children.length) card.append(meta);
      card.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onOpen(j.rel); });
      card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-mufka-job', j.rel); e.dataTransfer.effectAllowed = 'move'; card.classList.add('dragging'); });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      list.append(card);
    }
    if (!col.jobs.length) list.append(el('div', 'job-empty', 'Nothing here'));
    c.append(list);
    c.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-mufka-job')) { e.preventDefault(); c.classList.add('drop'); } });
    c.addEventListener('dragleave', (e) => { if (!c.contains(e.relatedTarget)) c.classList.remove('drop'); });
    c.addEventListener('drop', (e) => {
      const rel = e.dataTransfer.getData('text/x-mufka-job');
      c.classList.remove('drop');
      if (!rel) return;
      e.preventDefault(); e.stopPropagation();
      const job = jobs.find((x) => x.rel === rel);
      if (job && !same(job.status, col.stage)) onMove(rel, col.stage);
    });
    board.append(c);
  }
  box.append(board);
  if (!jobs.length) box.append(el('p', 'bud-empty', 'No applications yet. Add one, or give any note company: and status: properties.'));
  return box;
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
