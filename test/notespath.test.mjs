import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  sanitizeTitle, resolveUniqueName, isInside, noteFilePath, dailyFilePath, titleFromFile,
  splitRel, vaultPath, relFromAbs, realInside, exportFileName,
} from '../lib/notespath.mjs';

test('sanitizeTitle strips illegal characters, keeps spaces/hyphens', () => {
  assert.equal(sanitizeTitle('Plan A-B'), 'Plan A-B');
  assert.equal(sanitizeTitle('a/b:c*d?e"f<g>h|i\\j'), 'a b c d e f g h i j');
  assert.equal(sanitizeTitle('  hi  '), 'hi');
});

test('sanitizeTitle neutralises traversal and empty names', () => {
  assert.equal(sanitizeTitle('../../etc/passwd'), 'etc passwd');
  assert.equal(sanitizeTitle('..'), 'Adsız');
  assert.equal(sanitizeTitle(''), 'Adsız');
  assert.equal(sanitizeTitle('...'), 'Adsız');
  // No path separators ever survive.
  assert.ok(!sanitizeTitle('a/b/c').includes('/'));
});

test('resolveUniqueName appends numbers on collision (case-insensitive)', () => {
  assert.equal(resolveUniqueName('Not', new Set()), 'Not');
  assert.equal(resolveUniqueName('Not', new Set(['Not'])), 'Not 2');
  assert.equal(resolveUniqueName('Not', new Set(['not', 'NOT 2'])), 'Not 3');
});

test('isInside rejects traversal, accepts children', () => {
  const root = '/data/Notlar';
  assert.ok(isInside(root, '/data/Notlar/a.md'));
  assert.ok(isInside(root, '/data/Notlar/Günlük/2026-10-04.md'));
  assert.ok(isInside(root, root));
  assert.ok(!isInside(root, '/data/Notlar/../secret.md'));
  assert.ok(!isInside(root, '/data/other.md'));
  assert.ok(!isInside(root, '/data/NotlarEvil/a.md'));
});

test('noteFilePath is always directly inside root', () => {
  const root = '/data/Notlar';
  const p = noteFilePath(root, '../../escape');
  assert.equal(path.dirname(p), root);
  assert.ok(p.endsWith('.md'));
  assert.ok(isInside(root, p));
});

test('dailyFilePath validates the date key', () => {
  const root = '/data/Notlar/Günlük';
  assert.equal(dailyFilePath(root, '2026-10-04'), path.join(root, '2026-10-04.md'));
  assert.throws(() => dailyFilePath(root, '2026-10'));
  assert.throws(() => dailyFilePath(root, '../x'));
});

test('titleFromFile drops the extension', () => {
  assert.equal(titleFromFile('Toplantı.md'), 'Toplantı');
});

test('exportFileName sanitises the title and keeps the extension', () => {
  assert.equal(exportFileName('Toplantı', 'md'), 'Toplantı.md');
  assert.equal(exportFileName('Rapor/Q1', 'pdf'), 'Rapor Q1.pdf');
  assert.equal(exportFileName('2026-10-04', 'pdf'), '2026-10-04.pdf');
  assert.equal(exportFileName('', 'md'), 'Adsız.md');
  assert.equal(exportFileName('x', '.PDF'), 'x.pdf');
});

test('splitRel sanitises each segment and neutralises traversal', () => {
  assert.deepEqual(splitRel('İş/Raporlar/Q1.md'), ['İş', 'Raporlar', 'Q1.md']);
  assert.deepEqual(splitRel('../../etc/passwd'), ['Adsız', 'Adsız', 'etc', 'passwd']);
  assert.deepEqual(splitRel('a//b/'), ['a', 'b']);
});

test('vaultPath stays inside root; relFromAbs round-trips', () => {
  const root = '/data/Notlar';
  const p = vaultPath(root, 'İş/Q1.md');
  assert.ok(isInside(root, p));
  assert.equal(relFromAbs(root, p), 'İş/Q1.md');
  // Traversal cannot escape.
  assert.ok(isInside(root, vaultPath(root, '../../x.md')));
});

test('realInside rejects symlink escape, accepts normal paths', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mufka-sym-'));
  const root = path.join(base, 'Notlar'); fs.mkdirSync(root);
  const outside = path.join(base, 'outside'); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'secret.md'), 'x');
  fs.symlinkSync(outside, path.join(root, 'link'));
  fs.mkdirSync(path.join(root, 'real'));

  assert.ok(realInside(root, path.join(root, 'real', 'note.md'), fs));
  assert.ok(realInside(root, path.join(root, 'yeni.md'), fs)); // non-existent, plain
  assert.ok(!realInside(root, path.join(root, 'link', 'secret.md'), fs)); // symlink escape
  fs.rmSync(base, { recursive: true, force: true });
});
