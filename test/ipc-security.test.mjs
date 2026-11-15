import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createSenderCheck } from '../lib/ipc-guard.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const rendererFile = path.join(root, 'out/renderer/index.html');
function fixture(devUrl) {
  const frame = { url: pathToFileURL(rendererFile).href };
  const event = { sender: { id: 7, mainFrame: frame }, senderFrame: frame };
  const guard = createSenderCheck({ appRenderers: new Set([7]), isPackaged: () => false, devUrl: () => devUrl, rendererFile });
  const calls = [];
  const write = guard.wrap((rel, text) => { calls.push([rel, text]); return { ok: true }; });
  return { guard, event, write, calls };
}

test('the app window\'s main frame is answered', async () => {
  const { guard, event, write, calls } = fixture();
  assert.equal(guard.trustedSender(event), true);
  assert.doesNotThrow(() => guard.assertTrustedSender(event));
  assert.deepEqual(await write(event, 'note.md', 'text'), { ok: true });
  assert.deepEqual(calls, [['note.md', 'text']]);
});

test('unregistered windows, child frames, missing frames and navigated pages are refused', async () => {
  for (const alter of [e => { e.sender.id = 99; }, e => { e.senderFrame = { url: e.senderFrame.url }; },
    e => { e.senderFrame = null; }, e => { e.senderFrame.url = 'https://evil.invalid/index.html'; },
    e => { e.senderFrame.url = pathToFileURL(path.join(root, 'out/renderer/other.html')).href; e.sender.mainFrame = e.senderFrame; }]) {
    const { guard, event, write, calls } = fixture(); alter(event);
    assert.equal(guard.trustedSender(event), false);
    assert.throws(() => guard.assertTrustedSender(event), /unauthorized/);
    assert.match((await write(event, 'note.md', 'bad')).error || '', /unauthorized/);
    assert.equal(calls.length, 0);
  }
});

test('development IPC requires the exact loaded dev origin and app path', () => {
  const { guard, event } = fixture('http://localhost:5173');
  event.senderFrame.url = 'http://localhost:5173/index.html';
  assert.equal(guard.trustedSender(event), true);
  event.senderFrame.url = 'http://localhost:5173/other.html';
  assert.equal(guard.trustedSender(event), false);
  event.senderFrame.url = 'http://localhost:5174/index.html';
  assert.equal(guard.trustedSender(event), false);
});

// Every IPC handler main.js registers goes through the guard: wrap(...), or a
// handler that checks the sender first.
test('every IPC handler in main.js checks its sender', () => {
  const source = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  const regs = [...source.matchAll(/ipcMain\.(handle|on)\('([^']+)',\s*([^\n]*)/g)];
  assert.ok(regs.length > 50, `only ${regs.length} handlers found`);
  const unguarded = regs.filter(([, , , rest]) => {
    if (/^wrap\(/.test(rest)) return false;
    // An inline handler: its first statement checks the sender.
    const at = source.indexOf(rest);
    const head = source.slice(at, at + 300);
    return !/^(?:async )?\(?(\w+)[^)]*\)? => \{?\s*(?:\{\s*)?(?:assertTrustedSender\(\1\)|event\.returnValue = trustedSender\(\1\))/.test(head.replace(/\n\s*/g, ' '));
  }).map(([, , name]) => name);
  assert.deepEqual(unguarded, []);
});
