import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMufkaServer } from '../mcp/tools.mjs';
import { defaultUserData, locateVault } from '../mcp/locate.mjs';

const NOTES = {
  'Home.md': '# Home\nSee [[Website]] and [[Şehir rehberi]].\n#personal',
  'Projects/Website.md': '---\ntype: project\nstatus: active\nstart: 2026-10-01\ndue: 2026-12-01\ntags: [work]\n---\n## Tasks\n- [x] Design\n- [ ] Deploy to the server\n',
  'Projects/Old site.md': '---\ntype: project\nstatus: done\n---\n- [x] Ship\n',
  'Şehir rehberi.md': 'İstanbul için çay ve simit önerileri. #gezi/istanbul',
  'Work/Standup.md': 'Notes from the standup #work/meetings\nDeploy is blocked.',
  'Jobs/Acme.md': '---\ncompany: Acme\nrole: Frontend Developer\nstatus: "Technical" # Applied, Technical, Offer, Rejected\napplication_date: 2026-10-20\nlocation: Remote\n---\n',
  'Jobs/Globex.md': '---\ncompany: Globex\nrole: Engineer\nstatus: Applied\napplication_date: 2026-10-28\n---\n',
  'Templates/Project.md': '---\ntype: project\nstatus: Planning\n---\n',
  'Templates/Job application.md': '---\ntype: job\ncompany:\nstatus: Applied\n---\n',
};

// A vault, an outside folder the server must never reach, and a client
// connected to a server in this process.
async function setup(t, { enabled = true, allowWrite = false } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mufka-mcp-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'vault'); const outside = path.join(base, 'outside');
  for (const [rel, text] of Object.entries(NOTES)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'secret.md'), 'TOP-SECRET-TEXT');
  fs.symlinkSync(outside, path.join(root, 'Escape'));
  const settings = { mcp: { enabled, allowWrite } };
  const { server, syncWriteTools } = createMufkaServer({ root: () => root, settings: () => settings, version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  let listChanged = 0;
  await server.connect(a);
  await client.connect(b);
  client.setNotificationHandler((await import('@modelcontextprotocol/sdk/types.js')).ToolListChangedNotificationSchema, () => { listChanged += 1; });
  t.after(() => client.close());
  const call = async (name, args = {}) => {
    const res = await client.callTool({ name, arguments: args });
    const text = res.content[0].text;
    return res.isError ? { error: text } : JSON.parse(text);
  };
  return { root, outside, settings, client, call, syncWriteTools, listChanged: () => listChanged };
}

test('read tools are listed with read-only hints; write tools only when writing is allowed', async (t) => {
  const s = await setup(t);
  const { tools } = await s.client.listTools();
  assert.deepEqual(tools.map((x) => x.name).sort(), ['list_job_applications', 'list_notes', 'list_projects', 'read_note', 'search_notes']);
  for (const x of tools) {
    assert.equal(x.annotations.readOnlyHint, true, x.name);
    assert.ok(x.description.length > 40, x.name);
  }
  s.settings.mcp.allowWrite = true;
  s.syncWriteTools();
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(s.listChanged() >= 1, 'no tools/list_changed');
  const after = (await s.client.listTools()).tools;
  for (const name of ['create_note', 'append_to_note']) {
    const x = after.find((y) => y.name === name);
    assert.ok(x, name);
    assert.equal(x.annotations.readOnlyHint, false);
    assert.equal(x.annotations.destructiveHint, false);
    assert.equal(x.annotations.idempotentHint, false);
  }
});

test('with access off every tool says how to turn it on', async (t) => {
  const s = await setup(t, { enabled: false });
  for (const name of ['search_notes', 'read_note', 'list_notes', 'list_job_applications', 'list_projects']) {
    const r = await s.call(name, name === 'search_notes' ? { query: 'deploy' } : name === 'read_note' ? { path: 'Home.md' } : {});
    assert.match(r.error, /turned off.*Settings → AI clients/, name);
  }
});

test('search_notes uses Mufka\'s query syntax and Turkish folding', async (t) => {
  const s = await setup(t);
  const deploy = await s.call('search_notes', { query: 'deploy' });
  assert.deepEqual(deploy.results.map((r) => r.path).sort(), ['Projects/Website.md', 'Work/Standup.md']);
  assert.ok(deploy.results.find((r) => r.path === 'Work/Standup.md').snippet.includes('Deploy is blocked'));
  assert.deepEqual((await s.call('search_notes', { query: 'deploy path:Work' })).results.map((r) => r.path), ['Work/Standup.md']);
  assert.deepEqual((await s.call('search_notes', { query: 'deploy -blocked' })).results.map((r) => r.path), ['Projects/Website.md']);
  assert.deepEqual((await s.call('search_notes', { query: 'task-todo:deploy' })).results.map((r) => r.path), ['Projects/Website.md']);
  // Mufka folds case and the four Turkish i's; ç ş ğ ö ü stay letters of their own.
  assert.deepEqual((await s.call('search_notes', { query: 'ISTANBUL ÇAY' })).results.map((r) => r.path), ['Şehir rehberi.md']);
  assert.deepEqual((await s.call('search_notes', { query: 'istanbul cay' })).results, []);
  assert.equal((await s.call('search_notes', { query: 'şehir' })).results[0].path, 'Şehir rehberi.md'); // the title hit first
  assert.equal((await s.call('search_notes', { query: 'deploy', limit: 1 })).results.length, 1);
  assert.equal((await s.call('search_notes', { query: 'deploy', limit: 1 })).total, 2);
  assert.match((await s.call('search_notes', { query: '   ' })).error, /nothing to search/);
});

test('read_note returns text, properties, tags and backlinks; refuses paths out of the vault', async (t) => {
  const s = await setup(t);
  const n = await s.call('read_note', { path: 'Projects/Website.md' });
  assert.equal(n.title, 'Website');
  assert.deepEqual(n.properties, { type: 'project', status: 'active', start: '2026-10-01', due: '2026-12-01', tags: ['work'] });
  assert.deepEqual(n.backlinks, [{ path: 'Home.md', line: 'See [[Website]] and [[Şehir rehberi]].' }]);
  assert.match(n.content, /Deploy to the server/);
  assert.deepEqual((await s.call('read_note', { path: 'Şehir rehberi.md' })).tags, ['gezi/istanbul']);
  assert.match((await s.call('read_note', { path: 'Nope.md' })).error, /No note/);
  for (const bad of ['../outside/secret.md', '/etc/hosts.md', 'Escape/secret.md', 'Home', '.obsidian/app.json']) {
    const r = await s.call('read_note', { path: bad });
    assert.ok(r.error, bad);
    assert.doesNotMatch(r.error, /TOP-SECRET-TEXT/, bad);
  }
});

test('list_notes by folder, tag (nested too), name or newest first', async (t) => {
  const s = await setup(t);
  fs.utimesSync(path.join(s.root, 'Home.md'), new Date(), new Date(Date.now() + 60000));
  const all = await s.call('list_notes');
  assert.equal(all.total, 9);
  assert.equal(all.notes[0].path, 'Home.md'); // newest first
  assert.ok(!all.notes.some((n) => n.path.startsWith('Escape/')));
  assert.deepEqual((await s.call('list_notes', { folder: 'Projects', sort: 'name' })).notes.map((n) => n.path), ['Projects/Old site.md', 'Projects/Website.md']);
  // Frontmatter tags count, as in Obsidian; #work/meetings is under #work.
  assert.deepEqual((await s.call('list_notes', { tag: '#work', sort: 'name' })).notes.map((n) => n.path), ['Projects/Website.md', 'Work/Standup.md']);
  assert.deepEqual((await s.call('list_notes', { tag: 'work/meetings' })).notes.map((n) => n.path), ['Work/Standup.md']);
  assert.deepEqual((await s.call('list_notes', { tag: 'gezi' })).notes.map((n) => n.path), ['Şehir rehberi.md']);
  assert.equal((await s.call('list_notes', { limit: 2 })).notes.length, 2);
  assert.ok((await s.call('list_notes', { folder: '../outside' })).error);
});

test('job applications and projects come from the notes, not from the templates', async (t) => {
  const s = await setup(t);
  const jobs = await s.call('list_job_applications');
  assert.deepEqual(jobs.map((j) => [j.company, j.status, j.applied]), [['Globex', 'Applied', '2026-10-28'], ['Acme', 'Technical', '2026-10-20']]);
  assert.deepEqual((await s.call('list_job_applications', { status: 'technical' })).map((j) => j.path), ['Jobs/Acme.md']);
  const ps = await s.call('list_projects');
  assert.deepEqual(ps.map((p) => [p.path, p.status, p.done, p.total, p.progress]), [['Projects/Website.md', 'Active', 1, 2, 0.5], ['Projects/Old site.md', 'Done', 1, 1, 1]]);
  assert.equal(typeof ps[0].daysLeft, 'number');
  assert.deepEqual((await s.call('list_projects', { status: 'done' })).map((p) => p.path), ['Projects/Old site.md']);
});

test('read-only by default: write tools refuse and nothing is written', async (t) => {
  const s = await setup(t);
  const r = await s.client.callTool({ name: 'create_note', arguments: { path: 'New', content: 'x' } });
  assert.equal(r.isError, true);
  assert.ok(!fs.existsSync(path.join(s.root, 'New.md')));
});

test('create_note and append_to_note when writing is allowed, inside the vault only', async (t) => {
  const s = await setup(t, { allowWrite: true });
  assert.deepEqual(await s.call('create_note', { path: 'Ideas/Garden', content: '# Garden\n' }), { path: 'Ideas/Garden.md' });
  assert.match((await s.call('create_note', { path: 'Home.md', content: 'x' })).error, /already exists/);
  assert.equal(fs.readFileSync(path.join(s.root, 'Home.md'), 'utf8'), NOTES['Home.md']);
  await s.call('append_to_note', { path: 'Ideas/Garden.md', text: '- tomatoes' });
  assert.equal(fs.readFileSync(path.join(s.root, 'Ideas', 'Garden.md'), 'utf8'), '# Garden\n- tomatoes\n');
  assert.equal((await s.call('search_notes', { query: 'tomatoes' })).results[0].path, 'Ideas/Garden.md'); // seen at once
  for (const bad of ['../outside/x', 'Escape/x', '/tmp/x']) assert.ok((await s.call('create_note', { path: bad, content: 'x' })).error, bad);
  assert.ok((await s.call('append_to_note', { path: 'Escape/secret.md', text: 'x' })).error);
  assert.deepEqual(fs.readdirSync(s.outside), ['secret.md']);
  assert.equal(fs.readFileSync(path.join(s.outside, 'secret.md'), 'utf8'), 'TOP-SECRET-TEXT');
  s.settings.mcp.allowWrite = false; // switched off while connected
  assert.match((await s.call('append_to_note', { path: 'Home.md', text: 'x' })).error, /not allowed/);
});

test('locate: userData per platform, and the vault the app would open', () => {
  // path.join of the machine running the test, as the code uses it.
  assert.equal(defaultUserData({ platform: 'darwin', home: '/Users/a' }), path.join('/Users/a', 'Library', 'Application Support', 'Mufka'));
  assert.equal(defaultUserData({ platform: 'win32', env: { APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, home: 'C:\\Users\\a' }), path.join('C:\\Users\\a\\AppData\\Roaming', 'Mufka'));
  assert.equal(defaultUserData({ platform: 'linux', env: {}, home: '/home/a' }), path.join('/home/a', '.config', 'Mufka'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mufka-locate-'));
  try {
    const chosen = path.join(dir, 'Chosen'); const last = path.join(dir, 'Last');
    fs.mkdirSync(chosen); fs.mkdirSync(last);
    assert.equal(locateVault({ userData: dir, settings: { vaultPath: chosen, vaultRoot: last }, env: {}, home: dir }), chosen);
    assert.equal(locateVault({ userData: dir, settings: { vaultRoot: last }, env: {}, home: dir }), last);
    assert.equal(locateVault({ userData: dir, settings: {}, env: {}, home: dir }), path.join(dir, 'Documents', 'Mufka'));
    assert.equal(locateVault({ userData: dir, settings: { vaultPath: chosen }, env: { MUFKA_VAULT: last }, home: dir }), last);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// --- MCP Apps: the view, and ticking tasks from it ---------------------------

async function withView(t, mcp) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mufka-mcp-apps-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'vault');
  fs.mkdirSync(path.join(root, 'Projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Projects', 'Website.md'), NOTES['Projects/Website.md']);
  fs.writeFileSync(path.join(base, 'outside.md'), '- [ ] outside');
  fs.symlinkSync(path.join(base, 'outside.md'), path.join(root, 'Leak.md'));
  const settings = { mcp: { enabled: true, ...mcp } };
  const { server, syncWriteTools } = createMufkaServer({ root: () => root, settings: () => settings, view: () => '<!doctype html><title>view</title>' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await server.connect(a); await client.connect(b);
  t.after(() => client.close());
  return { root, base, settings, client, syncWriteTools };
}

test('read_note, list_projects and list_job_applications point to the view and give it structured data', async (t) => {
  const s = await withView(t, {});
  const { tools } = await s.client.listTools();
  for (const name of ['read_note', 'list_projects', 'list_job_applications']) {
    assert.equal(tools.find((x) => x.name === name)._meta.ui.resourceUri, 'ui://mufka/view.html', name);
  }
  const r = await s.client.callTool({ name: 'list_projects', arguments: {} });
  assert.equal(r.structuredContent.view, 'projects');
  assert.equal(r.structuredContent.projects[0].path, 'Projects/Website.md');
  const n = await s.client.callTool({ name: 'read_note', arguments: { path: 'Projects/Website.md' } });
  assert.equal(n.structuredContent.view, 'note');
  assert.equal(n.structuredContent.canTick, false);
  assert.match(n.structuredContent.note.content, /Deploy to the server/);
  const res = await s.client.readResource({ uri: 'ui://mufka/view.html' });
  assert.equal(res.contents[0].mimeType, 'text/html;profile=mcp-app');
  assert.match(res.contents[0].text, /<title>view<\/title>/);
});

test('toggle_task: not listed or allowed until ticking is allowed; then only the line the view saw', async (t) => {
  const s = await withView(t, {});
  assert.ok(!(await s.client.listTools()).tools.some((x) => x.name === 'toggle_task'));
  const args = { path: 'Projects/Website.md', line: 9, expect: '- [ ] Deploy to the server', done: true };
  assert.equal((await s.client.callTool({ name: 'toggle_task', arguments: args })).isError, true);
  s.settings.mcp.allowTicks = true; s.syncWriteTools();
  const tool = (await s.client.listTools()).tools.find((x) => x.name === 'toggle_task');
  assert.deepEqual(tool._meta.ui.visibility, ['app']);
  assert.equal(tool.annotations.destructiveHint, false);
  const r = await s.client.callTool({ name: 'toggle_task', arguments: args });
  assert.ok(!r.isError, r.content[0].text);
  assert.equal(r.structuredContent.view, 'note');
  assert.match(fs.readFileSync(path.join(s.root, 'Projects', 'Website.md'), 'utf8'), /^- \[x\] Deploy to the server$/m);
  // The view still shows the old line: refused, nothing written.
  const stale = await s.client.callTool({ name: 'toggle_task', arguments: args });
  assert.match(stale.content[0].text, /changed since it was shown/);
  assert.equal((await s.client.callTool({ name: 'toggle_task', arguments: { ...args, line: 0, expect: '---' } })).content[0].text, 'That line is not a task');
  assert.ok((await s.client.callTool({ name: 'toggle_task', arguments: { path: 'Leak.md', line: 0, expect: '- [ ] outside', done: true } })).isError);
  assert.equal(fs.readFileSync(path.join(s.base, 'outside.md'), 'utf8'), '- [ ] outside');
  s.settings.mcp.allowTicks = false; // switched off while connected
  assert.match((await s.client.callTool({ name: 'toggle_task', arguments: { ...args, expect: '- [x] Deploy to the server', done: false } })).content[0].text, /not allowed/);
});
