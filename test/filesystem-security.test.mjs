import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import * as np from '../lib/notespath.mjs';
import * as bm from '../lib/bookmarks.mjs';
import { vaultLayout } from '../lib/layout.mjs';

// Exercise original main-process helpers; only Electron trash is replaced.
const source = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
function original(name) {
  const single = source.match(new RegExp(`^(?:async )?function ${name}\\([^\\n]*\\) \\{[^\\n]*\\}$`, 'm'));
  if (single) return single[0];
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  if (start < 0) return '';
  const end = source.indexOf('\n}', start);
  assert.ok(end >= 0, `missing end of ${name}`);
  return source.slice(start, end + 2);
}
function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mufka-fs-security-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'vault'); const outside = path.join(base, 'outside');
  fs.mkdirSync(root); fs.mkdirSync(outside);
  const trashed = [];
  let settings = {};
  const ctx = vm.createContext({ fs, path, np, bm, randomUUID, vaultLayout,
    notesRoot: () => root, noteOwnWrite: () => {}, readSettings: () => settings,
    writeSettings: patch => { settings = { ...settings, ...patch }; },
    isDir: p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } },
    shell: { trashItem: async p => { trashed.push(p); } },
  });
  for (const name of ['writeFileAtomic', 'checkedVaultPath', 'readJson', 'obsidianSettings',
    'bookmarksRead', 'bookmarksWrite', 'layout', 'dailyRoot', 'ensureNotesDirs', 'safeAbs',
    'readDaily', 'writeDaily', 'deleteDaily']) vm.runInContext(original(name), ctx);
  return { root, outside, ctx, trashed };
}
test('daily directory symlink cannot read or overwrite outside the vault', t => {
  const { root, outside, ctx } = fixture(t);
  fs.symlinkSync(outside, path.join(root, 'Daily'));
  const victim = path.join(outside, '2026-10-14.md'); fs.writeFileSync(victim, 'private');
  assert.throws(() => ctx.readDaily('2026-10-14'), /invalid/);
  assert.throws(() => ctx.writeDaily('2026-10-14', 'modified'), /invalid/);
  assert.equal(fs.readFileSync(victim, 'utf8'), 'private');
});
test('daily leaf symlink cannot read or reach trash outside the vault', async t => {
  const { root, outside, ctx, trashed } = fixture(t);
  fs.mkdirSync(path.join(root, 'Daily'));
  const victim = path.join(outside, 'private.md'); fs.writeFileSync(victim, 'private');
  fs.symlinkSync(victim, path.join(root, 'Daily', '2026-10-14.md'));
  assert.throws(() => ctx.readDaily('2026-10-14'), /invalid/);
  await assert.rejects(() => ctx.deleteDaily('2026-10-14'), /invalid/);
  assert.deepEqual(trashed, []);
});
test('atomic note writes ignore predictable attacker temp symlinks', t => {
  const { root, outside, ctx } = fixture(t);
  const note = path.join(root, 'note.md'); const victim = path.join(outside, 'private.txt');
  fs.writeFileSync(note, 'before'); fs.writeFileSync(victim, 'private');
  fs.symlinkSync(victim, `${note}.tmp`);
  ctx.writeFileAtomic(note, 'after');
  assert.equal(fs.readFileSync(victim, 'utf8'), 'private');
  assert.equal(fs.readFileSync(note, 'utf8'), 'after');
  assert.equal(fs.lstatSync(note).isSymbolicLink(), false);
});
test('atomic writer removes its temp file after rename failure', t => {
  const { root, ctx } = fixture(t);
  const dest = path.join(root, 'directory'); fs.mkdirSync(dest);
  assert.throws(() => ctx.writeFileAtomic(dest, 'data'));
  assert.deepEqual(fs.readdirSync(root), ['directory']);
});
test('atomic writer refuses an existing randomized temp path', t => {
  const { root, outside, ctx } = fixture(t);
  const note = path.join(root, 'note.md'); const victim = path.join(outside, 'private.txt');
  fs.writeFileSync(note, 'before'); fs.writeFileSync(victim, 'private');
  ctx.randomUUID = () => 'collision';
  fs.symlinkSync(victim, `${note}.collision.tmp`);
  assert.throws(() => ctx.writeFileAtomic(note, 'after'), /EEXIST/);
  assert.equal(fs.readFileSync(victim, 'utf8'), 'private');
  assert.equal(fs.readFileSync(note, 'utf8'), 'before');
  assert.equal(fs.lstatSync(`${note}.collision.tmp`).isSymbolicLink(), true);
});
test('atomic writes keep the existing default file permission policy', t => {
  const { root, ctx } = fixture(t);
  const note = path.join(root, 'note.md');
  ctx.writeFileAtomic(note, 'note');
  assert.equal(fs.statSync(note).mode & 0o777, 0o666 & ~process.umask());
});
test('symlinked obsidian directory cannot receive bookmark writes', t => {
  const { root, outside, ctx } = fixture(t);
  fs.symlinkSync(outside, path.join(root, '.obsidian'));
  assert.throws(() => ctx.bookmarksWrite({ items: [] }), /invalid/);
  assert.equal(fs.existsSync(path.join(outside, 'bookmarks.json')), false);
});
test('outside obsidian configuration files are ignored', t => {
  const { root, outside, ctx } = fixture(t);
  const dir = path.join(root, '.obsidian'); fs.mkdirSync(dir);
  const config = path.join(outside, 'daily-notes.json');
  fs.writeFileSync(config, JSON.stringify({ folder: 'Unexpected' }));
  fs.symlinkSync(config, path.join(dir, 'daily-notes.json'));
  assert.equal(ctx.layout().daily, 'Daily');
});
test('outside bookmark file symlink is not read or written', t => {
  const { root, outside, ctx } = fixture(t);
  const dir = path.join(root, '.obsidian'); fs.mkdirSync(dir);
  const victim = path.join(outside, 'bookmarks.json');
  fs.writeFileSync(victim, JSON.stringify({ items: [{ type: 'file', path: 'private.md' }] }));
  fs.symlinkSync(victim, path.join(dir, 'bookmarks.json'));
  assert.equal(ctx.bookmarksRead().items.length, 0);
  assert.throws(() => ctx.bookmarksWrite({ items: [] }), /invalid/);
  assert.ok(fs.readFileSync(victim, 'utf8').includes('private.md'));
});
test('valid custom daily folder and bookmarks still round-trip', async t => {
  const { root, ctx, trashed } = fixture(t);
  const dir = path.join(root, '.obsidian'); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'daily-notes.json'), JSON.stringify({ folder: 'Journal/Nested', format: 'YYYY-MM-DD' }));
  ctx.writeDaily('2026-10-14', 'daily note');
  assert.equal(ctx.readDaily('2026-10-14').content, 'daily note');
  const json = { items: [{ type: 'file', path: 'note.md' }] };
  ctx.bookmarksWrite(json); assert.equal(ctx.bookmarksRead().items[0].path, 'note.md');
  await ctx.deleteDaily('2026-10-14');
  assert.equal(trashed.length, 1);
  assert.ok(np.realInside(root, trashed[0], fs));
  assert.throws(() => ctx.writeDaily('../escape', 'data'), /bad date/);
});
