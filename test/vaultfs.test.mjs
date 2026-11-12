import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { noteRel, folderRel, vaultAbs, listVault, readNote, createNote, appendToNote } from '../lib/vaultfs.mjs';

// A vault next to a folder outside it, with symlinks out of the vault.
function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mufka-vaultfs-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'vault'); const outside = path.join(base, 'outside');
  fs.mkdirSync(path.join(root, 'Work'), { recursive: true });
  fs.mkdirSync(path.join(root, '.obsidian'));
  fs.mkdirSync(path.join(root, 'Attachments'));
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(root, 'Home.md'), '# Home\n');
  fs.writeFileSync(path.join(root, 'Work', 'Plan.md'), 'plan');
  fs.writeFileSync(path.join(root, 'Work', 'image.png'), 'png');
  fs.writeFileSync(path.join(root, '.obsidian', 'Hidden.md'), 'no');
  fs.writeFileSync(path.join(root, '.obsidian', 'app.json'), JSON.stringify({ attachmentFolderPath: 'Attachments' }));
  fs.writeFileSync(path.join(root, 'Attachments', 'Pasted.md'), 'no');
  fs.writeFileSync(path.join(outside, 'secret.md'), 'secret');
  fs.writeFileSync(path.join(outside, 'planlar.json'), '{}');
  fs.symlinkSync(outside, path.join(root, 'Escape'));
  fs.symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'Leak.md'));
  return { root, outside };
}

test('noteRel takes plain vault paths and refuses the rest', () => {
  assert.equal(noteRel('Work/Plan.md'), 'Work/Plan.md');
  assert.equal(noteRel('/Work//Plan.md'.slice(1)), 'Work/Plan.md');
  assert.equal(noteRel('Ideas/New', { addMd: true }), 'Ideas/New.md');
  assert.equal(noteRel('Günlük/Çay ve şeker.md'), 'Günlük/Çay ve şeker.md');
  for (const bad of ['', '../x.md', 'a/../../x.md', './x.md', '/etc/passwd.md', 'C:/x.md', 'a\\..\\x.md', '.obsidian/x.md', 'a/.hidden.md', 'a:b.md', 'x.md\0', 'planlar.json', 'Work/Plan']) {
    assert.throws(() => noteRel(bad), /path|note|required/i, bad);
  }
  assert.equal(folderRel('Work/'), 'Work');
  assert.equal(folderRel(''), '');
  assert.throws(() => folderRel('../outside'));
});

test('listVault walks notes like the app: no dot folders, attachments or symlinks', (t) => {
  const { root } = fixture(t);
  const { notes, folders } = listVault(root);
  assert.deepEqual(notes.map((n) => n.rel).sort(), ['Home.md', 'Work/Plan.md']);
  assert.deepEqual(folders, ['Work']);
  assert.ok(notes.every((n) => n.mtime > 0 && n.size > 0));
});

test('readNote reads inside the vault and nothing outside it', (t) => {
  const { root } = fixture(t);
  assert.equal(readNote(root, 'Work/Plan.md').content, 'plan');
  assert.equal(readNote(root, 'Work/Missing.md'), null);
  assert.throws(() => readNote(root, 'Escape/secret.md'), /Outside the vault/);
  assert.throws(() => readNote(root, 'Leak.md'), /Outside the vault/);
  assert.throws(() => readNote(root, '../outside/secret.md'), /Not a vault path/);
  assert.throws(() => readNote(root, 'Work/image.png'), /only \.md/);
  assert.throws(() => vaultAbs(root, 'Escape'), /Outside the vault/);
});

test('createNote makes a new note, never replaces one, never writes outside', (t) => {
  const { root, outside } = fixture(t);
  assert.equal(createNote(root, 'Ideas/Deep/New', 'hello'), 'Ideas/Deep/New.md');
  assert.equal(fs.readFileSync(path.join(root, 'Ideas', 'Deep', 'New.md'), 'utf8'), 'hello');
  assert.throws(() => createNote(root, 'Home.md', 'x'), /already exists/);
  assert.equal(fs.readFileSync(path.join(root, 'Home.md'), 'utf8'), '# Home\n');
  assert.throws(() => createNote(root, 'Escape/new.md', 'x'), /Outside the vault/);
  assert.throws(() => createNote(root, 'Leak.md', 'x'), /Outside the vault/);
  assert.deepEqual(fs.readdirSync(outside).sort(), ['planlar.json', 'secret.md']);
  assert.equal(fs.readFileSync(path.join(outside, 'secret.md'), 'utf8'), 'secret');
});

test('appendToNote adds a line at the end of an existing note only', (t) => {
  const { root, outside } = fixture(t);
  appendToNote(root, 'Work/Plan.md', 'next step\n\n');
  assert.equal(fs.readFileSync(path.join(root, 'Work', 'Plan.md'), 'utf8'), 'plan\nnext step\n');
  appendToNote(root, 'Home.md', 'more');
  assert.equal(fs.readFileSync(path.join(root, 'Home.md'), 'utf8'), '# Home\nmore\n');
  assert.throws(() => appendToNote(root, 'Work/Nope.md', 'x'), /No note/);
  assert.throws(() => appendToNote(root, 'Leak.md', 'x'), /Outside the vault/);
  assert.equal(fs.readFileSync(path.join(outside, 'secret.md'), 'utf8'), 'secret');
  assert.deepEqual(fs.readdirSync(path.join(root, 'Work')).sort(), ['Plan.md', 'image.png']); // no temp files left
});
