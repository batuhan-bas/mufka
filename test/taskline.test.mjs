import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleTaskLine, setTaskLine } from '../lib/taskline.mjs';
import { toggleTaskLine as fromMarkdown } from '../lib/markdown.mjs';

const SRC = '# Plan\n- [ ] Design\n  - [x] Sketch\n> 1. [~] Later\nplain';

test('toggleTaskLine is the same function lib/markdown.mjs exports', () => {
  assert.equal(fromMarkdown, toggleTaskLine);
  assert.equal(toggleTaskLine(SRC, 1).split('\n')[1], '- [x] Design');
});

test('setTaskLine sets a box only on the line the caller saw', () => {
  assert.equal(setTaskLine(SRC, 1, { expect: '- [ ] Design', done: true }).split('\n')[1], '- [x] Design');
  assert.equal(setTaskLine(SRC, 2, { expect: '  - [x] Sketch', done: false }).split('\n')[2], '  - [ ] Sketch');
  assert.equal(setTaskLine(SRC, 3, { expect: '> 1. [~] Later', done: true }).split('\n')[3], '> 1. [x] Later');
  assert.equal(setTaskLine(SRC, 1, { expect: '- [ ] Design', done: false }), SRC); // already so
  assert.throws(() => setTaskLine(SRC, 1, { expect: '- [ ] Design v2', done: true }), /changed/);
  assert.throws(() => setTaskLine(SRC, 9, { expect: '', done: true }), /changed/);
  assert.throws(() => setTaskLine(SRC, 4, { expect: 'plain', done: true }), /not a task/);
});
