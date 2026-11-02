// The notes of the vault, kept by the main process between calls and between
// runs, so the app does not read every file again each time it needs the
// vault (backlinks, search, Dataview, the graph).
//
// refresh(listing) compares each note's modification time and size with what
// is kept and reads only the ones that changed; since(version) returns what
// changed after a version the window already has, so it receives the changes
// rather than the whole vault. The cache is saved to one JSON file outside
// the vault (main.js: <userData>/index/<vault>.json) and loaded at start.
import fs from 'node:fs';
import path from 'node:path';

const FORMAT = 1;

// file: where the cache is saved (null: in memory only). read(abs) → text.
export function createVaultCache({ file = null, read = (abs) => fs.readFileSync(abs, 'utf8') } = {}) {
  const entries = new Map(); // rel -> { rel, content, mtime, ctime, size, ver }
  let removed = []; // [{ rel, ver }]
  let forgotten = 0; // removals up to this version are no longer listed
  let version = 0;
  let dirty = false;

  // Load a saved cache; a missing or unreadable file is an empty cache.
  function load() {
    if (!file) return 0;
    try {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!j || j.format !== FORMAT || !Array.isArray(j.notes)) return 0;
      for (const n of j.notes) {
        if (n && typeof n.rel === 'string' && typeof n.content === 'string') entries.set(n.rel, { ...n, ver: 0 });
      }
    } catch { /* start empty */ }
    return entries.size;
  }

  // listing: [{ rel, abs, mtime, ctime, size }] — every note in the vault now.
  // Returns { read, removed }: how many files were read and dropped.
  function refresh(listing) {
    let readCount = 0;
    const seen = new Set();
    for (const f of listing) {
      seen.add(f.rel);
      const old = entries.get(f.rel);
      if (old && old.mtime === f.mtime && old.size === f.size) continue;
      let content;
      try { content = read(f.abs); } catch { continue; }
      readCount += 1;
      if (old && old.content === content) { old.mtime = f.mtime; old.size = f.size; old.ctime = f.ctime; dirty = true; continue; }
      entries.set(f.rel, { rel: f.rel, content, mtime: f.mtime, ctime: f.ctime, size: f.size, ver: ++version });
      dirty = true;
    }
    let gone = 0;
    for (const rel of [...entries.keys()]) {
      if (seen.has(rel)) continue;
      entries.delete(rel);
      removed.push({ rel, ver: ++version });
      gone += 1;
      dirty = true;
    }
    if (removed.length > 5000) { forgotten = removed[removed.length - 5001].ver; removed = removed.slice(-5000); }
    return { read: readCount, removed: gone };
  }

  const pub = (e) => ({ rel: e.rel, content: e.content, mtime: e.mtime, ctime: e.ctime, size: e.size });

  return {
    load,
    refresh,
    get version() { return version; },
    get size() { return entries.size; },
    // Every note, as the window wants them.
    all() { return [...entries.values()].map(pub); },
    // What changed after `since` (a version from an earlier call): the notes
    // that changed and the paths that went. since < 0, or one older than the
    // removals still remembered: everything ({ full: true }).
    since(since) {
      if (!(since >= 0) || since < forgotten) {
        return { version, full: true, changed: this.all(), removed: [] };
      }
      return {
        version,
        full: false,
        changed: [...entries.values()].filter((e) => e.ver > since).map(pub),
        removed: removed.filter((r) => r.ver > since && !entries.has(r.rel)).map((r) => r.rel),
      };
    },
    // Save to `file` when something changed since the last save.
    save() {
      if (!file || !dirty) return false;
      dirty = false;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ format: FORMAT, notes: [...entries.values()].map(pub) }));
      fs.renameSync(tmp, file);
      return true;
    },
  };
}
