import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const source = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
function fixture(devUrl) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const frame = { url: pathToFileURL(path.join(root, 'out/renderer/index.html')).href };
  const event = { sender: { id: 7, mainFrame: frame }, senderFrame: frame };
  const handles = new Map(); const sync = new Map(); const writes = [];
  const ctx = vm.createContext({ path, fileURLToPath, URL, __dirname: path.join(root, 'out/main'),
    process: { env: { ELECTRON_RENDERER_URL: devUrl } }, app: { isPackaged: false }, appRenderers: new Set([7]),
    ipcMain: { handle: (name, fn) => handles.set(name, fn), on: (name, fn) => sync.set(name, fn) },
    readStore: () => 'plans', writeStore: data => writes.push(data), readNoteRel: rel => ({ rel }),
    writeNoteRel: () => { writes.push('note'); return { ok: true }; },
  });
  for (const name of ['trustedSender', 'assertTrustedSender']) {
    const start = source.indexOf(`function ${name}(`);
    if (start >= 0) vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), ctx);
  }
  const start = source.indexOf("ipcMain.on('mufka:isPackaged'");
  const end = source.indexOf('// Security: no page', start);
  vm.runInContext(source.slice(start, end), ctx);
  return { ctx, event, handles, sync, writes };
}
test('registered main-frame app IPC still reads and saves', async () => {
  const { event, handles, writes } = fixture();
  assert.equal(await handles.get('planner:load')(event), 'plans');
  assert.ok((await handles.get('planner:save')(event, { items: [] })).ok);
  assert.equal((await handles.get('notes:read')(event, 'note.md')).rel, 'note.md');
  assert.equal(writes.length, 1);
});
test('unregistered windows, child frames, missing frames and navigated pages cannot invoke privileged IPC', async () => {
  for (const alter of [e => { e.sender.id = 99; }, e => { e.senderFrame = { url: e.senderFrame.url }; },
    e => { e.senderFrame = null; }, e => { e.senderFrame.url = 'https://evil.invalid/index.html'; }]) {
    const { event, handles, writes } = fixture(); alter(event);
    assert.match((await handles.get('notes:write')(event, 'note.md', 'bad')).error || '', /unauthorized/);
    await assert.rejects(async () => handles.get('planner:save')(event, {}), /unauthorized/);
    await assert.rejects(async () => handles.get('planner:load')(event), /unauthorized/);
    assert.equal(writes.length, 0);
  }
});
test('development IPC requires the exact loaded dev origin and app path', async () => {
  const { event, handles } = fixture('http://localhost:5173');
  event.senderFrame.url = 'http://localhost:5173/index.html';
  assert.equal(await handles.get('planner:load')(event), 'plans');
  event.senderFrame.url = 'http://localhost:5173/other.html';
  await assert.rejects(async () => handles.get('planner:load')(event), /unauthorized/);
});
