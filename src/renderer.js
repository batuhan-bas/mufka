// All UI logic. Plain DOM, no framework. User content enters the DOM only via
// textContent / the Markdown renderer (which never uses innerHTML). Pure logic
// is imported from ../lib.

import {
  dayKey, parseDayKey, monthGrid, isToday, addDays, addMonths, startOfWeek, weekKey,
  formatMonthLong, formatDayNumeric, formatDayPretty, formatWeekRange, formatWeekdayLong, WEEKDAY_SHORT,
} from '../lib/dates.mjs';
import { weekDates } from '../lib/week.mjs';
import { migrate, emptyStore } from '../lib/migrate.mjs';
import { genId, searchPlans, foldTR } from '../lib/plans.mjs';
import { occursOn, describeRecur, repeatChoices, recurFromChoice, choiceFromRecur } from '../lib/recur.mjs';
import { duePlans } from '../lib/notify.mjs';
import { renderMarkdown, toggleTaskLine } from '../lib/markdown.mjs';
import {
  buildTree, TREE_SORTS, flattenNotes, resolveLink, folderOf, joinRel, canMoveInto,
  leafOf, placeInOrder, remapOrder, forgetOrder,
} from '../lib/notestree.mjs';
import { buildBacklinkIndex, backlinksFor } from '../lib/backlinks.mjs';
import { resolveAttachment, attachInsertText } from '../lib/attach.mjs';
import { attachmentsDirFor } from '../lib/layout.mjs';
import { parseBlocks, blockText, replaceBlockText, insertBlockAfter, addBlock } from '../lib/blocks.mjs';
import { createGraphView } from './graph-view.js';
import { renderPlanner, plannerFocus, announce } from './planner.js';
import { renderTasks, tasksEditing, tasksAnnounce } from './tasks.js';
import { isBoard, parseBoard, serializeBoard, newBoard } from '../lib/kanban.mjs';
import { icon } from './icons.js';
import { openPalette, closePalette, isPaletteOpen, paletteKeepsEditor } from './palette.js';
import { attachHoverPreview, hidePreview } from './hover-preview.js';
import { attachSuggest } from './suggest.js';
import { linkTextFor } from '../lib/suggest.mjs';
import { applyTemplate } from '../lib/template.mjs';
import { keyLabel } from '../lib/keys.mjs';
import { BUILTIN_TEMPLATES, templateChoices } from '../lib/builtin-templates.mjs';
import { countText } from '../lib/wordcount.mjs';
import { createNavHistory, sameLocation } from '../lib/navhistory.mjs';
import { fuzzyMatch, fuzzyFilter, pushRecent } from '../lib/fuzzy.mjs';
import { outline, outgoingLinks, unlinkedMentions, linkMention } from '../lib/noteinfo.mjs';
import { buildTagIndex, scanTags } from '../lib/tags.mjs';
import { eventsOnDay, eventWhen } from '../lib/calendar.mjs';
import { PALETTE, TREE_ICONS, folderColor, rowColor, isIconId, cleanEmoji, setStyle, remapStyles, pruneStyles } from '../lib/treestyle.mjs';

const plansApi = window.planner;
// macOS: Mufka draws its own title bar (styles.css, "Title bar").
if (plansApi.isMac) document.documentElement.classList.add('mac');
else document.documentElement.classList.add('win');
// Shortcuts read the system's way: ⌘O on a Mac, Ctrl+O elsewhere (lib/keys.mjs).
const K = (text) => keyLabel(text, plansApi.isMac);
// The Mac's Finder, Windows' Explorer.
const FILES_APP = plansApi.isMac ? 'Finder' : 'File Explorer';
// The static page (index.html) too: tooltips and the sidebar's key hints.
if (!plansApi.isMac) {
  for (const el of document.querySelectorAll('[title]')) el.title = K(el.title);
  for (const el of document.querySelectorAll('kbd')) el.textContent = K(el.textContent);
}
if (plansApi.onFullScreen) plansApi.onFullScreen((on) => document.documentElement.classList.toggle('fullscreen', on));
const notesApi = window.notes;
const wisprApi = window.wispr;
const calApi = window.calendars;

const state = {
  store: emptyStore(),
  calCursor: new Date(),
  selectedDate: new Date(),
  dailyNote: { key: null, content: null },
  dailyDeleteConfirm: false,
  noteDeleteConfirm: false,
  dailyDates: new Set(),
  // Notes vault
  treeFolders: [],        // folder rel strings
  treeNotes: [],          // [{ rel, mtime }]
  notesFlat: [],          // [{ rel, title, folder, mtime }]
  expanded: new Set(),    // expanded folder rels (persisted)
  selectedFolder: null,   // rel of the selected folder, or null
  treeStyles: {},         // colours and icons in the tree, per notes folder (lib/treestyle.mjs)
  treeOrder: {},          // the custom order made by dragging (lib/notestree.mjs)
  treeEdit: null,         // inline edit: { kind, parentRel?, rel? }
  folderDeleteConfirm: null, // folder rel awaiting confirmation
  recent: [],             // recently opened note rels, newest first (persisted)
  noteSort: 'name',       // tree order: lib/notestree.mjs TREE_SORTS (persisted)
  bookmarks: [],          // bookmarked note rels (Obsidian bookmarks.json via main)
  openNote: null,         // open note rel (path), e.g. 'İş/Q1.md'
  noteContent: '',
  noteView: 'blocks',     // 'blocks' (live preview) | 'source' (raw textarea)
  blockEdit: null,        // { scope:'note'|'daily', startLine?, newAfter?, caret }
  blockCaretPos: null,    // caret offset to apply to the block editor after render
  history: null,          // { key, stack:[src...], i } whole-document undo/redo
  noteCache: new Map(),   // rel -> content (for Ara text search)
  araQuery: '',
  editPlanId: null,       // plan being edited inline on the day page
  menu: null,             // open row menu: { anchorKey, buildItems }
  contentView: 'day',     // what the right pane shows: 'day' | 'note' | 'graph' | 'planner' | 'tasks'
  board: null,            // the open task board: { rel, content } (src/tasks.js, lib/kanban.mjs)
  boardUndo: [],          // earlier texts of boards, for ⌘Z: [{ rel, content }]
  weekDate: new Date(),   // any day of the week the Planner shows
  sidebarCollapsed: false,
  undo: [],
  focus: null,            // element id to focus after render
  backlinks: new Map(),   // targetRel -> [{ rel, line }] (who links to it)
  attachFiles: new Set(), // vault paths of every non-note file
  vaultNotes: [],         // [{ rel, content }] of every note, from the last notes:all
  rightbar: { open: false, tab: 'outline' }, // right sidebar (persisted)
  // Daily notes / attachments folders of this vault (lib/layout.mjs via main)
  layout: { daily: 'Daily', attachments: 'Attachments', relative: false, templates: null, dailyTemplate: null, dateFormat: 'YYYY-MM-DD', timeFormat: 'HH:mm' },
};

const UNDO_LIMIT = 50;

// --- persistence ---

async function loadStore() {
  const raw = await plansApi.load();
  state.store = migrate(raw ?? emptyStore());
}

let saveChain = Promise.resolve();
function persistPlans() {
  saveChain = saveChain.then(() => plansApi.save(state.store)).catch((e) => console.error('save failed', e));
  return saveChain;
}

// --- plan data ---

function getDayItems(date) {
  const key = dayKey(date);
  const out = [];
  for (const p of state.store.items) {
    if (p.scope !== 'day') continue;
    if (!p.recur) { if (p.key === key) out.push(p); continue; }
    if (p.exceptions && p.exceptions[key]) continue;
    if (occursOn(p.recur, parseDayKey(p.key), date)) {
      out.push({
        id: p.id, title: p.title, time: p.time, endTime: p.endTime,
        done: Boolean(p.doneDates && p.doneDates[key]),
        created: p.created, recur: p.recur, _occ: true, _date: key,
      });
    }
  }
  return out.sort((a, b) => (a.time && b.time ? a.time.localeCompare(b.time)
    : a.time ? -1 : b.time ? 1 : a.created - b.created));
}

function hasAnything(date) {
  return getDayItems(date).length > 0 || state.dailyDates.has(dayKey(date));
}

// Add an explicit plan. Title is stored verbatim (no time parsing from text).
function addPlan(date, { title, time = '', endTime = '' }) {
  const t = (title || '').trim();
  if (!t) return;
  state.store.items.push({
    id: genId(), scope: 'day', key: dayKey(date),
    title: t, time, endTime, done: false, created: Date.now(),
    recur: null, doneDates: {}, exceptions: {},
  });
  persistPlans();
}

function toggleItem(p) {
  const plan = state.store.items.find((x) => x.id === p.id);
  if (!plan) return;
  if (p._occ) {
    const k = p._date;
    if (plan.doneDates[k]) delete plan.doneDates[k]; else plan.doneDates[k] = true;
  } else {
    plan.done = !plan.done;
  }
  persistPlans(); render();
}

// Save an edit with explicit values. An empty title is ignored (use the row
// menu's "Sil" to delete). Returns false if nothing was saved.
function savePlanEdit(id, { title, time = '', endTime = '' }) {
  const plan = state.store.items.find((x) => x.id === id);
  if (!plan) { removeOutside(); state.editPlanId = null; render(); return true; }
  const t = (title || '').trim();
  if (!t) return false;
  plan.title = t; plan.time = time; plan.endTime = endTime;
  removeOutside();
  state.editPlanId = null;
  persistPlans(); render();
  return true;
}

function pushUndo(entry) {
  state.undo.push(entry);
  if (state.undo.length > UNDO_LIMIT) state.undo.shift();
}

function deletePlan(id) {
  removeOutside();
  const i = state.store.items.findIndex((x) => x.id === id);
  if (i === -1) return;
  const [removed] = state.store.items.splice(i, 1);
  pushUndo({ type: 'remove', plan: removed, index: i });
  state.editPlanId = null;
  persistPlans(); render();
}

// Delete just one occurrence of a repeating plan (add a date exception).
function deleteOccurrence(id, dateKey) {
  const plan = state.store.items.find((x) => x.id === id);
  if (!plan) return;
  plan.exceptions = plan.exceptions || {};
  plan.exceptions[dateKey] = true;
  pushUndo({ type: 'exception', id, dateKey });
  persistPlans(); render();
}

function undoDelete() {
  const last = state.undo.pop();
  if (!last) return;
  if (last.type === 'remove-new') {
    const i = state.store.items.findIndex((x) => x.id === last.id);
    if (i !== -1) state.store.items.splice(i, 1);
  } else if (last.type === 'detach') {
    const plan = state.store.items.find((x) => x.id === last.id);
    if (plan && plan.exceptions) delete plan.exceptions[last.dateKey];
    const i = state.store.items.findIndex((x) => x.id === last.newId);
    if (i !== -1) state.store.items.splice(i, 1);
  } else if (last.type === 'edit') {
    const plan = state.store.items.find((x) => x.id === last.id);
    if (plan) Object.assign(plan, last.before);
  } else if (last.type === 'exception') {
    const plan = state.store.items.find((x) => x.id === last.id);
    if (plan && plan.exceptions) delete plan.exceptions[last.dateKey];
  } else {
    state.store.items.splice(Math.min(last.index, state.store.items.length), 0, last.plan);
  }
  persistPlans(); render();
}

// --- rendering ---

const sideEl = document.getElementById('side');
const contentEl = document.getElementById('content');
const paneEl = document.querySelector('.content');
const paneActionsEl = document.getElementById('pane-actions');
const toastEl = document.getElementById('toast');

// A fixed row menu would drift if its anchor scrolls; close it on scroll.
paneEl.addEventListener('scroll', () => { if (state.menu) closeMenu(); });

function render() {
  // Safety net: the click-outside-saves listener must never outlive an edit.
  if (!state.editPlanId) removeOutside();
  // Removing a focused block textarea during a re-render fires its blur
  // synchronously; suppress that so it cannot commit stale text into the
  // already-advanced edit target (data corruption).
  state.suppressBlockBlur = true;
  renderSidebar(); renderContent(); renderPaneActions(); renderRightbar(); restoreFocus(); renderMenu();
  state.suppressBlockBlur = false;
}

// The pane top bar's right actions follow what the pane shows: the open note
// gets a copy icon + "⋯" menu; the day page (Takvim) leaves it empty.
function renderPaneActions() {
  paneActionsEl.replaceChildren();
  updateStatusBar();
  renderPaneTitle();
  if (state.contentView === 'note' && state.openNote) {
    const title = noteTitleOf(state.openNote);
    paneActionsEl.append(
      copyIconButton(() => state.noteContent),
      menuIconButton('menu-note', () => noteActionItems(title, () => state.noteContent, () => notesApi.write(state.openNote, state.noteContent))),
    );
  }
}

// Re-render only the sidebar but keep the focused field (used while typing in
// the notes filter / Ara field, which re-render the sidebar on every keystroke).
function refreshSidebar() { renderSidebar(); restoreFocus(); }

// A click is a press and a release on the same element. Work that rebuilds the
// page in between (an editor saving on blur) would replace that element and
// the click would be lost; a person holds the button for a moment, so such
// work waits until the button is up and the click has landed.
let pointerIsDown = false;
let afterPointer = [];
document.addEventListener('pointerdown', () => { pointerIsDown = true; }, true);
function releasePointer() {
  pointerIsDown = false;
  const queued = afterPointer; afterPointer = [];
  setTimeout(() => queued.forEach((fn) => fn()), 0);
}
document.addEventListener('pointerup', releasePointer, true);
document.addEventListener('pointercancel', releasePointer, true);
function whenPointerUp(fn) { if (pointerIsDown) afterPointer.push(fn); else setTimeout(fn, 0); }

function restoreFocus() {
  if (!state.focus) return;
  const el = document.getElementById(state.focus);
  state.focus = null;
  if (el) {
    el.focus();
    if (el.id === 'block-editor' && state.blockCaretPos != null) {
      const pos = state.blockCaretPos; state.blockCaretPos = null;
      try { el.setSelectionRange(pos, pos); } catch { /* ignore */ }
    } else if (el.id === 'tree-edit') {
      el.select(); // the suggested name ("Untitled", "New folder") is replaced by typing
    } else if (typeof el.value === 'string') { const v = el.value; el.value = ''; el.value = v; }
  }
}


// --- collapsible sidebar ---

const appEl = document.getElementById('app');
const sidebarEl = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');

function applySidebar() {
  const collapsed = state.sidebarCollapsed;
  appEl.classList.toggle('sidebar-collapsed', collapsed);
  sidebarEl.inert = collapsed; // not tabbable / hidden from AT while collapsed
  sidebarEl.setAttribute('aria-hidden', String(collapsed));
  sidebarToggle.setAttribute('aria-label', collapsed ? 'Show sidebar' : 'Hide sidebar');
  try { localStorage.setItem('mufka-sidebar', collapsed ? '1' : '0'); } catch { /* ignore */ }
}
function setSidebar(collapsed) { state.sidebarCollapsed = collapsed; applySidebar(); }
function toggleSidebar() { setSidebar(!state.sidebarCollapsed); }
function loadSidebar() { try { state.sidebarCollapsed = localStorage.getItem('mufka-sidebar') === '1'; } catch { /* ignore */ } applySidebar(); }
sidebarToggle.addEventListener('click', toggleSidebar);

// The old bottom tabs are now places in one sidebar. setTab keeps the names
// (menus, shortcuts): 'takvim' opens the selected day, 'notlar' shows and
// focuses the note tree, 'ara' focuses the search field.
function setTab(tab) {
  if (state.sidebarCollapsed) setSidebar(false); // these places live in it
  state.menu = null;
  if (tab === 'ara') { state.focus = 'ara-input'; ensureNoteCache(); render(); return; }
  if (tab === 'notlar') {
    state.araQuery = '';
    setSectionOpen('notes', true);
    refreshTree().then(() => { renderSidebar(); focusTree(); });
    render();
    return;
  }
  openPlanner(state.contentView === 'planner' ? state.weekDate : new Date());
}
function focusTree() {
  const rows = [...sideEl.querySelectorAll('.tree .tree-row')];
  (rows.find((r) => r.classList.contains('selected')) || rows[0])?.focus();
}

// --- sidebar: one scrolling list of labelled sections instead of tabs ---
// Search on top (typing replaces the sections with results), then the fixed
// places (Today, Graph), Calendar, Bookmarks and the Notes tree. Sections
// collapse; their state persists.

const SECTIONS_KEY = 'mufka-sections';
function sectionsState() { try { return JSON.parse(localStorage.getItem(SECTIONS_KEY) || '{}') || {}; } catch { return {}; } }
function sectionOpen(id) { return sectionsState()[id] !== false; }
function setSectionOpen(id, open) {
  const st = sectionsState(); st[id] = open;
  try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(st)); } catch { /* ignore */ }
}
function sidebarSection(id, title, actions = [], iconName = null) {
  const sec = elem('section', `side-section side-${id}`);
  sec.setAttribute('aria-label', title);
  const head = elem('div', 'side-head');
  const open = sectionOpen(id);
  const tog = elem('button', 'side-head-toggle');
  tog.type = 'button';
  tog.setAttribute('aria-expanded', String(open));
  const label = elem('span', 'side-head-title-wrap');
  if (iconName) label.append(icon(iconName, { size: 14 }));
  label.append(elem('span', 'side-head-title', title));
  tog.append(elem('span', 'side-caret', open ? '▾' : '▸'), label);
  tog.addEventListener('click', () => { setSectionOpen(id, !open); renderSidebar(); });
  head.append(tog);
  if (actions.length) { const a = elem('div', 'side-actions'); a.append(...actions); head.append(a); }
  sec.append(head);
  const body = elem('div', 'side-body');
  body.hidden = !open;
  sec.append(body);
  sideEl.append(sec);
  return body;
}
// A section-header action shown as an icon (its name in aria-label + tooltip).
function iconAction(name, aria, fn, title) {
  const b = elem('button', 'side-btn');
  b.type = 'button';
  b.setAttribute('aria-label', aria);
  b.title = title || aria;
  b.append(icon(name, { size: 15 }));
  b.addEventListener('click', fn);
  return b;
}
// Order of the notes tree: A–Z, Z–A, last edited, oldest edited (persisted).
const SORT_LABELS = { name: 'Name (A–Z)', 'name-desc': 'Name (Z–A)', modified: 'Last edited first', 'modified-old': 'Oldest edited first', custom: 'Custom order (drag to arrange)' };
function sortButton() {
  const b = iconAction('sort', 'Sort notes', (e) => {
    e.stopPropagation();
    openMenu('note-sort', () => TREE_SORTS.map((s) => ({
      label: `${s === state.noteSort ? '✓ ' : '\u2003'}${SORT_LABELS[s]}`,
      fn: () => { closeMenu(); state.noteSort = s; try { localStorage.setItem('mufka-note-sort', s); } catch { /* ignore */ } renderSidebar(); },
    })));
  }, `Sort notes: ${SORT_LABELS[state.noteSort]}`);
  b.dataset.menuAnchor = 'note-sort';
  b.setAttribute('aria-haspopup', 'menu');
  return b;
}
function loadNoteSort() { try { const s = localStorage.getItem('mufka-note-sort'); if (TREE_SORTS.includes(s)) state.noteSort = s; } catch { /* ignore */ } }

function smallButton(label, aria, fn, title) {
  const b = elem('button', 'side-btn', label);
  b.type = 'button';
  if (aria) b.setAttribute('aria-label', aria);
  if (title) b.title = title;
  b.addEventListener('click', fn);
  return b;
}

function renderSidebar() {
  const scroll = sideEl.scrollTop; // rebuilding children must not reset scroll
  // A re-render (e.g. when note texts finish loading) must not take the caret
  // out of the search field.
  const act = document.activeElement;
  const typing = act && act.id === 'ara-input' ? { start: act.selectionStart, end: act.selectionEnd } : null;
  sideEl.replaceChildren();
  renderSearchField();
  if (state.araQuery.trim()) renderSearchResults();
  else {
    renderPlaces();
    renderBookmarks();
    renderBoardsSection();
    renderNotesSection();
  }
  sideEl.scrollTop = scroll;
  if (typing) {
    const f = document.getElementById('ara-input');
    f.focus();
    try { f.setSelectionRange(typing.start, typing.end); } catch { /* ignore */ }
  }
}

function renderSearchField() {
  const wrap = elem('div', 'side-search-wrap');
  const field = document.createElement('input');
  field.type = 'search'; field.id = 'ara-input'; field.className = 'side-search';
  field.placeholder = 'Search or create a note';
  field.value = state.araQuery;
  field.setAttribute('aria-label', 'Search');
  field.title = K('Search notes and plans (⌘F). Enter opens the note with this name, or creates it.');
  field.addEventListener('focus', () => ensureNoteCache());
  field.addEventListener('input', () => { state.araQuery = field.value; state.focus = 'ara-input'; refreshSidebar(); });
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); openOrCreateFromSearch(); }
    else if (e.key === 'Escape' && field.value) { e.preventDefault(); e.stopPropagation(); state.araQuery = ''; state.focus = 'ara-input'; refreshSidebar(); }
  });
  const glass = icon('search', { size: 15 }); glass.classList.add('side-search-icon');
  wrap.append(glass, field);
  sideEl.append(wrap);
}

// Fixed places, always visible: Today (with its open to-dos) and Graph.
function renderPlaces() {
  const nav = elem('nav', 'places');
  nav.setAttribute('aria-label', 'Places');
  const place = (label, count, selected, fn, title, iconName) => {
    const b = elem('button', `place${selected ? ' selected' : ''}`);
    b.type = 'button';
    b.title = title;
    b.append(icon(iconName, { size: 17 }), elem('span', 'place-label', label));
    if (count) b.append(elem('span', 'place-count', String(count)));
    if (selected) b.setAttribute('aria-current', 'page');
    b.addEventListener('click', fn);
    nav.append(b);
  };
  const todayOpen = getDayItems(new Date()).filter((p) => !p.done).length;
  place('Home', todayOpen, state.contentView === 'day' && isToday(state.selectedDate), goToday, K('Home: today, its plans and its note (⌘T)'), 'home');
  place('Graph', 0, state.contentView === 'graph', () => openGraph(), K('Notes and links as a graph (⌘G)'), 'graph');
  nav.lastChild.id = 'graph-btn';
  sideEl.append(nav);
}


function renderNotesSection() {
  const body = sidebarSection('notes', 'Notes', [
    iconAction('newNote', 'New note', () => newNote(), K('New note in the selected folder (⌘N)')),
    iconAction('template', 'New note from template', () => newFromTemplate(), 'New note from a template: daily, meeting, project, budget, trip…'),
    iconAction('newFolder', 'New folder', () => newFolder(), 'New folder in the selected folder'),
    sortButton(),
  ], 'notes');
  if (!sectionOpen('notes')) return;
  const tree = buildTree(state.treeFolders, state.treeNotes, { sort: state.noteSort, order: state.treeOrder });
  if (tree.folders.length === 0 && tree.notes.length === 0 && !state.treeEdit) {
    const empty = elem('div', 'side-empty');
    empty.append(document.createTextNode('No notes yet. '), smallButton('Create one', null, () => newNote(), K('⌘N')));
    body.append(empty);
    return;
  }
  const container = elem('div', 'tree'); container.tabIndex = -1;
  renderTreeChildren(tree, 0, container, '');
  const drop = elem('div', 'tree-root-drop'); drop.setAttribute('aria-hidden', 'true');
  setupDrop(drop, '');
  container.append(drop);
  container.addEventListener('keydown', onTreeKey);
  body.append(container);
  requestAnimationFrame(() => { if (container.isConnected) drawGuides(container); });
}

// The right pane follows contentView (last opened day or note), independent of
// which sidebar tab is active — so Ara can show results on the left while the
// pane keeps the last thing you opened, then the chosen result.
function renderContent() {
  contentEl.replaceChildren();
  contentEl.classList.toggle('is-graph', state.contentView === 'graph');
  contentEl.classList.toggle('is-planner', state.contentView === 'planner');
  contentEl.classList.toggle('is-tasks', state.contentView === 'tasks');
  if (state.contentView === 'graph') contentEl.append(graph().el);
  else if (state.contentView === 'planner') renderPlanner(contentEl, state.weekDate, plannerApi);
  else if (state.contentView === 'tasks') renderTasks(contentEl, tasksApi());
  else if (state.contentView === 'note' && state.openNote) renderNotePane();
  else renderDayPage();
}

// --- graph view (src/graph-view.js) ---
// One instance for the window's life, so the layout survives re-renders and
// coming back to the graph. Local = around the open note.
let graphView = null;
function graph() {
  if (!graphView) {
    graphView = createGraphView({
      loadNotes: () => notesApi.all(),
      onOpen: (rel) => openNote(rel, 'oku', { keepTab: true }),
      onTag: (tag) => searchFor(`#${tag}`),
      onMissing: (title) => openWiki(title),
    });
  }
  return graphView;
}
// focus: put the keyboard on the canvas (when opened from the keyboard).
function openGraph({ local = false, focus = false } = {}) {
  navVisit({ view: 'graph' });
  state.contentView = 'graph';
  state.menu = null;
  render();
  graph().show({ center: state.openNote, local }).then(() => { if (focus) graph().focusCanvas(); });
}
// --- back / forward (Cmd+[ / Cmd+], the ‹ › in the pane bar) ---

const nav = createNavHistory();
let navigating = false; // moving through history must not record a new visit
function currentLocation() {
  if (state.contentView === 'graph') return { view: 'graph' };
  if (state.contentView === 'planner') return { view: 'planner', key: dayKey(startOfWeek(state.weekDate)) };
  if (state.contentView === 'tasks') return { view: 'tasks', rel: state.board ? state.board.rel : null };
  if (state.contentView === 'note' && state.openNote) return { view: 'note', rel: state.openNote };
  return { view: 'day', key: dayKey(state.selectedDate) };
}
function navVisit(to) {
  hidePreview();
  state.menu = null; // a row menu belongs to the pane it was opened on
  if (!navigating) nav.visit(currentLocation(), to);
  updateNavButtons();
}
function updateNavButtons() {
  document.getElementById('nav-back').disabled = !nav.canBack;
  document.getElementById('nav-forward').disabled = !nav.canForward;
}
const navValid = (loc) => (loc.view !== 'note' && loc.view !== 'tasks') || !loc.rel || state.notesFlat.some((n) => n.rel === loc.rel);
async function goNav(dir) {
  const loc = dir < 0 ? nav.back(currentLocation(), navValid) : nav.forward(currentLocation(), navValid);
  updateNavButtons();
  if (!loc) return;
  navigating = true;
  try {
    if (loc.view === 'note') await openNote(loc.rel, 'oku', { keepTab: true });
    else if (loc.view === 'graph') openGraph();
    else if (loc.view === 'planner') openPlanner(parseDayKey(loc.key));
    else if (loc.view === 'tasks') await openTasks(loc.rel);
    else await selectDay(parseDayKey(loc.key), { keepTab: true });
  } finally { navigating = false; updateNavButtons(); }
}
document.getElementById('nav-back').addEventListener('click', () => goNav(-1));
document.getElementById('nav-forward').addEventListener('click', () => goNav(1));

// Page preview of [[links]] (src/hover-preview.js).
const previewApi = {
  resolve: (target) => resolveLink(target, state.openNote || '', state.notesFlat),
  read: async (rel) => {
    if (rel === state.openNote) return state.noteContent;
    if (state.noteCache.has(rel)) return state.noteCache.get(rel);
    const res = await notesApi.read(rel);
    const text = res && !res.error ? res.content : '';
    state.noteCache.set(rel, text);
    return text;
  },
  renderInto: (el, content, rel) => {
    const dir = folderOf(rel);
    const attach = (raw) => resolveAttachment(raw, state.attachFiles, dir, attachmentsDirFor(state.layout, dir));
    for (const n of renderMarkdown(content, { doc: document, noteExists: wikiExists, attach, embedNote, embedStack: [rel] })) el.append(n);
    el.querySelectorAll('a[data-wiki]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault(); hidePreview(); openWiki(a.getAttribute('data-wiki'), a.getAttribute('data-heading'));
    }));
    el.querySelectorAll('a[data-external]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); notesApi.openExternal(a.getAttribute('href')); }));
    el.querySelectorAll('input').forEach((i) => { i.disabled = true; });
  },
  open: (rel, heading, target) => openWiki(target, heading),
};

// Where am I: the toolbar title and the window title follow the pane.
// --- Planner (src/planner.js): the week, as its own mode ---

function openPlanner(date = state.weekDate, { focusId } = {}) {
  navVisit({ view: 'planner', key: dayKey(startOfWeek(date)) });
  state.weekDate = date;
  state.contentView = 'planner';
  state.menu = null;
  render();
  if (focusId) requestAnimationFrame(() => highlightPlan(focusId));
}
function highlightPlan(id) {
  const n = document.querySelector(`.planner [data-id="${CSS.escape(id)}"]`);
  if (!n) return;
  n.scrollIntoView({ block: 'center' });
  n.focus();
  n.classList.add('pl-flash');
  setTimeout(() => n.classList.remove('pl-flash'), 1600);
}
// Back to notes: the open note, else the day page.
// Notes: back to the note you had open (or last opened), else the first note
// of the tree, else Home.
function openNotesMode() {
  const known = new Set(state.notesFlat.map((n) => n.rel));
  const last = [state.openNote, ...state.recent].find((r) => r && known.has(r));
  if (last) { openNote(last, 'oku', { keepTab: true }); return; }
  const first = firstNote(buildTree(state.treeFolders, state.treeNotes, { sort: state.noteSort, order: state.treeOrder }));
  if (first) openNote(first, 'oku', { keepTab: true });
  else selectDay(new Date());
}
function firstNote(node) {
  if (node.notes.length) return node.notes[0].rel;
  for (const f of node.folders) { const r = firstNote(f); if (r) return r; }
  return null;
}
// ⌃Tab goes round the modes: Notes → Planner → Tasks.
function toggleMode() {
  if (state.contentView === 'planner') openTasks();
  else if (state.contentView === 'tasks') openNotesMode();
  else openPlanner(new Date());
}
document.getElementById('mode-planner').addEventListener('click', () => { if (state.contentView !== 'planner') openPlanner(new Date()); });
document.getElementById('mode-notes').addEventListener('click', () => { if (state.contentView === 'planner' || state.contentView === 'tasks') openNotesMode(); });
document.getElementById('mode-tasks').addEventListener('click', () => { if (state.contentView !== 'tasks') openTasks(); });

function isThisWeekShown() { return weekKey(state.weekDate) === weekKey(new Date()); }
function weekPlans(wk) {
  return state.store.items.filter((p) => p.scope === 'week' && p.key === wk).sort((a, b) => a.created - b.created);
}
// Change a plan (move, retime, rename) as one undoable step.
function updatePlan(p, patch, message, keepFocus) {
  const plan = state.store.items.find((x) => x.id === p.id);
  if (!plan) return;
  if (p._occ && (patch.key || patch.scope || patch.time !== undefined)) { showToast('A repeating plan moves only as a whole series'); return; }
  pushUndo({ type: 'edit', id: plan.id, before: { scope: plan.scope, key: plan.key, title: plan.title, time: plan.time, endTime: plan.endTime, recur: plan.recur ? { ...plan.recur } : null } });
  Object.assign(plan, patch);
  if (plan.scope !== 'day') { plan.time = ''; plan.endTime = ''; }
  persistPlans();
  render();
  if (message) announce(K(`${message}. ⌘Z undoes.`));
  if (keepFocus) plannerFocus(plan.id);
}
function plannerMenuItems(p, key) {
  const days = weekDates(key ? parseDayKey(key) : state.weekDate);
  const wk = weekKey(days[0]);
  const moveItems = () => [
    ...days.map((d) => ({ label: `${formatWeekdayLong(d)} ${d.getDate()}${isToday(d) ? ' (today)' : ''}`, fn: () => { closeMenu(); updatePlan(p, { scope: 'day', key: dayKey(d) }, `${p.title} moved to ${formatWeekdayLong(d)}`); } })),
    { label: 'This week, no day', fn: () => { closeMenu(); updatePlan(p, { scope: 'week', key: wk }, `${p.title} moved to this week`); } },
    { label: 'Next week, same day', fn: () => { closeMenu(); updatePlan(p, key ? { scope: 'day', key: dayKey(addDays(parseDayKey(key), 7)) } : { scope: 'week', key: weekKey(addDays(days[0], 7)) }, `${p.title} moved to next week`); } },
  ];
  return [
    { label: 'Edit…', fn: () => { closeMenu(); plannerApi.edit(p); } },
    ...(p._occ ? [] : [{ label: 'Move to…', fn: () => openMenu(state.menu.anchorKey, moveItems) }]),
    ...(key ? [{ label: 'Open day', fn: () => { closeMenu(); selectDay(parseDayKey(key)); } }] : []),
    { label: 'Delete', fn: () => { closeMenu(); plannerApi.remove(p); } },
  ];
}
// A small dialog for a plan's title and times (the same controls as the day page).
function planDialog(heading, { title = '', time = '', endTime = '' }, onSave, opts = {}) {
  const layer = elem('div', 'palette-layer');
  const box = elem('div', 'palette plan-dialog');
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', heading);
  box.append(elem('div', 'plan-dialog-title', heading));
  const c = planControls({ idPrefix: 'dlg', title, time, endTime });
  box.append(c.wrap);
  // Day and Repeat (opts.date / opts.recur given): when, and how often.
  let dayInput = null; let repeatSel = null; let dayToggles = [];
  const when = elem('div', 'plan-dialog-when');
  if (opts.date) {
    const l = elem('label', 'plan-dialog-field');
    l.append(elem('span', null, 'Day'));
    dayInput = document.createElement('input');
    dayInput.type = 'date'; dayInput.id = 'dlg-date'; dayInput.value = dayKey(opts.date);
    l.append(dayInput);
    when.append(l);
  }
  if (opts.recur !== undefined) {
    const l = elem('label', 'plan-dialog-field');
    l.append(elem('span', null, 'Repeat'));
    repeatSel = document.createElement('select');
    repeatSel.id = 'dlg-repeat';
    l.append(repeatSel);
    when.append(l);
    const daysRow = elem('div', 'plan-dialog-days');
    daysRow.setAttribute('role', 'group'); daysRow.setAttribute('aria-label', 'Repeat on');
    const start = choiceFromRecur(opts.recur, opts.date || new Date());
    dayToggles = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((n, i) => {
      const b = elem('button', 'day-toggle', n);
      b.type = 'button'; b.dataset.dow = String(i + 1);
      b.setAttribute('aria-pressed', String(start.days.includes(i + 1)));
      b.addEventListener('click', () => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')));
      daysRow.append(b);
      return b;
    });
    const fill = () => {
      const d = dayInput ? parseDayKey(dayInput.value) || opts.date : (opts.date || new Date());
      const keep = repeatSel.value || start.id;
      repeatSel.replaceChildren(...repeatChoices(d).map((ch) => { const o = document.createElement('option'); o.value = ch.id; o.textContent = ch.label; return o; }));
      repeatSel.value = keep;
      daysRow.hidden = repeatSel.value !== 'custom';
    };
    repeatSel.addEventListener('change', fill);
    if (dayInput) dayInput.addEventListener('change', fill);
    fill();
    when.append(daysRow);
  }
  if (when.childNodes.length) box.append(when);
  // A repeating plan: say how it repeats and ask what to change.
  let scopeAll = null;
  if (opts.repeat) {
    const info = elem('div', 'repeat-tag plan-dialog-repeat');
    info.append(icon('repeat', { size: 13 }), elem('span', null, `Repeats: ${opts.repeat.label}`));
    box.append(info);
    const fs2 = elem('fieldset', 'plan-dialog-scope');
    fs2.append(elem('legend', null, 'Change'));
    const opt = (id, label, checked) => {
      const l = elem('label', 'plan-dialog-radio');
      const r = document.createElement('input'); r.type = 'radio'; r.name = 'dlg-scope'; r.id = id; r.checked = checked;
      l.append(r, document.createTextNode(` ${label}`));
      fs2.append(l);
      return r;
    };
    scopeAll = opt('dlg-scope-all', 'All days (the whole series)', true);
    const oneOnly = opt('dlg-scope-one', `Only ${opts.repeat.dayLabel}`, false);
    box.append(fs2);
    // Changing one day cannot change the rule.
    const sync = () => { when.hidden = oneOnly.checked; };
    scopeAll.addEventListener('change', sync); oneOnly.addEventListener('change', sync);
  }
  const restore = document.activeElement;
  const close = () => { layer.remove(); if (restore && restore.isConnected) restore.focus(); };
  const save = () => {
    const r = c.validate();
    if (!r.ok) { c.showError(r); return; }
    if (dayInput) {
      const d = parseDayKey(dayInput.value);
      if (!d) { c.showError({ error: 'Choose a day', field: dayInput }); return; }
      r.date = d;
    }
    if (repeatSel) {
      const days = dayToggles.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => Number(b.dataset.dow));
      if (repeatSel.value === 'custom' && !days.length) { c.showError({ error: 'Choose at least one day', field: repeatSel }); return; }
      r.recur = recurFromChoice(repeatSel.value, r.date || opts.date || new Date(), days);
    }
    close();
    onSave(r, scopeAll && !scopeAll.checked ? 'one' : 'all');
  };
  for (const inp of [c.titleInput, c.start, c.end, dayInput].filter(Boolean)) inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  const actions = elem('div', 'plan-dialog-actions');
  const cancel = elem('button', 'btn quiet', 'Cancel'); cancel.type = 'button'; cancel.addEventListener('click', close);
  const ok = elem('button', 'btn', 'Save'); ok.type = 'button'; ok.addEventListener('click', save);
  if (opts.repeat && opts.onSkip) {
    const skip = elem('button', 'btn quiet plan-dialog-skip', `Skip ${opts.repeat.dayLabel}`);
    skip.type = 'button';
    skip.addEventListener('click', () => { close(); opts.onSkip(); });
    actions.append(skip);
  }
  actions.append(cancel, ok);
  box.append(actions);
  layer.append(box);
  layer.addEventListener('mousedown', (e) => { if (e.target === layer) close(); });
  document.body.append(layer);
  c.titleInput.focus();
}

const plannerApi = {
  dayItems: (d) => getDayItems(d),
  dayEvents: (d) => (calApi ? eventsForDay(d) : []),
  calendarsConnected: () => calConnected,
  refreshCalendars: () => refreshCalendars(),
  openEvent: (ev) => openEventCard(ev),
  weekItems: weekPlans,
  add(o) {
    if (o.scope === 'week') {
      state.store.items.push({ id: genId(), scope: 'week', key: o.key, title: o.title, time: '', endTime: '', done: false, created: Date.now(), recur: null, doneDates: {}, exceptions: {} });
      persistPlans();
    } else addPlan(o.date, o);
    render();
    announce(`Added ${o.title}`);
  },
  toggle: (p) => toggleItem(p),
  update: updatePlan,
  remove(p) {
    if (p._occ) deleteOccurrence(p.id, p._date); else deletePlan(p.id);
    showToast(K('Deleted · ⌘Z undoes'));
  },
  edit(p) {
    const series = state.store.items.find((x) => x.id === p.id);
    if (!series) return;
    if (!series.recur) {
      if (series.scope !== 'day') {
        planDialog('Edit plan', p, (r) => updatePlan(p, { title: r.title }, `${r.title} saved`));
        return;
      }
      planDialog('Edit plan', p, (r) => updatePlan(p, { title: r.title, time: r.time, endTime: r.endTime, key: dayKey(r.date), recur: r.recur }, `${r.title} saved`), { date: parseDayKey(series.key), recur: null });
      return;
    }
    // A repeating plan: the whole series, or only this day (which becomes its
    // own plan, and the series skips that day).
    const dateKey = p._date || p.key;
    const d = parseDayKey(dateKey);
    planDialog('Edit repeating plan', p, (r, choice) => {
      if (choice === 'all') {
        // "Does not repeat" ends the series: the plan stays on this day only.
        const patch = { title: r.title, time: r.time, endTime: r.endTime, recur: r.recur };
        if (!r.recur) patch.key = dateKey;
        updatePlan(series, patch, r.recur ? `${r.title}: ${describeRecur(r.recur)}` : `${r.title} no longer repeats`);
        return;
      }
      series.exceptions = series.exceptions || {};
      series.exceptions[dateKey] = true;
      const one = { id: genId(), scope: 'day', key: dateKey, title: r.title, time: r.time, endTime: r.endTime, done: Boolean(series.doneDates && series.doneDates[dateKey]), created: Date.now(), recur: null, doneDates: {}, exceptions: {} };
      state.store.items.push(one);
      pushUndo({ type: 'detach', id: series.id, dateKey, newId: one.id });
      persistPlans(); render();
      announce(K(`${r.title} changed for ${formatWeekdayLong(d)} only. ⌘Z undoes.`));
    }, { recur: series.recur, repeat: { label: describeRecur(series.recur), dayLabel: `${formatWeekdayLong(d)} ${d.getDate()}` }, onSkip: () => { deleteOccurrence(series.id, dateKey); announce(`${p.title} skipped on ${formatWeekdayLong(d)}`); } });
  },
  prompt(heading, cb, times = {}) { planDialog(heading, times, (r) => cb(r)); },
  // "New plan": title, day, time and repeat in one dialog.
  newPlan(date, times = {}) {
    planDialog('New plan', times, (r) => {
      const plan = { id: genId(), scope: 'day', key: dayKey(r.date), title: r.title, time: r.time, endTime: r.endTime, done: false, created: Date.now(), recur: r.recur, doneDates: {}, exceptions: {} };
      state.store.items.push(plan);
      pushUndo({ type: 'remove-new', id: plan.id });
      persistPlans();
      openPlanner(r.date, { focusId: plan.id });
      announce(K(`Added ${r.title}${r.recur ? `, ${describeRecur(r.recur).toLowerCase()}` : ''}. ⌘Z undoes.`));
    }, { date, recur: null });
  },
  menu: (anchor, p, key) => openMenu(anchor, () => plannerMenuItems(p, key)),
  openDay: (d) => selectDay(d),
  hasDaily: (key) => state.dailyDates.has(key),
  goWeek: (d) => openPlanner(d),
  refresh: () => render(),
};

// --- Tasks (src/tasks.js): boards of tasks, each a Markdown note ---------
// A board is a note in the format of Obsidian's Kanban plugin (lib/kanban.mjs);
// new ones go to the Tasks folder. Every change writes the whole note.

const BOARD_KEY = 'mufka-board';
const BOARD_FOLDER = 'Tasks';
function boardList() {
  return state.vaultNotes.filter((n) => isBoard(n.content))
    .map((n) => ({ rel: n.rel, title: noteTitleOf(n.rel), content: n.content }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
async function openTasks(rel) {
  if (rel === undefined) {
    const boards = boardList();
    let last = null;
    try { last = localStorage.getItem(BOARD_KEY); } catch { /* ignore */ }
    rel = (boards.find((b) => b.rel === last) || boards[0] || {}).rel || null;
  }
  let content = null;
  if (rel) {
    const res = await notesApi.read(rel);
    if (res && !res.error) content = res.content; else rel = null;
  }
  navVisit({ view: 'tasks', rel });
  state.board = rel ? { rel, content } : null;
  state.contentView = 'tasks';
  state.menu = null;
  if (rel) { try { localStorage.setItem(BOARD_KEY, rel); } catch { /* ignore */ } }
  render();
}
// The board changed on disk (Obsidian, a sync): show it, unless it is our own write.
const ownBoardWrites = new Set();
async function reloadBoard() {
  if (!state.board) return;
  if (!state.notesFlat.some((n) => n.rel === state.board.rel)) { state.board = null; return; }
  const res = await notesApi.read(state.board.rel);
  if (!res || res.error || res.content === state.board.content || ownBoardWrites.has(res.content)) return;
  state.board.content = res.content;
}
let boardSaveChain = Promise.resolve();
function saveBoard(board, message) {
  if (!state.board) return;
  const text = serializeBoard(board);
  const { rel } = state.board;
  if (text !== state.board.content) {
    state.boardUndo.push({ rel, content: state.board.content });
    if (state.boardUndo.length > UNDO_LIMIT) state.boardUndo.shift();
    state.board.content = text;
    const vn = state.vaultNotes.find((n) => n.rel === rel);
    if (vn) vn.content = text;
    ownBoardWrites.add(text);
    boardSaveChain = boardSaveChain.then(() => notesApi.write(rel, text))
      .catch((e) => { console.error('board save failed', e); showToast('Could not save the board'); })
      .finally(() => setTimeout(() => ownBoardWrites.delete(text), 4000));
  }
  render();
  if (message) tasksAnnounce(message);
}
function undoBoard() {
  const last = state.boardUndo.pop();
  if (!last) return;
  if (!state.board || state.board.rel !== last.rel) { openTasks(last.rel).then(() => { state.boardUndo.push(last); undoBoard(); }); return; }
  state.board.content = last.content;
  const vn = state.vaultNotes.find((n) => n.rel === last.rel);
  if (vn) vn.content = last.content;
  ownBoardWrites.add(last.content);
  boardSaveChain = boardSaveChain.then(() => notesApi.write(last.rel, last.content)).catch(() => {});
  render();
  tasksAnnounce('Undone');
}
// A small dialog asking for a name, or a yes/no question (no `value`).
function askDialog({ heading, text, value, okLabel = 'Save', danger = false }, onOk) {
  const layer = elem('div', 'palette-layer');
  const box = elem('div', 'palette plan-dialog');
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', heading);
  box.append(elem('div', 'plan-dialog-title', heading));
  if (text) box.append(elem('p', 'ask-text', text));
  let input = null;
  if (value !== undefined) {
    input = document.createElement('input');
    input.className = 'ask-input'; input.value = value; input.setAttribute('aria-label', heading);
    box.append(input);
  }
  const restore = document.activeElement;
  const close = () => { layer.remove(); if (restore && restore.isConnected) restore.focus(); };
  const ok = () => {
    if (input && !input.value.trim()) { input.focus(); return; }
    close(); onOk(input ? input.value.trim() : true);
  };
  const actions = elem('div', 'plan-dialog-actions');
  const cancel = elem('button', 'btn quiet', 'Cancel'); cancel.type = 'button'; cancel.addEventListener('click', close);
  const yes = elem('button', danger ? 'btn danger' : 'btn primary', okLabel); yes.type = 'button'; yes.addEventListener('click', ok);
  actions.append(cancel, yes);
  box.append(actions);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); ok(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  layer.append(box);
  layer.addEventListener('mousedown', (e) => { if (e.target === layer) close(); });
  document.body.append(layer);
  (input || yes).focus();
  if (input) input.select();
}
function newTaskBoard() {
  askDialog({ heading: 'New board', text: `A board for one project, saved as a note in ${BOARD_FOLDER}/.`, value: '', okLabel: 'Create' }, async (name) => {
    const res = await notesApi.create(BOARD_FOLDER, name);
    if (!res || !res.rel) { showToast('Could not create the board'); return; }
    const text = serializeBoard(newBoard());
    await notesApi.write(res.rel, text);
    await refreshTree();
    await rebuildBacklinks();
    await openTasks(res.rel);
  });
}
function boardMenuItems() {
  const b = state.board;
  return [
    { label: 'New board…', fn: () => { closeMenu(); newTaskBoard(); } },
    { label: 'Rename board…', fn: () => {
      closeMenu();
      askDialog({ heading: 'Rename board', value: noteTitleOf(b.rel), okLabel: 'Rename' }, async (name) => {
        const res = await notesApi.rename(b.rel, name);
        if (!res || res.error) { showToast('Could not rename the board'); return; }
        await refreshTree(); await rebuildBacklinks();
        await openTasks(res.rel);
      });
    } },
    { label: 'Open as Markdown', fn: () => { closeMenu(); openNote(b.rel, 'oku', { keepTab: true, asText: true }); } },
    { label: 'Delete board…', fn: () => {
      closeMenu();
      askDialog({ heading: `Delete ${noteTitleOf(b.rel)}?`, text: 'The board and its tasks go to the Trash.', okLabel: 'Delete', danger: true }, async () => {
        await notesApi.remove(b.rel);
        try { localStorage.removeItem(BOARD_KEY); } catch { /* ignore */ }
        state.board = null;
        await refreshTree(); await rebuildBacklinks();
        await openTasks();
      });
    } },
  ];
}
function tasksApi() {
  const b = state.board;
  return {
    rel: b ? b.rel : null,
    title: b ? noteTitleOf(b.rel) : '',
    board: b ? parseBoard(b.content) : null,
    save: saveBoard,
    refresh: () => render(),
    newBoard: newTaskBoard,
    boardMenu: boardMenuItems,
    menu: (anchor, build) => openMenu(anchor, build),
    closeMenu,
    openExternal: (url) => notesApi.openExternal(url),
    openWiki: (target) => openWiki(target),
  };
}
// The sidebar's Tasks section: one row per board.
function renderBoardsSection() {
  const body = sidebarSection('tasks', 'Tasks', [
    iconAction('plus', 'New board', () => newTaskBoard(), 'New task board'),
  ], 'kanban');
  if (!sectionOpen('tasks')) return;
  const boards = boardList();
  if (!boards.length) {
    const empty = elem('div', 'side-empty');
    empty.append(document.createTextNode('No boards yet. '), smallButton('New board', null, () => newTaskBoard()));
    body.append(empty);
    return;
  }
  for (const b of boards) {
    const on = state.contentView === 'tasks' && state.board && state.board.rel === b.rel;
    const row = elem('button', `board-row${on ? ' selected' : ''}`);
    row.type = 'button';
    row.title = b.rel;
    row.append(icon('kanban', { size: 15 }), elem('span', 'board-name', b.title));
    const board = parseBoard(b.content);
    const open = board.columns.filter((c) => !c.complete).reduce((n, c) => n + c.cards.length, 0);
    if (open) row.append(elem('span', 'place-count', String(open)));
    if (on) row.setAttribute('aria-current', 'page');
    row.addEventListener('click', () => openTasks(b.rel));
    body.append(row);
  }
}

function renderPaneTitle() {
  const planner = state.contentView === 'planner';
  const tasks = state.contentView === 'tasks';
  document.getElementById('mode-planner').setAttribute('aria-pressed', String(planner));
  document.getElementById('mode-tasks').setAttribute('aria-pressed', String(tasks));
  document.getElementById('mode-notes').setAttribute('aria-pressed', String(!planner && !tasks));
  const el = document.getElementById('pane-title');
  el.replaceChildren();
  let title = 'Mufka';
  if (state.contentView === 'graph') { title = 'Graph'; el.append(elem('span', 'pt-main', 'Graph')); }
  else if (state.contentView === 'planner') { title = formatWeekRange(state.weekDate); el.append(elem('span', 'pt-main', title)); }
  else if (tasks) {
    title = state.board ? noteTitleOf(state.board.rel) : 'Tasks';
    if (state.board) el.append(elem('span', 'pt-path', 'Tasks / '));
    el.append(elem('span', 'pt-main', title));
  }
  else if (state.contentView === 'note' && state.openNote) {
    title = noteTitleOf(state.openNote);
    const folder = folderOf(state.openNote);
    if (folder) el.append(elem('span', 'pt-path', `${folder.split('/').join(' / ')} / `));
    el.append(elem('span', 'pt-main', title));
  } else {
    if (isToday(state.selectedDate)) {
      title = 'Home';
      el.append(elem('span', 'pt-main', 'Home'), elem('span', 'pt-path', ` · ${formatDayPretty(state.selectedDate)}`));
    } else {
      title = formatDayPretty(state.selectedDate);
      el.append(elem('span', 'pt-main', title));
    }
  }
  document.title = title === 'Mufka' ? 'Mufka' : `${title} — Mufka`;
}

// The notes folder ("vault"): which one is open and how to switch, at the
// bottom of the sidebar like Obsidian's vault switcher.
let vaultInfo = null;
async function loadVaultInfo() {
  vaultInfo = notesApi.vaultInfo ? await notesApi.vaultInfo().catch(() => null) : null;
  await loadTreeStyles();
  refreshSidebar();
  const el = document.getElementById('vault-name');
  // The default folder reads as Documents/Mufka; a chosen one by its own name.
  el.textContent = vaultInfo && !vaultInfo.error ? (vaultInfo.custom ? vaultInfo.name : `Documents/${vaultInfo.name}`) : '';
  document.getElementById('vault-btn').title = vaultInfo && vaultInfo.path
    ? `Notes are .md files in ${vaultInfo.path}. Click to open another folder (e.g. an Obsidian vault) or show this one in ${FILES_APP}.`
    : 'The folder your notes are stored in.';
}
document.getElementById('vault-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  openMenu('vault', () => [
    { label: 'Open another notes folder…', fn: () => { closeMenu(); notesApi.chooseVault(); } },
    { label: `Show this folder in ${FILES_APP}`, fn: () => { closeMenu(); notesApi.reveal(); } },
    ...(vaultInfo && vaultInfo.custom ? [{ label: "Use Mufka's own notes folder", fn: () => { closeMenu(); notesApi.useDefaultVault(); } }] : []),
  ]);
});

// Icons for the static controls in index.html (text stays as the label).
function decorateStatic() {
  const put = (id, name, keepText) => { const el = document.getElementById(id); const t = el.textContent.trim(); el.replaceChildren(icon(name)); if (keepText) el.append(elem('span', null, t)); };
  put('sidebar-toggle', 'sidebar');
  put('nav-back', 'back');
  put('nav-forward', 'forward');
  put('rightbar-btn', 'details', true);
  const v = document.getElementById('vault-btn');
  const text = elem('span', 'vault-text');
  text.append(...v.childNodes);
  v.replaceChildren(icon('vault', { size: 17 }), text);
}
decorateStatic();

// Sidebar footer: the keyboard ways in, always visible.
document.getElementById('foot-open').addEventListener('click', () => openQuickSwitcher());
document.getElementById('foot-commands').addEventListener('click', () => openCommandPalette());
document.getElementById('foot-keys').addEventListener('click', () => showShortcuts());

// Keyboard shortcuts cheat sheet (⌘/, Help menu, sidebar footer).
const SHORTCUTS = [
  ['Getting around', [['⌘O', 'Open a note (quick switcher)'], ['⌘P', 'Command palette'], ['⌘F', 'Search notes and plans'], ['⌘T', 'Home (today)'], ['⌘1', 'Planner (this week)'], ['⌘3', 'Tasks'], ['⌃Tab', 'Switch Notes / Planner / Tasks'], ['⌥⌘← / ⌥⌘→', 'Previous / next week in the Planner'], ['⌘2', 'Notes tree'], ['⌘G / ⇧⌘G', 'Graph / local graph'], ['⌘[ / ⌘]', 'Back / forward']]],
  ['Writing', [['⌘N', 'New note'], ['⌘E', 'Edit source / back to preview'], ['⇧⌘T', 'Insert template'], ['[[', 'Link a note (suggestions)'], ['#', 'Add a tag (suggestions)'], ['⌘Z / ⇧⌘Z', 'Undo / redo']]],
  ['Window', [['⌘\\', 'Show / hide sidebar'], ['⇧⌘\\', 'Show / hide details (outline, links, tags)'], ['⌘/', 'This list'], ['⌘,', 'Settings']]],
];
function showShortcuts() {
  openPalette({
    id: 'shortcuts',
    placeholder: 'Keyboard shortcuts — type to filter',
    footer: 'esc close',
    items: (q) => SHORTCUTS.flatMap(([group, rows]) => rows.map(([keys, what]) => ({ label: what, hint: keys, detail: group, run: () => {} })))
      .filter((r) => !q.trim() || foldTR(`${r.label} ${r.hint} ${r.detail}`).includes(foldTR(q.trim()))),
  });
}

// --- right sidebar: Outline / Links / Tags of the open note ---

const rightbarEl = document.getElementById('rightbar');
const rightbarBtn = document.getElementById('rightbar-btn');
function loadRightbar() {
  try { Object.assign(state.rightbar, JSON.parse(localStorage.getItem('mufka-rightbar') || '{}')); } catch { /* ignore */ }
}
function saveRightbar() { try { localStorage.setItem('mufka-rightbar', JSON.stringify(state.rightbar)); } catch { /* ignore */ } }
function toggleRightbar(open = !state.rightbar.open) {
  state.rightbar.open = open; saveRightbar();
  if (open) rebuildBacklinks().then(renderRightbar).catch(() => {});
  renderRightbar();
}
rightbarBtn.addEventListener('click', () => toggleRightbar());

function renderRightbar() {
  const { open, tab } = state.rightbar;
  rightbarEl.hidden = !open;
  rightbarBtn.setAttribute('aria-pressed', String(open));
  if (!open) return;
  const scroll = rightbarEl.querySelector('.rb-body')?.scrollTop || 0;
  rightbarEl.replaceChildren();
  const tabs = elem('div', 'rb-tabs');
  tabs.setAttribute('role', 'tablist');
  for (const [id, label] of [['outline', 'Outline'], ['links', 'Links'], ['tags', 'Tags']]) {
    const b = elem('button', 'rb-tab', label);
    b.type = 'button'; b.dataset.rbTab = id;
    b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(tab === id));
    b.addEventListener('click', () => { state.rightbar.tab = id; saveRightbar(); renderRightbar(); });
    tabs.append(b);
  }
  const body = elem('div', 'rb-body');
  rightbarEl.append(tabs, body);
  const rel = state.contentView !== 'day' ? state.openNote : null;
  if (tab === 'tags') renderTagsPanel(body);
  else if (!rel) body.append(elem('div', 'rb-empty', 'Open a note to see its outline and links.'));
  else if (tab === 'outline') renderOutlinePanel(body);
  else renderLinksPanel(body, rel);
  body.scrollTop = scroll;
}

function renderOutlinePanel(body) {
  const heads = outline(state.noteContent);
  if (!heads.length) { body.append(elem('div', 'rb-empty', 'No headings')); return; }
  const min = Math.min(...heads.map((h) => h.depth));
  for (const h of heads) {
    const b = elem('button', 'rb-item rb-heading', h.text);
    b.type = 'button';
    b.style.paddingLeft = `${8 + (h.depth - min) * 14}px`;
    b.addEventListener('click', () => {
      if (state.contentView !== 'note') { state.contentView = 'note'; render(); }
      scrollToHeading(h.text);
    });
    body.append(b);
  }
}

function renderLinksPanel(body, rel) {
  const out = outgoingLinks(state.noteContent, rel, state.notesFlat);
  body.append(elem('div', 'rb-group', `Outgoing links (${out.length})`));
  if (!out.length) body.append(elem('div', 'rb-empty', 'No links'));
  for (const l of out) {
    const b = elem('button', `rb-item${l.rel ? '' : ' missing'}`, l.rel ? noteTitleOf(l.rel) : l.target);
    b.type = 'button';
    if (!l.rel) b.title = 'Not created yet';
    b.addEventListener('click', () => (l.rel ? openNote(l.rel, 'oku', { keepTab: true }) : openWiki(l.target)));
    body.append(b);
  }
  // Other notes naming this one without a link; "Link" turns one into [[link]].
  const notes = state.vaultNotes.map((n) => (n.rel === rel ? { rel, content: state.noteContent } : n));
  const mentions = unlinkedMentions(notes, rel);
  body.append(elem('div', 'rb-group', `Unlinked mentions (${mentions.length})`));
  if (!mentions.length) body.append(elem('div', 'rb-empty', 'None'));
  for (const m of mentions) {
    const row = elem('div', 'rb-mention');
    const open = elem('button', 'rb-item');
    open.type = 'button';
    open.append(elem('div', 'rb-mention-title', noteTitleOf(m.rel)), elem('div', 'rb-mention-line', m.text));
    open.addEventListener('click', () => openNote(m.rel, 'oku', { keepTab: true }));
    const link = elem('button', 'btn quiet rb-link', 'Link');
    link.type = 'button';
    link.setAttribute('aria-label', `Link the mention in ${noteTitleOf(m.rel)}`);
    link.addEventListener('click', async () => {
      const res = await notesApi.read(m.rel);
      if (!res || res.error) return;
      const next = linkMention(res.content, m, noteTitleOf(rel));
      if (next === res.content) { showToast('The note changed; try again'); await rebuildBacklinks(); renderRightbar(); return; }
      await notesApi.write(m.rel, next);
      state.noteCache.set(m.rel, next);
      await rebuildBacklinks();
      render();
    });
    row.append(open, link);
    body.append(row);
  }
}

function renderTagsPanel(body) {
  const tags = buildTagIndex(state.vaultNotes);
  if (!tags.length) { body.append(elem('div', 'rb-empty', 'No tags')); return; }
  for (const t of tags) {
    const b = elem('button', 'rb-item rb-tag');
    b.type = 'button';
    b.append(elem('span', 'rb-tag-name', `#${t.tag}`), elem('span', 'rb-count', String(t.count)));
    b.addEventListener('click', () => searchFor(`#${t.tag}`));
    body.append(b);
  }
}

// --- bookmarks (shared with Obsidian through .obsidian/bookmarks.json) ---

const isBookmarked = (rel) => Boolean(rel) && state.bookmarks.includes(rel);
async function loadBookmarks() {
  const res = notesApi.bookmarks ? await notesApi.bookmarks().catch(() => null) : null;
  state.bookmarks = Array.isArray(res) ? res : [];
}
async function toggleBookmark(rel) {
  if (!rel) return;
  const res = await notesApi.toggleBookmark(rel).catch(() => null);
  if (!Array.isArray(res)) { showToast('Could not save the bookmark'); return; }
  state.bookmarks = res;
  showToast(res.includes(rel) ? 'Bookmarked' : 'Bookmark removed');
  render();
}
// A "Bookmarks" list above the tree (only notes that still exist).
function renderBookmarks() {
  const known = new Set(state.notesFlat.map((n) => n.rel));
  const list = state.bookmarks.filter((r) => known.has(r));
  if (!list.length) return;
  const sec = sidebarSection('bookmarks', 'Bookmarks', [], 'bookmark');
  if (!sectionOpen('bookmarks')) return;
  for (const rel of list) {
    const b = elem('button', `bookmark-row${state.openNote === rel && state.contentView === 'note' ? ' selected' : ''}`, noteTitleOf(rel));
    b.type = 'button'; b.dataset.rel = rel;
    b.addEventListener('click', () => openNote(rel, 'oku', { keepTab: true }));
    sec.append(b);
  }
}

// --- status bar: words · characters · backlinks of the open note ---

const statusEl = document.getElementById('status-bar');
function updateStatusBar() {
  const show = state.contentView === 'note' && Boolean(state.openNote);
  statusEl.hidden = !show;
  if (!show) return;
  const { words, characters } = countText(state.noteContent);
  const back = backlinksFor(state.backlinks, state.openNote).length;
  statusEl.textContent = `${back} ${back === 1 ? 'backlink' : 'backlinks'} · ${words.toLocaleString('en-GB')} ${words === 1 ? 'word' : 'words'} · ${characters.toLocaleString('en-GB')} ${characters === 1 ? 'character' : 'characters'}`;
}

// --- templates (Obsidian's core Templates plugin) ---

function templateNotes() {
  const dir = state.layout.templates;
  if (!dir) return [];
  return state.notesFlat.filter((n) => n.rel.startsWith(`${dir}/`));
}
function fillTemplate(text, title, date = new Date()) {
  return applyTemplate(text, { title, date, dateFormat: state.layout.dateFormat, timeFormat: state.layout.timeFormat });
}
async function dailyTemplateText(key) {
  const rel = state.layout.dailyTemplate;
  if (!rel) return '';
  const res = await notesApi.read(rel).catch(() => null);
  if (!res || res.error) return '';
  const now = new Date();
  const day = parseDayKey(key);
  day.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
  return fillTemplate(res.content, key, day);
}

// Insert text where the user is typing (block editor or source view, at the
// caret), else at the end of the open note.
function insertIntoNote(text) {
  const ta = document.getElementById('block-editor') || document.getElementById('note-editor');
  if (ta) {
    ta.focus();
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  if (state.contentView !== 'note' || !state.openNote) { showToast('Open a note first'); return; }
  const src = state.noteContent;
  setSrc('note', src.trim() ? `${src.replace(/\n+$/, '')}\n\n${text}` : text, true);
  histRecord('note');
  render();
}

// Mufka's own templates (lib/builtin-templates.mjs) and the vault's Templates
// folder; one there with the same name takes the built-in one's place.
function allTemplates() { return templateChoices(templateNotes()); }
async function templateText(choice) {
  if (choice.kind === 'builtin') return BUILTIN_TEMPLATES.find((b) => b.id === choice.id)?.text ?? '';
  const res = await notesApi.read(choice.rel).catch(() => null);
  return res && !res.error ? res.content : '';
}
function templateRows(q, run) {
  return fuzzyFilter(q, allTemplates(), (c) => c.name).map(({ item, indices }) => ({
    label: item.name, indices,
    detail: item.kind === 'builtin' ? 'Built-in' : (state.layout.templates || ''),
    run: () => run(item),
  }));
}
function openTemplatePicker() {
  openPalette({
    id: 'templates',
    placeholder: 'Insert a template…',
    keepEditor: true,
    footer: '↑↓ navigate · ↵ insert · esc close',
    items: (q) => templateRows(q, async (item) => {
      insertIntoNote(fillTemplate(await templateText(item), state.openNote ? noteTitleOf(state.openNote) : ''));
    }),
  });
}
// A new note from a template: choose one, then name the note (a name is
// suggested), and it opens filled in.
function newFromTemplate(parentRel = targetFolder()) {
  openPalette({
    id: 'new-from-template',
    placeholder: 'New note from a template…',
    footer: '↑↓ navigate · ↵ choose · esc close',
    items: (q) => templateRows(q, (item) => {
      const b = item.kind === 'builtin' ? BUILTIN_TEMPLATES.find((x) => x.id === item.id) : null;
      const name = b ? fillTemplate(b.title, '') : item.name;
      state.araQuery = ''; setSectionOpen('notes', true); if (state.sidebarCollapsed) setSidebar(false);
      if (parentRel) ensureExpanded(parentRel);
      startTreeEdit({ kind: 'new-note', parentRel, template: item, name });
    }),
  });
}
// Copy the built-in templates into the Templates folder (made if missing), so
// they can be changed; ones already there are left alone.
async function copyBuiltinTemplates() {
  const dir = state.layout.templates || 'Templates';
  if (!state.treeFolders.includes(dir)) {
    const made = await notesApi.createFolder(folderOf(dir), dir.slice(dir.lastIndexOf('/') + 1));
    if (!made || made.error) { showToast('Could not make the Templates folder'); return; }
  }
  const have = new Set(state.notesFlat.filter((n) => n.rel.startsWith(`${dir}/`)).map((n) => n.title.toLowerCase()));
  let added = 0;
  for (const b of BUILTIN_TEMPLATES) {
    if (have.has(b.name.toLowerCase())) continue;
    const res = await notesApi.create(dir, b.name);
    if (res && res.rel) { await notesApi.write(res.rel, b.text); added += 1; }
  }
  const lay = await notesApi.layout().catch(() => null);
  if (lay && !lay.error) state.layout = { ...state.layout, ...lay };
  await refreshTree();
  ensureExpanded(dir);
  render();
  showToast(added ? `${added} templates copied to ${dir}; change them there` : `The templates are already in ${dir}`);
}

// --- quick switcher (Cmd+O) and command palette (Cmd+P) ---

function loadRecent() { try { state.recent = JSON.parse(localStorage.getItem('mufka-recent') || '[]').filter((r) => typeof r === 'string'); } catch { state.recent = []; } }
function rememberRecent(rel) {
  state.recent = pushRecent(state.recent, rel);
  try { localStorage.setItem('mufka-recent', JSON.stringify(state.recent)); } catch { /* ignore */ }
}

// Notes by fuzzy title (path as a fallback); recent notes first when empty.
// Enter on no match, or Shift+Enter, creates a note with the typed name.
function openQuickSwitcher() {
  const createRow = (q) => (q.trim() ? { label: `Create "${q.trim()}"`, detail: targetFolder() ? targetFolder().split('/').join(' / ') : '', run: () => createNamedNote(q) } : null);
  openPalette({
    id: 'switcher',
    placeholder: 'Find or create a note…',
    footer: '↑↓ navigate · ↵ open · ⇧↵ create · esc close',
    items: (q) => {
      const notes = state.notesFlat;
      if (!q.trim()) {
        const byRel = new Map(notes.map((n) => [n.rel, n]));
        const recent = state.recent.map((r) => byRel.get(r)).filter(Boolean);
        const rest = notes.filter((n) => !state.recent.includes(n.rel));
        return [...recent, ...rest].slice(0, 50).map((n) => switcherRow(n, null));
      }
      const scored = [];
      for (const n of notes) {
        const t = fuzzyMatch(q, n.title);
        const p = t ? null : fuzzyMatch(q, n.rel.replace(/\.md$/i, ''));
        if (t) scored.push({ n, score: t.score + (state.recent.includes(n.rel) ? 2 : 0), indices: t.indices });
        else if (p) scored.push({ n, score: p.score - 5, indices: null });
      }
      scored.sort((a, b) => b.score - a.score);
      return scored.map((x) => switcherRow(x.n, x.indices));
    },
    empty: createRow,
    onShiftEnter: (q) => createNamedNote(q),
  });
}
function switcherRow(n, indices) {
  return { label: n.title, indices, detail: n.folder ? n.folder.split('/').join(' / ') : '', run: () => openNote(n.rel, 'oku', { keepTab: true }) };
}
async function createNamedNote(q) {
  const name = q.trim();
  if (!name) return;
  const res = await notesApi.create(targetFolder(), name);
  await refreshTree();
  if (res && res.rel) await openNote(res.rel, 'duzenle', { keepTab: true });
}

function openRandomNote() {
  const notes = state.notesFlat.filter((n) => n.rel !== state.openNote);
  if (!notes.length) { showToast('No other notes'); return; }
  openNote(notes[Math.floor(Math.random() * notes.length)].rel, 'oku', { keepTab: true });
}

// Every command, with the shortcut shown as a hint. `when` hides commands that
// need an open note.
function commandList() {
  const noteOpen = () => state.contentView === 'note' && Boolean(state.openNote);
  const saveOpen = () => notesApi.write(state.openNote, state.noteContent);
  return [
    { label: 'Open quick switcher', hint: '⌘O', run: openQuickSwitcher },
    { label: 'Show keyboard shortcuts', hint: '⌘/', run: showShortcuts },
    { label: 'Create new note', hint: '⌘N', run: newNote },
    { label: 'Create new folder', run: newFolder },
    { label: 'Open the week planner', hint: '⌘1', run: () => openPlanner(new Date()) },
    { label: 'New plan', hint: '⇧⌘P', run: () => plannerApi.newPlan(new Date()) },
    { label: 'Open tasks', hint: '⌘3', run: () => openTasks() },
    { label: 'New task board', run: () => newTaskBoard() },
    ...boardList().map((b) => ({ label: `Open board: ${b.title}`, run: () => openTasks(b.rel) })),
    { label: 'Open graph view', hint: '⌘G', run: () => openGraph() },
    { label: 'Open local graph', hint: '⇧⌘G', when: noteOpen, run: () => openGraph({ local: true }) },
    { label: 'Open random note', run: openRandomNote },
    { label: 'Bookmark / unbookmark current note', when: noteOpen, run: () => toggleBookmark(state.openNote) },
    { label: 'Navigate back', hint: '⌘[', run: () => goNav(-1) },
    { label: 'Navigate forward', hint: '⌘]', run: () => goNav(1) },
    { label: 'Go home (today)', hint: '⌘T', run: goToday },
    { label: 'Show calendar', hint: '⌘1', run: () => setTab('takvim') },
    { label: 'Show notes', hint: '⌘2', run: () => setTab('notlar') },
    { label: 'Search plans and notes', hint: '⌘F', run: () => setTab('ara') },
    { label: 'Toggle sidebar', hint: '⌘\\', run: toggleSidebar },
    { label: 'Toggle right sidebar', hint: '⇧⌘\\', run: () => toggleRightbar() },
    { label: 'Show outline', run: () => { state.rightbar.tab = 'outline'; toggleRightbar(true); } },
    { label: 'Show tags', run: () => { state.rightbar.tab = 'tags'; toggleRightbar(true); } },
    { label: 'Toggle source / preview', hint: '⌘E', when: noteOpen, run: toggleNoteView },
    { label: 'Copy note as Markdown', when: noteOpen, run: async () => { await notesApi.copy(state.noteContent); showToast('Copied'); } },
    { label: 'Attach file to note', when: noteOpen, run: addFileToNote },
    { label: 'Open settings', hint: '⌘,', run: openSettings },
    { label: 'Refresh calendars', when: () => calConnected, run: refreshCalendars },
    { label: 'Connect Wispr Flow', run: openSettings },
    { label: 'Insert template', hint: '⇧⌘T', when: noteOpen, run: openTemplatePicker },
    { label: 'New note from template', run: () => newFromTemplate() },
    { label: 'Copy built-in templates to the Templates folder', run: copyBuiltinTemplates },
    { label: 'Export note as PDF', when: noteOpen, run: () => runExport('pdf', noteTitleOf(state.openNote), () => state.noteContent, saveOpen) },
    { label: 'Export note as Markdown', when: noteOpen, run: () => runExport('md', noteTitleOf(state.openNote), () => state.noteContent, saveOpen) },
    { label: 'Show unused attachments', run: showUnusedAttachments },
    { label: `Show notes folder in ${FILES_APP}`, run: () => notesApi.reveal() },
  ].filter((c) => !c.when || c.when());
}
function openCommandPalette() {
  openPalette({
    id: 'commands',
    placeholder: 'Type a command…',
    footer: '↑↓ navigate · ↵ run · esc close',
    items: (q) => fuzzyFilter(q, commandList(), (c) => c.label)
      .map(({ item, indices }) => ({ label: item.label, hint: item.hint, indices, run: item.run })),
  });
}

// Open Search with a query (e.g. a #tag clicked in a note or the graph).
function searchFor(q) {
  state.araQuery = q;
  setTab('ara');
  ensureNoteCache();
}

function hint(text) { const d = document.createElement('div'); d.className = 'ara-empty'; d.textContent = text; return d; }
function elem(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

// --- Takvim sidebar: mini month + selected-day timed plans ---


function goToday() { selectDay(new Date()); }

async function selectDay(date, opts = {}) {
  navVisit({ view: 'day', key: dayKey(date) });
  state.selectedDate = date;
  state.calCursor = new Date(date.getFullYear(), date.getMonth(), 1);
  state.contentView = 'day';
  state.editPlanId = null;
  state.menu = null;
  state.dailyDeleteConfirm = false;
  state.blockEdit = null;
  const key = dayKey(date);
  const res = await notesApi.readDaily(key);
  state.dailyNote = { key, content: res && !res.error ? res.content : null };
  histReset('daily');
  render();
  scheduleBacklinks();
}

// --- Takvim content: the day page ---

function renderDayPage() {
  const date = state.selectedDate;
  const col = contentEl;

  const head = elem('div', 'day-head');
  const main = elem('div', 'day-head-main');
  const h = elem('h1', 'day-title');
  if (isToday(date)) {
    h.append(elem('span', 'accent', 'Today, '), document.createTextNode(formatDayPretty(date)));
  } else {
    h.textContent = formatDayPretty(date);
  }
  main.append(h);
  const items = getDayItems(date);
  const todo = items.filter((p) => !p.done).length;
  const done = items.filter((p) => p.done).length;
  const counts = elem('div', 'day-counts');
  counts.append(elem('span', 'count-todo', `${todo} to do`), document.createTextNode(' · '), elem('span', 'count-done', `${done} done`));
  main.append(counts);
  head.append(main);
  const nav = elem('div', 'navgroup day-nav');
  const prev = elem('button', null, '‹'); prev.setAttribute('aria-label', 'Previous day'); prev.title = 'Previous day';
  const today = elem('button', null, 'Today'); today.title = K('Go to today (⌘T)');
  const next = elem('button', null, '›'); next.setAttribute('aria-label', 'Next day'); next.title = 'Next day';
  prev.addEventListener('click', () => selectDay(addDays(date, -1), { keepTab: true }));
  today.addEventListener('click', () => goToday());
  next.addEventListener('click', () => selectDay(addDays(date, 1), { keepTab: true }));
  today.disabled = isToday(date);
  nav.append(prev, today, next);
  head.append(nav);
  col.append(head);

  // First run: one short card saying where things are (dismissed for good).
  if (!welcomeDismissed()) col.append(welcomeCard());

  // The day's plans, to read (and tick off). Planning happens in the Planner:
  // a click on a plan opens it there.
  const events = calApi ? eventsForDay(date) : [];
  if (!items.length && !events.length) col.append(emptyDayCard(date));
  // Plans and calendar events by time; all-day events first.
  const timed = [
    ...events.filter((e) => !e.time).map((e) => ({ at: '', row: () => agendaEventRow(e) })),
    ...[...items.filter((p) => p.time).map((p) => ({ at: p.time, row: () => agendaRow(p, date) })),
      ...events.filter((e) => e.time).map((e) => ({ at: e.time, row: () => agendaEventRow(e) }))].sort((a, b) => a.at.localeCompare(b.at)),
  ];
  if (timed.length) col.append(section('Scheduled', timed.map((x) => x.row())));
  const untimed = items.filter((p) => !p.time);
  if (untimed.length) col.append(section('To-dos', untimed.map((p) => agendaRow(p, date))));
  if (items.length) {
    const more = elem('button', 'btn quiet plan-in-planner');
    more.type = 'button';
    more.append(icon('planDay', { size: 15 }), elem('span', null, 'Plan in the Planner'));
    more.addEventListener('click', () => openPlanner(date));
    col.append(more);
  }

  // Günün notu.
  col.append(renderDailyNoteSection(date));

  // Notes linking to this day's note (nothing shown when none: a day page
  // is not where people link from).
  if (backlinksFor(state.backlinks, dailyRel(dayKey(date))).length) col.append(backlinkSection(dailyRel(dayKey(date))));
}

// One plan on the day page: tick it off, or click to see it in the Planner.
function agendaRow(p, date) {
  const li = elem('li', `plan-row agenda-row${p.done ? ' done' : ''}${p.recur ? ' recurring' : ''}`);
  const check = document.createElement('input');
  check.type = 'checkbox'; check.className = 'check'; check.checked = p.done;
  check.setAttribute('aria-label', `Done: ${p.title}`);
  check.addEventListener('change', () => toggleItem(p));
  li.append(check);
  const open = elem('button', 'agenda-open');
  open.type = 'button';
  open.title = 'Open in the Planner';
  if (p.time) {
    const chips = elem('span', 'chips');
    chips.append(elem('span', 'chip', p.time));
    if (p.endTime) chips.append(elem('span', 'chip-dash', '–'), elem('span', 'chip', p.endTime));
    open.append(chips);
  }
  open.append(elem('span', 'plan-title', p.title));
  if (p.recur) {
    const r = elem('span', 'repeat-tag');
    r.append(icon('repeat', { size: 12 }), elem('span', null, describeRecur(p.recur)));
    open.append(r);
  }
  open.addEventListener('click', () => openPlanner(date, { focusId: p.id }));
  li.append(open);
  return li;
}
// Nothing planned: say so and offer the Planner.
function emptyDayCard(date) {
  const c = elem('section', 'empty-day');
  c.append(elem('div', 'empty-day-title', isToday(date) ? 'Nothing planned for today yet.' : 'Nothing planned for this day.'));
  c.append(elem('div', 'empty-day-text', 'Want to plan it? The Planner shows your week, with times.'));
  const b = elem('button', 'btn');
  b.type = 'button';
  b.append(icon('planDay', { size: 15 }), elem('span', null, isToday(date) ? 'Plan today' : 'Plan this day'));
  b.addEventListener('click', () => openPlanner(date));
  c.append(b);
  return c;
}

function section(titleText, children) {
  const s = elem('section', 'section');
  s.append(elem('h2', 'section-title', titleText));
  const list = elem('ul', 'plan-list');
  for (const c of children) {
    if (c.tagName === 'LI') list.append(c);
    else { const li = document.createElement('li'); li.append(c); list.append(li); }
  }
  s.append(list);
  return s;
}

// Shared title + "Saatli" + start/end controls, used by the add row and the
// in-place editor. idPrefix ('add' | 'edit') keeps element ids stable/unique.
function planControls({ idPrefix, title = '', time = '', endTime = '' }) {
  const wrap = elem('div', 'plan-form');

  const titleInput = document.createElement('input');
  titleInput.type = 'text'; titleInput.className = 'plan-form-title';
  titleInput.id = idPrefix === 'add' ? 'todo-add' : 'plan-edit';
  titleInput.maxLength = 200; titleInput.value = title;
  titleInput.placeholder = 'Add a plan';
  titleInput.setAttribute('aria-label', 'Title');

  const saatli = document.createElement('input');
  saatli.type = 'checkbox'; saatli.className = 'saatli-check'; saatli.id = `${idPrefix}-saatli`;
  saatli.checked = Boolean(time);
  const saatliLabel = elem('label', 'saatli-label'); saatliLabel.htmlFor = saatli.id;
  saatliLabel.append(saatli, document.createTextNode(' Timed'));

  const times = elem('span', 'times');
  const start = document.createElement('input');
  start.type = 'time'; start.className = 'time-start'; start.id = `${idPrefix}-start`;
  start.value = time; start.setAttribute('aria-label', 'Start');
  const end = document.createElement('input');
  end.type = 'time'; end.className = 'time-end'; end.id = `${idPrefix}-end`;
  end.value = endTime; end.setAttribute('aria-label', 'End');
  times.append(start, elem('span', 'time-dash', '–'), end);
  times.hidden = !saatli.checked;

  const msg = elem('span', 'form-msg');
  saatli.addEventListener('change', () => {
    times.hidden = !saatli.checked; msg.textContent = '';
    if (saatli.checked) start.focus();
  });

  const row = elem('span', 'plan-form-row');
  row.append(titleInput, saatliLabel, times, msg);
  wrap.append(row);

  function validate() {
    const t = titleInput.value.trim();
    if (!t) return { ok: false };
    if (!saatli.checked) return { ok: true, title: t, time: '', endTime: '' };
    if (!start.value) return { ok: false, error: 'Choose a time', field: start };
    if (end.value && end.value <= start.value) return { ok: false, error: 'End must be after start', field: end };
    return { ok: true, title: t, time: start.value, endTime: end.value || '' };
  }
  function showError(r) { if (r.error) { msg.textContent = r.error; if (r.field) r.field.focus(); } }

  return { wrap, titleInput, start, end, validate, showError };
}

function addRow(date) {
  const li = elem('li', 'add-row');
  const c = planControls({ idPrefix: 'add' });
  c.titleInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const r = c.validate();
    if (!r.ok) { c.showError(r); return; }
    addPlan(date, r);
    state.focus = 'todo-add';
    render();
  });
  li.append(c.wrap);
  return li;
}

function startEdit(id) {
  closeMenu();
  state.editPlanId = id;
  state.focus = 'plan-edit';
  render();
}

function editorRow(p) {
  const li = elem('li', 'plan-row editing');
  const c = planControls({ idPrefix: 'edit', title: p.title, time: p.time, endTime: p.endTime });
  const save = () => {
    const r = c.validate();
    if (!r.ok) { c.showError(r); return false; }
    return savePlanEdit(p.id, r);
  };
  const cancel = () => { removeOutside(); state.editPlanId = null; render(); };
  for (const inp of [c.titleInput, c.start, c.end]) {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
  }
  attachOutsideSave(c.wrap, save);
  li.append(c.wrap);
  return li;
}

function planRow(p, timed) {
  if (state.editPlanId === p.id) return editorRow(p);

  const li = elem('li', 'plan-row' + (p.done ? ' done' : ''));
  const check = document.createElement('input');
  check.type = 'checkbox'; check.className = 'check'; check.checked = p.done;
  check.setAttribute('aria-label', 'Done');
  check.addEventListener('change', () => toggleItem(p));
  li.append(check);

  if (timed && p.time) {
    const chips = elem('span', 'chips');
    chips.append(elem('span', 'chip', p.time));
    if (p.endTime) chips.append(elem('span', 'chip-dash', '–'), elem('span', 'chip', p.endTime));
    li.append(chips);
  }

  const title = elem('span', 'plan-title', p.title);
  title.addEventListener('click', () => startEdit(p.id));
  li.append(title);

  if (p.recur) li.append(elem('span', 'repeat-label', 'repeats'));

  const menuBtn = elem('button', 'menu-btn');
  menuBtn.append(icon('more', { size: 15 }));
  menuBtn.type = 'button';
  menuBtn.setAttribute('aria-label', 'Options');
  menuBtn.setAttribute('aria-haspopup', 'menu');
  menuBtn.dataset.menuAnchor = p.id;
  menuBtn.addEventListener('click', (e) => { e.stopPropagation(); openMenu(p.id, () => planMenuItems(p)); });
  li.append(menuBtn);
  return li;
}

function planMenuItems(p) {
  return [
    { label: 'Edit', fn: () => startEdit(p.id) },
    {
      label: 'Delete',
      fn: () => {
        if (p.recur) {
          openMenu(p.id, () => [
            { label: 'Only this day', fn: () => { deleteOccurrence(p.id, dayKey(state.selectedDate)); closeMenu(); } },
            { label: 'All in series', fn: () => { closeMenu(); deletePlan(p.id); } },
          ]);
        } else { closeMenu(); deletePlan(p.id); }
      },
    },
  ];
}

// --- generic "⋯" menu (top-level layer, never clipped). anchorKey matches a
// [data-menu-anchor]; buildItems() returns [{ label, fn }]. ---

const menuLayer = document.getElementById('menu-layer');

function openMenu(anchorKey, buildItems) { state.menu = { anchorKey, buildItems }; renderMenu(); }
function closeMenu() { if (state.menu) { state.menu = null; renderMenu(); } }

function menuItem(label, onActivate) {
  const b = elem('button', 'menu-item', label);
  b.type = 'button'; b.setAttribute('role', 'menuitem');
  b.addEventListener('click', onActivate);
  return b;
}

function renderMenu() {
  menuLayer.replaceChildren();
  if (!state.menu) return;
  const anchor = document.querySelector(`[data-menu-anchor="${CSS.escape(state.menu.anchorKey)}"]`);
  if (!anchor) { state.menu = null; return; }

  const backdrop = elem('div', 'menu-backdrop');
  backdrop.addEventListener('mousedown', (e) => { e.preventDefault(); closeMenu(); });
  menuLayer.append(backdrop);

  const menu = elem('div', 'row-menu'); menu.setAttribute('role', 'menu');
  const items = state.menu.buildItems().map((it) => it.el || menuItem(it.label, it.fn));
  menu.addEventListener('keydown', (e) => {
    const list = [...menu.querySelectorAll('.menu-item')];
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
  });
  items.forEach((it) => menu.append(it));
  menuLayer.append(menu);

  // Position below the button, right-aligned, clamped inside the viewport.
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth; const mh = menu.offsetHeight;
  let top = r.bottom + 4; if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
  let left = r.right - mw; if (left < 8) left = 8; if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
  menu.style.top = `${top}px`; menu.style.left = `${left}px`;
  (menu.querySelector('.menu-item, .swatch.on, .swatch, .icon-choice.on, .icon-choice') || menu.querySelector('button, input'))?.focus();
}

let outsideHandler = null;
function attachOutsideSave(rootEl, save) {
  removeOutside();
  outsideHandler = (e) => { if (!rootEl.contains(e.target)) save(); };
  setTimeout(() => document.addEventListener('mousedown', outsideHandler), 0);
}
function removeOutside() {
  if (outsideHandler) { document.removeEventListener('mousedown', outsideHandler); outsideHandler = null; }
}

// --- daily note on the day page ---

function renderDailyNoteSection(date) {
  const key = dayKey(date);
  const content = state.dailyNote.key === key ? state.dailyNote.content : null;
  const s = elem('section', 'section daily-note');
  const header = elem('div', 'section-head');
  header.append(elem('h2', 'section-title', 'Daily note'));
  const actions = elem('div', 'head-actions');
  header.append(actions);
  s.append(header);

  if (content == null) {
    const add = elem('button', 'btn quiet', 'Add note');
    add.addEventListener('click', async () => {
      // The vault's daily template (Obsidian daily-notes.json), filled for that day.
      const text = await dailyTemplateText(key);
      await notesApi.writeDaily(key, text);
      state.dailyNote = { key, content: text };
      state.dailyDates.add(key);
      histReset('daily');
      state.blockEdit = text ? null : { scope: 'daily', newAfter: -1, caret: 0 };
      render();
    });
    actions.append(add);
    return s;
  }

  // Several sections share the day page, so the daily note keeps its copy icon
  // and "⋯" menu on its own label line (right-aligned to the text column).
  const getSrc = () => state.dailyNote.content || '';
  const dailyDelete = async () => {
    await notesApi.deleteDaily(key);
    state.dailyNote = { key, content: null };
    state.dailyDates.delete(key);
    state.blockEdit = null;
    render();
  };
  actions.append(
    copyIconButton(getSrc),
    menuIconButton('menu-daily', () => [
      { label: 'Export…', fn: () => openMenu('menu-daily', () => exportSubItems(key, getSrc, () => notesApi.writeDaily(key, getSrc()))) },
      { label: 'Delete', fn: () => openMenu('menu-daily', () => [
        { label: 'Cancel', fn: () => closeMenu() },
        { label: 'Delete', fn: () => { closeMenu(); dailyDelete(); } },
      ]) },
    ]),
  );

  const body = elem('div', 'note-body daily-body');
  renderBlockEditor(body, 'daily');
  wireNoteDrop(body, 'daily');
  s.append(body);
  return s;
}

// A quiet in-place "Delete?  Cancel / Delete" confirmation group.
function confirmDelete(onCancel, onConfirm) {
  const g = elem('span', 'confirm-del');
  g.append(elem('span', 'confirm-q', 'Delete?'));
  const cancel = elem('button', 'btn quiet', 'Cancel');
  cancel.addEventListener('click', onCancel);
  const del = elem('button', 'btn danger', 'Delete');
  del.addEventListener('click', onConfirm);
  g.append(cancel, del);
  return g;
}

// Copy icon button: copies raw Markdown; shows a tick + aria "Copied" 1.5s.
function copyIconButton(getText) {
  const b = elem('button', 'icon-btn-sq copy-btn');
  b.append(icon('copy'));
  b.title = 'Copy the note as Markdown';
  b.type = 'button';
  b.setAttribute('aria-label', 'Copy');
  b.setAttribute('aria-live', 'polite');
  b.addEventListener('click', async (e) => {
    e.stopPropagation();
    await notesApi.copy(getText());
    b.replaceChildren(icon('check')); b.setAttribute('aria-label', 'Copied');
    setTimeout(() => { if (b.isConnected) { b.replaceChildren(icon('copy')); b.setAttribute('aria-label', 'Copy'); } }, 1500);
  });
  return b;
}

// "⋯" icon button that opens a generic menu with the given items. Always
// visible (unlike the row ".menu-btn" which is hover-revealed).
function menuIconButton(anchorKey, buildItems) {
  const b = elem('button', 'icon-btn-sq');
  b.append(icon('more'));
  b.title = 'More actions';
  b.type = 'button';
  b.setAttribute('aria-label', 'Options');
  b.setAttribute('aria-haspopup', 'menu');
  b.dataset.menuAnchor = anchorKey;
  b.addEventListener('click', (e) => { e.stopPropagation(); openMenu(anchorKey, buildItems); });
  return b;
}

// Items for the open note's "⋯" menu: mode toggle, export (sub), delete (sub).
function noteActionItems(title, getSrc, saveUnsaved) {
  return [
    { label: state.noteView === 'source' ? 'Back to preview' : 'Edit source', fn: () => { closeMenu(); toggleNoteView(); } },
    { label: 'Attach file…', fn: () => addFileToNote() },
    { label: 'Rename…', fn: () => { closeMenu(); render(); startRenameNote(); } },
    { label: isBookmarked(state.openNote) ? 'Remove bookmark' : 'Bookmark', fn: () => { closeMenu(); toggleBookmark(state.openNote); } },
    { label: 'Open local graph', fn: () => { closeMenu(); openGraph({ local: true }); } },
    { label: 'Insert template…', fn: () => { closeMenu(); openTemplatePicker(); } },
    { label: 'Export…', fn: () => openMenu('menu-note', () => exportSubItems(title, getSrc, saveUnsaved)) },
    { label: 'Delete', fn: () => openMenu('menu-note', () => [
      { label: 'Cancel', fn: () => closeMenu() },
      { label: 'Delete', fn: () => { closeMenu(); deleteOpenNote(); } },
    ]) },
  ];
}
function exportSubItems(title, getSrc, saveUnsaved) {
  return [
    { label: 'PDF', fn: () => { closeMenu(); runExport('pdf', title, getSrc, saveUnsaved); } },
    { label: 'Markdown', fn: () => { closeMenu(); runExport('md', title, getSrc, saveUnsaved); } },
  ];
}

async function runExport(kind, title, getSrc, saveUnsaved) {
  try {
    if (saveUnsaved) await saveUnsaved();
    const res = kind === 'pdf'
      ? await notesApi.exportPDF(title, getSrc(), attachDirFor(state.contentView === 'note' ? 'note' : 'daily'))
      : await notesApi.exportMarkdown(title, getSrc());
    if (res && res.canceled) return;
    showToast(res && res.ok ? 'Saved' : 'Export failed');
  } catch { showToast('Export failed'); }
}

// --- Markdown mounting (wires links + task toggles) ---

// A wiki target exists if it resolves against the flat note list (from the
// context of the currently open note).
// ![[Note]] embeds: the note's latest known text (the open note's live text,
// else the vault snapshot), with attachments resolved from its own folder.
function embedNote(target) {
  const rel = resolveLink(target, state.openNote || '', state.notesFlat);
  if (!rel) return null;
  const known = rel === state.openNote ? state.noteContent
    : (state.vaultNotes.find((n) => n.rel === rel) || {}).content ?? state.noteCache.get(rel);
  if (known == null) return null;
  const dir = folderOf(rel);
  return { rel, content: known, attach: (raw) => resolveAttachment(raw, state.attachFiles, dir, attachmentsDirFor(state.layout, dir)) };
}

function wikiExists(target) {
  return resolveLink(target, state.openNote || '', state.notesFlat) !== null;
}

// Attachment links resolve against every non-note file in the vault, relative
// to the folder of the note being rendered (daily notes live in Günlük).
const attachDirFor = (scope) => (scope === 'daily' ? state.layout.daily : folderOf(state.openNote || ''));
const attachResolverFor = (scope) => (raw) => resolveAttachment(
  raw, state.attachFiles, attachDirFor(scope), attachmentsDirFor(state.layout, attachDirFor(scope)));
// Vault path of a day's daily note.
const dailyRel = (key) => (state.layout.daily ? `${state.layout.daily}/${key}.md` : `${key}.md`);

// Open an attachment (image or file) by its resolved vault path, via IPC.
async function openAttachment(rel) {
  if (!rel) return;
  const res = await notesApi.attachOpen(rel);
  if (res?.error) showToast(res.error);
}

// Scroll the open note's rendered body to a heading by its (folded) text.
function scrollToHeading(heading) {
  if (!heading) return;
  const want = foldTR(String(heading).trim());
  requestAnimationFrame(() => {
    const h = [...contentEl.querySelectorAll('.md h1, .md h2, .md h3, .md h4, .md h5, .md h6')]
      .find((el) => foldTR(el.textContent.trim()) === want);
    if (h) h.scrollIntoView({ block: 'start' });
  });
}

// Report a rename/move's link-rewrite outcome as a toast.
function reportLinks(res) {
  if (!res) return;
  if (res.linksFailed > 0) showToast('Some links could not be updated');
  else if (res.linksUpdated > 0) showToast(`${res.linksUpdated} ${res.linksUpdated === 1 ? 'link' : 'links'} updated`);
}

// Follow a [[wiki]] link; create the note (in the linking note's folder) if it
// is missing. "Folder/Title" targets keep their folder; a bare title is created
// alongside the linking note.
async function openWiki(target, heading) {
  const rel = resolveLink(target, state.openNote || '', state.notesFlat);
  if (rel) { await openNote(rel, 'oku', { keepTab: true }); scrollToHeading(heading); return; }
  const t = target.trim();
  let parent = folderOf(state.openNote || '');
  let name = t;
  if (t.includes('/')) { parent = folderOf(t); name = t.slice(t.lastIndexOf('/') + 1); }
  const res = await notesApi.create(parent, name);
  await refreshTree();
  if (res && res.rel) await openNote(res.rel, 'duzenle', { keepTab: true });
}

// --- Notlar sidebar: a file tree ---

// The daily notes folder is special in the tree (cannot be renamed/moved/deleted).
const isGunluk = (rel) => state.layout.daily !== '' && rel === state.layout.daily;
const noteTitleOf = (rel) => rel.slice(rel.lastIndexOf('/') + 1).replace(/\.md$/i, '');

async function refreshTree() {
  const res = await notesApi.tree();
  if (res && !res.error) {
    state.treeFolders = res.folders.map((f) => f.rel);
    state.treeNotes = res.notes;
    state.notesFlat = flattenNotes(res.notes);
  }
  await refreshAttachList();
}

async function refreshAttachList() {
  const l = await notesApi.attachList();
  state.attachFiles = new Set(Array.isArray(l) ? l : []);
}

// Rebuild the whole vault backlink index from every note's content. Cheap for a
// personal vault. Called when a note/day is opened, on window focus, and at
// launch — i.e. right before any backlink section is shown, so it is always
// current (a note's own backlinks are unaffected by editing that note).
async function rebuildBacklinks() {
  const res = await notesApi.all();
  state.vaultNotes = Array.isArray(res) ? res : [];
  state.backlinks = buildBacklinkIndex(state.vaultNotes);
}

// Rebuild the index without blocking the current render, then re-render so the
// backlink sections reflect it — unless the user is typing in an editor, where
// a re-render would disrupt focus (backlinks refresh on the next natural render).
function scheduleBacklinks() {
  rebuildBacklinks().then(() => {
    // Never re-render while an editor is open/active: a re-entrant render during
    // a block edit can rebuild the editor from a half-updated source.
    if (state.blockEdit || document.getElementById('block-editor') || document.getElementById('note-editor')) return;
    render();
  }).catch(() => { /* ignore */ });
}

// Collapsed/expanded preference for the backlinks section (global, persisted).
// When never toggled, it defaults to collapsed only when there are no backlinks.
function backlinksCollapsed(n) {
  let pref = null;
  try { pref = localStorage.getItem('mufka-backlinks'); } catch { /* ignore */ }
  if (pref === '1') return false; // expanded
  if (pref === '0') return true;  // collapsed
  return n === 0;
}
function setBacklinksCollapsed(collapsed) {
  try { localStorage.setItem('mufka-backlinks', collapsed ? '0' : '1'); } catch { /* ignore */ }
}

// "Linked mentions (N)" section for the note at `rel`. Collapsible; each
// entry shows the linking note's title, its folder path (muted) and the line
// containing the link. Not part of copy/export (it is separate DOM, and those
// use the raw Markdown source).
function backlinkSection(rel) {
  const entries = backlinksFor(state.backlinks, rel);
  const n = entries.length;
  const collapsed = backlinksCollapsed(n);
  const s = elem('section', 'section backlinks');
  // Nothing links here yet: one plain sentence on how to make a link, no
  // control to puzzle over.
  if (n === 0) {
    s.append(elem('div', 'backlinks-empty', `No other note links here yet. To link to this note, type [[${noteTitleOf(rel)}]] in another note.`));
    return s;
  }
  const notes = new Set(entries.map((e) => e.rel)).size;
  const head = elem('button', 'backlinks-head');
  head.type = 'button';
  head.setAttribute('aria-expanded', String(!collapsed));
  head.title = 'Other notes that link to this one with [[…]]. Click one to open it.';
  head.append(elem('span', 'tri', collapsed ? '▸' : '▾'));
  head.append(elem('span', 'backlinks-title', `Linked from ${notes} ${notes === 1 ? 'note' : 'notes'}`));
  head.addEventListener('click', () => { setBacklinksCollapsed(!collapsed); render(); });
  s.append(head);
  if (collapsed) return s;

  const list = elem('ul', 'backlinks-list');
  for (const e of entries) {
    const li = elem('li', 'backlink');
    const btn = elem('button', 'backlink-btn');
    btn.type = 'button';
    btn.append(elem('span', 'backlink-title', noteTitleOf(e.rel)));
    const f = folderOf(e.rel);
    if (f) btn.append(elem('span', 'backlink-folder', f.split('/').join(' / ')));
    btn.append(elem('span', 'backlink-line', e.line));
    btn.addEventListener('click', () => openNote(e.rel, 'oku', { keepTab: true }));
    li.append(btn);
    list.append(li);
  }
  s.append(list);
  return s;
}

function loadExpanded() {
  try { state.expanded = new Set(JSON.parse(localStorage.getItem('mufka-expanded') || '[]')); } catch { state.expanded = new Set(); }
}
function saveExpanded() { try { localStorage.setItem('mufka-expanded', JSON.stringify([...state.expanded])); } catch { /* ignore */ } }
function ensureExpanded(rel) { if (rel) { state.expanded.add(rel); saveExpanded(); } }
function expandAncestors(rel) {
  let f = folderOf(rel);
  while (f) { state.expanded.add(f); f = folderOf(f); }
  saveExpanded();
}

// Folder that new notes/folders go into: the selected folder, else the open
// note's folder, else the root.
function targetFolder() {
  if (state.selectedFolder != null) return state.selectedFolder;
  if (state.openNote) return folderOf(state.openNote);
  return '';
}

function newNote() { state.araQuery = ''; setSectionOpen('notes', true); if (state.sidebarCollapsed) setSidebar(false); startTreeEdit({ kind: 'new-note', parentRel: targetFolder() }); }
function newFolder() { state.araQuery = ''; setSectionOpen('notes', true); if (state.sidebarCollapsed) setSidebar(false); startTreeEdit({ kind: 'new-folder', parentRel: targetFolder() }); }
function newNoteIn(rel) { ensureExpanded(rel); startTreeEdit({ kind: 'new-note', parentRel: rel }); }
function newFolderIn(rel) { ensureExpanded(rel); startTreeEdit({ kind: 'new-folder', parentRel: rel }); }

function startTreeEdit(edit) {
  state.treeEdit = edit;
  if (edit.parentRel) ensureExpanded(edit.parentRel);
  state.focus = 'tree-edit';
  refreshSidebar();
}

function treeEditDefault() {
  const e = state.treeEdit;
  if (!e) return '';
  if (e.kind === 'new-note') return e.name || 'Untitled';
  if (e.kind === 'new-folder') return 'New folder';
  if (e.kind === 'rename-note') return state.notesFlat.find((n) => n.rel === e.rel)?.title || '';
  if (e.kind === 'rename-folder') return e.rel.slice(e.rel.lastIndexOf('/') + 1);
  return '';
}

async function commitTreeEdit(value) {
  const e = state.treeEdit;
  if (!e) return;
  state.treeEdit = null;
  const name = value.trim();
  if (!name) { render(); return; }
  if (e.kind === 'new-note') {
    const res = await notesApi.create(e.parentRel, name);
    if (res && res.rel && e.template) {
      await notesApi.write(res.rel, fillTemplate(await templateText(e.template), noteTitleOf(res.rel)));
      await refreshTree();
      await openNote(res.rel, 'oku', { keepTab: true });
      return;
    }
    await refreshTree();
    if (res && res.rel) { await openNote(res.rel, 'duzenle', { keepTab: true }); return; }
  } else if (e.kind === 'new-folder') {
    const res = await notesApi.createFolder(e.parentRel, name);
    if (res && res.rel) ensureExpanded(res.rel);
    await refreshTree();
  } else if (e.kind === 'rename-note') {
    const res = await notesApi.rename(e.rel, name);
    if (res && res.rel) remapRel(e.rel, res.rel);
    await refreshTree();
    reportLinks(res);
  } else if (e.kind === 'rename-folder') {
    const res = await notesApi.renameFolder(e.rel, name);
    if (res && res.rel) remapRel(e.rel, res.rel);
    await refreshTree();
    reportLinks(res);
  }
  render();
}

// After a note/folder moves or is renamed, fix open note / expanded / selection.
function remapRel(oldRel, newRel) {
  const fix = (r) => (r === oldRel ? newRel : (r && r.startsWith(`${oldRel}/`) ? newRel + r.slice(oldRel.length) : r));
  if (state.openNote) state.openNote = fix(state.openNote);
  if (state.selectedFolder != null) state.selectedFolder = fix(state.selectedFolder);
  const next = new Set();
  for (const r of state.expanded) next.add(fix(r));
  state.expanded = next; saveExpanded();
  state.treeStyles = remapStyles(state.treeStyles, oldRel, newRel);
  state.treeOrder = remapOrder(state.treeOrder, oldRel, newRel);
  saveTreeStyles();
}

function toggleFolder(rel) {
  state.selectedFolder = rel;
  if (state.expanded.has(rel)) state.expanded.delete(rel); else state.expanded.add(rel);
  saveExpanded();
  refreshSidebar();
  document.querySelector(`.tree-row[data-rel="${CSS.escape(rel)}"]`)?.focus();
}

async function deleteNoteRel(rel) {
  await notesApi.remove(rel);
  forgetTreeStyles(rel);
  if (state.openNote === rel) { state.openNote = null; state.noteContent = ''; state.contentView = 'day'; }
  state.noteCache.delete(rel);
  await refreshTree();
  render();
}

async function deleteFolderRel(rel) {
  await notesApi.removeFolder(rel);
  forgetTreeStyles(rel);
  if (state.openNote && (state.openNote === rel || state.openNote.startsWith(`${rel}/`))) {
    state.openNote = null; state.noteContent = ''; state.contentView = 'day';
  }
  state.folderDeleteConfirm = null;
  await refreshTree();
  render();
}

async function doMove(srcKey, destFolderRel) {
  if (!srcKey) return;
  const isFolder = srcKey[0] === 'f';
  const rel = srcKey.slice(2);
  if (isGunluk(rel)) { showToast('The daily notes folder stays in its place; drag it beside another item to reorder'); return; }
  if (!canMoveInto(rel, isFolder, destFolderRel)) return;
  const res = await notesApi.move(rel, destFolderRel);
  if (res && res.rel) remapRel(rel, res.rel);
  await refreshTree();
  render();
  reportLinks(res);
}


// Decorative vertical guide under each expanded folder, spanning its visible
// descendants, aligned under the disclosure triangle. The path to the open note
// is drawn in the muted colour. Guides never intercept clicks or AT.
function drawGuides(container) {
  const onPath = new Set();
  for (let f = folderOf(state.openNote || ''); f; f = folderOf(f)) onPath.add(f);
  const allRows = [...container.querySelectorAll('.tree-row')];
  for (const fr of container.querySelectorAll('.folder-row')) {
    const rel = fr.dataset.rel;
    if (!state.expanded.has(rel)) continue;
    const descendants = allRows.filter((r) => r.dataset.rel && r.dataset.rel.startsWith(`${rel}/`));
    if (descendants.length === 0) continue;
    const last = descendants[descendants.length - 1];
    const top = fr.offsetTop + fr.offsetHeight;
    const bottom = last.offsetTop + last.offsetHeight;
    const depth = rel.split('/').length - 1;
    const g = elem('div', `tree-guide depth-${depth % 5}` + (onPath.has(rel) ? ' on-path' : ''));
    g.style.background = folderColor(rel, state.treeStyles);
    g.setAttribute('aria-hidden', 'true');
    g.style.left = `${8 + depth * 16 + 7}px`;
    g.style.top = `${top}px`;
    g.style.height = `${Math.max(0, bottom - top)}px`;
    container.append(g);
  }
}

function renderTreeChildren(node, depth, parentEl, folderRel) {
  const e = state.treeEdit;
  if (e && (e.kind === 'new-note' || e.kind === 'new-folder') && (e.parentRel || '') === folderRel) {
    parentEl.append(treeEditRow(depth));
  }
  for (const f of node.folders) {
    if (e && e.kind === 'rename-folder' && e.rel === f.rel) parentEl.append(treeEditRow(depth));
    else parentEl.append(folderRow(f, depth));
    if (state.folderDeleteConfirm === f.rel) parentEl.append(folderConfirmRow(f, depth));
    if (state.expanded.has(f.rel)) renderTreeChildren(f, depth + 1, parentEl, f.rel);
  }
  for (const n of node.notes) {
    if (e && e.kind === 'rename-note' && e.rel === n.rel) parentEl.append(treeEditRow(depth));
    else parentEl.append(noteRow(n, depth));
  }
}

function addMenuBtn(row, key, buildItems) {
  const btn = elem('button', 'menu-btn');
  btn.append(icon('more', { size: 15 }));
  btn.type = 'button'; btn.setAttribute('aria-label', 'Options'); btn.setAttribute('aria-haspopup', 'menu');
  btn.dataset.menuAnchor = key;
  btn.addEventListener('click', (ev) => { ev.stopPropagation(); openMenu(key, buildItems); });
  row.append(btn);
}
function makeDraggable(row, key) {
  row.draggable = true;
  row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', key); e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); });
  row.addEventListener('dragend', () => row.classList.remove('dragging'));
}
// Dropping on a row: its top or bottom edge puts the item before or after it
// (the custom order); the middle of a folder moves the item into the folder.
function dropZone(row, e, isFolder) {
  const r = row.getBoundingClientRect();
  const y = (e.clientY - r.top) / (r.height || 1);
  if (isFolder) return y < 0.25 ? 'before' : (y > 0.75 ? 'after' : 'into');
  return y < 0.5 ? 'before' : 'after';
}
function clearDrop(row) { row.classList.remove('drag-over', 'drop-before', 'drop-after'); }
function setupRowDrop(row, rel, isFolder) {
  row.addEventListener('dragover', (e) => {
    e.preventDefault();
    const zone = dropZone(row, e, isFolder);
    clearDrop(row);
    row.classList.add(zone === 'into' ? 'drag-over' : `drop-${zone}`);
  });
  row.addEventListener('dragleave', () => clearDrop(row));
  row.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    const zone = dropZone(row, e, isFolder);
    clearDrop(row);
    const key = e.dataTransfer.getData('text/plain');
    if (zone === 'into') doMove(key, rel); else dropBeside(key, rel, zone);
  });
}
function findTreeNode(node, rel) {
  if (node.rel === rel) return node;
  const f = node.folders.find((x) => rel === x.rel || rel.startsWith(`${x.rel}/`));
  return f ? findTreeNode(f, rel) : null;
}
// The item goes to the target's folder if it is elsewhere, then takes its
// place beside the target. The tree switches to the custom order and keeps it
// (in .mufka/tree.json, with the icons and colours).
async function dropBeside(srcKey, targetRel, where) {
  if (!srcKey) return;
  const isFolder = srcKey[0] === 'f';
  let rel = srcKey.slice(2);
  if (!rel || rel === targetRel) return;
  const dest = folderOf(targetRel);
  if (folderOf(rel) !== dest) {
    if (isGunluk(rel)) { showToast('The daily notes folder stays in its place; drag it beside another item to reorder'); return; }
    if (!canMoveInto(rel, isFolder, dest)) return;
    const res = await notesApi.move(rel, dest);
    if (!res || !res.rel) { reportLinks(res); return; }
    remapRel(rel, res.rel);
    rel = res.rel;
    await refreshTree();
    reportLinks(res);
  }
  const tree = buildTree(state.treeFolders, state.treeNotes, { sort: state.noteSort, order: state.treeOrder });
  const node = findTreeNode(tree, dest);
  if (!node) { render(); return; }
  const siblings = [...node.folders.map((f) => f.name), ...node.notes.map((n) => leafOf(n.rel))];
  const others = siblings.filter((n) => n !== leafOf(rel));
  const i = others.indexOf(leafOf(targetRel));
  const before = where === 'before' ? leafOf(targetRel) : (i >= 0 && i + 1 < others.length ? others[i + 1] : null);
  state.treeOrder = placeInOrder(state.treeOrder, dest, siblings, leafOf(rel), before);
  if (state.noteSort !== 'custom') {
    state.noteSort = 'custom';
    try { localStorage.setItem('mufka-note-sort', 'custom'); } catch { /* ignore */ }
  }
  saveTreeStyles();
  render();
}
function setupDrop(el, destFolderRel) {
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('drag-over'); doMove(e.dataTransfer.getData('text/plain'), destFolderRel); });
}

// --- colours and icons in the tree (lib/treestyle.mjs) ---
// Kept in the vault as .mufka/tree.json (main.js), so they travel with the
// notes. Folders and their guide line share a colour (their level's unless
// one is chosen); a note takes its folder's colour when selected.
async function loadTreeStyles() {
  const res = await notesApi.treeStyles().catch(() => null);
  if (!res || res.error) { state.treeStyles = {}; state.treeOrder = {}; return; }
  state.treeStyles = res.items || {};
  state.treeOrder = res.order || {};
  // Before 1.4 the styles lived in this window's storage: move them over once.
  const key = `mufka-tree-style:${(vaultInfo && vaultInfo.path) || ''}`;
  try {
    const old = JSON.parse(localStorage.getItem(key) || 'null');
    if (old && !res.exists && Object.keys(old).length) { state.treeStyles = old; saveTreeStyles(); }
    if (old) localStorage.removeItem(key);
  } catch { /* ignore */ }
}
function saveTreeStyles() {
  notesApi.saveTreeStyles({ items: state.treeStyles, order: state.treeOrder })
    .then((r) => { if (r && r.error) showToast('Could not save the icons and colours'); })
    .catch(() => showToast('Could not save the icons and colours'));
}
function setTreeStyle(rel, field, value) {
  state.treeStyles = setStyle(state.treeStyles, rel, field, value);
  saveTreeStyles();
  refreshSidebar();
}
function forgetTreeStyles(rel) {
  const keep = Object.keys(state.treeStyles).filter((r) => r !== rel && !r.startsWith(`${rel}/`));
  state.treeStyles = pruneStyles(state.treeStyles, keep);
  state.treeOrder = forgetOrder(state.treeOrder, rel);
  saveTreeStyles();
}
function treeIcon(rel, fallback) {
  const wrap = elem('span', 'tree-icon');
  const v = state.treeStyles[rel] && state.treeStyles[rel].icon;
  if (v && !isIconId(v)) wrap.append(elem('span', 'tree-emoji', v));
  else wrap.append(icon(v || fallback, { size: 15 }));
  return wrap;
}

function pickerBox(title) {
  const box = elem('div', 'style-picker');
  box.append(elem('div', 'style-picker-title', title));
  return box;
}
function openColorPicker(key, rel, type) {
  openMenu(key, () => {
    const box = pickerBox('Colour');
    const current = (state.treeStyles[rel] && state.treeStyles[rel].color) || '';
    const grid = elem('div', 'swatches');
    for (const p of PALETTE) {
      const b = elem('button', 'swatch' + (current === p.id ? ' on' : ''));
      b.type = 'button'; b.title = p.name;
      b.setAttribute('aria-label', p.name); b.setAttribute('aria-pressed', String(current === p.id));
      b.style.setProperty('--sw', p.hex);
      b.addEventListener('click', () => { closeMenu(); setTreeStyle(rel, 'color', p.id); });
      grid.append(b);
    }
    box.append(grid);
    const reset = elem('button', 'btn quiet style-reset', type === 'folder' ? 'Default (by level)' : 'Default');
    reset.type = 'button';
    reset.addEventListener('click', () => { closeMenu(); setTreeStyle(rel, 'color', ''); });
    box.append(reset);
    return [{ el: box }];
  });
}
function openIconPicker(key, rel) {
  openMenu(key, () => {
    const box = pickerBox('Icon');
    const current = (state.treeStyles[rel] && state.treeStyles[rel].icon) || '';
    const grid = elem('div', 'icon-choices');
    for (const id of TREE_ICONS) {
      const b = elem('button', 'icon-choice' + (current === id ? ' on' : ''));
      b.type = 'button';
      const label = id.slice(2).replace(/([a-z])([A-Z0-9])/g, '$1 $2');
      b.title = label; b.setAttribute('aria-label', label); b.setAttribute('aria-pressed', String(current === id));
      b.append(icon(id, { size: 16 }));
      b.addEventListener('click', () => { closeMenu(); setTreeStyle(rel, 'icon', id); });
      grid.append(b);
    }
    box.append(grid);
    const row = elem('div', 'emoji-row');
    const input = document.createElement('input');
    input.className = 'emoji-input'; input.placeholder = 'Or type an emoji'; input.maxLength = 16;
    input.setAttribute('aria-label', 'Emoji');
    if (current && !isIconId(current)) input.value = current;
    const use = elem('button', 'btn quiet', 'Use');
    use.type = 'button';
    const apply = () => {
      const e = cleanEmoji(input.value);
      if (!e) { input.select(); showToast('Type one emoji, for example 🍲'); return; }
      closeMenu(); setTreeStyle(rel, 'icon', e);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
    use.addEventListener('click', apply);
    row.append(input, use);
    box.append(row);
    const reset = elem('button', 'btn quiet style-reset', 'Default icon');
    reset.type = 'button';
    reset.addEventListener('click', () => { closeMenu(); setTreeStyle(rel, 'icon', ''); });
    box.append(reset);
    return [{ el: box }];
  });
}

function folderRow(f, depth) {
  const row = elem('div', 'tree-row folder-row' + (state.selectedFolder === f.rel ? ' selected' : ''));
  row.style.paddingLeft = `${8 + depth * 16}px`;
  row.tabIndex = 0; row.dataset.rel = f.rel; row.dataset.type = 'folder';
  row.append(elem('span', 'tri', state.expanded.has(f.rel) ? '▾' : '▸'));
  row.style.setProperty('--row-c', rowColor(f.rel, 'folder', state.treeStyles));
  row.append(treeIcon(f.rel, state.expanded.has(f.rel) ? 'folderOpen' : 'folder'));
  row.append(elem('span', 'tree-name', f.name));
  row.append(elem('span', 'tree-count', String(f.count)));
  row.addEventListener('click', (e) => { if (e.target.closest('.menu-btn')) return; toggleFolder(f.rel); });
  addMenuBtn(row, `f:${f.rel}`, () => folderMenuItems(f));
  // The daily notes folder can change places but not move into another folder.
  makeDraggable(row, `f:${f.rel}`);
  setupRowDrop(row, f.rel, true);
  return row;
}

function noteRow(n, depth) {
  const row = elem('div', 'tree-row note-row' + (state.openNote === n.rel ? ' selected' : ''));
  row.style.paddingLeft = `${8 + depth * 16 + 16}px`;
  row.tabIndex = 0; row.dataset.rel = n.rel; row.dataset.type = 'note';
  const color = rowColor(n.rel, 'note', state.treeStyles);
  if (color) row.style.setProperty('--row-c', color);
  if (state.treeStyles[n.rel] && state.treeStyles[n.rel].color) row.classList.add('colored');
  row.append(treeIcon(n.rel, 'tiFileText'));
  row.append(elem('span', 'tree-name', n.title));
  row.addEventListener('click', (e) => { if (e.target.closest('.menu-btn')) return; openNote(n.rel, 'oku', { keepTab: true }); });
  addMenuBtn(row, `n:${n.rel}`, () => noteMenuItems(n));
  makeDraggable(row, `n:${n.rel}`);
  setupRowDrop(row, n.rel, false);
  return row;
}

function folderMenuItems(f) {
  const items = [
    { label: 'New note', fn: () => { closeMenu(); newNoteIn(f.rel); } },
    { label: 'New note from template…', fn: () => { closeMenu(); newFromTemplate(f.rel); } },
    { label: 'New folder', fn: () => { closeMenu(); newFolderIn(f.rel); } },
    { label: 'Icon…', fn: () => openIconPicker(`f:${f.rel}`, f.rel) },
    { label: 'Colour…', fn: () => openColorPicker(`f:${f.rel}`, f.rel, 'folder') },
  ];
  if (!isGunluk(f.rel)) {
    items.push({ label: 'Rename', fn: () => { closeMenu(); startTreeEdit({ kind: 'rename-folder', rel: f.rel }); } });
    items.push({ label: 'Delete', fn: () => { closeMenu(); state.folderDeleteConfirm = f.rel; refreshSidebar(); } });
  }
  return items;
}
function noteMenuItems(n) {
  return [
    { label: isBookmarked(n.rel) ? 'Remove bookmark' : 'Bookmark', fn: () => { closeMenu(); toggleBookmark(n.rel); } },
    { label: 'Icon…', fn: () => openIconPicker(`n:${n.rel}`, n.rel) },
    { label: 'Colour…', fn: () => openColorPicker(`n:${n.rel}`, n.rel, 'note') },
    { label: 'Rename', fn: () => { closeMenu(); startTreeEdit({ kind: 'rename-note', rel: n.rel }); } },
    { label: 'Delete', fn: () => { closeMenu(); deleteNoteRel(n.rel); } },
  ];
}

function folderConfirmRow(f, depth) {
  const row = elem('div', 'tree-row confirm-row');
  row.style.paddingLeft = `${8 + (depth + 1) * 16}px`;
  row.append(elem('span', 'confirm-q', `Delete the folder and its ${f.count} ${f.count === 1 ? 'note' : 'notes'}?`));
  const cancel = elem('button', 'btn quiet', 'Cancel');
  cancel.addEventListener('click', () => { state.folderDeleteConfirm = null; refreshSidebar(); });
  const del = elem('button', 'btn danger', 'Delete');
  del.addEventListener('click', () => deleteFolderRel(f.rel));
  row.append(cancel, del);
  return row;
}

function treeEditRow(depth) {
  const row = elem('div', 'tree-row tree-edit-row');
  row.style.paddingLeft = `${8 + depth * 16}px`;
  const input = document.createElement('input');
  input.className = 'tree-edit-input'; input.id = 'tree-edit'; input.maxLength = 120;
  input.value = treeEditDefault();
  input.addEventListener('focus', () => input.select(), { once: true });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitTreeEdit(input.value); }
    if (e.key === 'Escape') { e.preventDefault(); state.treeEdit = null; render(); }
  });
  input.addEventListener('blur', () => { if (state.treeEdit) commitTreeEdit(input.value); });
  row.append(input);
  return row;
}

function onTreeKey(e) {
  const rows = [...e.currentTarget.querySelectorAll('.tree-row:not(.tree-edit-row):not(.confirm-row)')];
  const active = document.activeElement;
  const i = rows.indexOf(active);
  const rel = active?.dataset?.rel; const type = active?.dataset?.type;
  if (e.key === 'ArrowDown') { e.preventDefault(); if (rows[Math.min(i + 1, rows.length - 1)]) rows[Math.min(i + 1, rows.length - 1)].focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) rows[i - 1].focus(); }
  else if (e.key === 'Enter') { e.preventDefault(); if (type === 'note') openNote(rel, 'oku', { keepTab: true }); else if (type === 'folder') toggleFolder(rel); }
  else if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (type === 'folder' && !state.expanded.has(rel)) { state.expanded.add(rel); saveExpanded(); refreshSidebar(); document.querySelector(`.tree-row[data-rel="${CSS.escape(rel)}"]`)?.focus(); }
    else if (rows[i + 1]) rows[i + 1].focus();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (type === 'folder' && state.expanded.has(rel)) { state.expanded.delete(rel); saveExpanded(); refreshSidebar(); document.querySelector(`.tree-row[data-rel="${CSS.escape(rel)}"]`)?.focus(); }
    else { const parent = folderOf(rel); const pr = document.querySelector(`.tree-row[data-rel="${CSS.escape(parent)}"]`); if (pr) pr.focus(); }
  } else if (e.key === 'F2' && rel) {
    e.preventDefault();
    startTreeEdit(type === 'folder' ? { kind: 'rename-folder', rel } : { kind: 'rename-note', rel });
  }
}


// Enter in the search field: open an exact title match, else create the note
// in the target folder. (A "#tag" search only searches.)
async function openOrCreateFromSearch() {
  const name = state.araQuery.trim();
  if (!name || name.startsWith('#')) return;
  const exact = state.notesFlat.find((n) => foldTR(n.title) === foldTR(name));
  state.araQuery = '';
  if (exact) { await openNote(exact.rel, 'oku', { keepTab: true }); return; }
  const res = await notesApi.create(targetFolder(), name);
  await refreshTree();
  if (res && res.rel) await openNote(res.rel, 'duzenle', { keepTab: true });
}

async function openNote(rel, mode, opts = {}) {
  const res = await notesApi.read(rel);
  // A task board opens as a board ("Open as Markdown" in its menu shows the text).
  if (!opts.asText && res && !res.error && isBoard(res.content)) { await openTasks(rel); return; }
  navVisit({ view: 'note', rel });
  state.openNote = rel;
  state.noteContent = res && !res.error ? res.content : '';
  state.noteCache.set(rel, state.noteContent);
  state.noteView = 'blocks';
  state.blockEdit = null;
  state.noteDeleteConfirm = false;
  state.contentView = 'note';
  state.selectedFolder = null;
  rememberRecent(rel);
  expandAncestors(rel);
  histReset('note');
  // Opening a freshly created note (mode 'duzenle') starts editing its first
  // block (or an empty block) so the user can type immediately.
  if (mode === 'duzenle') {
    const blocks = parseBlocks(state.noteContent);
    state.blockEdit = blocks.length
      ? { scope: 'note', startLine: blocks[0].start, caret: 'end' }
      : { scope: 'note', newAfter: -1, caret: 0 };
  }
  render();
  scheduleBacklinks();
}

// --- live-preview block editor ------------------------------------------
// The note (and the day page's daily note) always render as formatted blocks;
// clicking a block replaces just that block with a textarea of its exact
// source. Leaving re-parses the whole document, so edits that split/merge
// blocks render correctly. The raw source is the single source of truth.

function getSrcFor(scope) { return scope === 'note' ? state.noteContent : (state.dailyNote.content || ''); }

let noteSaveTimer = null;
let dailySaveTimer = null;
function setSrc(scope, newSrc, persistNow) {
  if (scope === 'note') {
    state.noteContent = newSrc;
    updateStatusBar();
    if (state.openNote) state.noteCache.set(state.openNote, newSrc);
    clearTimeout(noteSaveTimer);
    const save = () => {
      if (!state.openNote) return;
      notesApi.write(state.openNote, newSrc);
      const t = state.treeNotes.find((x) => x.rel === state.openNote);
      if (t) { t.mtime = Date.now(); if (state.noteSort.startsWith('modified')) renderSidebar(); }
    };
    if (persistNow) save(); else noteSaveTimer = setTimeout(save, 500);
  } else {
    const key = state.dailyNote.key;
    state.dailyNote.content = newSrc;
    state.dailyDates.add(key);
    clearTimeout(dailySaveTimer);
    const save = () => notesApi.writeDaily(key, newSrc);
    if (persistNow) save(); else dailySaveTimer = setTimeout(save, 500);
  }
}

// Whole-document undo/redo history for the active editor (reset per note/day).
function histKey(scope) { return scope === 'note' ? `n:${state.openNote}` : `d:${state.dailyNote.key}`; }
function histReset(scope) { state.history = { key: histKey(scope), stack: [getSrcFor(scope)], i: 0 }; }
function histRecord(scope) {
  const h = state.history;
  if (!h || h.key !== histKey(scope)) { histReset(scope); return; }
  const cur = getSrcFor(scope);
  if (h.stack[h.i] === cur) return;
  h.stack = h.stack.slice(0, h.i + 1);
  h.stack.push(cur);
  h.i = h.stack.length - 1;
}
function histUndo(scope) {
  const h = state.history;
  if (!h || h.key !== histKey(scope) || h.i <= 0) return false;
  flushActiveEditor();
  h.i -= 1; setSrc(scope, h.stack[h.i], true); state.blockEdit = null; render(); return true;
}
function histRedo(scope) {
  const h = state.history;
  if (!h || h.key !== histKey(scope) || h.i >= h.stack.length - 1) return false;
  flushActiveEditor();
  h.i += 1; setSrc(scope, h.stack[h.i], true); state.blockEdit = null; render(); return true;
}

// Commit the active block textarea into the source WITHOUT rendering. Idempotent
// (clears state.blockEdit), so a following blur is a no-op.
// Commit the block editor's text into the note. Returns the start line of
// that block afterwards (null if it ended up empty / there was none), so
// callers can put something right after it. keepEditing: save but leave the
// editor open on the same block (used when the window loses focus, e.g. to a
// file dialog — the old behaviour closed the block and orphaned the editor).
function flushActiveEditor({ keepEditing = false } = {}) {
  const be = state.blockEdit;
  if (!be) return null;
  const ta = document.getElementById('block-editor');
  if (!ta) { state.blockEdit = null; return null; }
  const scope = be.scope;
  const val = ta.value;
  let src = getSrcFor(scope);
  let start = null;
  if (be.startLine != null) {
    const blk = parseBlocks(src).find((x) => x.start === be.startLine);
    if (blk) { src = replaceBlockText(src, blk, val); start = val.trim() ? be.startLine : null; }
  } else if (val.trim() !== '') {
    if (be.newAfter === -1) { src = src.trim() === '' ? val : `${val}\n\n${src}`; start = 0; }
    else {
      const anchor = parseBlocks(src).find((x) => x.start === be.newAfter);
      if (anchor) { const r = insertBlockAfter(src, anchor, val); src = r.src; start = r.start; }
      else { const r = addBlock(src, null, val); src = r.src; start = r.start; }
    }
  }
  state.blockEdit = keepEditing && start != null ? { ...be, startLine: start, newAfter: undefined } : (keepEditing ? be : null);
  if (src !== getSrcFor(scope)) { setSrc(scope, src, true); histRecord(scope); }
  return start;
}

function startEditBlock(scope, startLine, caret) {
  flushActiveEditor();
  state.blockEdit = { scope, startLine, caret };
  render();
}
function startNewBlock(scope, afterStart, caret) {
  flushActiveEditor();
  state.blockEdit = { scope, newAfter: afterStart, caret };
  render();
}

// Caret offset for a desired position within a block's text.
function caretOffset(text, where) {
  if (where === 'end' || where == null) return text.length;
  if (where === 'start') return 0;
  return Math.min(Number(where) || 0, text.length);
}

function autoGrow(ta) {
  const grow = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; };
  ta.addEventListener('input', grow);
  requestAnimationFrame(grow);
}

// Mount a single preview block; task toggles map to absolute source lines.
function mountBlockMarkdown(container, bsrc, startLine, scope) {
  // refs: the whole note, so footnotes/link references in this block resolve
  const nodes = renderMarkdown(bsrc, { doc: document, noteExists: wikiExists, attach: attachResolverFor(scope), refs: getSrcFor(scope), embedNote });
  for (const n of nodes) container.append(n);
  container.querySelectorAll('[data-att]').forEach((el) => {
    el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openAttachment(el.getAttribute('data-att')); });
  });
  container.querySelectorAll('a[data-external]').forEach((a) => {
    a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); notesApi.openExternal(a.getAttribute('href')); });
  });
  container.querySelectorAll('a[data-wiki]').forEach((a) => {
    a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openWiki(a.getAttribute('data-wiki'), a.getAttribute('data-heading')); });
  });
  attachHoverPreview(container, previewApi);
  container.querySelectorAll('.tag[data-tag]').forEach((t) => {
    t.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); searchFor(`#${t.getAttribute('data-tag')}`); });
  });
  container.querySelectorAll('input.task-check').forEach((box) => {
    box.addEventListener('change', () => {
      const full = getSrcFor(scope);
      setSrc(scope, toggleTaskLine(full, startLine + Number(box.getAttribute('data-line'))), true);
      histRecord(scope);
      render();
    });
  });
}

function blockPreview(scope, b) {
  const el = elem('div', `block md block-${b.type}`); // block-image, block-heading… for spacing
  el.dataset.blockStart = String(b.start);
  mountBlockMarkdown(el, blockText(getSrcFor(scope), b), b.start, scope);
  el.addEventListener('mousedown', (e) => {
    if (e.target.closest('a, input, img, [data-att], summary, .tag')) return; // keep links/tasks/folds/tags single-click
    e.preventDefault();
    startEditBlock(scope, b.start, 'end');
  });
  return el;
}

function blockTextarea(scope, b, edit) {
  const text = b ? blockText(getSrcFor(scope), b) : '';
  const ta = document.createElement('textarea');
  ta.className = `block-editor${b ? ` block-editor-${b.type}` : ''}`; ta.id = 'block-editor';
  ta.value = text;
  autoGrow(ta);
  wireAttachments(ta, scope);
  wireBlockKeys(ta, scope, b, edit);
  // Commit on blur, but defer the re-render so the click that caused the blur
  // (e.g. on a tree row) still reaches its target before the DOM is rebuilt.
  ta.addEventListener('blur', () => {
    if (state.suppressBlockBlur || !ta.isConnected || !state.blockEdit) return;
    if (paletteKeepsEditor()) return; // the template picker inserts at this caret, then hands focus back
    // The window lost focus (another app, a file dialog): save, keep editing.
    if (!document.hasFocus()) { flushActiveEditor({ keepEditing: true }); return; }
    flushActiveEditor();
    whenPointerUp(() => {
      if (state.blockEdit) return; // another editor took over
      const a = document.activeElement;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return; // focus moved into another field
      render();
    });
  });
  // An empty note is shown being edited, but it only takes the focus when
  // nothing else has it (a menu, a name field): it never pulls it back.
  const a = document.activeElement;
  if (!edit.auto || !a || a === document.body || a.id === 'block-editor') state.focus = 'block-editor';
  state.blockCaretPos = caretOffset(text, edit.caret);
  return ta;
}

function wireBlockKeys(ta, scope, b, edit) {
  ta.addEventListener('keydown', (e) => {
    const val = ta.value;
    const selStart = ta.selectionStart;
    const collapsed = ta.selectionStart === ta.selectionEnd;
    const onFirst = collapsed && !val.slice(0, selStart).includes('\n');
    const onLast = collapsed && !val.slice(selStart).includes('\n');
    const curLineEmpty = (() => {
      const ls = val.lastIndexOf('\n', selStart - 1) + 1;
      let le = val.indexOf('\n', selStart); if (le === -1) le = val.length;
      return val.slice(ls, le).trim() === '';
    })();

    if (e.key === 'Escape') { e.preventDefault(); flushActiveEditor(); render(); return; }

    if (e.key === 'ArrowUp' && onFirst && b) {
      const src = getSrcFor(scope); const blocks = parseBlocks(src);
      const idx = blocks.findIndex((x) => x.start === b.start);
      if (idx > 0) { e.preventDefault(); startEditBlock(scope, blocks[idx - 1].start, 'end'); }
      return;
    }
    if (e.key === 'ArrowDown' && onLast && b) {
      flushActiveEditor();
      const blocks = parseBlocks(getSrcFor(scope));
      const idx = blocks.findIndex((x) => x.start === b.start);
      if (idx >= 0 && idx < blocks.length - 1) { e.preventDefault(); state.blockEdit = { scope, startLine: blocks[idx + 1].start, caret: 0 }; render(); }
      else { state.blockEdit = { scope, startLine: b.start, caret: 'end' }; render(); }
      return;
    }
    if (e.key === 'Enter' && onLast && curLineEmpty) {
      e.preventDefault();
      ta.value = val.replace(/\n+$/, '');
      const anchorStart = b ? b.start : (state.blockEdit && state.blockEdit.newAfter);
      flushActiveEditor();
      const blocks = parseBlocks(getSrcFor(scope));
      const anchor = blocks.find((x) => x.start === anchorStart) || blocks[blocks.length - 1];
      state.blockEdit = { scope, newAfter: anchor ? anchor.start : -1, caret: 0 };
      render();
      return;
    }
    if (e.key === 'Backspace' && collapsed && selStart === 0 && b) {
      const src = getSrcFor(scope); const blocks = parseBlocks(src);
      const idx = blocks.findIndex((x) => x.start === b.start);
      if (idx > 0) {
        e.preventDefault();
        const prev = blocks[idx - 1]; const cur = blocks[idx];
        const prevText = blockText(src, prev);
        const merged = `${prevText}\n${val}`;
        const combined = { start: prev.start, end: cur.end };
        const next = replaceBlockText(src, combined, merged);
        setSrc(scope, next, true); histRecord(scope);
        state.blockEdit = { scope, startLine: prev.start, caret: prevText.length };
        render();
      }
    }
  });
}

// Render the live-preview block editor for a scope into `container`.
function renderBlockEditor(container, scope) {
  const src = getSrcFor(scope);
  const blocks = parseBlocks(src);
  let edit = (state.blockEdit && state.blockEdit.scope === scope) ? state.blockEdit : null;
  if (!edit && blocks.length === 0) { state.blockEdit = { scope, newAfter: -1, caret: 0, auto: true }; edit = state.blockEdit; }

  const wrap = elem('div', 'blocks');
  if (edit && edit.newAfter === -1) wrap.append(blockTextarea(scope, null, edit));
  for (const b of blocks) {
    if (edit && edit.startLine === b.start) { wrap.append(blockTextarea(scope, b, edit)); continue; }
    wrap.append(blockPreview(scope, b));
    if (edit && edit.newAfter === b.start) wrap.append(blockTextarea(scope, null, edit));
  }
  const tail = elem('div', 'block-tail'); tail.setAttribute('aria-hidden', 'true');
  tail.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startNewBlock(scope, blocks.length ? blocks[blocks.length - 1].start : -1, 0);
  });
  wrap.append(tail);
  container.append(wrap);
}

// --- Notlar content: note pane ---

function renderNotePane() {
  if (!state.openNote) { contentEl.append(hint('Choose a note, or create one with "New note".')); return; }
  const pane = elem('div', 'note-pane');

  // The folder path is in the toolbar title. The inline title is the file
  // name (click to rename); it steps aside when the note already starts with
  // the same "# Title", so the title is not shown twice.
  const header = elem('div', 'note-head');
  const h = elem('h1', 'note-title', noteTitleOf(state.openNote));
  h.title = 'Click to rename';
  h.addEventListener('click', () => startRenameNote());
  const first = parseBlocks(state.noteContent).find((b) => b.type !== 'frontmatter');
  const firstLine = first ? blockText(state.noteContent, first).split('\n')[0] : '';
  if (state.noteView === 'blocks' && foldTR(firstLine.replace(/^#\s+/, '').trim()) === foldTR(noteTitleOf(state.openNote)) && /^#\s/.test(firstLine)) header.classList.add('dup');
  header.append(h);
  pane.append(header);

  if (state.noteView === 'source') {
    const ta = document.createElement('textarea');
    ta.className = 'note-editor'; ta.id = 'note-editor';
    ta.value = state.noteContent;
    wireAutosaveNote(ta);
    wireAttachments(ta, 'note');
    pane.append(ta);
  } else {
    const body = elem('div', 'note-body');
    renderBlockEditor(body, 'note');
    wireNoteDrop(body, 'note');
    pane.append(body);
  }
  pane.append(backlinkSection(state.openNote));
  contentEl.append(pane);
}

// Toggle between the live-preview block editor and the raw-source textarea.
function setNoteView(view) {
  flushActiveEditor();
  state.noteView = view;
  state.blockEdit = null;
  render();
  if (view === 'source') { state.focus = 'note-editor'; restoreFocus(); }
}
function toggleNoteView() { setNoteView(state.noteView === 'source' ? 'blocks' : 'source'); }

// Insert attachment-add results (from paste/drop/pick) at the editor caret.

// Wire paste-image / drop-files on a note or daily editor textarea. Inserts the
// attachment Markdown at the caret and refreshes the known-attachment set so the
// rendered view can show the new file.
// Autocomplete in every editor: [[ → notes (fuzzy, recent first on an empty
// query), #x → tags of the vault (most used first).
const suggestApi = {
  items(kind, q) {
    if (kind === 'tag') {
      return buildTagIndex(state.vaultNotes).map((t) => ({ t, m: fuzzyMatch(q, t.tag) })).filter((x) => x.m)
        .sort((a, b) => b.m.score - a.m.score || b.t.count - a.t.count)
        .map(({ t }) => ({ label: `#${t.tag}`, detail: String(t.count), insert: `#${t.tag} ` }));
    }
    const rels = state.notesFlat.map((n) => n.rel);
    const rows = q.trim()
      ? fuzzyFilter(q, state.notesFlat, (n) => n.title).map((x) => x.item)
      : [...state.recent.map((r) => state.notesFlat.find((n) => n.rel === r)).filter(Boolean),
        ...state.notesFlat.filter((n) => !state.recent.includes(n.rel))];
    return rows.filter((n) => n.rel !== state.openNote || q.trim()).map((n) => ({
      label: n.title, detail: n.folder ? n.folder.split('/').join(' / ') : '', insert: `[[${linkTextFor(n.rel, rels)}]]`,
    }));
  },
};

// Attachments become their own block, rendered right away (the image shows,
// not its Markdown): after the block being edited (its text saved first),
// else after `afterStart` (the block under a drop), else at the end. In the
// raw source view they are typed at the caret instead.
function attachToNote(scope, results, afterStart = null) {
  const dir = attachDirFor(scope);
  const texts = [];
  for (const r of (Array.isArray(results) ? results : [])) {
    if (r && r.error) { showToast(r.error); continue; }
    if (r && r.rel) texts.push(attachInsertText(r.rel, r.isImage, { noteDir: dir, relative: state.layout.relative }));
  }
  if (!texts.length) return;
  const text = texts.join('\n');
  const source = scope === 'note' ? document.getElementById('note-editor') : null;
  if (source && source._attachInsert) {
    const before = source.value.slice(0, source.selectionStart);
    const pre = before === '' || before.endsWith('\n\n') ? '' : (before.endsWith('\n') ? '\n' : '\n\n');
    source._attachInsert(`${pre}${text}\n`);
    return;
  }
  let anchor = afterStart;
  if (state.blockEdit && state.blockEdit.scope === scope) {
    const be = state.blockEdit;
    const start = flushActiveEditor();
    anchor = start != null ? start : (be.startLine != null ? be.startLine : (be.newAfter ?? null));
  }
  if (scope === 'daily' && state.dailyNote.content == null) return;
  const { src } = addBlock(getSrcFor(scope), anchor, text);
  setSrc(scope, src, true);
  histRecord(scope);
  render();
  showToast(texts.length === 1 ? 'Attached' : `${texts.length} files attached`);
}

// --- settings ---
// A dialog (⌘, or Mufka › Settings…). Today: Connections → Wispr Flow, whose
// Notetaker records meetings on any platform; Mufka reads them over MCP.

let settingsLayer = null;
function openSettings() {
  if (settingsLayer) settingsLayer._close();
  const layer = elem('div', 'palette-layer');
  const box = elem('div', 'palette plan-dialog settings-dialog');
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Settings');
  box.append(elem('div', 'plan-dialog-title', 'Settings'));
  // Calendars: Microsoft (Outlook / Microsoft 365, Teams) and Google.
  const calSection = elem('section', 'settings-section');
  calSection.append(elem('h3', 'settings-heading', 'Calendars'));
  const calRows = [
    ['microsoft', 'Microsoft (Outlook, Teams)', 'Your Outlook and Microsoft 365 calendars, Teams meetings included. Read-only; you sign in on Microsoft\u2019s own page.'],
    ['google', 'Google Calendar', 'Your Google calendars, Meet links included. Read-only; you sign in on Google\u2019s own page.'],
  ].map(([id, name, about]) => {
    const r = elem('div', 'conn-row');
    r.dataset.conn = id;
    const tx = elem('div', 'conn-text');
    tx.append(elem('span', 'conn-name', name), elem('span', 'conn-note', about));
    const sd = elem('div', 'conn-side');
    const ls = elem('div', 'cal-list');
    ls.setAttribute('role', 'group');
    ls.setAttribute('aria-label', `${name}: calendars shown`);
    r.append(tx, sd, ls);
    calSection.append(r);
    return { id, name, side: sd, list: ls, busy: false };
  });
  box.append(calSection);

  const section = elem('section', 'settings-section');
  section.append(elem('h3', 'settings-heading', 'Meeting notes'));
  const row = elem('div', 'conn-row');
  row.dataset.conn = 'wispr';
  const text = elem('div', 'conn-text');
  text.append(
    elem('span', 'conn-name', 'Wispr Flow'),
    elem('span', 'conn-note', 'Meeting notes from Wispr Flow\u2019s Notetaker (Zoom, Google Meet, Teams, Slack and in person): summaries, notes, tasks and transcripts. Read-only; you sign in on Wispr\u2019s own page.'),
  );
  const side = elem('div', 'conn-side');
  row.append(text, side);
  section.append(row);
  box.append(section);

  let busy = false;
  const button = (label, quiet, fn) => {
    const b = elem('button', quiet ? 'btn quiet' : 'btn', label);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  };
  const draw = (s, note) => {
    if (!layer.isConnected) return;
    const hadFocus = box.contains(document.activeElement);
    side.replaceChildren();
    if (s.signingIn || busy) {
      side.append(elem('span', 'conn-state', 'Waiting for sign-in in your browser\u2026'),
        button('Cancel', true, () => wisprApi.cancel()));
    } else if (s.connected) {
      side.append(elem('span', 'conn-state ok', `Connected \u00b7 ${s.account || 'Wispr Flow'}`),
        button(s.syncing ? 'Syncing\u2026' : 'Sync now', false, syncNow),
        button('Disconnect', true, async () => { await wisprApi.disconnect(); refresh(); showToast('Wispr Flow disconnected'); }));
      if (s.syncing) side.querySelector('.btn:not(.quiet)').disabled = true;
      const info = s.imported
        ? `${s.imported} meeting${s.imported === 1 ? '' : 's'} in the ${s.folder} folder`
        : `Meetings will appear in the ${s.folder} folder`;
      side.append(elem('span', 'conn-info', s.lastSync ? `${info} \u00b7 last synced ${timeAgo(s.lastSync)}` : info));
      if (s.lastError && !note) note = `Last sync failed: ${s.lastError}`;
    } else {
      side.append(elem('span', 'conn-state', 'Not connected'), button('Connect', false, connect));
    }
    if (note) side.append(elem('span', 'conn-error', note));
    if (hadFocus && !box.contains(document.activeElement)) (side.querySelector('button') || done).focus();
  };
  const refresh = async (note) => draw(await wisprApi.status(), note);
  const syncNow = async () => {
    const p = wisprApi.sync();
    refresh();
    const res = await p;
    if (res && res.error) { refresh(res.error); return; }
    if (res && !res.created && !res.updated) showToast('No new meetings in Wispr Flow');
    refresh();
  };
  const connect = async () => {
    busy = true; refresh();
    const res = await wisprApi.connect();
    busy = false;
    if (res && res.error) { refresh(res.error); return; }
    if (res && res.ok) showToast(`Connected to Wispr Flow as ${res.account}`);
    refresh();
  };

  const calDraw = (row, all, note) => {
    if (!layer.isConnected) return;
    const s = all[row.id];
    const hadFocus = box.contains(document.activeElement);
    row.side.replaceChildren();
    row.list.replaceChildren();
    if (!s || !s.available) {
      row.side.append(elem('span', 'conn-state', 'Not set up in this copy of Mufka'));
    } else if (s.signingIn || row.busy) {
      row.side.append(elem('span', 'conn-state', 'Waiting for sign-in in your browser\u2026'),
        button('Cancel', true, () => calApi.cancel(row.id)));
    } else if (s.connected) {
      row.side.append(elem('span', 'conn-state ok', `Connected \u00b7 ${s.account || row.name}`),
        button('Refresh', true, async () => { const r = await calApi.refresh(); calRefreshAll(r && r.error); }),
        button('Disconnect', true, async () => { await calApi.disconnect(row.id); calRefreshAll(); showToast(`${row.name} disconnected`); }));
      for (const c of s.calendars) {
        const l = elem('label', 'cal-item');
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = c.shown;
        cb.addEventListener('change', () => calApi.setShown(row.id, c.id, cb.checked));
        const dot = elem('span', 'cal-dot');
        dot.style.background = c.color;
        dot.setAttribute('aria-hidden', 'true');
        l.append(cb, dot, elem('span', null, c.name));
        row.list.append(l);
      }
    } else {
      row.side.append(elem('span', 'conn-state', 'Not connected'), button('Connect', false, () => calConnectRow(row)));
    }
    if (note) row.side.append(elem('span', 'conn-error', note));
    if (hadFocus && !box.contains(document.activeElement)) (row.side.querySelector('button') || done).focus();
  };
  const calRefreshAll = async (note, only) => {
    const all = await calApi.status();
    for (const row of calRows) calDraw(row, all, only && only !== row ? undefined : note);
  };
  const calConnectRow = async (row) => {
    row.busy = true; calRefreshAll();
    const res = await calApi.connect(row.id);
    row.busy = false;
    if (res && res.error) { calRefreshAll(res.error, row); return; }
    if (res && res.ok) showToast(`${row.name} connected as ${res.account}`);
    calRefreshAll();
  };

  const restore = document.activeElement;
  const close = () => { layer.remove(); settingsLayer = null; if (restore && restore.isConnected) restore.focus(); };
  layer._close = close;
  layer._refresh = () => refresh();
  const actions = elem('div', 'plan-dialog-actions');
  const done = button('Done', false, close);
  actions.append(done);
  box.append(actions);
  layer.append(box);
  layer.addEventListener('mousedown', (e) => { if (e.target === layer) close(); });
  document.body.append(layer);
  settingsLayer = layer;
  Promise.all([calRefreshAll(), refresh()]).then(() => (box.querySelector('.conn-side button') || done).focus());
}

// --- calendar events (read-only) ---
// Fetched per Planner week from main (Microsoft Graph), kept here until a
// refresh. A day asks for its week; the first ask fetches and re-renders.

const calWeeks = new Map(); // Monday's day key → events (null while loading)
let calStamp = 0;
let calConnected = false; // what the last answer said

async function refreshCalendars() {
  const r = await calApi.refresh(); // main re-reads and says 'changed'
  if (r && r.error) showToast(`Could not refresh calendars: ${r.error}`);
  else showToast('Calendars refreshed');
}

function calendarsChanged() {
  calWeeks.clear();
  calStamp = Date.now();
  render();
}

function eventsForDay(d) {
  const mon = startOfWeek(d);
  const key = dayKey(mon);
  if (!calWeeks.has(key)) {
    calWeeks.set(key, null);
    const asked = calStamp;
    calApi.events(mon.toISOString(), addDays(mon, 7).toISOString()).then((res) => {
      if (asked !== calStamp) return;
      calWeeks.set(key, res && Array.isArray(res.events) ? res.events : []);
      const was = calConnected;
      calConnected = Boolean(res && res.connected);
      if (was !== calConnected && state.contentView === 'planner') render();
      if (res && res.connected && res.events && res.events.length && (state.contentView === 'planner' || state.contentView === 'day')) render();
    }).catch(() => calWeeks.set(key, []));
  }
  return eventsOnDay(calWeeks.get(key) || [], d);
}

// When main says they changed, every 10 minutes, and when the window comes
// back after a while.
if (calApi) {
  calApi.onChanged(() => calendarsChanged());
  setInterval(() => { if (calWeeks.size) calendarsChanged(); }, 10 * 60 * 1000);
  window.addEventListener('focus', () => { if (calWeeks.size && Date.now() - calStamp > 2 * 60 * 1000) calendarsChanged(); });
}

// A calendar event's details: when, which calendar, where, who; join / open.
function openEventCard(ev) {
  const layer = elem('div', 'palette-layer');
  const box = elem('div', 'palette plan-dialog event-card');
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', ev.title);
  box.style.setProperty('--ev', ev.color);
  box.append(elem('div', 'plan-dialog-title event-title', ev.title));
  const facts = elem('dl', 'event-facts');
  const fact = (k, v) => { if (v) facts.append(elem('dt', null, k), elem('dd', null, v)); };
  fact('When', eventWhen(ev));
  fact('Calendar', ev.calendar);
  fact('Where', ev.location);
  fact('Organizer', ev.organizer);
  if (ev.attendees && ev.attendees.length) fact('With', ev.attendees.length > 6 ? `${ev.attendees.slice(0, 6).join(', ')} and ${ev.attendees.length - 6} more` : ev.attendees.join(', '));
  box.append(facts);
  const restore = document.activeElement;
  const close = () => { layer.remove(); document.removeEventListener('keydown', onKey, true); if (restore && restore.isConnected) restore.focus(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  const actions = elem('div', 'plan-dialog-actions');
  const btn = (label, cls, fn) => { const b = elem('button', cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; };
  if (ev.webLink) actions.append(btn(ev.source === 'google' ? 'Open in Google Calendar' : 'Open in Outlook', 'btn quiet', () => notesApi.openExternal(ev.webLink)));
  actions.append(btn('Close', 'btn quiet', close));
  if (ev.joinUrl) actions.append(btn('Join meeting', 'btn', () => { notesApi.openExternal(ev.joinUrl); close(); }));
  box.append(actions);
  layer.append(box);
  layer.addEventListener('mousedown', (e) => { if (e.target === layer) close(); });
  document.body.append(layer);
  (actions.querySelector('.btn:not(.quiet)') || actions.lastChild).focus();
}

// One calendar event on the day page (Home): time, title, a join button.
function agendaEventRow(ev) {
  const li = elem('li', 'plan-row agenda-row event-row');
  li.style.setProperty('--ev', ev.color);
  li.append(elem('span', 'event-dot'));
  const open = elem('button', 'agenda-open');
  open.type = 'button';
  open.title = 'Show details';
  if (ev.time) {
    const chips = elem('span', 'chips');
    chips.append(elem('span', 'chip', ev.time));
    if (ev.endTime) chips.append(elem('span', 'chip-dash', '\u2013'), elem('span', 'chip', ev.endTime === '24:00' ? '00:00' : ev.endTime));
    open.append(chips);
  } else open.append(elem('span', 'chip', 'All day'));
  open.append(elem('span', 'plan-title', ev.title));
  open.addEventListener('click', () => openEventCard(ev));
  li.append(open);
  if (ev.joinUrl) {
    const join = elem('button', 'btn quiet event-join', 'Join');
    join.type = 'button';
    join.title = 'Join the online meeting';
    join.addEventListener('click', () => notesApi.openExternal(ev.joinUrl));
    li.append(join);
  }
  return li;
}

function timeAgo(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!(min >= 1)) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Meetings that arrived from Wispr Flow (sync in main, every 15 minutes).
if (wisprApi) wisprApi.onSynced(({ created, updated, folder }) => {
  const parts = [];
  if (created) parts.push(`${created} new meeting${created === 1 ? '' : 's'}`);
  if (updated) parts.push(`${updated} updated`);
  showToast(`Wispr Flow: ${parts.join(', ')} in ${folder}`, 5000);
  if (settingsLayer) settingsLayer._refresh?.();
});

// Pasting an image while a note is open but no field has focus attaches it.
document.addEventListener('paste', async (e) => {
  if (isTextTarget(e.target) || state.contentView !== 'note' || !state.openNote || state.noteView !== 'blocks') return;
  const items = e.clipboardData && e.clipboardData.items;
  if (!items || ![...items].some((it) => it.kind === 'file' && it.type.startsWith('image/'))) return;
  e.preventDefault();
  const res = await notesApi.attachPaste(attachDirFor('note'));
  if (res && res.error) { showToast(res.error); return; }
  await refreshAttachList();
  if (res && res.rel) attachToNote('note', [res]);
});

// Files dropped from Finder → copied into the vault → attached.
async function attachDropped(files, scope, afterStart) {
  const paths = [...files].map((f) => notesApi.pathForFile(f)).filter(Boolean);
  if (!paths.length) return;
  const res = await notesApi.attachAddFiles(paths, attachDirFor(scope));
  await refreshAttachList();
  attachToNote(scope, res, afterStart);
}

// Drop files anywhere on a rendered note (or the daily note): the new block
// goes after the block under the pointer. A tint shows where it will land.
function wireNoteDrop(el, scope) {
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  el.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); el.classList.add('drop-target'); });
  el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('drop-target'); });
  el.addEventListener('drop', (e) => {
    el.classList.remove('drop-target');
    if (!hasFiles(e) || e.target.closest('textarea')) return;
    e.preventDefault();
    const blk = e.target.closest('[data-block-start]');
    attachDropped(e.dataTransfer.files, scope, blk ? Number(blk.dataset.blockStart) : null);
  });
}

function wireAttachments(ta, scope) {
  attachSuggest(ta, suggestApi);
  const noteDir = () => attachDirFor(scope);
  const insert = (text) => {
    const s = ta.selectionStart ?? ta.value.length;
    const e = ta.selectionEnd ?? s;
    ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
    const pos = s + text.length;
    ta.setSelectionRange(pos, pos);
    ta.dispatchEvent(new Event('input', { bubbles: true })); // triggers autosave
    ta.focus();
  };
  ta._attachInsert = insert;
  ta.addEventListener('paste', async (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    const hasImage = items && [...items].some((it) => it.kind === 'file' && it.type.startsWith('image/'));
    if (!hasImage) return;
    e.preventDefault();
    const res = await notesApi.attachPaste(noteDir());
    if (res && res.error) { showToast(res.error); return; }
    await refreshAttachList();
    if (res && res.rel) attachToNote(scope, [res]);
  });
  ta.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  ta.addEventListener('drop', async (e) => {
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    e.preventDefault();
    e.stopPropagation(); // the note-level drop handler must not attach it twice
    await attachDropped(files, scope, null);
  });
}

// "Dosya ekle…": pick files via a native dialog and insert at the note's caret.
async function addFileToNote() {
  closeMenu();
  // Save the block being edited first and remember where it is: the dialog
  // takes focus away from the window.
  let anchor = null;
  if (state.blockEdit && state.blockEdit.scope === 'note') {
    const be = state.blockEdit;
    const start = flushActiveEditor();
    anchor = start != null ? start : (be.startLine ?? be.newAfter ?? null);
    render();
  }
  const res = await notesApi.attachPick(attachDirFor('note'));
  if (!res || res.canceled) { if (res && res.error) showToast(res.error); return; }
  await refreshAttachList();
  attachToNote('note', res.files, anchor);
}

// Overlay listing Ekler files no note references, with a button to Trash them.
function closeUnused() { document.getElementById('unused-overlay')?.remove(); }
async function showUnusedAttachments() {
  const res = await notesApi.attachUnused();
  const list = Array.isArray(res) ? res : [];
  closeUnused();
  const overlay = elem('div', 'unused-overlay'); overlay.id = 'unused-overlay';
  const backdrop = elem('div', 'menu-backdrop');
  backdrop.addEventListener('mousedown', closeUnused);
  const panel = elem('div', 'unused-panel'); panel.setAttribute('role', 'dialog');
  panel.append(elem('h2', 'unused-title', `Unused attachments (${list.length})`));
  if (!list.length) {
    panel.append(elem('div', 'ara-empty', 'No unused attachments.'));
  } else {
    const ul = elem('ul', 'unused-list');
    for (const name of list) ul.append(elem('li', 'unused-item', name));
    panel.append(ul);
    const trash = elem('button', 'btn danger', 'Move to Trash');
    trash.addEventListener('click', async () => {
      await notesApi.attachTrash(list);
      await refreshAttachList();
      closeUnused();
      showToast(`${list.length} ${list.length === 1 ? 'attachment' : 'attachments'} moved to the Trash`);
    });
    panel.append(trash);
  }
  const close = elem('button', 'btn quiet', 'Close');
  close.addEventListener('click', closeUnused);
  panel.append(close);
  overlay.append(backdrop, panel);
  document.body.append(overlay);
}

function wireAutosaveNote(ta) {
  let timer = null;
  const save = async () => {
    state.noteContent = ta.value;
    state.noteCache.set(state.openNote, ta.value);
    await notesApi.write(state.openNote, ta.value);
    await refreshTree();
    // This runs several ticks after a blur; by now focus may have moved to the
    // filter / a tree-edit field. Re-rendering the sidebar must not steal it.
    const active = document.activeElement;
    const id = active && active.id;
    const caret = active && 'selectionStart' in active ? active.selectionStart : null;
    renderSidebar();
    if (id) {
      const el = document.getElementById(id);
      if (el) { el.focus(); if (caret != null && 'setSelectionRange' in el) { try { el.setSelectionRange(caret, caret); } catch { /* ignore */ } } }
    }
  };
  ta.addEventListener('input', () => { state.noteContent = ta.value; clearTimeout(timer); timer = setTimeout(save, 500); });
  ta.addEventListener('blur', () => { clearTimeout(timer); save(); });
}

function startRenameNote() {
  const h = contentEl.querySelector('.note-title');
  if (!h) return;
  h.closest('.note-head')?.classList.remove('dup'); // show it while renaming
  const input = document.createElement('input');
  input.className = 'note-title-input'; input.id = 'note-title-input'; input.value = noteTitleOf(state.openNote);
  let committed = false;
  const commit = async () => {
    if (committed) return; // Enter and the following blur must not both fire.
    committed = true;
    input.removeEventListener('blur', commit);
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== noteTitleOf(state.openNote)) {
      const res = await notesApi.rename(state.openNote, newTitle);
      if (res && res.rel) { remapRel(state.openNote, res.rel); await refreshTree(); }
      render();
      reportLinks(res);
      return;
    }
    render();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); committed = true; render(); }
  });
  input.addEventListener('blur', commit);
  h.replaceWith(input);
  input.focus(); input.select();
}

async function deleteOpenNote() {
  const rel = state.openNote;
  if (!rel) return;
  await notesApi.remove(rel);
  state.openNote = null; state.noteContent = ''; state.contentView = 'day';
  state.noteCache.delete(rel);
  await refreshTree();
  render();
}

// --- Ara ---

async function ensureNoteCache() {
  await refreshTree();
  for (const n of state.notesFlat) {
    if (!state.noteCache.has(n.rel)) {
      const res = await notesApi.read(n.rel);
      state.noteCache.set(n.rel, res && !res.error ? res.content : '');
    }
  }
  if (state.araQuery.trim()) renderSidebar();
}

// Ara lives in the sidebar: the field at the top, then the two result groups.
// Results open in the right pane but keep the Ara tab active.

// Search results (the sections come back when the field is empty).
function renderSearchResults() {
  const q = state.araQuery.trim();
  if (!q) return;
  // Enter = open the note with exactly this name, else create it: say so.
  if (!/^#/.test(q) && !state.notesFlat.some((n) => foldTR(n.title) === foldTR(q))) {
    const c = elem('button', 'ara-result ara-create');
    c.type = 'button';
    c.append(elem('div', null, `Create note “${q}”`), elem('div', 'meta', 'Enter'));
    c.addEventListener('click', () => openOrCreateFromSearch());
    sideEl.append(c);
  }
  const qf = foldTR(q);

  // Plans (day-scoped), by title.
  const planHits = searchPlans(state.store.items.filter((p) => p.scope === 'day'), q);
  if (planHits.length) sideEl.append(elem('div', 'ara-group-title', 'Plans'));
  for (const p of planHits) {
    const btn = elem('button', 'ara-result');
    btn.append(elem('div', null, p.title));
    btn.append(elem('div', 'meta', formatDayNumeric(parseDayKey(p.key)) + (p.time ? ` · ${p.time}` : '')));
    btn.addEventListener('click', () => selectDay(parseDayKey(p.key), { keepTab: true }));
    sideEl.append(btn);
  }

  // Notes: title or body match. "#tag" finds notes with that tag (inline or in
  // the frontmatter; "#a" also finds nested "#a/b").
  const tagQ = /^#([^\s#]+)$/.exec(q);
  const hasTag = (content) => scanTags(content).some((t) => { const f = foldTR(t); const w = foldTR(tagQ[1]); return f === w || f.startsWith(`${w}/`); });
  const noteHits = tagQ
    ? state.notesFlat.filter((n) => hasTag(state.noteCache.get(n.rel) || ''))
    : state.notesFlat.filter((n) => foldTR(n.title).includes(qf)
      || foldTR(state.noteCache.get(n.rel) || '').includes(qf));
  if (noteHits.length) sideEl.append(elem('div', 'ara-group-title', 'Notes'));
  if (!noteHits.length && !planHits.length) sideEl.append(elem('div', 'ara-empty', 'No results.'));
  for (const n of noteHits) {
    const btn = elem('button', 'ara-result');
    btn.append(elem('div', null, n.title));
    const line = !tagQ && !foldTR(n.title).includes(qf) ? (state.noteCache.get(n.rel) || '').split('\n').find((l) => foldTR(l).includes(qf)) : null;
    if (line) btn.append(elem('div', 'snippet', line.trim().slice(0, 120)));
    if (n.folder) btn.append(elem('div', 'meta', n.folder.split('/').join(' / ')));
    btn.addEventListener('click', () => openNote(n.rel, 'oku', { keepTab: true }));
    sideEl.append(btn);
  }
}

// --- first-run welcome card on the day page ---
function welcomeDismissed() { try { return localStorage.getItem('mufka-welcome') === 'done'; } catch { return true; } }
function welcomeCard() {
  const card = elem('section', 'welcome');
  card.setAttribute('aria-label', 'Welcome');
  card.append(elem('div', 'welcome-title', 'Welcome to Mufka'));
  const list = elem('ul', 'welcome-list');
  for (const t of [
    'This is Home: today, what you planned for it and its note. Plans are made in the Planner (Notes | Planner, top left).',
    'Your notes are in the sidebar under Notes: plain .md files in a folder on your Mac. To use another folder (for example your Obsidian vault), click "Notes folder" at the bottom of the sidebar.',
    K('Keyboard: ⌘O open a note · ⌘P every command · ⌘/ all shortcuts (also at the bottom of the sidebar).'),
    'Details (top right) shows a note\u2019s outline, links and tags. Graph shows how notes connect.',
  ]) list.append(elem('li', null, t));
  card.append(list);
  const ok = elem('button', 'btn', 'Got it');
  ok.type = 'button';
  ok.addEventListener('click', () => { try { localStorage.setItem('mufka-welcome', 'done'); } catch { /* ignore */ } render(); });
  card.append(ok);
  return card;
}

// --- toast ---

let toastTimer = null;
function showToast(text, ms = 2600) {
  toastEl.textContent = text; toastEl.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
}

// --- backup (menu) ---

async function exportBackup() {
  const res = await plansApi.export(state.store);
  if (res && res.ok) showToast('Backup saved.');
}
async function importBackup() {
  const res = await plansApi.importPlans();
  if (!res || res.canceled) return;
  if (res.error) { showToast('Import failed.'); return; }
  const incoming = migrate(res.data);
  const ids = new Set(state.store.items.map((p) => p.id));
  let added = 0;
  for (const p of incoming.items) if (!ids.has(p.id)) { state.store.items.push(p); added += 1; }
  persistPlans(); render();
  showToast(added > 0 ? `${added} ${added === 1 ? 'plan' : 'plans'} imported.` : 'No new plans.');
}

// --- menu + shortcuts ---

if (plansApi.onMenu) {
  plansApi.onMenu((action) => {
    if (action === 'export') exportBackup();
    else if (action === 'import') importBackup();
    else if (action === 'new-note') newNote();
    else if (action === 'tab:takvim') setTab('takvim');
    else if (action === 'tab:notlar') setTab('notlar');
    else if (action === 'tasks') openTasks();
    else if (action === 'tab:ara') setTab('ara');
    else if (action === 'toggle-sidebar') toggleSidebar();
    else if (action === 'unused-attachments') showUnusedAttachments();
    else if (action === 'graph') openGraph();
    else if (action === 'planner') openPlanner(new Date());
    else if (action === 'switcher') openQuickSwitcher();
    else if (action === 'shortcuts') showShortcuts();
    else if (action === 'nav-back') goNav(-1);
    else if (action === 'nav-forward') goNav(1);
    else if (action === 'rightbar') toggleRightbar();
    else if (action === 'commands') openCommandPalette();
    else if (action === 'random-note') openRandomNote();
    else if (action === 'graph-local') openGraph({ local: true });
    else if (action === 'settings') openSettings();
  });
}
if (notesApi.onChanged) {
  notesApi.onChanged(async () => {
    // Folder settings can change in Obsidian (.obsidian/*.json) or by adding a
    // Templates folder; re-read them with the tree.
    const lay = await notesApi.layout().catch(() => null);
    if (lay && !lay.error) state.layout = { ...state.layout, ...lay };
    await refreshTree();
    await rebuildBacklinks();
    await loadBookmarks();
    state.dailyDates = new Set(await safeDailyDates());
    // While an editor is open, keep the fresh data but do not re-render: that
    // would rebuild the editor under the caret. Changes arrive while typing
    // since the vault is watched (another app saving, a sync).
    if (isEditing()) return;
    if (state.contentView === 'graph') graph().show({ center: state.openNote });
    if (state.contentView === 'tasks' && state.board) await reloadBoard();
    // Reload the open note if it changed on disk and nothing is being edited.
    if (state.openNote && state.noteView === 'blocks') {
      const res = await notesApi.read(state.openNote);
      if (res && !res.error && res.content !== state.noteContent) {
        state.noteContent = res.content; state.noteCache.set(state.openNote, res.content); histReset('note');
      }
    }
    render();
  });
}

// An editor (a block, the source textarea, or a tree/plan inline field) is open.
function isEditing() {
  return !!(state.blockEdit || document.getElementById('block-editor') || document.getElementById('note-editor')
    || document.getElementById('tree-edit') || state.editPlanId || (state.contentView === 'tasks' && tasksEditing()));
}

function isTextTarget(t) {
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'
    || t.tagName === 'SELECT' || t.isContentEditable);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.menu) { closeMenu(); return; }
  if (e.key === 'Escape' && settingsLayer) { e.preventDefault(); settingsLayer._close(); return; }
  if (e.ctrlKey && !e.metaKey && e.key === 'Tab') { e.preventDefault(); toggleMode(); return; }
  if (e.key === 'Escape' && state.editPlanId) { state.editPlanId = null; removeOutside(); render(); return; }
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  const k = e.key.toLowerCase();
  if (k === 'z') {
    // Whole-document undo/redo for the block editor (overrides native undo).
    const editScope = state.blockEdit ? state.blockEdit.scope
      : (state.contentView === 'note' && state.openNote && state.noteView === 'blocks' ? 'note' : null);
    if (editScope) { e.preventDefault(); if (e.shiftKey) histRedo(editScope); else histUndo(editScope); return; }
    if (e.shiftKey) return;
    if (isTextTarget(e.target)) return; // native text undo
    e.preventDefault();
    if (state.contentView === 'tasks') undoBoard(); else undoDelete();
    return;
  }
  if (e.code === 'Backslash' && e.shiftKey) { e.preventDefault(); toggleRightbar(); return; }
  if (k === '\\') { e.preventDefault(); toggleSidebar(); return; }
  if (k === '1') { e.preventDefault(); setTab('takvim'); return; }
  if (k === '2') { e.preventDefault(); setTab('notlar'); return; }
  if (k === '3') { e.preventDefault(); openTasks(); return; }
  if (k === 'f') { e.preventDefault(); setTab('ara'); return; }
  if (k === 't' && e.shiftKey) { e.preventDefault(); if (state.contentView === 'note' && state.openNote) openTemplatePicker(); return; }
  if (k === 't') { e.preventDefault(); goToday(); return; }
  if (k === 'n') { e.preventDefault(); newNote(); return; }
  if (k === ',') { e.preventDefault(); openSettings(); return; }
  if (e.key === '[' || e.code === 'BracketLeft') { if (!isTextTarget(e.target)) { e.preventDefault(); goNav(-1); } return; }
  if (e.key === ']' || e.code === 'BracketRight') { if (!isTextTarget(e.target)) { e.preventDefault(); goNav(1); } return; }
  if (k === '/') { e.preventDefault(); showShortcuts(); return; }
  if (k === 'p' && e.shiftKey) { e.preventDefault(); plannerApi.newPlan(state.contentView === 'planner' && !isThisWeekShown() ? startOfWeek(state.weekDate) : new Date()); return; }
  if (k === 'o') { e.preventDefault(); openQuickSwitcher(); return; }
  if (state.contentView === 'planner' && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); openPlanner(addDays(state.weekDate, e.key === 'ArrowLeft' ? -7 : 7)); return; }
  if (k === 'p') { e.preventDefault(); openCommandPalette(); return; }
  if (k === 'g') { e.preventDefault(); openGraph({ local: e.shiftKey, focus: true }); return; }
  if (k === 'e') {
    if (state.contentView === 'note' && state.openNote) { e.preventDefault(); toggleNoteView(); }
  }
});

// --- notifications ---

let lastTick = Date.now();
function checkDue(nowMs = Date.now()) {
  const due = duePlans(state.store.items, new Date(nowMs), lastTick, nowMs);
  lastTick = nowMs;
  due.forEach((d) => plansApi.notify({ title: 'Mufka', body: `${d.time} · ${d.title}` }));
  return due.length;
}

// Reminders the system could not show as notifications (e.g. an unsigned
// build: macOS notifications need a code-signed app since Electron 42). They
// stay until dismissed, so a reminder is not missed while away. Clicking one
// opens today.
const remindersEl = document.getElementById('reminders');
function showReminder({ body }) {
  const item = elem('div', 'reminder');
  const open = elem('button', 'reminder-text');
  open.type = 'button';
  const label = elem('span', 'reminder-label'); label.textContent = 'Reminder';
  const text = elem('span', 'reminder-body'); text.textContent = body;
  open.append(label, text);
  open.addEventListener('click', () => { item.remove(); goToday(); });
  const close = elem('button', 'reminder-close');
  close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', 'Dismiss reminder');
  close.addEventListener('click', () => item.remove());
  item.append(open, close);
  remindersEl.append(item);
}
if (plansApi.onNotifyFailed) plansApi.onNotifyFailed(showReminder);

async function safeDailyDates() {
  const res = await notesApi.dailyDates();
  return Array.isArray(res) ? res : [];
}

// --- boot ---

async function boot() {
  loadSidebar();
  loadRecent();
  loadRightbar();
  loadNoteSort();
  loadBookmarks();
  loadVaultInfo();
  loadExpanded();
  // Fall back to the default folders rather than failing to start.
  const lay = await notesApi.layout().catch(() => null);
  if (lay && !lay.error) state.layout = { ...state.layout, ...lay };
  await loadStore();
  await refreshTree();
  await rebuildBacklinks();
  state.dailyDates = new Set(await safeDailyDates());
  const now = new Date();
  const res = await notesApi.readDaily(dayKey(now));
  state.dailyNote = { key: dayKey(now), content: res && !res.error ? res.content : null };
  render();
  lastTick = Date.now();
  setInterval(() => checkDue(), 30000);
}

boot().catch((e) => { console.error('boot failed', e); render(); });

// Dev-only test hook; never present in packaged builds.
if (!plansApi.isPackaged) window.__mufkaCheckDue = checkDue;
