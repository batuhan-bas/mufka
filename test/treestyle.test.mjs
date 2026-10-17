import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PALETTE, TREE_ICONS, paletteHex, folderColor, rowColor, isIconId, cleanEmoji,
  setStyle, remapStyles, pruneStyles,
} from '../lib/treestyle.mjs';
import { readFileSync } from 'node:fs';

test('folders take their level colour unless one is chosen', () => {
  assert.equal(folderColor('Projeler', {}), paletteHex('indigo'));
  assert.equal(folderColor('Projeler/Mufka', {}), paletteHex('teal'));
  assert.equal(folderColor('a/b/c/d/e/f', {}), paletteHex('indigo')); // six levels wrap round
  assert.equal(folderColor('Projeler', { Projeler: { color: 'pink' } }), paletteHex('pink'));
  assert.equal(folderColor('Projeler', { Projeler: { color: 'nope' } }), paletteHex('indigo'));
});

test('a note is coloured like the guide beside it, or its own colour', () => {
  const styles = { Tarifler: { color: 'amber' } };
  assert.equal(rowColor('Tarifler/Çorba.md', 'note', styles), paletteHex('amber'));
  assert.equal(rowColor('Projeler/Mufka/Yol.md', 'note', {}), paletteHex('teal'));
  assert.equal(rowColor('Fikirler.md', 'note', {}), null);
  assert.equal(rowColor('Fikirler.md', 'note', { 'Fikirler.md': { color: 'green' } }), paletteHex('green'));
  assert.equal(rowColor('Tarifler', 'folder', styles), paletteHex('amber'));
});

test('icons: picker ids and single emoji only', () => {
  assert.ok(isIconId('tiStar'));
  assert.ok(!isIconId('star'));
  assert.equal(cleanEmoji(' 🍲 '), '🍲');
  assert.equal(cleanEmoji('🇹🇷 flag'), '🇹🇷');
  assert.equal(cleanEmoji('👩‍💻x'), '👩‍💻');
  assert.equal(cleanEmoji('abc'), '');
  assert.equal(cleanEmoji(''), '');
});

test('every picker icon exists in the icon set', () => {
  const src = readFileSync(new URL('../src/icons.js', import.meta.url), 'utf8');
  for (const id of TREE_ICONS) assert.ok(src.includes(`"${id}":`), id);
  assert.equal(new Set(PALETTE.map((p) => p.id)).size, PALETTE.length);
});

test('setStyle adds, replaces and clears', () => {
  let s = setStyle({}, 'A', 'color', 'teal');
  s = setStyle(s, 'A', 'icon', 'tiStar');
  assert.deepEqual(s, { A: { color: 'teal', icon: 'tiStar' } });
  s = setStyle(s, 'A', 'color', '');
  assert.deepEqual(s, { A: { icon: 'tiStar' } });
  s = setStyle(s, 'A', 'icon', null);
  assert.deepEqual(s, {});
});

test('renames and moves carry styles along; missing items are pruned', () => {
  const s = { İş: { color: 'pink' }, 'İş/Q1.md': { icon: 'tiStar' }, 'İşler/x.md': { icon: '🍲' }, Diğer: { color: 'teal' } };
  const r = remapStyles(s, 'İş', 'Arşiv/İş');
  assert.deepEqual(r, { 'Arşiv/İş': { color: 'pink' }, 'Arşiv/İş/Q1.md': { icon: 'tiStar' }, 'İşler/x.md': { icon: '🍲' }, Diğer: { color: 'teal' } });
  assert.deepEqual(pruneStyles(r, ['Diğer', 'Arşiv/İş']), { 'Arşiv/İş': { color: 'pink' }, Diğer: { color: 'teal' } });
});
