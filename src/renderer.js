// All UI logic. Plain DOM, no framework. User content enters the DOM only via
// textContent / the Markdown renderer (which never uses innerHTML). Pure logic
// is imported from ../lib.

import {
  dayKey, parseDayKey, monthGrid, isToday, addDays, addMonths, startOfWeek, weekKey,
  formatMonthLong, formatDayNumeric, formatDayPretty, formatWeekRange, formatWeekdayLong, WEEKDAY_SHORT,
} from '../lib/dates.mjs';
import { weekDates } from '../lib/week.mjs';
import { migrate, emptyStore } from '../lib/migrate.mjs';
import { genId, searchPlans, foldTR, byTimeThenCreated } from '../lib/plans.mjs';
import { occursOn, describeRecur, repeatChoices, recurFromChoice, choiceFromRecur } from '../lib/recur.mjs';
import { duePlans } from '../lib/notify.mjs';
import { mergeOutside } from '../lib/outside.mjs';
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
import { createCanvasView } from './canvas-view.js';
import { parseCanvas, stringifyCanvas } from '../lib/canvas.mjs';
import { embedSection } from '../lib/embed.mjs';
import { clipPage } from '../lib/clip.mjs';
import { renderPlanner, plannerFocus, announce } from './planner.js';
import { renderTasks, tasksEditing, tasksAnnounce, openTaskAfterRender, prettyDue } from './tasks.js';
import { createDataview } from './dataview-view.js';
import { runBase, parseBase, cellInput, newNoteDefaults } from '../lib/bases/base.mjs';
import { baseView } from './bases-view.js';
import { collectTasks, runTasksQuery, completeTaskLine } from '../lib/tasks-query.mjs';
import { tasksBlock as tasksQueryView } from './tasks-view.js';
import { createMermaid } from './mermaid-view.js';
import { budgetCard, addButton, decorateBudgetTable, categoryColours, moneyFormat, openAddDialog } from './budget-view.js';
import { habitsCard, decorateHabitTable, addHabitButton, openHabitDialog } from './habits-view.js';
import { jobStrip, jobsBoard, openJobDialog } from './jobs-view.js';
import { weekBoard, focusNewTask } from './weekly-view.js';
import { projectStrip, projectsBoard, openProjectDialog } from './projects-view.js';
import { projectOf, projectsSettings, mayBeProject } from '../lib/projects.mjs';
import { bookOf, mayBeBook, bookShelves, bookStats, stageChanges } from '../lib/books.mjs';
import { bookHead, bookcase, openBookDialog } from './books-view.js';
import { movieOf, mayBeMovie, movieRows, movieStats, movieStageChanges } from '../lib/movies.mjs';
import { movieHead, watchlist, openMovieDialog } from './movies-view.js';
import { tripStrip } from './trips-view.js';
import { meetingStrip } from './meetings-view.js';
import { weekDays, addWeekTask, editWeekTask, moveWeekTask, moveOpenToNextDay, nextWeekTodoText } from '../lib/weekly.mjs';
import { jobOf, jobsSettings, mayBeJob, jobNoteName, setJobStatus, DEFAULT_STAGES } from '../lib/jobs.mjs';
import { habitTable, toggleHabit, addHabit, habitWeek, shiftWeek, weekMonday, nextWeekText } from '../lib/habits.mjs';
import { budgetTables, budgetSettings, categoryChoices, addBudgetRow, budgetMonth, shiftMonth, nextMonthText } from '../lib/budget.mjs';
import { renderDraw, closeDrawing, drawingChanged, drawingPreview } from './draw.js';
import { isDrawingRel, isDrawingText, drawingTitle, emptyScene, serializeDrawing, drawingFolder, pastedImageName } from '../lib/drawing.mjs';
import { isBoard, parseBoard, serializeBoard, newBoard, dueTasks, dayTasks, parseCard, completeTask, reopenTask, findOpenTask } from '../lib/kanban.mjs';
import { meetingTodos, meetingOf, todoWhen } from '../lib/meetings.mjs';
import { wavFromSamples, voiceNoteName, voiceNoteText, HANDY_RATE } from '../lib/audio.mjs';
import { tripOf } from '../lib/trips.mjs';
import { icon } from './icons.js';
import { openPalette, closePalette, isPaletteOpen, paletteKeepsEditor } from './palette.js';
import { attachHoverPreview, hidePreview } from './hover-preview.js';
import { openVersionHistory, openDeletedNotes } from './history-view.js';
import { createFindBar } from './find-bar.js';
import { htmlToMarkdown, isRichHtml, insideCodeFence } from '../lib/paste.mjs';
import { parseQuery, isPlainQuery, matchNote, searchDoc, hitTerms, hitsIn, snippetFor } from '../lib/search.mjs';
import { attachSuggest } from './suggest.js';
import { linkTextFor } from '../lib/suggest.mjs';
import { blockChoices, findBlock, newBlockId, addBlockId, addBlockIdLine } from '../lib/blockref.mjs';
import { applyTemplate } from '../lib/template.mjs';
import { keyLabel } from '../lib/keys.mjs';
import { BUILTIN_TEMPLATES, templateChoices } from '../lib/builtin-templates.mjs';
import { countText } from '../lib/wordcount.mjs';
import { updateStatus } from '../lib/updates.mjs';
import { createNavHistory, sameLocation } from '../lib/navhistory.mjs';
import { createTabs } from '../lib/tabs.mjs';
import { slashItems } from '../lib/slash.mjs';
import { readProps, setProp, deleteProp, renameProp, defaultValue, aliasesOf } from '../lib/properties.mjs';
import { fuzzyMatch, fuzzyFilter, pushRecent } from '../lib/fuzzy.mjs';
import { outline, outgoingLinks, unlinkedMentions, linkMention } from '../lib/noteinfo.mjs';
import { buildTagIndex } from '../lib/tags.mjs';
import { eventsOnDay, eventWhen } from '../lib/calendar.mjs';
import { comboOf, RESERVED, idOf, keyOf, customCommand, freedDefault, takenBy, assign as assignKeys, reset as resetKeys } from '../lib/hotkeys.mjs';
import { foldPlan, headingFor, foldsHiding } from '../lib/fold.mjs';
import { PALETTE, TREE_ICONS, folderColor, rowColor, isIconId, cleanEmoji, setStyle, remapStyles, pruneStyles } from '../lib/treestyle.mjs';
import { el as elem } from './dom.js';

const plansApi = window.planner;
// macOS: Mufka draws its own title bar (styles.css, "Title bar").
if (plansApi.isMac) document.documentElement.classList.add('mac');
else document.documentElement.classList.add('win');
// Shortcuts read the system's way: ⌘O on a Mac, Ctrl+O elsewhere (lib/keys.mjs).
const K = (text) => keyLabel(text, plansApi.isMac);
// Shortcuts changed in Settings → Shortcuts: { command: keys }, '' = none.
let hotkeys = {};
try { hotkeys = JSON.parse(localStorage.getItem('mufka-hotkeys') || '{}') || {}; } catch { /* none */ }
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
  treeCanvases: [],       // Obsidian Canvas files: [{ rel, mtime }]
  canvas: null,           // the open canvas: { rel }
  store: emptyStore(),
  calCursor: new Date(),
  selectedDate: new Date(),
  // disk: the day's note as Mufka last read or wrote it (lib/outside.mjs).
  dailyNote: { key: null, content: null, disk: null },
  dailyDeleteConfirm: false,
  noteDeleteConfirm: false,
  dailyDates: new Set(),
  // Notes vault
  treeFolders: [],        // folder rel strings
  treeNotes: [],          // [{ rel, mtime }]
  treeBases: [],          // Obsidian Bases files: [{ rel, mtime }]
  baseTexts: new Map(),   // a base's rel → { mtime, text }
  base: null,             // the open base: { rel, view }
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
  // The open note as Mufka last read or wrote it (lib/outside.mjs).
  noteDisk: null,
  propAdding: null,       // 'note' | 'daily': the properties editor's new-property row is open
  noteView: 'blocks',     // 'blocks' (live preview) | 'source' (raw textarea)
  blockEdit: null,        // { scope:'note'|'daily', startLine?, newAfter?, caret }
  blockCaretPos: null,    // caret offset to apply to the block editor after render
  history: null,          // { key, stack:[src...], i } whole-document undo/redo
  noteCache: new Map(),   // rel -> content (for Ara text search)
  araQuery: '',
  menu: null,             // open row menu: { anchorKey, buildItems }
  contentView: 'day',     // what the right pane shows: 'day' | 'note' | 'graph' | 'planner' | 'tasks' | 'draw'
  board: null,            // the open task board: { rel, content } (src/tasks.js, lib/kanban.mjs)
  drawing: null,          // the open drawing: { rel, content } (src/draw.js, lib/drawing.mjs)
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
  return out.sort(byTimeThenCreated);
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

function pushUndo(entry) {
  state.undo.push(entry);
  if (state.undo.length > UNDO_LIMIT) state.undo.shift();
}

function deletePlan(id) {
  const i = state.store.items.findIndex((x) => x.id === id);
  if (i === -1) return;
  const [removed] = state.store.items.splice(i, 1);
  pushUndo({ type: 'remove', plan: removed, index: i });
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
  } else if (last.type === 'board') {
    setBoardText(last.rel, last.content);
    if (last.tick === 'add') homeTicked = homeTicked.filter((x) => x !== last.entry);
    if (last.tick === 'remove') homeTicked.push(last.entry);
    render();
    return;
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

let findBar = null; // set below, once its helpers exist
// The right pane (see "the right pane" below).
const splitEl = document.getElementById('split-pane');
let split = null; // { rel, text }
let splitShown = null;
let splitAsk = 0;
function render() {
  // Removing a focused block textarea during a re-render fires its blur
  // synchronously; suppress that so it cannot commit stale text into the
  // already-advanced edit target (data corruption).
  state.suppressBlockBlur = true;
  renderSidebar(); renderContent(); applyBlockFlash(); renderPaneActions(); renderRightbar(); restoreFocus(); renderMenu();
  state.suppressBlockBlur = false;
  syncTabs();
  renderSplit();
  if (findBar) findBar.refresh();
}

// The pane top bar's right actions follow what the pane shows: the open note
// gets a copy icon + "⋯" menu; the day page (Takvim) leaves it empty.
function renderPaneActions() {
  paneActionsEl.replaceChildren();
  updateStatusBar();
  renderPaneTitle();
  if (state.contentView === 'note' && state.openNote) {
    const title = noteTitleOf(state.openNote);
    if (voice.handy) paneActionsEl.append(dictateButton());
    paneActionsEl.append(
      copyIconButton(() => state.noteContent),
      menuIconButton('menu-note', () => noteActionItems(title, () => state.noteContent, () => saveOpenNote())),
    );
  }
}

// --- Voice: dictation with Handy (main.js starts and stops it) -------------
// Handy writes where the caret is, so the note keeps an editor focused: the
// one open, else a new line at the note's end.
const voice = { handy: false, studio: false, dictating: null, timer: null }; // dictating: start time; studio: VoiceStudio installed or running
async function loadVoice() {
  const s = await notesApi.voice().catch(() => null);
  const was = voice.handy;
  voice.handy = Boolean(s && s.handy && s.handy.installed);
  voice.studio = Boolean(s && s.studio && (s.studio.installed || s.studio.running));
  voice.studioRunning = Boolean(s && s.studio && s.studio.running);
  if (was !== voice.handy) renderPaneActions();
}
const dictateTime = () => { const s = Math.floor((Date.now() - voice.dictating) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function dictateButton() {
  const on = Boolean(voice.dictating);
  const b = elem('button', `icon-btn-sq dictate-btn${on ? ' on' : ''}`);
  b.type = 'button';
  b.append(icon('mic'));
  if (on) b.append(elem('span', 'dictate-time', dictateTime()));
  b.title = K(on ? 'Stop dictating (⇧⌘D)' : 'Dictate with Handy (⇧⌘D)');
  b.setAttribute('aria-label', on ? 'Stop dictating' : 'Dictate with Handy');
  b.setAttribute('aria-pressed', String(on));
  // Keep the caret in the editor: Handy types into whatever has the focus.
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', () => toggleDictation());
  return b;
}
function focusNoteEditor() {
  const open = document.getElementById('block-editor') || document.getElementById('note-editor');
  if (open) { open.focus(); return; }
  const blocks = parseBlocks(state.noteContent);
  startNewBlock('note', blocks.length ? blocks[blocks.length - 1].start : -1, 0);
  document.getElementById('block-editor')?.focus();
}
// --- Voice: a new note from a recording or an audio file (Handy writes it) --
// The audio is decoded and resampled here (Web Audio) to the 16 kHz mono WAV
// Handy's --transcribe-file reads (lib/audio.mjs); main runs Handy and can
// keep the recording with the note.
async function wavFor(bytes) {
  const ctx = new AudioContext();
  let decoded;
  try { decoded = await ctx.decodeAudioData(bytes.slice(0)); } finally { ctx.close(); }
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * HANDY_RATE)), HANDY_RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const out = await off.startRendering();
  return wavFromSamples(out.getChannelData(0));
}
// Who writes it down: Handy (a WAV made here, its command line) or VoiceStudio
// (the audio as it is, its local server). The last one chosen is remembered.
const VOICE_ENGINES = { handy: 'Handy', studio: 'VoiceStudio' };
const localGet = (k) => { try { return localStorage.getItem(`mufka-${k}`); } catch { return null; } };
const localSet = (k, v) => { try { localStorage.setItem(`mufka-${k}`, v); } catch { /* ignore */ } };
const VOICE_LEDE = {
  handy: 'Handy turns it into text on your computer, with the model chosen in Handy; the note opens when it is done.',
  studio: 'VoiceStudio turns it into text on your computer, with the model chosen in VoiceStudio; the note opens when it is done.',
};
function openVoiceNote() {
  const engines = ['handy', 'studio'].filter((k) => voice[k]);
  if (!engines.length) { showToast('Install Handy or VoiceStudio first: see Settings → Voice'); return; }
  let engine = engines.includes(localGet('voiceEngine')) ? localGet('voiceEngine') : engines[0];
  const layer = elem('div', 'palette-layer');
  const box = elem('div', 'palette plan-dialog voice-dialog');
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'New note from audio');
  const lede = elem('p', 'voice-lede', VOICE_LEDE[engine]);
  box.append(elem('div', 'plan-dialog-title', 'New note from audio'), lede);
  if (engines.length > 1) {
    const row = elem('div', 'voice-engine');
    const seg = elem('div', 'voice-engine-seg');
    seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Written down by');
    for (const k of engines) {
      const b = elem('button', null, VOICE_ENGINES[k]); b.type = 'button'; b.dataset.engine = k;
      b.setAttribute('aria-pressed', String(k === engine));
      b.addEventListener('click', () => {
        if (busy) return;
        engine = k; localSet('voiceEngine', k); lede.textContent = VOICE_LEDE[k];
        seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.engine === k)));
      });
      seg.append(b);
    }
    row.append(elem('span', null, 'Written down by'), seg);
    box.append(row);
  }
  const choices = elem('div', 'voice-choices');
  const card = (title, sub, ic) => {
    const b = elem('button', 'btn voice-choice'); b.type = 'button';
    if (ic) b.append(icon(ic, { size: 16 }));
    b.append(elem('b', null, title), elem('span', null, sub));
    return b;
  };
  const recordBtn = card('Record now', 'Speak; stop when you are done', 'mic');
  const fileBtn = card('Choose a file…', 'm4a, mp3, wav, webm, ogg');
  choices.append(recordBtn, fileBtn);
  const status = elem('div', 'voice-status');
  const keepLabel = elem('label', 'voice-keep');
  const keep = document.createElement('input'); keep.type = 'checkbox'; keep.checked = true;
  keepLabel.append(keep, document.createTextNode('Keep the recording with the note'));
  const actions = elem('div', 'plan-dialog-actions');
  const cancel = elem('button', 'btn quiet', 'Cancel'); cancel.type = 'button';
  actions.append(cancel);
  box.append(choices, status, keepLabel, actions);
  const picker = document.createElement('input');
  picker.type = 'file'; picker.accept = 'audio/*,.m4a,.mp3,.wav,.webm,.ogg,.oga,.flac,.aac'; picker.hidden = true;
  box.append(picker);
  let busy = false; let recorder = null; let stream = null; let tick = null; let closed = false;
  const restore = document.activeElement;
  const stopMic = () => { clearInterval(tick); if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; };
  const close = () => {
    closed = true;
    if (recorder && recorder.state !== 'inactive') { recorder.onstop = null; recorder.stop(); }
    stopMic();
    if (busy) notesApi.cancelTranscribe();
    layer.remove(); document.removeEventListener('keydown', onKey, true);
    if (restore && restore.isConnected) restore.focus();
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  cancel.addEventListener('click', close);
  const say = (text, cls = '') => { status.className = `voice-status ${cls}`; status.textContent = text; };
  // The audio's bytes and name → the note (the recording kept when asked).
  const finish = async (bytes, name, date) => {
    busy = true;
    recordBtn.disabled = true; fileBtn.disabled = true;
    const who = VOICE_ENGINES[engine];
    let res;
    if (engine === 'studio') {
      say(`${name} · VoiceStudio is writing it down…`, 'busy');
      res = await notesApi.studioTranscribe(bytes, name);
    } else {
      say(`${name} · reading it…`, 'busy');
      let wav;
      try { wav = await wavFor(bytes); } catch { busy = false; say('That file could not be read as audio', 'error'); recordBtn.disabled = false; fileBtn.disabled = false; return; }
      say(`${name} · Handy is writing it down…`, 'busy');
      res = await notesApi.transcribe(wav);
    }
    busy = false;
    if (closed) return;
    if (!res || res.error) { say(res && res.error ? res.error : `${who} could not write it down`, 'error'); recordBtn.disabled = false; fileBtn.disabled = false; return; }
    const folder = targetFolder();
    const base = name.replace(/\.[^.]*$/, '');
    let audio = '';
    if (keep.checked) {
      const saved = await notesApi.saveAudio(folder, name, bytes);
      if (saved && !saved.error) { audio = saved.name; await refreshAttachList(); }
    }
    const made = await notesApi.create(folder, base);
    if (!made || !made.rel) { say('Could not create the note', 'error'); return; }
    await notesApi.write(made.rel, voiceNoteText({ date, audio, text: res.text, source: who }));
    close();
    await refreshTree();
    await openNote(made.rel, 'oku', { keepTab: true });
    showToast(res.text ? 'Voice note ready' : `${who} heard no words in it`);
  };
  fileBtn.addEventListener('click', () => picker.click());
  picker.addEventListener('change', async () => {
    const f = picker.files && picker.files[0];
    if (!f) return;
    finish(await f.arrayBuffer(), f.name, new Date(f.lastModified || Date.now()));
  });
  recordBtn.addEventListener('click', async () => {
    if (recorder) { recorder.stop(); return; }
    if (!(await notesApi.micAccess())) { say('Mufka may not use the microphone: allow it in System Settings → Privacy & Security → Microphone', 'error'); return; }
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { say('The microphone could not be opened', 'error'); return; }
    const chunks = [];
    const started = new Date();
    recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      stopMic();
      recordBtn.querySelector('b').textContent = 'Record now';
      recorder = null;
      const bytes = await new Blob(chunks, { type: 'audio/webm' }).arrayBuffer();
      finish(bytes, `${voiceNoteName(started)}.webm`, started);
    };
    recorder.start(1000);
    fileBtn.disabled = true;
    recordBtn.classList.add('recording');
    recordBtn.querySelector('b').textContent = 'Stop';
    const shown = () => { const s = Math.floor((Date.now() - started) / 1000); say(`● Recording ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, 'rec'); };
    shown(); tick = setInterval(shown, 1000);
  });
  layer.append(box);
  layer.addEventListener('mousedown', (e) => { if (e.target === layer && !busy && !recorder) close(); });
  document.body.append(layer);
  recordBtn.focus();
}

async function toggleDictation() {
  if (!voice.handy) { showToast('Handy is not installed: see Settings → Voice'); return; }
  if (!voice.dictating) {
    if (!(state.contentView === 'note' && state.openNote)) { showToast('Open a note to dictate into'); return; }
    focusNoteEditor();
  }
  const res = await notesApi.handyToggle();
  if (!res || res.error) { showToast(res && res.error ? res.error : 'Could not reach Handy'); return; }
  if (voice.dictating) {
    voice.dictating = null; clearInterval(voice.timer); voice.timer = null;
    showToast('Handy is writing it down');
  } else {
    voice.dictating = Date.now();
    voice.timer = setInterval(() => { const t = document.querySelector('.dictate-time'); if (t) t.textContent = dictateTime(); }, 1000);
  }
  renderPaneActions();
  document.getElementById('block-editor')?.focus();
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
      // The suggested name ("Untitled", "New folder") is replaced by typing.
      if (!(state.treeEdit && state.treeEdit.typed)) el.select();
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

// The sidebar's width: drag its right edge (arrow keys when focused),
// double-click for the default. Remembered between launches.
const SIDEBAR_W = { def: 300, min: 220, max: 600 };
const sidebarResizer = document.getElementById('sidebar-resizer');
function setSidebarWidth(w, save = true) {
  const px = Math.round(Math.min(Math.max(w, SIDEBAR_W.min), Math.min(SIDEBAR_W.max, window.innerWidth - 360)));
  appEl.style.setProperty('--sidebar-w', `${px}px`);
  sidebarResizer.setAttribute('aria-valuenow', String(px));
  if (save) { try { localStorage.setItem('mufka-sidebar-width', String(px)); } catch { /* ignore */ } }
}
function loadSidebarWidth() {
  let w = SIDEBAR_W.def;
  try { w = Number(localStorage.getItem('mufka-sidebar-width')) || SIDEBAR_W.def; } catch { /* ignore */ }
  setSidebarWidth(w, false);
}
sidebarResizer.setAttribute('aria-valuemin', String(SIDEBAR_W.min));
sidebarResizer.setAttribute('aria-valuemax', String(SIDEBAR_W.max));
sidebarResizer.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  sidebarResizer.setPointerCapture(e.pointerId);
  const startX = e.clientX;
  const startW = sidebarEl.getBoundingClientRect().width;
  appEl.classList.add('resizing-sidebar');
  document.documentElement.classList.add('resizing-sidebar');
  const move = (ev) => setSidebarWidth(startW + ev.clientX - startX, false);
  const up = (ev) => {
    sidebarResizer.removeEventListener('pointermove', move);
    sidebarResizer.removeEventListener('pointerup', up);
    sidebarResizer.removeEventListener('pointercancel', up);
    appEl.classList.remove('resizing-sidebar');
    document.documentElement.classList.remove('resizing-sidebar');
    setSidebarWidth(startW + ev.clientX - startX);
  };
  sidebarResizer.addEventListener('pointermove', move);
  sidebarResizer.addEventListener('pointerup', up);
  sidebarResizer.addEventListener('pointercancel', up);
});
sidebarResizer.addEventListener('dblclick', () => setSidebarWidth(SIDEBAR_W.def));
sidebarResizer.addEventListener('keydown', (e) => {
  const step = e.shiftKey ? 40 : 10;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    setSidebarWidth(sidebarEl.getBoundingClientRect().width + (e.key === 'ArrowRight' ? step : -step));
  }
});

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
  // Nor out of a name being typed for a new note or folder: the field is
  // rebuilt with what was typed, and removing the old one must not commit it.
  const naming = act && act.id === 'tree-edit' && state.treeEdit;
  if (naming) state.treeEdit.typed = { value: act.value, start: act.selectionStart, end: act.selectionEnd };
  state.rebuildingSidebar = true;
  sideEl.replaceChildren();
  renderSearchField();
  if (state.araQuery.trim()) renderSearchResults();
  else {
    renderPlaces();
    renderBookmarks();
    renderBoardsSection();
    renderDrawingsSection();
    renderNotesSection();
  }
  state.rebuildingSidebar = false;
  sideEl.scrollTop = scroll;
  if (typing) {
    const f = document.getElementById('ara-input');
    f.focus();
    try { f.setSelectionRange(typing.start, typing.end); } catch { /* ignore */ }
  }
  const named = naming && document.getElementById('tree-edit');
  if (named) {
    named.focus();
    try { named.setSelectionRange(state.treeEdit.typed.start, state.treeEdit.typed.end); } catch { /* ignore */ }
  }
}

function renderSearchField() {
  const wrap = elem('div', 'side-search-wrap');
  const field = document.createElement('input');
  field.type = 'search'; field.id = 'ara-input'; field.className = 'side-search';
  field.placeholder = 'Search or create a note';
  field.value = state.araQuery;
  field.setAttribute('aria-label', 'Search');
  field.title = K('Search notes and plans (⇧⌘F). Enter opens the note with this name, or creates it. Also: "phrase", -word, a OR b, file:, path:, #tag, line:(…), section:(…), task:, [property:value], /regex/');
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
  const tree = buildTree(state.treeFolders, [...state.treeNotes, ...state.treeBases, ...state.treeCanvases], { sort: state.noteSort, order: state.treeOrder });
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
  contentEl.classList.toggle('is-draw', state.contentView === 'draw');
  contentEl.classList.remove('is-canvas');
  if (state.contentView !== 'draw') closeDrawing();
  if (state.contentView === 'graph') contentEl.append(graph().el);
  else if (state.contentView === 'planner') renderPlanner(contentEl, state.weekDate, plannerApi);
  else if (state.contentView === 'tasks') renderTasks(contentEl, tasksApi());
  else if (state.contentView === 'draw') renderDraw(contentEl, drawApi());
  else if (state.contentView === 'canvas' && state.canvas) renderCanvasPage();
  else if (state.contentView === 'note' && state.openNote) renderNotePane();
  else if (state.contentView === 'base' && state.base) renderBasePage();
  else renderDayPage();
}

// --- Canvas (lib/canvas.mjs, src/canvas-view.js) ---
// A .canvas file opens as a board of cards. The board is made once per open
// canvas and kept across re-renders; changes are saved a moment later.
const isCanvasRel = (rel) => /\.canvas$/i.test(String(rel || ''));
const canvasTitleOf = (rel) => leafOf(rel).replace(/\.canvas$/i, '');
let canvasBoard = null; // { rel, host, api, written, mtime, timer }
async function openCanvas(rel) {
  flushActiveEditor();
  if (!canvasBoard || canvasBoard.rel !== rel) {
    const res = await notesApi.read(rel);
    if (!res || res.error) { showToast('Could not open the canvas'); return; }
    const data = parseCanvas(res.content);
    if (data.error) { showToast(data.error); return; }
    saveCanvasNow();
    const host = elem('div', 'canvas-host');
    const board = { rel, host, written: res.content, timer: null };
    board.api = createCanvasView(host, data, canvasOptions(board));
    canvasBoard = board;
  }
  navVisit({ view: 'canvas', rel });
  state.canvas = { rel };
  state.contentView = 'canvas';
  state.selectedFolder = null;
  expandAncestors(rel);
  render();
  canvasBoard.host.focus({ preventScroll: true });
}
function saveCanvasNow() {
  const b = canvasBoard;
  if (!b || !b.timer) return;
  clearTimeout(b.timer); b.timer = null;
  const text = stringifyCanvas(b.api.data());
  b.written = text;
  notesApi.write(b.rel, text).then((w) => { if (w && w.error) showToast('Could not save the canvas'); });
}
// Another app changed the open canvas: show its version.
async function reloadOpenCanvas() {
  const b = canvasBoard;
  if (!b || b.timer) return;
  const res = await notesApi.read(b.rel);
  if (!res || res.error || res.content === b.written) return;
  const data = parseCanvas(res.content);
  if (data.error) return;
  b.written = res.content;
  b.api.setData(data);
}
function canvasFileRel(file) {
  const f = String(file || '');
  if (state.notesFlat.some((n) => n.rel === f)) return f;
  return resolveLink(f.replace(/\.md$/i, ''), canvasBoard ? canvasBoard.rel : '', state.notesFlat);
}
function canvasOptions(board) {
  const md = (text, rel) => renderMarkdown(text, { doc: document, noteExists: wikiExists, attach: (raw) => resolveAttachment(raw, state.attachFiles, folderOf(rel), attachmentsDirFor(state.layout, folderOf(rel))), embedNote, embedStack: [rel], ...noteRenderOptions(rel) });
  return {
    renderText: (text) => md(text, board.rel),
    renderFile: (n) => {
      const box = elem('div', 'cv-file');
      const att = resolveAttachment(n.file, state.attachFiles, '', attachmentsDirFor(state.layout, ''));
      if (!/\.md$/i.test(n.file) && att.url && att.isImage) {
        const img = document.createElement('img'); img.src = att.url; img.alt = leafOf(n.file); img.draggable = false;
        box.classList.add('cv-file-image'); box.append(img);
        return box;
      }
      const rel = canvasFileRel(n.file);
      const title = elem('button', 'cv-file-title', `${rel ? noteTitleOf(rel) : leafOf(n.file).replace(/\.md$/i, '')}${n.subpath ? ` › ${n.subpath.replace(/^#/, '')}` : ''}`);
      title.type = 'button'; title.title = rel ? `Open ${rel}` : 'This note is not in the vault';
      title.addEventListener('pointerdown', (e) => e.stopPropagation());
      title.addEventListener('click', (e) => { if (rel) openFromCanvas(rel, e); });
      const body = elem('div', 'cv-md md');
      const content = rel ? (state.vaultNotes.find((x) => x.rel === rel) || {}).content ?? state.noteCache.get(rel) : null;
      const part = content == null ? null : embedSection(content, n.subpath ? n.subpath.replace(/^#/, '') : null);
      if (part == null) body.append(elem('p', 'cv-missing', rel ? 'Loading…' : `Not found: ${n.file}`));
      else body.append(...md(part, rel));
      box.append(title, body);
      return box;
    },
    onChange: () => {
      clearTimeout(board.timer);
      board.timer = setTimeout(() => { if (canvasBoard === board) saveCanvasNow(); else { board.timer = null; notesApi.write(board.rel, stringifyCanvas(board.api.data())); } }, 400);
    },
    onOpenFile: (file, e) => { const rel = canvasFileRel(file); if (rel) openFromCanvas(rel, e); else if (file) openAttachment(file); },
    onOpenUrl: (url) => notesApi.openExternal(url),
    pickNote: () => new Promise((resolve) => {
      openPalette({
        id: 'canvas-note', placeholder: 'Add a note to the canvas…', footer: '↑↓ navigate · ↵ add · esc close',
        items: (q) => (q.trim() ? fuzzyFilter(q, state.notesFlat, (n) => n.title).map((x) => x.item) : state.notesFlat.slice(0, 50))
          .map((n) => ({ label: n.title, detail: n.folder ? n.folder.split('/').join(' / ') : '', run: () => resolve(n.rel) })),
      });
    }),
    askText: ({ heading, value }) => new Promise((resolve) => askDialog({ heading, value, okLabel: 'Save' }, resolve)),
  };
}
function openFromCanvas(rel, e) {
  saveCanvasNow();
  if (e && (e.metaKey || e.ctrlKey)) openNoteInNewTab(rel); else openNote(rel, 'oku');
}
function renderCanvasPage() {
  if (!canvasBoard || canvasBoard.rel !== state.canvas.rel) { openCanvas(state.canvas.rel); return; }
  contentEl.classList.add('is-canvas');
  contentEl.append(canvasBoard.host);
}
async function newCanvas(folder = targetFolder()) {
  const taken = new Set(state.treeCanvases.map((c) => c.rel.toLowerCase()));
  const base = folder ? `${folder}/` : '';
  let rel = `${base}Untitled.canvas`;
  for (let i = 1; taken.has(rel.toLowerCase()); i++) rel = `${base}Untitled ${i}.canvas`;
  const w = await notesApi.write(rel, stringifyCanvas({ nodes: [], edges: [] }));
  if (w && w.error) { showToast('Could not create the canvas'); return; }
  await refreshTree();
  await openCanvas(rel);
}
// A canvas in the tree: its own icon; a click opens the board.
function canvasRow(n, depth) {
  const row = elem('div', 'tree-row note-row canvas-row' + (state.contentView === 'canvas' && state.canvas && state.canvas.rel === n.rel ? ' selected' : ''));
  row.style.paddingLeft = `${8 + depth * 16 + 16}px`;
  row.tabIndex = 0; row.dataset.rel = n.rel; row.dataset.type = 'canvas';
  const color = rowColor(n.rel, 'note', state.treeStyles);
  if (color) row.style.setProperty('--row-c', color);
  row.append(treeIcon(n.rel, 'kanban'));
  row.append(elem('span', 'tree-name', canvasTitleOf(n.rel)));
  row.addEventListener('click', (e) => { if (e.target.closest('.menu-btn')) return; openCanvas(n.rel); });
  row.addEventListener('keydown', (e) => { if (e.key === 'Enter') openCanvas(n.rel); });
  const items = () => [
    { label: 'Open in new tab', fn: () => { closeMenu(); newTab({ view: 'canvas', rel: n.rel }); } },
    SEP,
    ...copyItems(n.rel, [{ label: 'Copy link', fn: () => { closeMenu(); copyText(`[[${leafOf(n.rel)}]]`, 'the link'); } }]),
    SEP,
    revealItem(n.rel),
    SEP,
    { label: 'Delete', danger: true, fn: () => { closeMenu(); askDialog({ heading: `Delete “${canvasTitleOf(n.rel)}”?`, text: 'The canvas goes to the trash.', okLabel: 'Delete', danger: true }, async () => {
      const r = await notesApi.remove(n.rel);
      if (r && r.error) { showToast('Could not delete the canvas'); return; }
      if (canvasBoard && canvasBoard.rel === n.rel) { clearTimeout(canvasBoard.timer); canvasBoard = null; if (state.contentView === 'canvas') { state.canvas = null; state.contentView = 'day'; } }
      await refreshTree(); render();
    }); } },
  ];
  addMenuBtn(row, `c:${n.rel}`, items);
  onRightClick(row, `c:${n.rel}`, items);
  return row;
}

// --- Web clipper (lib/clip.mjs): a web page's article as a note ---
// main fetches the page; it is parsed here inert (no scripts, no loads).
function openClipper(url = '') {
  const layer = elem('div', 'palette-layer');
  const box = elem('div', 'palette plan-dialog clip-dialog');
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Clip a web page');
  box.append(elem('div', 'plan-dialog-title', 'Clip a web page'), elem('p', 'ask-text', "The article's text becomes a note, with where it came from."));
  const input = document.createElement('input');
  input.className = 'ask-input clip-url'; input.value = url; input.placeholder = 'https://…'; input.setAttribute('aria-label', 'Web address');
  const folderRow = elem('label', 'clip-folder');
  const select = document.createElement('select');
  select.className = 'clip-folder-select';
  for (const f of [...new Set(['Clippings', ...state.treeFolders])]) { const o = document.createElement('option'); o.value = f; o.textContent = f.split('/').join(' / '); select.append(o); }
  folderRow.append(elem('span', null, 'Folder'), select);
  const status = elem('p', 'clip-status');
  box.append(input, folderRow, status);
  const restore = document.activeElement;
  const close = () => { layer.remove(); if (restore && restore.isConnected) restore.focus(); };
  let busy = false;
  const go = async () => {
    let u = input.value.trim();
    if (!u || busy) { input.focus(); return; }
    if (!/^[a-z]+:/i.test(u)) u = `https://${u}`;
    busy = true; yes.disabled = true; status.textContent = 'Clipping…'; status.classList.remove('error');
    const res = await notesApi.clipFetch(u);
    if (!res || res.error) { busy = false; yes.disabled = false; status.textContent = (res && res.error) || 'Could not clip the page'; status.classList.add('error'); return; }
    const doc = new DOMParser().parseFromString(res.html, 'text/html');
    const { name, content } = clipPage(doc, res.url, dayKey(new Date()));
    const made = await notesApi.create(select.value, name);
    if (!made || !made.rel) { busy = false; yes.disabled = false; status.textContent = 'Could not make the note'; status.classList.add('error'); return; }
    await notesApi.write(made.rel, content);
    close();
    await refreshTree();
    await rebuildBacklinks();
    await openNote(made.rel, 'oku');
    showToast(`Clipped to ${select.value}`);
  };
  const actions = elem('div', 'plan-dialog-actions');
  const cancel = elem('button', 'btn quiet', 'Cancel'); cancel.type = 'button'; cancel.addEventListener('click', close);
  const yes = elem('button', 'btn primary', 'Clip'); yes.type = 'button'; yes.addEventListener('click', go);
  actions.append(cancel, yes);
  box.append(actions);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target === input) { e.preventDefault(); go(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  layer.append(box);
  layer.addEventListener('mousedown', (e) => { if (e.target === layer) close(); });
  document.body.append(layer);
  input.focus();
}

// --- graph view (src/graph-view.js) ---
// One instance for the window's life, so the layout survives re-renders and
// coming back to the graph. Local = around the open note.
let graphView = null;
function graph() {
  if (!graphView) {
    graphView = createGraphView({
      loadNotes: async () => { await rebuildBacklinks(); return state.vaultNotes; },
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
// --- tabs and back / forward (lib/tabs.mjs, lib/navhistory.mjs) ---
// Every way of opening something goes through navVisit. Each tab has its own
// back/forward history (⌘[ / ⌘], the ‹ › in the pane bar). A note opened
// from another note gets its own tab (navVisit); ⌘-click (or ⌘Enter) opens
// any place in a new tab; ⌘W closes a tab, ⇧⌘[ ⇧⌘] switch.

const tabs = createTabs(() => createNavHistory());
tabs.add(null);
let navigating = false; // moving through history must not record a new visit
const curNav = () => tabs.active.nav;
function currentLocation() {
  if (state.contentView === 'graph') return { view: 'graph' };
  if (state.contentView === 'planner') return { view: 'planner', key: dayKey(startOfWeek(state.weekDate)) };
  if (state.contentView === 'tasks') return { view: 'tasks', rel: state.board ? state.board.rel : null };
  if (state.contentView === 'draw') return { view: 'draw', rel: state.drawing ? state.drawing.rel : null };
  if (state.contentView === 'base' && state.base) return { view: 'base', rel: state.base.rel };
  if (state.contentView === 'canvas' && state.canvas) return { view: 'canvas', rel: state.canvas.rel };
  if (state.contentView === 'note' && state.openNote) return { view: 'note', rel: state.openNote };
  return { view: 'day', key: dayKey(state.selectedDate) };
}
// A click or Enter with ⌘ (Ctrl) held asks for a new tab; the navigation it
// starts (maybe after reading a file) comes within a moment.
let newTabAsk = 0;
const askNewTab = (e) => { if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.type === 'click' || e.key === 'Enter')) newTabAsk = Date.now(); };
document.addEventListener('click', askNewTab, true);
document.addEventListener('keydown', askNewTab, true);
const docPlace = (loc) => !!(loc && loc.rel && (loc.view === 'note' || loc.view === 'tasks' || loc.view === 'draw' || loc.view === 'base' || loc.view === 'canvas'));
function navVisit(to) {
  hidePreview();
  state.menu = null; // a row menu belongs to the pane it was opened on
  if (!navigating && newTabAsk && Date.now() - newTabAsk < 1500) {
    newTabAsk = 0;
    const from = currentLocation();
    if (!sameLocation(from, to)) { tabs.active.loc = from; tabs.add(to); updateNavButtons(); return; }
  }
  newTabAsk = 0;
  if (!navigating && docPlace(to)) {
    // A note (board, drawing) opened from another one opens beside it, in a
    // tab of its own, or goes to the tab already showing it. From Home, the
    // Planner or the graph it opens in place.
    const from = currentLocation();
    const there = tabs.list.find((t) => t !== tabs.active && sameLocation(t.loc, to));
    if (there) { tabs.active.loc = from; tabs.activate(there.id); updateNavButtons(); return; }
    if (docPlace(from) && from.rel !== to.rel) { tabs.active.loc = from; tabs.add(to); updateNavButtons(); return; }
  }
  if (!navigating) curNav().visit(currentLocation(), to);
  updateNavButtons();
}
function updateNavButtons() {
  document.getElementById('nav-back').disabled = !curNav().canBack;
  document.getElementById('nav-forward').disabled = !curNav().canForward;
}
const navValid = (loc) => (loc.view === 'base' ? state.treeBases.some((b) => b.rel === loc.rel)
  : loc.view === 'canvas' ? state.treeCanvases.some((c) => c.rel === loc.rel)
  : (loc.view !== 'note' && loc.view !== 'tasks' && loc.view !== 'draw') || !loc.rel || state.notesFlat.some((n) => n.rel === loc.rel));
// Show a place without recording it in the history.
async function goTo(loc) {
  navigating = true;
  try {
    if (!loc || !navValid(loc)) await selectDay(new Date(), { keepTab: true });
    else if (loc.view === 'note') await openNote(loc.rel, 'oku', { keepTab: true });
    else if (loc.view === 'graph') openGraph();
    else if (loc.view === 'planner') openPlanner(parseDayKey(loc.key));
    else if (loc.view === 'tasks') await openTasks(loc.rel);
    else if (loc.view === 'draw') await openDraw(loc.rel);
    else if (loc.view === 'base') await openBase(loc.rel);
    else if (loc.view === 'canvas') await openCanvas(loc.rel);
    else await selectDay(parseDayKey(loc.key), { keepTab: true });
  } finally { navigating = false; updateNavButtons(); }
}
async function goNav(dir) {
  const loc = dir < 0 ? curNav().back(currentLocation(), navValid) : curNav().forward(currentLocation(), navValid);
  updateNavButtons();
  if (loc) await goTo(loc);
}
document.getElementById('nav-back').addEventListener('click', () => goNav(-1));
document.getElementById('nav-forward').addEventListener('click', () => goNav(1));

// The active tab follows what the pane shows (also after a rename or delete).
function syncTabs() {
  tabs.active.loc = currentLocation();
  tabs.prune(navValid);
  renderTabStrip();
  try { localStorage.setItem('mufka-tabs', JSON.stringify(tabs)); } catch { /* private window */ }
}
async function switchTab(t) {
  if (!t || t === tabs.active) return;
  flushActiveEditor();
  tabs.active.loc = currentLocation();
  tabs.activate(t.id);
  await goTo(t.loc);
}
async function closeTab(t = tabs.active) {
  if (tabs.count === 1) { if (!sameLocation(t.loc, { view: 'day', key: dayKey(new Date()) })) goToday(); return; }
  if (t === tabs.active) flushActiveEditor();
  const next = tabs.close(t.id);
  if (next) await goTo(next.loc); else render();
}
async function newTab(loc = { view: 'day', key: dayKey(new Date()) }) {
  flushActiveEditor();
  tabs.active.loc = currentLocation();
  tabs.add(loc);
  await goTo(loc);
}
// + in the tab strip (⌥⌘T): a new, empty note in a tab of its own, ready
// to type in; it goes where ⌘N would put it.
async function newNoteTab() {
  const res = await notesApi.create(targetFolder(), 'Untitled');
  if (!res || !res.rel) { showToast('Could not create the note'); return; }
  await refreshTree();
  flushActiveEditor();
  tabs.active.loc = currentLocation();
  tabs.add({ view: 'note', rel: res.rel });
  navigating = true;
  try { await openNote(res.rel, 'duzenle'); } finally { navigating = false; updateNavButtons(); }
}
async function reopenTab() {
  if (!tabs.canReopen) return;
  flushActiveEditor();
  tabs.active.loc = currentLocation();
  await goTo(tabs.reopen().loc);
}
function tabTitle(loc) {
  if (!loc) return 'Home';
  if (loc.view === 'note') return noteTitleOf(loc.rel);
  if (loc.view === 'graph') return 'Graph';
  if (loc.view === 'planner') return 'Planner';
  if (loc.view === 'tasks') return loc.rel ? noteTitleOf(loc.rel) : 'Tasks';
  if (loc.view === 'draw') return loc.rel ? drawingTitle(loc.rel) : 'Draw';
  if (loc.view === 'base') return baseTitleOf(loc.rel);
  if (loc.view === 'canvas') return canvasTitleOf(loc.rel);
  return loc.key === dayKey(new Date()) ? 'Home' : formatDayNumeric(parseDayKey(loc.key));
}
const TAB_ICONS = { note: 'tiFileText', graph: 'graph', planner: 'calendar', tasks: 'kanban', draw: 'tiPenLine', base: 'template', canvas: 'kanban', day: 'home' };
// The strip shows only when there is more than one tab.
const tabStripEl = document.getElementById('tab-strip');
let tabDrag = null;
function renderTabStrip() {
  const many = tabs.count > 1;
  tabStripEl.hidden = !many;
  paneEl.classList.toggle('has-tabs', many);
  tabStripEl.replaceChildren();
  if (!many) return;
  tabs.list.forEach((t, i) => {
    const active = t === tabs.active;
    const tab = elem('div', `tab-item${active ? ' active' : ''}`);
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    tab.draggable = true;
    tab.dataset.menuAnchor = `tab:${t.id}`;
    const label = tabTitle(t.loc);
    tab.title = label;
    tab.append(icon(TAB_ICONS[t.loc ? t.loc.view : 'day'] || 'tiFileText', { size: 14 }), elem('span', 'tab-label', label));
    const x = elem('button', 'tab-close', '×');
    x.type = 'button'; x.title = K('Close tab (⌘W)'); x.setAttribute('aria-label', `Close ${label}`); x.tabIndex = -1;
    x.addEventListener('click', (e) => { e.stopPropagation(); closeTab(t); });
    tab.append(x);
    tab.addEventListener('click', () => switchTab(t));
    tab.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); closeTab(t); } });
    tab.addEventListener('contextmenu', (e) => { e.preventDefault(); openTabMenu(t); });
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); switchTab(tabs.neighbour(e.key === 'ArrowRight' ? 1 : -1)).then(focusActiveTab); }
    });
    tab.addEventListener('dragstart', (e) => { tabDrag = t; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', label); });
    tab.addEventListener('dragover', (e) => { if (tabDrag) { e.preventDefault(); tab.classList.add('drop'); } });
    tab.addEventListener('dragleave', () => tab.classList.remove('drop'));
    tab.addEventListener('drop', (e) => { e.preventDefault(); if (tabDrag && tabDrag !== t) { tabs.move(tabDrag.id, i); syncTabs(); } tabDrag = null; });
    tab.addEventListener('dragend', () => { tabDrag = null; });
    tabStripEl.append(tab);
  });
  const plus = elem('button', 'tab-new', '+');
  plus.type = 'button'; plus.title = K('New note in a new tab (⌥⌘T)'); plus.setAttribute('aria-label', 'New note in a new tab');
  plus.addEventListener('click', () => newNoteTab());
  tabStripEl.append(plus);
}
function focusActiveTab() { tabStripEl.querySelector('.tab-item.active')?.focus(); }
function openTabMenu(t) {
  openMenu(`tab:${t.id}`, () => [
    { label: 'Close', fn: () => { closeMenu(); closeTab(t); } },
    { label: 'Close other tabs', fn: async () => { closeMenu(); await switchTab(t); tabs.closeOthers(t.id); render(); } },
    ...(tabs.canReopen ? [{ label: 'Reopen closed tab', fn: () => { closeMenu(); reopenTab(); } }] : []),
  ]);
}

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
    for (const n of renderMarkdown(content, { doc: document, noteExists: wikiExists, attach, embedNote, embedStack: [rel], ...noteRenderOptions(rel) })) el.append(n);
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
// ⌃Tab goes round the modes: Notes → Planner → Tasks → Draw.
function toggleMode() {
  if (state.contentView === 'planner') openTasks();
  else if (state.contentView === 'tasks') openDraw();
  else if (state.contentView === 'draw') openNotesMode();
  else openPlanner(new Date());
}
document.getElementById('mode-planner').addEventListener('click', () => { if (state.contentView !== 'planner') openPlanner(new Date()); });
document.getElementById('mode-notes').addEventListener('click', () => { if (state.contentView === 'planner' || state.contentView === 'tasks' || state.contentView === 'draw') openNotesMode(); });
document.getElementById('mode-tasks').addEventListener('click', () => { if (state.contentView !== 'tasks') openTasks(); });
document.getElementById('mode-draw').addEventListener('click', () => { if (state.contentView !== 'draw') openDraw(); });

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

// Board tasks with a due date, by day, for the Planner (lib/kanban.mjs
// dueTasks); boards in the templates folder are left out. Worked out again only
// when the vault's notes change.
let dueCache = { notes: null, byDay: new Map() };
function tasksDueOn(d) {
  if (dueCache.notes !== state.vaultNotes) {
    const byDay = new Map();
    for (const b of boardList()) {
      if (isTemplateNote(b.rel)) continue;
      for (const t of dueTasks(parseBoard(b.content))) {
        if (!byDay.has(t.due)) byDay.set(t.due, []);
        byDay.get(t.due).push({ ...t, rel: b.rel, board: b.title });
      }
    }
    dueCache = { notes: state.vaultNotes, byDay };
  }
  return dueCache.byDay.get(dayKey(d)) || [];
}

const plannerApi = {
  dayItems: (d) => getDayItems(d),
  dayEvents: (d) => (calApi ? eventsForDay(d) : []),
  dayTasks: (d) => tasksDueOn(d),
  // A board task in the Planner: its board, with the task open.
  openTask: (t) => { openTaskAfterRender(t.rel, t.ci, t.ki); openTasks(t.rel); },
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
    row.addEventListener('click', (e) => { if (e.target.closest('.menu-btn')) return; openTasks(b.rel); });
    sideRowMenu(row, `b:${b.rel}`, () => boardRowMenuItems(b));
    body.append(row);
  }
}

// --- Draw (src/draw.js): Excalidraw drawings, each a note ------------------
// In the Obsidian Excalidraw plugin's format (lib/drawing.mjs); new ones go to
// the Excalidraw folder.

const DRAWING_KEY = 'mufka-drawing';
function drawingList() {
  return state.vaultNotes.filter((n) => isDrawingRel(n.rel) || isDrawingText(n.content))
    .map((n) => ({ rel: n.rel, title: drawingTitle(n.rel) }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
async function openDraw(rel) {
  if (rel === undefined) {
    const list = drawingList();
    let last = null;
    try { last = localStorage.getItem(DRAWING_KEY); } catch { /* ignore */ }
    rel = (list.find((d) => d.rel === last) || list[0] || {}).rel || null;
  }
  let content = null;
  if (rel) {
    const res = await notesApi.read(rel);
    if (res && !res.error) content = res.content; else rel = null;
  }
  navVisit({ view: 'draw', rel });
  state.drawing = rel ? { rel, content } : null;
  state.contentView = 'draw';
  state.menu = null;
  if (rel) { try { localStorage.setItem(DRAWING_KEY, rel); } catch { /* ignore */ } }
  render();
}
// What the editor last wrote, so the change it causes on disk is not reloaded.
const ownDrawingWrites = new Set();
async function saveDrawing(rel, text) {
  ownDrawingWrites.add(text);
  if (ownDrawingWrites.size > 20) ownDrawingWrites.delete(ownDrawingWrites.values().next().value);
  if (state.drawing && state.drawing.rel === rel) state.drawing.content = text;
  const res = await notesApi.write(rel, text);
  if (res && res.error) showToast('Could not save the drawing');
  const vn = state.vaultNotes.find((n) => n.rel === rel);
  if (vn) vn.content = text;
}
async function reloadDrawing() {
  if (!state.drawing) return;
  if (!state.notesFlat.some((n) => n.rel === state.drawing.rel)) { state.drawing = null; render(); return; }
  const res = await notesApi.read(state.drawing.rel);
  if (!res || res.error || res.content === state.drawing.content || ownDrawingWrites.has(res.content)) return;
  state.drawing.content = res.content;
  drawingChanged(state.drawing.rel, res.content);
}
function newDrawing() {
  const folder = drawingFolder(null);
  askDialog({ heading: 'New drawing', text: `A drawing, saved as a note in ${folder}/ that Obsidian's Excalidraw plugin opens too.`, value: '', okLabel: 'Create' }, async (name) => {
    const res = await notesApi.create(folder, `${name.replace(/\.excalidraw(\.md)?$/i, '')}.excalidraw`);
    if (!res || !res.rel) { showToast('Could not create the drawing'); return; }
    await notesApi.write(res.rel, serializeDrawing(emptyScene(), ''));
    await refreshTree();
    await rebuildBacklinks();
    await openDraw(res.rel);
  });
}
function drawingMenu() {
  return [
    { label: 'New drawing…', run: () => newDrawing() },
    { label: 'Rename drawing…', run: () => {
      const d = state.drawing;
      if (!d) return;
      askDialog({ heading: 'Rename drawing', value: drawingTitle(d.rel), okLabel: 'Rename' }, async (name) => {
        closeDrawing();
        const res = await notesApi.rename(d.rel, `${name.replace(/\.excalidraw(\.md)?$/i, '')}.excalidraw`);
        if (!res || res.error) { showToast('Could not rename the drawing'); return; }
        await refreshTree(); await rebuildBacklinks();
        await openDraw(res.rel);
      });
    } },
    { label: 'Open as Markdown', run: () => { if (state.drawing) openNote(state.drawing.rel, 'oku', { keepTab: true, asText: true }); } },
    { label: 'Delete drawing…', run: () => {
      const d = state.drawing;
      if (!d) return;
      askDialog({ heading: `Delete ${drawingTitle(d.rel)}?`, text: 'The drawing goes to the Trash.', okLabel: 'Delete', danger: true }, async () => {
        closeDrawing();
        await notesApi.remove(d.rel);
        try { localStorage.removeItem(DRAWING_KEY); } catch { /* ignore */ }
        state.drawing = null;
        await refreshTree(); await rebuildBacklinks();
        await openDraw();
      });
    } },
  ];
}
// A drawing's images as files of their own (lib/drawing.mjs "Embedded Files"):
// read from the vault for the editor, and written to the drawing's
// attachments when one is added.
const drawingImages = {
  async load(rel, embedded) {
    const dir = folderOf(rel);
    const out = {};
    await Promise.all(Object.entries(embedded).map(async ([id, name]) => {
      const att = resolveAttachment(name, state.attachFiles, dir, attachmentsDirFor(state.layout, dir));
      if (!att.rel || !att.isImage) return;
      const img = await notesApi.attachReadImage(att.rel);
      if (img && !img.error) out[id] = { id, mimeType: img.mimeType, dataURL: img.dataURL, created: Date.now() };
    }));
    return out;
  },
  async store(rel, file, n) {
    const res = await notesApi.attachWriteImage(folderOf(rel), pastedImageName(new Date(), n, file.mimeType), file.dataURL);
    if (!res || res.error) { showToast(res && res.error ? res.error : 'Could not save the image'); return null; }
    await refreshAttachList();
    return res.name;
  },
};
function drawApi() {
  const d = state.drawing;
  return {
    images: drawingImages,
    rel: d ? d.rel : null,
    text: d ? d.content : '',
    folder: drawingFolder(null),
    save: saveDrawing,
    newDrawing,
    menu: drawingMenu(),
    openLink: (url) => {
      const wiki = /^\[\[([^\]]+)\]\]$/.exec(String(url).trim());
      if (wiki) openWiki(wiki[1]);
      else if (/^https?:\/\//i.test(url)) notesApi.openExternal(url);
      else openWiki(url);
    },
  };
}
// The sidebar's Drawings section: one row per drawing.
function renderDrawingsSection() {
  const body = sidebarSection('drawings', 'Drawings', [
    iconAction('plus', 'New drawing', () => newDrawing(), 'New drawing'),
  ], 'tiPenLine');
  if (!sectionOpen('drawings')) return;
  const list = drawingList();
  if (!list.length) {
    const empty = elem('div', 'side-empty');
    empty.append(document.createTextNode('No drawings yet. '), smallButton('New drawing', null, () => newDrawing()));
    body.append(empty);
    return;
  }
  for (const d of list) {
    const on = state.contentView === 'draw' && state.drawing && state.drawing.rel === d.rel;
    const row = elem('button', `board-row${on ? ' selected' : ''}`);
    row.type = 'button';
    row.title = d.rel;
    row.append(icon('tiPenLine', { size: 15 }), elem('span', 'board-name', d.title));
    if (on) row.setAttribute('aria-current', 'page');
    row.addEventListener('click', (e) => { if (e.target.closest('.menu-btn')) return; openDraw(d.rel); });
    sideRowMenu(row, `d:${d.rel}`, () => drawingMenuItems(d));
    body.append(row);
  }
}

function renderPaneTitle() {
  const planner = state.contentView === 'planner';
  const tasks = state.contentView === 'tasks';
  const draw = state.contentView === 'draw';
  document.getElementById('mode-planner').setAttribute('aria-pressed', String(planner));
  document.getElementById('mode-tasks').setAttribute('aria-pressed', String(tasks));
  document.getElementById('mode-draw').setAttribute('aria-pressed', String(draw));
  document.getElementById('mode-notes').setAttribute('aria-pressed', String(!planner && !tasks && !draw));
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
  else if (draw) {
    title = state.drawing ? drawingTitle(state.drawing.rel) : 'Draw';
    if (state.drawing) el.append(elem('span', 'pt-path', 'Draw / '));
    el.append(elem('span', 'pt-main', title));
  }
  else if (state.contentView === 'canvas' && state.canvas) {
    title = canvasTitleOf(state.canvas.rel);
    const folder = folderOf(state.canvas.rel);
    if (folder) el.append(elem('span', 'pt-path', `${folder.split('/').join(' / ')} / `));
    el.append(elem('span', 'pt-main', title));
  }
  else if (state.contentView === 'note' && state.openNote) {
    title = noteTitleOf(state.openNote);
    const folder = folderOf(state.openNote);
    if (folder) el.append(elem('span', 'pt-path', `${folder.split('/').join(' / ')} / `));
    el.append(elem('span', 'pt-main', title));
  } else if (state.contentView === 'base' && state.base) {
    title = baseTitleOf(state.base.rel);
    const folder = folderOf(state.base.rel);
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
  put('settings-btn', 'settings');
  const v = document.getElementById('vault-btn');
  const text = elem('span', 'vault-text');
  text.append(...v.childNodes);
  v.replaceChildren(icon('vault', { size: 17 }), text);
}
decorateStatic();

// Sidebar footer: the keyboard ways in, always visible.
document.getElementById('foot-open').addEventListener('click', () => openQuickSwitcher());
document.getElementById('settings-btn').addEventListener('click', () => openSettings());
document.getElementById('foot-commands').addEventListener('click', () => openCommandPalette());
document.getElementById('foot-keys').addEventListener('click', () => showShortcuts());

// Keyboard shortcuts cheat sheet (⌘/, Help menu, sidebar footer).
const SHORTCUTS = [
  ['Getting around', [['⌘O', 'Open a note (quick switcher)'], ['⌘P', 'Command palette'], ['⌘F', 'Find in this note'], ['⌥⌘F', 'Find and replace in this note'], ['⇧⌘F', 'Search all notes and plans'], ['⌘T', 'Home (today)'], ['⌘1', 'Planner (this week)'], ['⌘3', 'Tasks'], ['⌘4', 'Draw'], ['⌃Tab', 'Switch Notes / Planner / Tasks / Draw'], ['⌥⌘← / ⌥⌘→', 'Previous / next week in the Planner'], ['⌘2', 'Notes tree'], ['⌘G / ⇧⌘G', 'Graph / local graph'], ['⌘[ / ⌘]', 'Back / forward'], ['⌘-click', 'Open in a new tab'], ['⌥⌘-click', 'Open to the right'], ['⌥⌘T', 'New tab'], ['⌘W', 'Close tab'], ['⇧⌘[ / ⇧⌘]', 'Previous / next tab']]],
  ['Writing', [['⌘N', 'New note'], ['⌘E', 'Edit source / back to preview'], ['⇧⌘T', 'Insert template'], ['[[', 'Link a note (suggestions)'], ['#', 'Add a tag (suggestions)'], ['⌘Z / ⇧⌘Z', 'Undo / redo'], ['⌘.', 'Fold or unfold this heading'], ['⌥⌘[ / ⌥⌘]', 'Fold / unfold all headings']]],
  ['Window', [['⌘\\', 'Show / hide sidebar'], ['⇧⌘\\', 'Show / hide details (outline, links, tags)'], ['⌘/', 'This list'], ['⌘,', 'Settings']]],
];
function showShortcuts() {
  openPalette({
    id: 'shortcuts',
    placeholder: 'Keyboard shortcuts — type to filter',
    footer: 'esc close',
    items: (q) => [...SHORTCUTS, ['Your shortcuts', commandList(true).filter((c) => c.keys && c.keys !== (c.hint || '')).map((c) => [c.keys, c.label])]].flatMap(([group, rows]) => rows.map(([keys, what]) => ({ label: what, hint: keys, detail: group, run: () => {} })))
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
        else {
          // Another name of the note (its aliases), shown beside the title.
          const a = (n.aliases || []).map((al) => ({ al, m: fuzzyMatch(q, al) })).filter((x) => x.m).sort((x, y) => y.m.score - x.m.score)[0];
          if (a) scored.push({ n, score: a.m.score - 1, indices: null, alias: a.al });
        }
      }
      scored.sort((a, b) => b.score - a.score);
      return scored.map((x) => switcherRow(x.n, x.indices, x.alias));
    },
    empty: createRow,
    onShiftEnter: (q) => createNamedNote(q),
  });
}
function switcherRow(n, indices, alias) {
  const where = n.folder ? n.folder.split('/').join(' / ') : '';
  return { label: alias ? `${alias} → ${n.title}` : n.title, indices, detail: where, run: () => openNote(n.rel, 'oku', { keepTab: true }) };
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
// all: also the ones that need what is not there now (Settings → Shortcuts).
function commandList(all = false) {
  const noteOpen = () => state.contentView === 'note' && Boolean(state.openNote);
  const saveOpen = () => saveOpenNote();
  return [
    { label: 'Open quick switcher', hint: '⌘O', run: openQuickSwitcher },
    { label: 'Show keyboard shortcuts', hint: '⌘/', run: showShortcuts },
    { label: 'Create new note', hint: '⌘N', run: newNote },
    { label: 'Create new folder', run: newFolder },
    { label: 'Open the week planner', hint: '⌘1', run: () => openPlanner(new Date()) },
    ...(voice.handy ? [{ id: 'dictate', label: voice.dictating ? 'Stop dictating' : 'Dictate with Handy', hint: '⇧⌘D', when: noteOpen, run: () => toggleDictation() }] : []),
    ...(voice.handy || voice.studio ? [{ label: 'New note from audio…', run: () => openVoiceNote() }] : []),
    { label: 'New plan', hint: '⇧⌘P', run: () => plannerApi.newPlan(new Date()) },
    { label: 'Open tasks', hint: '⌘3', run: () => openTasks() },
    { label: 'New task board', run: () => newTaskBoard() },
    ...boardList().map((b) => ({ label: `Open board: ${b.title}`, run: () => openTasks(b.rel) })),
    { label: 'Open draw', hint: '⌘4', run: () => openDraw() },
    { label: 'New drawing', run: () => newDrawing() },
    { label: 'New canvas', run: () => newCanvas() },
    { label: 'Clip web page…', run: () => openClipper() },
    ...drawingList().map((d) => ({ label: `Open drawing: ${d.title}`, run: () => openDraw(d.rel) })),
    { label: 'Open graph view', hint: '⌘G', run: () => openGraph() },
    { label: 'Open local graph', hint: '⇧⌘G', when: noteOpen, run: () => openGraph({ local: true }) },
    { label: 'Open random note', run: openRandomNote },
    { label: 'Bookmark / unbookmark current note', when: noteOpen, run: () => toggleBookmark(state.openNote) },
    { label: 'Navigate back', hint: '⌘[', run: () => goNav(-1) },
    { label: 'Navigate forward', hint: '⌘]', run: () => goNav(1) },
    { label: 'Go home (today)', hint: '⌘T', run: goToday },
    { label: 'Show calendar', hint: '⌘1', run: () => setTab('takvim') },
    { label: 'Show notes', hint: '⌘2', run: () => setTab('notlar') },
    { label: 'Search plans and notes', hint: '⇧⌘F', run: () => setTab('ara') },
    { label: 'Toggle sidebar', hint: '⌘\\', run: toggleSidebar },
    { label: 'Toggle right sidebar', hint: '⇧⌘\\', run: () => toggleRightbar() },
    { label: 'Show outline', run: () => { state.rightbar.tab = 'outline'; toggleRightbar(true); } },
    { label: 'Show tags', run: () => { state.rightbar.tab = 'tags'; toggleRightbar(true); } },
    { label: 'Toggle source / preview', hint: '⌘E', when: noteOpen, run: toggleNoteView },
    { label: 'Copy note as Markdown', when: noteOpen, run: async () => { await notesApi.copy(state.noteContent); showToast('Copied'); } },
    { label: 'Attach file to note', when: noteOpen, run: addFileToNote },
    { label: 'Open settings', hint: '⌘,', run: openSettings },
    { label: 'Refresh calendars', when: () => calConnected, run: refreshCalendars },
    { label: 'Connect Wispr Flow', run: () => openSettings('voice') },
    { label: 'Insert template', hint: '⇧⌘T', when: noteOpen, run: openTemplatePicker },
    { label: 'New note from template', run: () => newFromTemplate() },
    { label: 'Copy built-in templates to the Templates folder', run: copyBuiltinTemplates },
    { label: 'Export note as PDF', when: noteOpen, run: () => runExport('pdf', noteTitleOf(state.openNote), () => state.noteContent, saveOpen) },
    { label: 'Export note as Markdown', when: noteOpen, run: () => runExport('md', noteTitleOf(state.openNote), () => state.noteContent, saveOpen) },
    { label: 'Find in this note', hint: '⌘F', when: noteOpen, run: () => findBar.open() },
    { label: 'Find and replace in this note', hint: '⌥⌘F', when: noteOpen, run: () => findBar.open({ replace: true }) },
    { label: 'Version history of this note', when: noteOpen, run: () => openNoteHistory() },
    { label: 'New tab', hint: '⌥⌘T', run: () => newNoteTab() },
    { label: 'Theme: light', run: () => setTheme('light') },
    { label: 'Theme: dark', run: () => setTheme('dark') },
    { label: 'Theme: follow the system', run: () => setTheme('system') },
    { label: 'Open this note to the right', when: noteOpen, run: () => openSplit(state.openNote) },
    { label: 'Fold all headings', hint: '⌥⌘[', when: () => noteOpen() && state.noteView === 'blocks', run: () => foldAll('note', true) },
    { label: 'Unfold all headings', hint: '⌥⌘]', when: () => noteOpen() && state.noteView === 'blocks', run: () => foldAll('note', false) },
    { label: 'Fold or unfold this heading', hint: '⌘.', when: () => noteOpen() && state.noteView === 'blocks', run: () => toggleFoldHere('note') },
    { label: 'Add property to this note', hint: '⌘;', when: () => noteOpen() && state.noteView === 'blocks', run: () => startAddProperty('note') },
    { label: 'Swap the two panes', when: () => !!split, run: () => swapSplit() },
    { label: 'Close the right pane', when: () => !!split, run: () => closeSplit() },
    { label: 'Close tab', hint: '⌘W', when: () => tabs.count > 1, run: () => closeTab() },
    { label: 'Close other tabs', when: () => tabs.count > 1, run: () => { tabs.closeOthers(tabs.active.id); render(); } },
    { label: 'Reopen closed tab', when: () => tabs.canReopen, run: reopenTab },
    { label: 'Next tab', hint: '⇧⌘]', when: () => tabs.count > 1, run: () => switchTab(tabs.neighbour(1)) },
    { label: 'Previous tab', hint: '⇧⌘[', when: () => tabs.count > 1, run: () => switchTab(tabs.neighbour(-1)) },
    { label: 'Recover deleted notes', run: openDeletedRecovery },
    { label: 'Show unused attachments', run: showUnusedAttachments },
    { label: `Show notes folder in ${FILES_APP}`, run: () => notesApi.reveal() },
  ].filter((c) => all || !c.when || c.when()).map((c) => ({ ...c, keys: keyOf(c, hotkeys) }));
}
function openCommandPalette() {
  openPalette({
    id: 'commands',
    placeholder: 'Type a command…',
    footer: '↑↓ navigate · ↵ run · esc close',
    items: (q) => fuzzyFilter(q, commandList(), (c) => c.label)
      .map(({ item, indices }) => ({ label: item.label, hint: item.keys, indices, run: item.run })),
  });
}

// Open Search with a query (e.g. a #tag clicked in a note or the graph).
function searchFor(q) {
  state.araQuery = q;
  setTab('ara');
  ensureNoteCache();
}

function hint(text) { const d = document.createElement('div'); d.className = 'ara-empty'; d.textContent = text; return d; }

// --- Takvim sidebar: mini month + selected-day timed plans ---


function goToday() { selectDay(new Date()); }

async function selectDay(date, opts = {}) {
  navVisit({ view: 'day', key: dayKey(date) });
  state.selectedDate = date;
  state.calCursor = new Date(date.getFullYear(), date.getMonth(), 1);
  state.contentView = 'day';
  state.menu = null;
  state.dailyDeleteConfirm = false;
  state.blockEdit = null;
  const key = dayKey(date);
  const res = await notesApi.readDaily(key);
  const text = res && !res.error ? res.content : null;
  state.dailyNote = { key, content: text, disk: text };
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
  // Tasks from the boards (Tasks): due this day; today also late and in progress.
  const tasks = withTicked(homeTasks(date), date);
  if (tasks.length) col.append(section('Tasks', tasks.map((t, i) => homeTaskRow(t, date, i))));

  // The day's part of this week's to-do and habit tracker notes.
  for (const sec of todayFromWeekNotes(date)) col.append(sec);

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
// The board tasks a day's page lists (lib/kanban.mjs dayTasks): late ones
// first, then due that day, then in progress; by priority within each.
const WHY_ORDER = { late: 0, due: 1, doing: 2 };
function homeTasks(date) {
  const key = dayKey(date);
  const today = isToday(date);
  const out = [];
  for (const b of boardList()) {
    if (isTemplateNote(b.rel)) continue;
    for (const t of dayTasks(parseBoard(b.content), key, today)) out.push({ ...t, rel: b.rel, board: b.title });
  }
  const prio = (t) => (t.priority ? Number(t.priority.slice(1)) : 9);
  return out.sort((a, b) => WHY_ORDER[a.why] - WHY_ORDER[b.why] || prio(a) - prio(b));
}
// A board task on the day's page: its box marks it done (completeHomeTask)
// or, once done, open again; a click on the rest opens it on its board.
function homeTaskRow(t, date, pos) {
  const li = elem('li', `plan-row agenda-row home-task${t.done ? ' done' : t.why === 'late' ? ' late' : ''}`);
  const box = elem('button', 'home-task-box');
  box.type = 'button';
  box.setAttribute('role', 'checkbox');
  box.setAttribute('aria-checked', t.done ? 'true' : 'false');
  box.setAttribute('aria-label', `Done: ${t.title}`);
  box.title = t.done ? 'Not done (moves it back)' : 'Done (moves it to Done)';
  if (t.done) box.append(icon('check', { size: 11 }));
  box.addEventListener('click', () => (t.done ? reopenHomeTask(t) : completeHomeTask(t, date, pos)));
  li.append(box);
  const open = elem('button', 'agenda-open');
  open.type = 'button';
  open.title = `Open on the board ${t.board}`;
  open.append(elem('span', 'plan-title', t.title));
  const tags = elem('span', 'home-task-tags');
  if (t.priority) tags.append(elem('span', `tk-prio ${t.priority.toLowerCase()}`, t.priority));
  if (t.done) { /* done: no Late / In progress */ } else if (t.why === 'late') tags.append(elem('span', 'home-task-why late', `Late · ${prettyDue(t.due)}`));
  else if (t.why === 'doing') tags.append(elem('span', 'home-task-why', 'In progress'));
  tags.append(elem('span', 'home-task-board', t.board));
  open.append(tags);
  open.addEventListener('click', () => (t.done ? openTasks(t.rel) : plannerApi.openTask(t)));
  li.append(open);
  return li;
}

// Write a board's text from outside the Tasks view (Home, ⌘Z there).
function setBoardText(rel, text) {
  const vn = state.vaultNotes.find((n) => n.rel === rel);
  if (vn) vn.content = text;
  if (state.board && state.board.rel === rel) state.board.content = text;
  dueCache.notes = null;
  ownBoardWrites.add(text);
  boardSaveChain = boardSaveChain.then(() => notesApi.write(rel, text))
    .catch((e) => { console.error('board save failed', e); showToast('Could not save the board'); })
    .finally(() => setTimeout(() => ownBoardWrites.delete(text), 4000));
}
// Tasks ticked on Home stay there, done, where they were, so they can be
// unticked: { ...task, done: true, day, pos, col, ki } (col and ki: where it
// was on its board). Only while Mufka runs.
let homeTicked = [];
function withTicked(open, date) {
  const key = dayKey(date);
  const isOpen = (x) => open.some((t) => t.rel === x.rel && t.title === x.title);
  homeTicked = homeTicked.filter((x) => !isOpen(x)); // open again (⌘Z, the board)
  const out = [...open];
  for (const x of homeTicked.filter((x) => x.day === key).sort((a, b) => a.pos - b.pos)) out.splice(Math.min(x.pos, out.length), 0, x);
  return out;
}
// Ticked on Home: the task goes to its board's Done column; ⌘Z puts it back.
async function completeHomeTask(t, date, pos) {
  const res = await notesApi.read(t.rel);
  if (!res || res.error) { showToast('Could not open the board'); return; }
  const board = parseBoard(res.content);
  const at = findOpenTask(board, t);
  const next = at && completeTask(board, t);
  if (!next) { showToast('The task has changed on its board'); render(); return; }
  const entry = { ...t, done: true, day: dayKey(date), pos, col: board.columns[at.ci].title, ki: at.ki };
  homeTicked.push(entry);
  pushUndo({ type: 'board', rel: t.rel, content: res.content, tick: 'add', entry });
  setBoardText(t.rel, serializeBoard(next));
  render();
  showToast(K(`Done: ${t.title} · ⌘Z undoes`));
}
// Unticked on Home: back to the column it came from.
async function reopenHomeTask(entry) {
  const res = await notesApi.read(entry.rel);
  if (!res || res.error) { showToast('Could not open the board'); return; }
  const next = reopenTask(parseBoard(res.content), entry);
  homeTicked = homeTicked.filter((x) => x !== entry);
  if (!next) { showToast('The task has changed on its board'); render(); return; }
  pushUndo({ type: 'board', rel: entry.rel, content: res.content, tick: 'remove', entry });
  setBoardText(entry.rel, serializeBoard(next));
  render();
  showToast(K(`Not done: ${entry.title} · ⌘Z undoes`));
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

// How the day felt: mood: in the daily note's properties, one click to set
// (again to clear).
const MOODS = [['😞', 'Bad'], ['🙁', 'Low'], ['😐', 'Okay'], ['🙂', 'Good'], ['😄', 'Great']];
function moodPicker(key, src) {
  const r = readProps(src);
  const p = r.props && r.props.find((x) => String(x.key).toLowerCase() === 'mood');
  const now = p && p.value != null ? String(p.value).trim() : '';
  const box = elem('div', 'mood-picker');
  box.setAttribute('role', 'radiogroup'); box.setAttribute('aria-label', 'Mood');
  for (const [e, label] of MOODS) {
    const b = elem('button', `mood${now === e ? ' on' : ''}`, e); b.type = 'button';
    b.title = label; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(now === e)); b.setAttribute('aria-label', label);
    b.addEventListener('click', () => changeNoteText(dailyRel(key), (text) => (now === e ? deleteProp(text, 'mood') : setProp(text, 'mood', e))));
    box.append(b);
  }
  return box;
}

// --- the day page's view of the week's notes ---
// This week's weekly to-do and habit tracker notes, when there are such:
// the day's tasks to tick and add to, and its habits to tick.
function weekNoteFor(date, blockRe) {
  const wk = weekKey(date);
  return vaultItems((t) => blockRe.test(t), (rel, text) => (habitWeek(readProps(text).props, noteTitleOf(rel)) === wk ? { rel, text } : null))[0] || null;
}
function sectionWithLink(title, rel, rows) {
  const s = elem('section', 'section today-from');
  const head = elem('div', 'section-head');
  head.append(elem('h2', 'section-title', title));
  const open = elem('button', 'btn quiet today-open', noteTitleOf(rel)); open.type = 'button';
  open.title = 'Open the note';
  open.addEventListener('click', () => openNote(rel));
  const acts = elem('div', 'head-actions'); acts.append(open);
  head.append(acts);
  s.append(head);
  const list = elem('ul', 'plan-list');
  for (const r of rows) list.append(r);
  s.append(list);
  return s;
}
const todayDraft = { value: '', focused: false };
function todayFromWeekNotes(date) {
  const out = [];
  const day = (date.getDay() + 6) % 7;
  const todo = weekNoteFor(date, WEEK_BLOCK);
  const d = todo && weekDays(todo.text).find((x) => x.day === day);
  if (d) {
    const rows = d.tasks.map((t) => {
      const li = elem('li', `plan-row agenda-row today-task${t.done ? ' done' : ''}`);
      const check = document.createElement('input');
      check.type = 'checkbox'; check.className = 'check'; check.checked = t.done;
      check.setAttribute('aria-label', `Done: ${t.text}`);
      check.addEventListener('change', () => changeNoteText(todo.rel, (text) => toggleTaskLine(text, t.line)));
      li.append(check, elem('span', 'plan-title', t.text));
      return li;
    });
    const add = elem('li', 'plan-row today-add');
    const input = document.createElement('input');
    input.className = 'today-add-input'; input.placeholder = '+ Add a task for today';
    input.setAttribute('aria-label', 'Add a task for today to the weekly to-do');
    // What is typed survives the page being drawn again (a save, a sync).
    input.value = todayDraft.value;
    input.addEventListener('input', () => { todayDraft.value = input.value; });
    input.addEventListener('focus', () => { todayDraft.focused = true; });
    input.addEventListener('blur', () => setTimeout(() => { if (input.isConnected) todayDraft.focused = false; }, 0));
    if (todayDraft.focused) queueMicrotask(() => { if (input.isConnected) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); } });
    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter' || !input.value.trim()) return;
      e.preventDefault();
      const v = input.value; input.value = ''; todayDraft.value = '';
      todayDraft.focused = true;
      await changeNoteText(todo.rel, (text) => addWeekTask(text, day, v));
    });
    add.append(input);
    rows.push(add);
    out.push(sectionWithLink("This week's to-do", todo.rel, rows));
  }
  const hab = weekNoteFor(date, HABITS_BLOCK);
  const t = hab && habitTable(hab.text);
  if (t && t.rows.length && t.dayCols[day] !== -1) {
    const rows = t.rows.map((r) => {
      const li = elem('li', 'plan-row today-habit');
      const done = r.days[day];
      const b = elem('button', `hab-cell${done ? ' done' : ''}`); b.type = 'button';
      b.setAttribute('aria-pressed', String(Boolean(done))); b.setAttribute('aria-label', `${r.name}, today`);
      b.addEventListener('click', () => changeNoteText(hab.rel, (text) => toggleHabit(text, r.line, day)));
      const n = r.days.filter(Boolean).length;
      li.append(b, elem('span', 'plan-title', r.name), elem('span', `today-habit-count${n >= r.goal ? ' met' : ''}`, `${n}/${r.goal} this week`));
      return li;
    });
    out.push(sectionWithLink('Habits', hab.rel, rows));
  }
  return out;
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

// Title + "Saatli" + start/end controls of the plan dialog. idPrefix keeps
// element ids stable/unique.
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

// --- generic "⋯" menu (top-level layer, never clipped). anchorKey matches a
// [data-menu-anchor]; buildItems() returns [{ label, fn }]. ---

const menuLayer = document.getElementById('menu-layer');

// align: 'right' (the menu's right edge under the anchor's) or 'left'.
// at: { x, y } opens it where the pointer is (a right-click) instead of under
// the anchor.
function openMenu(anchorKey, buildItems, { align = 'right', at = null } = {}) { state.menu = { anchorKey, buildItems, align, at }; renderMenu(); }
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
  const at = state.menu.at;
  const anchor = at ? null : document.querySelector(`[data-menu-anchor="${CSS.escape(state.menu.anchorKey)}"]`);
  if (!anchor && !at) { state.menu = null; return; }

  const backdrop = elem('div', 'menu-backdrop');
  backdrop.addEventListener('mousedown', (e) => { e.preventDefault(); closeMenu(); });
  menuLayer.append(backdrop);

  const menu = elem('div', 'row-menu'); menu.setAttribute('role', 'menu');
  // { sep: true } draws a line between groups (none at the ends or twice);
  // danger: true shows the item in red.
  const built = state.menu.buildItems().filter((it, i, all) => !it.sep || (i > 0 && i < all.length - 1 && !all[i - 1].sep));
  const items = built.map((it) => {
    if (it.sep) { const d = elem('div', 'menu-sep'); d.setAttribute('role', 'separator'); return d; }
    const b = it.el || menuItem(it.label, it.fn);
    if (it.danger) b.classList.add('danger');
    return b;
  });
  menu.addEventListener('keydown', (e) => {
    const list = [...menu.querySelectorAll('.menu-item')];
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
  });
  items.forEach((it) => menu.append(it));
  menuLayer.append(menu);

  // Position below the button (or at the pointer), right-aligned, inside the
  // viewport: above when it does not fit below, else as low as it fits.
  const r = at ? { left: at.x, right: at.x, top: at.y, bottom: at.y } : anchor.getBoundingClientRect();
  const mw = menu.offsetWidth; const mh = menu.offsetHeight;
  let top = r.bottom + 4;
  if (top + mh > window.innerHeight - 8) top = r.top - mh - 4 >= 8 ? r.top - mh - 4 : Math.max(8, window.innerHeight - mh - 8);
  top = Math.max(8, top);
  let left = state.menu.align === 'left' ? r.left : r.right - mw; if (left < 8) left = 8; if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
  menu.style.top = `${top}px`; menu.style.left = `${left}px`;
  (menu.querySelector('.menu-item, .swatch.on, .swatch, .icon-choice.on, .icon-choice, .cover-choice.on') || menu.querySelector('button, input'))?.focus();
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
      await saveDaily(key, text);
      state.dailyNote = { key, content: text, disk: text };
      state.dailyDates.add(key);
      histReset('daily');
      state.blockEdit = text ? null : { scope: 'daily', newAfter: -1, caret: 0 };
      render();
    });
    actions.append(add);
    // No daily template in the vault's settings: offer Mufka's (or the
    // vault's copy of it).
    if (!state.layout.dailyTemplate) {
      const tpl = elem('button', 'btn quiet daily-from-template', 'From template');
      tpl.title = 'Start the day from the Daily note template';
      tpl.addEventListener('click', async () => {
        const choice = allTemplates().find((c) => c.name.toLowerCase() === 'daily note');
        const day = parseDayKey(key); const now = new Date();
        day.setHours(now.getHours(), now.getMinutes());
        const text = choice ? fillTemplate(await templateText(choice), key, day) : '';
        await saveDaily(key, text);
        state.dailyNote = { key, content: text, disk: text };
        state.dailyDates.add(key);
        histReset('daily');
        render();
      });
      actions.append(tpl);
    }
    return s;
  }
  header.insertBefore(moodPicker(key, state.dailyNote.content || ''), actions);

  // Several sections share the day page, so the daily note keeps its copy icon
  // and "⋯" menu on its own label line (right-aligned to the text column).
  const getSrc = () => state.dailyNote.content || '';
  const dailyDelete = async () => {
    await notesApi.deleteDaily(key);
    state.dailyNote = { key, content: null, disk: null };
    state.dailyDates.delete(key);
    state.blockEdit = null;
    render();
  };
  actions.append(
    copyIconButton(getSrc),
    menuIconButton('menu-daily', () => [
      { label: 'Export…', fn: () => openMenu('menu-daily', () => exportSubItems(key, getSrc, () => saveDaily(key, getSrc()))) },
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
    { label: 'Open to the right', fn: () => { closeMenu(); openSplit(state.openNote); } },
    { label: 'Add property', fn: () => { closeMenu(); startAddProperty('note'); } },
    ...(state.noteView === 'blocks' ? [{ label: 'Fold all headings', fn: () => { closeMenu(); foldAll('note', true); } }, { label: 'Unfold all headings', fn: () => { closeMenu(); foldAll('note', false); } }] : []),
    { label: 'Version history…', fn: () => { closeMenu(); openNoteHistory(); } },
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

// The note as the app draws it — Dataview results, diagrams and drawings
// included — once the parts that are drawn later (scripts, Mermaid, drawings)
// have arrived. The PDF prints this instead of re-rendering the plain text.
async function renderedForExport(src, scope) {
  const rel = scope === 'note' ? state.openNote : (state.dailyNote.key ? dailyRel(state.dailyNote.key) : '');
  const box = document.createElement('div');
  for (const n of renderMarkdown(src, { doc: document, noteExists: wikiExists, attach: attachResolverFor(scope), embedNote, ...noteRenderOptions(rel) })) box.append(n);
  const pending = () => box.querySelector('.dv-js > .dv-empty, .mermaid-box > .dv-empty, .draw-embed > .dv-empty');
  for (const t0 = Date.now(); pending() && Date.now() - t0 < 20000;) await new Promise((r) => setTimeout(r, 100));
  return box.innerHTML;
}

async function runExport(kind, title, getSrc, saveUnsaved) {
  try {
    if (saveUnsaved) await saveUnsaved();
    const scope = state.contentView === 'note' ? 'note' : 'daily';
    const res = kind === 'pdf'
      ? await notesApi.exportPDF(title, getSrc(), attachDirFor(scope), await renderedForExport(getSrc(), scope))
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

// ![[Sketch.excalidraw]]: the drawing as an image; a click opens it in Draw.
function embedDrawing(target) {
  const rel = resolveLink(target, state.openNote || '', state.notesFlat) || resolveLink(`${target}.md`, state.openNote || '', state.notesFlat);
  if (!rel) return null;
  const known = (state.vaultNotes.find((n) => n.rel === rel) || {}).content ?? state.noteCache.get(rel);
  if (known == null) return null;
  return drawingPreview(known, () => openDraw(rel), drawingImages, rel);
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

// --- Dataview (src/dataview-view.js) ---
// The vault as Dataview sees it: every note, with the open note's and day's
// unsaved text. The same array comes back while nothing changed, so the index
// is not rebuilt on every block render.
let dvNotes = { base: null, key: '', list: [] };
function dataviewNotes() {
  const day = state.dailyNote.key ? dailyRel(state.dailyNote.key) : null;
  const key = `${state.openNote}\u0000${state.noteContent}\u0000${day}\u0000${state.dailyNote.content}`;
  if (dvNotes.base === state.vaultNotes && dvNotes.key === key) return dvNotes.list;
  const list = state.vaultNotes.map((n) => {
    if (state.openNote && n.rel === state.openNote && state.noteContent != null) return { ...n, content: state.noteContent };
    if (day && n.rel === day && state.dailyNote.content != null) return { ...n, content: state.dailyNote.content };
    return n;
  });
  dvNotes = { base: state.vaultNotes, key, list };
  return list;
}

// Inline Markdown for Dataview values: one paragraph's contents, no block wrapper.
function dataviewInline(src) {
  const nodes = renderMarkdown(src, { doc: document, noteExists: wikiExists, attach: (raw) => resolveAttachment(raw, state.attachFiles, '', attachmentsDirFor(state.layout, '')) });
  if (nodes.length === 1 && nodes[0].tagName === 'P') return [...nodes[0].childNodes];
  return nodes;
}

function dataviewBlocks(src) {
  return renderMarkdown(src, { doc: document, noteExists: wikiExists, attach: (raw) => resolveAttachment(raw, state.attachFiles, '', attachmentsDirFor(state.layout, '')) });
}

// Links and boxes in dataviewjs output, which arrives after the note mounted.
function wireDataviewContent(box) {
  box.querySelectorAll('a[data-wiki]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation(); hidePreview(); openWiki(a.getAttribute('data-wiki'), a.getAttribute('data-heading'));
  }));
  box.querySelectorAll('a[data-external]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); notesApi.openExternal(a.getAttribute('href')); }));
  box.querySelectorAll('.tag[data-tag]').forEach((t) => t.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); searchFor(`#${t.getAttribute('data-tag')}`); }));
  wireDataview(box);
}

const dataview = createDataview({
  getNotes: dataviewNotes,
  md: dataviewInline,
  mdBlock: dataviewBlocks,
  runJs: (payload) => notesApi.runDataviewJs(payload),
  wire: wireDataviewContent,
});

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const mermaid = createMermaid({ render: (code) => notesApi.renderMermaid(code), theme: () => (darkQuery.matches ? 'dark' : 'light') });
// Appearance changed (Settings, or the system's while following it): redraw
// what has colours of its own — diagrams, drawings' previews, the right pane.
darkQuery.addEventListener('change', () => { splitShown = null; if (!isEditing()) render(); });

// What renderMarkdown needs for a note at `rel` beyond the basics: Dataview
// blocks and inline queries, and Mermaid diagrams.
function noteRenderOptions(rel) {
  const dv = dataview.optionsFor(rel);
  return {
    ...dv,
    blocks: {
      ...dv.blocks,
      mermaid: (src) => mermaid.block(src),
      budget: (code, _meta, { src }) => budgetCard(src, code, { onAdd: rel ? (kind) => addBudgetEntry(rel, kind) : null, nav: rel ? budgetNav(rel, src) : null }),
      habits: (_code, _meta, { src }) => habitsCard(src, { today: habitToday(rel, src), nav: rel ? habitNav(rel, src) : null, onAdd: rel ? () => addHabitEntry(rel) : null }),
      jobs: (code, _meta, { src }) => jobsBlock(rel, code, src),
      week: (_code, _meta, { src }) => weekBlock(rel, src),
      projects: (code) => projectsBlock(rel, code),
      books: (code) => booksBlock(rel, code),
      movies: (code) => moviesBlock(rel, code),
      base: (code) => baseBlock(rel, code),
      tasks: (code) => tasksQueryBlock(code),
    },
    embedDrawing,
    embedBase: (target, view) => embedBase(target, view, rel),
  };
}

// --- Obsidian Bases (lib/bases, src/bases-view.js) ---
// A .base file opens as its views; ```base blocks and ![[X.base]] embeds draw
// one in a note. The vault is Dataview's index; a base's text is read when
// the tree is.
const isBaseRel = (rel) => /\.base$/i.test(String(rel || ''));
const baseTitleOf = (rel) => leafOf(rel).replace(/\.base$/i, '');
async function loadBaseTexts() {
  let changed = false;
  const known = new Set(state.treeBases.map((b) => b.rel));
  for (const rel of [...state.baseTexts.keys()]) if (!known.has(rel)) { state.baseTexts.delete(rel); changed = true; }
  for (const b of state.treeBases) {
    const had = state.baseTexts.get(b.rel);
    if (had && had.mtime === b.mtime) continue;
    const res = await notesApi.read(b.rel);
    if (!res || res.error) continue;
    state.baseTexts.set(b.rel, { mtime: b.mtime, text: res.content });
    changed = true;
  }
  if (changed && !isEditing()) render();
}
async function openBase(rel) {
  flushActiveEditor();
  if (!state.baseTexts.has(rel)) {
    const res = await notesApi.read(rel);
    if (!res || res.error) { showToast('Could not open the base'); return; }
    state.baseTexts.set(rel, { mtime: 0, text: res.content });
  }
  navVisit({ view: 'base', rel });
  state.base = { rel, view: baseViews.get(rel) ?? 0 };
  state.contentView = 'base';
  state.selectedFolder = null;
  expandAncestors(rel);
  render();
}
const baseViews = new Map(); // which view a base or a ```base block shows
// Opening from a base: a note (⌘-click: a new tab) or a link's target.
function openFromBase(rel, e) {
  if (e && (e.metaKey || e.ctrlKey)) openNoteInNewTab(rel);
  else openNote(rel, 'oku');
}
// An image in a card: a path or a file name, from the note's folder.
function baseImageUrl(path, fromRel) {
  if (/^https?:\/\//i.test(path)) return path;
  const dir = folderOf(fromRel || '');
  const att = resolveAttachment(path, state.attachFiles, dir, attachmentsDirFor(state.layout, dir));
  return att.url && att.isImage ? att.url : '';
}
function baseOptions({ key, thisRel, config, viewIndex, folder, embedded, onOpenBase }) {
  return {
    embedded,
    onView: (i) => { baseViews.set(key, i); if (state.base && state.base.rel === key) state.base.view = i; render(); },
    onOpen: openFromBase,
    onExternal: (url) => notesApi.openExternal(url),
    imageUrl: baseImageUrl,
    onEdit: async (rel, prop, old, input) => {
      const value = typeof input === 'boolean' ? input : cellInput(old, input);
      await changeNoteText(rel, (text) => setProp(text, prop, value));
      render();
    },
    onCancel: () => render(),
    onNew: config ? async () => {
      const { folder: dest, props } = newNoteDefaults(config, viewIndex, folder);
      const res = await notesApi.create(dest, 'Untitled');
      if (!res || !res.rel) { showToast('Could not create the note'); return; }
      if (props.length) await notesApi.write(res.rel, props.reduce((t, [k, v]) => setProp(t, k, v), ''));
      await refreshTree();
      await rebuildBacklinks();
      await openNote(res.rel, 'duzenle');
      startRenameNote();
    } : null,
    onOpenBase,
  };
}
function runBaseText(text, which, thisRel) {
  return runBase(text, which, dataview.index(), { thisRel });
}
function renderBasePage() {
  const { rel } = state.base;
  const entry = state.baseTexts.get(rel);
  const pane = elem('div', 'note-pane base-pane');
  const head = elem('div', 'note-head');
  head.append(elem('h1', 'note-title', baseTitleOf(rel)));
  pane.append(head);
  const res = runBaseText(entry ? entry.text : '', state.base.view, rel);
  pane.append(baseView(res, baseOptions({ key: rel, thisRel: rel, config: res.config, viewIndex: res.viewIndex, folder: folderOf(rel), embedded: false })));
  contentEl.append(pane);
}
// ```base in a note: the base written in place, about that note (`this`).
function baseBlock(rel, code) {
  const key = `${rel}\u0000${code}`;
  const res = runBaseText(code, baseViews.get(key) ?? 0, rel || '');
  return baseView(res, baseOptions({ key, thisRel: rel, config: res.config, viewIndex: res.viewIndex, folder: folderOf(rel || ''), embedded: false }));
}
// ![[Books.base]] or ![[Books.base#View]]: that view of the file.
function embedBase(target, view, rel) {
  const b = resolveBaseTarget(target, rel);
  if (!b) return null;
  const entry = state.baseTexts.get(b);
  if (!entry) return null;
  const res = runBaseText(entry.text, view || null, rel || '');
  const box = baseView(res, baseOptions({ key: b, thisRel: rel, config: res.config, viewIndex: res.viewIndex, folder: folderOf(b), embedded: true, onOpenBase: () => openBase(b) }));
  box.classList.add('embed');
  return box;
}
// A base named in a link: its path, its name, or its name from the folder of `fromRel`.
function resolveBaseTarget(target, fromRel) {
  const t = String(target || '').replace(/^\/+/, '');
  const name = /\.base$/i.test(t) ? t : `${t}.base`;
  const list = state.treeBases.map((b) => b.rel);
  if (list.includes(name)) return name;
  const local = fromRel ? `${folderOf(fromRel) ? `${folderOf(fromRel)}/` : ''}${name}` : null;
  if (local && list.includes(local)) return local;
  return list.find((r) => leafOf(r).toLowerCase() === leafOf(name).toLowerCase()) || null;
}
// A base in the tree: its own icon; a click opens its views.
function baseRow(n, depth) {
  const row = elem('div', 'tree-row note-row base-row' + (state.contentView === 'base' && state.base && state.base.rel === n.rel ? ' selected' : ''));
  row.style.paddingLeft = `${8 + depth * 16 + 16}px`;
  row.tabIndex = 0; row.dataset.rel = n.rel; row.dataset.type = 'base';
  const color = rowColor(n.rel, 'note', state.treeStyles);
  if (color) row.style.setProperty('--row-c', color);
  row.append(treeIcon(n.rel, 'template'));
  row.append(elem('span', 'tree-name', baseTitleOf(n.rel)));
  row.addEventListener('click', (e) => { if (e.target.closest('.menu-btn')) return; openBase(n.rel); });
  const items = () => [
    { label: 'Open in new tab', fn: () => { closeMenu(); newTab({ view: 'base', rel: n.rel }); } },
    SEP,
    ...copyItems(n.rel, [{ label: 'Copy embed', fn: () => { closeMenu(); copyText(`![[${leafOf(n.rel)}]]`, 'the embed'); } }]),
    SEP,
    revealItem(n.rel),
  ];
  addMenuBtn(row, `b:${n.rel}`, items);
  onRightClick(row, `b:${n.rel}`, items);
  return row;
}

// --- Tasks queries (lib/tasks-query.mjs, src/tasks-view.js) ---
// A ```tasks block lists the vault's tasks, as the Obsidian Tasks plugin
// does; the tasks are read again only when the vault (or the open note) changed.
let vaultTasks = { notes: null, list: [] };
function allTasks() {
  const notes = dataviewNotes();
  if (vaultTasks.notes !== notes) vaultTasks = { notes, list: collectTasks(notes) };
  return vaultTasks.list;
}
function tasksQueryBlock(code) {
  const today = new Date();
  return tasksQueryView(runTasksQuery(code, allTasks(), today), code, {
    md: dataviewInline,
    onOpen: (rel, e) => { if (e && (e.metaKey || e.ctrlKey)) openNoteInNewTab(rel); else openNote(rel, 'oku'); },
    // Ticked in its own note, with the ✅ date the plugin writes; only while
    // that line is still the one shown.
    onToggle: async (t, done) => {
      let changed = false;
      await changeNoteText(t.rel, (text) => {
        const lines = text.split('\n');
        if (lines[t.line] !== t.raw) return text;
        lines[t.line] = completeTaskLine(t.raw, done, dayKey(new Date()));
        changed = true;
        return lines.join('\n');
      });
      if (!changed) { showToast('That task has changed; shown again'); render(); }
    },
  });
}

// --- budget notes (lib/budget.mjs, src/budget-view.js) ---
// The settings of the note's ```budget block ('' when it has none).
const BUDGET_BLOCK = /^```budget[^\S\n]*\n([\s\S]*?)^```/m;
function budgetCode(src) { const m = BUDGET_BLOCK.exec(String(src || '')); return m ? m[1] : null; }

// The text of a note as the app has it now: the open note or day from the
// editor, any other from its file.
async function currentText(rel) {
  if (rel === state.openNote) return { text: state.noteContent, scope: 'note' };
  if (state.dailyNote.key && rel === dailyRel(state.dailyNote.key) && state.dailyNote.content != null) return { text: state.dailyNote.content, scope: 'daily' };
  const res = await notesApi.read(rel);
  return res && !res.error ? { text: res.content, scope: null } : null;
}

// The budget notes of the vault by month, for the card's ‹ month › switch.
function budgetNav(rel, src) {
  const month = budgetMonth(readProps(src).props, noteTitleOf(rel));
  if (!month) return null;
  const months = new Map();
  for (const n of state.vaultNotes) {
    if (n.rel === rel || isTemplateNote(n.rel) || !BUDGET_BLOCK.test(n.content)) continue;
    const m = budgetMonth(readProps(n.content).props, noteTitleOf(n.rel));
    if (m && !months.has(m)) months.set(m, n.rel);
  }
  const sorted = [...months.keys()].sort();
  const prev = sorted.filter((m) => m < month).pop();
  const next = sorted.find((m) => m > month);
  const label = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); };
  return {
    current: label(month),
    prev: prev ? { label: label(prev), open: () => openNote(months.get(prev)) } : null,
    next: next ? { label: label(next), open: () => openNote(months.get(next)) } : null,
    newMonth: next ? null : { label: label(shiftMonth(month, 1)), create: () => newBudgetMonth(rel, month) },
  };
}

// The next month's budget note, next to this one, with the same settings.
async function newBudgetMonth(rel, month) {
  flushActiveEditor();
  const cur = await currentText(rel);
  if (!cur) return;
  const nextMonth = shiftMonth(month, 1);
  const title = noteTitleOf(rel);
  const name = title.includes(month) ? title.replace(month, nextMonth) : `Budget ${nextMonth}`;
  const res = await notesApi.create(folderOf(rel), name);
  if (!res || !res.rel) { showToast('Could not create the next month'); return; }
  await notesApi.write(res.rel, nextMonthText(cur.text, nextMonth));
  await refreshTree();
  await rebuildBacklinks();
  await openNote(res.rel);
}

// "+ Add income / expense": the dialog, then a new row in the note's table.
async function addBudgetEntry(rel, kind) {
  flushActiveEditor();
  const cur = await currentText(rel);
  if (!cur) return;
  const code = budgetCode(cur.text) || '';
  openAddDialog({ kind, categories: categoryChoices(cur.text, code), currency: budgetSettings(code).currency, colourOf: categoryColours(cur.text, code) }, (entry) => {
    changeNoteText(rel, (text) => addBudgetRow(text, kind, entry));
  });
}

// Change a note's text with edit(text) → text: the open note or day through
// the editor (one undo step), any other straight in its file.
async function changeNoteText(rel, edit) {
  const now = await currentText(rel);
  if (!now) return;
  const next = edit(now.text);
  if (next === now.text) return;
  if (now.scope) {
    setSrc(now.scope, next, true);
    histRecord(now.scope);
    render();
    return;
  }
  const w = await notesApi.write(rel, next);
  if (w && w.error) { showToast('Could not save the note'); return; }
  state.noteCache.delete(rel);
  await rebuildBacklinks(); // boards and cards read the vault's notes
  render();
}

// --- job search (lib/jobs.mjs, src/jobs-view.js) ---
const JOBS_BLOCK = /^```jobs[^\S\n]*\n([\s\S]*?)^```/m;
// The notes of a kind in the vault (read(rel, text) → item or null, may(text)
// a quick look first), the open note as it is in the editor; not the
// templates they are made from.
function vaultItems(may, read) {
  const out = [];
  const templates = state.layout.templates ? `${state.layout.templates}/` : null;
  for (const n of state.vaultNotes) {
    if (templates && n.rel.startsWith(templates)) continue;
    const text = n.rel === state.openNote ? state.noteContent : n.content;
    if (!may(text)) continue;
    const item = read(n.rel, text);
    if (item) out.push(item);
  }
  return out;
}
const vaultJobs = () => vaultItems(mayBeJob, jobOf);
const isTemplateNote = (rel) => Boolean(state.layout.templates && rel.startsWith(`${state.layout.templates}/`));
// The stages: the first ```jobs block's in the vault, else the usual ones.
function jobStages() {
  for (const n of state.vaultNotes) {
    if (isTemplateNote(n.rel)) continue;
    const m = JOBS_BLOCK.exec(n.rel === state.openNote ? state.noteContent : n.content);
    if (m) return jobsSettings(m[1]).stages;
  }
  return DEFAULT_STAGES;
}
function jobsBlock(rel, code, _src) {
  const settings = jobsSettings(code);
  return jobsBoard(vaultJobs(), {
    stages: settings.stages,
    onOpen: (to) => openNote(to),
    onMove: (to, stage) => changeNoteText(to, (text) => setJobStatus(text, stage, setProp)),
    onNew: () => openJobDialog((job) => newJobApplication(rel, settings, job)),
  });
}
// A new application note: from the block's template (a vault template by
// name, else the built-in "Job application"), with the form's answers.
// A note made from a template (a vault template named `template`, else the
// built-in one with id `builtin`) in `folder` (made when missing), with
// properties set; returns its path or null.
async function noteFromTemplate({ folder, name, template, builtin, props }) {
  if (folder && !state.treeFolders.includes(folder)) {
    const made = await notesApi.createFolder(folderOf(folder), folder.slice(folder.lastIndexOf('/') + 1));
    if (!made || made.error) { showToast(`Could not make the ${folder} folder`); return null; }
  }
  const res = await notesApi.create(folder, name);
  if (!res || !res.rel) { showToast(`Could not create ${name}`); return null; }
  // The named template, else the built-in one — or the vault's copy of it,
  // which takes its place by name.
  const byName = (n) => n && allTemplates().find((c) => c.name.toLowerCase() === String(n).toLowerCase());
  const choice = byName(template) || byName(BUILTIN_TEMPLATES.find((t) => t.id === builtin)?.name);
  let text = choice ? fillTemplate(await templateText(choice), noteTitleOf(res.rel)) : '';
  try {
    for (const [k, v] of props) if (v) text = setProp(text, k, v);
  } catch { /* a template with broken properties: keep its text */ }
  await notesApi.write(res.rel, text);
  await refreshTree();
  await rebuildBacklinks();
  return res.rel;
}
async function newJobApplication(hubRel, settings, job) {
  const name = jobNoteName(job);
  const rel = await noteFromTemplate({
    folder: settings.folder || (hubRel ? folderOf(hubRel) : ''), name, template: settings.template || 'Job application', builtin: 'job',
    props: [['company', job.company], ['role', job.role], ['status', settings.stages[0]], ['application_date', job.applied], ['location', job.location], ['link', job.link]],
  });
  if (!rel) return;
  render();
  showToast(`Added ${name}`);
}

// --- projects (lib/projects.mjs, src/projects-view.js) ---
const vaultProjects = () => vaultItems(mayBeProject, projectOf);
function projectsBlock(rel, code) {
  const settings = projectsSettings(code);
  return projectsBoard(vaultProjects(), {
    onOpen: (to) => openNote(to),
    onMove: (to, stage) => changeNoteText(to, (text) => setJobStatus(text, stage, setProp)),
    onNew: () => openProjectDialog(async (p) => {
      const made = await noteFromTemplate({
        folder: settings.folder || (rel ? folderOf(rel) : ''), name: p.name, template: settings.template, builtin: 'project',
        props: [['status', 'Planning'], ['due', p.due]],
      });
      if (made) await openNote(made);
    }),
  });
}

// --- books (lib/books.mjs, src/books-view.js) ---
const vaultBooks = () => vaultItems(mayBeBook, bookOf);
// The address of a book's cover image, '' when it has none (or it is missing).
function bookCoverUrl(book) {
  if (!book.image) return '';
  const dir = folderOf(book.rel);
  const att = resolveAttachment(book.image, state.attachFiles, dir, attachmentsDirFor(state.layout, dir));
  return att.url && att.isImage ? att.url : '';
}
// An image put in the attachments of the folder `dir`: picked, pasted or
// dropped. { name, url } or null.
const coverInto = (dir) => {
  const took = async (res) => {
    const f = Array.isArray(res) ? res.find((x) => x && x.isImage) : (res && res.files ? res.files.find((x) => x && x.isImage) : res);
    if (!f || f.error || !f.isImage) { if (res && !res.canceled) showToast(f && f.error ? f.error : 'That is not an image'); return null; }
    await refreshAttachList();
    const att = resolveAttachment(f.name, state.attachFiles, dir, attachmentsDirFor(state.layout, dir));
    return { name: f.name, url: att.url || '' };
  };
  return {
    pick: async () => took(await notesApi.attachPick(dir)),
    paste: async () => took(await notesApi.attachPaste(dir)),
    files: async (paths) => took(await notesApi.attachAddFiles(paths, dir)),
  };
};
// "Add cover" on a book: an image file picked for it.
async function addBookCover(book) {
  const img = await coverInto(folderOf(book.rel)).pick();
  if (!img) return;
  await changeNoteText(book.rel, (text) => setProp(text, 'image', `[[${img.name}]]`));
  render();
}
// A book moved to another shelf: its status, and the day it was started or
// finished when not written yet.
function moveBook(book, stage) {
  return changeNoteText(book.rel, (text) => stageChanges(book, stage, dayKey(new Date()))
    .reduce((t, [k, v]) => (k === 'status' ? setJobStatus(t, v, setProp) : setProp(t, k, v)), text));
}
function booksBlock(rel, code) {
  const settings = projectsSettings(code); // the same settings: folder, template
  const books = vaultBooks();
  const folder = settings.folder || (rel ? folderOf(rel) : '');
  return bookcase(bookShelves(books), bookStats(books), {
    urlOf: bookCoverUrl,
    onOpen: (to) => openNote(to),
    onMove: (to, stage) => { const b = books.find((x) => x.rel === to); if (b) moveBook(b, stage); },
    onCover: (b) => addBookCover(b),
    onNew: () => openBookDialog({ cover: coverInto(folder), pathOf: (f) => notesApi.pathForFile(f) }, async (b) => {
      const today = dayKey(new Date());
      const made = await noteFromTemplate({
        folder, name: b.title, template: settings.template, builtin: 'book',
        props: [['author', b.author], ['status', b.stage], ['image', b.image ? `[[${b.image}]]` : ''],
          ['started', b.stage !== 'To read' ? today : ''], ['finished', b.stage === 'Finished' ? today : '']],
      });
      if (made) { render(); showToast(`Added ${b.title}`); }
    }),
  });
}

// --- movies (lib/movies.mjs, src/movies-view.js) ---
const vaultMovies = () => vaultItems(mayBeMovie, movieOf);
// "Add poster" on a movie: an image file picked for it.
async function addMoviePoster(movie) {
  const img = await coverInto(folderOf(movie.rel)).pick();
  if (!img) return;
  await changeNoteText(movie.rel, (text) => setProp(text, 'image', `[[${img.name}]]`));
  render();
}
// A movie moved to another row: its status, and the day it was watched when
// not written yet.
function moveMovie(movie, stage) {
  return changeNoteText(movie.rel, (text) => movieStageChanges(movie, stage, dayKey(new Date()))
    .reduce((t, [k, v]) => (k === 'status' ? setJobStatus(t, v, setProp) : setProp(t, k, v)), text));
}
function moviesBlock(rel, code) {
  const settings = projectsSettings(code); // the same settings: folder, template
  const movies = vaultMovies();
  const folder = settings.folder || (rel ? folderOf(rel) : '');
  return watchlist(movieRows(movies), movieStats(movies), {
    urlOf: bookCoverUrl,
    onOpen: (to) => openNote(to),
    onMove: (to, stage) => { const m = movies.find((x) => x.rel === to); if (m) moveMovie(m, stage); },
    onPoster: (m) => addMoviePoster(m),
    onNew: () => openMovieDialog({ poster: coverInto(folder), pathOf: (f) => notesApi.pathForFile(f) }, async (m) => {
      const made = await noteFromTemplate({
        folder, name: m.title, template: settings.template, builtin: 'movie',
        props: [['director', m.director], ['year', m.year], ['status', m.stage], ['image', m.image ? `[[${m.image}]]` : ''],
          ['watched', m.stage === 'Watched' ? dayKey(new Date()) : '']],
      });
      if (made) { render(); showToast(`Added ${m.title}`); }
    }),
  });
}

// --- habit trackers (lib/habits.mjs, src/habits-view.js) ---
const HABITS_BLOCK = /^```habits[^\S\n]*$/m;
const weekLabel = (week) => {
  const m = weekMonday(week);
  if (!m) return week;
  const e = new Date(m); e.setDate(m.getDate() + 6);
  const f = (d, o) => d.toLocaleDateString(undefined, o);
  return `Week ${Number(week.split('-W')[1])} · ${f(m, { day: 'numeric', month: 'short' })} – ${f(e, { day: 'numeric', month: 'short' })}`;
};
// Mon = 0 … Sun = 6 when the note is this week's, else -1.
function habitToday(rel, src) {
  const week = habitWeek(readProps(src).props, rel ? noteTitleOf(rel) : '');
  const now = new Date();
  return week && week === weekKey(now) ? (now.getDay() + 6) % 7 : -1;
}
// ‹ week › between the notes with the same kind of block (blockRe); the
// next week is made with nextText(text, week) and named after this one.
function weekNav(rel, src, blockRe, nextText, fallbackName) {
  const week = habitWeek(readProps(src).props, noteTitleOf(rel));
  if (!week) return null;
  const weeks = new Map();
  for (const n of state.vaultNotes) {
    if (n.rel === rel || isTemplateNote(n.rel) || !blockRe.test(n.content)) continue;
    const w = habitWeek(readProps(n.content).props, noteTitleOf(n.rel));
    if (w && !weeks.has(w)) weeks.set(w, n.rel);
  }
  const sorted = [...weeks.keys()].sort();
  const prev = sorted.filter((w) => w < week).pop();
  const next = sorted.find((w) => w > week);
  return {
    current: weekLabel(week),
    prev: prev ? { label: weekLabel(prev), open: () => openNote(weeks.get(prev)) } : null,
    next: next ? { label: weekLabel(next), open: () => openNote(weeks.get(next)) } : null,
    newMonth: next ? null : { label: `week ${Number(shiftWeek(week, 1).split('-W')[1])}`, create: () => newWeekNote(rel, week, nextText, fallbackName) },
  };
}
const habitNav = (rel, src) => weekNav(rel, src, HABITS_BLOCK, nextWeekText, 'habits');
async function newWeekNote(rel, week, nextText, fallbackName) {
  flushActiveEditor();
  const cur = await currentText(rel);
  if (!cur) return;
  const next = shiftWeek(week, 1);
  const [y, w] = week.split('-W'); const [ny, nw] = next.split('-W');
  const title = noteTitleOf(rel);
  const name = title.includes(`${y} Week ${Number(w)}`) ? title.replace(`${y} Week ${Number(w)}`, `${ny} Week ${Number(nw)}`)
    : title.includes(week) ? title.replace(week, next) : `${ny} Week ${Number(nw)} ${fallbackName}`;
  const res = await notesApi.create(folderOf(rel), name);
  if (!res || !res.rel) { showToast('Could not create next week'); return; }
  await notesApi.write(res.rel, nextText(cur.text, next));
  await refreshTree();
  await rebuildBacklinks();
  await openNote(res.rel);
}

// --- weekly to-do (lib/weekly.mjs, src/weekly-view.js) ---
const WEEK_BLOCK = /^```week[^\S\n]*$/m;
const weekShowText = new Set(); // notes whose days show as text too, this session
function weekBlock(rel, src) {
  const week = habitWeek(readProps(src).props, rel ? noteTitleOf(rel) : '');
  const edit = (fn) => changeNoteText(rel, fn);
  return weekBoard(src, {
    key: rel || '',
    monday: week ? weekMonday(week) : null,
    today: habitToday(rel, src),
    nav: rel ? weekNav(rel, src, WEEK_BLOCK, nextWeekTodoText, 'to-do') : null,
    showText: weekShowText.has(rel),
    on: {
      toggle: (line) => edit((text) => toggleTaskLine(text, line)),
      add: async (day, text, again) => { await edit((t) => addWeekTask(t, day, text)); if (again) focusNewTask(document, day); },
      edit: (line, text) => edit((t) => editWeekTask(t, line, text)),
      move: (line, day) => edit((t) => moveWeekTask(t, line, day)),
      carry: (day) => edit((t) => moveOpenToNextDay(t, day)),
      text: () => { if (weekShowText.has(rel)) weekShowText.delete(rel); else weekShowText.add(rel); render(); },
    },
  });
}

async function addHabitEntry(rel) {
  flushActiveEditor();
  openHabitDialog((h) => changeNoteText(rel, (text) => addHabit(text, h)));
}

// The income and expenses tables of a budget note: coloured categories and an
// "+ Add" button under each. b: the table's block.
function decorateBudgetBlock(el, rel, src, b) {
  // A weekly to-do's days are drawn by its board; their text shows on request.
  if (WEEK_BLOCK.test(src) && !weekShowText.has(rel) && weekDays(src).some((d) => b.start >= d.heading && b.start <= d.end)) {
    el.classList.add('wk-hidden');
    return;
  }
  if (b.type !== 'table') return;
  if (HABITS_BLOCK.test(src)) {
    const t = habitTable(src);
    if (t && t.start === b.start) {
      decorateHabitTable(el, t, { today: habitToday(rel, src), onToggle: (line, day) => changeNoteText(rel, (text) => toggleHabit(text, line, day)) });
      el.append(addHabitButton(() => addHabitEntry(rel)));
      return;
    }
  }
  const code = budgetCode(src);
  if (code == null) return;
  const t = budgetTables(src);
  const kind = t.income && t.income.start === b.start ? 'income' : t.expenses && t.expenses.start === b.start ? 'expenses' : null;
  if (!kind) return;
  const rows = t[kind].rows;
  decorateBudgetTable(el, t[kind].columns, { money: moneyFormat(budgetSettings(code).currency), colourOf: categoryColours(src, code), total: rows.length ? rows.reduce((s, r) => s + r.amount, 0) : null });
  el.append(addButton(kind, (k) => addBudgetEntry(rel, k)));
}

// Tick a task shown by a Dataview query: in the open note or day through the
// editor's history, elsewhere straight to its file.
async function toggleDataviewTask(path, line) {
  if (path === state.openNote) {
    setSrc('note', toggleTaskLine(state.noteContent, line), true);
    histRecord('note');
    render();
    return;
  }
  if (state.dailyNote.key && path === dailyRel(state.dailyNote.key) && state.dailyNote.content != null) {
    setSrc('daily', toggleTaskLine(state.dailyNote.content, line), true);
    histRecord('daily');
    render();
    return;
  }
  const res = await notesApi.read(path);
  if (!res || res.error) return;
  const w = await notesApi.write(path, toggleTaskLine(res.content, line));
  if (w && w.error) return;
  state.noteCache.delete(path);
  await rebuildBacklinks();
  render();
}

function wireDataview(container) {
  container.querySelectorAll('input.dv-task-check').forEach((box) => {
    box.addEventListener('mousedown', (e) => e.stopPropagation());
    box.addEventListener('change', () => toggleDataviewTask(box.getAttribute('data-path'), Number(box.getAttribute('data-line'))));
  });
  container.querySelectorAll('.dv-cal-nav').forEach((b) => b.addEventListener('mousedown', (e) => e.stopPropagation()));
}

// Open an attachment (image or file) by its resolved vault path, via IPC.
async function openAttachment(rel) {
  if (!rel) return;
  const res = await notesApi.attachOpen(rel);
  if (res?.error) showToast(res.error);
}

// Scroll the open note's rendered body to a heading by its (folded) text.
function scrollToHeading(heading) {
  if (!heading) return;
  if (String(heading).startsWith('^')) {
    if (state.contentView === 'note' && state.openNote && state.noteView === 'blocks') unfoldBlock(String(heading).slice(1));
    scrollToBlock(String(heading).slice(1));
    return;
  }
  const want = foldTR(String(heading).trim());
  if (state.contentView === 'note' && state.openNote && state.noteView === 'blocks') unfoldHeading('note', heading);
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
  if (!String(target).trim() && heading) { scrollToHeading(heading); return; } // [[#Heading]], [[#^id]]: this note
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
    state.treeBases = Array.isArray(res.bases) ? res.bases : [];
    state.treeCanvases = Array.isArray(res.canvases) ? res.canvases : [];
    state.notesFlat = flattenNotes(res.notes);
    reloadOpenCanvas();
    applyAliases();
    loadBaseTexts();
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
// Notes' other names (frontmatter "aliases"), so [[alias]] finds them.
function applyAliases() {
  const by = new Map((state.vaultNotes || []).map((n) => [n.rel, aliasesOf(n.content || '')]));
  // A new list (not changed in place): links are resolved through an index of it (lib/notestree.mjs).
  state.notesFlat = state.notesFlat.map((n) => {
    const own = n.rel === state.openNote ? aliasesOf(state.noteContent) : by.get(n.rel);
    return { ...n, aliases: own && own.length ? own : undefined };
  });
}
// The vault's notes come from main's cache as changes: what changed since the
// version this window has (lib/vault-cache.mjs). Nothing changed: the same
// list, so everything built from it (Dataview's index…) is kept.
let vaultVersion = -1;
const vaultByRel = new Map();
let vaultSync = null;
function syncVault() {
  // One at a time: a second call waits for the first and then asks again.
  vaultSync = (vaultSync || Promise.resolve()).then(async () => {
    const res = await notesApi.sync(vaultVersion);
    if (!res || res.error || !Array.isArray(res.changed)) return false;
    if (res.full) vaultByRel.clear();
    for (const n of res.changed) {
      vaultByRel.set(n.rel, n);
      if (n.rel !== state.openNote) state.noteCache.set(n.rel, n.content);
    }
    for (const rel of res.removed) { vaultByRel.delete(rel); state.noteCache.delete(rel); }
    vaultVersion = res.version;
    const changed = res.full || res.changed.length > 0 || res.removed.length > 0;
    if (changed) state.vaultNotes = [...vaultByRel.values()];
    return changed;
  }).finally(() => { vaultSync = null; });
  return vaultSync;
}
async function rebuildBacklinks() {
  const changed = await syncVault();
  if (changed === false && state.backlinks) { applyAliases(); return; }
  state.backlinks = buildBacklinkIndex(state.vaultNotes);
  applyAliases();
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
  tabs.remap(oldRel, newRel);
  if (split) { split.rel = fix(split.rel); saveSplit(); }
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
    else parentEl.append(isCanvasRel(n.rel) ? canvasRow(n, depth) : noteRow(n, depth));
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
// A note's own page icon (icon: in its properties), by path; worked out again
// only when the vault's notes change.
let pageIcons = { notes: null, byRel: new Map() };
function pageIconOf(rel) {
  if (pageIcons.notes !== state.vaultNotes) {
    const byRel = new Map();
    for (const n of state.vaultNotes) {
      if (!/^---\r?\n/.test(n.content) || !/^icon:/m.test(n.content)) continue;
      const ic = noteLook(n.content).icon;
      if (ic) byRel.set(n.rel, ic);
    }
    pageIcons = { notes: state.vaultNotes, byRel };
  }
  return pageIcons.byRel.get(rel) || '';
}
// The icon picked for the row in the tree, else (a note) its page icon, else
// `fallback`.
function treeIcon(rel, fallback) {
  const wrap = elem('span', 'tree-icon');
  const v = (state.treeStyles[rel] && state.treeStyles[rel].icon) || (fallback === 'tiFileText' ? pageIconOf(rel) : '');
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
  onRightClick(row, `f:${f.rel}`, () => folderMenuItems(f));
  // The daily notes folder can change places but not move into another folder.
  makeDraggable(row, `f:${f.rel}`);
  setupRowDrop(row, f.rel, true);
  return row;
}

function noteRow(n, depth) {
  if (isBaseRel(n.rel)) return baseRow(n, depth);
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
  onRightClick(row, `n:${n.rel}`, () => noteMenuItems(n));
  makeDraggable(row, `n:${n.rel}`);
  setupRowDrop(row, n.rel, false);
  return row;
}

function folderMenuItems(f) {
  const daily = isGunluk(f.rel);
  return [
    { label: 'New note', fn: () => { closeMenu(); newNoteIn(f.rel); } },
    { label: 'New note from template…', fn: () => { closeMenu(); newFromTemplate(f.rel); } },
    { label: 'New folder', fn: () => { closeMenu(); newFolderIn(f.rel); } },
    { label: 'New canvas', fn: () => { closeMenu(); newCanvas(f.rel); } },
    SEP,
    ...(daily ? [] : [{ label: 'Move to…', fn: () => { closeMenu(); moveToFolder(`f:${f.rel}`); } }]),
    { label: 'Search in folder', fn: () => { closeMenu(); searchFor(`path:"${f.rel}"`); } },
    SEP,
    ...copyItems(f.rel),
    SEP,
    revealItem(f.rel),
    SEP,
    { label: 'Icon…', fn: () => openIconPicker(`f:${f.rel}`, f.rel) },
    { label: 'Colour…', fn: () => openColorPicker(`f:${f.rel}`, f.rel, 'folder') },
    ...(daily ? [] : [{ label: 'Rename', fn: () => { closeMenu(); startTreeEdit({ kind: 'rename-folder', rel: f.rel }); } },
      SEP,
      { label: 'Delete', danger: true, fn: () => { closeMenu(); state.folderDeleteConfirm = f.rel; refreshSidebar(); } }]),
  ];
}
function noteMenuItems(n) {
  return [
    { label: 'Open in new tab', fn: () => { closeMenu(); openNoteInNewTab(n.rel); } },
    { label: 'Open to the right', fn: () => { closeMenu(); openSplit(n.rel); } },
    SEP,
    { label: 'Duplicate', fn: () => { closeMenu(); duplicateFile(n.rel); } },
    { label: 'Move to…', fn: () => { closeMenu(); moveToFolder(`n:${n.rel}`); } },
    { label: isBookmarked(n.rel) ? 'Remove bookmark' : 'Bookmark', fn: () => { closeMenu(); toggleBookmark(n.rel); } },
    SEP,
    ...copyItems(n.rel, [{ label: 'Copy link', fn: () => { closeMenu(); copyText(`[[${linkTarget(n.rel)}]]`, 'the link'); } }]),
    SEP,
    revealItem(n.rel),
    SEP,
    { label: 'Icon…', fn: () => openIconPicker(`n:${n.rel}`, n.rel) },
    { label: 'Colour…', fn: () => openColorPicker(`n:${n.rel}`, n.rel, 'note') },
    { label: 'Rename', fn: () => { closeMenu(); startTreeEdit({ kind: 'rename-note', rel: n.rel }); } },
    { label: 'Version history…', fn: () => { closeMenu(); openNoteHistory(n.rel); } },
    SEP,
    { label: 'Delete', danger: true, fn: () => { closeMenu(); deleteNoteRel(n.rel); } },
  ];
}

// --- file actions: the sidebar's ⋯ and right-click menus -------------------
// A board or drawing row (a button itself): its ⋯ on hover and a right-click.
function sideRowMenu(row, key, buildItems) {
  const btn = elem('span', 'menu-btn');
  btn.append(icon('more', { size: 15 }));
  btn.setAttribute('role', 'button'); btn.setAttribute('aria-label', 'Options'); btn.setAttribute('aria-haspopup', 'menu');
  btn.dataset.menuAnchor = key;
  btn.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); openMenu(key, buildItems); });
  row.append(btn);
  onRightClick(row, key, buildItems);
}
// Asked first, then to the trash (a drawing or a board).
function askDelete(rel, what, after) {
  closeMenu();
  askDialog({ heading: `Delete ${rel.replace(/^.*\//, '').replace(/(\.excalidraw)?\.md$/i, '')}?`, text: `The ${what} goes to the Trash.`, okLabel: 'Delete', danger: true }, async () => {
    await deleteNoteRel(rel);
    await after();
  });
}
function drawingMenuItems(d) {
  const name = d.rel.replace(/^.*\//, '').replace(/\.md$/i, '');
  return [
    { label: 'Open', fn: () => { closeMenu(); openDraw(d.rel); } },
    { label: 'Open in new tab', fn: () => { closeMenu(); newTab({ view: 'draw', rel: d.rel }); } },
    SEP,
    { label: 'Duplicate', fn: () => { closeMenu(); duplicateFile(d.rel); } },
    { label: 'Move to…', fn: () => { closeMenu(); moveToFolder(`n:${d.rel}`); } },
    SEP,
    ...copyItems(d.rel, [{ label: 'Copy embed', fn: () => { closeMenu(); copyText(`![[${name}]]`, 'the embed'); } }]),
    SEP,
    revealItem(d.rel),
    SEP,
    { label: 'Rename', fn: () => {
      closeMenu();
      askDialog({ heading: 'Rename drawing', value: d.title, okLabel: 'Rename' }, async (to) => {
        const res = await notesApi.rename(d.rel, `${to}.excalidraw`);
        if (!res || res.error || !res.rel) { showToast('Could not rename the drawing'); return; }
        remapRel(d.rel, res.rel);
        await refreshTree(); await rebuildBacklinks();
        if (state.drawing && state.drawing.rel === d.rel) await openDraw(res.rel); else render();
        reportLinks(res);
      });
    } },
    SEP,
    { label: 'Delete', danger: true, fn: () => askDelete(d.rel, 'drawing', async () => {
      if (state.drawing && state.drawing.rel === d.rel) { state.drawing = null; await openDraw(); } else render();
    }) },
  ];
}
function boardRowMenuItems(b) {
  return [
    { label: 'Open', fn: () => { closeMenu(); openTasks(b.rel); } },
    { label: 'Open in new tab', fn: () => { closeMenu(); newTab({ view: 'tasks', rel: b.rel }); } },
    { label: 'Open as Markdown', fn: () => { closeMenu(); openNote(b.rel, 'oku', { keepTab: true, asText: true }); } },
    SEP,
    { label: 'Duplicate', fn: () => { closeMenu(); duplicateFile(b.rel); } },
    { label: 'Move to…', fn: () => { closeMenu(); moveToFolder(`n:${b.rel}`); } },
    SEP,
    ...copyItems(b.rel, [{ label: 'Copy link', fn: () => { closeMenu(); copyText(`[[${linkTarget(b.rel)}]]`, 'the link'); } }]),
    SEP,
    revealItem(b.rel),
    SEP,
    { label: 'Rename', fn: () => {
      closeMenu();
      askDialog({ heading: 'Rename board', value: b.title, okLabel: 'Rename' }, async (to) => {
        const res = await notesApi.rename(b.rel, to);
        if (!res || res.error || !res.rel) { showToast('Could not rename the board'); return; }
        remapRel(b.rel, res.rel);
        await refreshTree(); await rebuildBacklinks();
        if (state.board && state.board.rel === b.rel) await openTasks(res.rel); else render();
        reportLinks(res);
      });
    } },
    SEP,
    { label: 'Delete', danger: true, fn: () => askDelete(b.rel, 'board and its tasks', async () => {
      if (state.board && state.board.rel === b.rel) {
        try { localStorage.removeItem(BOARD_KEY); } catch { /* ignore */ }
        state.board = null;
        if (state.contentView === 'tasks') await openTasks(); else render();
      } else render();
    }) },
  ];
}
const SEP = { sep: true };
// A right-click on a row opens its menu where the pointer is.
function onRightClick(row, key, buildItems) {
  row.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); openMenu(key, buildItems, { align: 'left', at: { x: e.clientX, y: e.clientY } }); });
}
async function copyText(text, what) { await notesApi.copy(text); showToast(`Copied ${what}`); }
// The path on this computer: the vault's folder and the vault path.
async function fullPath(rel) {
  const v = await notesApi.vaultInfo();
  const base = (v && v.path) || '';
  const sep = base.includes('\\') ? '\\' : '/';
  return rel ? `${base}${sep}${rel.split('/').join(sep)}` : base;
}
function copyItems(rel, extra = []) {
  return [
    { label: 'Copy path', fn: () => { closeMenu(); copyText(rel, rel); } },
    { label: 'Copy full path', fn: async () => { closeMenu(); copyText(await fullPath(rel), 'the full path'); } },
    ...extra,
  ];
}
const revealItem = (rel) => ({ label: plansApi.isMac ? 'Reveal in Finder' : 'Show in Explorer', fn: () => { closeMenu(); notesApi.revealItem(rel); } });
// What a [[link]] to the note is: its name, or its path when another note has
// the same name.
function linkTarget(rel) {
  const name = rel.replace(/^.*\//, '').replace(/\.md$/i, '');
  const same = state.notesFlat.filter((x) => x.rel.replace(/^.*\//, '').replace(/\.md$/i, '').toLowerCase() === name.toLowerCase());
  return same.length > 1 ? rel.replace(/\.md$/i, '') : name;
}
// Move to…: a folder picked from a list (the top of the vault first).
function moveToFolder(key) {
  const rel = key.slice(2);
  const isFolder = key[0] === 'f';
  const here = folderOf(rel);
  const folders = ['', ...state.treeFolders].filter((f) => f !== here && !(isFolder && (f === rel || f.startsWith(`${rel}/`))));
  openPalette({
    id: 'move',
    placeholder: `Move ${rel.replace(/^.*\//, '').replace(/\.md$/i, '')} to…`,
    footer: '↑↓ navigate · ↵ move · esc close',
    items: (q) => folders
      .filter((f) => !q.trim() || f.toLowerCase().includes(q.trim().toLowerCase()))
      .slice(0, 60)
      .map((f) => ({ label: f ? f.replace(/^.*\//, '') : 'Top of the vault', detail: f.includes('/') ? f.split('/').slice(0, -1).join(' / ') : '', run: () => doMove(key, f) })),
  });
}
// A copy beside it: "Name 2" (a drawing keeps its .excalidraw ending).
async function duplicateFile(rel) {
  const res = await notesApi.read(rel);
  if (!res || res.error) { showToast('Could not read it'); return null; }
  const folder = folderOf(rel);
  let name = rel.replace(/^.*\//, '').replace(/\.md$/i, '');
  const drawing = /\.excalidraw$/i.test(name);
  if (drawing) {
    const base = name.replace(/\.excalidraw$/i, '');
    const taken = new Set(state.vaultNotes.map((x) => x.rel.toLowerCase()));
    let i = 2;
    while (taken.has(`${folder ? `${folder}/` : ''}${base} ${i}.excalidraw.md`.toLowerCase())) i += 1;
    name = `${base} ${i}.excalidraw`;
  }
  const made = await notesApi.create(folder, name);
  if (!made || !made.rel) { showToast('Could not make the copy'); return null; }
  await notesApi.write(made.rel, res.content);
  await refreshTree();
  await rebuildBacklinks();
  render();
  showToast(`Copied as ${made.rel.replace(/^.*\//, '').replace(/(\.excalidraw)?\.md$/i, '')}`);
  return made.rel;
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
  const typed = state.treeEdit && state.treeEdit.typed;
  input.value = typed ? typed.value : treeEditDefault();
  // The suggested name is selected so typing replaces it (not a name being typed).
  input.addEventListener('focus', () => { if (!typed) input.select(); }, { once: true });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitTreeEdit(input.value); }
    if (e.key === 'Escape') { e.preventDefault(); state.treeEdit = null; render(); }
  });
  input.addEventListener('blur', () => { if (state.treeEdit && !state.rebuildingSidebar) commitTreeEdit(input.value); });
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
  if (!name || !isPlainQuery(parseQuery(name))) return;
  const exact = state.notesFlat.find((n) => foldTR(n.title) === foldTR(name));
  state.araQuery = '';
  if (exact) { await openNote(exact.rel, 'oku', { keepTab: true }); return; }
  const res = await notesApi.create(targetFolder(), name);
  await refreshTree();
  if (res && res.rel) await openNote(res.rel, 'duzenle', { keepTab: true });
}

async function openNote(rel, mode, opts = {}) {
  // A block still being edited is saved first, even when the focus already
  // left it (a palette, a menu) and its blur did not save it.
  flushActiveEditor();
  const res = await notesApi.read(rel);
  // A task board opens as a board ("Open as Markdown" in its menu shows the text).
  if (!opts.asText && res && !res.error && isBoard(res.content)) { await openTasks(rel); return; }
  // A drawing opens in Draw.
  if (!opts.asText && res && !res.error && (isDrawingRel(rel) || isDrawingText(res.content))) { await openDraw(rel); return; }
  // ⌥⌘-click (or ⌥⌘Enter) opens it in the right pane instead.
  if (takeSplitAsk()) { openSplit(rel, res && !res.error ? res.content : ''); return; }
  navVisit({ view: 'note', rel });
  state.openNote = rel;
  state.noteContent = res && !res.error ? res.content : '';
  state.noteDisk = state.noteContent;
  state.noteCache.set(rel, state.noteContent);
  state.noteView = 'blocks';
  state.blockEdit = null;
  state.propAdding = null;
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

// --- file recovery (src/history-view.js, lib/history.mjs) ---------------
const okOr = (fallback) => (res) => (res && !res.error ? res : fallback);
async function openNoteHistory(rel = state.openNote) {
  if (!rel) return;
  // Save what is pending first, so "now" is what is on screen.
  if (rel === state.openNote && noteSaveTimer) {
    clearTimeout(noteSaveTimer); noteSaveTimer = null;
    await saveOpenNote();
  }
  const now = rel === state.openNote ? state.noteContent : okOr({ content: '' })(await notesApi.read(rel)).content;
  openVersionHistory({
    rel,
    title: noteTitleOf(rel),
    list: (r) => notesApi.historyList(r).then(okOr([])),
    get: (r, t) => notesApi.historyGet(r, t).then((x) => (typeof x === 'string' ? x : null)),
    current: () => now,
    copy: async (text) => { await notesApi.copy(text); showToast('Copied'); },
    restore: async (r, t) => {
      const res = await notesApi.historyRestore(r, t);
      if (!res || res.error) { showToast(res && res.error ? res.error : 'Could not restore the version'); return false; }
      state.noteCache.delete(r);
      if (state.openNote === r) await openNote(r, 'oku', { keepTab: true });
      showToast('Version restored. The text it replaced is kept as a version.');
      return true;
    },
  });
}
function openDeletedRecovery() {
  openDeletedNotes({
    list: () => notesApi.historyDeleted().then(okOr([])),
    titleOf: noteTitleOf,
    restore: async (rel, t) => {
      const res = await notesApi.historyRestoreDeleted(rel, t);
      if (!res || res.error) { showToast(res && res.error ? res.error : 'Could not restore the note'); return null; }
      await refreshTree();
      await rebuildBacklinks();
      render();
      showToast(`Restored “${noteTitleOf(res.rel)}”`);
      return res;
    },
  });
}

// --- find and replace in the note (src/find-bar.js, lib/find.mjs) -------
const noteShown = () => state.contentView === 'note' && !!state.openNote;
findBar = createFindBar(document.getElementById('find-bar'), {
  active: noteShown,
  src: () => state.noteContent,
  rel: () => state.openNote,
  mode: () => state.noteView,
  blocksRoot: () => contentEl.querySelector('.note-body > .blocks'),
  sourceArea: () => document.getElementById('note-editor'),
  scroller: paneEl,
  prepare: () => { if (state.blockEdit) { flushActiveEditor(); render(); } },
  replaceSource: (text) => { setSrc('note', text, true); histRecord('note'); render(); },
  focusMatch: (m) => {
    if (state.noteView === 'source') {
      const ta = document.getElementById('note-editor');
      if (ta) { ta.focus(); ta.setSelectionRange(m.start, m.end); }
      return;
    }
    // Edit the block holding the match, caret after it.
    const src = state.noteContent;
    const line = src.slice(0, m.start).split('\n').length - 1;
    const b = parseBlocks(src).find((x) => x.start <= line && line <= x.end);
    if (!b) return;
    const from = src.split('\n').slice(0, b.start).join('\n').length + (b.start ? 1 : 0);
    startEditBlock('note', b.start, m.end - from);
  },
  toast: (t) => showToast(t),
});

// --- the right pane: a second note beside the main one ------------------
// It shows the note as the preview does: links (they open in this pane),
// tasks, embeds, queries. Clicking its text swaps the panes and edits there,
// so either note can be written in; the main pane is the one being edited.
const askSplit = (e) => { if ((e.metaKey || e.ctrlKey) && e.altKey && (e.type === 'click' || e.key === 'Enter')) splitAsk = Date.now(); };
document.addEventListener('click', askSplit, true);
document.addEventListener('keydown', askSplit, true);
function takeSplitAsk() { const yes = splitAsk && Date.now() - splitAsk < 1500; splitAsk = 0; return !!yes; }
function saveSplit() { try { localStorage.setItem('mufka-split', split ? split.rel : ''); } catch { /* private window */ } }
function loadSplit() {
  let rel = '';
  try { rel = localStorage.getItem('mufka-split') || ''; } catch { /* none */ }
  if (rel && state.notesFlat.some((n) => n.rel === rel)) openSplit(rel);
}
const splitText = () => (split.rel === state.openNote ? state.noteContent : (state.noteCache.get(split.rel) ?? split.text));
async function openSplit(rel, text) {
  if (!rel) return;
  if (text == null) {
    const res = rel === state.openNote ? { content: state.noteContent } : await notesApi.read(rel);
    if (!res || res.error) { showToast('Could not open the note'); return; }
    text = res.content;
  }
  hidePreview();
  state.noteCache.set(rel, text);
  split = { rel, text };
  saveSplit();
  splitShown = null;
  renderSplit();
  splitEl.querySelector('.split-scroll').scrollTop = 0;
}
function closeSplit() {
  split = null; splitShown = null; saveSplit();
  renderSplit();
}
// Swap the panes: the right note becomes the one edited, the main one moves
// right (when it was a note). editAt: the line of a block to start editing.
async function swapSplit(editAt = null) {
  if (!split) return;
  flushActiveEditor();
  const target = split.rel;
  const main = state.contentView === 'note' && state.openNote ? state.openNote : null;
  if (main && main !== target) { split = { rel: main, text: state.noteContent }; saveSplit(); splitShown = null; } else if (!main) closeSplit();
  if (main !== target) await openNote(target, 'oku', { keepTab: true });
  if (editAt != null && state.openNote === target) startEditBlock('note', editAt, 'end');
}
async function toggleSplitTask(line) {
  const rel = split.rel;
  if (rel === state.openNote) { setSrc('note', toggleTaskLine(state.noteContent, line), true); histRecord('note'); render(); return; }
  const next = toggleTaskLine(splitText(), line);
  const w = await notesApi.write(rel, next);
  if (w && w.error) { showToast(w.error); return; }
  state.noteCache.set(rel, next);
  split.text = next;
  renderSplit();
}
function renderSplit() {
  const valid = split && state.notesFlat.some((n) => n.rel === split.rel);
  if (split && !valid && state.notesFlat.length) { split = null; saveSplit(); }
  splitEl.hidden = !split;
  document.getElementById('app').classList.toggle('split-open', !!split);
  if (!split) { splitShown = null; return; }
  const text = splitText();
  if (splitShown && splitShown.rel === split.rel && splitShown.text === text) return;
  splitShown = { rel: split.rel, text };
  const rel = split.rel;
  const title = splitEl.querySelector('.split-title');
  title.textContent = noteTitleOf(rel);
  title.title = rel;
  const col = splitEl.querySelector('.split-col');
  const scroller = splitEl.querySelector('.split-scroll');
  const top = scroller.scrollTop;
  col.replaceChildren();
  const dir = folderOf(rel);
  const attach = (raw) => resolveAttachment(raw, state.attachFiles, dir, attachmentsDirFor(state.layout, dir));
  const blocks = parseBlocks(text);
  // The file name as a title, unless the note starts with the same "# Title".
  const first = blocks.find((b) => b.type !== 'frontmatter');
  const firstLine = first ? blockText(text, first).split('\n')[0] : '';
  if (!(/^#\s/.test(firstLine) && foldTR(firstLine.replace(/^#\s+/, '').trim()) === foldTR(noteTitleOf(rel)))) col.append(elem('h1', 'split-note-title', noteTitleOf(rel)));
  if (!blocks.length) col.append(hint('This note is empty.'));
  for (const b of blocks) {
    const el = elem('div', `block md block-${b.type}`);
    el.dataset.blockStart = String(b.start);
    for (const n of renderMarkdown(blockText(text, b), { doc: document, noteExists: wikiExists, attach, refs: text, embedNote, embedStack: [rel], ...noteRenderOptions(rel) })) el.append(n);
    el.querySelectorAll('a[data-wiki]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation(); hidePreview();
      const to = resolveLink(a.getAttribute('data-wiki'), rel, state.notesFlat);
      if (to) openSplit(to); else openWiki(a.getAttribute('data-wiki'), a.getAttribute('data-heading'));
    }));
    el.querySelectorAll('a[data-external]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); notesApi.openExternal(a.getAttribute('href')); }));
    el.querySelectorAll('[data-att]').forEach((x) => x.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openAttachment(x.getAttribute('data-att')); }));
    el.querySelectorAll('.tag[data-tag]').forEach((t) => t.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); searchFor(`#${t.getAttribute('data-tag')}`); }));
    el.querySelectorAll('input.task-check').forEach((box) => box.addEventListener('change', () => toggleSplitTask(b.start + Number(box.getAttribute('data-line')))));
    wireDataview(el);
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || e.target.closest('a, input, img:not(.mermaid-img), button, [data-att], summary, .tag')) return;
      e.preventDefault();
      swapSplit(b.start);
    });
    col.append(el);
  }
  attachHoverPreview(col, previewApi);
  scroller.scrollTop = top;
}
splitEl.querySelector('.split-swap').addEventListener('click', () => swapSplit());
splitEl.querySelector('.split-close').addEventListener('click', () => closeSplit());
// Drag its left edge to resize (double-click: half and half); remembered.
(() => {
  const handle = splitEl.querySelector('.split-resizer');
  const setW = (w, save) => {
    const room = document.getElementById('app').clientWidth - document.getElementById('sidebar').offsetWidth - 360;
    if (w == null) splitEl.style.removeProperty('flex');
    else splitEl.style.flex = `0 0 ${Math.round(Math.max(280, Math.min(w, room)))}px`;
    if (save) { try { localStorage.setItem('mufka-split-width', w == null ? '' : String(splitEl.offsetWidth)); } catch { /* ignore */ } }
  };
  try { const w = Number(localStorage.getItem('mufka-split-width')); if (w) splitEl.style.flex = `0 0 ${w}px`; } catch { /* none */ }
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX; const startW = splitEl.offsetWidth;
    const move = (ev) => setW(startW - (ev.clientX - startX), false);
    const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); setW(splitEl.offsetWidth, true); };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
  handle.addEventListener('dblclick', () => setW(null, true));
})();
function openNoteInNewTab(rel) { newTab({ view: 'note', rel }); }

// Saves of the open note and the day's note go through these. Each sends the
// text it replaces, so text another app added at the end meanwhile (an AI
// client over MCP, a sync) is kept rather than saved over (lib/outside.mjs).
async function saveOpenNote(text = state.noteContent) {
  const rel = state.openNote;
  const base = state.noteDisk;
  state.noteDisk = text;
  const res = await notesApi.write(rel, text, base);
  if (res && res.merged != null && state.openNote === rel) takeOutside('note', text, res.merged);
  else if (res && res.conflict) showToast('This note changed outside Mufka. Your text is saved; the other version is in Version history.', 6000);
  return res;
}
async function saveDaily(key, text) {
  const base = state.dailyNote.key === key ? state.dailyNote.disk : undefined;
  if (state.dailyNote.key === key) state.dailyNote.disk = text;
  const res = await notesApi.writeDaily(key, text, base);
  if (res && res.merged != null && state.dailyNote.key === key) takeOutside('daily', text, res.merged);
  else if (res && res.conflict) showToast('This note changed outside Mufka. Your text is saved; the other version is in Version history.', 6000);
  return res;
}
// The save above came back with text added outside Mufka: put it on screen
// too (after whatever was typed since), and save again if more was typed.
function takeOutside(scope, sent, merged) {
  const local = getSrcFor(scope);
  const next = mergeOutside(local, sent, merged).text;
  if (scope === 'note') { state.noteDisk = merged; state.noteContent = next; state.noteCache.set(state.openNote, next); }
  else { state.dailyNote.disk = merged; state.dailyNote.content = next; }
  const ta = scope === 'note' && document.getElementById('note-editor');
  if (ta) { const { selectionStart: x, selectionEnd: y } = ta; ta.value = next; ta.setSelectionRange(x, y); }
  if (next !== merged) { if (scope === 'note') saveOpenNote(next); else saveDaily(state.dailyNote.key, next); }
  if (!isEditing()) render();
}

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
      saveOpenNote(newSrc);
      const t = state.treeNotes.find((x) => x.rel === state.openNote);
      if (t) { t.mtime = Date.now(); if (state.noteSort.startsWith('modified')) renderSidebar(); }
    };
    if (persistNow) save(); else noteSaveTimer = setTimeout(save, 500);
  } else {
    const key = state.dailyNote.key;
    state.dailyNote.content = newSrc;
    state.dailyDates.add(key);
    clearTimeout(dailySaveTimer);
    const save = () => saveDaily(key, newSrc);
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
  const rel = scope === 'note' ? state.openNote : (state.dailyNote.key ? dailyRel(state.dailyNote.key) : '');
  const nodes = renderMarkdown(bsrc, { doc: document, noteExists: wikiExists, attach: attachResolverFor(scope), refs: getSrcFor(scope), embedNote, ...noteRenderOptions(rel) });
  for (const n of nodes) container.append(n);
  wireDataview(container);
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
  if (scope === 'note') addMeetingTaskButtons(container, startLine);
}

// A Wispr Flow meeting note's open to-dos (lib/wispr.mjs meetingTodos): next to
// each, a button that puts it on a task board through the New task dialog,
// filled in; or the board that already has a task with that title.
function addMeetingTaskButtons(container, startLine) {
  const todos = meetingTodos(state.noteContent);
  if (!todos.length) return;
  const day = (meetingOf(state.openNote || '', state.noteContent) || {}).date || '';
  const base = /^\d{4}-\d{2}-\d{2}$/.test(day) ? parseDayKey(day) : new Date();
  const byLine = new Map(todos.map((t) => [t.line, t]));
  const boards = boardList().filter((b) => !isTemplateNote(b.rel));
  container.querySelectorAll('input.task-check').forEach((box) => {
    const t = byLine.get(startLine + Number(box.getAttribute('data-line')));
    const li = box.closest('li');
    if (!t || !li) return;
    const title = parseCard(t.text).title.toLowerCase();
    const on = boards.find((b) => parseBoard(b.content).columns.some((c) => c.cards.some((k) => parseCard(k.text).title.toLowerCase() === title)));
    if (on) li.append(elem('span', 'meeting-task-on', `On ${on.title}`));
    else {
      const btn = elem('button', 'meeting-task-btn', 'Add to board');
      btn.type = 'button';
      btn.dataset.menuAnchor = `meeting-task-${t.line}`;
      btn.title = 'Make it a task on a board';
      btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); addMeetingTask(t, boards, btn.dataset.menuAnchor); });
      li.append(btn);
    }
    const when = todoWhen(t.text, base);
    if (when) li.append(meetingPlanButton(t.text, when));
  });
}
// The day (and time) a meeting's to-do names (lib/meetings.mjs todoWhen): a
// button that puts it in the Planner on that day, or where it already is.
function meetingPlanButton(text, when) {
  const label = [parseDayKey(when.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', ''), when.time].filter(Boolean).join(' · ');
  const title = text.trim().toLowerCase();
  if (state.store.items.some((p) => p.scope === 'day' && p.key === when.date && p.title.toLowerCase() === title)) {
    return elem('span', 'meeting-task-on', `In Planner · ${label}`);
  }
  const btn = elem('button', 'meeting-task-btn', `Plan ${label}`);
  btn.type = 'button';
  btn.title = 'Put it in the Planner on that day';
  btn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    addPlan(parseDayKey(when.date), { title: text.trim(), time: when.time });
    btn.replaceWith(elem('span', 'meeting-task-on', `In Planner · ${label}`));
    showToast(`Added to the Planner · ${label}`);
  });
  return btn;
}
function addMeetingTask(todo, boards, anchor) {
  const go = (b) => {
    closeMenu();
    openTaskAfterRender(b.rel, null, null, { title: todo.text, body: `From [[${noteTitleOf(state.openNote)}]]` });
    openTasks(b.rel);
  };
  if (!boards.length) { showToast('No task board yet: make one in Tasks first'); return; }
  if (boards.length === 1) { go(boards[0]); return; }
  openMenu(anchor, () => boards.map((b) => ({ label: b.title, fn: () => go(b) })));
}

// --- the properties editor (lib/properties.mjs) ---------------------------
// The frontmatter of a note shows as a table of properties to edit in place:
// text, lists and tags as chips, numbers, dates, checkboxes. "Edit YAML"
// opens the raw block. Each change is saved and is one undo step.
const PROP_ICONS = { tags: 'tag', list: 'outline', checkbox: 'check', date: 'calendar', datetime: 'calendar', object: 'more', text: 'tiFileText' };
function commitProps(scope, change) {
  const src = getSrcFor(scope);
  let next;
  try { next = change(src); } catch (e) { showToast(e.message || 'Could not change the properties'); return false; }
  if (next === src) return false;
  setSrc(scope, next, true);
  histRecord(scope);
  // Re-render once the click that caused it has landed; keep the focus where it went.
  whenPointerUp(() => {
    const a = document.activeElement;
    if (!state.focus && a && a.id && a.closest && a.closest('.props')) state.focus = a.id;
    render();
  });
  return true;
}
function startAddProperty(scope = 'note') {
  flushActiveEditor();
  state.propAdding = scope;
  state.focus = `prop-${scope}-new`;
  render();
}
const propsFold = new Map(); // rel -> true (folded) / false (open), this session
function propertiesBlock(scope, b) {
  const src = getSrcFor(scope);
  const info = readProps(src);
  const box = elem('div', 'block props');
  if (b) box.dataset.blockStart = String(b.start);
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Properties');
  const head = elem('div', 'props-head');
  // Folded: just the heading. A page with an icon or cover (or a job
  // application, whose strip shows them) starts folded, so it opens on its
  // content; the choice is kept per note for the session.
  const rel = scope === 'note' ? state.openNote : dailyRel(state.dailyNote.key);
  const look = noteLook(src);
  const folded = !info.error && state.propAdding !== scope && (propsFold.has(rel) ? propsFold.get(rel) : Boolean(look.icon || look.cover || (scope === 'note' && (jobOf(rel, src) || projectOf(rel, src)))));
  const title = elem('button', 'props-title', 'Properties'); title.type = 'button';
  title.setAttribute('aria-expanded', String(!folded));
  if (folded && info.props) title.append(elem('span', 'props-count', String(info.props.length)));
  title.addEventListener('click', () => { propsFold.set(rel, !folded); render(); });
  head.append(title);
  if (folded) { box.classList.add('folded'); box.append(head); return box; }
  if (b) {
    const raw = elem('button', 'props-raw', 'Edit YAML'); raw.type = 'button';
    raw.title = 'Edit the properties as text';
    raw.addEventListener('click', () => startEditBlock(scope, b.start, 'end'));
    head.append(raw);
  }
  box.append(head);
  if (info.error) {
    box.append(elem('p', 'props-error', `These properties are not valid YAML (${info.error.split('\n')[0]}). Use Edit YAML to fix them.`));
    return box;
  }
  info.props.forEach((p, i) => box.append(propRow(scope, p, i)));
  if (state.propAdding === scope) box.append(propNewRow(scope));
  else {
    const add = elem('button', 'props-add', '+ Add property'); add.type = 'button';
    add.addEventListener('click', () => startAddProperty(scope));
    box.append(add);
  }
  return box;
}
function propRow(scope, p, i) {
  const row = elem('div', `prop-row prop-${p.type}`);
  const id = `prop-${scope}-${i}`;
  const ic = icon(PROP_ICONS[p.type] || 'tiFileText', { size: 14 });
  ic.classList.add('prop-icon');
  const key = document.createElement('input');
  key.className = 'prop-key'; key.id = `${id}-k`; key.value = p.key; key.spellcheck = false;
  key.setAttribute('aria-label', 'Property name');
  key.addEventListener('change', () => { if (!commitProps(scope, (s) => renameProp(s, p.key, key.value))) key.value = p.key; });
  key.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); key.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); key.value = p.key; key.blur(); }
  });
  const val = elem('div', 'prop-value');
  val.append(propEditor(scope, p, `${id}-v`));
  const del = elem('button', 'prop-del', '×'); del.type = 'button';
  del.title = `Remove ${p.key}`; del.setAttribute('aria-label', `Remove ${p.key}`);
  del.addEventListener('click', () => commitProps(scope, (s) => deleteProp(s, p.key)));
  row.append(p.type === 'number' ? elem('span', 'prop-icon prop-num', '12') : ic, key, val, del);
  return row;
}
function propEditor(scope, p, id) {
  const set = (v) => commitProps(scope, (s) => setProp(s, p.key, v));
  const field = (type, value) => {
    const f = document.createElement('input');
    f.type = type; f.id = id; f.className = 'prop-input'; f.value = value;
    f.setAttribute('aria-label', p.key);
    f.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); f.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); f.value = value; f.blur(); }
    });
    return f;
  };
  if (p.type === 'checkbox') {
    const c = document.createElement('input');
    c.type = 'checkbox'; c.id = id; c.className = 'prop-check'; c.checked = p.value === true;
    c.setAttribute('aria-label', p.key);
    c.addEventListener('change', () => set(c.checked));
    return c;
  }
  if (p.type === 'number') {
    const f = field('number', String(p.value));
    f.addEventListener('change', () => set(f.value === '' ? null : Number(f.value)));
    return f;
  }
  if (p.type === 'date' || p.type === 'datetime') {
    const s = p.value instanceof Date ? p.value.toISOString().slice(0, 10) : String(p.value);
    const f = field(p.type === 'date' ? 'date' : 'datetime-local', p.type === 'date' ? s : s.replace(' ', 'T').slice(0, 16));
    f.addEventListener('change', () => { if (f.value) set(p.type === 'date' ? f.value : (s.includes('T') ? f.value : f.value.replace('T', ' '))); });
    return f;
  }
  if (p.type === 'list' || p.type === 'tags') {
    const items = (Array.isArray(p.value) ? p.value : (p.value == null || p.value === '' ? [] : [p.value])).map((x) => String(x));
    const wrap = elem('div', 'prop-chips');
    items.forEach((it, k) => {
      const chip = elem('span', 'prop-chip');
      chip.append(elem('span', null, p.type === 'tags' ? `#${it.replace(/^#/, '')}` : it));
      const x = elem('button', 'prop-chip-x', '×'); x.type = 'button'; x.tabIndex = -1;
      x.setAttribute('aria-label', `Remove ${it}`);
      x.addEventListener('click', () => set(items.filter((_, j) => j !== k)));
      chip.append(x);
      wrap.append(chip);
    });
    const add = document.createElement('input');
    add.type = 'text'; add.id = id; add.className = 'prop-chip-input'; add.spellcheck = false;
    add.placeholder = items.length ? '' : (p.type === 'tags' ? 'Add a tag' : 'Add a value');
    add.setAttribute('aria-label', `Add to ${p.key}`);
    const push = () => {
      const v = add.value.split(',').map((x) => x.trim().replace(p.type === 'tags' ? /^#/ : /^$/, '')).filter(Boolean);
      if (!v.length) return false;
      add.value = '';
      state.focus = id;
      return set([...items, ...v.filter((x) => !items.includes(x))]);
    };
    add.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || (e.key === ',' && add.value.trim())) { e.preventDefault(); push(); }
      else if (e.key === 'Backspace' && !add.value && items.length) { e.preventDefault(); state.focus = id; set(items.slice(0, -1)); }
      else if (e.key === 'Escape') { add.value = ''; add.blur(); }
    });
    add.addEventListener('blur', () => { if (add.value.trim()) push(); });
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) { e.preventDefault(); add.focus(); } });
    wrap.append(add);
    return wrap;
  }
  if (p.type === 'object') {
    const t = elem('span', 'prop-object', JSON.stringify(p.value));
    t.title = 'Nested values: use Edit YAML';
    return t;
  }
  const f = field('text', p.value == null ? '' : String(p.value));
  f.addEventListener('change', () => set(f.value));
  return f;
}
function propNewRow(scope) {
  const row = elem('div', 'prop-row prop-new');
  const key = document.createElement('input');
  key.className = 'prop-key'; key.id = `prop-${scope}-new`; key.placeholder = 'Property name'; key.spellcheck = false;
  key.setAttribute('aria-label', 'New property name');
  const done = (save) => {
    const name = key.value.trim();
    state.propAdding = null;
    if (save && name) {
      const count = readProps(getSrcFor(scope)).props?.length ?? 0;
      if (readProps(getSrcFor(scope)).props?.some((p) => p.key === name)) { showToast(`There is already a property named “${name}”`); render(); return; }
      state.focus = `prop-${scope}-${count}-v`;
      if (!commitProps(scope, (s) => setProp(s, name, defaultValue(name)))) render();
    } else render();
  };
  key.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); done(true); }
    if (e.key === 'Escape') { e.preventDefault(); done(false); }
  });
  key.addEventListener('blur', () => { if (state.propAdding) whenPointerUp(() => { if (state.propAdding && document.activeElement !== key) done(true); }); });
  row.append(elem('span', 'prop-icon'), key);
  return row;
}

// --- heading folds (lib/fold.mjs): kept per note in this window's storage,
// not in the note, as in Obsidian ---
let folds = {};
try { folds = JSON.parse(localStorage.getItem('mufka-folds') || '{}') || {}; } catch { /* none */ }
function foldRel(scope) { return scope === 'note' ? state.openNote : (state.dailyNote.key ? dailyRel(state.dailyNote.key) : ''); }
function foldPlanFor(scope, src = getSrcFor(scope), blocks = parseBlocks(src)) {
  return foldPlan(blocks, (b) => blockText(src, b), new Set(folds[foldRel(scope)] || []));
}
function setFolds(scope, keys) {
  const rel = foldRel(scope);
  if (!rel) return;
  if (keys.length) folds[rel] = keys; else delete folds[rel];
  try { localStorage.setItem('mufka-folds', JSON.stringify(folds)); } catch { /* ignore */ }
}
function toggleFold(scope, key) {
  const keys = new Set(folds[foldRel(scope)] || []);
  if (keys.has(key)) keys.delete(key); else keys.add(key);
  setFolds(scope, [...keys]);
  render();
}
function foldAll(scope, on) {
  if (state.blockEdit) flushActiveEditor();
  setFolds(scope, on ? foldPlanFor(scope).heads.filter((h) => h.hidden > 0).map((h) => h.key) : []);
  render();
}
// ⌘.: the heading of the block being edited, else of the first one in view.
function toggleFoldHere(scope) {
  const src = getSrcFor(scope);
  const blocks = parseBlocks(src);
  let start = state.blockEdit && state.blockEdit.scope === scope ? state.blockEdit.startLine ?? state.blockEdit.newAfter : null;
  if (start == null) {
    const top = contentEl.getBoundingClientRect().top;
    const first = [...contentEl.querySelectorAll('.blocks > [data-block-start]')].find((x) => x.getBoundingClientRect().bottom > top + 40);
    start = first ? Number(first.dataset.blockStart) : null;
  }
  const idx = blocks.findIndex((x) => x.start === start);
  const head = idx < 0 ? null : headingFor(foldPlan(blocks, (b) => blockText(src, b), new Set(folds[foldRel(scope)] || [])), idx);
  if (!head || head.hidden === 0) return;
  if (state.blockEdit) flushActiveEditor();
  toggleFold(scope, head.key);
}
// Unfold whatever hides a heading (followed link, outline click).
function unfoldHeading(scope, text) {
  const src = getSrcFor(scope);
  const blocks = parseBlocks(src);
  const plan = foldPlanFor(scope, src, blocks);
  const want = foldTR(String(text).trim());
  const h = plan.heads.find((x) => foldTR(x.text) === want);
  const hiding = h ? foldsHiding(plan, h.index) : [];
  if (!hiding.length) return false;
  setFolds(scope, (folds[foldRel(scope)] || []).filter((k) => !hiding.includes(k)));
  render();
  return true;
}
// Unfold whatever hides a block ([[Note#^id]] followed).
function unfoldBlock(id) {
  const src = getSrcFor('note');
  const at = findBlock(src, id);
  if (!at) return;
  const blocks = parseBlocks(src);
  const idx = blocks.findIndex((x) => x.start <= at.start && x.end >= at.start);
  const hiding = idx < 0 ? [] : foldsHiding(foldPlanFor('note', src, blocks), idx);
  if (!hiding.length) return;
  setFolds('note', (folds[foldRel('note')] || []).filter((k) => !hiding.includes(k)));
  render();
}
const FOLD_ARROW = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function foldControl(el, scope, head) {
  const h = el.querySelector('h1, h2, h3, h4, h5, h6');
  if (!h || head.hidden === 0) return;
  el.classList.add('foldable');
  if (head.folded) el.classList.add('folded');
  const btn = elem('button', 'fold-toggle');
  btn.type = 'button';
  btn.innerHTML = FOLD_ARROW;
  btn.setAttribute('aria-expanded', String(!head.folded));
  btn.setAttribute('aria-label', `${head.folded ? 'Unfold' : 'Fold'} ${head.text}`);
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleFold(scope, head.key); });
  h.prepend(btn);
  if (head.folded) {
    const more = elem('button', 'fold-more', `${head.hidden} ${head.hidden === 1 ? 'block' : 'blocks'}`);
    more.type = 'button';
    more.title = 'Unfold';
    more.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleFold(scope, head.key); });
    h.append(more);
  }
}

function blockPreview(scope, b, head) {
  if (b.type === 'frontmatter') return propertiesBlock(scope, b);
  const el = elem('div', `block md block-${b.type}`); // block-image, block-heading… for spacing
  el.dataset.blockStart = String(b.start);
  mountBlockMarkdown(el, blockText(getSrcFor(scope), b), b.start, scope);
  if (head) foldControl(el, scope, head);
  decorateBudgetBlock(el, scope === 'note' ? state.openNote : dailyRel(state.dailyNote.key), getSrcFor(scope), b);
  el.addEventListener('mousedown', (e) => {
    if (e.target.closest('a, input, img:not(.mermaid-img), button, [data-att], summary, .tag')) return; // keep links/tasks/folds/tags/buttons single-click
    e.preventDefault();
    startEditBlock(scope, b.start, 'end');
  });
  el.addEventListener('contextmenu', (e) => { if (!e.target.closest('a, img, [data-att], .embed')) blockRefMenu(e, scope, b); });
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
  // Nor does any editor take it from a new note's or folder's name being typed.
  const a = document.activeElement;
  const naming = a && a.id === 'tree-edit' && state.treeEdit;
  if (!naming && (!edit.auto || !a || a === document.body || a.id === 'block-editor')) state.focus = 'block-editor';
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
  if (state.propAdding === scope && !blocks.some((b) => b.type === 'frontmatter')) wrap.append(propertiesBlock(scope, null));
  if (edit && edit.newAfter === -1) wrap.append(blockTextarea(scope, null, edit));
  const plan = foldPlanFor(scope, src, blocks);
  const heads = new Map(plan.heads.map((h) => [h.start, h]));
  for (const b of blocks) {
    if (edit && edit.startLine === b.start) { wrap.append(blockTextarea(scope, b, edit)); continue; }
    if (!plan.hidden.has(b.start)) wrap.append(blockPreview(scope, b, heads.get(b.start)));
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
  // A book's head is its cover (below); its page icon is for the tree.
  const tpl = isTemplateNote(state.openNote);
  if (!(tpl ? null : bookOf(state.openNote, state.noteContent) || movieOf(state.openNote, state.noteContent))) pane.append(pageHead());

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
  // A book: its cover beside the title, with its shelf and facts.
  const book = isTemplateNote(state.openNote) ? null : bookOf(state.openNote, state.noteContent);
  if (book) {
    pane.append(bookHead(book, bookCoverUrl(book), header, {
      onStage: (stage) => moveBook(book, stage),
      onRate: (n) => changeNoteText(state.openNote, (text) => setProp(text, 'rating', n || '')),
      onCover: () => addBookCover(book),
    }));
  }
  // A movie: its poster beside the title, with its row and facts.
  const movie = book || isTemplateNote(state.openNote) ? null : movieOf(state.openNote, state.noteContent);
  if (movie) {
    pane.append(movieHead(movie, bookCoverUrl(movie), header, {
      onStage: (stage) => moveMovie(movie, stage),
      onRate: (n) => changeNoteText(state.openNote, (text) => setProp(text, 'rating', n || '')),
      onPoster: () => addMoviePoster(movie),
    }));
  }
  if (!book && !movie) pane.append(header);
  const job = book || movie || isTemplateNote(state.openNote) ? null : jobOf(state.openNote, state.noteContent);
  const project = book || movie || job || isTemplateNote(state.openNote) ? null : projectOf(state.openNote, state.noteContent);
  if (project) pane.append(projectStrip(project, { onStage: (stage) => changeNoteText(state.openNote, (text) => setJobStatus(text, stage, setProp)) }));
  // A trip: its countdown, where and when, packing; a meeting: when, who,
  // action items.
  const plain = !(book || movie || job || project) && !isTemplateNote(state.openNote);
  const trip = plain ? tripOf(state.openNote, state.noteContent) : null;
  if (trip) pane.append(tripStrip(trip));
  const meeting = plain && !trip ? meetingOf(state.openNote, state.noteContent) : null;
  const mStrip = meeting && meetingStrip(meeting);
  if (mStrip) pane.append(mStrip);
  if (job) {
    pane.append(jobStrip(job, {
      stages: jobStages(),
      onStage: (stage) => changeNoteText(state.openNote, (text) => setJobStatus(text, stage, setProp)),
      onLink: (url) => notesApi.openExternal(url),
    }));
  }

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

// A note's icon and cover, from its properties: icon: 💰, and cover: a colour
// (violet, blue…) or an image in the vault ("[[beach.jpg]]", as Obsidian's
// Banners plugin keeps one). cover: { gradient } | { image: raw } | null.
const COVERS = ['violet', 'blue', 'teal', 'green', 'amber', 'rose', 'gray'];
function noteLook(src) {
  const r = readProps(src);
  const out = { icon: '', cover: null };
  if (!r.props) return out;
  for (const p of r.props) {
    const k = String(p.key).toLowerCase();
    if (k === 'icon' && typeof p.value === 'string') out.icon = cleanEmoji(p.value);
    if ((k === 'cover' || k === 'banner') && typeof p.value === 'string' && p.value.trim()) {
      const v = p.value.trim();
      out.cover = COVERS.includes(v.toLowerCase()) ? { gradient: v.toLowerCase() } : { image: v.replace(/^!?\[\[|\]\]$/g, '').split('|')[0] };
    }
  }
  return out;
}

// Set (or with null, remove) a property of the open note; one undo step.
function setNoteProp(key, value) {
  closeMenu();
  flushActiveEditor();
  let next;
  try { next = value == null ? deleteProp(state.noteContent, key) : setProp(state.noteContent, key, value); } catch (e) { showToast(`Could not change the properties: ${e.message}`); return; }
  setSrc('note', next, true);
  histRecord('note');
  render();
}

// The top of a page: its cover across the whole width, its icon, and "Add
// icon" / "Add cover" for a page that has none yet (shown on hover).
function pageHead() {
  const look = noteLook(state.noteContent);
  const head = elem('div', 'page-head');
  if (look.cover) {
    head.classList.add('has-cover');
    const cover = elem('div', 'note-cover');
    if (look.cover.gradient) cover.classList.add(`cover-${look.cover.gradient}`);
    else {
      const att = attachResolverFor('note')(look.cover.image);
      if (att.url && att.isImage) cover.style.backgroundImage = `url("${att.url}")`;
      else cover.classList.add('cover-gray', 'cover-missing');
    }
    const acts = elem('div', 'cover-actions');
    const change = elem('button', 'cover-btn', 'Change cover'); change.type = 'button';
    change.dataset.menuAnchor = 'page-cover';
    change.addEventListener('click', () => openCoverPicker('page-cover'));
    const remove = elem('button', 'cover-btn', 'Remove'); remove.type = 'button';
    remove.addEventListener('click', () => setNoteProp('cover', null));
    acts.append(change, remove);
    cover.append(acts);
    head.append(cover);
  }
  if (look.icon) {
    head.classList.add('has-icon');
    const ic = elem('button', 'note-icon', look.icon); ic.type = 'button';
    ic.title = 'Change icon'; ic.setAttribute('aria-label', `Icon ${look.icon}, change`);
    ic.dataset.menuAnchor = 'page-icon';
    ic.addEventListener('click', () => openPageIconPicker('page-icon'));
    head.append(ic);
  }
  const adds = elem('div', 'page-adds');
  if (!look.icon) {
    const b = elem('button', 'page-add', '☺ Add icon'); b.type = 'button';
    b.dataset.menuAnchor = 'page-icon-add';
    b.addEventListener('click', () => openPageIconPicker('page-icon-add'));
    adds.append(b);
  }
  if (!look.cover) {
    const b = elem('button', 'page-add', '▭ Add cover'); b.type = 'button';
    b.addEventListener('click', () => setNoteProp('cover', COVERS[Math.floor(Math.random() * COVERS.length)]));
    adds.append(b);
  }
  if (adds.children.length) head.append(adds);
  return head;
}

const PAGE_EMOJI = ['📝', '📌', '⭐', '💡', '🎯', '🚀', '📅', '✅', '📚', '📖', '✏️', '🧠', '💼', '💰', '💸', '📈',
  '📊', '🧾', '🏠', '🍳', '☕', '🛒', '✈️', '🌍', '🏖️', '🎒', '🏋️', '🧘', '❤️', '🌱', '🌸', '🎨',
  '🎵', '🎬', '🎮', '📷', '💻', '🛠️', '⚙️', '🔬', '🐛', '🧩', '🗂️', '📦', '🎉', '🔥', '✨', '🌙',
  '☀️', '👥', '🤝', '💬', '📣', '🔒', '🎓', '🩺', '🐾', '🍀', '🧳', '🗺️'];
function openPageIconPicker(key) {
  openMenu(key, () => {
    const box = pickerBox('Icon');
    box.classList.add('emoji-picker');
    const grid = elem('div', 'emoji-grid');
    for (const e of PAGE_EMOJI) {
      const b = elem('button', 'emoji-choice', e); b.type = 'button'; b.setAttribute('aria-label', e);
      b.addEventListener('click', () => setNoteProp('icon', e));
      grid.append(b);
    }
    box.append(grid);
    const row = elem('div', 'emoji-row');
    const input = document.createElement('input');
    input.className = 'emoji-input'; input.placeholder = 'Or type any emoji'; input.maxLength = 16;
    input.setAttribute('aria-label', 'Emoji');
    const use = elem('button', 'btn quiet', 'Use'); use.type = 'button';
    const apply = () => {
      const e = cleanEmoji(input.value);
      if (!e) { input.select(); showToast('Type one emoji, for example 🍲'); return; }
      setNoteProp('icon', e);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
    use.addEventListener('click', apply);
    row.append(input, use);
    box.append(row);
    if (noteLook(state.noteContent).icon) {
      const remove = elem('button', 'btn quiet style-reset', 'Remove icon'); remove.type = 'button';
      remove.addEventListener('click', () => setNoteProp('icon', null));
      box.append(remove);
    }
    return [{ el: box }];
  }, { align: 'left' });
}
function openCoverPicker(key) {
  openMenu(key, () => {
    const box = pickerBox('Cover');
    box.classList.add('cover-picker');
    const grid = elem('div', 'cover-choices');
    const now = noteLook(state.noteContent).cover;
    for (const c of COVERS) {
      const on = Boolean(now && now.gradient === c);
      const b = elem('button', `cover-choice cover-${c}${on ? ' on' : ''}`); b.type = 'button';
      b.title = c[0].toUpperCase() + c.slice(1); b.setAttribute('aria-label', b.title); b.setAttribute('aria-pressed', String(on));
      b.addEventListener('click', () => setNoteProp('cover', c));
      grid.append(b);
    }
    box.append(grid);
    const img = elem('button', 'btn quiet style-reset', 'Image from a file…'); img.type = 'button';
    img.addEventListener('click', async () => {
      closeMenu();
      const res = await notesApi.attachPick(attachDirFor('note'));
      if (!res || res.canceled) { if (res && res.error) showToast(res.error); return; }
      const pic = (res.files || []).find((f) => f && f.rel && f.isImage);
      if (!pic) { showToast('Choose an image (PNG, JPG, GIF, WebP…)'); return; }
      await refreshAttachList();
      setNoteProp('cover', `[[${pic.rel}]]`);
    });
    box.append(img);
    return [{ el: box }];
  });
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
// What the "/" menu's app actions do (lib/slash.mjs); the "/" text is already gone.
function runSlashAction(action, ta) {
  const scope = ta.id === 'note-editor' ? 'note' : (state.blockEdit ? state.blockEdit.scope : 'note');
  if (action === 'property') { startAddProperty(scope); return; }
  if (scope !== 'note' || !state.openNote) { showToast('That works in a note'); return; }
  if (action === 'attach') addFileToNote();
  else if (action === 'template') openTemplatePicker();
}
// [[Note#^ → the note's paragraphs and list items; choosing one without an
// id gives it one in that note. The open note's own blocks are offered only
// when they have an id (writing it would replace the block being edited).
function blockSuggestions(trigger) {
  const rel = trigger.note.trim() ? resolveLink(trigger.note.trim(), state.openNote || '', state.notesFlat) : state.openNote;
  const note = rel && embedNote(rel.replace(/\.md$/i, ''));
  if (!note) return [];
  const self = rel === state.openNote;
  const linkText = trigger.note.trim() ? linkTextFor(rel, state.notesFlat.map((n) => n.rel)) : '';
  let choices = blockChoices(note.content).filter((c) => !self || c.id);
  if (trigger.query) choices = choices.filter((c) => (c.id && c.id.startsWith(trigger.query)) || fuzzyMatch(trigger.query, c.text));
  return choices.map((c) => {
    const id = c.id || newBlockId(note.content);
    return {
      label: c.text.length > 72 ? `${c.text.slice(0, 70)}…` : c.text,
      detail: [c.heading, c.id ? `^${c.id}` : c.kind === 'item' ? 'list item' : c.kind].filter(Boolean).join(' · '),
      insert: `[[${linkText}#^${id}]]`,
      run: c.id ? null : () => addIdQuietly(rel, (t) => (t.split('\n')[c.idLine] === note.content.split('\n')[c.idLine] ? addBlockId(t, c.idLine, id) : t)),
    };
  });
}

// Write an id into another note while a block is being edited here: no
// re-render, which would drop the text being typed.
async function addIdQuietly(rel, edit) {
  const now = await currentText(rel);
  if (!now || now.scope) return;
  const next = edit(now.text);
  if (next === now.text) return;
  const w = await notesApi.write(rel, next);
  if (w && w.error) { showToast('Could not add the block id'); return; }
  state.noteCache.set(rel, next);
  const v = state.vaultNotes.find((n) => n.rel === rel);
  if (v) v.content = next;
}

// Right-click a paragraph, list item, quote, table or code: copy a link to
// it, or an embed; it gets an id first when it has none.
function blockRefMenu(e, scope, b) {
  const rel = scope === 'note' ? state.openNote : (state.dailyNote.key ? dailyRel(state.dailyNote.key) : '');
  if (!rel) return;
  const src = getSrcFor(scope);
  const inBlock = blockChoices(src).filter((c) => c.start >= b.start && c.end <= b.end);
  let target = null;
  const li = e.target.closest('li');
  if (li && b.type === 'list') {
    const i = [...e.currentTarget.querySelectorAll('li')].indexOf(li);
    target = inBlock.filter((c) => c.kind === 'item')[i] || null;
  } else if (b.type === 'paragraph' || b.type === 'quote') target = inBlock.find((c) => c.start === b.start) || null;
  if (!target && !['table', 'code', 'list', 'image', 'html'].includes(b.type)) return;
  e.preventDefault();
  const name = linkTextFor(rel, state.notesFlat.map((n) => n.rel));
  const copy = async (embed) => {
    closeMenu();
    let id = target ? target.id : null;
    if (!id) {
      // A whole block (table, code) is named by an "^id" line after it.
      const next = src.split('\n')[b.end + 2];
      const own = next && /^\^([A-Za-z0-9-]+)\s*$/.exec(next);
      id = own ? own[1] : newBlockId(src);
      if (!own) await changeNoteText(rel, (t) => (target ? addBlockId(t, target.idLine, id) : addBlockIdLine(t, b.end, id)));
    }
    const text = `${embed ? '!' : ''}[[${name}#^${id}]]`;
    await notesApi.copy(text);
    showToast(`Copied ${text}`);
  };
  openMenu(`block-${b.start}`, () => [
    { label: 'Copy link to block', fn: () => copy(false) },
    { label: 'Copy embed of block', fn: () => copy(true) },
  ], { align: 'left', at: { x: e.clientX, y: e.clientY } });
}

// Scroll to a block of the open note ("^id") and light it up for a moment.
// A re-render in that moment (a save elsewhere) carries the light over.
let blockFlash = null; // { id, at }
function blockEl(id) {
  const el = contentEl.querySelector(`.md [data-block-id="${CSS.escape(id)}"]`);
  if (el) return el;
  const at = findBlock(state.noteContent, id);
  return at && [...contentEl.querySelectorAll('.blocks > [data-block-start]')].filter((x) => Number(x.dataset.blockStart) <= at.start).pop();
}
function applyBlockFlash() {
  if (!blockFlash) return;
  const past = Date.now() - blockFlash.at;
  if (past > 1800) { blockFlash = null; return; }
  const el = blockEl(blockFlash.id);
  if (el && !el.classList.contains('block-flash')) { el.style.animationDelay = `-${past}ms`; el.classList.add('block-flash'); }
}
function scrollToBlock(id) {
  requestAnimationFrame(() => {
    const el = blockEl(id);
    if (!el) { showToast(`Block not found: ^${id}`); return; }
    el.scrollIntoView({ block: 'center' });
    blockFlash = { id, at: Date.now() };
    applyBlockFlash();
    setTimeout(() => { blockFlash = null; contentEl.querySelectorAll('.block-flash').forEach((x) => { x.classList.remove('block-flash'); x.style.animationDelay = ''; }); }, 1850);
  });
}

const suggestApi = {
  items(kind, q, trigger) {
    if (kind === 'slash') {
      return slashItems(q, { atLineStart: trigger ? trigger.atLineStart : true, dailyLink: dayKey(new Date()) })
        .map((r) => ({ ...r, run: r.action ? (ta) => runSlashAction(r.action, ta) : null }));
    }
    if (kind === 'block') return blockSuggestions(trigger);
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
    const out = rows.filter((n) => n.rel !== state.openNote || q.trim()).map((n) => ({
      label: n.title, detail: n.folder ? n.folder.split('/').join(' / ') : '', insert: `[[${linkTextFor(n.rel, rels)}]]`,
    }));
    // An alias that matches links to its note and shows the alias: [[Title|alias]].
    if (q.trim()) {
      for (const n of state.notesFlat) {
        for (const al of n.aliases || []) {
          if (fuzzyMatch(q, al) && !fuzzyMatch(q, n.title)) out.push({ label: al, detail: `→ ${n.title}`, insert: `[[${linkTextFor(n.rel, rels)}|${al}]]` });
        }
      }
    }
    return out;
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
// --- appearance (main.js sets nativeTheme; styles.css follows it) ---
const THEME_CHOICES = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];
async function setTheme(choice) {
  const res = await notesApi.setTheme(choice);
  if (res && res.error) { showToast(res.error); return; }
  document.querySelectorAll('.theme-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === choice)));
}
function appearanceSection() {
  const sec = elem('section', 'settings-section');
  sec.append(elem('h3', 'settings-heading', 'Appearance'));
  const row = elem('div', 'conn-row theme-row');
  const tx = elem('div', 'conn-text');
  tx.append(elem('span', 'conn-name', 'Theme'), elem('span', 'conn-note', `System matches the light or dark appearance set in ${plansApi.isMac ? 'macOS' : 'Windows'}.`));
  const seg = elem('div', 'theme-seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Theme');
  for (const [id, label] of THEME_CHOICES) {
    const b = elem('button', null, label);
    b.type = 'button'; b.dataset.theme = id; b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => setTheme(id));
    seg.append(b);
  }
  notesApi.theme().then((cur) => { seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === (typeof cur === 'string' ? cur : 'system')))); });
  row.append(tx, seg);
  // Today's plan next to the clock (main.js draws it, lib/menubar.mjs).
  const bar = elem('div', 'conn-row menubar-row');
  const l = elem('label', 'mcp-toggle');
  const on = document.createElement('input'); on.type = 'checkbox'; on.dataset.menubar = 'on';
  l.append(on, elem('span', null, plansApi.isMac
    ? 'Show today\'s plan in the menu bar: the next one and the time until it'
    : 'Show today\'s plan in the system tray'));
  on.addEventListener('change', async () => { const res = await notesApi.setMenubar(on.checked); if (typeof res === 'boolean') on.checked = res; });
  notesApi.menubar().then((cur) => { on.checked = cur === true; });
  bar.append(l);
  sec.append(row, bar);
  return sec;
}
// AI clients (MCP): whether Claude Desktop, Claude Code, Cursor… may use the
// notes (mcp/ is the server; main.js keeps the switches in settings.json),
// and the config to paste into them.
// Updates: the automatic check, "Check now", what is going on, and Restart
// when a new Mufka is ready (main.js runs electron-updater; lib/updates.mjs
// words it). The same state drives the sidebar's update banner.
function updatesSection() {
  const sec = elem('section', 'settings-section');
  sec.append(elem('h3', 'settings-heading', 'Updates'));
  const row = elem('div', 'conn-row upd-row');
  const l = elem('label', 'mcp-toggle');
  const auto = document.createElement('input'); auto.type = 'checkbox'; auto.dataset.update = 'auto';
  l.append(auto, elem('span', null, 'Check for updates automatically (asks GitHub, where Mufka is released)'));
  const side = elem('div', 'conn-side');
  const status = elem('span', 'conn-state upd-status');
  const check = elem('button', 'btn', 'Check now'); check.type = 'button';
  const restart = elem('button', 'btn primary', 'Restart'); restart.type = 'button'; restart.hidden = true;
  side.append(status, check, restart);
  const show = (info) => {
    const st = updateStatus(info, info);
    auto.checked = info.auto;
    status.textContent = st.text;
    restart.hidden = !st.restart;
    check.disabled = !info.packaged || ['checking', 'downloading', 'ready'].includes(info.state);
  };
  auto.addEventListener('change', async () => show(await notesApi.setUpdates({ auto: auto.checked })));
  check.addEventListener('click', async () => show(await notesApi.checkUpdates()));
  restart.addEventListener('click', () => notesApi.installUpdate());
  notesApi.updates().then(show);
  updateListeners.add(show);
  row.append(l, side);
  sec.append(row);
  return sec;
}
const updateListeners = new Set(); // Settings while it is open
// The sidebar banner: shown once a new version is downloaded.
function showUpdateBanner(info) {
  const el = document.getElementById('update-banner');
  if (!el) return;
  const st = updateStatus(info, info);
  el.hidden = !st.restart || updateBannerDismissed === info.version;
  if (el.hidden) return;
  const text = elem('span', 'update-text', `Mufka ${info.version} is ready`);
  const go = elem('button', 'btn primary update-restart', 'Restart'); go.type = 'button';
  go.addEventListener('click', () => notesApi.installUpdate());
  const later = elem('button', 'update-later', '×'); later.type = 'button';
  later.setAttribute('aria-label', 'Later (installed when Mufka quits)'); later.title = 'Later: it is installed when Mufka quits';
  later.addEventListener('click', () => { updateBannerDismissed = info.version; el.hidden = true; });
  el.replaceChildren(text, go, later);
}
let updateBannerDismissed = null;
notesApi.onUpdateState((info) => {
  showUpdateBanner(info);
  for (const fn of updateListeners) fn(info);
});
notesApi.updates().then(showUpdateBanner);

function mcpSection() {
  const sec = elem('section', 'settings-section');
  sec.append(elem('h3', 'settings-heading', 'AI clients (MCP)'));
  const row = elem('div', 'conn-row mcp-row');
  const tx = elem('div', 'conn-text');
  tx.append(elem('span', 'conn-name', 'Use your notes from AI clients'),
    elem('span', 'conn-note', 'Claude Desktop, Claude Code, Cursor and other MCP clients can search and read your notes, job applications and projects; Claude also shows them as Mufka draws them. What a client reads is sent to its AI service. Off until you turn it on.'));
  const toggle = (label, key) => {
    const l = elem('label', 'mcp-toggle');
    const box = document.createElement('input');
    box.type = 'checkbox'; box.dataset.mcp = key;
    l.append(box, elem('span', null, label));
    return { l, box };
  };
  const on = toggle('Let AI clients search and read notes', 'enabled');
  const write = toggle('Also let them create notes and add to them (never change or delete)', 'allowWrite');
  const ticks = toggle('Let them tick tasks in the notes they show (only [ ] ↔ [x], nothing else)', 'allowTicks');
  const copies = elem('div', 'conn-side');
  const copyBtn = (label, key, done) => {
    const b = elem('button', 'btn', label); b.type = 'button'; b.dataset.mcpCopy = key;
    b.addEventListener('click', async () => { const info = await notesApi.mcp(); await notesApi.copy(info[key]); showToast(done); });
    return b;
  };
  copies.append(copyBtn('Copy config for Claude Desktop / Cursor', 'json', 'Copied; paste it into the client\u2019s MCP config and restart it'),
    copyBtn('Copy Claude Code command', 'command', 'Copied; run it in a terminal'));
  const where = elem('span', 'conn-info', 'Claude Desktop: Settings → Developer → Edit Config. Cursor: Settings → MCP. The config points at this copy of Mufka; copy it again after moving the app.');
  const show = (info) => {
    on.box.checked = info.enabled;
    for (const [t, key] of [[write, 'allowWrite'], [ticks, 'allowTicks']]) {
      t.box.checked = info[key];
      t.box.disabled = !info.enabled;
      t.l.classList.toggle('off', !info.enabled);
    }
  };
  const set = async (patch) => show(await notesApi.setMcp(patch));
  on.box.addEventListener('change', () => set({ enabled: on.box.checked }));
  write.box.addEventListener('change', () => set({ allowWrite: write.box.checked }));
  ticks.box.addEventListener('change', () => set({ allowTicks: ticks.box.checked }));
  notesApi.mcp().then(show);
  row.append(tx, on.l, write.l, ticks.l, copies, where);
  sec.append(row);
  return sec;
}
// The notes folder: where it is, show it, open another one (as the folder
// button at the bottom of the sidebar does).
function vaultSection() {
  const sec = elem('section', 'settings-section');
  sec.append(elem('h3', 'settings-heading', 'Notes folder'));
  const row = elem('div', 'conn-row vault-row');
  const tx = elem('div', 'conn-text');
  tx.append(elem('span', 'conn-name', 'Your notes are .md files in'), elem('span', 'conn-note vault-path', vaultInfo && vaultInfo.path ? vaultInfo.path : ''));
  const side = elem('div', 'conn-side');
  const btn = (label, fn) => { const b = elem('button', 'btn', label); b.type = 'button'; b.addEventListener('click', fn); return b; };
  side.append(btn(`Show in ${FILES_APP}`, () => notesApi.reveal()), btn('Open another folder…', () => notesApi.chooseVault()));
  if (vaultInfo && vaultInfo.custom) side.append(btn("Use Mufka's own folder", () => notesApi.useDefaultVault()));
  row.append(tx, side);
  sec.append(row);
  return sec;
}
// --- Settings → Shortcuts (lib/hotkeys.mjs): the keys of every command ---
function saveHotkeys(next) {
  hotkeys = next;
  try { localStorage.setItem('mufka-hotkeys', JSON.stringify(hotkeys)); } catch { /* ignore */ }
}
function shortcutsSection() {
  const sec = elem('section', 'settings-section shortcuts');
  sec.append(elem('h3', 'settings-heading', 'Shortcuts'));
  sec.append(elem('p', 'conn-note shortcuts-lede', 'Click a shortcut to change it, then press the new keys (with ⌘). Esc cancels.'.replace(/⌘/g, K('⌘'))));
  const filter = document.createElement('input');
  filter.type = 'search'; filter.className = 'shortcuts-filter'; filter.placeholder = 'Filter: name or keys…';
  filter.setAttribute('aria-label', 'Filter shortcuts');
  const list = elem('div', 'shortcuts-list');
  sec.append(filter, list);
  let rec = null; // { id, combo, warn }
  const stopRec = () => { rec = null; document.removeEventListener('keydown', onKey, true); draw(); };
  const set = (next) => { saveHotkeys(next); stopRec(); };
  function onKey(e) {
    if (!rec || !sec.isConnected) { rec = null; document.removeEventListener('keydown', onKey, true); return; }
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.key === 'Escape') { stopRec(); return; }
    const cmds = commandList(true);
    if (e.key === 'Enter' && rec.combo && !RESERVED[rec.combo]) { set(assignKeys(hotkeys, cmds, rec.id, rec.combo)); return; }
    const combo = comboOf(e);
    if (!combo || !combo.includes('⌘')) return; // still waiting for the keys
    rec.combo = combo;
    const other = takenBy(combo, cmds, hotkeys, rec.id);
    if (RESERVED[combo]) rec.warn = `${K(combo)} is kept for ${RESERVED[combo]}. Press other keys.`;
    else if (other) rec.warn = `${K(combo)} is used by “${other.label}”. Press other keys, or Enter to take it.`;
    else { set(assignKeys(hotkeys, cmds, rec.id, combo)); return; }
    draw();
  }
  const record = (id) => { if (!rec) document.addEventListener('keydown', onKey, true); rec = { id, combo: '', warn: '' }; draw(); };
  function draw() {
    const q = foldTR(filter.value.trim());
    const cmds = commandList(true).filter((c) => !q || foldTR(`${c.label} ${c.keys} ${K(c.keys)}`).includes(q));
    const groups = [['With a shortcut', cmds.filter((c) => c.keys)], ['No shortcut', cmds.filter((c) => !c.keys)]];
    list.replaceChildren();
    for (const [title, rows] of groups) {
      if (!rows.length) continue;
      list.append(elem('div', 'shortcuts-group', title));
      const card = elem('div', 'shortcuts-card');
      for (const c of rows) {
        const id = idOf(c);
        const on = rec && rec.id === id;
        const changed = c.keys !== (c.hint || '');
        const row = elem('div', `shortcut-row${on ? ' rec' : ''}`);
        row.dataset.command = id;
        const tx = elem('div', 'shortcut-text');
        tx.append(elem('span', 'shortcut-name', c.label));
        if (on && rec.warn) tx.append(elem('span', 'shortcut-warn', rec.warn));
        const keys = elem('div', 'shortcut-keys');
        const kb = elem('button', `kbd${on ? ' rec' : changed && c.keys ? ' custom' : ''}`, on ? (rec.combo ? K(rec.combo) : 'Press keys…') : c.keys ? K(c.keys) : '+');
        kb.type = 'button';
        kb.setAttribute('aria-label', on ? 'Press the new keys' : c.keys ? `Change ${c.label}: ${K(c.keys)}` : `Add a shortcut to ${c.label}`);
        kb.addEventListener('click', () => (on ? stopRec() : record(id)));
        if (!c.keys && !on) keys.append(elem('span', 'shortcut-none', 'No shortcut'));
        keys.append(kb);
        if (c.keys && !on) {
          const x = elem('button', 'shortcut-icon', '✕'); x.type = 'button'; x.title = 'No shortcut';
          x.setAttribute('aria-label', `Remove the shortcut of ${c.label}`);
          x.addEventListener('click', () => set(assignKeys(hotkeys, commandList(true), id, '')));
          keys.append(x);
        }
        const back = elem('button', 'shortcut-icon', '↺'); back.type = 'button';
        back.hidden = !changed;
        back.title = c.hint ? `Back to ${K(c.hint)}` : 'Back to no shortcut';
        back.setAttribute('aria-label', `Reset ${c.label}`);
        back.addEventListener('click', () => set(resetKeys(hotkeys, commandList(true), id)));
        row.append(tx, keys, back);
        card.append(row);
      }
      list.append(card);
    }
  }
  filter.addEventListener('input', draw);
  draw();
  return sec;
}

// The pages of Settings, in the order of the list on the left.
const SETTINGS_PAGES = [['general', 'General', 'settings'], ['appearance', 'Appearance', 'tiPalette'],
  ['shortcuts', 'Shortcuts', 'command'], ['calendars', 'Calendars', 'calendar'], ['voice', 'Voice', 'mic'], ['ai', 'AI clients (MCP)', 'tiSparkles']];
function openSettings(page = 'general') {
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

  const section = elem('section', 'settings-section');
  section.append(elem('h3', 'settings-heading', 'Voice'));
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
  // Handy: dictation (main.js finds it and starts / stops it).
  const handyRow = elem('div', 'conn-row');
  handyRow.dataset.conn = 'handy';
  const handyText = elem('div', 'conn-text');
  handyText.append(elem('span', 'conn-name', 'Handy'),
    elem('span', 'conn-note', 'Dictation on your computer, free and offline: speak and the text goes where the caret is. Use Handy\'s own shortcut (⌥Space by default) anywhere, or in a note the microphone button (⇧⌘D). File → New Note from Audio… turns a recording or an audio file into a note.'));
  const handySide = elem('div', 'conn-side');
  handyRow.append(handyText, handySide);
  section.append(handyRow);
  const drawHandy = () => {
    handySide.replaceChildren();
    if (voice.handy) handySide.append(elem('span', 'conn-state ok', 'Installed'), elem('span', 'conn-info', 'Its own shortcut works too; set it in Handy'));
    else {
      const get = elem('button', 'btn', 'Get Handy ↗'); get.type = 'button';
      get.addEventListener('click', () => notesApi.openExternal('https://handy.computer'));
      handySide.append(elem('span', 'conn-state', 'Not installed'), get);
    }
  };
  // VoiceStudio: turns audio into a note (main.js finds its local server).
  const studioRow = elem('div', 'conn-row');
  studioRow.dataset.conn = 'voicestudio';
  const studioText = elem('div', 'conn-text');
  studioText.append(elem('span', 'conn-name', 'VoiceStudio'),
    elem('span', 'conn-note', 'Turns a recording or an audio file into a note, on your computer, with the speech model chosen in VoiceStudio. Mufka finds it while it is running; nothing to set up.'));
  const studioSide = elem('div', 'conn-side');
  studioRow.append(studioText, studioSide);
  section.append(studioRow);
  const drawStudio = () => {
    studioSide.replaceChildren();
    if (voice.studioRunning) studioSide.append(elem('span', 'conn-state ok', 'Running'), elem('span', 'conn-info', 'Choose it in File → New Note from Audio…'));
    else if (voice.studio) {
      const open = elem('button', 'btn', 'Open VoiceStudio'); open.type = 'button';
      open.addEventListener('click', async () => { await notesApi.openStudio(); setTimeout(() => loadVoice().then(drawStudio), 8000); });
      studioSide.append(elem('span', 'conn-state', 'Not running'), open);
    } else {
      const get = elem('button', 'btn', 'Get VoiceStudio ↗'); get.type = 'button';
      get.addEventListener('click', () => notesApi.openExternal('https://voicestudio.sh'));
      studioSide.append(elem('span', 'conn-state', 'Not installed'), get);
    }
  };
  drawHandy(); drawStudio();
  loadVoice().then(() => { drawHandy(); drawStudio(); });

  // A list of pages on the left, one page shown at a time.
  const body = elem('div', 'settings-body');
  const nav = elem('nav', 'settings-nav');
  nav.setAttribute('aria-label', 'Settings pages');
  const pages = elem('div', 'settings-pages');
  const content = { general: [updatesSection(), vaultSection()], appearance: [appearanceSection()], shortcuts: [shortcutsSection()], calendars: [calSection], voice: [section], ai: [mcpSection()] };
  const show = (id) => {
    for (const b of nav.children) { const on = b.dataset.page === id; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
    for (const pg of pages.children) pg.hidden = pg.dataset.page !== id;
    pages.scrollTop = 0;
  };
  for (const [id, label, ic] of SETTINGS_PAGES) {
    const b = elem('button', 'settings-nav-item');
    b.type = 'button'; b.dataset.page = id;
    b.append(icon(ic), elem('span', null, label));
    b.addEventListener('click', () => show(id));
    nav.append(b);
    const pg = elem('div', 'settings-page');
    pg.dataset.page = id;
    pg.append(elem('h2', 'settings-page-title', label));
    // One section: the page's title is its heading.
    if (content[id].length === 1) content[id][0].querySelector('.settings-heading')?.remove();
    pg.append(...content[id]);
    pages.append(pg);
  }
  body.append(nav, pages);
  box.append(body);
  show(SETTINGS_PAGES.some(([id]) => id === page) ? page : 'general');

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
  const close = () => { layer.remove(); settingsLayer = null; updateListeners.clear(); if (restore && restore.isConnected) restore.focus(); };
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
  Promise.all([calRefreshAll(), refresh()]).then(() => (box.querySelector('.settings-nav-item.on') || done).focus());
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
    if (!hasImage) { pasteRich(e, ta); return; }
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

// Pasted HTML (a web page, Google Docs, Mail) becomes Markdown (lib/paste.mjs).
// Plain text, code editors' copies and a paste inside a code block stay as
// they are; ⇧⌘V always pastes plain text. Inserted like typing, so ⌘Z undoes it.
function pasteRich(e, ta) {
  const data = e.clipboardData;
  if (!data) return;
  const html = data.getData('text/html');
  if (!isRichHtml(html) || data.types.includes('vscode-editor-data') || insideCodeFence(ta.value, ta.selectionStart)) return;
  let md = '';
  try { md = htmlToMarkdown(html); } catch { return; }
  if (!md || md === data.getData('text/plain').trim()) return;
  e.preventDefault();
  if (!document.execCommand('insertText', false, md)) ta._attachInsert(md);
}
async function pastePlain() {
  const t = document.activeElement;
  if (!t || !(t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && /^(text|search)$/.test(t.type)))) return;
  const text = await notesApi.clipboardText();
  if (typeof text !== 'string' || !text) return;
  t.focus();
  if (!document.execCommand('insertText', false, text)) t.setRangeText(text, t.selectionStart, t.selectionEnd, 'end');
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
    await saveOpenNote(ta.value);
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

// Every note's text, for search: filled once from the vault (later changes
// arrive with syncVault). Re-rendering the search field gives it the focus
// again, which calls this: it must then do nothing, or it would loop.
let noteCacheFilled = null;
function ensureNoteCache() {
  if (!noteCacheFilled) {
    noteCacheFilled = (async () => {
      await refreshTree();
      await rebuildBacklinks();
      for (const n of state.vaultNotes) if (!state.noteCache.has(n.rel)) state.noteCache.set(n.rel, n.content);
      if (state.araQuery.trim()) renderSidebar();
    })().catch(() => { noteCacheFilled = null; });
  }
  return noteCacheFilled;
}

// Ara lives in the sidebar: the field at the top, then the two result groups.
// Results open in the right pane but keep the Ara tab active.

// Search results (the sections come back when the field is empty).
function renderSearchResults() {
  const q = state.araQuery.trim();
  if (!q) return;
  const tree = parseQuery(q);
  const plain = isPlainQuery(tree);
  // Enter = open the note with exactly this name, else create it: say so.
  if (plain && !state.notesFlat.some((n) => foldTR(n.title) === foldTR(q))) {
    const c = elem('button', 'ara-result ara-create');
    c.type = 'button';
    c.append(elem('div', null, `Create note “${q}”`), elem('div', 'meta', 'Enter'));
    c.addEventListener('click', () => openOrCreateFromSearch());
    sideEl.append(c);
  }

  // Plans (day-scoped), by title; only for plain words.
  const planHits = plain ? searchPlans(state.store.items.filter((p) => p.scope === 'day'), q) : [];
  if (planHits.length) sideEl.append(elem('div', 'ara-group-title', 'Plans'));
  for (const p of planHits) {
    const btn = elem('button', 'ara-result');
    btn.append(elem('div', null, p.title));
    btn.append(elem('div', 'meta', formatDayNumeric(parseDayKey(p.key)) + (p.time ? ` · ${p.time}` : '')));
    btn.addEventListener('click', () => selectDay(parseDayKey(p.key), { keepTab: true }));
    sideEl.append(btn);
  }

  // Notes: every word in the title or the text, or what the operators say
  // (lib/search.mjs: file: path: tag: line: section: task: "…" -x OR /re/ [prop]).
  const terms = hitTerms(tree);
  const noteHits = [];
  for (const n of state.notesFlat) {
    const doc = searchDoc({ rel: n.rel, title: n.title, content: state.noteCache.get(n.rel) || '' });
    if (matchNote(tree, doc)) noteHits.push({ n, doc });
  }
  if (noteHits.length) sideEl.append(elem('div', 'ara-group-title', `Notes · ${noteHits.length}`));
  if (!noteHits.length && !planHits.length) {
    sideEl.append(elem('div', 'ara-empty', 'No results.'));
    if (plain) sideEl.append(searchHelp());
  }
  // A long list is drawn 100 at a time (typing redraws it on every key).
  if (araShown.query !== q) araShown = { query: q, limit: ARA_PAGE };
  for (const { n, doc } of noteHits.slice(0, araShown.limit)) {
    const btn = elem('button', 'ara-result');
    btn.append(markedText('div', null, n.title, hitsIn(n.title, terms)));
    const snip = snippetFor(doc, terms);
    if (snip) btn.append(markedText('div', 'snippet', snip.text, snip.hits));
    if (n.folder) btn.append(elem('div', 'meta', n.folder.split('/').join(' / ')));
    // Open the note with its first hit found, so it is easy to see where.
    const first = snip && snip.hits[0] ? snip.text.slice(snip.hits[0].start, snip.hits[0].end) : '';
    btn.addEventListener('click', async () => {
      await openNote(n.rel, 'oku', { keepTab: true });
      if (first && state.openNote === n.rel) findBar.open({ query: first, focus: false });
    });
    sideEl.append(btn);
  }
  if (noteHits.length > araShown.limit) {
    const more = elem('button', 'ara-more', `Show ${Math.min(ARA_PAGE, noteHits.length - araShown.limit)} more of ${noteHits.length - araShown.limit}`);
    more.type = 'button';
    more.addEventListener('click', () => { araShown.limit += ARA_PAGE; state.focus = 'ara-input'; refreshSidebar(); });
    sideEl.append(more);
  }
}
const ARA_PAGE = 100;
let araShown = { query: '', limit: ARA_PAGE };

// Text with some ranges in <mark>.
function markedText(tag, cls, text, hits) {
  const e = elem(tag, cls);
  let at = 0;
  for (const h of hits) {
    e.append(text.slice(at, h.start));
    const m = document.createElement('mark'); m.className = 'ara-hit'; m.textContent = text.slice(h.start, h.end);
    e.append(m);
    at = h.end;
  }
  e.append(text.slice(at));
  return e;
}

function searchHelp() {
  const box = elem('div', 'ara-help');
  box.append(elem('div', 'ara-help-title', 'Search can also use'));
  const dl = elem('dl', 'ara-help-list');
  for (const [k, v] of [
    ['"two words"', 'this exact phrase'], ['a OR b', 'either one'], ['-word', 'not this word'],
    ['file:name', 'in the note name'], ['path:Work', 'in the folder path'], ['#tag', 'has the tag'],
    ['line:(a b)', 'both on one line'], ['section:(a b)', 'under one heading'],
    ['task-todo:x', 'in an open task (task:, task-done:)'], ['[status:active]', 'a property'], ['/regex/', 'a pattern'],
  ]) {
    const dt = elem('dt'); dt.append(elem('code', null, k));
    dl.append(dt, elem('dd', null, v));
  }
  box.append(dl);
  return box;
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
  plansApi.onMenu((action, arg) => {
    // The menu bar's task: its board, with the task open.
    if (action === 'open-task' && arg && arg.rel) { plannerApi.openTask(arg); return; }
    if (action === 'export') exportBackup();
    else if (action === 'import') importBackup();
    else if (action === 'new-note') newNote();
    else if (action === 'voice-note') openVoiceNote();
    else if (action === 'tab:takvim') setTab('takvim');
    else if (action === 'tab:notlar') setTab('notlar');
    else if (action === 'tasks') openTasks();
    else if (action === 'draw') openDraw();
    else if (action === 'tab:ara') setTab('ara');
    else if (action === 'paste-plain') pastePlain();
    else if (action === 'new-tab') newNoteTab();
    else if (action === 'close-tab') closeTab();
    else if (action === 'reopen-tab') reopenTab();
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
    loadVoice(); // Handy may have been installed meanwhile (this runs when the window gets the focus)
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
    if (state.contentView === 'draw' && state.drawing) { await reloadDrawing(); return; }
    // Reload the open note if it changed on disk and nothing is being edited.
    if (state.openNote && state.noteView === 'blocks') {
      const res = await notesApi.read(state.openNote);
      if (res && !res.error) state.noteDisk = res.content;
      if (res && !res.error && res.content !== state.noteContent) {
        state.noteContent = res.content; state.noteCache.set(state.openNote, res.content); histReset('note');
      }
    }
    if (state.contentView === 'day' && state.dailyNote.key) {
      const key = state.dailyNote.key;
      const res = await notesApi.readDaily(key).catch(() => null);
      if (res && !res.error && typeof res.content === 'string' && state.dailyNote.key === key && res.content !== state.dailyNote.content) {
        state.dailyNote = { key, content: res.content, disk: res.content }; histReset('daily');
      }
    }
    render();
  });
}

// An editor (a block, the source textarea, or a tree/plan inline field) is open.
function isEditing() {
  return !!(state.blockEdit || document.getElementById('block-editor') || document.getElementById('note-editor')
    || document.getElementById('tree-edit') || (state.contentView === 'tasks' && tasksEditing()));
}

function isTextTarget(t) {
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'
    || t.tagName === 'SELECT' || t.isContentEditable);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.menu) { closeMenu(); return; }
  if (e.key === 'Escape' && settingsLayer) { e.preventDefault(); settingsLayer._close(); return; }
  if (e.ctrlKey && !e.metaKey && e.key === 'Tab') { e.preventDefault(); toggleMode(); return; }
  if (e.key === 'Escape' && findBar.isOpen() && !isTextTarget(e.target) && !state.blockEdit && !isPaletteOpen()) { findBar.close({ keepFocus: true }); return; }
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  const k = e.key.toLowerCase();
  // In a drawing, Excalidraw's own shortcuts (undo, group, copy…) win; only
  // the app's way out (modes, switcher, palette, settings) stays.
  if (e.target && e.target.closest && e.target.closest('.draw-host') && !['1', '2', '3', '4', 'o', 'p', ',', 't', 'n', 'w'].includes(k) && !(e.shiftKey && /^Bracket/.test(e.code))) return;
  // Shortcuts set in Settings → Shortcuts come first; an app shortcut whose
  // command was given other keys does nothing.
  const combo = comboOf(e);
  if (combo && Object.keys(hotkeys).length) {
    const cmds = commandList(true);
    const mine = customCommand(combo, cmds, hotkeys);
    if (mine) { e.preventDefault(); if (!mine.when || mine.when()) mine.run(); return; }
    if (freedDefault(combo, cmds, hotkeys)) { e.preventDefault(); return; }
  }
  if (k === 'z') {
    if (findBar.contains(e.target)) return; // the find fields' own undo
    // Whole-document undo/redo for the block editor (overrides native undo).
    const editScope = state.blockEdit ? state.blockEdit.scope
      : (state.contentView === 'note' && state.openNote && state.noteView === 'blocks' ? 'note' : null);
    if (editScope) { e.preventDefault(); if (e.shiftKey) histRedo(editScope); else histUndo(editScope); return; }
    if (isTextTarget(e.target)) return; // native text undo
    // A canvas is open but the focus is not on it (the card that had it was removed).
    if (state.contentView === 'canvas' && canvasBoard) { e.preventDefault(); if (e.shiftKey) canvasBoard.api.redo(); else canvasBoard.api.undo(); return; }
    if (e.shiftKey) return;
    e.preventDefault();
    if (state.contentView === 'tasks') undoBoard(); else undoDelete();
    return;
  }
  if (e.code === 'Backslash' && e.shiftKey) { e.preventDefault(); toggleRightbar(); return; }
  if (e.shiftKey && (e.code === 'BracketLeft' || e.code === 'BracketRight')) { e.preventDefault(); switchTab(tabs.neighbour(e.code === 'BracketRight' ? 1 : -1)); return; }
  if (e.code === 'KeyW' && !e.shiftKey) { e.preventDefault(); closeTab(); return; }
  if (e.code === 'KeyT' && e.altKey) { e.preventDefault(); newNoteTab(); return; }
  if (k === '\\') { e.preventDefault(); toggleSidebar(); return; }
  if (k === '1') { e.preventDefault(); setTab('takvim'); return; }
  if (k === '2') { e.preventDefault(); setTab('notlar'); return; }
  if (k === '3') { e.preventDefault(); openTasks(); return; }
  if (k === '4') { e.preventDefault(); openDraw(); return; }
  if (e.code === 'KeyF' || k === 'f') {
    // ⌘F finds in the open note (⌥⌘F with replace); ⇧⌘F, or ⌘F anywhere else, searches every note.
    e.preventDefault();
    if (e.shiftKey || !findBar.open({ replace: e.altKey })) setTab('ara');
    return;
  }
  if (k === 't' && e.shiftKey) { e.preventDefault(); if (state.contentView === 'note' && state.openNote) openTemplatePicker(); return; }
  if (k === 't') { e.preventDefault(); goToday(); return; }
  if (k === 'n') { e.preventDefault(); newNote(); return; }
  if (k === ',') { e.preventDefault(); openSettings(); return; }
  const foldScope = state.blockEdit ? state.blockEdit.scope
    : (state.contentView === 'note' && state.openNote && state.noteView === 'blocks' ? 'note' : null);
  if (e.altKey && (e.code === 'BracketLeft' || e.code === 'BracketRight')) { if (foldScope) { e.preventDefault(); foldAll(foldScope, e.code === 'BracketLeft'); } return; }
  if (e.code === 'Period' && !e.shiftKey && !e.altKey) { if (foldScope) { e.preventDefault(); toggleFoldHere(foldScope); } return; }
  if (e.key === '[' || e.code === 'BracketLeft') { if (!isTextTarget(e.target)) { e.preventDefault(); goNav(-1); } return; }
  if (e.key === ']' || e.code === 'BracketRight') { if (!isTextTarget(e.target)) { e.preventDefault(); goNav(1); } return; }
  if (k === '/') { e.preventDefault(); showShortcuts(); return; }
  if (e.code === 'Semicolon' && state.contentView === 'note' && state.openNote && state.noteView === 'blocks') { e.preventDefault(); startAddProperty('note'); return; }
  if (k === 'p' && e.shiftKey) { e.preventDefault(); plannerApi.newPlan(state.contentView === 'planner' && !isThisWeekShown() ? startOfWeek(state.weekDate) : new Date()); return; }
  if (k === 'o') { e.preventDefault(); openQuickSwitcher(); return; }
  if (e.code === 'KeyD' && e.shiftKey && !e.altKey && voice.handy) { e.preventDefault(); toggleDictation(); return; }
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
  loadSidebarWidth();
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
  const dailyText = res && !res.error ? res.content : null;
  state.dailyNote = { key: dayKey(now), content: dailyText, disk: dailyText };
  loadVoice();
  // Tabs come back as they were left, when there were several.
  let savedTabs = null;
  try { savedTabs = JSON.parse(localStorage.getItem('mufka-tabs') || 'null'); } catch { /* none */ }
  const restored = savedTabs && Array.isArray(savedTabs.tabs) && savedTabs.tabs.length > 1 && tabs.restore(savedTabs, navValid);
  const startAt = restored ? tabs.active.loc : null;
  loadSplit();
  render();
  if (startAt) await goTo(startAt);
  lastTick = Date.now();
  setInterval(() => checkDue(), 30000);
}

boot().catch((e) => { console.error('boot failed', e); render(); });

// Dev-only test hook; never present in packaged builds.
if (!plansApi.isPackaged) window.__mufkaCheckDue = checkDue;
// The test redraws the page when an async refresh would, at a chosen moment.
if (!plansApi.isPackaged) window.__mufkaRender = render;
