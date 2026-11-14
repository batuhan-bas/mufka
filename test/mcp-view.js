// The MCP Apps view in a stand-in host: a page that loads out/mcp-ui/view.html
// in a frame and talks to it with the SDK's AppBridge, as Claude Desktop does,
// with Mufka's MCP server running here on a copy of the sample vault. Clicks
// in the view and checks what it shows and what lands in the notes.
// `npm run test:view` (electron test/mcp-view.js), after `npm run build`.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path'); const fs = require('node:fs'); const os = require('node:os');

const repo = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mufka-view-'));
app.setPath('userData', path.join(tmp, 'userData'));
const vault = path.join(tmp, 'vault');
fs.cpSync(path.join(repo, 'test', 'fixtures', 'mcp-vault'), vault, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; let failed = null;
function assert(cond, msg) { if (!cond) throw new Error(msg); }

app.whenReady().then(async () => {
  setTimeout(() => { console.log('[VIEW] FAIL: timed out'); app.exit(1); }, 120000).unref();
  process.on('unhandledRejection', (e) => { console.log('[VIEW] FAIL:', e && e.stack); app.exit(1); });
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const { createMufkaServer } = await import('../mcp/tools.mjs');
  const { build } = await import('vite');
  const settings = { mcp: { enabled: true, allowTicks: true } };
  const view = fs.readFileSync(path.join(repo, 'out', 'mcp-ui', 'view.html'), 'utf8');
  const { server } = createMufkaServer({ root: () => vault, settings: () => settings, view: () => view });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'view-test', version: '1.0.0' });
  await server.connect(a); await client.connect(b);
  ipcMain.handle('call', (_e, name, args) => client.callTool({ name, arguments: args }));

  // The host: the view in a frame, joined to it by an AppBridge.
  const hostDir = path.join(tmp, 'host');
  fs.mkdirSync(hostDir);
  const hostBuild = await build({ configFile: false, logLevel: 'error', root: repo, build: { write: false, lib: { entry: path.join(__dirname, 'mcp-view-host.mjs'), formats: ['iife'], name: 'Host', fileName: () => 'host.js' } } });
  fs.writeFileSync(path.join(hostDir, 'host.js'), [hostBuild].flat()[0].output.find((o) => o.type === 'chunk').code);
  fs.writeFileSync(path.join(hostDir, 'host.html'), '<!doctype html><meta charset="utf-8"><body style="margin:0"></body><script src="host.js"></script>');
  fs.writeFileSync(path.join(hostDir, 'preload.js'), `const { contextBridge, ipcRenderer } = require('electron');
    contextBridge.exposeInMainWorld('host', { call: (n, a) => ipcRenderer.invoke('call', n, a), view: () => ipcRenderer.invoke('view') });`);
  ipcMain.handle('view', () => view);

  const win = new BrowserWindow({ show: false, width: 920, height: 920, webPreferences: { preload: path.join(hostDir, 'preload.js'), contextIsolation: true, sandbox: false } });
  let consoleError = null;
  win.webContents.on('console-message', ({ level, message }) => { if (process.env.VIEW_DEBUG) console.log('[page]', level, message); if (level === 'error') consoleError = message; });
  await win.loadFile(path.join(hostDir, 'host.html'));
  const frameJs = async (code) => win.webContents.mainFrame.frames[0].executeJavaScript(code);
  const waitIn = async (expr, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await frameJs(expr)) return true; } catch { /* frame not ready */ } await sleep(80); } return false; };
  const open = async (tool, args, theme = 'dark') => { await win.webContents.executeJavaScript(`window.hostTheme = ${JSON.stringify(theme)}; window.openView(${JSON.stringify(tool)}, ${JSON.stringify(args)})`); };
  const step = async (name, fn) => {
    if (failed) return;
    try { await fn(); results.push(`  ok ${name}`); } catch (err) { failed = `${name}: ${err.message}`; }
    // VIEW_SHOTS=<dir>: a picture of the view after each step.
    if (process.env.VIEW_SHOTS) await sleep(400), fs.writeFileSync(path.join(process.env.VIEW_SHOTS, `${results.length}.png`), (await win.webContents.capturePage()).toPNG());
  };

  await step('projects board, card opens the note', async () => {
    await open('list_projects', {});
    assert(await waitIn('document.querySelectorAll(".job-card").length === 2'), `cards: ${await frameJs('document.body.innerText.slice(0, 200)')}`);
    assert(await frameJs('!document.querySelector(".job-new") && document.querySelector(".job-card").draggable === false'), 'board offers adding or dragging');
    assert(await frameJs('document.documentElement.dataset.theme') === 'dark', 'theme not dark');
    await frameJs('[...document.querySelectorAll(".job-card")].find((c) => c.textContent.includes("Website redesign")).click()');
    assert(await waitIn('document.querySelector(".mv-title-main")?.textContent === "Website redesign" && !!document.querySelector(".mv-back")'), 'note did not open');
  });

  await step('ticking a task writes the note; a stale line is refused', async () => {
    const file = path.join(vault, 'Projects', 'Website redesign.md');
    await frameJs('[...document.querySelectorAll("li.task")].find((li) => li.textContent.includes("Deploy to production")).querySelector("input").click()');
    for (let i = 0; i < 40 && !/- \[x\] Deploy to production/.test(fs.readFileSync(file, 'utf8')); i++) await sleep(100);
    assert(/- \[x\] Deploy to production/.test(fs.readFileSync(file, 'utf8')), 'tick not written');
    assert(await waitIn('[...document.querySelectorAll("li.task")].find((li) => li.textContent.includes("Deploy to production"))?.querySelector("input").checked === true'), 'view not redrawn ticked');
    // The note changes behind the view's back, then the view ticks the old line.
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('- [x] Wireframes', '- [x] Wireframes (v2)'));
    await frameJs('[...document.querySelectorAll("li.task")].find((li) => li.textContent.includes("Wireframes")).querySelector("input").click()');
    assert(await waitIn('document.querySelector(".mv-message")?.textContent.includes("changed since it was shown")'), 'stale tick not refused');
    assert(/- \[x\] Wireframes \(v2\)/.test(fs.readFileSync(file, 'utf8')), 'stale tick wrote the note');
    await frameJs('document.querySelector(".mv-back").click()');
    assert(await waitIn('document.querySelectorAll(".job-card").length === 2'), 'Back did not return to the board');
    assert(await waitIn('[...document.querySelectorAll(".job-card")].find((c) => c.textContent.includes("Website redesign"))?.textContent.includes("3/3")'), `board not refreshed after the tick: ${await frameJs('[...document.querySelectorAll(".job-card")].map((c) => c.textContent).join(" | ")')}`);
  });

  await step('job applications by stage; light theme from the host', async () => {
    await open('list_job_applications', {}, 'light');
    assert(await waitIn('document.querySelectorAll(".job-col").length === 6'), 'job columns');
    assert(await frameJs('[...document.querySelectorAll(".job-col")].find((c) => c.dataset.stage === "Technical").textContent.includes("Acme")'), 'Acme not in Technical');
    assert(await frameJs('document.documentElement.dataset.theme') === 'light', 'theme not light');
    assert(await frameJs('getComputedStyle(document.body).backgroundColor') === 'rgb(255, 255, 255)', `light background: ${await frameJs('getComputedStyle(document.body).backgroundColor')}`);
  });

  await step('a note with ticking off shows its tasks but does not tick them', async () => {
    settings.mcp.allowTicks = false;
    await open('read_note', { path: 'Günlük/2026-11-10.md' });
    assert(await waitIn('document.querySelectorAll("input.task-check").length === 2'), 'tasks not shown');
    assert(await frameJs('[...document.querySelectorAll("input.task-check")].every((c) => c.disabled)'), 'tasks tickable while not allowed');
    assert(await frameJs('document.querySelector(".mv-md").textContent.includes("çiğ köfte")'), 'Turkish text missing');
  });

  if (!failed && consoleError) failed = `console error: ${consoleError}`;
  for (const r of results) console.log(r);
  console.log(failed ? `[VIEW] FAIL: ${failed}` : `[VIEW] OK (${results.length} steps)`);
  // Windows keeps the live userData folder locked until the app quits.
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* still in use */ }
  app.exit(failed ? 1 : 0);
});
