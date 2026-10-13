// Pure bookmarks in Obsidian's format (.obsidian/bookmarks.json):
//   { items: [ { type: 'file', path, ctime, title? }, { type: 'group', title, items: [...] },
//              { type: 'search' | 'heading' | 'folder' | ..., ... } ] }
// Mufka shows and toggles file bookmarks; every other entry is kept as is.

export function normalizeBookmarks(json) {
  return json && typeof json === 'object' && Array.isArray(json.items) ? json : { items: [] };
}

// Bookmarked note paths in order (groups flattened), unique.
export function bookmarkedPaths(json) {
  const out = [];
  const walk = (items) => {
    for (const it of items || []) {
      if (!it || typeof it !== 'object') continue;
      if (it.type === 'file' && typeof it.path === 'string' && !out.includes(it.path)) out.push(it.path);
      else if (it.type === 'group') walk(it.items);
    }
  };
  walk(normalizeBookmarks(json).items);
  return out;
}

// Add `path` (at the end of the top level) or, if bookmarked anywhere, remove
// every file entry for it. Returns a new object; `now` = ctime for new entries.
export function toggleBookmark(json, path, now = Date.now()) {
  const base = normalizeBookmarks(json);
  if (bookmarkedPaths(base).includes(path)) {
    const strip = (items) => items
      .filter((it) => !(it && it.type === 'file' && it.path === path))
      .map((it) => (it && it.type === 'group' ? { ...it, items: strip(it.items || []) } : it));
    return { ...base, items: strip(base.items) };
  }
  return { ...base, items: [...base.items, { type: 'file', ctime: now, path }] };
}

// After a note or folder is renamed/moved: point bookmarks at the new path
// (for a folder, every bookmarked note inside it).
export function renameBookmark(json, oldPath, newPath) {
  const base = normalizeBookmarks(json);
  const fix = (items) => items.map((it) => {
    if (it && it.type === 'file' && it.path === oldPath) return { ...it, path: newPath };
    if (it && it.type === 'file' && typeof it.path === 'string' && it.path.startsWith(`${oldPath}/`)) return { ...it, path: newPath + it.path.slice(oldPath.length) };
    if (it && it.type === 'group') return { ...it, items: fix(it.items || []) };
    return it;
  });
  return { ...base, items: fix(base.items) };
}
