// The vault on disk without Electron: list, read and write notes for the MCP
// server (mcp/), with the same rules as main.js — dot entries and symlinked
// entries are not walked, the attachments folder is skipped, and every path
// must stay inside the vault, also through symlinks. A path given from
// outside is refused rather than cleaned up, so a caller learns it was wrong.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { vaultPath, isInside, realInside, sanitizeTitle } from './notespath.mjs';
import { vaultLayout, hiddenAttachmentsFolder } from './layout.mjs';

// A vault-relative note path as given by a caller → "Folder/Note.md".
// addMd: a path without ".md" gets it (for new notes). Throws on anything
// that is not a plain path of names: "..", ".", absolute, backslashes,
// characters a file name cannot hold, dot files, other extensions.
export function noteRel(rel, { addMd = false } = {}) {
  const raw = String(rel == null ? '' : rel).trim();
  if (!raw) throw new Error('A path is required');
  if (raw.includes('\0') || raw.includes('\\') || path.isAbsolute(raw) || /^[a-z]:/i.test(raw)) throw new Error(`Not a vault path: ${raw}`);
  const parts = raw.split('/').filter((s) => s !== '');
  for (const p of parts) {
    if (p === '.' || p === '..' || p.startsWith('.') || sanitizeTitle(p) !== p) throw new Error(`Not a vault path: ${raw}`);
  }
  let out = parts.join('/');
  if (!/\.md$/i.test(out)) {
    if (!addMd) throw new Error(`Not a note (only .md files): ${raw}`);
    out += '.md';
  }
  return out;
}

// A vault-relative folder ("" for the whole vault), checked like noteRel.
export function folderRel(rel) {
  const raw = String(rel == null ? '' : rel).trim().replace(/\/+$/, '');
  if (!raw) return '';
  noteRel(`${raw}/x.md`); // the same rules for each part
  return raw.split('/').filter((s) => s !== '').join('/');
}

// The absolute path of a checked vault path, or throw when it would leave the
// vault (a symlink on the way included).
export function vaultAbs(root, rel) {
  const abs = vaultPath(root, rel);
  if (!isInside(root, abs) || !realInside(root, abs, fs)) throw new Error(`Outside the vault: ${rel}`);
  return abs;
}

function readJsonIn(root, file) {
  try { return realInside(root, file, fs) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; } catch { return null; }
}

// The vault's layout (lib/layout.mjs), from its .obsidian settings if any.
export function vaultLayoutOf(root) {
  const dir = path.join(root, '.obsidian');
  const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
  const obsidian = isDir(dir) && realInside(root, dir, fs)
    ? { app: readJsonIn(root, path.join(dir, 'app.json')) || {}, dailyNotes: readJsonIn(root, path.join(dir, 'daily-notes.json')) || undefined, templates: readJsonIn(root, path.join(dir, 'templates.json')) || undefined }
    : null;
  return vaultLayout(obsidian, (name) => isDir(path.join(root, name)));
}

// Every note: [{ rel, mtime, size }], as main.js walks the vault.
export function listVault(root) {
  const hidden = hiddenAttachmentsFolder(vaultLayoutOf(root));
  const notes = []; const folders = [];
  const walk = (absDir, rel) => {
    let entries;
    try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
      if (!rel && e.name === hidden && e.isDirectory()) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      const childAbs = path.join(absDir, e.name);
      if (e.isDirectory()) { folders.push(childRel); walk(childAbs, childRel); }
      else if (e.isFile() && /\.md$/i.test(e.name)) {
        let st; try { st = fs.statSync(childAbs); } catch { continue; }
        notes.push({ rel: childRel, mtime: st.mtimeMs, size: st.size });
      }
    }
  };
  walk(root, '');
  return { notes, folders };
}

// A note's text and when it changed, or null when there is no such note.
export function readNote(root, rel) {
  const abs = vaultAbs(root, noteRel(rel));
  let st;
  try { st = fs.lstatSync(abs); } catch (err) { if (err.code === 'ENOENT') return null; throw err; }
  if (!st.isFile() && !st.isSymbolicLink()) return null;
  return { content: fs.readFileSync(abs, 'utf8'), mtime: fs.statSync(abs).mtimeMs };
}

// Write through a new temporary file and rename it over the target; the
// temporary file is created exclusively, so a planted symlink cannot be it.
function writeAtomic(file, text) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  const fd = fs.openSync(tmp, 'wx');
  try {
    try { fs.writeFileSync(fd, text, 'utf8'); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// A new note; never replaces one. Missing folders are made (inside the vault).
export function createNote(root, rel, text) {
  const clean = noteRel(rel, { addMd: true });
  const abs = vaultAbs(root, clean);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  vaultAbs(root, clean); // the folders just made are still inside
  // Exclusive: an existing note, or a symlink planted at its name, is refused.
  let fd;
  try { fd = fs.openSync(abs, 'wx'); } catch (err) {
    if (err.code === 'EEXIST') throw new Error(`A note already exists at ${clean}`);
    throw err;
  }
  try { fs.writeFileSync(fd, String(text ?? ''), 'utf8'); } finally { fs.closeSync(fd); }
  return clean;
}

// Text added at the end of an existing note, on a line of its own.
export function appendToNote(root, rel, text) {
  const clean = noteRel(rel);
  const abs = vaultAbs(root, clean);
  const st = (() => { try { return fs.lstatSync(abs); } catch { return null; } })();
  if (!st || !st.isFile()) throw new Error(`No note at ${clean}`);
  const before = fs.readFileSync(abs, 'utf8');
  const sep = before === '' || before.endsWith('\n') ? '' : '\n';
  writeAtomic(abs, `${before}${sep}${String(text).replace(/\n*$/, '')}\n`);
  return clean;
}
