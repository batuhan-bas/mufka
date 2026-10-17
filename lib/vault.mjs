// Helpers for choosing where the notes vault lives. By default it is
// Documents/Mufka; the user can point Mufka at any folder instead (e.g. an
// existing Obsidian vault). Callers pass the fs checks (isDir, hasFiles, fs).

import path from 'node:path';

// Which folder to use, given the saved settings. A saved folder that no longer
// exists (unplugged drive, renamed) falls back to the default; `missing` names
// it so the app can tell the user.
export function resolveVaultRoot(settings, defaultRoot, isDir) {
  const chosen = settings && typeof settings.vaultPath === 'string' ? settings.vaultPath : null;
  if (!chosen) return { root: defaultRoot, custom: false, missing: null };
  if (!path.isAbsolute(chosen) || !isDir(chosen)) return { root: defaultRoot, custom: false, missing: chosen };
  return { root: path.resolve(chosen), custom: true, missing: null };
}

// Why a folder cannot be the vault, or null if it can. Mufka walks the whole
// vault, so the disk root or the home folder itself would mean scanning
// everything; the app's own data folder holds planlar.json and settings.
export function vaultChoiceError(chosen, { home, userData }) {
  const p = path.resolve(String(chosen || ''));
  if (!chosen || !path.isAbsolute(String(chosen))) return 'Not a valid folder';
  if (p === path.parse(p).root) return 'The root of a disk cannot be the notes folder';
  if (p === path.resolve(home)) return 'Your home folder itself cannot be the notes folder; choose a folder inside it';
  const data = path.resolve(userData);
  if (p === data || data.startsWith(`${p}${path.sep}`)) return "A folder containing Mufka's own data cannot be the notes folder";
  return null;
}

// --- the default notes folder: Documents/Mufka ---
// Older Mufkas kept notes inside the app's data folder (userData/Notlar, then
// userData/Notes), hidden from Finder and from iCloud's Documents sync. Now the
// default is Documents/Mufka, and notes found in the old folder are moved there
// once, on start. `settings.notesInDocuments` records that it happened.
// If Documents/Mufka already holds something else, the two are never mixed:
// the old folder stays in use. `hasFiles(p)`: anything besides dotfiles.
export function defaultNotesPlace({ userData, documents, settings, isDir, hasFiles }) {
  const docs = path.join(documents, 'Mufka');
  const legacy = [path.join(userData, 'Notlar'), path.join(userData, 'Notes')].find((p) => isDir(p) && hasFiles(p)) || null;
  if (!legacy || (settings && settings.notesInDocuments === true)) return { root: docs, docs, legacy, move: false };
  if (isDir(docs) && hasFiles(docs)) return { root: legacy, docs, legacy, move: false };
  // Until the move has worked, the notes are read where they are.
  return { root: legacy, docs, legacy, move: true };
}

// Move the old notes folder to Documents/Mufka. A rename on the same disk is
// one atomic step; across disks it copies and leaves the old folder in place.
// Refuses to overwrite: Documents/Mufka must be missing or empty.
export function moveNotesFolder(from, to, fsMod) {
  if (fsMod.existsSync(to)) {
    const left = fsMod.readdirSync(to).filter((n) => !n.startsWith('.'));
    if (left.length) throw new Error(`${to} is not empty`);
    fsMod.rmSync(to, { recursive: true, force: true });
  }
  fsMod.mkdirSync(path.dirname(to), { recursive: true });
  try {
    fsMod.renameSync(from, to);
    return { copied: false };
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    fsMod.cpSync(from, to, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true });
    return { copied: true };
  }
}
