// File recovery: past versions of notes, kept outside the vault (main.js puts
// them under <userData>/history/<vault>/), so nothing is added to the notes
// folder and sync tools never see them.
//
// A note's history is one JSON file: { rel, versions: [{ t, content, deleted? }] },
// oldest first. Before a note is overwritten, its current text becomes a
// version — at most one every `intervalMs` (an editing burst is one version),
// and never twice the same text. A deleted note's last text is kept with
// `deleted: true`, so it can be brought back. Versions older than `keepMs` are
// dropped.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const HISTORY_INTERVAL_MS = 5 * 60 * 1000;
export const HISTORY_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_VERSIONS = 300;
const MAX_BYTES = 5 * 1024 * 1024; // larger notes are not kept

// Should `old` (the text about to be replaced) become a version?
export function wantsVersion(versions, old, now, { intervalMs = HISTORY_INTERVAL_MS, force = false } = {}) {
  if (typeof old !== 'string' || old.length > MAX_BYTES) return false;
  const last = versions[versions.length - 1];
  if (last && last.content === old && !last.deleted) return false;
  if (force || !last || last.deleted) return true;
  return now - last.t >= intervalMs;
}

// Versions still kept at `now`: newer than `keepMs`, at most MAX_VERSIONS.
export function pruneVersions(versions, now, keepMs = HISTORY_KEEP_MS) {
  return versions.filter((v) => now - v.t < keepMs).slice(-MAX_VERSIONS);
}

// The history store for one vault, in `dir`.
export function createHistory(dir, opts = {}) {
  const now = opts.now || (() => Date.now());
  const intervalMs = opts.intervalMs ?? HISTORY_INTERVAL_MS;
  const keepMs = opts.keepMs ?? HISTORY_KEEP_MS;
  const fileOf = (rel) => path.join(dir, `${crypto.createHash('sha1').update(rel).digest('hex')}.json`);

  function load(rel) {
    try {
      const j = JSON.parse(fs.readFileSync(fileOf(rel), 'utf8'));
      if (j && j.rel === rel && Array.isArray(j.versions)) return j.versions;
    } catch { /* none yet, or unreadable */ }
    return [];
  }
  function store(rel, versions) {
    const file = fileOf(rel);
    if (!versions.length) { fs.rmSync(file, { force: true }); return; }
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ rel, versions }));
    fs.renameSync(tmp, file);
  }
  function all() {
    let names = [];
    try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')); } catch { return []; }
    const out = [];
    for (const n of names) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
        if (j && typeof j.rel === 'string' && Array.isArray(j.versions)) out.push(j);
      } catch { /* skip */ }
    }
    return out;
  }

  return {
    // `old` is about to be replaced (by a save, a restore, a link update).
    // Never throws: recovery must not stop a save.
    before(rel, old, { force = false } = {}) {
      try {
        const t = now();
        const versions = pruneVersions(load(rel), t, keepMs);
        if (!wantsVersion(versions, old, t, { intervalMs, force })) return false;
        versions.push({ t, content: old });
        store(rel, pruneVersions(versions, t, keepMs));
        return true;
      } catch { return false; }
    },
    // The note is being deleted; `content` is its last text.
    deleted(rel, content) {
      try {
        if (typeof content !== 'string' || !content.trim() || content.length > MAX_BYTES) return false; // an empty note has nothing to bring back
        const t = now();
        const versions = pruneVersions(load(rel), t, keepMs);
        versions.push({ t, content, deleted: true });
        store(rel, versions);
        return true;
      } catch { return false; }
    },
    // A note (or a folder: every note under it) moved from `from` to `to`.
    moved(from, to) {
      try {
        for (const h of all()) {
          let rel = null;
          if (h.rel === from) rel = to;
          else if (h.rel.startsWith(`${from}/`)) rel = to + h.rel.slice(from.length);
          if (!rel) continue;
          const merged = [...load(rel), ...h.versions].sort((a, b) => a.t - b.t);
          store(rel, merged);
          store(h.rel, []);
        }
      } catch { /* history is best effort */ }
    },
    // A note's versions, newest first, without their text.
    list(rel) {
      const versions = pruneVersions(load(rel), now(), keepMs);
      return versions.map((v) => ({ t: v.t, size: v.content.length, deleted: !!v.deleted })).reverse();
    },
    get(rel, t) {
      const v = load(rel).find((x) => x.t === t);
      return v ? v.content : null;
    },
    // Notes whose last version is a deletion and that `exists(rel)` says are
    // gone: [{ rel, t, size }], most recently deleted first.
    deletedNotes(exists) {
      const t0 = now();
      const out = [];
      for (const h of all()) {
        const versions = pruneVersions(h.versions, t0, keepMs);
        const last = versions[versions.length - 1];
        if (last && last.deleted && !exists(h.rel)) out.push({ rel: h.rel, t: last.t, size: last.content.length });
      }
      return out.sort((a, b) => b.t - a.t);
    },
    // Drop expired versions everywhere.
    prune() {
      const t = now();
      for (const h of all()) {
        const kept = pruneVersions(h.versions, t, keepMs);
        if (kept.length !== h.versions.length) store(h.rel, kept);
      }
    },
  };
}
