// Pure vault-tree logic. No DOM, no Electron, no fs. Imported by renderer and
// node:test. Operates on vault-relative paths (posix "/", notes end in .md).

import { foldTR } from './plans.mjs';

const collator = new Intl.Collator('en');

function titleOf(rel) { return rel.slice(rel.lastIndexOf('/') + 1).replace(/\.md$/i, ''); }
export function leafOf(rel) { return rel.slice(rel.lastIndexOf('/') + 1); }
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
// 'custom': the order the user made by dragging, `order[folderRel]` = names of
// that folder's children (folder names, note file names); anything not listed
// yet follows by name. Folders stay above notes in every order.
export const TREE_SORTS = ['name', 'name-desc', 'modified', 'modified-old', 'custom'];
export function buildTree(folders, notes, { sort = 'name', order = {} } = {}) {
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
  const custom = (rel) => {
    const list = (sort === 'custom' && Array.isArray(order[rel])) ? order[rel] : [];
    const at = new Map(list.map((n, i) => [n, i]));
    return (x, y, xs, ys) => {
      const i = at.has(x) ? at.get(x) : Infinity; const j = at.has(y) ? at.get(y) : Infinity;
      return i !== j ? (i < j ? -1 : 1) : collator.compare(xs, ys);
    };
  };
  const finalize = (node) => {
    const pos = custom(node.rel);
    const childFolders = [...node.children.values()].map(finalize)
      .sort((a, b) => (sort === 'custom' ? pos(a.name, b.name, a.name, b.name)
        : timed ? byTime(a.latest, b.latest) || collator.compare(a.name, b.name) : byName(a.name, b.name)));
    const childNotes = node.notes.sort((a, b) => (sort === 'custom' ? pos(leafOf(a.rel), leafOf(b.rel), a.title, b.title)
      : timed ? byTime(a.mtime || 0, b.mtime || 0) || collator.compare(a.title, b.title) : byName(a.title, b.title)));
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
// linking note, then the shortest path, then Turkish name order. With no note
// of that name, a note that lists it in its aliases.
//
// Lookups go through an index of the list, made once per list (a vault-wide
// pass resolves thousands of links against the same list): treat a list as
// read-only once links have been resolved against it, and pass a new array
// when notes or their aliases change.
const linkIndexes = new WeakMap();
function linkIndex(notes) {
  let ix = linkIndexes.get(notes);
  if (ix) return ix;
  ix = { byPath: new Map(), byTitle: new Map(), byAlias: new Map() };
  const add = (map, key, n) => { const list = map.get(key); if (list) list.push(n); else map.set(key, [n]); };
  for (const n of notes) {
    ix.byPath.set(n.rel.replace(/\.md$/i, ''), n);
    add(ix.byTitle, foldTR(titleOf(n.rel)), n);
    if (Array.isArray(n.aliases)) for (const a of n.aliases) add(ix.byAlias, foldTR(String(a)), n);
  }
  linkIndexes.set(notes, ix);
  return ix;
}

export function resolveLink(target, fromRel, notes) {
  const t = String(target || '').trim();
  if (!t) return null;
  const ix = linkIndex(notes);
  if (t.includes('/')) {
    const hit = ix.byPath.get(t.replace(/\.md$/i, ''));
    return hit ? hit.rel : null;
  }
  const want = foldTR(t);
  const cand = ix.byTitle.get(want) || ix.byAlias.get(want);
  if (!cand) return null;
  if (cand.length === 1) return cand[0].rel;
  // The best one in a single pass: same folder, then fewest levels, then name order.
  const fromFolder = folderOf(fromRel);
  let best = null; let bestSame = 2; let bestDepth = Infinity;
  for (const n of cand) {
    const same = folderOf(n.rel) === fromFolder ? 0 : 1;
    let depth = 1;
    for (let i = n.rel.indexOf('/'); i !== -1; i = n.rel.indexOf('/', i + 1)) depth += 1;
    if (same < bestSame || (same === bestSame && (depth < bestDepth || (depth === bestDepth && collator.compare(n.rel, best.rel) < 0)))) {
      best = n; bestSame = same; bestDepth = depth;
    }
  }
  return best.rel;
}

// --- the custom order (sort 'custom') ---
// order: { [folderRel]: [child names] }, '' being the top of the vault.

// Put `name` before `beforeName` (or last, when null) among `siblings` — the
// folder's children as they show now — and keep that as the folder's order.
export function placeInOrder(order, folderRel, siblings, name, beforeName) {
  const list = siblings.filter((n) => n !== name);
  const at = beforeName == null ? -1 : list.indexOf(beforeName);
  list.splice(at === -1 ? list.length : at, 0, name);
  return { ...order, [folderRel]: list };
}

// A rename or a move: the item keeps its place (rename) or leaves its old
// folder's list (move; the drop places it in the new one); lists of folders
// under it follow the new path.
export function remapOrder(order, oldRel, newRel) {
  const next = {};
  for (const [key, list] of Object.entries(order)) {
    let k = key;
    if (key === oldRel) k = newRel;
    else if (key.startsWith(`${oldRel}/`)) k = newRel + key.slice(oldRel.length);
    next[k] = list.slice();
  }
  const from = folderOf(oldRel); const to = folderOf(newRel);
  if (next[from]) {
    next[from] = from === to
      ? next[from].map((n) => (n === leafOf(oldRel) ? leafOf(newRel) : n))
      : next[from].filter((n) => n !== leafOf(oldRel));
  }
  return next;
}

// A delete: drop the item from its folder's list and forget lists under it.
export function forgetOrder(order, rel) {
  const next = {};
  for (const [key, list] of Object.entries(order)) {
    if (key === rel || key.startsWith(`${rel}/`)) continue;
    next[key] = key === folderOf(rel) ? list.filter((n) => n !== leafOf(rel)) : list.slice();
  }
  return next;
}
