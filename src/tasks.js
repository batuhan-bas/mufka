// Tasks: a board of cards in columns (To do · In progress · Test · Done by
// default). A board is a Markdown note in the format of Obsidian's Kanban
// plugin (lib/kanban.mjs), so the same file opens as a board there too.
//
// Everything that changes data goes through `api` (src/renderer.js): this file
// draws the board and turns input into new boards (lib/kanban.mjs), which
// api.save writes to the note.
//
// Moving a card: drag it, or on a focused card ⌥←/⌥→ another column, ⌥↑/⌥↓
// up and down; Enter opens it, Delete removes it.

import { keyLabel } from '../lib/keys.mjs';
import {
  parseCard, composeCard, urlLabel, addCard, updateCard, removeCard, moveCard,
  addColumn, renameColumn, removeColumn, moveColumn, setCompleteColumn, cardMatches, boardTags,
  isDefaultColumn, missingDefaults, addDefaultColumn,
  CARD_TYPES, PRIORITIES,
} from '../lib/kanban.mjs';
import { icon } from './icons.js';

const K = (text) => keyLabel(text, Boolean(window.planner && window.planner.isMac));
const TYPE_LABEL = { feature: 'Feature', bug: 'Bug', chore: 'Chore' };

let filter = { text: '', type: null, priority: null, tag: null };
let filterRel = null;    // the filter belongs to one board
let renaming = null;     // column index whose title is being edited
let dialogOpen = false;
let drag = null;         // { kind: 'card', col, card } | { kind: 'col', col }
let scrollLeft = 0;
let focusAfter = null;   // { col, card } to focus after the next render

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function btn(cls, label, fn, title) {
  const b = el('button', cls, label);
  b.type = 'button';
  if (title) b.title = title;
  if (fn) b.addEventListener('click', fn);
  return b;
}

// True while a field of the board is open: the renderer must not rebuild it.
export function tasksEditing() { return renaming !== null || dialogOpen; }

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function prettyDue(key) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const sameYear = y === new Date().getFullYear();
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function renderTasks(container, api) {
  const root = el('div', 'tasks');
  root.setAttribute('aria-label', 'Tasks');
  if (!api.rel) { root.append(emptyState(api)); container.append(root); return; }
  if (filterRel !== api.rel) { filter = { text: '', type: null, priority: null, tag: null }; filterRel = api.rel; renaming = null; }
  const board = api.board;
  root.append(header(board, api));
  const cols = el('div', 'tk-columns');
  cols.addEventListener('scroll', () => { scrollLeft = cols.scrollLeft; });
  board.columns.forEach((col, ci) => cols.append(column(board, col, ci, api)));
  // A column of your own goes before Done; a removed default column (To do,
  // In progress, Test, Done) can be put back from the same button.
  const newColumn = () => {
    const done = board.columns.findIndex((c) => c.complete);
    const at = done === -1 ? board.columns.length : done;
    renaming = at;
    api.save(addColumn(board, 'New column', at), 'Column added');
  };
  const addCol = btn('tk-add-col', null, (e) => {
    const missing = missingDefaults(board);
    if (!missing.length) { newColumn(); return; }
    e.stopPropagation();
    api.menu('tk-add-col', () => [
      { label: 'New column', fn: () => { api.closeMenu(); newColumn(); } },
      ...missing.map((t) => ({ label: `Add ${t} back`, fn: () => { api.closeMenu(); api.save(addDefaultColumn(board, t), `${t} added back`); } })),
    ]);
  }, 'Add a column of your own');
  addCol.dataset.menuAnchor = 'tk-add-col';
  addCol.append(icon('plus', { size: 15 }), el('span', null, 'Add column'));
  cols.append(addCol);
  root.append(cols);
  const live = el('div', 'tk-sr'); live.id = 'tk-live'; live.setAttribute('aria-live', 'polite');
  root.append(live);
  container.append(root);
  cols.scrollLeft = scrollLeft;
  requestAnimationFrame(() => {
    const field = root.querySelector('.tk-col-rename');
    if (field) { field.focus(); field.select(); return; }
    if (focusAfter) {
      const f = focusAfter; focusAfter = null;
      root.querySelector(`.tk-card[data-col="${f.col}"][data-card="${f.card}"]`)?.focus();
    }
  });
}

function emptyState(api) {
  const box = el('div', 'tk-empty');
  box.append(icon('kanban', { size: 34 }));
  box.append(el('h2', null, 'Tasks'));
  box.append(el('p', null, 'A board for each project: tasks in To do, In progress, Test and Done. Boards are Markdown notes in the Tasks folder, and open as boards in Obsidian\'s Kanban plugin too.'));
  const b = btn('btn primary', null, () => api.newBoard());
  b.append(icon('plus', { size: 15 }), el('span', null, 'New board'));
  box.append(b);
  return box;
}

function header(board, api) {
  const head = el('div', 'tk-head');
  const title = el('h1', 'tk-title', api.title);
  const total = board.columns.reduce((n, c) => n + c.cards.length, 0);
  const done = board.columns.filter((c) => c.complete).reduce((n, c) => n + c.cards.length, 0);
  const count = el('span', 'tk-count', `${total} ${total === 1 ? 'task' : 'tasks'}${done ? ` · ${done} done` : ''}`);
  head.append(title, count);

  const tools = el('div', 'tk-tools');
  const search = document.createElement('input');
  search.type = 'search'; search.className = 'tk-search'; search.id = 'tk-search';
  search.placeholder = 'Filter tasks'; search.value = filter.text;
  search.setAttribute('aria-label', 'Filter tasks');
  search.addEventListener('input', () => { filter.text = search.value; api.refresh(); requestAnimationFrame(() => { const s = document.getElementById('tk-search'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && search.value) { e.preventDefault(); e.stopPropagation(); filter.text = ''; api.refresh(); } });
  tools.append(search);

  const active = [filter.type && TYPE_LABEL[filter.type], filter.priority, filter.tag && `#${filter.tag}`].filter(Boolean);
  const fb = btn(`btn tk-filter${active.length ? ' on' : ''}`, active.length ? active.join(' · ') : 'All tasks', (e) => {
    e.stopPropagation();
    const tags = boardTags(board);
    const mark = (on) => (on ? '✓ ' : ' ');
    api.menu('tk-filter', () => [
      { label: `${mark(!active.length)}All tasks`, fn: () => { api.closeMenu(); filter = { ...filter, type: null, priority: null, tag: null }; api.refresh(); } },
      ...CARD_TYPES.map((t) => ({ label: `${mark(filter.type === t)}${TYPE_LABEL[t]}`, fn: () => { api.closeMenu(); filter.type = filter.type === t ? null : t; api.refresh(); } })),
      ...PRIORITIES.map((p) => ({ label: `${mark(filter.priority === p)}${p}`, fn: () => { api.closeMenu(); filter.priority = filter.priority === p ? null : p; api.refresh(); } })),
      ...tags.map((t) => ({ label: `${mark(filter.tag === t)}#${t}`, fn: () => { api.closeMenu(); filter.tag = filter.tag === t ? null : t; api.refresh(); } })),
    ]);
  }, 'Show only one type, priority or tag');
  fb.dataset.menuAnchor = 'tk-filter';
  fb.setAttribute('aria-haspopup', 'menu');
  tools.append(fb);

  const add = btn('btn primary tk-new', null, () => taskForm(board, api, { ci: 0 }), 'New task: title, column, type, priority, due date…');
  add.append(icon('plus', { size: 15 }), el('span', null, 'New task'));
  tools.append(add);

  const more = btn('icon-btn-sq tk-more', null, (e) => { e.stopPropagation(); api.menu('tk-board', () => api.boardMenu()); }, 'Board');
  more.setAttribute('aria-label', 'Board actions');
  more.setAttribute('aria-haspopup', 'menu');
  more.dataset.menuAnchor = 'tk-board';
  more.append(icon('more', { size: 16 }));
  tools.append(more);
  head.append(tools);
  return head;
}

function column(board, col, ci, api) {
  const box = el('section', `tk-col${col.complete ? ' complete' : ''}`);
  box.dataset.col = String(ci);
  box.setAttribute('aria-label', col.title);
  const head = el('div', 'tk-col-head');
  head.draggable = renaming !== ci;
  head.addEventListener('dragstart', (e) => {
    if (e.target !== head) return;
    drag = { kind: 'col', col: ci };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', col.title);
    box.classList.add('dragging');
  });
  head.addEventListener('dragend', () => { drag = null; box.classList.remove('dragging'); clearMarks(); });
  if (renaming === ci) {
    const f = document.createElement('input');
    f.className = 'tk-col-rename'; f.value = col.title; f.setAttribute('aria-label', 'Column name');
    let done = false;
    const finish = (save) => {
      if (done) return; done = true;
      renaming = null;
      if (save && f.value.trim() && f.value.trim() !== col.title) api.save(renameColumn(board, ci, f.value), 'Column renamed');
      else api.refresh();
    };
    f.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    f.addEventListener('blur', () => finish(true));
    head.append(f);
  } else {
    const fixed = isDefaultColumn(col.title);
    const t = el('h2', 'tk-col-title', col.title);
    t.title = fixed ? 'A default column: its name stays' : 'Double-click to rename';
    if (!fixed) t.addEventListener('dblclick', () => { renaming = ci; api.refresh(); });
    head.append(t);
    if (col.complete) { const c = el('span', 'tk-col-done'); c.title = 'Tasks here are done'; c.append(icon('check', { size: 13 })); head.append(c); }
  }
  head.append(el('span', 'tk-col-count', String(col.cards.length)));
  const menu = btn('tk-col-menu', null, (e) => { e.stopPropagation(); api.menu(`tk-col-${ci}`, () => columnMenu(board, ci, api)); }, 'Column');
  menu.setAttribute('aria-label', `${col.title} column actions`);
  menu.setAttribute('aria-haspopup', 'menu');
  menu.dataset.menuAnchor = `tk-col-${ci}`;
  menu.append(icon('more', { size: 15 }));
  head.append(menu);
  box.append(head);

  const list = el('div', 'tk-cards');
  list.dataset.col = String(ci);
  col.cards.forEach((card, ki) => {
    if (!cardMatches(card.text, filter)) return;
    list.append(cardEl(board, card, ci, ki, api));
  });
  setupDrop(list, board, ci, api);
  box.append(list);

  const a = btn('tk-add', null, () => taskForm(board, api, { ci }), `New task in ${col.title}`);
  a.append(icon('plus', { size: 14 }), el('span', null, 'Add a task'));
  box.append(a);
  // Columns move by dragging their heading onto another column.
  box.addEventListener('dragover', (e) => {
    if (!drag || drag.kind !== 'col' || drag.col === ci) return;
    e.preventDefault();
    const r = box.getBoundingClientRect();
    const after = e.clientX > r.left + r.width / 2;
    clearMarks();
    box.classList.add(after ? 'drop-after' : 'drop-before');
  });
  box.addEventListener('drop', (e) => {
    if (!drag || drag.kind !== 'col') return;
    e.preventDefault();
    const r = box.getBoundingClientRect();
    let to = e.clientX > r.left + r.width / 2 ? ci + 1 : ci;
    if (drag.col < to) to -= 1;
    const from = drag.col; drag = null; clearMarks();
    if (from !== to) api.save(moveColumn(board, from, to), `${board.columns[from].title} moved`);
  });
  return box;
}

function columnMenu(board, ci, api) {
  const col = board.columns[ci];
  const close = api.closeMenu;
  const fixed = isDefaultColumn(col.title);
  return [
    ...(fixed ? [] : [
      { label: 'Rename', fn: () => { close(); renaming = ci; api.refresh(); } },
      { label: col.complete ? 'Tasks here are not done' : 'Tasks here are done', fn: () => { close(); api.save(setCompleteColumn(board, ci, !col.complete), col.complete ? `${col.title}: not done` : `${col.title}: tasks are done`); } },
    ]),
    { label: 'Add column before', fn: () => { close(); renaming = ci; api.save(addColumn(board, 'New column', ci), 'Column added'); } },
    { label: 'Add column after', fn: () => { close(); renaming = ci + 1; api.save(addColumn(board, 'New column', ci + 1), 'Column added'); } },
    ...(ci > 0 ? [{ label: 'Move left', fn: () => { close(); api.save(moveColumn(board, ci, ci - 1), `${col.title} moved left`); } }] : []),
    ...(ci < board.columns.length - 1 ? [{ label: 'Move right', fn: () => { close(); api.save(moveColumn(board, ci, ci + 1), `${col.title} moved right`); } }] : []),
    ...(board.columns.length > 1 ? [{
      label: col.cards.length ? `Delete (its ${col.cards.length} ${col.cards.length === 1 ? 'task goes' : 'tasks go'} to ${board.columns[ci > 0 ? ci - 1 : 1].title})` : 'Delete',
      fn: () => { close(); api.save(removeColumn(board, ci), K(`${col.title} deleted. ⌘Z undoes.`)); },
    }] : []),
  ];
}

function cardEl(board, card, ci, ki, api) {
  const c = parseCard(card.text);
  const done = card.checked || board.columns[ci].complete;
  const n = el('div', `tk-card${done ? ' done' : ''}${c.type ? ` type-${c.type}` : ''}`);
  n.tabIndex = 0;
  n.draggable = true;
  n.dataset.col = String(ci); n.dataset.card = String(ki);
  n.setAttribute('role', 'button');
  n.setAttribute('aria-label', `${done ? 'Done: ' : ''}${c.title || 'Untitled'}${c.type ? `, ${TYPE_LABEL[c.type]}` : ''}${c.priority ? `, ${c.priority}` : ''}${c.due ? `, due ${prettyDue(c.due)}` : ''}`);
  const top = el('div', 'tk-card-top');
  if (c.type) top.append(el('span', `tk-type ${c.type}`, TYPE_LABEL[c.type]));
  if (c.priority) top.append(el('span', `tk-prio ${c.priority.toLowerCase()}`, c.priority));
  if (top.childNodes.length) n.append(top);
  const titleRow = el('div', 'tk-card-title-row');
  if (done) { const ok = el('span', 'tk-done-mark'); ok.append(icon('check', { size: 12 })); titleRow.append(ok); }
  titleRow.append(el('div', 'tk-card-title', c.title || 'Untitled'));
  n.append(titleRow);
  const meta = el('div', 'tk-card-meta');
  if (c.due) {
    const late = !done && c.due < today();
    const d = el('span', `tk-due${late ? ' late' : ''}${c.due === today() ? ' today' : ''}`);
    d.append(icon('calendar', { size: 12 }), el('span', null, c.due === today() ? 'Today' : prettyDue(c.due)));
    meta.append(d);
  }
  if (c.subtasks.total) {
    const s = el('span', `tk-subs${c.subtasks.done === c.subtasks.total ? ' all' : ''}`);
    s.append(icon('check', { size: 12 }), el('span', null, `${c.subtasks.done}/${c.subtasks.total}`));
    meta.append(s);
  }
  if (c.url) {
    const a = el('a', 'tk-url', urlLabel(c.url));
    a.href = c.url; a.title = c.url;
    a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); api.openExternal(c.url); });
    meta.append(a);
  }
  for (const t of c.tags) meta.append(el('span', 'tk-tag', `#${t}`));
  if (meta.childNodes.length) n.append(meta);

  n.addEventListener('click', () => taskForm(board, api, { ci, ki }));
  n.addEventListener('keydown', (e) => onCardKey(e, board, ci, ki, api));
  n.addEventListener('dragstart', (e) => {
    drag = { kind: 'card', col: ci, card: ki };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', c.title);
    requestAnimationFrame(() => n.classList.add('dragging'));
  });
  n.addEventListener('dragend', () => { drag = null; n.classList.remove('dragging'); clearMarks(); });
  return n;
}

function onCardKey(e, board, ci, ki, api) {
  const col = board.columns[ci];
  const go = (to, label) => { e.preventDefault(); focusAfter = to; api.save(moveCard(board, { col: ci, card: ki }, to), label); };
  if (e.altKey && e.key === 'ArrowRight' && ci < board.columns.length - 1) go({ col: ci + 1, card: board.columns[ci + 1].cards.length }, `Moved to ${board.columns[ci + 1].title}`);
  else if (e.altKey && e.key === 'ArrowLeft' && ci > 0) go({ col: ci - 1, card: board.columns[ci - 1].cards.length }, `Moved to ${board.columns[ci - 1].title}`);
  else if (e.altKey && e.key === 'ArrowUp' && ki > 0) go({ col: ci, card: ki - 1 }, 'Moved up');
  else if (e.altKey && e.key === 'ArrowDown' && ki < col.cards.length - 1) go({ col: ci, card: ki + 2 }, 'Moved down');
  else if (!e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    const cards = [...e.currentTarget.parentElement.querySelectorAll('.tk-card')];
    const i = cards.indexOf(e.currentTarget);
    cards[e.key === 'ArrowDown' ? Math.min(cards.length - 1, i + 1) : Math.max(0, i - 1)]?.focus();
  } else if (!e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    e.preventDefault();
    const cols = [...document.querySelectorAll('.tk-cards')];
    const next = cols[ci + (e.key === 'ArrowRight' ? 1 : -1)];
    next?.querySelector('.tk-card')?.focus();
  } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); taskForm(board, api, { ci, ki }); }
  else if (e.key === 'Delete' || (e.key === 'Backspace' && (e.metaKey || e.ctrlKey))) {
    e.preventDefault();
    focusAfter = { col: ci, card: Math.max(0, ki - 1) };
    api.save(removeCard(board, ci, ki), K('Task deleted. ⌘Z undoes.'));
  }
}

// Dropping a card into a column: before the card under the pointer.
function setupDrop(list, board, ci, api) {
  const indexAt = (y) => {
    const cards = [...list.querySelectorAll('.tk-card:not(.dragging)')];
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (y < r.top + r.height / 2) return { node: c, index: Number(c.dataset.card) };
    }
    const last = cards[cards.length - 1];
    return { node: null, index: last ? Number(last.dataset.card) + 1 : board.columns[ci].cards.length };
  };
  list.addEventListener('dragover', (e) => {
    if (!drag || drag.kind !== 'card') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const at = indexAt(e.clientY);
    clearMarks();
    if (at.node) at.node.classList.add('drop-before'); else list.classList.add('drop-end');
  });
  list.addEventListener('dragleave', (e) => { if (!list.contains(e.relatedTarget)) clearMarks(); });
  list.addEventListener('drop', (e) => {
    if (!drag || drag.kind !== 'card') return;
    e.preventDefault();
    const from = { col: drag.col, card: drag.card };
    const { index } = indexAt(e.clientY);
    drag = null; clearMarks();
    if (from.col === ci && (index === from.card || index === from.card + 1)) return;
    const moved = moveCard(board, from, { col: ci, card: index });
    focusAfter = null;
    api.save(moved, from.col === ci ? 'Task moved' : `Moved to ${board.columns[ci].title}`);
  });
}

function clearMarks() {
  document.querySelectorAll('.tasks .drop-before, .tasks .drop-after, .tasks .drop-end').forEach((n) => n.classList.remove('drop-before', 'drop-after', 'drop-end'));
}

// A task with all its fields. Editing (`ki` given) opens a panel on the right;
// "New task" opens the same fields in a dialog in the middle.
function taskForm(board, api, { ci = 0, ki = null } = {}) {
  const isNew = ki === null;
  const card = isNew ? { checked: false, text: '' } : board.columns[ci] && board.columns[ci].cards[ki];
  if (!card) return;
  const c = parseCard(card.text);
  dialogOpen = true;
  const layer = el('div', isNew ? 'tk-layer modal' : 'tk-layer');
  const panel = el('div', isNew ? 'tk-panel tk-modal' : 'tk-panel');
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', isNew ? 'New task' : 'Task');
  const restore = document.activeElement;

  const field = (label, control, cls = '') => { const l = el('label', `tk-field ${cls}`); l.append(el('span', null, label), control); return l; };
  const input = (value, type = 'text') => { const i = document.createElement('input'); i.type = type; i.value = value || ''; return i; };
  const select = (value, options) => {
    const s = document.createElement('select');
    for (const [v, label] of options) { const o = document.createElement('option'); o.value = v; o.textContent = label; s.append(o); }
    s.value = value || '';
    return s;
  };

  const title = document.createElement('textarea');
  title.className = 'tk-panel-title'; title.rows = 1; title.value = c.title;
  title.placeholder = 'Task title';
  title.setAttribute('aria-label', 'Title');
  title.addEventListener('input', () => { title.value = title.value.replace(/\n/g, ' '); title.classList.remove('invalid'); });
  const colSel = select(String(ci), board.columns.map((col, i) => [String(i), col.title]));
  const typeSel = select(c.type || '', [['', 'None'], ...CARD_TYPES.map((t) => [t, TYPE_LABEL[t]])]);
  const prioSel = select(c.priority || '', [['', 'None'], ...PRIORITIES.map((p) => [p, p])]);
  const due = input(c.due, 'date');
  const tags = input(c.tags.map((t) => `#${t}`).join(' '));
  tags.placeholder = '#ui #windows';
  const url = input(c.url, 'url');
  url.placeholder = 'https://github.com/…/issues/12';
  const body = document.createElement('textarea');
  body.className = 'tk-panel-body'; body.rows = isNew ? 6 : 10; body.value = c.body;
  body.placeholder = 'Notes, [[links]] and sub-tasks:\n- [ ] first\n- [ ] second';

  const grid = el('div', 'tk-panel-grid');
  grid.append(field('Column', colSel), field('Type', typeSel), field('Priority', prioSel), field('Due', due), field('Tags', tags, 'wide'), field('Link', url, 'wide'));

  const close = () => { dialogOpen = false; layer.remove(); document.removeEventListener('keydown', onKey, true); if (restore && restore.isConnected) restore.focus(); };
  const cancel = () => { close(); api.refresh(); };
  const save = () => {
    const t = title.value.trim();
    if (!t) { title.focus(); title.classList.add('invalid'); return; }
    const text = composeCard({
      title: t,
      type: typeSel.value || null,
      priority: prioSel.value || null,
      due: due.value || null,
      url: url.value.trim() || null,
      tags: tags.value.split(/[\s,]+/).map((x) => x.replace(/^#/, '')).filter(Boolean),
      body: body.value,
    });
    const toCol = Number(colSel.value);
    close();
    if (isNew) {
      const next = addCard(board, toCol, text);
      focusAfter = { col: toCol, card: next.columns[toCol].cards.length - 1 };
      api.save(next, `Task added to ${board.columns[toCol].title}`);
      return;
    }
    let next = text === card.text ? board : updateCard(board, ci, ki, text);
    if (toCol !== ci) next = moveCard(next, { col: ci, card: ki }, { col: toCol, card: next.columns[toCol].cards.length });
    if (next !== board) api.save(next, toCol !== ci ? `Moved to ${board.columns[toCol].title}` : 'Task saved');
    else api.refresh();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); save(); }
    if (e.key === 'Enter' && e.target === title) { e.preventDefault(); if (isNew) save(); }
  };
  document.addEventListener('keydown', onKey, true);

  const head = el('div', 'tk-panel-head');
  if (isNew) head.append(el('h2', 'tk-modal-heading', 'New task'));
  else head.append(title);
  const x = btn('icon-btn-sq tk-panel-close', '×', cancel, 'Close (Esc)');
  x.setAttribute('aria-label', 'Close');
  head.append(x);
  panel.append(head);
  if (isNew) panel.append(field('Title', title, 'wide title'));
  panel.append(grid, field('Description', body, 'wide body'));
  if (c.url) panel.append(btn('btn quiet tk-open-link', `Open ${urlLabel(c.url)}`, () => api.openExternal(c.url)));
  const links = [...c.body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)].map((m) => m[1].trim());
  if (links.length) {
    const row = el('div', 'tk-panel-links');
    row.append(el('span', null, 'Notes:'));
    for (const l of [...new Set(links)]) row.append(btn('tk-link', l, () => { close(); api.openWiki(l); }));
    panel.append(row);
  }
  const actions = el('div', 'tk-panel-actions');
  if (!isNew) actions.append(btn('btn quiet danger', 'Delete task', () => { close(); api.save(removeCard(board, ci, ki), K('Task deleted. ⌘Z undoes.')); }));
  actions.append(btn('btn quiet', 'Cancel', cancel), btn('btn primary', isNew ? 'Add task' : 'Save', save, K(isNew ? 'Add task (↵ or ⌘Enter)' : 'Save (⌘Enter)')));
  panel.append(actions);
  layer.append(panel);
  layer.addEventListener('mousedown', (e) => { if (e.target === layer) cancel(); });
  document.body.append(layer);
  title.focus();
  title.setSelectionRange(title.value.length, title.value.length);
}

export function tasksAnnounce(text) {
  const l = document.getElementById('tk-live');
  if (l) l.textContent = text;
}
