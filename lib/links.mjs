// Pure wiki-link logic: parse the extended [[...]] syntax and rewrite links
// across the vault when a note or folder is renamed or moved. No DOM, no fs, no
// Electron — imported by main.js (via dynamic import) and by node:test.
//
// Extended syntax (inner text between [[ and ]]):
//   [[Title]]                 bare title
//   [[Folder/Title]]          exact path
//   [[Title|shown text]]      alias (display text)
//   [[Title#Heading]]         heading anchor
//   combinations, e.g. [[Folder/Title#Heading|shown]]
// The target is the part before '#'/'|'; the heading is between '#' and '|';
// the alias is everything after '|'.

import { resolveLink, folderOf } from './notestree.mjs';

function titleOf(rel) { return rel.slice(rel.lastIndexOf('/') + 1).replace(/\.md$/i, ''); }
function stripMd(rel) { return rel.replace(/\.md$/i, ''); }

// Split a wiki link's inner text into { target, heading, alias }. Raw heading /
// alias text is preserved (not trimmed) so unchanged links round-trip exactly;
// only `target` is trimmed, for resolution.
export function parseWikiInner(inner) {
  let rest = inner;
  let alias = null;
  const pipe = rest.indexOf('|');
  if (pipe !== -1) { alias = rest.slice(pipe + 1); rest = rest.slice(0, pipe); }
  let heading = null;
  const hash = rest.indexOf('#');
  if (hash !== -1) { heading = rest.slice(hash + 1); rest = rest.slice(0, hash); }
  return { target: rest.trim(), heading, alias };
}

// Rebuild a wiki link's inner text from parts (raw heading/alias preserved).
function buildWikiInner(target, heading, alias) {
  let s = target;
  if (heading != null) s += `#${heading}`;
  if (alias != null) s += `|${alias}`;
  return s;
}

// Enumerate every wiki link in `content`, skipping inline code and fenced code
// blocks. `onLink(inner, lineIndex, lineText)` is called per occurrence, where
// `inner` is the raw text between [[ and ]].
export function scanWikiLinks(content, onLink) {
  const lines = String(content == null ? '' : content).split('\n');
  let inFence = false;
  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li];
    if (/^```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    let i = 0;
    while (i < line.length) {
      if (line[i] === '`') {
        const close = line.indexOf('`', i + 1);
        if (close === -1) break;
        i = close + 1; continue;
      }
      if (line[i] === '[' && line[i + 1] === '[') {
        const close = line.indexOf(']]', i + 2);
        if (close !== -1) { onLink(line.slice(i + 2, close), li, line); i = close + 2; continue; }
      }
      i += 1;
    }
  }
}

// Map a rel through a single rename/move (oldRel -> newRel). Handles both a note
// (oldRel is the .md) and a folder (descendants start with oldRel + '/').
export function remapRel(oldRel, newRel, rel) {
  if (rel === oldRel) return newRel;
  if (rel.startsWith(`${oldRel}/`)) return newRel + rel.slice(oldRel.length);
  return rel;
}

// Choose the new link target text, preserving the author's style: a path link
// (target had a '/') stays a path; a bare title stays bare only if the new bare
// title still resolves unambiguously to the moved note, else falls back to path.
function chooseTarget(newTargetRel, originalHadSlash, fromNewRel, notesAfter) {
  const pathText = stripMd(newTargetRel);
  if (originalHadSlash) return pathText;
  const bare = titleOf(newTargetRel);
  return resolveLink(bare, fromNewRel, notesAfter) === newTargetRel ? bare : pathText;
}

// Rewrite one note's source. `fromOld`/`fromNew` are this note's rel before and
// after the change (they differ only when the note itself moved). Links inside
// inline code (`...`) and fenced code blocks (``` ... ```) are left untouched.
function rewriteNoteSource(src, fromOld, fromNew, notesBefore, notesAfter, mapRel) {
  const lines = String(src == null ? '' : src).split('\n');
  let inFence = false;
  let count = 0;

  const maybeRewrite = (inner) => {
    const { target, heading, alias } = parseWikiInner(inner);
    if (!target) return inner;
    const targetRel = resolveLink(target, fromOld, notesBefore);
    if (!targetRel) return inner;
    const newTargetRel = mapRel(targetRel);
    if (newTargetRel === targetRel) return inner; // target did not move
    const newTarget = chooseTarget(newTargetRel, target.includes('/'), fromNew, notesAfter);
    const rebuilt = buildWikiInner(newTarget, heading, alias);
    if (rebuilt !== inner) count += 1;
    return rebuilt;
  };

  const rewriteLine = (line) => {
    let out = '';
    let i = 0;
    while (i < line.length) {
      if (line[i] === '`') {
        const close = line.indexOf('`', i + 1);
        if (close === -1) { out += line.slice(i); break; }
        out += line.slice(i, close + 1); i = close + 1; continue;
      }
      if (line[i] === '[' && line[i + 1] === '[') {
        const close = line.indexOf(']]', i + 2);
        if (close !== -1) {
          out += `[[${maybeRewrite(line.slice(i + 2, close))}]]`;
          i = close + 2; continue;
        }
      }
      out += line[i]; i += 1;
    }
    return out;
  };

  for (let li = 0; li < lines.length; li += 1) {
    if (/^```/.test(lines[li])) { inFence = !inFence; continue; }
    if (inFence) continue;
    lines[li] = rewriteLine(lines[li]);
  }
  return { content: lines.join('\n'), count };
}

// Rewrite every inbound link across the vault after `oldRel` was renamed/moved
// to `newRel`. Resolution is decided against the pre-change note list, so a link
// that pointed to a different note with the same title is never touched.
//   notes: [{ rel, content }] for every note, with pre-change rels + contents.
// Returns { files: [{ rel: newRelOfFile, content }], linkCount } where `files`
// are only those whose content actually changed (write these atomically).
export function rewriteVaultLinks({ notes, oldRel, newRel }) {
  const mapRel = (r) => remapRel(oldRel, newRel, r);
  const notesBefore = notes.map((n) => ({ rel: n.rel }));
  const notesAfter = notes.map((n) => ({ rel: mapRel(n.rel) }));
  const files = [];
  let linkCount = 0;
  for (const n of notes) {
    const fromNew = mapRel(n.rel);
    const { content, count } = rewriteNoteSource(n.content, n.rel, fromNew, notesBefore, notesAfter, mapRel);
    if (count > 0) { files.push({ rel: fromNew, content, count }); linkCount += count; }
  }
  return { files, linkCount };
}
