// The main process's file access to the vault: every path is checked to be
// inside it (no traversal, no symlink escape), writes are atomic, and deletes
// go to the system trash. main.js passes in what it owns (the vault folder,
// settings, file recovery, Electron's shell); test/filesystem-security.test.mjs
// checks these rules directly.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as np from './notespath.mjs';
import * as bm from './bookmarks.mjs';
import * as at from './attach.mjs';
import { vaultLayout } from './layout.mjs';
import { resolveSave } from './outside.mjs';

export const ATTACH_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
  '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webm': 'audio/webm',
  '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.flac': 'audio/flac', '.aac': 'audio/aac',
};

export function createVaultIO({ notesRoot, isDir, readSettings, writeSettings, noteOwnWrite, keepBefore, keepDeleted, shell, attachUnused, cleanableAttachDir, uuid = randomUUID }) {
  function writeFileAtomic(file, text) {
    const tmp = `${file}.${uuid()}.tmp`;
    noteOwnWrite(file);
    // Exclusive creation prevents a vault-supplied symlink from becoming a writer.
    const fd = fs.openSync(tmp, 'wx');
    try {
      try { fs.writeFileSync(fd, text, 'utf8'); }
      finally { fs.closeSync(fd); }
      fs.renameSync(tmp, file);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }

  // Where daily notes and new attachments go (lib/layout.mjs): the vault's own
  // Obsidian settings if it has them, else the folders Mufka used before
  // (Günlük, Ekler) if present, else Daily / Attachments. Re-read on each use —
  // two tiny files — so a change in Obsidian applies right away.
  function readJson(file) { try { return JSON.parse(fs.readFileSync(checkedVaultPath(file), 'utf8')); } catch { return null; } }

  function obsidianSettings() {
    const dir = path.join(notesRoot(), '.obsidian');
    if (!isDir(dir) || !np.realInside(notesRoot(), dir, fs)) return null;
    return {
      dailyNotes: readJson(path.join(dir, 'daily-notes.json')) || undefined,
      app: readJson(path.join(dir, 'app.json')) || {},
      templates: readJson(path.join(dir, 'templates.json')) || undefined,
    };
  }

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
    if (isDir(dir)) { writeFileAtomic(checkedVaultPath(path.join(dir, 'bookmarks.json')), JSON.stringify(json, null, 2)); return; }
    writeSettings({ bookmarks: { ...(readSettings().bookmarks || {}), [notesRoot()]: json } });
  }

  function layout() { return vaultLayout(obsidianSettings(), (name) => isDir(path.join(notesRoot(), name))); }

  function dailyRoot() { return checkedVaultPath(path.join(notesRoot(), ...layout().daily.split('/').filter(Boolean))); }

  // Only the vault root itself is created on demand. Günlük and Ekler appear when
  // the first daily note / attachment is written, so opening an existing folder
  // (e.g. an Obsidian vault) does not add folders to it.
  function ensureNotesDirs() { fs.mkdirSync(notesRoot(), { recursive: true }); }

  // Resolve a vault-relative path to a safe absolute path, or throw.
  function safeAbs(rel) {
    ensureNotesDirs();
    return checkedVaultPath(np.vaultPath(notesRoot(), rel || ''));
  }

  function checkedVaultPath(abs) {
    if (!np.isInside(notesRoot(), abs) || !np.realInside(notesRoot(), abs, fs)) {
      throw new Error('invalid path');
    }
    return abs;
  }

  function mutationAbs(rel, kind) {
    const abs = safeAbs(rel);
    if (fs.realpathSync(abs) === fs.realpathSync(notesRoot())) throw new Error('invalid mutation path');
    const st = fs.lstatSync(abs);
    if (kind === 'folder' ? !st.isDirectory() : !st.isFile() || !/\.md$/i.test(abs)) throw new Error('invalid mutation type');
    return abs;
  }

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

  async function attachTrash(names) {
    const dir = cleanableAttachDir();
    if (!dir) return { ok: true };
    const eligible = new Set(attachUnused());
    const files = [];
    for (const name of (Array.isArray(names) ? names : [])) {
      if (typeof name !== 'string' || /[/\\]/.test(name) || !eligible.has(name)) continue;
      try { files.push(attachAbs(`${dir}/${name}`)); } catch { /* skip */ }
    }
    // Keep the selected vault's paths even if the user switches while trash awaits.
    for (const file of files) {
      try { await shell.trashItem(file); } catch { /* skip */ }
    }
    return { ok: true };
  }

  // Open in the default app — except files that would run code (a script or an
  // app linked from a note), which are only shown in Finder.
  async function attachOpen(rel) {
    const abs = attachAbs(rel);
    const real = fs.realpathSync(abs);
    const st = fs.statSync(real);
    const document = at.isOpenableDocument(real);
    if (!st.isFile() || !document || (st.mode & 0o111) || real.split(path.sep).some(at.isExecutableName)) shell.showItemInFolder(abs);
    else {
      const error = await shell.openPath(real);
      if (error) throw new Error(error);
    }
    return { ok: true };
  }

  // The daily notes folder: shown in the tree but cannot be renamed/moved/trashed.
  function isGunlukRoot(rel) {
    const d = layout().daily;
    if (d === '') return false;
    const daily = dailyRoot();
    const abs = safeAbs(rel);
    return fs.existsSync(abs) && fs.existsSync(daily) && fs.realpathSync(abs) === fs.realpathSync(daily);
  }

  function readIfFile(abs) { try { return fs.readFileSync(abs, 'utf8'); } catch { return null; } }

  // What Mufka last wrote to each note from an editor, by absolute path.
  const lastWritten = new Map();
  // An editor's save (base: the text it started from) keeps what another app
  // added at the end of the note meanwhile (lib/outside.mjs); `merged` tells the
  // editor to take that text too. Other callers pass no base and just write.
  function saveFromEditor(abs, content, base) {
    let text = String(content ?? '');
    let r = { kind: 'same' };
    if (typeof base === 'string') {
      r = resolveSave(text, readIfFile(abs), { last: lastWritten.get(abs), base });
      text = r.text;
    }
    keepBefore(abs);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    writeFileAtomic(abs, text);
    if (typeof base === 'string') lastWritten.set(abs, text);
    return r.kind === 'appended' ? { merged: text } : r.kind === 'conflict' ? { conflict: true } : {};
  }

  async function trashNote(rel) {
    const abs = mutationAbs(rel, 'note');
    keepDeleted(abs);
    await shell.trashItem(abs);
    return { ok: true };
  }

  async function trashFolder(rel) {
    if (isGunlukRoot(rel)) throw new Error('The daily notes folder cannot be deleted');
    const abs = mutationAbs(rel, 'folder');
    keepDeleted(abs);
    await shell.trashItem(abs);
    return { ok: true };
  }

  function readDaily(dateKey) {
    const p = checkedVaultPath(np.dailyFilePath(dailyRoot(), dateKey));
    try {
      return { content: fs.readFileSync(p, 'utf8'), mtime: fs.statSync(p).mtimeMs };
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  function writeDaily(dateKey, content, base) {
    const p = checkedVaultPath(np.dailyFilePath(dailyRoot(), dateKey));
    return { ok: true, ...saveFromEditor(p, content, base) };
  }

  async function deleteDaily(dateKey) {
    const p = checkedVaultPath(np.dailyFilePath(dailyRoot(), dateKey));
    keepDeleted(p);
    await shell.trashItem(p);
    return { ok: true };
  }

  // Serve vault attachments over the custom scheme, resolving ONLY paths that are
  // a direct child of Ekler inside the vault (attachAbs rejects traversal and
  // symlink escape). Anything else 404s.
  function attachResponse(url) {
    try {
      const u = new URL(url);
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      const abs = attachAbs(rel);
      const buf = fs.readFileSync(abs);
      const ext = path.extname(abs).toLowerCase();
      return new Response(buf, { headers: {
        'content-type': ATTACH_MIME[ext] || 'application/octet-stream',
        'content-security-policy': "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
        'x-content-type-options': 'nosniff',
      } });
    } catch {
      return new Response('', { status: 404 });
    }
  }

  return {
    writeFileAtomic, readJson, obsidianSettings, bookmarksRead, bookmarksWrite, layout, dailyRoot, ensureNotesDirs,
    safeAbs, checkedVaultPath, mutationAbs, attachAbs, attachTrash, attachOpen, isGunlukRoot, readIfFile,
    saveFromEditor, trashNote, trashFolder, readDaily, writeDaily, deleteDaily, attachResponse,
  };
}

// The Excalidraw fonts, served from `root` (out/renderer/excalidraw): font
// files inside it only.
export function fontResponse(url, root) {
  try {
    const rel = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '');
    const abs = path.join(root, rel);
    if (!np.isInside(root, abs) || !/\.(woff2?|ttf|otf)$/i.test(abs)) return new Response('', { status: 404 });
    return new Response(fs.readFileSync(abs), { headers: {
      'content-type': /\.woff2$/i.test(abs) ? 'font/woff2' : /\.woff$/i.test(abs) ? 'font/woff' : 'font/ttf',
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
    } });
  } catch {
    return new Response('', { status: 404 });
  }
}
