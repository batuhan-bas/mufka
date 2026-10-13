// Pure filter for vault change events (fs.watch, recursive). Decides whether a
// change is worth telling the renderer about. No fs here.

import path from 'node:path';

// `rel` is the changed path relative to the vault root ('' when unknown);
// `ownWrites` maps absolute paths to when Mufka itself last wrote them.
// Ignored: anything inside a dot folder (.obsidian, .git, .trash) or a dot
// file, Mufka's own .tmp files, and files Mufka wrote in the last `windowMs`
// (its autosave would otherwise re-render the editor while you type).
export function isExternalChange(root, rel, ownWrites, now, windowMs) {
  if (!rel) return true;
  if (rel.split(/[\\/]/).some((p) => p.startsWith('.'))) return false;
  if (rel.endsWith('.tmp')) return false;
  const t = ownWrites.get(path.join(root, rel));
  return !(t && now - t < windowMs);
}
