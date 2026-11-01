import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHistory, wantsVersion, pruneVersions, HISTORY_INTERVAL_MS, HISTORY_KEEP_MS } from '../lib/history.mjs';
import { lineDiff } from '../lib/diff.mjs';

const MIN = 60 * 1000;
function store() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mufka-history-'));
  let t = 1_000_000_000_000;
  const h = createHistory(dir, { now: () => t });
  return { h, dir, tick: (ms) => { t += ms; } };
}

test('one version per editing burst, never the same text twice', () => {
  const { h, tick } = store();
  assert.equal(h.before('A.md', 'v1'), true, 'the first save keeps the text it replaces');
  tick(1 * MIN);
  assert.equal(h.before('A.md', 'v2'), false, 'within five minutes: same burst');
  tick(5 * MIN);
  assert.equal(h.before('A.md', 'v3'), true);
  tick(10 * MIN);
  assert.equal(h.before('A.md', 'v3'), false, 'unchanged text is not kept again');
  assert.deepEqual(h.list('A.md').map((v) => h.get('A.md', v.t)), ['v3', 'v1'], 'newest first');
});

test('a forced version (before a restore) ignores the interval', () => {
  const { h, tick } = store();
  h.before('A.md', 'v1');
  tick(MIN);
  assert.equal(h.before('A.md', 'v2', { force: true }), true);
  assert.equal(h.list('A.md').length, 2);
});

test('versions expire after seven days', () => {
  const { h, tick } = store();
  h.before('A.md', 'old');
  tick(HISTORY_KEEP_MS + MIN);
  assert.deepEqual(h.list('A.md'), []);
  h.before('B.md', 'x');
  h.prune();
  assert.equal(h.list('B.md').length, 1);
});

test('deleted notes are listed until they come back', () => {
  const { h } = store();
  h.deleted('Work/Plan.md', '# Plan');
  const gone = new Set(['Work/Plan.md']);
  const list = h.deletedNotes((rel) => !gone.has(rel));
  assert.equal(list.length, 1);
  assert.equal(list[0].rel, 'Work/Plan.md');
  assert.equal(h.get('Work/Plan.md', list[0].t), '# Plan');
  assert.deepEqual(h.deletedNotes(() => true), [], 'restored: no longer listed');
  assert.equal(h.list('Work/Plan.md')[0].deleted, true);
  assert.equal(h.deleted('Empty.md', '  \n'), false, 'an empty note is not listed');
});

test('history follows a renamed note and a moved folder', () => {
  const { h, tick } = store();
  h.before('A.md', 'a1');
  h.before('Old/B.md', 'b1');
  h.moved('A.md', 'Renamed.md');
  assert.deepEqual(h.list('A.md'), []);
  assert.equal(h.get('Renamed.md', h.list('Renamed.md')[0].t), 'a1');
  tick(HISTORY_INTERVAL_MS);
  h.moved('Old', 'New/Old');
  assert.equal(h.get('New/Old/B.md', h.list('New/Old/B.md')[0].t), 'b1');
  assert.deepEqual(h.list('Old/B.md'), []);
});

test('the policy and pruning on their own', () => {
  assert.equal(wantsVersion([], undefined, 0), false, 'a new note has nothing to keep');
  assert.equal(wantsVersion([{ t: 0, content: 'x', deleted: true }], 'x', 1), true, 'text after a deletion is kept');
  assert.equal(pruneVersions(Array.from({ length: 400 }, (_, i) => ({ t: i, content: '' })), 400).length, 300);
});

test('line diff', () => {
  assert.deepEqual(lineDiff('a\nb\nc', 'a\nx\nc'), [
    { op: ' ', text: 'a' }, { op: '-', text: 'b' }, { op: '+', text: 'x' }, { op: ' ', text: 'c' },
  ]);
  assert.deepEqual(lineDiff('a', 'a\nb').map((d) => d.op), [' ', '+']);
  assert.deepEqual(lineDiff('', '').map((d) => d.op), [' ']);
});
