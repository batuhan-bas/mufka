// The ```budget block of a budget note (lib/budget.mjs): a card with what came
// in, what went out and what is left, a ring of where it went, and the dialog
// that adds an income or an expense as a row of the note's table.
import { budgetSummary, categoryChoices, parseAmount } from '../lib/budget.mjs';

const SVG = 'http://www.w3.org/2000/svg';
const COLOURS = 6; // .bud-c0 … .bud-c5

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

// "₺" and "$" go before the number, "TRY" or "EUR" after it.
export function moneyFormat(currency) {
  const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  const c = String(currency || '').trim();
  return (n) => {
    const s = nf.format(Math.abs(n));
    const sign = n < 0 ? '−' : '';
    if (!c) return sign + s;
    return c.length <= 2 ? `${sign}${c}${s}` : `${sign}${s} ${c}`;
  };
}

// A colour per category, the same in the card, the table and the dialog.
export function categoryColours(src, code) {
  const names = categoryChoices(src, code).map((c) => c.toLowerCase());
  return (name) => {
    const i = names.indexOf(String(name || '').toLowerCase());
    return `bud-c${(i === -1 ? names.length : i) % COLOURS}`;
  };
}

// The ring: each category's share of the income (of the expenses when they
// are more), and what is left in green.
function ring(sum, colourOf, money) {
  const box = el('div', 'bud-ring');
  const size = 148; const r = 60; const C = 2 * Math.PI * r; const gap = 2;
  const s = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, 'aria-hidden': 'true' });
  s.append(svg('circle', { cx: size / 2, cy: size / 2, r, class: 'bud-track' }));
  const g = svg('g', { transform: `rotate(-90 ${size / 2} ${size / 2})` });
  const whole = Math.max(sum.income, sum.expenses);
  let at = 0;
  const arc = (value, cls) => {
    const len = whole ? (value / whole) * C : 0;
    if (len <= 0) return;
    const shown = Math.max(len - gap, 1);
    g.append(svg('circle', { cx: size / 2, cy: size / 2, r, class: `bud-arc ${cls}`, 'stroke-dasharray': `${shown} ${C - shown}`, 'stroke-dashoffset': -at }));
    at += len;
  };
  for (const c of sum.categories) if (c.total > 0) arc(c.total, colourOf(c.name));
  if (sum.left > 0) arc(sum.left, 'bud-left-arc');
  s.append(g);
  const mid = el('div', 'bud-ring-mid');
  const over = sum.left < 0;
  mid.append(el('div', `bud-ring-value${over ? ' over' : ''}`, whole ? money(sum.left) : '—'));
  mid.append(el('div', 'bud-ring-label', over ? 'over budget' : 'left'));
  box.append(s, mid);
  const spent = Number.isFinite(sum.spent) ? `${Math.round(sum.spent * 100)}% of income spent` : 'No income yet';
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', whole ? `${money(sum.left)} ${over ? 'over budget' : 'left'}; ${spent}` : 'Nothing added yet');
  return box;
}

// ‹ September 2026 · October 2026 › — the other months' budget notes.
// nav: { current, prev, next: { label, open } | null, newMonth: { label, create } | null }
function monthNav(nav) {
  const bar = el('div', 'bud-nav');
  const step = (item, dir) => {
    const b = el('button', 'bud-nav-step', dir < 0 ? '‹' : '›'); b.type = 'button';
    if (item) {
      const label = item.label || '';
      b.title = item.create ? `Start ${label}` : label;
      b.setAttribute('aria-label', item.create ? `Start ${label}` : `Open ${label}`);
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); (item.create || item.open)(); });
    } else { b.disabled = true; b.setAttribute('aria-label', dir < 0 ? 'No earlier month' : 'No later month'); }
    return b;
  };
  bar.append(step(nav.prev, -1), el('span', 'bud-nav-month', nav.current), step(nav.next || nav.newMonth, 1));
  if (!nav.next && nav.newMonth) {
    const start = el('button', 'bud-nav-new', `+ Start ${nav.newMonth.label}`); start.type = 'button';
    start.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); nav.newMonth.create(); });
    bar.append(start);
  }
  return bar;
}

// The card. onAdd(kind) is offered when a table is still missing (otherwise
// the "+ Add" buttons sit under the tables).
export function budgetCard(src, code, { onAdd, nav } = {}) {
  const sum = budgetSummary(src, code);
  const money = moneyFormat(sum.currency);
  const colourOf = categoryColours(src, code);
  const card = el('div', 'bud-card');
  if (nav) card.append(monthNav(nav));

  const stats = el('div', 'bud-stats');
  const stat = (label, value, cls) => {
    const t = el('div', `bud-stat ${cls}`);
    t.append(el('div', 'bud-stat-label', label), el('div', 'bud-stat-value', money(value)));
    return t;
  };
  stats.append(stat('Income', sum.income, 'in'), stat('Expenses', sum.expenses, 'out'), stat('Left', sum.left, sum.left < 0 ? 'left over' : 'left'));
  card.append(stats);

  const body = el('div', 'bud-body');
  body.append(ring(sum, colourOf, money));
  const side = el('div', 'bud-side');
  if (sum.income || sum.expenses) {
    const pct = Number.isFinite(sum.spent) ? Math.round(sum.spent * 100) : null;
    const line = el('div', 'bud-spent');
    if (pct != null) { line.append(el('b', '', `${pct}%`), document.createTextNode(' of income spent')); } else line.textContent = 'No income added yet';
    side.append(line);
  }
  if (sum.categories.length) {
    side.append(el('div', 'bud-sub', 'Where it went'));
    const list = el('ul', 'bud-cats');
    for (const c of sum.categories) {
      const li = el('li', `bud-cat ${colourOf(c.name)}`);
      li.append(el('span', 'bud-cat-name', c.name), el('span', 'bud-cat-amount', `${money(c.total)} · ${Math.round(c.share * 100)}%`));
      const track = el('span', 'bud-cat-track'); const fill = el('i');
      fill.style.width = `${Math.max(c.share * 100, 1)}%`;
      track.append(fill);
      li.append(track);
      list.append(li);
    }
    side.append(list);
  } else {
    side.append(el('p', 'bud-empty', sum.hasRows ? 'No expenses yet.' : 'Add what comes in and what goes out below; the totals work themselves out.'));
  }
  body.append(side);
  card.append(body);

  if (onAdd && (!sum.tables.income || !sum.tables.expenses)) {
    const acts = el('div', 'bud-card-actions');
    if (!sum.tables.income) acts.append(addButton('income', onAdd));
    if (!sum.tables.expenses) acts.append(addButton('expenses', onAdd));
    card.append(acts);
  }
  return card;
}

export function addButton(kind, onAdd) {
  const b = el('button', 'bud-add', kind === 'income' ? '+ Add income' : '+ Add expense');
  b.type = 'button';
  b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onAdd(kind); });
  return b;
}

// The income or expenses table as `container` shows it: amounts as money,
// categories as coloured chips. The note keeps the plain text.
export function decorateBudgetTable(container, columns, { money, colourOf }) {
  for (const tr of container.querySelectorAll('tr')) {
    const cells = tr.children;
    const amount = cells[columns.amount];
    if (amount && amount.tagName === 'TD' && !amount.dataset.money) {
      const n = parseAmount(amount.textContent);
      if (n != null) { amount.dataset.money = '1'; amount.textContent = money(n); }
    }
    const cat = columns.category === -1 ? null : cells[columns.category];
    if (cat && cat.tagName === 'TD' && cat.textContent.trim() && !cat.querySelector('.bud-chip')) {
      const name = cat.textContent.trim();
      cat.replaceChildren(el('span', `bud-chip ${colourOf(name)}`, name));
    }
  }
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// The add dialog. onSave({ date, what, category, amount }).
export function openAddDialog({ kind, categories = [], currency = '', colourOf = () => 'bud-c0' }, onSave) {
  const expense = kind === 'expenses';
  const heading = expense ? 'Add expense' : 'Add income';
  const layer = el('div', 'palette-layer');
  const box = el('div', 'palette plan-dialog bud-dialog');
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', heading);
  box.append(el('div', 'plan-dialog-title', heading));

  let n = 0;
  const field = (label, input) => {
    const id = `bud-f${(n += 1)}`;
    input.id = id;
    const f = el('div', 'bud-field');
    const l = el('label', '', label); l.htmlFor = id;
    f.append(l, input);
    return f;
  };
  const input = (cls, attrs = {}) => { const i = el('input', `ask-input ${cls}`); Object.assign(i, attrs); return i; };
  const what = input('bud-what', { placeholder: expense ? 'Coffee beans' : 'Salary' });
  const amount = input('bud-amount', { inputMode: 'decimal', placeholder: currency ? `${currency} 0` : '0' });
  const date = input('bud-date', { type: 'date', value: today() });
  box.append(field(expense ? 'What' : 'Source', what));
  const two = el('div', 'bud-two');
  two.append(field('Amount', amount), field('Date', date));
  box.append(two);

  let category = ''; let fresh = null;
  if (expense) {
    const f = el('div', 'bud-field');
    f.append(el('div', 'bud-field-label', 'Category'));
    const pills = el('div', 'bud-pills');
    pills.setAttribute('role', 'radiogroup'); pills.setAttribute('aria-label', 'Category');
    const pick = (name) => {
      category = name;
      for (const p of pills.querySelectorAll('.bud-pill')) p.setAttribute('aria-checked', String(p.dataset.name === name));
    };
    const pill = (name) => {
      const p = el('button', `bud-pill bud-chip ${colourOf(name)}`, name);
      p.type = 'button'; p.dataset.name = name; p.setAttribute('role', 'radio'); p.setAttribute('aria-checked', 'false');
      p.addEventListener('click', () => pick(category === name ? '' : name));
      return p;
    };
    for (const c of categories) pills.append(pill(c));
    fresh = input('bud-new-cat', { placeholder: '+ New' });
    fresh.setAttribute('aria-label', 'New category');
    fresh.addEventListener('input', () => { if (fresh.value.trim()) pick(''); });
    pills.append(fresh);
    f.append(pills);
    box.append(f);
  }

  const err = el('div', 'bud-error'); err.setAttribute('role', 'alert');
  box.append(err);
  const restore = document.activeElement;
  const close = () => { layer.remove(); if (restore && restore.isConnected) restore.focus(); };
  const save = () => {
    const value = parseAmount(amount.value);
    if (value == null) { err.textContent = 'Enter an amount.'; amount.focus(); return; }
    const cat = expense ? (fresh.value.trim() || category) : '';
    close();
    onSave({ date: date.value || today(), what: what.value.trim(), category: cat, amount: value });
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
  what.focus();
}
