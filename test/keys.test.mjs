import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyLabel } from '../lib/keys.mjs';

test('Mac keeps the symbols', () => {
  assert.equal(keyLabel('New plan (⇧⌘P)', true), 'New plan (⇧⌘P)');
});

test('Windows and Linux read Ctrl, Alt, Shift', () => {
  const w = (s) => keyLabel(s, false);
  assert.equal(w('⌘O'), 'Ctrl+O');
  assert.equal(w('⇧⌘P'), 'Ctrl+Shift+P');
  assert.equal(w('Previous week (⌥⌘←)'), 'Previous week (Ctrl+Alt+←)');
  assert.equal(w('⌃Tab switches'), 'Ctrl+Tab switches');
  assert.equal(w('⌘\\'), 'Ctrl+\\');
  assert.equal(w('⌘,'), 'Ctrl+,');
  assert.equal(w('Deleted · ⌘Z undoes'), 'Deleted · Ctrl+Z undoes');
  assert.equal(w('↑↓ navigate · ↵ open · ⇧↵ create'), '↑↓ navigate · ↵ open · Shift+↵ create');
  assert.equal(w('Keyboard: ⌘O open · ⌘P every command · ⌘/ all'), 'Keyboard: Ctrl+O open · Ctrl+P every command · Ctrl+/ all');
  assert.equal(w('⌥←/⌥→'), 'Alt+←/Alt+→');
  assert.equal(w('[['), '[[');
});
