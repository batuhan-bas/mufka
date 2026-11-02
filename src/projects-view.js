// Projects (lib/projects.mjs): the strip under a project's title (its status,
// how much of its checklist is done, when it is due), the ```projects board,
// and the form for a new project. Built from the job board's parts.
import { projectColumns, projectStats, daysLeft, PROJECT_STAGES, ON_HOLD } from '../lib/projects.mjs';
import { stageSteps, factsRow, stageBoard, noteName } from './jobs-view.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const stageClass = (s) => (same(s, 'Done') ? 'job-s-offer' : same(s, ON_HOLD) ? 'job-s-2' : same(s, 'Active') ? 'job-s-1' : 'job-s-0');

// "in 3 days", "today", "3 days late" — and a class for late / soon.
function dueText(due) {
  const d = daysLeft(due);
  if (d == null) return { text: '', cls: '' };
  const date = new Date(`${due.slice(0, 10)}T12:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  if (d < 0) return { text: `${date} · ${-d} ${d === -1 ? 'day' : 'days'} late`, short: `${-d}d late`, cls: 'late' };
  if (d === 0) return { text: `${date} · today`, short: 'today', cls: 'soon' };
  return { text: `${date} · in ${d} ${d === 1 ? 'day' : 'days'}`, short: d <= 7 ? `in ${d}d` : date, cls: d <= 7 ? 'soon' : '' };
}

function progressBar(done, total, cls = '') {
  const box = el('span', `prj-progress ${cls}`);
  const bar = el('span', 'bud-cat-track prj-bar'); const fill = el('i');
  fill.style.width = `${total ? (done / total) * 100 : 0}%`;
  bar.append(fill);
  box.append(bar, el('span', 'prj-progress-text', total ? `${done}/${total}` : 'No tasks yet'));
  box.setAttribute('aria-label', total ? `${done} of ${total} tasks done` : 'No tasks yet');
  return box;
}

// The strip under a project's title. onStage(stage).
export function projectStrip(p, { onStage }) {
  const box = el('div', 'job-strip prj-strip');
  box.append(stageSteps({ stages: PROJECT_STAGES, aside: ON_HOLD, current: p.status, classOf: stageClass, onStage }));
  const due = dueText(p.due);
  const pct = p.total ? `${Math.round((p.done / p.total) * 100)}%` : '';
  const progress = el('span', 'job-fact prj-fact-progress');
  progress.append(el('span', 'job-fact-label', 'Progress'), progressBar(p.done, p.total), pct ? el('b', 'prj-pct', pct) : '');
  box.append(factsRow([['Due', due.text, due.cls ? `prj-due ${due.cls}` : 'prj-due'], ['Started', p.start], ['Owner', p.owner]], [progress]));
  return box;
}

// The board. onOpen(rel), onMove(rel, stage), onNew().
export function projectsBoard(projects, { onOpen, onMove, onNew }) {
  const st = projectStats(projects);
  return stageBoard({
    columns: projectColumns(projects).map((c) => ({ stage: c.stage, cls: stageClass(c.stage), items: c.items })),
    stats: [
      { label: 'Active', value: st.active, cls: 'job-s-1' },
      { label: 'Due this week', value: st.dueSoon, cls: st.dueSoon ? 'job-s-2' : '' },
      { label: 'Late', value: st.late, cls: st.late ? 'job-s-rejected' : '' },
      { label: 'Done', value: st.done, cls: 'job-s-offer' },
    ],
    card: (p) => {
      const out = [el('div', 'job-card-company', noteName(p.rel))];
      out.push(progressBar(p.done, p.total, 'small'));
      const due = dueText(p.due);
      if (due.short && !same(p.status, 'Done')) { const m = el('div', 'job-card-meta'); m.append(el('span', `prj-due-chip ${due.cls}`, due.short)); out.push(m); }
      return out;
    },
    current: (p) => p.status,
    newLabel: '+ New project',
    empty: 'No projects yet. Add one, or give a note type: project.',
    onOpen, onMove, onNew,
  });
}

// The new project form. onSave({ name, due }).
export function openProjectDialog(onSave) {
  const layer = el('div', 'palette-layer');
  const box = el('div', 'palette plan-dialog bud-dialog');
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'New project');
  box.append(el('div', 'plan-dialog-title', 'New project'));
  const field = (label, input, id) => { input.id = id; const f = el('div', 'bud-field'); const l = el('label', '', label); l.htmlFor = id; f.append(l, input); return f; };
  const name = Object.assign(el('input', 'ask-input prj-name'), { placeholder: 'Website redesign' });
  const due = Object.assign(el('input', 'ask-input prj-due-input'), { type: 'date' });
  const two = el('div', 'bud-two');
  two.append(field('Project', name, 'prj-f1'), field('Due (optional)', due, 'prj-f2'));
  box.append(two);
  const restore = document.activeElement;
  const close = () => { layer.remove(); if (restore && restore.isConnected) restore.focus(); };
  const save = () => {
    if (!name.value.trim()) { name.focus(); return; }
    close();
    onSave({ name: name.value.trim(), due: due.value });
  };
  const actions = el('div', 'plan-dialog-actions');
  actions.append(el('span', 'bud-keys', '↵ add · esc cancel'));
  const cancel = el('button', 'btn quiet', 'Cancel'); cancel.type = 'button'; cancel.addEventListener('click', close);
  const ok = el('button', 'btn primary', 'Create'); ok.type = 'button'; ok.addEventListener('click', save);
  actions.append(cancel, ok);
  box.append(actions);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  layer.append(box);
  layer.addEventListener('mousedown', (e) => { if (e.target === layer) close(); });
  document.body.append(layer);
  name.focus();
}
