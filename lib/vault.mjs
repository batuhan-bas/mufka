// Pure helpers for choosing where the notes vault lives. By default it is
// <userData>/Notlar; the user can point Mufka at any folder instead (e.g. an
// existing Obsidian vault). No fs here: callers pass an isDir(path) check.

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
