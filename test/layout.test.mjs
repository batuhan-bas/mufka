import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vaultLayout as fullLayout, attachmentsDirFor, hiddenAttachmentsFolder } from '../lib/layout.mjs';

// The folder part (the template settings are tested below).
const vaultLayout = (o, e) => { const { daily, attachments, relative } = fullLayout(o, e); return { daily, attachments, relative }; };

const none = () => false;
const has = (...names) => (n) => names.includes(n);

test('a fresh vault gets English folders', () => {
  assert.deepEqual(vaultLayout(null, none), { daily: 'Daily', attachments: 'Attachments', relative: false });
});

test('a vault Mufka created before keeps Günlük and Ekler', () => {
  assert.deepEqual(vaultLayout(null, has('Günlük', 'Ekler')), { daily: 'Günlük', attachments: 'Ekler', relative: false });
});

test("Obsidian's daily notes folder is used when its format is YYYY-MM-DD", () => {
  assert.equal(vaultLayout({ dailyNotes: { folder: 'Journal/Daily' } }, none).daily, 'Journal/Daily');
  assert.equal(vaultLayout({ dailyNotes: { folder: 'Journal', format: 'YYYY-MM-DD' } }, none).daily, 'Journal');
  assert.equal(vaultLayout({ dailyNotes: { folder: '' } }, none).daily, '', 'vault root');
  assert.equal(vaultLayout({ dailyNotes: { folder: 'J', format: 'DD.MM.YYYY' } }, has('Günlük')).daily, 'Günlük', 'unsupported format');
  assert.equal(vaultLayout({ dailyNotes: { folder: '../out' } }, none).daily, 'Daily', 'outside the vault');
});

test("Obsidian's attachment folder: root, a folder, or next to the note", () => {
  assert.deepEqual(vaultLayout({}, has('Ekler')), { daily: 'Daily', attachments: '', relative: false }, 'default "/" = root');
  assert.deepEqual(vaultLayout({ app: { attachmentFolderPath: '/' } }, none).attachments, '');
  assert.deepEqual(vaultLayout({ app: { attachmentFolderPath: 'assets/img' } }, none), { daily: 'Daily', attachments: 'assets/img', relative: false });
  assert.deepEqual(vaultLayout({ app: { attachmentFolderPath: './' } }, none), { daily: 'Daily', attachments: '', relative: true });
  assert.deepEqual(vaultLayout({ app: { attachmentFolderPath: './files' } }, none), { daily: 'Daily', attachments: 'files', relative: true });
});

test('attachmentsDirFor and the hidden folder', () => {
  const fixed = { attachments: 'Attachments', relative: false };
  const nextTo = { attachments: 'files', relative: true };
  assert.equal(attachmentsDirFor(fixed, 'Proje'), 'Attachments');
  assert.equal(attachmentsDirFor(nextTo, 'Proje'), 'Proje/files');
  assert.equal(attachmentsDirFor(nextTo, ''), 'files');
  assert.equal(attachmentsDirFor({ attachments: '', relative: true }, 'Proje'), 'Proje');
  assert.equal(hiddenAttachmentsFolder(fixed), 'Attachments');
  assert.equal(hiddenAttachmentsFolder(nextTo), null);
  assert.equal(hiddenAttachmentsFolder({ attachments: '', relative: false }), null);
  assert.equal(hiddenAttachmentsFolder({ attachments: 'a/b', relative: false }), null);
});

test('templates folder, formats and the daily template', () => {
  assert.deepEqual(fullLayout(null, () => false).templates, null);
  const l = fullLayout(null, has('Templates'));
  assert.deepEqual([l.templates, l.dailyTemplate, l.dateFormat, l.timeFormat], ['Templates', null, 'YYYY-MM-DD', 'HH:mm']);
  const o = fullLayout({ templates: { folder: 'Meta/Tpl', dateFormat: 'DD.MM.YYYY' }, dailyNotes: { folder: 'J', template: 'Meta/Tpl/Daily' } }, none);
  assert.deepEqual([o.templates, o.dailyTemplate, o.dateFormat], ['Meta/Tpl', 'Meta/Tpl/Daily.md', 'DD.MM.YYYY']);
  assert.equal(fullLayout({ templates: { folder: '../x' } }, none).templates, null, 'outside the vault');
});
