import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTabs } from '../lib/tabs.mjs';
import { createNavHistory } from '../lib/navhistory.mjs';

const note = (rel) => ({ view: 'note', rel });
const rels = (t) => t.list.map((x) => x.loc && x.loc.rel);
function three() {
  const t = createTabs(createNavHistory);
  t.add(note('A.md')); t.add(note('B.md')); t.add(note('C.md'));
  return t;
}

test('a new tab opens after the active one, with its own history', () => {
  const t = three();
  t.activate(t.list[0].id);
  const d = t.add(note('D.md'));
  assert.deepEqual(rels(t), ['A.md', 'D.md', 'B.md', 'C.md']);
  assert.equal(t.active, d);
  assert.notEqual(t.list[0].nav, d.nav);
});

test('closing the active tab moves to its neighbour; the last tab stays', () => {
  const t = three();
  t.activate(t.list[1].id);
  assert.equal(t.close(t.active.id).loc.rel, 'C.md');
  assert.equal(t.close(t.list[0].id), null, 'closing another tab keeps the active one');
  assert.equal(t.close(t.active.id), null, 'the last tab never closes');
  assert.equal(t.count, 1);
});

test('a closed tab reopens where it was', () => {
  const t = three();
  t.close(t.list[1].id);
  const r = t.reopen();
  assert.deepEqual(rels(t), ['A.md', 'B.md', 'C.md']);
  assert.equal(t.active, r);
  assert.equal(t.reopen(), null);
});

test('next/previous wrap; tabs can be moved; close others', () => {
  const t = three();
  assert.equal(t.neighbour(1).loc.rel, 'A.md');
  assert.equal(t.neighbour(-1).loc.rel, 'B.md');
  t.move(t.list[2].id, 0);
  assert.deepEqual(rels(t), ['C.md', 'A.md', 'B.md']);
  t.closeOthers(t.list[1].id);
  assert.deepEqual(rels(t), ['A.md']);
  assert.equal(t.reopen().loc.rel, 'B.md');
});

test('renames follow; deleted places are dropped, not the active tab', () => {
  const t = three();
  t.add(note('Work/X.md'));
  t.remap('Work', 'Old/Work');
  t.remap('A.md', 'A2.md');
  assert.deepEqual(rels(t), ['A2.md', 'B.md', 'C.md', 'Old/Work/X.md']);
  t.activate(t.list[1].id);
  t.prune((loc) => loc.rel !== 'B.md' && loc.rel !== 'C.md');
  assert.deepEqual(rels(t), ['A2.md', 'B.md', 'Old/Work/X.md']);
});

test('saved and restored, skipping places that are gone', () => {
  const t = three();
  t.activate(t.list[2].id);
  const saved = JSON.parse(JSON.stringify(t));
  assert.deepEqual(saved, { tabs: [note('A.md'), note('B.md'), note('C.md')], active: 2 });
  const u = createTabs(createNavHistory);
  assert.equal(u.restore(saved, (l) => l.rel !== 'A.md'), true);
  assert.deepEqual(rels(u), ['B.md', 'C.md']);
  assert.equal(u.active.loc.rel, 'C.md');
  assert.equal(createTabs(createNavHistory).restore({ tabs: [] }), false);
});
