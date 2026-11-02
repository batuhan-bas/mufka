// The ```habits block of a habit tracker note (lib/habits.mjs): a card with
// how the week is going, the week's table as days to tick, and the dialog
// that adds a habit.
import { habitSummary } from '../lib/habits.mjs';
import { periodNav } from './budget-view.js';

const SVG = 'http://www.w3.org/2000/svg';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function svg(tag, attrs) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function ring(share, label) {
  const box = el('div', 'bud-ring hab-ring');
  const size = 148; const r = 60; const C = 2 * Math.PI * r;
  const s = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, 'aria-hidden': 'true' });
  s.append(svg('circle', { cx: size / 2, cy: size / 2, r, class: 'bud-track' }));
  if (share > 0) {
    const len = Math.min(share, 1) * C;
    s.append(svg('circle', { cx: size / 2, cy: size / 2, r, class: 'bud-arc bud-left-arc', 'stroke-linecap': 'round', 'stroke-dasharray': `${len} ${C - len}`, transform: `rotate(-90 ${size / 2} ${size / 2})` }));
  }
  const mid = el('div', 'bud-ring-mid');
  mid.append(el('div', 'bud-ring-value', `${Math.round(share * 100)}%`), el('div', 'bud-ring-label', label));
  box.append(s, mid);
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', `${Math.round(share * 100)}% ${label}`);
  return box;
}

export function addHabitButton(onAdd) {
  const b = el('button', 'bud-add', '+ Add habit');
  b.type = 'button';
  b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onAdd(); });
  return b;
}

// The card. today: Mon = 0 … Sun = 6, or -1 when the note is not this week.
export function habitsCard(src, { today = -1, nav = null, onAdd = null } = {}) {
  const sum = habitSummary(src, today);
  const card = el('div', 'bud-card hab-card');
  if (nav) card.append(periodNav(nav));
  const body = el('div', 'bud-body');
  body.append(ring(sum.share, 'of the week'));
  const side = el('div', 'bud-side');
  if (sum.habits.length) {
    const line = el('div', 'bud-spent');
    if (today >= 0) line.append(el('b', '', `${sum.todayDone} of ${sum.todayCount}`), document.createTextNode(' done today'));
    else line.append(el('b', '', `${sum.done} of ${sum.goal}`), document.createTextNode(' check-ins'));
    if (sum.perfectDays) line.append(document.createTextNode(` · ${sum.perfectDays} perfect day${sum.perfectDays === 1 ? '' : 's'}`));
    side.append(line);
    const list = el('ul', 'bud-cats hab-list');
    for (const h of sum.habits) {
      const li = el('li', `bud-cat hab-item${h.met ? ' met' : ''}`);
      li.append(el('span', 'bud-cat-name hab-name', h.name || 'Habit'), el('span', 'bud-cat-amount', h.met ? `${h.done}/${h.goal} ✓` : `${h.done}/${h.goal}`));
      const track = el('span', 'bud-cat-track'); const fill = el('i');
      fill.style.width = `${h.goal ? Math.min(h.done / h.goal, 1) * 100 : 0}%`;
      track.append(fill);
      li.append(track);
      list.append(li);
    }
    side.append(list);
  } else {
    side.append(el('p', 'bud-empty', 'Add a habit, then tick the days you do it.'));
  }
  body.append(side);
  card.append(body);
  if (onAdd && !sum.table) {
    const acts = el('div', 'bud-card-actions');
    acts.append(addHabitButton(onAdd));
    card.append(acts);
  }
  return card;
}

// The week's table as `container` shows it: each day a circle to tick, today's
// column marked. onToggle(line, day).
export function decorateHabitTable(container, table, { today = -1, onToggle }) {
  const trs = [...container.querySelectorAll('tr')];
  const head = trs.find((tr) => tr.querySelector('th'));
  if (head && today >= 0 && table.dayCols[today] !== -1) head.children[table.dayCols[today]]?.classList.add('hab-today');
  const body = trs.filter((tr) => !tr.querySelector('th'));
  body.forEach((tr, j) => {
    const line = table.start + 2 + j;
    const row = table.rows.find((r) => r.line === line);
    if (!row) return;
    tr.classList.add('hab-row');
    table.dayCols.forEach((k, day) => {
      if (k === -1) return;
      const td = tr.children[k];
      if (!td) return;
      if (day === today) td.classList.add('hab-today');
      const done = row.days[day];
      const b = el('button', `hab-cell${done ? ' done' : ''}`);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(Boolean(done)));
      b.setAttribute('aria-label', `${row.name || 'Habit'}, ${DAYS[day]}`);
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onToggle(line, day); });
      td.replaceChildren(b);
    });
  });
}

// The add dialog. onSave({ name, goal }).
export function openHabitDialog(onSave) {
  const layer = el('div', 'palette-layer');
  const box = el('div', 'palette plan-dialog bud-dialog');
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Add habit');
  box.append(el('div', 'plan-dialog-title', 'Add habit'));
  const nameField = el('div', 'bud-field');
  const label = el('label', '', 'Habit'); label.htmlFor = 'hab-name';
  const name = el('input', 'ask-input hab-name-input'); name.id = 'hab-name'; name.placeholder = '🧘 Stretch for 10 minutes';
  nameField.append(label, name);
  box.append(nameField);
  const goalField = el('div', 'bud-field');
  goalField.append(el('div', 'bud-field-label', 'Days a week'));
  const pills = el('div', 'bud-pills hab-goals');
  pills.setAttribute('role', 'radiogroup'); pills.setAttribute('aria-label', 'Days a week');
  let goal = 7;
  const pick = (n) => { goal = n; for (const p of pills.children) p.setAttribute('aria-checked', String(Number(p.dataset.n) === n)); };
  for (let n = 1; n <= 7; n++) {
    const p = el('button', 'bud-pill bud-chip bud-c0 hab-goal', n === 7 ? 'Every day' : String(n));
    p.type = 'button'; p.dataset.n = String(n); p.setAttribute('role', 'radio');
    p.addEventListener('click', () => pick(n));
    pills.append(p);
  }
  pick(7);
  goalField.append(pills);
  box.append(goalField);
  const restore = document.activeElement;
  const close = () => { layer.remove(); if (restore && restore.isConnected) restore.focus(); };
  const save = () => {
    if (!name.value.trim()) { name.focus(); return; }
    close();
    onSave({ name: name.value.trim(), goal });
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
  name.focus();
}
