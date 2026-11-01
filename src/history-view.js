// File recovery dialogs: a note's past versions (what each changes against the
// note as it is now, or its whole text) and the notes deleted in the last
// seven days. The versions live outside the vault (lib/history.mjs, main.js).
import { lineDiff } from '../lib/diff.mjs';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// "Today 14:05", "Yesterday 09:12", "Mon 3 Nov 18:40".
export function versionTime(t, now = Date.now()) {
  const d = new Date(t);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const day = (x) => new Date(x).toDateString();
  if (day(t) === day(now)) return `Today ${time}`;
  if (day(t) === day(now - 86400000)) return `Yesterday ${time}`;
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`;
}

function sizeText(n) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
}

// A modal shell: { layer, box, close }. Esc and a click outside close it.
function modal(label, cls) {
  const layer = el('div', 'palette-layer');
  const box = el('div', `palette history-dialog ${cls || ''}`);
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', label);
  const restore = document.activeElement;
  const close = () => { layer.remove(); if (restore && restore.isConnected) restore.focus(); };
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
  layer.addEventListener('mousedown', (e) => { if (e.target === layer) close(); });
  layer.append(box);
  document.body.append(layer);
  return { layer, box, close };
}

// The changes from a version to the note now: what restoring would undo is
// shown as added (+) in the version, removed (−) from now. Long unchanged runs fold.
function renderDiff(pre, version, current) {
  const parts = lineDiff(current, version);
  pre.replaceChildren();
  const changed = parts.some((p) => p.op !== ' ');
  if (!changed) { pre.append(el('div', 'hist-same', 'Same as the note now.')); return; }
  const CONTEXT = 2;
  const near = parts.map(() => false);
  parts.forEach((p, i) => {
    if (p.op === ' ') return;
    for (let k = Math.max(0, i - CONTEXT); k <= Math.min(parts.length - 1, i + CONTEXT); k++) near[k] = true;
  });
  let skipped = 0;
  const flush = () => { if (skipped) { pre.append(el('div', 'hist-fold', `… ${skipped} unchanged ${skipped === 1 ? 'line' : 'lines'}`)); skipped = 0; } };
  parts.forEach((p, i) => {
    if (!near[i]) { skipped++; return; }
    flush();
    const row = el('div', `hist-line ${p.op === '+' ? 'add' : p.op === '-' ? 'del' : ''}`);
    row.append(el('span', 'hist-op', p.op === '+' ? '+' : p.op === '-' ? '−' : ' '), el('span', 'hist-text', p.text || ' '));
    pre.append(row);
  });
  flush();
}

// api: { rel, title, list(rel), get(rel, t), current() -> text, restore(rel, t), copy(text) }
export async function openVersionHistory(api) {
  const { box, close } = modal(`Version history of ${api.title}`, 'hist-versions');
  const head = el('div', 'hist-head');
  head.append(el('div', 'plan-dialog-title', `Version history · ${api.title}`));
  head.append(el('p', 'ask-text', 'Mufka keeps a version of each note every few minutes while you edit, for seven days. They are stored outside your notes folder.'));
  box.append(head);
  const versions = await api.list(api.rel);
  if (!versions.length) {
    box.append(el('p', 'hist-empty', 'No earlier versions yet. One is kept the next time this note changes.'));
    const actions = el('div', 'plan-dialog-actions hist-actions');
    const ok = el('button', 'btn primary', 'Close'); ok.type = 'button'; ok.addEventListener('click', close);
    actions.append(ok); box.append(actions); ok.focus();
    return;
  }
  const body = el('div', 'hist-body');
  const list = el('div', 'hist-list');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Versions');
  const side = el('div', 'hist-side');
  const tabs = el('div', 'hist-tabs');
  tabs.setAttribute('role', 'tablist');
  const tabChanges = el('button', 'hist-tab', 'Changes'); tabChanges.type = 'button';
  const tabText = el('button', 'hist-tab', 'Full text'); tabText.type = 'button';
  for (const b of [tabChanges, tabText]) b.setAttribute('role', 'tab');
  tabs.append(tabChanges, tabText);
  const pre = el('div', 'hist-pre');
  pre.tabIndex = 0;
  side.append(tabs, pre);
  body.append(list, side);
  box.append(body);

  const actions = el('div', 'plan-dialog-actions hist-actions');
  const copyBtn = el('button', 'btn quiet', 'Copy text'); copyBtn.type = 'button';
  const cancel = el('button', 'btn quiet', 'Close'); cancel.type = 'button';
  const restoreBtn = el('button', 'btn primary', 'Restore this version'); restoreBtn.type = 'button';
  actions.append(copyBtn, cancel, restoreBtn);
  box.append(actions);

  let sel = 0;
  let mode = 'changes';
  let text = '';
  const rows = versions.map((v, i) => {
    const row = el('button', 'hist-row');
    row.type = 'button';
    row.setAttribute('role', 'option');
    row.append(el('span', 'hist-when', versionTime(v.t)), el('span', 'hist-size', v.deleted ? 'deleted' : sizeText(v.size)));
    row.addEventListener('click', () => select(i));
    list.append(row);
    return row;
  });
  async function show() {
    tabChanges.setAttribute('aria-selected', String(mode === 'changes'));
    tabText.setAttribute('aria-selected', String(mode === 'text'));
    if (mode === 'changes') renderDiff(pre, text, api.current());
    else { pre.replaceChildren(); pre.append(el('div', 'hist-plain', text)); }
  }
  async function select(i) {
    sel = Math.max(0, Math.min(versions.length - 1, i));
    rows.forEach((r, k) => { r.classList.toggle('selected', k === sel); r.setAttribute('aria-selected', String(k === sel)); });
    rows[sel].focus();
    rows[sel].scrollIntoView({ block: 'nearest' });
    text = (await api.get(api.rel, versions[sel].t)) ?? '';
    show();
  }
  list.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); select(sel + 1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); select(sel - 1); }
  });
  tabChanges.addEventListener('click', () => { mode = 'changes'; show(); });
  tabText.addEventListener('click', () => { mode = 'text'; show(); });
  copyBtn.addEventListener('click', () => api.copy(text));
  cancel.addEventListener('click', close);
  restoreBtn.addEventListener('click', async () => {
    restoreBtn.disabled = true;
    const ok = await api.restore(api.rel, versions[sel].t);
    if (ok) close(); else restoreBtn.disabled = false;
  });
  await select(0);
}

// api: { list(), get(rel, t), restore(rel, t), titleOf(rel) }
export async function openDeletedNotes(api) {
  const { box, close } = modal('Recover deleted notes', 'hist-deleted');
  box.append(el('div', 'plan-dialog-title', 'Recover deleted notes'));
  box.append(el('p', 'ask-text', 'Notes deleted in the last seven days. They are also in the system Trash until it is emptied.'));
  const items = await api.list();
  const ok = el('button', 'btn primary', 'Done'); ok.type = 'button'; ok.addEventListener('click', close);
  const list = el('div', 'hist-list hist-list-wide');
  if (!items.length) list.append(el('p', 'hist-empty', 'No deleted notes.'));
  for (const it of items) {
    const row = el('div', 'hist-row hist-row-deleted');
    const name = el('div', 'hist-name');
    name.append(el('span', 'hist-title', api.titleOf(it.rel)), el('span', 'hist-path', it.rel));
    const meta = el('span', 'hist-size', `${versionTime(it.t)} · ${sizeText(it.size)}`);
    const btn = el('button', 'btn', 'Restore'); btn.type = 'button';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const res = await api.restore(it.rel, it.t);
      if (res) {
        // Keep the focus in the dialog (on the next note, or Done), so Esc still closes it.
        const next = row.nextElementSibling || row.previousElementSibling;
        row.remove();
        if (!list.querySelector('.hist-row')) list.append(el('p', 'hist-empty', 'No deleted notes.'));
        ((next && next.querySelector('button')) || ok).focus();
      }
      else btn.disabled = false;
    });
    row.append(name, meta, btn);
    list.append(row);
  }
  box.append(list);
  const actions = el('div', 'plan-dialog-actions hist-actions');
  actions.append(ok);
  box.append(actions);
  (list.querySelector('button') || ok).focus();
}
