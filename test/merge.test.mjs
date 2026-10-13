import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeById } from '../lib/plans.mjs';

const a = { id: '1', title: 'A' };
const b = { id: '2', title: 'B' };
const c = { id: '3', title: 'C' };

test('appends only plans with new ids', () => {
  const { items, added } = mergeById([a, b], [b, c]);
  assert.equal(added, 1);
  assert.deepEqual(items.map((p) => p.id), ['1', '2', '3']);
});

test('no new ids means no change', () => {
  const { items, added } = mergeById([a, b], [a]);
  assert.equal(added, 0);
  assert.deepEqual(items.map((p) => p.id), ['1', '2']);
});

test('existing plans are never overwritten', () => {
  const existing = [{ id: '1', title: 'KEEP' }];
  const { items } = mergeById(existing, [{ id: '1', title: 'OVERWRITE' }]);
  assert.equal(items[0].title, 'KEEP');
});

test('importing into empty takes everything', () => {
  const { items, added } = mergeById([], [a, b]);
  assert.equal(added, 2);
  assert.deepEqual(items.map((p) => p.id), ['1', '2']);
});
