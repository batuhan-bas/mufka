import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveVaultRoot, vaultChoiceError } from '../lib/vault.mjs';

const DEFAULT = '/Users/a/Library/Application Support/Mufka/Notlar';
const dirs = new Set(['/Users/a/Obsidian', '/Users/a/Notes']);
const isDir = (p) => dirs.has(p);

test('no setting: the default vault', () => {
  assert.deepEqual(resolveVaultRoot(null, DEFAULT, isDir), { root: DEFAULT, custom: false, missing: null });
  assert.deepEqual(resolveVaultRoot({}, DEFAULT, isDir), { root: DEFAULT, custom: false, missing: null });
});

test('an existing chosen folder is used', () => {
  assert.deepEqual(resolveVaultRoot({ vaultPath: '/Users/a/Obsidian' }, DEFAULT, isDir),
    { root: '/Users/a/Obsidian', custom: true, missing: null });
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
