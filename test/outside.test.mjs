import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeOutside, resolveSave } from '../lib/outside.mjs';

test('text added at the end is kept with the edits on screen', () => {
  const r = mergeOutside('# Title\nmy edit\n', '# Title\n', '# Title\n- from Claude\n');
  assert.deepEqual(r, { kind: 'appended', text: '# Title\nmy edit\n- from Claude\n' });
});

test('the added text stays on its own line', () => {
  // appendToNote puts a newline first when the note did not end with one.
  assert.equal(mergeOutside('one two', 'one', 'one\nadded\n').text, 'one two\nadded\n');
  // The local edit dropped the final newline: one is put back before the tail.
  assert.equal(mergeOutside('one\ntwo', 'one\n', 'one\nadded\n').text, 'one\ntwo\nadded\n');
  assert.equal(mergeOutside('', '', 'added\n').text, 'added\n');
  assert.equal(mergeOutside('typed', '', 'added\n').text, 'typed\nadded\n');
});

test('a change in the middle is a conflict and keeps Mufka\'s text', () => {
  assert.deepEqual(mergeOutside('a\nmine\n', 'a\nb\n', 'a\ntheirs\n'), { kind: 'conflict', text: 'a\nmine\n' });
});

test('CRLF text is carried as it is', () => {
  assert.equal(mergeOutside('a\r\nb\r\n', 'a\r\n', 'a\r\nadded\r\n').text, 'a\r\nb\r\nadded\r\n');
});

test('resolveSave: nothing changed outside Mufka', () => {
  assert.equal(resolveSave('new', 'old', { last: 'old' }).kind, 'same');
  assert.equal(resolveSave('new', 'old', { base: 'old' }).kind, 'same');
  // Saves on their way: the disk has Mufka's previous save, the editor's base is older.
  assert.equal(resolveSave('v3', 'v2', { last: 'v2', base: 'v1' }).kind, 'same');
  assert.equal(resolveSave('new', null, { base: '' }).kind, 'same');
  // Nothing known about the file (a caller that does not track it).
  assert.equal(resolveSave('new', 'other', {}).kind, 'same');
});

test('resolveSave: an addition after Mufka\'s last save is merged', () => {
  const r = resolveSave('a\nedit\n', 'a\n- added\n', { last: 'a\n', base: 'a\n' });
  assert.deepEqual(r, { kind: 'appended', text: 'a\nedit\n- added\n' });
  // Mufka has not written yet this session: the editor's base is the start.
  assert.equal(resolveSave('a\nedit\n', 'a\n- added\n', { base: 'a\n' }).text, 'a\nedit\n- added\n');
});

test('resolveSave: any other outside change is a conflict', () => {
  assert.deepEqual(resolveSave('mine', 'theirs', { last: 'old', base: 'old' }), { kind: 'conflict', text: 'mine' });
});
