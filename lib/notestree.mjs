// Pure vault-tree logic. No DOM, no Electron, no fs. Imported by renderer and
// node:test. Operates on vault-relative paths (posix "/", notes end in .md).

import { foldTR } from './plans.mjs';

const collator = new Intl.Collator('en');

function titleOf(rel) { return rel.slice(rel.lastIndexOf('/') + 1).replace(/\.md$/i, ''); }
export function folderOf(rel) { const i = rel.lastIndexOf('/'); return i === -1 ? '' : rel.slice(0, i); }
export function joinRel(folderRel, name) { return folderRel ? `${folderRel}/${name}` : name; }

// Build a sorted tree from a flat folder list and note list.
//   folders: ['İş', 'İş/Raporlar', 'Günlük']
//   notes:   [{ rel: 'İş/Q1.md', mtime }]
// Returns { name:'', rel:'', folders:[...], notes:[...], count } where each
// folder node has the same shape and `count` is notes in its whole subtree.
// sort: 'name' (A–Z, default) | 'name-desc' (Z–A) | 'modified' (last edited
// first) | 'modified-old'. Folders always come first; by name, or by their
// newest note for the modified orders.
export const TREE_SORTS = ['name', 'name-desc', 'modified', 'modified-old'];
export function buildTree(folders, notes, { sort = 'name' } = {}) {
  const root = { name: '', rel: '', children: new Map(), notes: [] };
  const ensure = (rel) => {
    if (!rel) return root;
    let node = root; let acc = '';
    for (const part of rel.split('/')) {
      acc = acc ? `${acc}/${part}` : part;
      if (!node.children.has(part)) node.children.set(part, { name: part, rel: acc, children: new Map(), notes: [] });
      node = node.children.get(part);
    }
    return node;
  };

  for (const f of folders) ensure(f);
  for (const n of notes) {
    ensure(folderOf(n.rel)).notes.push({ rel: n.rel, title: titleOf(n.rel), folder: folderOf(n.rel), mtime: n.mtime });
  }

  const byName = (x, y) => collator.compare(x, y) * (sort === 'name-desc' ? -1 : 1);
  const byTime = (x, y) => (sort === 'modified-old' ? x - y : y - x);
  const timed = sort === 'modified' || sort === 'modified-old';
  const finalize = (node) => {
    const childFolders = [...node.children.values()].map(finalize)
      .sort((a, b) => (timed ? byTime(a.latest, b.latest) || collator.compare(a.name, b.name) : byName(a.name, b.name)));
    const childNotes = node.notes.sort((a, b) => (timed ? byTime(a.mtime || 0, b.mtime || 0) || collator.compare(a.title, b.title) : byName(a.title, b.title)));
    const count = childNotes.length + childFolders.reduce((s, f) => s + f.count, 0);
    const latest = Math.max(0, ...childNotes.map((n) => n.mtime || 0), ...childFolders.map((f) => f.latest));
    return { name: node.name, rel: node.rel, folders: childFolders, notes: childNotes, count, latest };
  };
  return finalize(root);
}

// Flat note list ({ rel, title, folder, mtime }) for filtering, links, search.
export function flattenNotes(notes) {
  return notes.map((n) => ({ rel: n.rel, title: titleOf(n.rel), folder: folderOf(n.rel), mtime: n.mtime }));
}

export function isDescendant(ancestorRel, otherRel) {
  if (ancestorRel === '') return otherRel !== '';
  return otherRel === ancestorRel || otherRel.startsWith(`${ancestorRel}/`);
}

// A folder may not be moved into itself or any of its descendants.
export function canMoveInto(srcRel, srcIsFolder, destFolderRel) {
  if (!srcIsFolder) return true;
  return !isDescendant(srcRel, destFolderRel);
}

// Resolve a [[wiki]] target from a note at `fromRel` against the flat note list.
// "Folder/Title" is an exact path. A bare "Title" prefers the same folder as the
// linking note, then the shortest path, then Turkish name order.
export function resolveLink(target, fromRel, notes) {
  const t = String(target || '').trim();
  if (!t) return null;
  if (t.includes('/')) {
    const want = t.replace(/\.md$/i, '');
    const hit = notes.find((n) => n.rel.replace(/\.md$/i, '') === want);
    return hit ? hit.rel : null;
  }
  const fromFolder = folderOf(fromRel);
  const cand = notes.filter((n) => foldTR(titleOf(n.rel)) === foldTR(t));
  if (cand.length === 0) return null;
  cand.sort((a, b) => {
    const as = folderOf(a.rel) === fromFolder ? 0 : 1;
    const bs = folderOf(b.rel) === fromFolder ? 0 : 1;
    if (as !== bs) return as - bs;
    const ad = a.rel.split('/').length; const bd = b.rel.split('/').length;
    if (ad !== bd) return ad - bd;
    return collator.compare(a.rel, b.rel);
  });
  return cand[0].rel;
}
