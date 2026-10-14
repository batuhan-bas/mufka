// Electron main process. Owns the window and all disk access. The renderer
// never touches the filesystem directly; it talks through the preload bridge.
// Bundled by electron-vite into out/main/index.js.

import { app, BrowserWindow, ipcMain, Notification, dialog, Menu, shell, nativeTheme, clipboard, nativeImage, protocol, safeStorage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import * as np from './lib/notespath.mjs';
import * as lk from './lib/links.mjs';
import * as at from './lib/attach.mjs';
import * as bm from './lib/bookmarks.mjs';
import { resolveVaultRoot, vaultChoiceError } from './lib/vault.mjs';
import { isExternalChange } from './lib/watch.mjs';
import { vaultLayout, attachmentsDirFor, hiddenAttachmentsFolder } from './lib/layout.mjs';
import * as wp from './lib/wispr.mjs';

// Where the renderer pages come from: the Vite dev server while developing
// (`electron-vite dev` sets ELECTRON_RENDERER_URL), the built files otherwise.
// __dirname is out/main in both cases.
function loadPage(win, page) {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devUrl) return win.loadURL(`${devUrl}/${page}`);
  return win.loadFile(path.join(__dirname, '../renderer', page));
}

// The custom scheme that serves vault attachments must be registered as a
// privileged (standard, secure) scheme before the app is ready, so the renderer
// CSP can allow it for img-src.
const ATTACH_SCHEME = 'mufka-att';
protocol.registerSchemesAsPrivileged([
  { scheme: ATTACH_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// Ensure the app name (and thus the userData folder and the first menu title)
// is "Mufka" even when run unpackaged in development. Packaged builds already
// get this from the bundle; this keeps dev consistent with production.
app.setName('Mufka');

const DATA_FILE = 'planlar.json';

function dataPath() {
  return path.join(app.getPath('userData'), DATA_FILE);
}

// Read the store as a parsed object, or null if there is no file yet.
// Migration lives in the renderer (shared lib); main stays format-agnostic.
function readStore() {
  const file = dataPath();
  try {
    const text = fs.readFileSync(file, 'utf8');
    return JSON.parse(text);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    // A corrupt file must not wipe the user's data. Keep a dated copy and
    // report the failure so the renderer can start from empty without saving
    // over the original until the user acts.
    if (err instanceof SyntaxError) {
      try {
        fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`);
      } catch (_) { /* best effort */ }
      return null;
    }
    throw err;
  }
}

// Write atomically: serialize to a temp file in the same directory, then rename
// over the real file. A crash mid-write leaves the original intact.
function writeStore(data) {
  writeFileAtomic(dataPath(), JSON.stringify(data, null, 2));
}

function writeFileAtomic(file, text) {
  const tmp = `${file}.tmp`;
  noteOwnWrite(file);
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

// --- settings -------------------------------------------------------------
// <userData>/settings.json: { vaultPath? }. Unknown keys are kept.

function settingsPath() { return path.join(app.getPath('userData'), 'settings.json'); }
function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) || {}; } catch { return {}; }
}
function writeSettings(patch) {
  const next = { ...readSettings(), ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  writeFileAtomic(settingsPath(), JSON.stringify(next, null, 2));
}

// --- notes vault --------------------------------------------------------
// The vault root is <userData>/Notlar unless the user chose another folder
// (Dosya > Vault klasörünü değiştir…), e.g. an existing Obsidian vault. Folders are real directories; notes are
// .md files at any depth. The renderer sends vault-relative paths; main ALWAYS
// re-sanitises every segment and checks the result is inside the vault AND that
// no symlink escapes it (np.realInside). Dotfiles/dot-dirs and non-.md files are
// ignored. Daily notes live in Günlük/YYYY-MM-DD.md; the Günlük folder itself
// cannot be renamed/moved/trashed.

// userData/Notes, or userData/Notlar where an older Mufka already keeps notes.
function defaultNotesRoot() {
  const legacy = path.join(app.getPath('userData'), 'Notlar');
  return isDir(legacy) ? legacy : path.join(app.getPath('userData'), 'Notes');
}
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
// Set at startup and when the user switches vaults.
let vault = { root: null, custom: false, missing: null };
function loadVault() { vault = resolveVaultRoot(readSettings(), defaultNotesRoot(), isDir); }
function notesRoot() { return vault.root || defaultNotesRoot(); }
// Where daily notes and new attachments go (lib/layout.mjs): the vault's own
// Obsidian settings if it has them, else the folders Mufka used before
// (Günlük, Ekler) if present, else Daily / Attachments. Re-read on each use —
// two tiny files — so a change in Obsidian applies right away.
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
function obsidianSettings() {
  const dir = path.join(notesRoot(), '.obsidian');
  if (!isDir(dir)) return null;
  return {
    dailyNotes: readJson(path.join(dir, 'daily-notes.json')) || undefined,
    app: readJson(path.join(dir, 'app.json')) || {},
    templates: readJson(path.join(dir, 'templates.json')) || undefined,
  };
}
// --- bookmarks ---
// Obsidian's .obsidian/bookmarks.json when the vault has an .obsidian folder
// (so both apps share them); otherwise kept in settings.json per vault folder,
// because Mufka never adds folders to a vault on its own.
function bookmarksRead() {
  const dir = path.join(notesRoot(), '.obsidian');
  if (isDir(dir)) return bm.normalizeBookmarks(readJson(path.join(dir, 'bookmarks.json')));
  const all = readSettings().bookmarks || {};
  return bm.normalizeBookmarks(all[notesRoot()]);
}
function bookmarksWrite(json) {
  const dir = path.join(notesRoot(), '.obsidian');
  if (isDir(dir)) { writeFileAtomic(path.join(dir, 'bookmarks.json'), JSON.stringify(json, null, 2)); return; }
  writeSettings({ bookmarks: { ...(readSettings().bookmarks || {}), [notesRoot()]: json } });
}
function bookmarksToggle(rel) {
  const r = at.normalizeRel(String(rel || ''));
  if (!r) throw new Error('Not a note');
  safeAbs(r); // inside the vault
  const next = bm.toggleBookmark(bookmarksRead(), r);
  bookmarksWrite(next);
  return bm.bookmarkedPaths(next);
}
function bookmarksFollow(oldRel, newRel) {
  try {
    const cur = bookmarksRead();
    const next = bm.renameBookmark(cur, oldRel, newRel);
    if (JSON.stringify(next) !== JSON.stringify(cur)) bookmarksWrite(next);
  } catch { /* bookmarks are a convenience: never fail a rename for them */ }
}

function layout() { return vaultLayout(obsidianSettings(), (name) => isDir(path.join(notesRoot(), name))); }
function dailyRoot() { return path.join(notesRoot(), ...layout().daily.split('/').filter(Boolean)); }
// Only the vault root itself is created on demand. Günlük and Ekler appear when
// the first daily note / attachment is written, so opening an existing folder
// (e.g. an Obsidian vault) does not add folders to it.
function ensureNotesDirs() { fs.mkdirSync(notesRoot(), { recursive: true }); }

// Resolve a vault-relative path to a safe absolute path, or throw.
function safeAbs(rel) {
  ensureNotesDirs();
  const abs = np.vaultPath(notesRoot(), rel || '');
  if (!np.isInside(notesRoot(), abs) || !np.realInside(notesRoot(), abs, fs)) {
    throw new Error('invalid path');
  }
  return abs;
}

// --- attachments (<vault>/Ekler) ----------------------------------------

// Vault-relative folder that new attachments of a note in `noteDir` go to.
function attachDirRel(noteDir) { return attachmentsDirFor(layout(), String(noteDir || '')); }
function attachDirAbs(noteDir) { return safeAbs(attachDirRel(noteDir)); }

// Resolve a vault-relative path to a file to serve or open: anywhere in the
// vault (notes from other tools keep images next to them), but never outside
// it — no traversal, no dot folders (.obsidian, .git), no symlink escape.
function attachAbs(rel) {
  const norm = at.normalizeRel(String(rel || ''));
  if (!norm || norm.split('/').some((seg) => seg.startsWith('.'))) throw new Error('invalid attachment path');
  const abs = path.join(notesRoot(), ...norm.split('/'));
  if (!np.isInside(notesRoot(), abs) || !np.realInside(notesRoot(), abs, fs)) throw new Error('invalid attachment path');
  return abs;
}

// Vault-relative paths of every non-note file (images, PDFs…), for resolving
// links. Same walk rules as walkVault: no dot entries, no symlinks.
function vaultFiles() {
  const out = [];
  const walk = (absDir, rel) => {
    let entries;
    try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(absDir, e.name), childRel);
      else if (e.isFile() && !e.name.toLowerCase().endsWith('.md')) out.push(childRel);
    }
  };
  walk(notesRoot(), '');
  return out;
}

// Sanitise a file name, preserving its extension, and make it unique in the
// folder `dirAbs` (created if needed).
function uniqueAttachName(rawName, dirAbs) {
  fs.mkdirSync(dirAbs, { recursive: true });
  const dot = String(rawName || '').lastIndexOf('.');
  const ext = dot > 0 ? rawName.slice(dot).toLowerCase() : '';
  const base = np.sanitizeTitle(dot > 0 ? rawName.slice(0, dot) : rawName);
  const existing = new Set(fs.readdirSync(dirAbs).map((n) => n.toLowerCase()));
  let name = `${base}${ext}`;
  for (let n = 2; existing.has(name.toLowerCase()); n += 1) name = `${base} ${n}${ext}`;
  return name;
}

// Copy a source file into the attachment folder of a note in `noteDir` (size +
// type checked). Returns { rel, name, isImage } (rel = vault path) or { error }.
function copyIntoAttachments(srcAbs, suggestedName, noteDir) {
  let st;
  try { st = fs.statSync(srcAbs); } catch { return { error: 'Could not read the file' }; }
  if (!st.isFile()) return { error: 'Could not read the file' };
  if (st.size > at.MAX_ATTACH_BYTES) return { error: 'File too large (50 MB max)' };
  const dirRel = attachDirRel(noteDir);
  const dirAbs = attachDirAbs(noteDir);
  const name = uniqueAttachName(suggestedName || path.basename(srcAbs), dirAbs);
  fs.copyFileSync(srcAbs, path.join(dirAbs, name));
  return { rel: dirRel ? `${dirRel}/${name}` : name, name, isImage: at.isImageName(name) };
}

function attachAddFiles(paths, noteDir) {
  const out = [];
  for (const p of (Array.isArray(paths) ? paths : [])) {
    if (typeof p !== 'string' || !p) continue;
    out.push(copyIntoAttachments(p, path.basename(p), noteDir));
  }
  return out;
}

// Since Electron 43 a dialog without defaultPath always opens in Downloads and
// the OS no longer restores the last folder. Keep the old behaviour: start in
// the folder the user last picked (Documents until then).
let lastDialogDir = null;
function dialogPath(fileName = '') {
  return path.join(lastDialogDir || app.getPath('documents'), fileName);
}
function rememberDialogDir(filePath) {
  if (filePath) lastDialogDir = path.dirname(filePath);
}

async function attachPick(noteDir) {
  const res = await dialog.showOpenDialog({ title: 'Attach Files', defaultPath: dialogPath(), properties: ['openFile', 'multiSelections'] });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  rememberDialogDir(res.filePaths[0]);
  return { files: attachAddFiles(res.filePaths, noteDir) };
}

// The first image on the clipboard as PNG bytes, or null. Electron 44 replaced
// clipboard.readImage() with the W3C-style async clipboard.read(); other image
// types (e.g. TIFF from some macOS apps) are converted to PNG.
async function readClipboardPng() {
  for (const item of await clipboard.read()) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (!type) continue;
    const bytes = Buffer.from(await (await item.getType(type)).arrayBuffer());
    if (type === 'image/png') return bytes;
    const img = nativeImage.createFromBuffer(bytes);
    return img.isEmpty() ? null : img.toPNG();
  }
  return null;
}

// Save the clipboard image (if any) into the note's attachment folder with a
// dated name.
async function attachPaste(noteDir) {
  const png = await readClipboardPng();
  if (!png) return { error: 'No image on the clipboard' };
  const now = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())} ${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`;
  const dirRel = attachDirRel(noteDir);
  const dirAbs = attachDirAbs(noteDir);
  const name = uniqueAttachName(`Pasted image ${stamp}.png`, dirAbs);
  fs.writeFileSync(path.join(dirAbs, name), png);
  return { rel: dirRel ? `${dirRel}/${name}` : name, name, isImage: true };
}

// The fixed attachment folder whose unused files can be cleaned up, or null.
// Never the vault root or per-note folders: those hold the user's other files.
function cleanableAttachDir() {
  const L = layout();
  return !L.relative && L.attachments ? L.attachments : null;
}

// File names directly in that folder.
function eklerNames() {
  const dir = cleanableAttachDir();
  if (!dir || !isDir(safeAbs(dir))) return [];
  return fs.readdirSync(safeAbs(dir), { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => e.name);
}

function attachUnused() {
  const names = eklerNames();
  const contents = collectNotes().map((n) => n.content);
  return at.unusedAttachments(names, contents);
}

async function attachTrash(names) {
  for (const name of (Array.isArray(names) ? names : [])) {
    const dir = cleanableAttachDir();
    if (!dir) break;
    try { await shell.trashItem(attachAbs(`${dir}/${name}`)); } catch { /* skip */ }
  }
  return { ok: true };
}

// Open in the default app — except files that would run code (a script or an
// app linked from a note), which are only shown in Finder.
function attachOpen(rel) {
  const abs = attachAbs(rel);
  if (at.isExecutableName(abs)) shell.showItemInFolder(abs);
  else shell.openPath(abs);
  return { ok: true };
}

// The daily notes folder: shown in the tree but cannot be renamed/moved/trashed.
function isGunlukRoot(rel) { const d = layout().daily; return d !== '' && rel === d; }
function relOf(abs) { return np.relFromAbs(notesRoot(), abs); }
function isDescendantRel(ancestor, other) {
  if (!ancestor) return Boolean(other);
  return other === ancestor || other.startsWith(`${ancestor}/`);
}

// Sibling base names in a folder (note titles, or subfolder names when dirs).
function siblingNames(folderAbs, dirs) {
  try {
    return fs.readdirSync(folderAbs, { withFileTypes: true })
      .filter((e) => (e.name.startsWith('.') ? false : (dirs ? e.isDirectory() : (e.isFile() && e.name.toLowerCase().endsWith('.md')))))
      .map((e) => (dirs ? e.name : e.name.replace(/\.md$/i, '')));
  } catch { return []; }
}

// Walk the whole vault (never following symlinks), returning flat folders+notes.
function walkVault() {
  ensureNotesDirs();
  const hidden = hiddenAttachmentsFolder(layout());
  const folders = []; const notes = [];
  const walk = (absDir, rel) => {
    let entries;
    try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
      if (!rel && e.name === hidden && e.isDirectory()) continue; // the attachments folder
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      const childAbs = path.join(absDir, e.name);
      if (e.isDirectory()) { folders.push({ rel: childRel }); walk(childAbs, childRel); }
      else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        let st; try { st = fs.statSync(childAbs); } catch { continue; }
        notes.push({ rel: childRel, mtime: st.mtimeMs });
      }
    }
  };
  walk(notesRoot(), '');
  return { folders, notes };
}

function readNoteRel(rel) {
  const abs = safeAbs(rel);
  try { return { rel, content: fs.readFileSync(abs, 'utf8'), mtime: fs.statSync(abs).mtimeMs }; }
  catch (err) { if (err.code === 'ENOENT') return null; throw err; }
}

function writeNoteRel(rel, content) {
  const abs = safeAbs(rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  writeFileAtomic(abs, String(content ?? ''));
  return { rel, mtime: fs.statSync(abs).mtimeMs };
}

function createNote(parentRel, name) {
  const folderAbs = safeAbs(parentRel || '');
  fs.mkdirSync(folderAbs, { recursive: true });
  const unique = np.resolveUniqueName(np.sanitizeTitle(name || 'Untitled'), new Set(siblingNames(folderAbs, false)));
  const rel = relOf(path.join(folderAbs, `${unique}.md`));
  writeFileAtomic(safeAbs(rel), '');
  return { rel };
}

function createFolder(parentRel, name) {
  const folderAbs = safeAbs(parentRel || '');
  fs.mkdirSync(folderAbs, { recursive: true });
  const unique = np.resolveUniqueName(np.sanitizeTitle(name || 'New Folder'), new Set(siblingNames(folderAbs, true)));
  const rel = relOf(path.join(folderAbs, unique));
  fs.mkdirSync(safeAbs(rel));
  return { rel };
}

// Read every note's current content (keyed by its pre-change rel), so links can
// be resolved against the vault as it is BEFORE a rename/move.
function collectNotes() {
  const { notes } = walkVault();
  const out = [];
  for (const n of notes) {
    try { out.push({ rel: n.rel, content: fs.readFileSync(safeAbs(n.rel), 'utf8') }); } catch { /* skip unreadable */ }
  }
  return out;
}

// After `oldRel` became `newRel`, rewrite inbound links across the vault and
// write the changed files atomically. Returns how many links were updated and
// how many could not be (so the UI can report a partial failure).
function applyLinkRewrite(before, oldRel, newRel) {
  bookmarksFollow(oldRel, newRel);
  const { files } = lk.rewriteVaultLinks({ notes: before, oldRel, newRel });
  let linksUpdated = 0;
  let linksFailed = 0;
  for (const f of files) {
    try { writeFileAtomic(safeAbs(f.rel), f.content); linksUpdated += f.count; }
    catch { linksFailed += f.count; }
  }
  return { linksUpdated, linksFailed };
}

function renameNoteRel(rel, newName) {
  const abs = safeAbs(rel);
  const folderAbs = path.dirname(abs);
  const current = np.titleFromFile(path.basename(rel));
  const existing = siblingNames(folderAbs, false).filter((t) => t.toLowerCase() !== current.toLowerCase());
  const unique = np.resolveUniqueName(np.sanitizeTitle(newName), new Set(existing));
  const toRel = relOf(path.join(folderAbs, `${unique}.md`));
  if (toRel === rel) return { rel: toRel, linksUpdated: 0, linksFailed: 0 };
  const before = collectNotes();
  fs.renameSync(abs, safeAbs(toRel));
  return { rel: toRel, ...applyLinkRewrite(before, rel, toRel) };
}

function renameFolder(rel, newName) {
  if (isGunlukRoot(rel)) throw new Error('The daily notes folder cannot be renamed');
  const abs = safeAbs(rel);
  const parentAbs = path.dirname(abs);
  const current = path.basename(rel);
  const existing = siblingNames(parentAbs, true).filter((n) => n.toLowerCase() !== current.toLowerCase());
  const unique = np.resolveUniqueName(np.sanitizeTitle(newName), new Set(existing));
  const toRel = relOf(path.join(parentAbs, unique));
  if (toRel === rel) return { rel: toRel, linksUpdated: 0, linksFailed: 0 };
  const before = collectNotes();
  fs.renameSync(abs, safeAbs(toRel));
  return { rel: toRel, ...applyLinkRewrite(before, rel, toRel) };
}

function moveEntry(srcRel, destFolderRel) {
  if (isGunlukRoot(srcRel)) throw new Error('The daily notes folder cannot be moved');
  const srcAbs = safeAbs(srcRel);
  const isFolder = fs.statSync(srcAbs).isDirectory();
  const dest = destFolderRel || '';
  const srcParent = srcRel.includes('/') ? srcRel.slice(0, srcRel.lastIndexOf('/')) : '';
  if (srcParent === dest) return { rel: srcRel }; // already there
  if (isFolder && (dest === srcRel || isDescendantRel(srcRel, dest))) throw new Error('A folder cannot be moved into itself');
  const destAbs = safeAbs(dest);
  fs.mkdirSync(destAbs, { recursive: true });
  const base = isFolder ? path.basename(srcRel) : np.titleFromFile(path.basename(srcRel));
  const unique = np.resolveUniqueName(base, new Set(siblingNames(destAbs, isFolder)));
  const toRel = relOf(path.join(destAbs, isFolder ? unique : `${unique}.md`));
  const before = collectNotes();
  fs.renameSync(srcAbs, safeAbs(toRel));
  return { rel: toRel, ...applyLinkRewrite(before, srcRel, toRel) };
}

async function trashNote(rel) { await shell.trashItem(safeAbs(rel)); return { ok: true }; }
async function trashFolder(rel) {
  if (isGunlukRoot(rel)) throw new Error('The daily notes folder cannot be deleted');
  await shell.trashItem(safeAbs(rel));
  return { ok: true };
}

function readDaily(dateKey) {
  const p = np.dailyFilePath(dailyRoot(), dateKey);
  if (!np.isInside(notesRoot(), p)) throw new Error('invalid daily path');
  try {
    return { content: fs.readFileSync(p, 'utf8'), mtime: fs.statSync(p).mtimeMs };
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function writeDaily(dateKey, content) {
  fs.mkdirSync(dailyRoot(), { recursive: true });
  const p = np.dailyFilePath(dailyRoot(), dateKey);
  if (!np.isInside(notesRoot(), p)) throw new Error('invalid daily path');
  writeFileAtomic(p, String(content ?? ''));
  return { ok: true };
}

async function deleteDaily(dateKey) {
  const p = np.dailyFilePath(dailyRoot(), dateKey);
  if (!np.isInside(notesRoot(), p)) throw new Error('invalid daily path');
  await shell.trashItem(p);
  return { ok: true };
}

// --- export -------------------------------------------------------------

async function exportMarkdown(title, content) {
  const res = await dialog.showSaveDialog({
    title: 'Export as Markdown',
    defaultPath: dialogPath(np.exportFileName(title, 'md')),
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  rememberDialogDir(res.filePath);
  fs.writeFileSync(res.filePath, String(content ?? ''), 'utf8');
  return { ok: true, path: res.filePath };
}

async function exportPDF(title, src, noteDir = '') {
  const res = await dialog.showSaveDialog({
    title: 'Export as PDF',
    defaultPath: dialogPath(np.exportFileName(title, 'pdf')),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  rememberDialogDir(res.filePath);
  const win = new BrowserWindow({
    show: false, width: 820, height: 1040,
    webPreferences: { contextIsolation: true, sandbox: true, offscreen: false },
  });
  try {
    await loadPage(win, 'src/export.html');
    const files = vaultFiles();
    // Wait for the module to define __renderNote, then render.
    await win.webContents.executeJavaScript(`new Promise((resolve) => {
      const go = () => { if (window.__renderNote) { window.__renderNote(${JSON.stringify(title)}, ${JSON.stringify(src)}, ${JSON.stringify(files)}, ${JSON.stringify(String(noteDir || ''))}); resolve(true); } else setTimeout(go, 10); };
      go();
    })`);
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.79, bottom: 0.79, left: 0.79, right: 0.79 },
    });
    fs.writeFileSync(res.filePath, pdf);
    return { ok: true, path: res.filePath };
  } finally {
    win.destroy();
  }
}

const ATTACH_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
};

// Serve vault attachments over the custom scheme, resolving ONLY paths that are
// a direct child of Ekler inside the vault (attachAbs rejects traversal and
// symlink escape). Anything else 404s.
function registerAttachProtocol() {
  protocol.handle(ATTACH_SCHEME, (request) => {
    try {
      const u = new URL(request.url);
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      const abs = attachAbs(rel);
      const buf = fs.readFileSync(abs);
      const ext = path.extname(abs).toLowerCase();
      return new Response(buf, { headers: { 'content-type': ATTACH_MIME[ext] || 'application/octet-stream' } });
    } catch {
      return new Response('', { status: 404 });
    }
  });
}

// --- Wispr Flow connection -------------------------------------------------
// Mufka is a client of Wispr Flow's read-only MCP server. Signing in happens in
// the default browser (OAuth: dynamic client registration + PKCE); the browser
// returns to a one-shot server on 127.0.0.1. The registration and the tokens
// are stored encrypted with safeStorage (a key in the macOS Keychain) and never
// reach the renderer. All network use is here, in main, and only after the
// user connects.

const WISPR_FILE = 'wispr.bin';
function wisprPath() { return path.join(app.getPath('userData'), WISPR_FILE); }
function wisprRead() {
  try {
    return JSON.parse(safeStorage.decryptString(Buffer.from(fs.readFileSync(wisprPath(), 'utf8'), 'base64'))) || {};
  } catch { return {}; }
}
function wisprWrite(state) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('macOS did not allow Mufka to encrypt the sign-in');
  fs.mkdirSync(path.dirname(wisprPath()), { recursive: true });
  writeFileAtomic(wisprPath(), safeStorage.encryptString(JSON.stringify(state)).toString('base64'));
}
function wisprPatch(patch) {
  const next = { ...wisprRead(), ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  wisprWrite(next);
}

// The SDK drives discovery, registration, PKCE, token exchange and refresh
// through this provider. `onRedirect` opens the sign-in page; outside of
// "Connect" there is nobody to sign in, so it fails instead.
function wisprProvider(redirectUrl, state, onRedirect) {
  let verifier = null;
  return {
    get redirectUrl() { return redirectUrl; },
    get clientMetadata() { return wp.clientMetadata(redirectUrl); },
    state: () => state,
    clientInformation: () => { const s = wisprRead(); return s.redirectUrl === redirectUrl ? s.client : undefined; },
    saveClientInformation: (client) => wisprPatch({ client, redirectUrl }),
    tokens: () => wisprRead().tokens,
    saveTokens: (tokens) => wisprPatch({ tokens }),
    redirectToAuthorization: (url) => onRedirect(url),
    saveCodeVerifier: (v) => { verifier = v; },
    codeVerifier: () => { if (!verifier) throw new Error('No sign-in in progress'); return verifier; },
    invalidateCredentials: (scope) => {
      if (scope === 'all' || scope === 'client') wisprPatch({ client: undefined, tokens: undefined });
      else if (scope === 'tokens') wisprPatch({ tokens: undefined });
    },
  };
}

let wisprSignIn = null; // { cancel }

// One-shot loopback server on 127.0.0.1 (the port of the last sign-in when it
// is free, so the registered redirect stays valid; else any free port).
function wisprListen(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', (err) => {
      if (port && err.code === 'EADDRINUSE') wisprListen(0).then(resolve, reject);
      else reject(err);
    });
    server.listen(port || 0, '127.0.0.1', () => resolve(server));
  });
}

async function wisprConnect() {
  if (wisprSignIn) throw new Error('Already signing in');
  const saved = wisprRead();
  const server = await wisprListen(saved.port);
  const port = server.address().port;
  const redirectUrl = wp.redirectUrlFor(port);
  const state = crypto.randomBytes(16).toString('hex');
  let cancel;
  const code = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Sign-in took too long; try again')), wp.SIGN_IN_TIMEOUT_MS);
    cancel = () => { clearTimeout(timer); reject(new Error('cancelled')); };
    server.on('request', (req, res) => {
      const r = wp.parseCallback(req.url, state);
      if (!r) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(wp.callbackPage(r.ok));
      clearTimeout(timer);
      if (r.ok) resolve(r.code); else reject(new Error(r.error));
    });
  });
  code.catch(() => {});
  wisprSignIn = { cancel };
  try {
    const provider = wisprProvider(redirectUrl, state, (url) => {
      if (!/^https:\/\//.test(url.href)) throw new Error('Unexpected sign-in address');
      shell.openExternal(url.href);
    });
    let result = await auth(provider, { serverUrl: wp.MCP_URL });
    if (result !== 'AUTHORIZED') {
      result = await auth(provider, { serverUrl: wp.MCP_URL, authorizationCode: await code });
      if (result !== 'AUTHORIZED') throw new Error('Wispr Flow did not authorize Mufka');
    }
    wisprPatch({ port, redirectUrl });
    const account = await wisprAccount();
    return { ok: true, account };
  } catch (err) {
    if (err.message === 'cancelled') return { cancelled: true };
    throw err;
  } finally {
    wisprSignIn = null;
    server.close();
  }
}

// Run `fn(client)` on a fresh MCP session with the stored sign-in. When the
// tokens are gone and cannot be refreshed, the user has to connect again.
async function wisprSession(fn) {
  const s = wisprRead();
  if (!s.tokens) throw new Error('Wispr Flow is not connected');
  const provider = wisprProvider(s.redirectUrl, null, () => {
    wisprPatch({ tokens: undefined });
    throw new Error('Wispr Flow signed Mufka out; connect again in Settings');
  });
  const client = new Client({ name: 'Mufka', version: app.getVersion() });
  await client.connect(new StreamableHTTPClientTransport(new URL(wp.MCP_URL), { authProvider: provider }));
  try { return await fn(client); } finally { await client.close().catch(() => {}); }
}

// Who is signed in, and which tools the server offers (kept, without any
// content, so imports can follow the server's own descriptions).
async function wisprAccount() {
  return wisprSession(async (client) => {
    const { tools } = await client.listTools();
    const summary = tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
    fs.writeFileSync(path.join(app.getPath('userData'), 'wispr-tools.json'), JSON.stringify(summary, null, 2));
    const tool = wp.findTool(tools, /account/i);
    const name = tool ? wp.accountName(await client.callTool({ name: tool.name, arguments: {} })) : '';
    wisprPatch({ account: name || 'Wispr Flow account', tools: tools.map((t) => t.name) });
    return name || 'Wispr Flow account';
  });
}

function wisprStatus() {
  const s = wisprRead();
  return { connected: Boolean(s.tokens), account: s.account || null, signingIn: Boolean(wisprSignIn) };
}

// Forget the sign-in on this Mac (Wispr Flow offers no revocation endpoint;
// the access can also be removed in Wispr Flow's own settings).
function wisprDisconnect() {
  if (wisprSignIn) wisprSignIn.cancel();
  fs.rmSync(wisprPath(), { force: true });
  fs.rmSync(path.join(app.getPath('userData'), 'wispr-tools.json'), { force: true });
  return { ok: true };
}

// Send a menu action to the renderer (export / import / search).
function sendMenu(action) {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (win) win.webContents.send('menu:action', action);
}

// Application menu. Role items get Electron's standard labels. Undo/redo are
// intentionally left out so Cmd+Z and
// Cmd+F reach the renderer (plan-undo and search), not a native menu role.
function buildMenu() {
  const appName = app.name; // "Mufka"
  const template = [
    {
      label: appName,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', click: () => sendMenu('settings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Note', click: () => sendMenu('new-note') },
        { label: 'Quick Switcher…', click: () => sendMenu('switcher') },
        { label: 'Command Palette…', click: () => sendMenu('commands') },
        { label: 'Open Random Note', click: () => sendMenu('random-note') },
        { type: 'separator' },
        { label: 'Export Plans…', click: () => sendMenu('export') },
        { label: 'Import Plans…', click: () => sendMenu('import') },
        { type: 'separator' },
        { id: 'vault-choose', label: 'Open Notes Folder…', click: () => chooseVault() },
        { id: 'vault-default', label: 'Use Default Notes Folder', enabled: vault.custom, click: () => setVault(null) },
        { label: 'Show Notes Folder in Finder', click: () => { ensureNotesDirs(); shell.showItemInFolder(notesRoot()); } },
        { type: 'separator' },
        { label: 'Show Unused Attachments', click: () => sendMenu('unused-attachments') },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Planner', click: () => sendMenu('tab:takvim') },
        { label: 'Notes', click: () => sendMenu('tab:notlar') },
        { label: 'Search', click: () => sendMenu('tab:ara') },
        { type: 'separator' },
        { label: 'Toggle Sidebar', click: () => sendMenu('toggle-sidebar') },
        { label: 'Toggle Right Sidebar', click: () => sendMenu('rightbar') },
        { type: 'separator' },
        { label: 'Back', click: () => sendMenu('nav-back') },
        { label: 'Forward', click: () => sendMenu('nav-forward') },
        { type: 'separator' },
        { label: 'Graph View', click: () => sendMenu('graph') },
        { label: 'Local Graph', click: () => sendMenu('graph-local') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      role: 'windowMenu',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' },
      ],
    },
    {
      role: 'help',
      submenu: [{ label: 'Keyboard Shortcuts', click: () => sendMenu('shortcuts') }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- watching the vault ----------------------------------------------------
// Notes changed by another app (Obsidian, iCloud, git, Finder) show up right
// away instead of on the next window focus. macOS reports changes for the
// whole tree through one recursive fs.watch (FSEvents).

const OWN_WRITE_MS = 1500;
const ownWrites = new Map(); // absolute path -> time Mufka last wrote it
function noteOwnWrite(file) {
  const now = Date.now();
  for (const [p, t] of ownWrites) if (now - t > OWN_WRITE_MS) ownWrites.delete(p);
  ownWrites.set(path.resolve(file), now);
}

let watcher = null;
let changeTimer = null;
function watchVault() {
  if (watcher) { watcher.close(); watcher = null; }
  const root = notesRoot();
  if (!isDir(root)) return;
  try {
    watcher = fs.watch(root, { recursive: true }, (_type, filename) => {
      if (!isExternalChange(root, filename ? String(filename) : '', ownWrites, Date.now(), OWN_WRITE_MS)) return;
      // Coalesce bursts (a git checkout, a sync) into one refresh.
      clearTimeout(changeTimer);
      changeTimer = setTimeout(() => {
        for (const w of BrowserWindow.getAllWindows()) w.webContents.send('notes:changed');
      }, 250);
    });
    watcher.on('error', () => { watcher?.close(); watcher = null; });
  } catch {
    watcher = null; // e.g. the folder vanished; focus refresh still works
  }
}

// --- switching the vault --------------------------------------------------

// Remember the folder (null = back to the default), rebuild the menu and reload
// every window so all views start clean against the new vault.
function setVault(folder) {
  writeSettings({ vaultPath: folder || undefined });
  loadVault();
  watchVault();
  buildMenu();
  for (const w of BrowserWindow.getAllWindows()) w.reload();
}

async function chooseVault() {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const res = await dialog.showOpenDialog(win, {
    title: 'Open Notes Folder',
    message: 'The folder your notes live in (e.g. an Obsidian vault). Its .md files become your notes.',
    defaultPath: dialogPath(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths.length) return;
  const folder = res.filePaths[0];
  const error = vaultChoiceError(folder, { home: app.getPath('home'), userData: app.getPath('userData') });
  if (error) {
    await dialog.showMessageBox(win, { type: 'warning', message: error, detail: folder });
    return;
  }
  setVault(folder);
}

// A saved vault that is gone (unplugged drive, renamed folder) falls back to the
// default for this session; the setting is kept so it comes back with the drive.
function warnIfVaultMissing(win) {
  if (!vault.missing) return;
  dialog.showMessageBox(win, {
    type: 'warning',
    message: 'Notes folder not found',
    detail: `${vault.missing}\n\nUsing the default notes folder. Restart Mufka when the folder is back, or choose another one with File > Open Notes Folder….`,
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 640,
    minHeight: 480,
    title: 'Mufka',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  loadPage(win, 'index.html');
  // Re-read notes when the window regains focus, so edits made in another app
  // (or Finder) show up.
  win.on('focus', () => win.webContents.send('notes:changed'));
  return win;
}

// Synchronous so the renderer can gate dev-only hooks at module load.
ipcMain.on('mufka:isPackaged', (event) => { event.returnValue = app.isPackaged; });

ipcMain.handle('planner:load', () => readStore());

ipcMain.handle('planner:save', (_event, data) => {
  writeStore(data);
  return { ok: true };
});

// Show a native notification for a plan whose time has arrived. The renderer
// decides what is due (shared lib) and asks main to display it.
ipcMain.handle('planner:notify', (event, payload) => {
  const title = typeof payload?.title === 'string' ? payload.title : 'Mufka';
  const body = typeof payload?.body === 'string' ? payload.body : '';
  // When the system notification cannot be shown, the window shows the
  // reminder itself instead of losing it.
  const fallback = () => { if (!event.sender.isDestroyed()) event.sender.send('planner:notifyFailed', { title, body }); };
  if (!Notification.isSupported()) { fallback(); return { ok: false }; }
  const n = new Notification({ title, body });
  n.on('click', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) { win.show(); win.focus(); }
  });
  // Since Electron 42 macOS notifications use UNNotification, which requires a
  // code-signed app; unsigned builds get 'failed' instead of a notification.
  n.on('failed', (_e, error) => { console.warn(`Notification failed: ${error}`); fallback(); });
  n.show();
  return { ok: true };
});

function pad2(n) { return String(n).padStart(2, '0'); }

// Export the current store to a user-chosen JSON file.
ipcMain.handle('planner:export', async (_event, data) => {
  const now = new Date();
  const name = `mufka-backup-${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}.json`;
  const res = await dialog.showSaveDialog({
    title: 'Export Plans',
    defaultPath: dialogPath(name),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  rememberDialogDir(res.filePath);
  fs.writeFileSync(res.filePath, JSON.stringify(data, null, 2), 'utf8');
  return { ok: true, path: res.filePath };
});

// Read a user-chosen JSON file and hand its contents to the renderer, which
// migrates and merges. Main never touches the real store during import.
ipcMain.handle('planner:import', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Import Plans',
    defaultPath: dialogPath(),
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  rememberDialogDir(res.filePaths[0]);
  try {
    const text = fs.readFileSync(res.filePaths[0], 'utf8');
    return { data: JSON.parse(text) };
  } catch (err) {
    return { error: err.message };
  }
});

// Notes IPC. Each handler wraps a helper and reports errors as { error }.
function wrap(fn) {
  return async (_e, ...args) => {
    try { return await fn(...args); } catch (err) { return { error: err.message }; }
  };
}
ipcMain.handle('notes:tree', wrap(() => walkVault()));
ipcMain.handle('notes:all', wrap(() => collectNotes()));
ipcMain.handle('notes:read', wrap((rel) => readNoteRel(rel)));
ipcMain.handle('notes:write', wrap((rel, content) => writeNoteRel(rel, content)));
ipcMain.handle('notes:create', wrap((parentRel, name) => createNote(parentRel, name)));
ipcMain.handle('notes:createFolder', wrap((parentRel, name) => createFolder(parentRel, name)));
ipcMain.handle('notes:rename', wrap((rel, newName) => renameNoteRel(rel, newName)));
ipcMain.handle('notes:renameFolder', wrap((rel, newName) => renameFolder(rel, newName)));
ipcMain.handle('notes:move', wrap((srcRel, destFolderRel) => moveEntry(srcRel, destFolderRel)));
ipcMain.handle('notes:delete', wrap((rel) => trashNote(rel)));
ipcMain.handle('notes:deleteFolder', wrap((rel) => trashFolder(rel)));
ipcMain.handle('notes:dailyDates', wrap(() => {
  if (!isDir(dailyRoot())) return [];
  return fs.readdirSync(dailyRoot())
    .filter((n) => /^\d{4}-\d{2}-\d{2}\.md$/.test(n))
    .map((n) => n.replace(/\.md$/, ''));
}));
ipcMain.handle('notes:readDaily', wrap((dateKey) => readDaily(dateKey)));
ipcMain.handle('notes:writeDaily', wrap((dateKey, content) => writeDaily(dateKey, content)));
ipcMain.handle('notes:deleteDaily', wrap((dateKey) => deleteDaily(dateKey)));
ipcMain.handle('vault:info', wrap(() => ({ name: path.basename(notesRoot()), path: notesRoot(), custom: vault.custom })));
ipcMain.handle('vault:choose', wrap(async () => { await chooseVault(); return { ok: true }; }));
ipcMain.handle('vault:useDefault', wrap(() => { setVault(null); return { ok: true }; }));
ipcMain.handle('notes:reveal', wrap(() => { ensureNotesDirs(); shell.showItemInFolder(notesRoot()); return { ok: true }; }));
ipcMain.handle('attach:list', wrap(() => vaultFiles()));
ipcMain.handle('attach:paste', wrap((noteDir) => attachPaste(noteDir)));
ipcMain.handle('attach:pick', wrap((noteDir) => attachPick(noteDir)));
ipcMain.handle('attach:addFiles', wrap((paths, noteDir) => attachAddFiles(paths, noteDir)));
ipcMain.handle('notes:layout', wrap(() => layout()));
ipcMain.handle('bookmarks:list', wrap(() => bm.bookmarkedPaths(bookmarksRead())));
ipcMain.handle('bookmarks:toggle', wrap((rel) => bookmarksToggle(rel)));
ipcMain.handle('attach:open', wrap((rel) => attachOpen(rel)));
ipcMain.handle('attach:unused', wrap(() => attachUnused()));
ipcMain.handle('attach:trash', wrap((names) => attachTrash(names)));
ipcMain.handle('app:copy', wrap(async (text) => { await clipboard.writeText(String(text ?? '')); return { ok: true }; }));
ipcMain.handle('notes:exportMarkdown', wrap((title, content) => exportMarkdown(title, content)));
ipcMain.handle('notes:exportPDF', wrap((title, src, noteDir) => exportPDF(title, src, noteDir)));
ipcMain.handle('wispr:status', wrap(() => wisprStatus()));
ipcMain.handle('wispr:connect', wrap(() => wisprConnect()));
ipcMain.handle('wispr:cancel', wrap(() => { if (wisprSignIn) wisprSignIn.cancel(); return { ok: true }; }));
ipcMain.handle('wispr:disconnect', wrap(() => wisprDisconnect()));
ipcMain.handle('wispr:refresh', wrap(async () => ({ account: await wisprAccount() })));
ipcMain.handle('notes:openExternal', wrap((url) => {
  if (!/^https?:\/\//i.test(String(url))) return { error: 'blocked' };
  shell.openExternal(url);
  return { ok: true };
}));

// Security: no page of the app may navigate away from what main loaded (e.g. a
// file dropped outside a drop zone, or a link that escaped the renderer's click
// handling), open new windows, or attach webviews. Navigating would load a page
// that still gets the preload bridge. http(s) window.open targets go to the
// default browser instead, like every other external link.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event) => event.preventDefault());
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
});

app.whenReady().then(() => {
  // The UI is dark-only; force the native chrome (title bar, menus) to match
  // regardless of the system appearance.
  nativeTheme.themeSource = 'dark';
  // Unpackaged runs use node_modules' Electron.app, whose bundle icon is
  // Electron's; show the Mufka icon in the Dock instead. Packaged builds get it
  // from the bundle (build/icon.icns).
  if (!app.isPackaged && process.platform === 'darwin') {
    const icon = path.join(app.getAppPath(), 'build/icon.png');
    if (fs.existsSync(icon)) app.dock.setIcon(icon);
  }
  loadVault();
  ensureNotesDirs();
  watchVault();
  registerAttachProtocol();
  buildMenu();
  const win = createWindow();
  win.webContents.once('did-finish-load', () => warnIfVaultMissing(win));
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

