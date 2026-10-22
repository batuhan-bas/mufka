// Task boards (the Tasks mode): a board is a Markdown note in the format of
// Obsidian's Kanban plugin, so the same file is a board in both apps.
//
//   ---
//   kanban-plugin: board
//   ---
//
//   ## To do
//
//   - [ ] Fix the menu #bug !P1 @{2026-10-30}
//   	Body lines are indented under the card.
//
//   ## Done
//
//   **Complete**
//   - [x] Ship it
//
//   %% kanban:settings
//   ```
//   {"kanban-plugin":"board"}
//   ```
//   %%
//
// Each `##` heading is a column; a `**Complete**` line under it marks the
// column whose cards are done (checked). What Mufka does not understand (the
// plugin's archive and settings, text before the first column) is kept as it
// is. Pure: no DOM, no Electron.

export const DEFAULT_COLUMNS = ['To do', 'In progress', 'Test', 'Done'];
export const CARD_TYPES = ['feature', 'bug', 'chore'];
export const PRIORITIES = ['P1', 'P2', 'P3'];

const FRONT_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const CARD_RE = /^[-*+] (?:\[([ xX])\] ?)?(.*)$/;
const HEADING_RE = /^##[ \t]+(.*?)[ \t]*$/;
const COMPLETE_RE = /^\*\*Complete\*\*[ \t]*$/;
const SETTINGS_RE = /^%% kanban:settings/;

// A note is a board when its front matter says so.
export function isBoard(content) {
  const m = FRONT_RE.exec(String(content || ''));
  return Boolean(m && /^kanban-plugin:[ \t]*\S/m.test(m[1]));
}

export function parseBoard(content) {
  const src = String(content || '').replace(/\r\n/g, '\n');
  const fm = FRONT_RE.exec(src);
  const frontmatter = fm ? fm[0].replace(/\n?$/, '\n') : '---\nkanban-plugin: board\n---\n';
  const lines = (fm ? src.slice(fm[0].length) : src).split('\n');
  const board = { frontmatter, preamble: '', columns: [], tail: '' };
  let col = null;
  let card = null;
  let pendingBlank = 0;
  const pre = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    // The plugin's archive (after ***) and settings block: kept untouched.
    if ((line.trim() === '***' && col) || SETTINGS_RE.test(line)) {
      board.tail = lines.slice(i).join('\n').replace(/\n*$/, '\n');
      break;
    }
    const h = HEADING_RE.exec(line);
    if (h) {
      col = { title: h[1], complete: false, cards: [] };
      board.columns.push(col);
      card = null; pendingBlank = 0;
      continue;
    }
    if (!col) { pre.push(line); continue; }
    if (COMPLETE_RE.test(line)) { col.complete = true; card = null; continue; }
    const c = /^\S/.test(line) ? CARD_RE.exec(line) : null;
    if (c) {
      card = { checked: (c[1] || ' ').toLowerCase() === 'x', text: c[2] };
      col.cards.push(card);
      pendingBlank = 0;
      continue;
    }
    if (card && /^(\t| {2,})/.test(line)) {
      card.text += '\n'.repeat(pendingBlank + 1) + line.replace(/^(\t| {1,4})/, '');
      pendingBlank = 0;
      continue;
    }
    if (line.trim() === '') { if (card) pendingBlank += 1; continue; }
    // Loose text inside a column: a card of its own rather than lost.
    card = { checked: false, text: line.trim() };
    col.cards.push(card);
    pendingBlank = 0;
  }
  board.preamble = pre.join('\n').trim();
  return board;
}

export function serializeBoard(board) {
  const out = [board.frontmatter.replace(/\n*$/, '\n'), ''];
  if (board.preamble) out.push(board.preamble, '');
  for (const col of board.columns) {
    out.push(`## ${col.title}`, '');
    if (col.complete) out.push('**Complete**');
    for (const card of col.cards) {
      const [first, ...rest] = String(card.text).split('\n');
      out.push(`- [${card.checked ? 'x' : ' '}] ${first}`.trimEnd());
      for (const l of rest) out.push(l ? `\t${l}` : '');
    }
    out.push('', '');
  }
  out.push(board.tail ? board.tail.replace(/\n*$/, '\n') : defaultSettings(board));
  return out.join('\n');
}

function defaultSettings(board) {
  const settings = { 'kanban-plugin': 'board', 'list-collapse': board.columns.map(() => false) };
  return `%% kanban:settings\n\`\`\`\n${JSON.stringify(settings)}\n\`\`\`\n%%\n`;
}

export function newBoard(columns = DEFAULT_COLUMNS) {
  return {
    frontmatter: '---\n\nkanban-plugin: board\n\n---\n',
    preamble: '',
    columns: columns.map((title, i) => ({ title, complete: i === columns.length - 1, cards: [] })),
    tail: '',
  };
}

// --- cards ---------------------------------------------------------------

const DUE_RE = /(^|\s)@\{(\d{4}-\d{2}-\d{2})\}(?=\s|$)/;
const PRIO_RE = /(^|\s)!(P[1-3])(?=\s|$)/i;
const TAG_RE = /(^|\s)#([\p{L}\p{N}_/-]+)/gu;
const URL_RE = /(^|\s)(https?:\/\/[^\s)>\]]+)/;

// A card's text → what the board shows. The first line holds the title and
// its markers; the rest is the body (Markdown, may hold - [ ] sub-tasks).
export function parseCard(text) {
  const [first, ...rest] = String(text || '').split('\n');
  const body = rest.join('\n').replace(/^\n+|\n+$/g, '');
  const due = DUE_RE.exec(first);
  const prio = PRIO_RE.exec(first);
  const url = URL_RE.exec(first);
  const tags = [...first.matchAll(TAG_RE)].map((m) => m[2]);
  const type = tags.find((t) => CARD_TYPES.includes(t.toLowerCase()));
  const title = first
    .replace(new RegExp(DUE_RE.source, 'g'), ' ')
    .replace(new RegExp(PRIO_RE.source, 'gi'), ' ')
    .replace(new RegExp(URL_RE.source, 'g'), ' ')
    .replace(TAG_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const subs = [...body.matchAll(/^\s*[-*+] \[([ xX])\]/gm)];
  return {
    title,
    type: type ? type.toLowerCase() : null,
    priority: prio ? prio[2].toUpperCase() : null,
    due: due ? due[2] : null,
    url: url ? url[2] : null,
    tags: tags.filter((t) => t !== type),
    body,
    subtasks: { done: subs.filter((m) => m[1] !== ' ').length, total: subs.length },
  };
}

// The other way: fields → card text, markers in a fixed order.
export function composeCard({ title = '', type = null, priority = null, due = null, url = null, tags = [], body = '' }) {
  const parts = [String(title).replace(/\s+/g, ' ').trim()];
  if (type) parts.push(`#${type}`);
  for (const t of tags) { const clean = String(t).replace(/^#/, '').trim(); if (clean) parts.push(`#${clean}`); }
  if (priority) parts.push(`!${priority}`);
  if (due) parts.push(`@{${due}}`);
  if (url) parts.push(url);
  const b = String(body || '').replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '');
  return parts.filter(Boolean).join(' ') + (b ? `\n${b}` : '');
}

// A short label for a link: GitHub issues and pull requests read as #12.
export function urlLabel(url) {
  const m = /github\.com\/[^/]+\/[^/]+\/(?:issues|pull)\/(\d+)/.exec(String(url || ''));
  if (m) return `#${m[1]}`;
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return String(url || ''); }
}

// --- changes (each returns a new board; the input is not touched) ---------

function clone(board) {
  return { ...board, columns: board.columns.map((c) => ({ ...c, cards: c.cards.map((k) => ({ ...k })) })) };
}

export function addCard(board, colIndex, text, { top = false } = {}) {
  const b = clone(board);
  const col = b.columns[colIndex];
  if (!col || !String(text).trim()) return b;
  const card = { checked: col.complete, text: String(text).trim() };
  if (top) col.cards.unshift(card); else col.cards.push(card);
  return b;
}

export function updateCard(board, colIndex, cardIndex, text) {
  const b = clone(board);
  const card = b.columns[colIndex] && b.columns[colIndex].cards[cardIndex];
  if (card) card.text = String(text);
  return b;
}

export function removeCard(board, colIndex, cardIndex) {
  const b = clone(board);
  const col = b.columns[colIndex];
  if (col) col.cards.splice(cardIndex, 1);
  return b;
}

// Move a card; toIndex counts in the target column before the move. Landing in
// a complete column checks it, leaving one unchecks it (as the plugin does).
export function moveCard(board, from, to) {
  const b = clone(board);
  const src = b.columns[from.col];
  const dst = b.columns[to.col];
  if (!src || !dst || !src.cards[from.card]) return b;
  const [card] = src.cards.splice(from.card, 1);
  let at = to.card;
  if (from.col === to.col && to.card > from.card) at -= 1;
  at = Math.max(0, Math.min(at, dst.cards.length));
  if (src !== dst || dst.complete) card.checked = dst.complete;
  dst.cards.splice(at, 0, card);
  return b;
}

export function addColumn(board, title, at = board.columns.length) {
  const b = clone(board);
  const t = String(title || '').trim();
  if (!t) return b;
  b.columns.splice(Math.max(0, Math.min(at, b.columns.length)), 0, { title: t, complete: false, cards: [] });
  return b;
}

// The default columns (To do, In progress, Test, Done) keep their names: they
// can be removed and added back, but only columns of your own are renamed.
export function isDefaultColumn(title) {
  const t = String(title || '').trim().toLowerCase();
  return DEFAULT_COLUMNS.some((d) => d.toLowerCase() === t);
}

export function renameColumn(board, colIndex, title) {
  const b = clone(board);
  const t = String(title || '').trim();
  if (b.columns[colIndex] && t && !isDefaultColumn(b.columns[colIndex].title)) b.columns[colIndex].title = t;
  return b;
}

// Default columns this board does not have (removed earlier), in their order.
export function missingDefaults(board) {
  return DEFAULT_COLUMNS.filter((d) => !board.columns.some((c) => c.title.trim().toLowerCase() === d.toLowerCase()));
}

// Put a default column back where it belongs: Done at the end (it holds the
// done tasks), the others before the next default column the board has, else
// after the last one before it.
export function addDefaultColumn(board, title) {
  const order = DEFAULT_COLUMNS.findIndex((d) => d.toLowerCase() === String(title).toLowerCase());
  if (order === -1 || !missingDefaults(board).includes(DEFAULT_COLUMNS[order])) return clone(board);
  const rank = (c) => DEFAULT_COLUMNS.findIndex((d) => d.toLowerCase() === c.title.trim().toLowerCase());
  const last = order === DEFAULT_COLUMNS.length - 1;
  let at = last ? board.columns.length : board.columns.findIndex((c) => rank(c) > order);
  if (at === -1) {
    const before = board.columns.map((c, i) => [rank(c), i]).filter(([r]) => r !== -1 && r < order);
    at = before.length ? before[before.length - 1][1] + 1 : board.columns.length;
  }
  let b = addColumn(board, DEFAULT_COLUMNS[order], at);
  if (last) b = setCompleteColumn(b, at);
  return b;
}

// Removing a column with cards moves them to the column before it (or after).
export function removeColumn(board, colIndex) {
  const b = clone(board);
  if (b.columns.length <= 1 || !b.columns[colIndex]) return b;
  const [gone] = b.columns.splice(colIndex, 1);
  if (gone.cards.length) {
    const heir = b.columns[Math.max(0, colIndex - 1)];
    for (const c of gone.cards) heir.cards.push({ ...c, checked: heir.complete });
  }
  return b;
}

export function moveColumn(board, from, to) {
  const b = clone(board);
  if (!b.columns[from]) return b;
  const [col] = b.columns.splice(from, 1);
  b.columns.splice(Math.max(0, Math.min(to, b.columns.length)), 0, col);
  return b;
}

// One column holds the done cards; marking another moves the mark.
export function setCompleteColumn(board, colIndex, on = true) {
  const b = clone(board);
  b.columns.forEach((c, i) => {
    const was = c.complete;
    c.complete = on ? i === colIndex : (i === colIndex ? false : c.complete);
    if (was !== c.complete) c.cards.forEach((k) => { k.checked = c.complete; });
  });
  return b;
}

// Cards that match a filter: { text, type, priority, tag }, all optional.
export function cardMatches(text, filter = {}) {
  const c = parseCard(text);
  if (filter.type && c.type !== filter.type) return false;
  if (filter.priority && c.priority !== filter.priority) return false;
  if (filter.tag && !c.tags.some((t) => t.toLowerCase() === filter.tag.toLowerCase())) return false;
  if (filter.text) {
    const q = filter.text.toLowerCase();
    if (!String(text).toLowerCase().includes(q)) return false;
  }
  return true;
}

// Every tag used on the board (for the filter menu), sorted.
export function boardTags(board) {
  const all = new Set();
  for (const col of board.columns) for (const card of col.cards) for (const t of parseCard(card.text).tags) all.add(t);
  return [...all].sort((a, b) => a.localeCompare(b));
}
