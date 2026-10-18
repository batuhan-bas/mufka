import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import * as np from '../lib/notespath.mjs';
import * as bm from '../lib/bookmarks.mjs';
import * as at from '../lib/attach.mjs';
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
  const trashed = []; const opened = []; const revealed = [];
  let settings = {};
  const ctx = vm.createContext({ fs, path, np, bm, at, randomUUID, vaultLayout,
    notesRoot: () => root, noteOwnWrite: () => {}, readSettings: () => settings,
    writeSettings: patch => { settings = { ...settings, ...patch }; },
    isDir: p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } },
    shell: { trashItem: async p => { trashed.push(p); }, openPath: async p => { opened.push(p); return ''; }, showItemInFolder: p => revealed.push(p) },
    attachUnused: () => ['unused.pdf'], cleanableAttachDir: () => 'Attachments',
  });
  for (const name of ['writeFileAtomic', 'checkedVaultPath', 'readJson', 'obsidianSettings',
    'bookmarksRead', 'bookmarksWrite', 'layout', 'dailyRoot', 'ensureNotesDirs', 'safeAbs',
    'readDaily', 'writeDaily', 'deleteDaily', 'mutationAbs', 'isGunlukRoot',
    'attachAbs', 'attachTrash', 'attachOpen', 'trashNote', 'trashFolder']) vm.runInContext(original(name), ctx);
  return { root, outside, ctx, trashed, opened, revealed };
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
test('attachment cleanup cannot delete paths or referenced files outside its eligible list', async t => {
  const { root, ctx, trashed } = fixture(t);
  fs.mkdirSync(path.join(root, 'Attachments'));
  fs.writeFileSync(path.join(root, 'private.md'), 'private');
  for (const name of ['unused.pdf', 'used.pdf']) fs.writeFileSync(path.join(root, 'Attachments', name), 'file');
  await ctx.attachTrash(['../private.md', 'used.pdf', 'unused.pdf']);
  assert.deepEqual(trashed, [path.join(root, 'Attachments', 'unused.pdf')]);
});
test('attachment cleanup stays in its original vault when selection changes during trash', async t => {
  const { root, outside, ctx, trashed } = fixture(t);
  for (const vault of [root, outside]) {
    fs.mkdirSync(path.join(vault, 'Attachments'));
    for (const name of ['one.pdf', 'two.pdf']) fs.writeFileSync(path.join(vault, 'Attachments', name), 'file');
  }
  fs.writeFileSync(path.join(outside, 'note.md'), '[used](Attachments/two.pdf)');
  ctx.attachUnused = () => ['one.pdf', 'two.pdf'];
  ctx.shell.trashItem = async p => { trashed.push(p); ctx.notesRoot = () => outside; };
  await ctx.attachTrash(['one.pdf', 'two.pdf']);
  assert.deepEqual(trashed, [path.join(root, 'Attachments', 'one.pdf'), path.join(root, 'Attachments', 'two.pdf')]);
});
test('note and folder trash reject the vault root and mismatched types', async t => {
  const { root, ctx, trashed } = fixture(t);
  fs.mkdirSync(path.join(root, 'folder')); fs.writeFileSync(path.join(root, 'private.pdf'), 'file');
  for (const rel of ['', '/']) {
    await assert.rejects(() => ctx.trashFolder(rel), /invalid/);
    await assert.rejects(() => ctx.trashNote(rel), /invalid/);
  }
  await assert.rejects(() => ctx.trashNote('folder'), /invalid/);
  await assert.rejects(() => ctx.trashFolder('private.pdf'), /invalid/);
  await assert.rejects(() => ctx.trashNote('private.pdf'), /invalid/);
  assert.deepEqual(trashed, []);
});
test('daily folder protections recognize trailing separators and filesystem aliases', async t => {
  const { root, ctx, trashed } = fixture(t);
  fs.mkdirSync(path.join(root, 'Daily'));
  await assert.rejects(() => ctx.trashFolder('Daily/'), /daily notes/);
  fs.symlinkSync(path.join(root, 'Daily'), path.join(root, 'DailyAlias'));
  await assert.rejects(() => ctx.trashFolder('DailyAlias'), /daily notes|invalid/);
  assert.deepEqual(trashed, []);
});
test('unknown files, executable modes, bundle internals and disguised aliases are only revealed', async t => {
  const { root, ctx, opened, revealed } = fixture(t);
  const bundle = path.join(root, 'Example.app'); fs.mkdirSync(bundle);
  fs.writeFileSync(path.join(bundle, 'inside.pdf'), 'file');
  fs.writeFileSync(path.join(root, 'unknown'), 'file');
  fs.writeFileSync(path.join(root, 'executable.pdf'), 'file'); fs.chmodSync(path.join(root, 'executable.pdf'), 0o755);
  fs.symlinkSync(bundle, path.join(root, 'alias.pdf'));
  // Windows has no "executable" mode bit (programs are known by their name there).
  const rels = ['unknown', ...(process.platform === 'win32' ? [] : ['executable.pdf']), 'Example.app/inside.pdf', 'alias.pdf'];
  for (const rel of rels) await ctx.attachOpen(rel);
  assert.deepEqual(opened, []); assert.equal(revealed.length, rels.length);
});
test('ordinary PDF opens and OS open failure reaches the caller', async t => {
  const { root, ctx, opened } = fixture(t);
  const file = path.join(root, 'report.pdf'); fs.writeFileSync(file, 'file');
  await ctx.attachOpen('report.pdf'); assert.deepEqual(opened, [fs.realpathSync(file)]);
  ctx.shell.openPath = async () => 'No application';
  await assert.rejects(() => ctx.attachOpen('report.pdf'), /No application/);
});
test('attachment protocol constrains active SVG document responses', async t => {
  const { root, ctx } = fixture(t);
  fs.writeFileSync(path.join(root, 'marker.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><script>marker()</script></svg>');
  let handler;
  Object.assign(ctx, { URL, Response, ATTACH_SCHEME: 'mufka-att', ATTACH_MIME: { '.svg': 'image/svg+xml' },
    protocol: { handle: (_scheme, fn) => { handler = fn; } } });
  vm.runInContext(original('registerAttachProtocol'), ctx); ctx.registerAttachProtocol();
  const response = await handler({ url: 'mufka-att://v/marker.svg' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy') || '', /script-src 'none'/);
  assert.match(response.headers.get('content-security-policy') || '', /sandbox/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});
