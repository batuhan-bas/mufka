import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comboOf, keyOf, customCommand, freedDefault, takenBy, assign, reset } from '../lib/hotkeys.mjs';

const cmds = [
  { label: 'Toggle source / preview', hint: '⌘E' },
  { label: 'Insert template', hint: '⇧⌘T' },
  { label: 'Open graph view', hint: '⌘G' },
  { label: 'Export note as PDF' },
  { id: 'dictate', label: 'Dictate with Handy', hint: '⇧⌘D' },
];

test('the keys a press makes', () => {
  assert.equal(comboOf({ code: 'KeyG', metaKey: true, shiftKey: true }), '⇧⌘G');
  assert.equal(comboOf({ code: 'BracketLeft', ctrlKey: true, altKey: true }), '⌥⌘[');
  assert.equal(comboOf({ code: 'Digit3', metaKey: true }), '⌘3');
  assert.equal(comboOf({ code: 'KeyG' }), null);
  assert.equal(comboOf({ code: 'KeyG', shiftKey: true }), null);
  assert.equal(comboOf({ code: 'ShiftLeft', metaKey: true }), null);
});

test('changing, taking and resetting shortcuts', () => {
  let o = assign({}, cmds, 'Export note as PDF', '⌘J');
  assert.equal(keyOf(cmds[3], o), '⌘J');
  assert.equal(customCommand('⌘J', cmds, o).label, 'Export note as PDF');
  assert.equal(customCommand('⌘E', cmds, o), null); // the app's own: handled as before
  // Take ⌘E for Insert template: the source toggle loses it; ⇧⌘T is free.
  assert.equal(takenBy('⌘E', cmds, o, 'Insert template').label, 'Toggle source / preview');
  o = assign(o, cmds, 'Insert template', '⌘E');
  assert.deepEqual(o, { 'Export note as PDF': '⌘J', 'Toggle source / preview': '', 'Insert template': '⌘E' });
  assert.equal(customCommand('⌘E', cmds, o).label, 'Insert template');
  assert.equal(freedDefault('⇧⌘T', cmds, o), true);
  assert.equal(freedDefault('⌘E', cmds, o), false);
  // Reset Insert template: back to ⇧⌘T, ⌘E belongs to nobody now.
  o = reset(o, cmds, 'Insert template');
  assert.equal(keyOf(cmds[1], o), '⇧⌘T');
  assert.equal(freedDefault('⌘E', cmds, o), true);
  // Reset the toggle: ⌘E is its own again; nothing left over.
  o = reset(o, cmds, 'Toggle source / preview');
  assert.deepEqual(o, { 'Export note as PDF': '⌘J' });
  // No shortcut at all.
  o = assign(o, cmds, 'dictate', '');
  assert.equal(keyOf(cmds[4], o), '');
  assert.equal(freedDefault('⇧⌘D', cmds, o), true);
});
