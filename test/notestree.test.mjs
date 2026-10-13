import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTree, flattenNotes, isDescendant, canMoveInto, resolveLink, folderOf, joinRel,
} from '../lib/notestree.mjs';

const folders = ['İş', 'İş/Raporlar', 'Arşiv', 'Günlük'];
const notes = [
  { rel: 'Kök not.md', mtime: 5 },
  { rel: 'İş/Q1.md', mtime: 4 },
  { rel: 'İş/Raporlar/Mart.md', mtime: 3 },
  { rel: 'İş/Raporlar/Nisan.md', mtime: 2 },
  { rel: 'Arşiv/Eski.md', mtime: 1 },
];

test('buildTree nests, sorts (tr), and counts subtrees', () => {
  const t = buildTree(folders, notes);
  // Folders sorted by Turkish collation: Arşiv, Günlük, İş
  assert.deepEqual(t.folders.map((f) => f.name), ['Arşiv', 'Günlük', 'İş']);
  assert.deepEqual(t.notes.map((n) => n.title), ['Kök not']);
  const is = t.folders.find((f) => f.name === 'İş');
  assert.equal(is.count, 3); // Q1 + Mart + Nisan
  assert.deepEqual(is.notes.map((n) => n.title), ['Q1']);
  const rap = is.folders.find((f) => f.name === 'Raporlar');
  assert.deepEqual(rap.notes.map((n) => n.title), ['Mart', 'Nisan']);
  assert.equal(rap.count, 2);
  const gunluk = t.folders.find((f) => f.name === 'Günlük');
  assert.equal(gunluk.count, 0);
});

test('flattenNotes derives title and folder', () => {
  const f = flattenNotes(notes);
  assert.deepEqual(f.find((n) => n.rel === 'İş/Raporlar/Mart.md'), {
    rel: 'İş/Raporlar/Mart.md', title: 'Mart', folder: 'İş/Raporlar', mtime: 3,
  });
  assert.equal(folderOf('Kök not.md'), '');
  assert.equal(joinRel('İş', 'Q2.md'), 'İş/Q2.md');
  assert.equal(joinRel('', 'Q2.md'), 'Q2.md');
});

test('isDescendant / canMoveInto block self and descendants', () => {
  assert.ok(isDescendant('İş', 'İş/Raporlar'));
  assert.ok(isDescendant('İş', 'İş'));
  assert.ok(!isDescendant('İş', 'İşlem'));
  assert.ok(!canMoveInto('İş', true, 'İş'));           // into itself
  assert.ok(!canMoveInto('İş', true, 'İş/Raporlar'));  // into descendant
  assert.ok(canMoveInto('İş', true, 'Arşiv'));         // ok
  assert.ok(canMoveInto('İş/Q1.md', false, 'İş'));     // notes always ok
});

test('resolveLink: exact path, same-folder preference, shortest path', () => {
  const flat = flattenNotes([
    { rel: 'Not.md', mtime: 1 },
    { rel: 'İş/Not.md', mtime: 1 },
    { rel: 'İş/Raporlar/Not.md', mtime: 1 },
    { rel: 'Arşiv/Benzersiz.md', mtime: 1 },
  ]);
  // Exact path form.
  assert.equal(resolveLink('İş/Raporlar/Not', 'Kök.md', flat), 'İş/Raporlar/Not.md');
  // Bare title from a note in İş → prefer İş/Not.
  assert.equal(resolveLink('Not', 'İş/Baska.md', flat), 'İş/Not.md');
  // Bare title from root → shortest path wins (root Not.md).
  assert.equal(resolveLink('Not', 'Kök.md', flat), 'Not.md');
  // Unique title anywhere.
  assert.equal(resolveLink('Benzersiz', 'Kök.md', flat), 'Arşiv/Benzersiz.md');
  // Missing.
  assert.equal(resolveLink('Yok', 'Kök.md', flat), null);
});

test('tree sort orders: name, name-desc, modified, modified-old', async () => {
  const { buildTree } = await import('../lib/notestree.mjs');
  const folders = ['A', 'B'];
  const notes = [{ rel: 'b.md', mtime: 10 }, { rel: 'a.md', mtime: 30 }, { rel: 'c.md', mtime: 20 }, { rel: 'A/x.md', mtime: 5 }, { rel: 'B/y.md', mtime: 50 }];
  const names = (t) => [t.folders.map((f) => f.name).join(''), t.notes.map((n) => n.title).join('')];
  assert.deepEqual(names(buildTree(folders, notes)), ['AB', 'abc']);
  assert.deepEqual(names(buildTree(folders, notes, { sort: 'name-desc' })), ['BA', 'cba']);
  assert.deepEqual(names(buildTree(folders, notes, { sort: 'modified' })), ['BA', 'acb'], 'folders by their newest note');
  assert.deepEqual(names(buildTree(folders, notes, { sort: 'modified-old' })), ['AB', 'bca']);
});
