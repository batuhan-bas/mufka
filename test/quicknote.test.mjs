import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickTarget, appendLine, dailyLine } from '../lib/quicknote.mjs';

const rels = ['Groceries.md', 'Projects/Website.md', 'Günlük/2026-11-16.md', 'Old/Groceries.md'];

test('quickTarget: "Name: text" goes to that note, the rest to the daily note', () => {
  assert.deepEqual(quickTarget('Groceries: oat milk, eggs', rels), { rel: 'Groceries.md', title: 'Groceries', body: 'oat milk, eggs' });
  assert.deepEqual(quickTarget('  website :  new logo ', rels), { rel: 'Projects/Website.md', title: 'Website', body: 'new logo' }, 'case and spaces do not matter');
  assert.deepEqual(quickTarget('Ask Mert about the logo files', rels), { rel: null, body: 'Ask Mert about the logo files' });
  assert.deepEqual(quickTarget('Note: the printer is out of paper', rels), { rel: null, body: 'Note: the printer is out of paper' }, 'no such note');
  assert.deepEqual(quickTarget('Groceries:', rels), { rel: null, body: 'Groceries:' }, 'nothing to add');
  assert.equal(quickTarget('meet at 10:30', rels).rel, null, 'a time is not a name');
});

test('quickTarget: i and ı are the same letter in names', () => {
  assert.equal(quickTarget('ışık listesi: ampul', ['Işık listesi.md']).rel, 'Işık listesi.md');
});

test('appendLine: one more list line at the end', () => {
  assert.equal(appendLine('', 'a'), '- a\n');
  assert.equal(appendLine('# Groceries\n\n- bread\n', 'milk'), '# Groceries\n\n- bread\n- milk\n');
  assert.equal(appendLine('# Day\n\nWent well.', 'call'), '# Day\n\nWent well.\n\n- call\n', 'a blank line after a paragraph');
  assert.equal(appendLine('- a\n\n\n', 'two\nlines'), '- a\n- two lines\n');
});

test('dailyLine: the time first', () => {
  assert.equal(dailyLine('call Ayşe', new Date(2026, 10, 16, 9, 5)), '09:05 call Ayşe');
});
