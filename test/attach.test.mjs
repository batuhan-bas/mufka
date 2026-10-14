import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isImageName, attachUrl, attachInsertText, resolveAttachment, normalizeRel, isExecutableName,
  referencedBasenames, unusedAttachments, isOpenableDocument,
} from '../lib/attach.mjs';

test('isImageName covers allowed image types only', () => {
  for (const n of ['a.png', 'a.JPG', 'a.jpeg', 'a.gif', 'a.webp', 'a.svg']) assert.ok(isImageName(n));
  for (const n of ['a.pdf', 'a.txt', 'a', 'a.png.zip']) assert.ok(!isImageName(n));
});

test('attachInsertText encodes each segment and marks images', () => {
  assert.equal(attachInsertText('Ekler/foto bir.png'), '![foto bir.png](Ekler/foto%20bir.png)');
  assert.equal(attachInsertText('Attachments/rapor.pdf'), '[rapor.pdf](Attachments/rapor.pdf)');
  assert.equal(attachInsertText('Proje/files/a b.png', true, { noteDir: 'Proje', relative: true }), '![a b.png](files/a%20b.png)');
  assert.equal(attachInsertText('kok.png', true, { noteDir: '', relative: true }), '![kok.png](kok.png)');
});

test('attachUrl encodes each segment', () => {
  assert.equal(attachUrl('Ekler/foto bir.png'), 'mufka-att://v/Ekler/foto%20bir.png');
});

test('resolveAttachment classifies remote, image, file, missing', () => {
  const files = new Set(['Ekler/foto bir.png', 'Ekler/rapor.pdf']);
  assert.deepEqual(resolveAttachment('https://x/y.png', files), { remote: true });
  const img = resolveAttachment('Ekler/foto%20bir.png', files);
  assert.ok(img.isImage && img.exists && img.local);
  assert.equal(img.name, 'foto bir.png');
  assert.equal(img.rel, 'Ekler/foto bir.png');
  assert.equal(img.url, 'mufka-att://v/Ekler/foto%20bir.png');
  const emb = resolveAttachment('foto bir.png', files, '', 'Ekler'); // bare name -> the attachment folder
  assert.ok(emb.exists && emb.isImage);
  const file = resolveAttachment('Ekler/rapor.pdf', files);
  assert.ok(file.exists && !file.isImage);
  const miss = resolveAttachment('Ekler/yok.png', files);
  assert.ok(!miss.exists && miss.isImage && miss.local);
});

// Notes written by other tools (Obsidian) keep images anywhere in the vault.
test('resolveAttachment: paths relative to the note, then to the vault root', () => {
  const files = new Set(['Proje/img/a.png', 'img/a.png', 'Proje/b.png']);
  assert.equal(resolveAttachment('img/a.png', files, 'Proje').rel, 'Proje/img/a.png');
  assert.equal(resolveAttachment('img/a.png', files, 'Baska').rel, 'img/a.png');
  assert.equal(resolveAttachment('./b.png', files, 'Proje').rel, 'Proje/b.png');
  assert.equal(resolveAttachment('../img/a.png', files, 'Proje').rel, 'img/a.png');
  assert.equal(resolveAttachment('/img/a.png', files, 'Proje').rel, 'Proje/img/a.png');
});

test('resolveAttachment: a bare name is found anywhere, nearest first', () => {
  const files = new Set(['A/derin/sema.png', 'B/sema.png', 'Not/sema.png', 'tek.svg']);
  assert.equal(resolveAttachment('sema.png', files, 'Not').rel, 'Not/sema.png', 'same folder wins');
  assert.equal(resolveAttachment('sema.png', files, 'Z').rel, 'B/sema.png', 'then the shortest path');
  assert.equal(resolveAttachment('tek.svg', files, 'A/derin').rel, 'tek.svg');
  const missing = resolveAttachment('yok.png', files, 'Not');
  assert.ok(!missing.exists && missing.local);
});

test('resolveAttachment: a path climbing out of the vault is not local', () => {
  const r = resolveAttachment('../../etc/passwd', new Set(), 'Not');
  assert.equal(r.local, false);
  assert.equal(r.exists, false);
  assert.equal(r.url, '');
});

test('normalizeRel resolves dots and refuses escaping the root', () => {
  assert.equal(normalizeRel('a/./b/../c.png'), 'a/c.png');
  assert.equal(normalizeRel('/a//b'), 'a/b');
  assert.equal(normalizeRel('../x'), null);
  assert.equal(normalizeRel('a/../../x'), null);
});

test('isExecutableName flags files that would run code', () => {
  for (const n of ['x.command', 'Kurulum.pkg', 'a.app', 'run.sh', 'Script.scpt', 'site.webloc']) assert.ok(isExecutableName(n), n);
  for (const n of ['a.png', 'b.pdf', 'c.md', 'd.txt', 'e.zip']) assert.ok(!isExecutableName(n), n);
});

test('referencedBasenames finds link, image and embed targets', () => {
  const content = '![a](Ekler/foto%20bir.png) and [b](Ekler/rapor.pdf) and ![[ek.gif]] and [[Note#H|x]] and https://y/z.png';
  const got = referencedBasenames(content);
  assert.ok(got.has('foto bir.png'));
  assert.ok(got.has('rapor.pdf'));
  assert.ok(got.has('ek.gif'));
  assert.ok(got.has('Note')); // wiki note links counted too (harmless for unused calc)
  assert.ok(!got.has('z.png')); // remote excluded
});

test('unusedAttachments returns files no note references', () => {
  const ekler = ['used.png', 'orphan.pdf', 'embed.gif'];
  const notes = ['see ![](Ekler/used.png)', 'and ![[embed.gif]]'];
  assert.deepEqual(unusedAttachments(ekler, notes), ['orphan.pdf']);
});

test('only plain data files are openable; the rest is revealed', () => {
  for (const ok of ['a.png', 'Photo.HEIC', 'scan.tif', 'voice.m4a', 'song.mp3', 'clip.mov', 'film.mp4',
    'report.pdf', 'old.doc', 'sheet.xls', 'deck.pptx', 'plan.pages', 'budget.numbers', 'talk.key',
    'notes.txt', 'data.csv', 'conf.yml', 'archive.zip']) assert.ok(isOpenableDocument(ok), ok);
  for (const no of ['page.html', 'page.htm', 'run.sh', 'App.app', 'setup.pkg', 'x.command', 'noext',
    'image.png.app', 'script.js', 'tool.exe', 'link.webloc', '', undefined]) assert.ok(!isOpenableDocument(no), String(no));
});
