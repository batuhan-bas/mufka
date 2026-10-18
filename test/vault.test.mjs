import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveVaultRoot, vaultChoiceError, defaultNotesPlace, moveNotesFolder } from '../lib/vault.mjs';

const DEFAULT = '/Users/a/Library/Application Support/Mufka/Notlar';
const dirs = new Set(['/Users/a/Obsidian', '/Users/a/Notes']);
const isDir = (p) => dirs.has(p);

test('no setting: the default vault', () => {
  assert.deepEqual(resolveVaultRoot(null, DEFAULT, isDir), { root: DEFAULT, custom: false, missing: null });
  assert.deepEqual(resolveVaultRoot({}, DEFAULT, isDir), { root: DEFAULT, custom: false, missing: null });
});

test('an existing chosen folder is used', () => {
  assert.deepEqual(resolveVaultRoot({ vaultPath: '/Users/a/Obsidian' }, DEFAULT, isDir),
    { root: path.resolve('/Users/a/Obsidian'), custom: true, missing: null }); // a drive letter on Windows
});

test('a chosen folder that is gone falls back to the default and is reported', () => {
  assert.deepEqual(resolveVaultRoot({ vaultPath: '/Volumes/USB/Vault' }, DEFAULT, isDir),
    { root: DEFAULT, custom: false, missing: '/Volumes/USB/Vault' });
});

test('a relative or non-string setting is ignored safely', () => {
  assert.equal(resolveVaultRoot({ vaultPath: 'Obsidian' }, DEFAULT, () => true).root, DEFAULT);
  assert.equal(resolveVaultRoot({ vaultPath: 42 }, DEFAULT, isDir).root, DEFAULT);
});

test('vaultChoiceError refuses the disk root, home itself and folders holding app data', () => {
  const env = { home: '/Users/a', userData: '/Users/a/Library/Application Support/Mufka' };
  assert.equal(vaultChoiceError('/Users/a/Obsidian', env), null);
  assert.equal(vaultChoiceError('/Users/a/Library/Application Support/Mufka/Notlar', env), null); // the default vault
  assert.match(vaultChoiceError('/', env), /root of a disk/);
  assert.match(vaultChoiceError('/Users/a', env), /home folder/);
  assert.match(vaultChoiceError('/Users/a/', env), /home folder/);
  assert.match(vaultChoiceError('/Users/a/Library', env), /own data/);
  assert.match(vaultChoiceError('/Users/a/Library/Application Support/Mufka', env), /own data/);
  assert.match(vaultChoiceError('', env), /Not a valid/);
  assert.match(vaultChoiceError('relative/path', env), /Not a valid/);
});

test('default notes folder: Documents/Mufka, moving an old app-data folder once', () => {
  // Built with path.join, as the app does, so this holds on Windows too.
  const userData = path.join('/Users/a/Library/Application Support/Mufka');
  const documents = path.join('/Users/a/Documents');
  const docs = path.join(documents, 'Mufka');
  const ud = (name) => path.join(userData, name);
  const place = (folders, settings, full = folders) => defaultNotesPlace({
    userData, documents, settings, isDir: (p) => folders.includes(p), hasFiles: (p) => full.includes(p),
  });
  // A new install: Documents/Mufka, nothing to move.
  assert.deepEqual(place([], {}), { root: docs, docs, legacy: null, move: false });
  // Notes in the old folder: move them to Documents.
  assert.deepEqual(place([ud('Notes')], {}), { root: ud('Notes'), docs, legacy: ud('Notes'), move: true });
  assert.equal(place([ud('Notlar'), ud('Notes')], {}).legacy, ud('Notlar'));
  // An empty old folder is not worth moving.
  assert.deepEqual(place([ud('Notes')], {}, []), { root: docs, docs, legacy: null, move: false });
  // Already moved (a copy across disks leaves the old one): use Documents.
  assert.deepEqual(place([ud('Notes'), docs], { notesInDocuments: true }), { root: docs, docs, legacy: ud('Notes'), move: false });
  // Documents/Mufka already holds other things: never mix, keep the old folder.
  assert.deepEqual(place([ud('Notes'), docs], {}), { root: ud('Notes'), docs, legacy: ud('Notes'), move: false });
});

test('moveNotesFolder renames, refuses to overwrite, copies across disks', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const p = await import('node:path');
  const tmp = fs.mkdtempSync(p.join(os.tmpdir(), 'mufka-vault-'));
  try {
    const from = p.join(tmp, 'Support', 'Notes');
    const to = p.join(tmp, 'Documents', 'Mufka');
    fs.mkdirSync(p.join(from, 'Projeler'), { recursive: true });
    fs.writeFileSync(p.join(from, 'Projeler', 'Yol.md'), '# Yol\n');
    fs.mkdirSync(to, { recursive: true }); fs.writeFileSync(p.join(to, '.DS_Store'), ''); // empty but for a dotfile
    assert.deepEqual(moveNotesFolder(from, to, fs), { copied: false });
    assert.equal(fs.readFileSync(p.join(to, 'Projeler', 'Yol.md'), 'utf8'), '# Yol\n');
    assert.ok(!fs.existsSync(from));
    // Never overwrites a folder with something in it.
    fs.mkdirSync(from, { recursive: true }); fs.writeFileSync(p.join(from, 'x.md'), 'x');
    assert.throws(() => moveNotesFolder(from, to, fs), /not empty/);
    assert.ok(fs.existsSync(p.join(from, 'x.md')));
    // Across disks: copy and keep the original.
    const other = p.join(tmp, 'Other', 'Mufka');
    const exdev = { ...fs, renameSync: () => { const e = new Error('cross-device'); e.code = 'EXDEV'; throw e; } };
    assert.deepEqual(moveNotesFolder(from, other, exdev), { copied: true });
    assert.equal(fs.readFileSync(p.join(other, 'x.md'), 'utf8'), 'x');
    assert.ok(fs.existsSync(p.join(from, 'x.md')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
