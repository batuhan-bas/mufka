// Drawing Dataview results: tables, lists, task lists and a month calendar, in
// the note's own styles. `opts.md(src)` renders inline Markdown (strings and
// links are Markdown, as in Dataview); `opts.doc` is the document.
import { formatDate, formatDuration, isLink, isDate, isDuration, typeOf, DateTime } from './values.mjs';

const el = (doc, tag, cls, text) => {
  const e = doc.createElement(tag);
  if (cls) e.setAttribute('class', cls);
  if (text != null) e.appendChild(doc.createTextNode(String(text)));
  return e;
};
const appendAll = (parent, nodes) => { for (const n of nodes) parent.appendChild(n); return parent; };

// A link as Markdown, shown by its note's name unless it has its own text.
export function linkMarkdown(l) {
  const target = l.path.replace(/\.md$/i, '') + (l.subpath ? `#${l.subpath}` : '');
  const shown = l.display != null ? l.display : (l.subpath ? l.subpath : l.fileName());
  return `${l.embed ? '!' : ''}[[${target}|${shown.replace(/[|\]]/g, ' ')}]]`;
}

export function renderValue(v, opts) {
  const { doc } = opts;
  switch (typeOf(v)) {
    case 'null': return [el(doc, 'span', 'dv-null', '-')];
    case 'string': return v === '' ? [] : opts.md(v);
    case 'number':
    case 'boolean': return [doc.createTextNode(String(v))];
    case 'date': return [doc.createTextNode(formatDate(v))];
    case 'duration': return [doc.createTextNode(formatDuration(v))];
    case 'link': return opts.md(linkMarkdown(v));
    case 'array': {
      if (!v.length) return [];
      if (v.length === 1 && typeOf(v[0]) !== 'array') return renderValue(v[0], opts);
      const ul = el(doc, 'ul', 'dv-value-list');
      for (const x of v) ul.appendChild(appendAll(el(doc, 'li'), renderValue(x, opts)));
      return [ul];
    }
    case 'object': {
      if (v.lambda) return [doc.createTextNode('<function>')];
      const ul = el(doc, 'ul', 'dv-value-list');
      for (const [k, x] of Object.entries(v)) {
        const li = el(doc, 'li');
        li.appendChild(el(doc, 'span', 'dv-key', `${k}: `));
        appendAll(li, renderValue(x, opts));
        ul.appendChild(li);
      }
      return [ul];
    }
    default: return [doc.createTextNode(String(v))];
  }
}

export function renderError(message, doc) {
  const box = el(doc, 'div', 'dataview dv-error');
  box.appendChild(el(doc, 'b', null, 'Dataview: '));
  box.appendChild(doc.createTextNode(message));
  return box;
}

function empty(doc, what) {
  return el(doc, 'p', 'dv-empty', `No results for this ${what}.`);
}

function table(r, opts) {
  const { doc } = opts;
  const box = el(doc, 'div', 'dataview dv-table-wrap');
  if (!r.rows.length) return appendAll(box, [empty(doc, 'table')]);
  const t = el(doc, 'table', 'dv-table');
  const head = el(doc, 'tr');
  if (r.idColumn) {
    const th = el(doc, 'th', null, r.idColumn);
    th.appendChild(el(doc, 'span', 'dv-count', String(r.count)));
    head.appendChild(th);
  }
  for (const h of r.headers) head.appendChild(el(doc, 'th', null, h));
  t.appendChild(appendAll(el(doc, 'thead'), [head]));
  const body = el(doc, 'tbody');
  for (const row of r.rows) {
    const tr = el(doc, 'tr');
    for (const v of row) tr.appendChild(appendAll(el(doc, 'td'), renderValue(v, opts)));
    body.appendChild(tr);
  }
  t.appendChild(body);
  box.appendChild(t);
  return box;
}

function list(r, opts) {
  const { doc } = opts;
  const box = el(doc, 'div', 'dataview dv-list-wrap');
  if (r.groups) {
    if (!r.groups.length) return appendAll(box, [empty(doc, 'list')]);
    const ul = el(doc, 'ul', 'dv-list');
    for (const g of r.groups) {
      const li = appendAll(el(doc, 'li'), renderValue(g.key, opts));
      const inner = el(doc, 'ul');
      for (const id of g.items) inner.appendChild(appendAll(el(doc, 'li'), renderValue(id, opts)));
      li.appendChild(inner);
      ul.appendChild(li);
    }
    return appendAll(box, [ul]);
  }
  if (!r.items.length) return appendAll(box, [empty(doc, 'list')]);
  const ul = el(doc, 'ul', 'dv-list');
  for (const it of r.items) {
    const li = el(doc, 'li');
    if (it.id !== undefined) appendAll(li, renderValue(it.id, opts));
    if (it.id !== undefined && it.value !== undefined) li.appendChild(doc.createTextNode(': '));
    if (it.value !== undefined) appendAll(li, renderValue(it.value, opts));
    ul.appendChild(li);
  }
  return appendAll(box, [ul]);
}

function taskItem(t, opts) {
  const { doc } = opts;
  const li = el(doc, 'li', t.task ? 'task dv-task' : 'dv-task-note');
  if (t.task) {
    const box = el(doc, 'input', 'dv-task-check');
    box.setAttribute('type', 'checkbox');
    box.setAttribute('data-path', t.path);
    box.setAttribute('data-line', String(t.line));
    if (t.checked) box.setAttribute('checked', '');
    if (t.completed) li.setAttribute('data-done', '');
    li.appendChild(box);
  }
  const text = el(doc, 'span', 'dv-task-text');
  appendAll(text, t.text.trim() ? opts.md(t.text) : []);
  li.appendChild(text);
  if (t.children && t.children.length) {
    const ul = el(doc, 'ul', 'contains-task-list');
    for (const c of t.children) ul.appendChild(taskItem(c, opts));
    li.appendChild(ul);
  }
  return li;
}

function tasks(r, opts) {
  const { doc } = opts;
  const box = el(doc, 'div', 'dataview dv-tasks');
  const groups = r.groups.filter((g) => g.tasks.length);
  if (!groups.length) return appendAll(box, [empty(doc, 'task list')]);
  for (const g of groups) {
    if (!r.flat || groups.length > 1) {
      const h = el(doc, 'div', 'dv-task-group');
      appendAll(h, renderValue(g.key, opts));
      h.appendChild(el(doc, 'span', 'dv-count', String(g.tasks.length)));
      box.appendChild(h);
    }
    const ul = el(doc, 'ul', 'contains-task-list');
    for (const t of g.tasks) ul.appendChild(taskItem(t, opts));
    box.appendChild(ul);
  }
  return box;
}

// A month grid; days with entries carry links. `month` is any date in it.
function calendar(r, opts, month) {
  const { doc } = opts;
  const box = el(doc, 'div', 'dataview dv-calendar');
  const latest = r.entries.reduce((a, b) => (a && a.date > b.date ? a : b), null);
  const shown = (month || (latest ? latest.date : DateTime.now())).startOf('month');
  const head = el(doc, 'div', 'dv-cal-head');
  const prev = el(doc, 'button', 'dv-cal-nav', '‹');
  const next = el(doc, 'button', 'dv-cal-nav', '›');
  prev.setAttribute('type', 'button'); prev.setAttribute('aria-label', 'Previous month');
  next.setAttribute('type', 'button'); next.setAttribute('aria-label', 'Next month');
  head.appendChild(prev);
  head.appendChild(el(doc, 'span', 'dv-cal-title', shown.toFormat('LLLL yyyy')));
  head.appendChild(next);
  box.appendChild(head);
  const grid = el(doc, 'div', 'dv-cal-grid');
  for (let i = 0; i < 7; i++) grid.appendChild(el(doc, 'span', 'dv-cal-wd', shown.startOf('week').plus({ days: i }).toFormat('ccc')));
  const first = shown.startOf('week');
  const last = shown.endOf('month').endOf('week');
  for (let d = first; d <= last; d = d.plus({ days: 1 })) {
    const cell = el(doc, 'div', d.month === shown.month ? 'dv-cal-day' : 'dv-cal-day dv-cal-out');
    cell.appendChild(el(doc, 'span', 'dv-cal-num', String(d.day)));
    const hits = r.entries.filter((e) => e.date.hasSame(d, 'day'));
    for (const h of hits) {
      const dot = el(doc, 'span', 'dv-cal-dot');
      appendAll(dot, opts.md(linkMarkdown(h.link.withDisplay ? h.link.withDisplay('●') : h.link)));
      cell.appendChild(dot);
    }
    grid.appendChild(cell);
  }
  box.appendChild(grid);
  if (typeof prev.addEventListener === 'function') {
    const redraw = (m) => box.replaceWith(attachRefresh(calendar(r, opts, m), opts));
    prev.addEventListener('click', () => redraw(shown.minus({ months: 1 })));
    next.addEventListener('click', () => redraw(shown.plus({ months: 1 })));
  }
  return box;
}

function attachRefresh(node, opts) {
  if (opts.onRender) opts.onRender(node);
  return node;
}

export function renderResult(r, opts) {
  switch (r.type) {
    case 'table': return table(r, opts);
    case 'list': return list(r, opts);
    case 'task': return tasks(r, opts);
    case 'calendar': return calendar(r, opts);
    default: return renderError('Unknown result', opts.doc);
  }
}

export { isLink, isDate, isDuration };
