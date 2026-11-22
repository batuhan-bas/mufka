// Obsidian Bases (lib/bases): a base drawn as a table, cards or a list, with
// its views as tabs above. A note's own properties can be changed in the
// table; everything else is read-only, as in Obsidian.
import { Link } from '../lib/dataview/values.mjs';
import { FileRef, isDate, isDuration, textOf } from '../lib/bases/expr.mjs';
import { editableKey, propRef } from '../lib/bases/base.mjs';
import { icon } from './icons.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const VIEW_ICONS = { table: 'template', cards: 'tiImage', list: 'outline' };

// A date as "30 Oct 2026" (with the time when it has one).
function dateText(d) {
  const js = d.toJSDate();
  const day = js.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return d.hour || d.minute ? `${day} ${d.toFormat('HH:mm')}` : day;
}

// One value as nodes. o: { onOpen(rel), onExternal(url), imageUrl(path, fromRel) }
export function valueNodes(v, o, fromRel = '') {
  if (v == null || v === '') return [];
  if (v instanceof Link || v instanceof FileRef) {
    const path = v.path;
    const a = el('a', 'base-link', v instanceof Link ? (v.display || v.fileName()) : v.basename);
    a.href = '#'; a.dataset.rel = path;
    a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); o.onOpen(path, e); });
    return [a];
  }
  if (Array.isArray(v)) {
    const out = [];
    v.forEach((x, i) => {
      const chip = el('span', 'base-chip');
      const n = valueNodes(x, o, fromRel);
      if (!n.length) return;
      chip.append(...n);
      if (i && out.length) out.push(document.createTextNode(' '));
      out.push(chip);
    });
    return out;
  }
  if (typeof v === 'object' && v.__url) {
    const a = el('a', 'base-link', v.display || v.__url);
    a.href = v.__url;
    a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); o.onExternal(v.__url); });
    return [a];
  }
  if (typeof v === 'object' && v.__image) {
    const url = o.imageUrl(v.__image, fromRel);
    if (!url) return [];
    const img = el('img', 'base-img'); img.src = url; img.alt = '';
    return [img];
  }
  if (typeof v === 'object' && v.__icon) return [];
  if (typeof v === 'boolean') {
    const box = el('input', 'base-check'); box.type = 'checkbox'; box.checked = v; box.disabled = true;
    return [box];
  }
  if (isDate(v)) return [document.createTextNode(dateText(v))];
  if (typeof v === 'number') return [document.createTextNode(Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 }))];
  if (isDuration(v)) return [document.createTextNode(textOf(v))];
  if (typeof v === 'string' && /^https?:\/\/\S+$/i.test(v)) return valueNodes({ __url: v }, o, fromRel);
  return [document.createTextNode(textOf(v))];
}

// The tabs, the count and "+ New" above a base.
function toolbar(res, o) {
  const bar = el('div', 'base-toolbar');
  const tabs = el('div', 'base-tabs');
  tabs.setAttribute('role', 'tablist');
  const views = o.embedded ? [[res.view, res.viewIndex]] : res.config.views.map((v, i) => [v, i]);
  for (const [v, i] of views) {
    const b = el('button', `base-tab${i === res.viewIndex ? ' on' : ''}`);
    b.type = 'button'; b.dataset.view = String(i);
    b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(i === res.viewIndex));
    b.append(icon(VIEW_ICONS[v.type] || 'template', { size: 14 }), el('span', null, v.name));
    if (!o.embedded) b.addEventListener('click', () => o.onView(i));
    tabs.append(b);
  }
  bar.append(tabs, el('span', 'base-count', `${res.total} ${res.total === 1 ? 'result' : 'results'}${res.shown < res.total ? ` · ${res.shown} shown` : ''}`));
  bar.append(el('span', 'base-gap'));
  if (o.onOpenBase) {
    const open = el('button', 'btn quiet base-open', 'Open base'); open.type = 'button';
    open.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); o.onOpenBase(); });
    bar.append(open);
  }
  if (o.onNew) {
    const add = el('button', 'btn primary base-new');
    add.type = 'button';
    add.append(icon('plus', { size: 14 }), el('span', null, 'New'));
    add.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); o.onNew(); });
    bar.append(add);
  }
  return bar;
}

// A cell that can be changed: click to type; Enter or leaving saves, Esc
// leaves it as it was. A checkbox saves on click.
function editableCell(td, row, key, o) {
  const prop = editableKey(key);
  const v = row.values[key];
  if (!prop || !o.onEdit) return;
  if (typeof v === 'boolean') {
    const box = td.querySelector('input.base-check');
    if (box) { box.disabled = false; box.addEventListener('change', () => o.onEdit(row.rel, prop, v, box.checked)); }
    return;
  }
  if (v instanceof Link || (Array.isArray(v) && v.some((x) => x instanceof Link)) || (v && typeof v === 'object' && !Array.isArray(v) && !isDate(v))) return;
  td.classList.add('can-edit');
  td.title = 'Click to change';
  td.addEventListener('click', (e) => {
    if (e.target.closest('a, input') || td.classList.contains('editing')) return;
    const input = el('input', 'base-cell-input');
    input.value = v == null ? '' : Array.isArray(v) ? v.map(textOf).join(', ') : isDate(v) ? v.toFormat(v.hour || v.minute ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd') : textOf(v);
    td.classList.add('editing');
    td.replaceChildren(input);
    input.focus(); input.select();
    let done = false;
    const finish = (save) => {
      if (done) return; done = true;
      if (save && input.value !== (v == null ? '' : input.defaultValue)) o.onEdit(row.rel, prop, v, input.value);
      else o.onCancel();
    };
    input.defaultValue = input.value;
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); finish(true); }
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  });
}

function summaryText(s) {
  if (!s) return null;
  const v = s.value;
  return `${s.name} ${v == null ? '—' : isDate(v) ? dateText(v) : typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : textOf(v)}`;
}

function tableView(res, o) {
  const wrap = el('div', 'base-table-wrap');
  const table = el('table', 'base-table');
  const head = el('thead');
  const hr = el('tr');
  for (const c of res.columns) {
    const th = el('th', null, c.label);
    th.dataset.key = c.key;
    hr.append(th);
  }
  head.append(hr);
  table.append(head);
  for (const g of res.groups) {
    const body = el('tbody');
    if (g.label != null) {
      const tr = el('tr', 'base-group-row');
      const td = el('td', null);
      td.colSpan = res.columns.length;
      td.append(el('span', 'base-group-name', g.label), el('span', 'base-group-count', String(g.rows.length)));
      tr.append(td);
      body.append(tr);
    }
    for (const row of g.rows) {
      const tr = el('tr', 'base-row');
      tr.dataset.rel = row.rel;
      for (const c of res.columns) {
        const td = el('td');
        td.dataset.key = c.key;
        const v = row.values[c.key];
        if (typeof v === 'number') td.classList.add('num');
        td.append(...valueNodes(v, o, row.rel));
        editableCell(td, row, c.key, o);
        tr.append(td);
      }
      body.append(tr);
    }
    table.append(body);
  }
  if (Object.keys(res.summaries).length) {
    const foot = el('tfoot');
    const tr = el('tr');
    for (const c of res.columns) {
      const td = el('td', 'base-summary', summaryText(res.summaries[c.key]));
      if (res.summaries[c.key] && typeof res.summaries[c.key].value === 'number') td.classList.add('num');
      tr.append(td);
    }
    foot.append(tr);
    table.append(foot);
  }
  wrap.append(table);
  return wrap;
}

// The image of a card: the view's `image` property.
function cardImage(row, res, o) {
  const key = res.view.image;
  if (!key) return null;
  const v = row.imageValue;
  let path = null;
  // An image link from a property ("[[cover.png]]") reads as a note link that
  // did not resolve: "cover.png.md".
  if (v instanceof Link) path = v.path.replace(/(\.[a-z0-9]+)\.md$/i, '$1');
  else if (v && typeof v === 'object' && v.__image) path = v.__image;
  else if (typeof v === 'string' && v.trim()) path = v.trim().replace(/^!?\[\[|\]\]$/g, '').split('|')[0];
  const box = el('div', 'base-card-image');
  const ratio = Number(res.view.imageAspectRatio);
  box.style.aspectRatio = String(1 / (ratio > 0 ? ratio : 1));
  const url = path ? o.imageUrl(path, row.rel) : '';
  if (url) {
    const img = el('img'); img.src = url; img.alt = ''; img.draggable = false;
    if (res.view.imageFit === 'contain') img.classList.add('contain');
    box.append(img);
  } else box.classList.add('empty');
  return box;
}

function cardsView(res, o) {
  const box = el('div', 'base-cards-wrap');
  const size = Number(res.view.cardSize);
  for (const g of res.groups) {
    if (g.label != null) {
      const h = el('div', 'base-group-head');
      h.append(el('span', 'base-group-name', g.label), el('span', 'base-group-count', String(g.rows.length)));
      box.append(h);
    }
    const grid = el('div', 'base-cards');
    if (size > 0) grid.style.setProperty('--card', `${Math.max(120, Math.min(480, size))}px`);
    for (const row of g.rows) {
      const card = el('div', 'base-card');
      card.dataset.rel = row.rel; card.tabIndex = 0;
      card.setAttribute('role', 'button');
      const img = cardImage(row, res, o);
      if (img) card.append(img);
      const meta = el('div', 'base-card-meta');
      meta.append(el('b', 'base-card-title', row.title));
      for (const c of res.columns) {
        if (c.key === 'file.name' || c.key === propRef(res.view.image || '').id) continue;
        const n = valueNodes(row.values[c.key], o, row.rel);
        if (!n.length) continue;
        const line = el('div', 'base-card-line');
        line.append(el('span', 'base-card-label', c.label), ...n);
        meta.append(line);
      }
      card.append(meta);
      card.addEventListener('click', (e) => { if (!e.target.closest('a, input')) o.onOpen(row.rel, e); });
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') o.onOpen(row.rel, e); });
      grid.append(card);
    }
    box.append(grid);
  }
  return box;
}

function listView(res, o) {
  const box = el('div', 'base-list-wrap');
  const markers = String(res.view.markers || 'bullet');
  for (const g of res.groups) {
    if (g.label != null) {
      const h = el('div', 'base-group-head');
      h.append(el('span', 'base-group-name', g.label), el('span', 'base-group-count', String(g.rows.length)));
      box.append(h);
    }
    const list = el(markers === 'number' ? 'ol' : 'ul', `base-list${markers === 'none' ? ' plain' : ''}`);
    for (const row of g.rows) {
      const li = el('li', 'base-list-item');
      li.dataset.rel = row.rel;
      let first = true;
      for (const c of res.columns) {
        const n = valueNodes(row.values[c.key], o, row.rel);
        if (!n.length) continue;
        if (!first) li.append(el('span', 'base-sep', String(res.view.separator ?? ' · ')));
        li.append(...n);
        first = false;
      }
      if (first) li.append(...valueNodes(new Link(row.rel, { display: row.title }), o, row.rel));
      list.append(li);
    }
    box.append(list);
  }
  return box;
}

// The whole base. res: runBase's result (with config). o: { embedded, onView(i),
// onOpen(rel, e), onExternal(url), imageUrl(path, fromRel), onEdit(rel, key,
// old, input), onCancel(), onNew(), onOpenBase() }
export function baseView(res, o) {
  const box = el('div', `base-view${o.embedded ? ' embedded' : ''}`);
  // In a note, a press on a card, a tab or a cell is for the base, not for
  // editing the note's text there (a press elsewhere in it still is).
  box.addEventListener('mousedown', (e) => { if (e.target.closest('.base-card, .base-tab, .base-new, .base-open, td.can-edit, .base-cell-input')) e.stopPropagation(); });
  if (res.error) {
    box.append(el('div', 'base-error', res.error));
    return box;
  }
  box.append(toolbar(res, o));
  if (!res.total) {
    box.append(el('p', 'base-empty', 'No notes match this view yet.'));
    return box;
  }
  if (res.view.type === 'cards') box.append(cardsView(res, o));
  else if (res.view.type === 'list') box.append(listView(res, o));
  else {
    if (!['table'].includes(res.view.type)) box.append(el('p', 'base-note', `"${res.view.type}" views are not in Mufka yet; shown as a table.`));
    box.append(tableView(res, o));
  }
  return box;
}
