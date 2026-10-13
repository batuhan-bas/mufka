import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNavHistory, sameLocation } from '../lib/navhistory.mjs';

const n = (rel) => ({ view: 'note', rel });
const day = (key) => ({ view: 'day', key });

test('back and forward like a browser', () => {
  const h = createNavHistory();
  h.visit(day('2026-10-11'), n('A.md'));
  h.visit(n('A.md'), n('B.md'));
  assert.deepEqual(h.back(n('B.md')), n('A.md'));
  assert.deepEqual(h.back(n('A.md')), day('2026-10-11'));
  assert.equal(h.back(day('2026-10-11')), null);
  assert.deepEqual(h.forward(day('2026-10-11')), n('A.md'));
  assert.deepEqual(h.forward(n('A.md')), n('B.md'));
  assert.equal(h.forward(n('B.md')), null);
});

test('a new visit clears forward; repeats and invalid places are skipped', () => {
  const h = createNavHistory();
  h.visit(n('A.md'), n('B.md'));
  h.visit(n('B.md'), n('C.md'));
  h.back(n('C.md'));
  h.visit(n('B.md'), n('D.md'));
  assert.equal(h.canForward, false);
  h.visit(n('D.md'), n('D.md'));
  assert.deepEqual(h.back(n('D.md'), (l) => l.rel !== 'B.md'), n('A.md'));
  assert.ok(sameLocation({ view: 'graph' }, { view: 'graph' }));
});

test('history is capped', () => {
  const h = createNavHistory(3);
  for (let i = 0; i < 10; i += 1) h.visit(n(`${i}.md`), n(`${i + 1}.md`));
  let c = 0; let cur = n('10.md');
  for (let loc = h.back(cur); loc; loc = h.back(cur)) { cur = loc; c += 1; }
  assert.equal(c, 3);
});
