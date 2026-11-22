// Real end-to-end test. Boots the REAL built app (out/: main, preload, renderer)
// with a fresh temp userData, and drives the UI ONLY through real
// input events (webContents.sendInputEvent) — never by calling app functions.
// Fails on any renderer console error / uncaught exception, and on the first
// failed step (prints which step). Run: npm test, or npm run build then
// npm run e2e (electron test/e2e.js).

const { app, BrowserWindow, Menu, Notification, dialog, shell, clipboard, ClipboardItem, ipcMain } = require('electron');
const path = require('path'); const fs = require('fs'); const os = require('os'); const zlib = require('zlib');

// Build a tiny valid PNG (RGBA) with only node:zlib, so the clipboard-paste test
// has a real image (nativeImage rejects a malformed/truncated data URL).
function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return (~c) >>> 0; }
function pngChunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const t = Buffer.from(type, 'ascii'); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, crc]); }
function makePng(w, h) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const row = Buffer.alloc(1 + w * 4, 0);
  for (let x = 0; x < w; x++) { row[1 + x * 4] = 244; row[2 + x * 4] = 196; row[3 + x * 4] = 48; row[4 + x * 4] = 255; }
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mufka-e2e-'));
app.setPath('userData', tmp);
// Never hang a CI job: a run that is still going after 12 minutes has failed.
setTimeout(() => { console.log('[E2E] FAIL: timed out after 12 minutes'); app.exit(1); }, 12 * 60 * 1000).unref();
// Documents too: the default notes folder is Documents/Mufka, and a test must
// never touch the real one.
app.setPath('documents', path.join(tmp, 'Documents'));
// A repeating plan, as older data has them (no UI creates them now).
fs.writeFileSync(path.join(tmp, 'planlar.json'), JSON.stringify({ version: 3, items: [
  { id: 'rep1', scope: 'day', key: '2026-01-05', title: 'Vitamin', time: '', endTime: '', done: false, created: 1, recur: { type: 'daily' }, doneDates: {}, exceptions: {} },
] }));
// MUFKA_E2E_THEME=light|dark runs the whole test in that theme (CI machines
// are light; a dark Mac would otherwise never run it light).
if (process.env.MUFKA_E2E_THEME) fs.writeFileSync(path.join(tmp, 'settings.json'), JSON.stringify({ theme: process.env.MUFKA_E2E_THEME }));
process.chdir(path.join(__dirname, '..'));

// Stub ONLY the native save dialog: return a temp path using the suggested name.
const exportDir = path.join(tmp, 'exports');
fs.mkdirSync(exportDir, { recursive: true });
let lastSavePath = null;
dialog.showSaveDialog = async (opts) => {
  lastSavePath = path.join(exportDir, path.basename(opts.defaultPath || 'out'));
  return { canceled: false, filePath: lastSavePath };
};
// Stub the open dialog (used by "Attach file…") with a preset selection.
let nextOpenFiles = null;
dialog.showOpenDialog = async () => {
  if (nextOpenFiles) { const f = nextOpenFiles; nextOpenFiles = null; return { canceled: false, filePaths: f }; }
  return { canceled: true, filePaths: [] };
};

// Record what Mufka asks the OS to open or reveal (never actually opens it).
const shellCalls = [];
shell.openPath = async (p) => { shellCalls.push(['open', p]); return ''; };
shell.showItemInFolder = (p) => { shellCalls.push(['reveal', p]); };

// Stub message boxes (e.g. "this folder cannot be the vault") and record them.
let lastMessage = null;
dialog.showMessageBox = async (...args) => { lastMessage = (args.length > 1 ? args[1] : args[0]).message; return { response: 0 }; };

// A window macOS counts as covered (another Space, a full-screen app, the
// machine in use) gets no animation frames, so guides and the graph would
// never draw; keep it rendering like a visible one.
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
require('../out/main/index.js'); // the build: npm test runs `npm run build` first

const notesDir = path.join(tmp, 'Documents', 'Mufka');
// A fresh vault: Mufka's default folders (lib/layout.mjs)
const dailyDir = path.join(notesDir, 'Daily');
const now = new Date();
const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFile(p, ms = 6000) { const t = Date.now(); while (Date.now() - t < ms) { if (fs.existsSync(p) && fs.statSync(p).size > 0) return true; await sleep(100); } return false; }
let consoleErr = null;
let wc = null;

function assert(cond, msg) { if (!cond) throw new Error(msg); }
async function js(code) { return wc.executeJavaScript(code); }
async function rectEval(expr) {
  return js(`(()=>{const e=(${expr}); if(!e) return null; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)};})()`);
}
async function clickAt(x, y) {
  wc.sendInputEvent({ type: 'mouseMove', x, y });
  wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
  wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  await sleep(130);
}
// A person holds the button for a moment: a page that rebuilds itself between
// press and release (an editor saving on blur) would lose the click.
async function humanClickEval(expr, label) {
  const r = await rectEval(expr); assert(r, `element not found: ${label || expr}`);
  wc.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y }); await sleep(80);
  wc.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 }); await sleep(150);
  wc.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 }); await sleep(200);
}
// Click until `until` holds: a page that draws itself again between press and
// release (a save or a vault sync landing just then) loses that click.
async function clickUntil(expr, until, label, tries = 4) {
  for (let i = 0; i < tries; i++) {
    await clickEval(expr, label);
    if (await waitFor(until, 1200)) return true;
  }
  return false;
}
async function clickEval(expr, label) { const r = await rectEval(expr); assert(r, `element not found: ${label || expr}`); await clickAt(r.x, r.y); }
async function clickSel(sel) { await clickEval(`document.querySelector(${JSON.stringify(sel)})`, sel); }
async function hoverClickEval(expr, label) { const r = await rectEval(expr); assert(r, `element not found: ${label || expr}`); wc.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y }); await sleep(70); await clickAt(r.x, r.y); }

async function typeText(t) { for (const ch of t) { wc.sendInputEvent({ type: 'char', keyCode: ch }); await sleep(10); } await sleep(50); }
// Shortcuts are written the Mac way ('meta' = ⌘); on Windows the same keys use Ctrl.
const MOD = process.platform === 'darwin' ? 'meta' : 'control';
async function press(keyCode, modifiers = []) {
  modifiers = modifiers.map((m) => (m === 'meta' ? MOD : m));
  wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); await sleep(140);
}
const enter = () => press('Return');
const cmdZ = () => press('Z', ['meta']);
async function retype(sel, text) {
  await clickSel(sel);
  const len = await js(`(document.querySelector(${JSON.stringify(sel)})?.value || '').length`);
  for (let i = 0; i < len + 2; i++) { wc.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' }); await sleep(8); }
  await sleep(40); await typeText(text);
}
async function setTime(sel, digits) {
  const want = `${digits.slice(0, 2)}:${digits.slice(2)}`;
  for (let attempt = 0; attempt < 8; attempt++) {
    // Click the left edge so the hour segment is focused, then type the digits.
    const r = await js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({block:'center'}); const b = e.getBoundingClientRect(); return { x: Math.round(b.left + 9), y: Math.round(b.top + b.height / 2) }; })()`);
    assert(r, `time input not found: ${sel}`);
    await clickAt(r.x, r.y); await sleep(80);
    // A field with AM/PM (the system's region decides) takes 10:00 as 1000A,
    // 14:30 as 0230P; odd attempts try that form.
    const h = Number(digits.slice(0, 2));
    const keys = attempt % 2 === 0 ? digits : `${String(h % 12 || 12).padStart(2, '0')}${digits.slice(2)}${h < 12 ? 'A' : 'P'}`;
    for (const ch of keys) { wc.sendInputEvent({ type: 'keyDown', keyCode: ch }); wc.sendInputEvent({ type: 'char', keyCode: ch }); wc.sendInputEvent({ type: 'keyUp', keyCode: ch }); await sleep(90); }
    await sleep(140);
    if ((await js(`document.querySelector(${JSON.stringify(sel)})?.value`)) === want) return;
  }
  throw new Error(`could not set time ${sel} to ${want}`);
}
const byTitle = (name, child) => `[...document.querySelectorAll('.plan-row')].find(r=>r.querySelector('.plan-title')?.textContent===${JSON.stringify(name)})${child ? `?.querySelector('${child}')` : ''}`;
async function openRowMenu(name) { await hoverClickEval(byTitle(name, '.menu-btn'), `menu of ${name}`); }
// Click a "⋯"-style anchor and wait for its menu; retry the click if the menu
// did not open (click can race a re-render under load).
async function openMenuByAnchor(sel) {
  for (let i = 0; i < 4; i++) {
    await clickEval(sel, `menu anchor ${sel}`);
    if (await waitFor(`document.querySelector('.row-menu .menu-item')`, 800)) return;
    await sleep(120);
  }
  throw new Error(`menu did not open: ${sel}`);
}
async function clickMenuItem(label) {
  await waitFor(`[...document.querySelectorAll('.row-menu .menu-item')].some(b=>b.textContent===${JSON.stringify(label)})`, 2500);
  await clickEval(`[...document.querySelectorAll('.row-menu .menu-item')].find(b=>b.textContent===${JSON.stringify(label)})`, `menu item ${label}`);
}
async function hasTitle(name) { return js(`[...document.querySelectorAll('.plan-title')].some(t=>t.textContent===${JSON.stringify(name)})`); }
// Tree helpers.
const treeRow = (name) => `[...document.querySelectorAll('.tree-row')].find(r=>r.querySelector('.tree-name')?.textContent===${JSON.stringify(name)})`;
async function clickTreeRow(name) {
  // Commit any active block editor first, so its blur-triggered re-render does
  // not shift the tree mid-click (which would land the click on another row).
  if (await js('!!document.getElementById("block-editor")')) { await press('Escape'); await sleep(150); }
  await clickEval(treeRow(name), `tree row ${name}`);
}
async function treeRowMenu(name) { await hoverClickEval(`${treeRow(name)}?.querySelector('.menu-btn')`, `menu of ${name}`); }
async function treeType(text) { await waitFor('document.querySelector("#tree-edit")', 2500); await retype('#tree-edit', text); await enter(); await sleep(250); }
// Feature 4: a note opens in the live-preview block editor. For steps that just
// need to set note text, switch to the raw-source textarea (Cmd+E) and type.
async function toSource() {
  if (!(await js('!!document.querySelector("#note-editor")'))) { await press('E', ['meta']); await sleep(120); }
  assert(await waitFor('document.querySelector("#note-editor")', 2500), 'source editor missing');
  await clickSel('#note-editor');
}
// Block-editor helpers (feature 4).
const blockByText = (t) => `[...document.querySelectorAll('.note-body .block')].find(b=>b.textContent.includes(${JSON.stringify(t)}))`;
async function clickBlock(t) { await clickEval(blockByText(t), `block ${t}`); }
async function blockVal() { return js(`document.getElementById('block-editor')?.value`); }
// Set a note's raw source via the source textarea (deterministic multi-block setup).
async function setNoteSource(text) {
  await toSource();
  await js(`(()=>{const t=document.querySelector('#note-editor'); t.value=${JSON.stringify(text)}; t.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
  await sleep(600); // autosave
  await press('E', ['meta']); await sleep(200); // back to block preview
}
async function typeBody(text) {
  for (const ch of text) {
    if (ch === '\n') { wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); wc.sendInputEvent({ type: 'char', keyCode: '\n' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' }); }
    else wc.sendInputEvent({ type: 'char', keyCode: ch });
    await sleep(10);
  }
  await sleep(80);
}
// Poll a boolean JS expression until true (handles async render/IPC timing).
async function waitFor(expr, ms = 5000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await js(`!!(${expr})`)) return true; await sleep(80); }
  return false;
}
// Poll a Node-side predicate (e.g. an fs check) until true.
async function waitFor2(fn, ms = 4000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (fn()) return true; await sleep(80); }
  return false;
}
async function inSection(title, sectionTitle) {
  return js(`(()=>{const sec=[...document.querySelectorAll('.section')].find(s=>s.querySelector('.section-title')?.textContent===${JSON.stringify(sectionTitle)}); return !!(sec && [...sec.querySelectorAll('.plan-title')].some(t=>t.textContent===${JSON.stringify(title)}));})()`);
}

const results = [];
async function step(n, name, fn) {
  if (consoleErr) throw new Error(`console error before step ${n}: ${consoleErr}`);
  await fn();
  await sleep(60);
  if (consoleErr) throw new Error(`console error during step ${n} (${name}): ${consoleErr}`);
  results.push(`  ok ${n}. ${name}`);
}

app.whenReady().then(() => setTimeout(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  wc = win.webContents;
  wc.on('console-message', ({ level, message, sourceId, lineNumber }) => { if ((level === 'warning' || level === 'error') && !consoleErr) consoleErr = `${message} (${sourceId}:${lineNumber})`; });
  wc.on('render-process-gone', (_e, d) => { if (!consoleErr) consoleErr = `render-process-gone ${JSON.stringify(d)}`; });
  // Disable CSS transitions/animations in the test so UI state is deterministic
  // (e.g. the sidebar width is 0 the instant it collapses, not after a lagging
  // 150ms transition). Re-applied on every load, including reloads.
  const killAnim = () => wc.insertCSS('*,*::before,*::after{transition:none!important;animation:none!important}').catch(() => {});
  wc.on('dom-ready', killAnim);
  killAnim();
  win.show(); win.focus(); wc.focus();
  // Behind other windows (the machine in use while the test runs) Chromium
  // slows timers and animation frames, so the graph would not settle in time.
  wc.setBackgroundThrottling(false);
  await sleep(1800);

  let failedStep = null;
  try {
    // 1. Typed time text with "Timed" unchecked stays an untimed plan verbatim.
    // Plans are made in the Planner; the day page only shows them.
    const planFile = () => JSON.parse(fs.readFileSync(path.join(tmp, 'planlar.json'), 'utf8')).items;
    const planNamed = (t) => planFile().find((p) => p.title === t);
    const todayK = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
    const plRow = (t) => `[...document.querySelectorAll('.planner .pl-task, .planner .pl-block')].find(r=>r.querySelector('.pl-task-title, .pl-block-title')?.textContent===${JSON.stringify(t)})`;
    // A repeating plan shows on every day: take today's.
    const plToday = (t) => `[...document.querySelectorAll('.planner .pl-allday[data-drop-day="${todayK}"] .pl-task')].find(r=>r.querySelector('.pl-task-title')?.textContent===${JSON.stringify(t)})`;
    await step(1, 'untimed add in the Planner keeps text verbatim; the day page lists it', async () => {
      assert(await js('!document.querySelector("#todo-add") && !document.querySelector(".add-row")'), 'the day page should not edit plans');
      await clickSel('#mode-planner');
      assert(await waitFor('!!document.querySelector(".planner .pl-grid")', 3000), 'planner did not open');
      for (const t of ['20:00 test plan', 'Armut', 'Kiraz']) {
        await clickEval(`document.querySelector('.pl-allday[data-drop-day="${todayK}"] .pl-add-field')`, 'today add');
        await typeText(t); await enter();
        assert(await waitFor2(() => planNamed(t)?.key === todayK, 3000), `${t} not saved`);
      }
      assert(planNamed('20:00 test plan').time === '', 'time was parsed from the text');
      await press('T', ['meta']);
      assert(await waitFor('document.querySelector(".day-title")?.textContent.startsWith("Today")', 2000), 'today page');
      assert(await inSection('20:00 test plan', 'To-dos'), 'verbatim plan not listed as a to-do');
      assert(await inSection('Vitamin', 'To-dos'), 'repeating plan not listed');
    });

    // 2. In the plan dialog, "Timed" with no start time does not save.
    await step(2, 'Timed without time shows error', async () => {
      await clickSel('#mode-planner');
      await hoverClickEval(`${plRow('Armut')}.querySelector('.pl-menu')`, 'Armut menu');
      await clickMenuItem('Edit…');
      assert(await waitFor('!!document.querySelector(".plan-dialog")', 2000), 'dialog missing');
      await clickSel('.plan-dialog .saatli-check');
      await clickSel('.plan-dialog .plan-form-title'); await enter();
      assert((await js('document.querySelector(".plan-dialog .form-msg")?.textContent')) === 'Choose a time', 'missing "Choose a time"');
      await press('Escape');
      assert(await waitFor('!document.querySelector(".plan-dialog")', 2000), 'Esc did not close the dialog');
      assert(planNamed('Armut').time === '', 'saved despite the missing time');
    });

    // 3. Double-click an empty hour: the dialog opens at that time; Enter adds it.
    await step(3, 'timed add by double-clicking an hour', async () => {
      await js(`document.querySelector('.pl-scroll').scrollTop = 17 * 48`); await sleep(150);
      const at = await js(`(()=>{const c=document.querySelector('.pl-col[data-drop-day="${todayK}"]');const b=c.getBoundingClientRect();return {x:Math.round(b.x+b.width/2),y:Math.round(b.top+20*48+20)};})()`);
      BrowserWindow.getAllWindows()[0].focus(); await sleep(100);
      // two small moves: a hover needs a move into the slot, not just a position.
      // Tried again if the real pointer (someone using the Mac) moved it away.
      let hinted = false;
      for (let i = 0; i < 3 && !hinted; i++) {
        wc.sendInputEvent({ type: 'mouseMove', x: at.x, y: at.y - 3 }); await sleep(60);
        wc.sendInputEvent({ type: 'mouseMove', x: at.x, y: at.y });
        hinted = await waitFor('!!document.querySelector(".pl-col .pl-hint:not([hidden])")', 1000);
      }
      assert(hinted, 'no hover hint');
      wc.sendInputEvent({ type: 'mouseDown', x: at.x, y: at.y, button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseUp', x: at.x, y: at.y, button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseDown', x: at.x, y: at.y, button: 'left', clickCount: 2 });
      wc.sendInputEvent({ type: 'mouseUp', x: at.x, y: at.y, button: 'left', clickCount: 2 });
      assert(await waitFor('document.querySelector(".plan-dialog .time-start")?.value === "20:00"', 2000), 'dialog not at 20:00');
      await typeText('Spor'); await enter();
      assert(await waitFor2(() => planNamed('Spor')?.time === '20:00' && planNamed('Spor')?.endTime === '21:00', 3000), 'timed plan not saved');
      assert(await waitFor(`!!${plRow('Spor')}?.classList.contains('pl-block')`, 2000), 'no block on the grid');
    });

    // 4. Tick one; edit (untick Timed → a to-do); delete one; ⌘Z restores it.
    await step(4, 'planner menu edit + delete + undo', async () => {
      await clickEval(`${plRow('Armut')}.querySelector('.pl-check')`, 'Armut check');
      assert(await waitFor2(() => planNamed('Armut').done === true, 2000), 'Armut not done');
      await hoverClickEval(`${plRow('Spor')}.querySelector('.pl-menu')`, 'Spor menu');
      await clickMenuItem('Edit…');
      await clickSel('.plan-dialog .saatli-check');
      await retype('.plan-dialog .plan-form-title', 'Spor yeni'); await enter();
      assert(await waitFor2(() => planNamed('Spor yeni')?.time === '', 3000), 'edit did not save untimed');
      assert(await waitFor(`!!${plRow('Spor yeni')}?.classList.contains('pl-task')`, 2000), 'not moved to the to-do band');
      await hoverClickEval(`${plRow('Kiraz')}.querySelector('.pl-menu')`, 'Kiraz menu');
      await clickMenuItem('Delete');
      assert(await waitFor2(() => !planNamed('Kiraz'), 2000), 'Kiraz not deleted');
      await clickSel('.pl-title'); await cmdZ();
      assert(await waitFor2(() => Boolean(planNamed('Kiraz')), 2000), 'Cmd+Z did not restore Kiraz');
      // a repeating plan: change only today, then the whole series
      await hoverClickEval(`${plToday('Vitamin')}.querySelector('.pl-menu')`, 'Vitamin menu');
      await clickMenuItem('Edit…');
      assert(await waitFor('(document.querySelector(".plan-dialog-repeat")?.textContent || "").includes("Every day")', 2000), 'repeat rule not shown');
      await clickSel('#dlg-scope-one');
      await retype('.plan-dialog .plan-form-title', 'Vitamin D'); await enter();
      assert(await waitFor2(() => planNamed('Vitamin D')?.key === todayK && planNamed('Vitamin D').recur === null && planNamed('Vitamin').exceptions[todayK] === true, 3000), '"only this day" did not split the plan');
      await cmdZ();
      assert(await waitFor2(() => !planNamed('Vitamin D') && !planNamed('Vitamin').exceptions[todayK], 3000), 'undo of "only this day" failed');
      await hoverClickEval(`${plToday('Vitamin')}.querySelector('.pl-menu')`, 'Vitamin menu');
      await clickMenuItem('Edit…');
      await retype('.plan-dialog .plan-form-title', 'Vitamins'); await enter();
      assert(await waitFor2(() => planNamed('Vitamins')?.recur?.type === 'daily', 3000), 'series not renamed');
      assert(await waitFor('document.querySelectorAll(".planner .pl-task.recurring").length === 7', 2000), 'repeating look missing');
      await press('T', ['meta']);
      await clickEval(`[...document.querySelectorAll('.agenda-open')].find(b=>b.querySelector('.plan-title')?.textContent==='Armut')`, 'agenda row');
      assert(await waitFor(`!!document.querySelector('.planner') && document.activeElement?.dataset?.id === ${JSON.stringify(planNamed('Armut').id)}`, 3000), 'agenda click did not open the plan in the Planner');
      await press('T', ['meta']);
    });

    // 5. Date navigation.
    await step(5, 'date navigation', async () => {
      const t0 = await js('document.querySelector(".day-title").textContent');
      await clickSel('.day-nav button[aria-label="Next day"]');
      assert((await js('document.querySelector(".day-title").textContent')) !== t0, 'next day failed');
      await clickSel('.day-nav button[aria-label="Previous day"]');
      assert((await js('document.querySelector(".day-title").textContent')) === t0, 'prev day failed');
      await clickSel('.day-nav button[aria-label="Next day"]');
      assert(!(await js('document.querySelector(".day-title").textContent')).startsWith('Today'), 'next day click failed');
      await clickEval(`[...document.querySelectorAll('.navgroup button')].find(b=>b.textContent==='Today')`, 'Today');
      assert((await js('document.querySelector(".day-title").textContent')).startsWith('Today'), 'Today did not return');
    });

    // 6. Daily note: add, render, copy+⋯ on the label line, ⋯ > Delete > confirm.
    await step(6, 'daily note add + ⋯ menu delete', async () => {
      await clickEval(`[...document.querySelectorAll('.daily-note button')].find(b=>b.textContent==='Add note')`, 'Add note');
      assert(await waitFor('document.querySelector(".daily-note #block-editor")', 2500), 'daily block editor missing');
      await clickSel('.daily-note #block-editor'); await typeText('# Gunluk'); await sleep(150);
      await press('Escape'); await sleep(250); // Esc commits the block
      assert(await waitFor(`document.querySelector('.daily-note .block.md h1')?.textContent==='Gunluk'`), 'daily not rendered');
      assert(await js(`!!document.querySelector('.daily-note .head-actions .copy-btn') && !!document.querySelector('.daily-note .head-actions [data-menu-anchor="menu-daily"]')`), 'copy/⋯ missing on daily line');
      assert(fs.existsSync(path.join(dailyDir, `${todayKey}.md`)), 'daily file missing');
      await openMenuByAnchor(`document.querySelector('.daily-note .head-actions [data-menu-anchor="menu-daily"]')`);
      await clickMenuItem('Delete');
      await clickEval(`[...document.querySelectorAll('.row-menu .menu-item')].find(b=>b.textContent==='Delete')`, 'confirm Delete');
      assert(await waitFor2(() => !fs.existsSync(path.join(dailyDir, `${todayKey}.md`)), 4000), 'daily file not trashed');
      assert(await waitFor(`[...document.querySelectorAll('.daily-note button')].some(b=>b.textContent==='Add note')`), 'Add note did not return');
    });

    // 7. New folder -> New note inside it -> type text; file exists on disk.
    await step(7, 'create folder + note inside', async () => {
      await press('2', ['meta']);
      await clickEval(`document.querySelector('.side-notes .side-btn[aria-label="New folder"]')`, 'New folder');
      await treeType('İş');
      assert(fs.existsSync(path.join(notesDir, 'İş')), 'folder not created');
      await treeRowMenu('İş'); await clickMenuItem('New note'); await treeType('Rapor');
      await toSource(); await typeText('# Rapor'); await sleep(550);
      assert(fs.existsSync(path.join(notesDir, 'İş', 'Rapor.md')), 'note not at İş/Rapor.md');
    });

    // 8. Nested folder + a note inside it.
    await step(8, 'nested folder + note', async () => {
      await treeRowMenu('İş'); await clickMenuItem('New folder'); await treeType('Alt');
      assert(fs.existsSync(path.join(notesDir, 'İş', 'Alt')), 'nested folder missing');
      await treeRowMenu('Alt'); await clickMenuItem('New note'); await treeType('İçNot');
      assert(fs.existsSync(path.join(notesDir, 'İş', 'Alt', 'İçNot.md')), 'nested note missing');
    });

    // 9. Rename a folder; open note stays open and its path label updates.
    await step(9, 'rename folder updates path label', async () => {
      await clickTreeRow('Rapor');
      assert(await waitFor(`document.querySelector('#pane-title .pt-path')?.textContent==='İş / '`), 'path label wrong before rename');
      await treeRowMenu('İş'); await clickMenuItem('Rename'); await treeType('Projeler');
      assert(fs.existsSync(path.join(notesDir, 'Projeler', 'Rapor.md')), 'folder not renamed on disk');
      assert(await waitFor(`document.querySelector('#pane-title .pt-path')?.textContent==='Projeler / '`), 'path label did not update');
    });

    // 10. Drag a note into another folder (synthetic DnD).
    await step(10, 'move note by drag', async () => {
      await js(`(() => {
        const row = ${treeRow('Rapor')};
        const dest = ${treeRow('Alt')};
        const dt = new DataTransfer();
        row.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
        // the middle of the folder row: into the folder (its edges arrange)
        const b = dest.getBoundingClientRect(); const at = { clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 };
        dest.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, ...at }));
        dest.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, ...at }));
        return true;
      })()`);
      await sleep(300);
      assert(fs.existsSync(path.join(notesDir, 'Projeler', 'Alt', 'Rapor.md')), 'note not moved on disk');
      assert(!fs.existsSync(path.join(notesDir, 'Projeler', 'Rapor.md')), 'old note path still exists');
    });

    // 11. Collapse/expand a folder; reload keeps the expanded state.
    await step(11, 'expanded state persists across reload', async () => {
      // Ensure Projeler is expanded, then reload and confirm it is still open.
      const tri = () => js(`${treeRow('Projeler')}?.querySelector('.tri')?.textContent`);
      if ((await tri()) !== '▾') await clickTreeRow('Projeler');
      await clickTreeRow('Projeler'); // collapse
      await clickTreeRow('Projeler'); // expand again
      assert((await tri()) === '▾', 'folder not expanded before reload');
      wc.reload(); await sleep(1800);
      await press('2', ['meta']); await sleep(200);
      assert((await tri()) === '▾', 'expanded state not kept after reload');
    });

    // 12. Filter by a word; open a result; clear; tree returns.
    await step(12, 'filter then clear', async () => {
      await clickSel('#ara-input'); await typeText('Rapor'); await sleep(250);
      assert(await js(`[...document.querySelectorAll('.ara-result')].some(r=>r.firstChild?.textContent==='Rapor')`), 'no search result');
      assert(!(await js('!!document.querySelector(".tree")')), 'tree should be hidden while searching');
      await clickEval(`[...document.querySelectorAll('.ara-result')].find(r=>r.firstChild?.textContent==='Rapor')`, 'search result');
      await retype('#ara-input', ''); await sleep(200);
      assert(await js('!!document.querySelector(".tree")'), 'tree did not return after clearing filter');
    });

    // 13. Delete a folder with notes; confirm; directory gone.
    await step(13, 'delete folder with confirm', async () => {
      await treeRowMenu('Projeler'); await clickMenuItem('Delete');
      assert((await js(`document.querySelector('.confirm-row .confirm-q')?.textContent || ''`)).startsWith('Delete the folder and its'), 'no folder confirm');
      await clickEval(`[...document.querySelectorAll('.confirm-row button')].find(b=>b.textContent==='Delete')`, 'confirm folder Delete');
      await sleep(300);
      assert(!fs.existsSync(path.join(notesDir, 'Projeler')), 'folder not removed from vault');
    });

    // 14. The daily notes folder shows today's note and offers no rename/delete.
    await step(14, 'daily folder is special', async () => {
      // Create a daily note from the day page.
      await press('T', ['meta']);
      await clickEval(`[...document.querySelectorAll('.daily-note button')].find(b=>b.textContent==='Add note')`, 'Add note');
      assert(await waitFor('document.querySelector(".daily-note #block-editor")', 2500), 'daily block editor missing');
      await clickSel('.daily-note #block-editor'); await typeText('# Bugun'); await sleep(150);
      await press('Escape'); await sleep(250);
      await press('2', ['meta']); await sleep(150);
      if ((await js(`${treeRow('Daily')}?.querySelector('.tri')?.textContent`)) !== '▾') await clickTreeRow('Daily');
      assert(await js(`[...document.querySelectorAll('.note-row .tree-name')].some(t=>t.textContent===${JSON.stringify(todayKey)})`), 'daily note not shown in Günlük');
      await treeRowMenu('Daily');
      const items = await js(`[...document.querySelectorAll('.row-menu .menu-item')].map(b=>b.textContent)`);
      assert(!items.includes('Delete') && !items.includes('Rename'), `Günlük menu has rename/delete: ${JSON.stringify(items)}`);
      await js('document.querySelector(".menu-backdrop")?.dispatchEvent(new MouseEvent("mousedown",{bubbles:true}))');
    });

    const sideW = () => js(`getComputedStyle(document.getElementById('sidebar')).width`);

    // 15. Toggle the sidebar (button + Cmd+\\); width 0 collapsed; survives reload.
    const sideCollapsed = () => waitFor(`getComputedStyle(document.getElementById('sidebar')).width==='0px'`, 2500);
    const sideOpen = () => waitFor(`getComputedStyle(document.getElementById('sidebar')).width!=='0px'`, 2500);
    await step(15, 'collapsible sidebar + persistence', async () => {
      await clickSel('#sidebar-toggle');
      assert(await sideCollapsed(), 'sidebar not collapsed by button');
      assert((await js(`document.getElementById('sidebar-toggle').getAttribute('aria-label')`)) === 'Show sidebar', 'toggle label not updated');
      await clickSel('#sidebar-toggle');
      assert(await sideOpen(), 'sidebar not reopened');
      await press('\\', ['meta']); // Cmd+\
      assert(await sideCollapsed(), 'Cmd+backslash did not collapse');
      assert((await js(`localStorage.getItem('mufka-sidebar')`)) === '1', 'collapsed state not persisted');
      wc.reload(); await sleep(1800);
      assert((await sideW()) === '0px', 'collapsed state not kept after reload');
    });

    // 16. While collapsed, Cmd+2 reopens the sidebar on Notes.
    await step(16, 'Cmd+2 reopens sidebar on Notes', async () => {
      await press('2', ['meta']);
      assert(await sideOpen(), 'Cmd+2 did not reopen sidebar');
      assert(await waitFor(`!!document.activeElement?.closest('.tree')`, 2000), 'Cmd+2 did not focus the notes tree');
    });

    // 16b. The sidebar's right edge resizes it; the width survives a reload,
    // double-click resets it.
    await step('16b', 'sidebar resizes by dragging its edge', async () => {
      const width = async () => Math.round(await js(`document.getElementById('sidebar').getBoundingClientRect().width`));
      const r = await rectEval(`document.getElementById('sidebar-resizer')`);
      assert(r, 'no resize handle');
      wc.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y }); await sleep(60);
      assert((await js(`getComputedStyle(document.getElementById('sidebar-resizer')).cursor`)) === 'col-resize', 'no resize cursor');
      try { wc.debugger.attach('1.3'); } catch { /* attached */ }
      const mouse = (type, x, buttons) => wc.debugger.sendCommand('Input.dispatchMouseEvent', { type, x, y: r.y, button: 'left', buttons, clickCount: 1 });
      await mouse('mousePressed', r.x, 1);
      for (let i = 1; i <= 5; i++) await mouse('mouseMoved', r.x + i * 20, 1);
      await mouse('mouseReleased', r.x + 100, 0); await sleep(150);
      const wide = await width();
      assert(wide === 400, `drag did not widen the sidebar by 100px: ${wide}`);
      assert(Number(await js(`localStorage.getItem('mufka-sidebar-width')`)) === wide, 'width not saved');
      wc.reload(); await sleep(1800);
      assert(Math.abs((await width()) - wide) <= 1, 'width not kept after reload');
      const r2 = await rectEval(`document.getElementById('sidebar-resizer')`);
      for (const clickCount of [1, 2]) {
        await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', x: r2.x, y: r2.y, button: 'left', buttons: 1, clickCount });
        await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r2.x, y: r2.y, button: 'left', buttons: 0, clickCount });
      }
      await sleep(150);
      assert((await width()) === 300, 'double-click did not reset the width');
      try { wc.debugger.detach(); } catch { /* not attached */ }
    });

    // 17. Copy copies the note's exact Markdown (whatever is on screen).
    let noteBody = '';
    await step(17, 'Copy copies raw Markdown', async () => {
      await clickSel('#ara-input'); await typeText('Export Testi'); await enter();
      await toSource();
      await typeBody('# Baslik  bir satir ve bir [ ] gorev listesi');
      await sleep(200);
      noteBody = await js('document.getElementById("note-editor").value'); // source of truth
      assert(noteBody.length > 10, `editor empty after typing: ${JSON.stringify(noteBody)}`);
      await clipboard.writeText('__none__');
      await clickEval(`document.querySelector('#pane-actions .copy-btn')`, 'copy icon');
      await sleep(200);
      const copied = await clipboard.readText();
      assert(copied === noteBody, `clipboard "${copied}" != note "${noteBody}"`);
      assert((await js(`document.querySelector('#pane-actions .copy-btn')?.getAttribute('aria-label')`)) === 'Copied', 'copy feedback missing');
    });

    // 18. ⋯ > Export… > Markdown writes a file equal to the note's text.
    await step(18, 'export Markdown', async () => {
      await clickEval(`document.querySelector('#pane-actions [data-menu-anchor="menu-note"]')`, 'note ⋯');
      await clickMenuItem('Export…');
      await clickEval(`[...document.querySelectorAll('.row-menu .menu-item')].find(b=>b.textContent==='Markdown')`, 'Markdown item');
      const out = path.join(exportDir, 'Export Testi.md');
      assert(await waitFile(out), 'markdown export missing');
      assert(fs.readFileSync(out, 'utf8') === noteBody, 'exported markdown differs from note');
    });

    // 19. ⋯ > Export… > PDF writes a real PDF > 1 KB.
    await step(19, 'export PDF', async () => {
      await clickEval(`document.querySelector('#pane-actions [data-menu-anchor="menu-note"]')`, 'note ⋯');
      await clickMenuItem('Export…');
      await clickEval(`[...document.querySelectorAll('.row-menu .menu-item')].find(b=>b.textContent==='PDF')`, 'PDF item');
      const out = path.join(exportDir, 'Export Testi.pdf');
      assert(await waitFile(out, 10000), 'pdf export missing');
      const buf = fs.readFileSync(out);
      assert(buf.slice(0, 4).toString() === '%PDF', 'not a PDF');
      assert(buf.length > 1024, `pdf too small: ${buf.length}`);
    });

    // 20. An expanded folder has a guide spanning its children; collapsed none.
    await step(20, 'tree guide lines', async () => {
      await retype('#ara-input', ''); await sleep(200);
      await clickEval(`document.querySelector('.side-notes .side-btn[aria-label="New folder"]')`, 'New folder');
      await treeType('Kutu');
      await treeRowMenu('Kutu'); await clickMenuItem('New note'); await treeType('N1');
      await press('2', ['meta']); await sleep(200); // back to tree
      if ((await js(`${treeRow('Kutu')}?.querySelector('.tri')?.textContent`)) !== '▾') { await clickTreeRow('Kutu'); await sleep(150); }
      // Guides are drawn on the next animation frame, which a busy machine delays.
      const measure = () => js(`(() => {
        const row = ${treeRow('Kutu')};
        const kids = [...document.querySelectorAll('.tree-row')].filter(r => r.dataset.rel && r.dataset.rel.startsWith('Kutu/'));
        const span = kids.length ? (kids[kids.length-1].offsetTop + kids[kids.length-1].offsetHeight) - (row.offsetTop + row.offsetHeight) : 0;
        const want = row.offsetTop + row.offsetHeight;
        const guide = [...document.querySelectorAll('.tree-guide')].find(x => Math.abs(x.offsetTop - want) < 3);
        return { found: !!guide, h: guide ? guide.offsetHeight : 0, span, pe: guide ? getComputedStyle(guide).pointerEvents : null, total: document.querySelectorAll('.tree-guide').length };
      })()`);
      let g = await measure();
      for (let i = 0; i < 30 && !(g.found && g.h >= g.span - 2 && g.span > 0); i++) { await sleep(100); g = await measure(); }
      assert(g.found && g.h >= g.span - 2 && g.span > 0, `guide does not span children: ${JSON.stringify(g)}`);
      assert(g.pe === 'none', 'guide is not click-through');
      const before = g.total;
      await clickTreeRow('Kutu'); await sleep(200); // collapse
      const after = await js(`document.querySelectorAll('.tree-guide').length`);
      assert(after < before, `collapsed folder still has its guide (before ${before}, after ${after})`);
    });

    // 21. "⋯" hugs the pane's right edge at 1000/1600px, sidebar open/collapsed;
    //     and no button sits on the note title's row.
    await step(21, 'pane-bar actions layout (4 cases)', async () => {
      await clickTreeRow('Export Testi'); // a root note, visible in the tree
      await waitFor('document.querySelector("#pane-actions [data-menu-anchor=\\"menu-note\\"]")');
      const sidebarCollapsed = async () => (await sideW()) === '0px';
      const setCollapsed = async (want) => { if ((await sidebarCollapsed()) !== want) { await clickSel('#sidebar-toggle'); await sleep(300); } };
      for (const width of [1000, 1600]) {
        for (const collapsed of [false, true]) {
          win.setContentSize(width, 820); await sleep(200);
          await setCollapsed(collapsed); await sleep(250);
          const m = await js(`(() => {
            const pane = document.querySelector('.content').getBoundingClientRect();
            const btn = document.querySelector('#pane-actions [data-menu-anchor="menu-note"]').getBoundingClientRect();
            const title = document.querySelector('.note-title').getBoundingClientRect();
            const onRow = [...document.querySelectorAll('.content button')].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.bottom > title.top && r.top < title.bottom; }).length;
            return { gap: pane.right - btn.right, inside: btn.right <= pane.right + 1, onRow };
          })()`);
          const label = `${width}px ${collapsed ? 'collapsed' : 'open'}`;
          // Windows draws its window buttons over the bar's top right: 150px kept free.
          const room = process.platform === 'win32' ? 150 : 0;
          assert(m.inside && m.gap >= room && m.gap <= room + 16, `${label}: ⋯ not within 16px of the free edge (gap ${m.gap}, room ${room})`);
          assert(m.onRow === 0, `${label}: ${m.onRow} button(s) share the title row`);
        }
      }
      await setCollapsed(false);
    });

    // 22. Rename a note; inbound bare + alias links in another note are rewritten
    //     and the link still opens the (renamed) target.
    await step(22, 'rename rewrites inbound links', async () => {
      await press('2', ['meta']); await sleep(150);
      await clickSel('#ara-input'); await typeText('LinkB'); await enter();
      await toSource(); await typeBody('# LinkB basligi'); await sleep(550);
      await clickSel('#ara-input'); await typeText('LinkA'); await enter();
      await toSource(); await typeBody('[[LinkB]] ve [[LinkB|takma ad]]'); await sleep(550);
      await retype('#ara-input', ''); await sleep(200);
      await treeRowMenu('LinkB'); await clickMenuItem('Rename'); await treeType('LinkB2');
      await sleep(350);
      assert(fs.existsSync(path.join(notesDir, 'LinkA.md')), 'LinkA.md missing');
      const a = fs.readFileSync(path.join(notesDir, 'LinkA.md'), 'utf8');
      assert(a.includes('[[LinkB2]]') && a.includes('[[LinkB2|takma ad]]'), `A not rewritten: ${JSON.stringify(a)}`);
      assert(fs.existsSync(path.join(notesDir, 'LinkB2.md')), 'LinkB not renamed on disk');
      await clickTreeRow('LinkA');
      assert(await waitFor('document.querySelector(".md a[data-wiki=\\"LinkB2\\"]")'), 'rewritten link not rendered');
      await clickEval(`document.querySelector('.md a[data-wiki="LinkB2"]')`, 'wikilink');
      assert(await waitFor(`document.querySelector('.note-title')?.textContent==='LinkB2'`), 'link did not open renamed note');
    });

    // 23. Move a note; a path link through its old folder is rewritten.
    await step(23, 'move rewrites a path link', async () => {
      await press('2', ['meta']); await sleep(150);
      await treeRowMenu('Kutu'); await clickMenuItem('New note'); await treeType('Hedef'); await sleep(250);
      await clickSel('#ara-input'); await typeText('Kaynak'); await enter();
      await toSource(); await typeBody('bkz [[Kutu/Hedef]]'); await sleep(550);
      await retype('#ara-input', ''); await sleep(250);
      await js(`(() => {
        const row = ${treeRow('Hedef')};
        const dest = document.querySelector('.tree-root-drop');
        const dt = new DataTransfer();
        row.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
        // the middle of the folder row: into the folder (its edges arrange)
        const b = dest.getBoundingClientRect(); const at = { clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 };
        dest.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, ...at }));
        dest.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, ...at }));
        return true;
      })()`);
      await sleep(400);
      assert(fs.existsSync(path.join(notesDir, 'Hedef.md')), 'Hedef not moved to root');
      const k = fs.readFileSync(path.join(notesDir, 'Kutu', 'Kaynak.md'), 'utf8');
      assert(k.includes('[[Hedef]]') && !k.includes('[[Kutu/Hedef]]'), `path link not rewritten: ${JSON.stringify(k)}`);
    });

    // 24. Backlinks: LinkB2 lists LinkA with its excerpt; removing the link in
    //     LinkA drops the entry.
    await step(24, 'backlinks show and update', async () => {
      await press('2', ['meta']); await sleep(150);
      await clickTreeRow('LinkB2');
      assert(await waitFor(`[...document.querySelectorAll('.backlink-title')].some(t=>t.textContent==='LinkA')`), 'LinkA not listed as backlink');
      assert(await js(`[...document.querySelectorAll('.backlink-line')].some(l=>l.textContent.includes('[[LinkB2]]'))`), 'backlink excerpt missing');
      await clickTreeRow('LinkA');
      await toSource(); // switch to raw-source editor
      // Clear the editor as test setup (real keyboard select-all is unreliable
      // in sendInputEvent), then type real characters.
      await js(`(()=>{const t=document.querySelector('#note-editor'); t.value=''; t.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
      await typeBody('artik link yok');
      assert(await waitFor2(() => { try { return fs.readFileSync(path.join(notesDir, 'LinkA.md'), 'utf8') === 'artik link yok'; } catch { return false; } }, 3000), 'LinkA edit not saved');
      await clickTreeRow('LinkB2');
      assert(await waitFor(`(document.querySelector('.backlinks-empty')?.textContent || '').startsWith('No other note links here yet')`, 8000), 'backlink entry not removed');
    });

    // 25. Paste a PNG from the clipboard into a note editor: the file lands in
    //     the attachments folder, the image Markdown is inserted, and the rendered <img> loads.
    const eklerDir = path.join(notesDir, 'Attachments');
    await step(25, 'paste image attachment', async () => {
      await clipboard.write([new ClipboardItem({ 'image/png': new Blob([makePng(8, 8)], { type: 'image/png' }) })]);
      await press('2', ['meta']); await sleep(150);
      await clickSel('#ara-input'); await typeText('EkNot'); await enter();
      await toSource();
      await js(`(()=>{ const ta=document.querySelector('#note-editor'); ta.focus(); const dt=new DataTransfer(); dt.items.add(new File([new Uint8Array([1,2,3])],'x.png',{type:'image/png'})); ta.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); return true; })()`);
      assert(await waitFor(`document.querySelector('#note-editor') && document.querySelector('#note-editor').value.includes('![')`, 3000), 'image Markdown not inserted');
      const pngs = fs.existsSync(eklerDir) ? fs.readdirSync(eklerDir).filter((n) => n.endsWith('.png')) : [];
      assert(pngs.length >= 1, `no png copied into Attachments: ${JSON.stringify(pngs)}`);
      await press('E', ['meta']); // duzenle -> oku to render
      assert(await waitFor(`(()=>{const i=document.querySelector('.note-pane .md img.att-img'); return i && i.naturalWidth>0;})()`, 4000), 'rendered image has no natural size');
    });

    // 26. "Attach file…" copies a chosen PDF into Attachments and inserts a file link.
    await step(26, 'add file via Attach file…', async () => {
      const pdfSrc = path.join(tmp, 'belge.pdf');
      fs.writeFileSync(pdfSrc, '%PDF-1.4\n% test\n');
      nextOpenFiles = [pdfSrc];
      if ((await js(`!!document.querySelector('#note-editor')`)) === false) await press('E', ['meta']);
      await clickEval(`document.querySelector('#pane-actions [data-menu-anchor="menu-note"]')`, 'note ⋯');
      await clickMenuItem('Attach file…');
      assert(await waitFor(`document.querySelector('#note-editor') && document.querySelector('#note-editor').value.includes('[belge.pdf](Attachments/belge.pdf)')`, 3000), 'pdf link not inserted');
      assert(fs.existsSync(path.join(eklerDir, 'belge.pdf')), 'pdf not copied into Attachments');
      await press('E', ['meta']); // render
      assert(await waitFor(`[...document.querySelectorAll('.note-pane .md a.att-file')].some(a=>a.getAttribute('data-att')==='Attachments/belge.pdf')`, 5000), 'pdf file link not rendered');
    });

    // 27. The attachment protocol serves files inside the vault only: an
    //     encoded ../ escape and a file in a dot folder are refused.
    await step(27, 'protocol refuses out-of-vault path', async () => {
      fs.mkdirSync(path.join(notesDir, '.hidden'), { recursive: true });
      fs.writeFileSync(path.join(notesDir, '.hidden', 'x.png'), makePng(4, 4));
      fs.writeFileSync(path.join(tmp, 'outside.png'), makePng(4, 4));
      const tryLoad = (src) => js(`new Promise((resolve)=>{ const i=new Image(); i.onload=()=>resolve('load'); i.onerror=()=>resolve('error'); i.src=${JSON.stringify(src)}; setTimeout(()=>resolve('timeout'),2500); })`);
      for (const src of ['mufka-att://v/%2E%2E%2Foutside.png', 'mufka-att://v/..%2Foutside.png', 'mufka-att://v/.hidden/x.png', 'mufka-att://v/Gunluk/secret.md']) {
        const ok = await tryLoad(src);
        assert(ok !== 'load', `${src} should not load, got ${ok}`);
      }
      const good = await js(`new Promise((resolve)=>{ const names=${JSON.stringify('x')}; const i=new Image(); i.onload=()=>resolve(i.naturalWidth>0?'load':'zero'); i.onerror=()=>resolve('error'); const n=[...document.querySelectorAll('.note-pane .md img.att-img')][0]; i.src=n?n.src:''; setTimeout(()=>resolve('timeout'),2500); })`);
      assert(good === 'load', `valid attachment should load, got ${good}`);
    });

    // 28. Live preview: click a paragraph, edit it, click another block; the
    //     first block re-renders with the new text and the file matches.
    const blokPath = path.join(notesDir, 'Blok.md');
    await step(28, 'edit a block, leave, it re-renders', async () => {
      await press('2', ['meta']); await sleep(150);
      await clickSel('#ara-input'); await typeText('Blok'); await enter();
      await setNoteSource('# Bir baslik\n\npara iki\n\nson blok');
      await clickBlock('para iki');
      assert(await waitFor(`document.getElementById('block-editor')?.value==='para iki'`, 2500), 'block editor did not open with its source');
      await clickSel('#block-editor'); await typeText(' eklendi'); await sleep(100);
      await clickBlock('Bir baslik'); await sleep(250); // commit the paragraph
      assert(await waitFor(blockByText('para iki eklendi'), 2500), 'edited block not re-rendered');
      assert(await waitFor2(() => fs.readFileSync(blokPath, 'utf8').includes('para iki eklendi'), 3000), 'file not updated');
    });

    // 29. Keyboard flow: ArrowUp/Down between blocks; Enter makes a new block;
    //     Backspace at a block start merges with the previous block.
    await step(29, 'arrows, Enter, Backspace across blocks', async () => {
      await clickBlock('son blok');
      assert(await waitFor(`document.getElementById('block-editor')?.value==='son blok'`, 2500), 'son blok editor missing');
      await press('Up'); await sleep(150); // into previous block
      assert((await blockVal() || '').includes('para iki'), `ArrowUp did not enter previous block: ${await blockVal()}`);
      await press('Down'); await sleep(150); // back down
      assert((await blockVal() || '').includes('son blok'), `ArrowDown did not enter next block: ${await blockVal()}`);
      // Enter on an empty last line starts a new block below.
      await clickSel('#block-editor');
      await js(`(()=>{const t=document.getElementById('block-editor'); t.setSelectionRange(t.value.length,t.value.length); return true;})()`);
      await typeBody('\n'); await sleep(80); // empty last line
      await press('Return'); await sleep(200);
      await typeText('yeni blok'); await sleep(100);
      await press('Escape'); await sleep(200);
      assert(await waitFor(blockByText('yeni blok'), 2500), 'Enter did not create a new block');
      // Backspace at the very start of a block merges it with the previous one.
      await clickBlock('yeni blok');
      await js(`(()=>{const t=document.getElementById('block-editor'); t.setSelectionRange(0,0); return true;})()`);
      await press('Backspace'); await sleep(200);
      assert((await blockVal() || '').includes('yeni blok'), `Backspace-merge lost the text: ${await blockVal()}`);
      await press('Escape'); await sleep(150);
    });

    // 30. Opening and leaving blocks without typing changes nothing on disk.
    await step(30, 'round-trip: leaving blocks untouched is byte-identical', async () => {
      await setNoteSource('# H1\n\npara bir\n\n- madde a\n- madde b\n\n> alinti\n\nson');
      const before = fs.readFileSync(blokPath, 'utf8');
      for (const t of ['H1', 'para bir', 'madde a', 'alinti', 'son']) {
        await clickBlock(t); await sleep(120);
        assert(await waitFor('document.getElementById("block-editor")', 1500), `no editor for ${t}`);
        await press('Escape'); await sleep(120);
      }
      assert(fs.readFileSync(blokPath, 'utf8') === before, 'file changed after leaving blocks untouched');
    });

    // 31. A task checkbox in a non-edited block toggles with a single click.
    await step(31, 'task checkbox single click in preview', async () => {
      await setNoteSource('notlar\n\n- [ ] yapilacak is');
      await clickEval(`document.querySelector('.note-body .block input.task-check')`, 'task checkbox');
      assert(await waitFor2(() => fs.readFileSync(blokPath, 'utf8').includes('- [x] yapilacak is'), 3000), 'task not toggled in source');
    });

    // 32. "Edit source" shows the full raw text; "Back to preview" returns.
    await step(32, 'source toggle via menu', async () => {
      await openMenuByAnchor(`document.querySelector('#pane-actions [data-menu-anchor="menu-note"]')`);
      await clickMenuItem('Edit source');
      assert(await waitFor('document.querySelector("#note-editor")', 2500), 'source editor not shown');
      assert((await js('document.querySelector("#note-editor").value')).includes('- [x] yapilacak is'), 'raw text missing in source');
      await openMenuByAnchor(`document.querySelector('#pane-actions [data-menu-anchor="menu-note"]')`);
      await clickMenuItem('Back to preview');
      assert(await waitFor('document.querySelector(".note-body .block")', 2500), 'did not return to preview');
    });

    // 33. The page cannot navigate away from the app (a navigated page would
    //     still get the preload bridge) nor open new windows.
    await step(33, 'navigation and new windows are blocked', async () => {
      const appUrl = wc.getURL();
      await js(`location.href = ${JSON.stringify(`file://${path.join(os.tmpdir(), 'mufka-nav-test.html')}`)}; true`);
      await sleep(400);
      assert(wc.getURL() === appUrl, `page navigated to ${wc.getURL()}`);
      assert(await js('typeof window.notes === "object"'), 'app page lost its bridge');
      const opened = await js('window.open("about:blank") === null');
      await sleep(200);
      assert(opened, 'window.open returned a window');
      assert(BrowserWindow.getAllWindows().length === 1, `${BrowserWindow.getAllWindows().length} windows open`);
    });

    // 34. An Obsidian-style note: frontmatter, a nested task list, a table and a
    //     footnote render as one block each; clicking the NESTED task flips
    //     exactly its line on disk.
    await step(34, 'obsidian note: frontmatter, nested task, table, footnote', async () => {
      const src = '---\ntags: [is, rapor]\n---\n\n- ust\n  - [ ] alt gorev\n\n| A | B |\n| - | -: |\n| 1 | 2 |\n\nDipnot[^1].\n\n[^1]: Aciklama.';
      await setNoteSource(src);
      assert(await waitFor('[...document.querySelectorAll(".note-body .props .prop-chip")].map(c => c.textContent.replace("×", "")).join(",") === "#is,#rapor"', 2500), 'frontmatter not rendered as properties');
      assert(!(await js('!!document.querySelector(".note-body hr")')), 'frontmatter fence rendered as a rule');
      assert(await js('document.querySelectorAll(".note-body table th").length === 2'), 'table header missing');
      assert(await js('document.querySelector(".note-body td.align-right")?.textContent === "2"'), 'column alignment missing');
      assert(await js('[...document.querySelectorAll(".note-body .block")].some(b => b.querySelector("li ul input.task-check"))'), 'nested task not nested');
      assert(await js('[...document.querySelectorAll(".note-body sup.footnote-ref")].some(s => s.textContent === "[1]")'), 'footnote reference not resolved across blocks');
      await clickEval(`document.querySelector('.note-body li ul input.task-check')`, 'nested task checkbox');
      assert(await waitFor2(() => fs.readFileSync(blokPath, 'utf8') === src.replace('- [ ] alt gorev', '- [x] alt gorev'), 3000), 'nested task did not toggle exactly its line');
    });

    // 34b. Another app (an AI client over MCP) adds to the note while a block
    //      is being edited: saving the block keeps both. A change elsewhere in
    //      the note is saved over, with a warning (the version history has it).
    await step('34b', 'outside addition kept while editing; other change warns', async () => {
      await setNoteSource('ilk\n\nikinci');
      await clickBlock('ikinci');
      assert(await waitFor(`document.getElementById('block-editor')?.value==='ikinci'`, 2500), 'block editor did not open');
      await press('End'); await typeText(' ek');
      fs.writeFileSync(blokPath, 'ilk\n\nikinci\n- Claude ekledi\n'); // what append_to_note writes
      await press('Escape');
      assert(await waitFor2(() => fs.readFileSync(blokPath, 'utf8') === 'ilk\n\nikinci ek\n- Claude ekledi\n', 3000), `addition lost: ${JSON.stringify(fs.readFileSync(blokPath, 'utf8'))}`);
      assert(await waitFor('document.querySelector(".note-body")?.textContent.includes("Claude ekledi")', 2500), 'addition not shown');
      await setNoteSource('bir\n\niki');
      await clickBlock('iki');
      assert(await waitFor(`document.getElementById('block-editor')?.value==='iki'`, 2500), 'block editor did not open (2)');
      await press('End'); await typeText(' degisti');
      fs.writeFileSync(blokPath, 'tamamen baska\n');
      await press('Escape');
      assert(await waitFor2(() => fs.readFileSync(blokPath, 'utf8') === 'bir\n\niki degisti', 3000), `not saved: ${JSON.stringify(fs.readFileSync(blokPath, 'utf8'))}`);
      assert(await waitFor('(document.getElementById("toast")?.textContent || "").includes("changed outside Mufka")', 2000), 'no warning');
    });
    // 35. Open an existing folder (an Obsidian vault) as the vault: its notes
    //     show, nothing is added to it, new notes go there; the home folder is
    //     refused; switching back restores the default vault.
    const outsideVault = path.join(tmp, 'ObsidianVault');
    await step(35, 'open an existing folder as the vault, then switch back', async () => {
      fs.mkdirSync(path.join(outsideVault, '.obsidian'), { recursive: true });
      fs.writeFileSync(path.join(outsideVault, '.obsidian', 'app.json'), '{}');
      fs.mkdirSync(path.join(outsideVault, 'Proje'));
      fs.writeFileSync(path.join(outsideVault, 'Proje', 'Plan.md'), '---\ntags: [x]\n---\n\n# Plan');
      fs.writeFileSync(path.join(outsideVault, 'Kok.md'), 'kok notu');
      const menuItem = (id) => Menu.getApplicationMenu().getMenuItemById(id);
      const settingsFile = path.join(tmp, 'settings.json');

      // The home folder itself is refused, nothing changes.
      lastMessage = null;
      nextOpenFiles = [os.homedir()];
      menuItem('vault-choose').click();
      assert(await waitFor2(() => lastMessage && /home folder/.test(lastMessage), 3000), `home folder not refused: ${lastMessage}`);
      assert(!fs.existsSync(settingsFile) || !JSON.parse(fs.readFileSync(settingsFile, 'utf8')).vaultPath, 'refused folder was saved');

      nextOpenFiles = [outsideVault];
      menuItem('vault-choose').click();
      assert(await waitFor2(() => fs.existsSync(settingsFile) && JSON.parse(fs.readFileSync(settingsFile, 'utf8')).vaultPath === outsideVault, 3000), 'vault choice not saved');
      await sleep(1200); // window reload
      await press('2', ['meta']);
      assert(await waitFor(`!!${treeRow('Proje')} && !!${treeRow('Kok')}`, 5000), 'notes of the chosen folder not shown');
      assert(!(await js(`!!${treeRow('.obsidian')}`)), '.obsidian shown in the tree');
      assert(!(await js(`!!${treeRow('Blok')}`)), 'default vault notes still shown');
      await clickTreeRow('Proje'); await sleep(200);
      await clickTreeRow('Plan');
      assert(await waitFor('document.querySelector(".note-body .props")', 3000), 'note from the chosen folder not opened');
      await clickSel('#ara-input'); await typeText('Yeni dis not'); await enter();
      // Created next to the open note (Proje/), per the filter's target-folder rule.
      assert(await waitFor2(() => fs.existsSync(path.join(outsideVault, 'Proje', 'Yeni dis not.md')), 3000), 'new note not written into the chosen folder');
      assert(!fs.existsSync(path.join(outsideVault, 'Günlük')), 'Günlük was created in the chosen folder');
      assert(!fs.existsSync(path.join(outsideVault, 'Ekler')), 'Ekler was created in the chosen folder');
      for (const d of ['Daily', 'Attachments']) assert(!fs.existsSync(path.join(outsideVault, d)), `${d} was created in the chosen folder`);
      assert(menuItem('vault-default').enabled, '"back to default" disabled');

      menuItem('vault-default').click();
      assert(await waitFor2(() => !JSON.parse(fs.readFileSync(settingsFile, 'utf8')).vaultPath, 3000), 'default not restored in settings');
      await sleep(1200);
      await press('2', ['meta']);
      assert(await waitFor(`!!${treeRow('Blok')}`, 5000), 'default vault notes not back');
      assert(!(await js(`!!${treeRow('Kok')}`)), 'chosen folder still shown');
      assert(!menuItem('vault-default').enabled, '"back to default" enabled on the default vault');
    });

    // 36. The vault is watched: edits and new notes from other apps show up
    //     without a focus change, and neither they nor Mufka's own saves
    //     disturb a block being edited.
    await step(36, 'changes from other apps show up live', async () => {
      await clickTreeRow('Blok');
      assert(await waitFor('document.querySelector(".note-body .block")', 3000), 'Blok not opened');
      fs.writeFileSync(blokPath, 'Disaridan degisti');
      assert(await waitFor(`!!${blockByText('Disaridan degisti')}`, 4000), 'external edit of the open note not shown');
      fs.writeFileSync(path.join(notesDir, 'Disaridan yeni.md'), 'x');
      assert(await waitFor(`!!${treeRow('Disaridan yeni')}`, 4000), 'note created by another app not in the tree');

      await clickBlock('Disaridan degisti');
      assert(await waitFor('document.getElementById("block-editor")', 2500), 'block editor did not open');
      await clickSel('#block-editor'); await typeText(' yazdim');
      await sleep(2000); // any autosave + the watcher window
      assert(await js('document.activeElement?.id === "block-editor"'), "Mufka's own save re-rendered the editor");
      fs.writeFileSync(path.join(notesDir, 'Baska.md'), 'y');
      await sleep(900);
      assert(await js('document.getElementById("block-editor")?.value.endsWith(" yazdim")'), 'an external change disrupted the editor');
      await press('Escape'); await sleep(300);
      assert(await waitFor2(() => fs.readFileSync(blokPath, 'utf8').includes('Disaridan degisti yazdim'), 3000), 'typed text not saved');
    });

    // 37. Notes from other tools keep files anywhere in the vault: a path
    //     relative to the note and a bare ![[name]] both load; clicking an image
    //     opens that file; a linked script is only revealed in Finder.
    await step(37, 'attachments anywhere in the vault; scripts are not opened', async () => {
      const dir = path.join(notesDir, 'Resimli');
      fs.mkdirSync(path.join(dir, 'img'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'araclar'), { recursive: true });
      fs.mkdirSync(path.join(notesDir, 'Baska klasor'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'img', 'a.png'), makePng(6, 6));
      fs.writeFileSync(path.join(notesDir, 'Baska klasor', 'b.png'), makePng(7, 7));
      fs.writeFileSync(path.join(dir, 'araclar', 'kur.command'), 'echo hi');
      fs.writeFileSync(path.join(dir, 'Galeri.md'), '![a](img/a.png)\n\n![[b.png]]\n\n[betik](araclar/kur.command)');
      await press('2', ['meta']);
      assert(await waitFor(`!!${treeRow('Resimli')}`, 4000), 'folder not in tree');
      await clickTreeRow('Resimli'); await sleep(200);
      await clickTreeRow('Galeri');
      const loaded = '[...document.querySelectorAll(".note-body img.att-img")].filter(i => i.naturalWidth > 0).length';
      assert(await waitFor(`${loaded} === 2`, 4000), `images not loaded: ${await js(loaded)}`);
      shellCalls.length = 0;
      await clickEval('document.querySelector(".note-body img.att-img")', 'relative image');
      assert(await waitFor2(() => shellCalls.some(([k, p]) => k === 'open' && p === fs.realpathSync(path.join(dir, 'img', 'a.png'))), 2000), `image not opened: ${JSON.stringify(shellCalls)}`);
      shellCalls.length = 0;
      await clickEval('[...document.querySelectorAll(".note-body a.att-file")].find(a => a.textContent === "betik")', 'script link');
      assert(await waitFor2(() => shellCalls.length > 0, 2000), 'script link did nothing');
      assert(shellCalls.every(([k]) => k === 'reveal'), `script was opened: ${JSON.stringify(shellCalls)}`);
    });

    // 38. A vault with Obsidian settings: daily notes go to its daily-notes
    //     folder, a pasted image goes next to the note ("./files") and is
    //     linked relative to the note.
    const obsVault = path.join(tmp, 'ObsidianSettingsVault');
    await step(38, "obsidian vault: daily notes folder and attachments next to notes", async () => {
      fs.mkdirSync(path.join(obsVault, '.obsidian'), { recursive: true });
      fs.mkdirSync(path.join(obsVault, 'Proje'), { recursive: true });
      fs.writeFileSync(path.join(obsVault, '.obsidian', 'daily-notes.json'), JSON.stringify({ folder: 'Journal', format: 'YYYY-MM-DD' }));
      fs.writeFileSync(path.join(obsVault, '.obsidian', 'app.json'), JSON.stringify({ attachmentFolderPath: './files' }));
      fs.writeFileSync(path.join(obsVault, 'Proje', 'Resimli not.md'), 'metin');
      nextOpenFiles = [obsVault];
      Menu.getApplicationMenu().getMenuItemById('vault-choose').click();
      await sleep(1500); // window reload
      await press('T', ['meta']); await sleep(200);
      await clickEval(`[...document.querySelectorAll('.daily-note button')].find(b=>b.textContent==='Add note')`, 'Add note');
      assert(await waitFor('document.querySelector(".daily-note #block-editor")', 2500), 'daily block editor missing');
      await clickSel('.daily-note #block-editor'); await typeText('gunluk'); await sleep(150);
      await press('Escape'); await sleep(300);
      assert(await waitFor2(() => fs.existsSync(path.join(obsVault, 'Journal', `${todayKey}.md`)), 3000), 'daily note not in the Obsidian daily folder');
      assert(!fs.existsSync(path.join(obsVault, 'Daily')), 'Mufka default daily folder created anyway');

      await clipboard.write([new ClipboardItem({ 'image/png': new Blob([makePng(5, 5)], { type: 'image/png' }) })]);
      await press('2', ['meta']);
      assert(await waitFor(`!!${treeRow('Proje')}`, 4000), 'Proje not in tree');
      // Expanded folders are remembered by path; another vault may have opened "Proje".
      if ((await js(`${treeRow('Proje')}?.querySelector('.tri')?.textContent`)) !== '▾') { await clickTreeRow('Proje'); await sleep(200); }
      await clickTreeRow('Resimli not');
      await toSource();
      await js(`(()=>{ const ta=document.querySelector('#note-editor'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); const dt=new DataTransfer(); dt.items.add(new File([new Uint8Array([1])],'x.png',{type:'image/png'})); ta.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); return true; })()`);
      assert(await waitFor('document.querySelector("#note-editor").value.includes("](files/")', 3000), `relative link not inserted: ${await js('document.querySelector("#note-editor").value')}`);
      const pasted = fs.existsSync(path.join(obsVault, 'Proje', 'files')) ? fs.readdirSync(path.join(obsVault, 'Proje', 'files')) : [];
      assert(pasted.length === 1 && pasted[0].endsWith('.png'), `image not saved next to the note: ${JSON.stringify(pasted)}`);
      await press('E', ['meta']);
      assert(await waitFor('(()=>{const i=document.querySelector(".note-body img.att-img"); return i && i.naturalWidth>0;})()', 4000), 'pasted image does not render');
      Menu.getApplicationMenu().getMenuItemById('vault-default').click();
      await sleep(1500);
    });

    // 39. When macOS refuses the notification (unsigned builds, since Electron
    //     42), the reminder appears in the window, stays until dismissed, and
    //     clicking it opens today. (Which plans are due is unit-tested in
    //     lib/notify.mjs; here the bridge and the fallback are exercised.)
    await step(39, 'reminder in the window when the notification fails', async () => {
      const show = Notification.prototype.show;
      Notification.prototype.show = function () { this.emit('failed', {}, 'not code-signed (test)'); };
      try {
        await press('2', ['meta']);
        await js('window.planner.notify({ title: "Mufka", body: "09:30 · Toplanti" })');
        assert(await waitFor('[...document.querySelectorAll("#reminders .reminder-body")].some(e => e.textContent === "09:30 · Toplanti")', 3000), 'reminder not shown');
        await sleep(3000); // longer than a toast
        assert(await js('document.querySelectorAll("#reminders .reminder").length === 1'), 'reminder did not stay');
        await clickSel('#reminders .reminder-text');
        assert(await waitFor('document.querySelectorAll("#reminders .reminder").length === 0', 2000), 'reminder not removed on click');
        assert(await waitFor('document.querySelector(".day-title")?.textContent.startsWith("Today")', 2000), 'today not opened');
        await js('window.planner.notify({ title: "Mufka", body: "10:00 · Ikinci" })');
        assert(await waitFor('document.querySelectorAll("#reminders .reminder").length === 1', 3000), 'second reminder not shown');
        await clickSel('#reminders .reminder-close');
        assert(await waitFor('document.querySelectorAll("#reminders .reminder").length === 0', 2000), 'reminder not dismissed');
      } finally {
        Notification.prototype.show = show;
      }
    });

    // 40. Obsidian callouts render as tinted, titled boxes; a foldable one
    //     opens/closes on click and with the keyboard without entering edit
    //     mode; clicking the body edits the raw block. Plain quotes stay quotes.
    await step(40, 'callouts: render, fold, edit', async () => {
      await press('2', ['meta']); await sleep(150);
      await clickSel('#ara-input'); await typeText('Kutular'); await enter();
      const src = '> [!warning] Dikkat **et**\n> govde satiri\n\n> [!faq]- Neden?\n> Cunku.\n\n> duz alinti';
      await setNoteSource(src);
      assert(await waitFor('document.querySelector(".note-body .callout.callout-warning .callout-title")?.textContent === "Dikkat et"', 2500), 'callout title not rendered');
      // The warning colour of whichever theme is showing (CI machines are light).
      const amber = await js('(()=>{const e=document.createElement("i"); e.style.color="var(--c-amber)"; document.body.append(e); const c=getComputedStyle(e).color; e.remove(); return c;})()');
      assert((await js('getComputedStyle(document.querySelector(".note-body .callout-warning")).borderLeftColor')) === amber, 'callout color not applied');
      assert(await js('!!document.querySelector(".note-body blockquote") && document.querySelectorAll(".note-body .callout").length === 2'), 'plain quote or callout count wrong');
      assert(await js('document.querySelector(".note-body details.callout-question").open === false'), 'folded callout starts open');
      await clickSel('.note-body details.callout-question summary'); await sleep(200);
      assert(await js('document.querySelector(".note-body details.callout-question").open === true'), 'click did not unfold');
      assert(!(await js('!!document.getElementById("block-editor")')), 'fold click entered edit mode');
      await press('Space'); await sleep(150);
      assert(await js('document.querySelector(".note-body details.callout-question").open === false'), 'keyboard did not fold');
      await clickBlock('govde satiri');
      assert(await waitFor('document.getElementById("block-editor")?.value === "> [!warning] Dikkat **et**\\n> govde satiri"', 2500), 'callout body did not edit its raw block');
      const file = fs.readdirSync(notesDir, { recursive: true }).find((p) => p.endsWith('Kutular.md'));
      assert(file && fs.readFileSync(path.join(notesDir, file), 'utf8') === src, 'note source changed');
    });

    // 41. Graph view: notes and links on a canvas. Real clicks: the pane-bar
    //     button opens it, clicking a node opens that note, Cmd+Shift+G shows
    //     the local graph, + zooms from the keyboard, Tags adds tag nodes.
    await step(41, 'graph view: global, open by click, local, tags', async () => {
      fs.mkdirSync(path.join(notesDir, 'Graf'), { recursive: true });
      fs.writeFileSync(path.join(notesDir, 'Graf', 'G1.md'), '[[G2]] ve [[G3]]');
      fs.writeFileSync(path.join(notesDir, 'Graf', 'G2.md'), '[[G1]] #grafetiket');
      fs.writeFileSync(path.join(notesDir, 'Graf', 'G3.md'), 'son');
      await sleep(800);
      await clickSel('#graph-btn');
      const api = 'document.querySelector(".graph-view")?.graphApi';
      assert(await waitFor(`${api}?.ids().includes("Graf/G1.md") && ${api}.settled()`, 20000), 'graph did not show and settle');
      assert((await js('document.getElementById("graph-btn").getAttribute("aria-current")')) === 'page', 'graph place not selected');
      const p = await js(`${api}.screenPos("Graf/G3.md")`);
      assert(p, 'G3 has no position');
      await clickAt(Math.round(p.x), Math.round(p.y));
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "G3"', 3000), 'clicking a node did not open the note');
      await press('G', ['meta', 'shift']);
      assert(await waitFor(`${api}?.settled() && JSON.stringify(${api}.ids().sort()) === JSON.stringify(["Graf/G1.md","Graf/G3.md"])`, 8000), `local graph wrong: ${await js(`${api}?.ids()`)}`);
      const k0 = await js(`${api}.zoom()`);
      await press('='); await sleep(150);
      assert((await js(`${api}.zoom()`)) > k0, 'keyboard zoom did not work');
      await clickEval(`[...document.querySelectorAll(".graph-mode .btn")].find(b => b.textContent === "Global")`, 'Global');
      await clickSel('.graph-check input[data-pref="tags"]');
      assert(await waitFor(`${api}.ids().includes("tag:grafetiket")`, 3000), 'tag node missing');
      await clickSel('.graph-check input[data-pref="tags"]');
    });

    // 42. Quick switcher (Cmd+O): fuzzy-find and open; no match + Enter
    //     creates the note. Command palette (Cmd+P): run a command; Esc closes.
    await step(42, 'quick switcher and command palette', async () => {
      await press('O', ['meta']);
      assert(await waitFor('document.activeElement?.id === "palette-input"', 2000), 'switcher did not open focused');
      await typeText('gf g2');
      assert(await waitFor('document.querySelector(".palette-item.selected .palette-label")?.textContent === "G2"', 2000), `fuzzy match wrong: ${await js('document.querySelector(".palette-item.selected")?.textContent')}`);
      await enter();
      assert(await waitFor('!document.querySelector(".palette-layer") && document.querySelector(".note-title")?.textContent === "G2"', 3000), 'switcher did not open G2');
      await press('O', ['meta']); await typeText('Switcher yeni');
      assert(await waitFor('document.querySelector(".palette-item.create")', 2000), 'no create row');
      await enter();
      assert(await waitFor2(() => fs.readdirSync(notesDir, { recursive: true }).some((p) => p.endsWith('Switcher yeni.md')), 3000), 'note not created');
      await press('P', ['meta']); await typeText('graph view');
      assert(await waitFor('document.querySelector(".palette-item.selected .palette-label")?.textContent === "Open graph view"', 2000), 'command not found');
      await enter();
      assert(await waitFor('!!document.querySelector(".graph-view")', 3000), 'command did not run');
      await press('P', ['meta']);
      assert(await waitFor('!!document.querySelector(".palette-commands")', 2000), 'palette did not open');
      await press('Escape');
      assert(await waitFor('!document.querySelector(".palette-layer")', 2000), 'Esc did not close');
    });

    // 43. Right sidebar: outline of the open note, an unlinked mention turned
    //     into a link with one click (file changes on disk), the tag list, and
    //     a #tag click that searches for it.
    await step(43, 'right sidebar: outline, unlinked mention, tags', async () => {
      fs.mkdirSync(path.join(notesDir, 'Bilgi'), { recursive: true });
      fs.writeFileSync(path.join(notesDir, 'Bilgi', 'Konu.md'), '# Konu\n\nmetin #bilgietiket\n\n## Alt baslik\n\nson');
      const bahsedenPath = path.join(notesDir, 'Bilgi', 'Bahseden.md');
      fs.writeFileSync(bahsedenPath, 'bu not konu hakkinda');
      await sleep(800);
      await press('O', ['meta']); await typeText('Konu'); await enter();
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "Konu"', 3000), 'Konu did not open');
      if ((await js('document.getElementById("rightbar").hidden'))) await clickSel('#rightbar-btn');
      await clickSel('[data-rb-tab="outline"]');
      assert(await waitFor('[...document.querySelectorAll(".rb-heading")].map(b => b.textContent).join("|") === "Konu|Alt baslik"', 2000), 'outline wrong');
      await clickEval('[...document.querySelectorAll(".rb-heading")].find(b => b.textContent === "Alt baslik")', 'outline item');
      await clickSel('[data-rb-tab="links"]');
      assert(await waitFor('[...document.querySelectorAll(".rb-mention-title")].some(t => t.textContent === "Bahseden")', 3000), 'unlinked mention missing');
      await clickEval('[...document.querySelectorAll(".rb-mention")].find(r => r.querySelector(".rb-mention-title")?.textContent === "Bahseden").querySelector(".rb-link")', 'Link');
      assert(await waitFor2(() => fs.readFileSync(bahsedenPath, 'utf8') === 'bu not [[Konu|konu]] hakkinda', 3000), `mention not linked: ${fs.readFileSync(bahsedenPath, 'utf8')}`);
      await clickSel('[data-rb-tab="tags"]');
      assert(await waitFor('[...document.querySelectorAll(".rb-tag-name")].some(t => t.textContent === "#bilgietiket")', 2000), 'tag not listed');
      await clickEval('[...document.querySelectorAll(".note-body .tag")].find(t => t.textContent === "#bilgietiket")', 'inline tag');
      assert(await waitFor('document.getElementById("ara-input")?.value === "#bilgietiket" && [...document.querySelectorAll(".ara-result")].some(r => r.textContent.startsWith("Konu"))', 3000), 'tag click did not search');
      await clickSel('#rightbar-btn');
      assert(await js('document.getElementById("rightbar").hidden'), 'right sidebar did not close');
    });

    // 44. Page preview: hovering a [[link]] shows the linked note; leaving
    //     hides it. Back/forward: Cmd+[ / Cmd+] and the pane-bar arrows.
    await step(44, 'page preview on hover; back and forward', async () => {
      await press('O', ['meta']); await typeText('Bahseden'); await enter();
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "Bahseden"', 3000), 'Bahseden did not open');
      const r = await rectEval('document.querySelector(".note-body a[data-wiki]")');
      assert(r, 'link not rendered');
      wc.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y });
      assert(await waitFor('document.querySelector(".hover-preview .hover-preview-body")?.textContent.includes("Alt baslik")', 3000), 'preview did not show the note');
      wc.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y + 300 });
      assert(await waitFor('!document.querySelector(".hover-preview")', 2000), 'preview did not hide');
      const title = 'document.querySelector(".note-title")?.textContent';
      await press('O', ['meta']); await typeText('G1'); await enter();
      assert(await waitFor(`${title} === "G1"`, 3000), 'G1 did not open');
      // A note opened from another note opens beside it in its own tab;
      // opening one already in a tab goes to that tab.
      const tabNames = 'JSON.stringify([...document.querySelectorAll("#tab-strip .tab-item")].map(t => (t.classList.contains("active") ? "*" : "") + t.textContent.replace("×", "")).filter(n => /Bahseden|G1|G3/.test(n)))';
      assert(await waitFor(`${tabNames} === '["Bahseden","*G1"]'`, 3000), `G1 not in its own tab: ${await js(tabNames)}`);
      await press('O', ['meta']); await typeText('G3'); await enter();
      assert(await waitFor(`${title} === "G3" && ${tabNames} === '["Bahseden","G1","*G3"]'`, 3000), `G3 not in its own tab: ${await js(tabNames)}`);
      await press('O', ['meta']); await typeText('G1'); await enter();
      assert(await waitFor(`${title} === "G1" && ${tabNames} === '["Bahseden","*G1","G3"]'`, 3000), `did not go to G1's tab: ${await js(tabNames)}`);
      // Back and forward move within a tab: G1 → the Planner and back.
      await clickSel('#mode-planner');
      assert(await waitFor('!!document.querySelector(".planner")', 3000), 'Planner did not open');
      await press('[', ['meta']);
      assert(await waitFor(`${title} === "G1"`, 3000), 'Cmd+[ did not go back');
      await press(']', ['meta']);
      assert(await waitFor('!!document.querySelector(".planner")', 3000), 'Cmd+] did not go forward');
      await clickSel('#nav-back');
      assert(await waitFor(`${title} === "G1"`, 3000), 'back button did not go back');
      await clickSel('#mode-notes');
    });

    // 45. Autocomplete while typing: "[[" suggests notes (Enter inserts the
    //     link and does not split the block), "#gra" suggests the tag (Tab).
    await step(45, 'autocomplete [[links]] and #tags while typing', async () => {
      await press('O', ['meta']); await typeText('Oneri notu'); await enter();
      assert(await waitFor('document.activeElement?.id === "block-editor"', 3000), 'new note not in edit mode');
      await typeText('bak [[G');
      assert(await waitFor('[...document.querySelectorAll(".suggest-item .suggest-label")].some(l => l.textContent === "G2")', 2000), 'no note suggestions');
      await typeText('2');
      assert(await waitFor('document.querySelector(".suggest-item.selected .suggest-label")?.textContent === "G2"', 2000), 'G2 not first');
      await enter();
      assert(await waitFor('document.getElementById("block-editor")?.value === "bak [[G2]]" && !document.querySelector(".suggest")', 2000), `link not inserted: ${await blockVal()}`);
      await typeText(' #grafe');
      assert(await waitFor('document.querySelector(".suggest-item.selected .suggest-label")?.textContent === "#grafetiket"', 2000), 'no tag suggestion');
      await press('Tab');
      assert(await waitFor('document.getElementById("block-editor")?.value === "bak [[G2]] #grafetiket "', 2000), `tag not inserted: ${await blockVal()}`);
      await press('Escape'); await sleep(700);
      const file = fs.readdirSync(notesDir, { recursive: true }).find((p) => p.endsWith('Oneri notu.md'));
      assert(file && fs.readFileSync(path.join(notesDir, file), 'utf8').startsWith('bak [[G2]] #grafetiket'), 'file not saved with the link');
    });

    // 46. Note embeds: ![[Note#Heading]] shows that section inline, read-only
    //     (its checkbox is disabled); the embed title opens the note.
    await step(46, 'note embeds', async () => {
      fs.writeFileSync(path.join(notesDir, 'Bilgi', 'Gorev.md'), '# Gorev\n\n- [ ] gomulu gorev');
      fs.writeFileSync(path.join(notesDir, 'Gomulu.md'), 'bas\n\n![[Konu#Alt baslik]]\n\n![[Gorev]]');
      await sleep(800);
      await press('O', ['meta']); await typeText('Gomulu'); await enter();
      assert(await waitFor('document.querySelectorAll(".note-body .embed").length === 2', 4000), 'embeds not rendered');
      assert(await js('/Alt baslik\\s*son/.test(document.querySelector(".note-body .embed[data-embed=\\"Bilgi/Konu.md\\"] .embed-body").textContent)'), 'section text wrong');
      assert(await js('!document.querySelector(".note-body .embed[data-embed=\\"Bilgi/Konu.md\\"]").textContent.includes("metin")'), 'embedded more than the section');
      assert(await js('document.querySelector(".note-body .embed[data-embed=\\"Bilgi/Gorev.md\\"] input.task-check").disabled'), 'embedded checkbox not disabled');
      await clickSel('.note-body .embed[data-embed="Bilgi/Gorev.md"] .embed-title');
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "Gorev"', 3000), 'embed title did not open the note');
    });

    // 47. Templates: Shift+Cmd+T inserts a filled template at the caret of the
    //     block being edited; Cmd+O from an editor still saves its text; the
    //     vault's daily template fills a new daily note.
    await step(47, 'templates and the daily template', async () => {
      fs.mkdirSync(path.join(notesDir, 'Templates'), { recursive: true });
      fs.writeFileSync(path.join(notesDir, 'Templates', 'Toplanti.md'), '## {{title}} notu\n\n- yil {{date:YYYY}}');
      fs.writeFileSync(path.join(notesDir, 'Templates', 'Gun.md'), '# {{date:dddd}}\n\n- [ ] plan');
      fs.mkdirSync(path.join(notesDir, '.obsidian'), { recursive: true });
      fs.writeFileSync(path.join(notesDir, '.obsidian', 'daily-notes.json'), JSON.stringify({ folder: 'Daily', template: 'Templates/Gun' }));
      await sleep(900);
      await press('O', ['meta']); await typeText('G3'); await enter();
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "G3"', 3000), 'G3 did not open');
      await clickBlock('son');
      assert(await waitFor('document.getElementById("block-editor")?.value === "son"', 2000), 'block not editing');
      await press('End'); await typeText(' ');
      await press('T', ['meta', 'shift']);
      assert(await waitFor('!!document.querySelector(".palette-templates")', 2000), 'template picker did not open');
      await typeText('topl'); await enter();
      const year = String(new Date().getFullYear());
      assert(await waitFor(`document.getElementById("block-editor")?.value === "son ## G3 notu\\n\\n- yil ${year}"`, 3000), `template not inserted at the caret: ${JSON.stringify(await blockVal())}`);
      await typeText(' ek');
      await press('O', ['meta']); await typeText('G1'); await enter();
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "G1"', 3000), 'G1 did not open');
      const g3 = path.join(notesDir, 'Graf', 'G3.md');
      assert(await waitFor2(() => fs.readFileSync(g3, 'utf8').endsWith(`- yil ${year} ek`), 3000), `edit lost when switching notes: ${JSON.stringify(fs.readFileSync(g3, 'utf8'))}`);
      await press('T', ['meta']); await sleep(300);
      await clickSel('.day-nav button[aria-label="Next day"]'); await sleep(300);
      const d = new Date(); d.setDate(d.getDate() + 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
      await clickEval(`[...document.querySelectorAll('.daily-note button')].find(b=>b.textContent==='Add note')`, 'Add note');
      const daily = path.join(notesDir, 'Daily', `${key}.md`);
      assert(await waitFor2(() => fs.existsSync(daily) && fs.readFileSync(daily, 'utf8') === `# ${weekday}\n\n- [ ] plan`, 3000), `daily template not used: ${fs.existsSync(daily) ? JSON.stringify(fs.readFileSync(daily, 'utf8')) : 'missing'}`);
      fs.rmSync(path.join(notesDir, '.obsidian'), { recursive: true, force: true });
    });

    // 48. Bookmarks (note ⋯ > Bookmark): listed above the tree, open on click,
    //     saved in settings.json (no .obsidian folder here); the status bar
    //     counts words, characters and backlinks.
    await step(48, 'bookmarks and the status bar', async () => {
      await press('O', ['meta']); await typeText('G2'); await enter();
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "G2"', 3000), 'G2 did not open');
      assert(await waitFor('/^2 backlinks · 2 words · 18 characters$/.test(document.getElementById("status-bar")?.textContent || "")', 3000), `status bar wrong: ${await js('document.getElementById("status-bar")?.textContent')}`);
      await clickSel('#pane-actions .menu-btn, #pane-actions button[aria-label="Options"]');
      await clickMenuItem('Bookmark');
      await press('2', ['meta']);
      assert(await waitFor('[...document.querySelectorAll(".bookmark-row")].some(b => b.textContent === "G2")', 3000), 'bookmark not listed');
      const settings = JSON.parse(fs.readFileSync(path.join(tmp, 'settings.json'), 'utf8'));
      assert(JSON.stringify(settings.bookmarks || {}).includes('Graf/G2.md'), 'bookmark not saved');
      await press('O', ['meta']); await typeText('G3'); await enter();
      await clickEval('[...document.querySelectorAll(".bookmark-row")].find(b => b.textContent === "G2")', 'bookmark row');
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "G2"', 3000), 'bookmark click did not open');
      await clickSel('#pane-actions button[aria-label="Options"]');
      await clickMenuItem('Remove bookmark');
      assert(await waitFor('!document.querySelector(".bookmark-row")', 3000), 'bookmark not removed');
    });

    // 49. Dropping an image file (a real OS drop via CDP) onto a rendered note
    //     attaches it as its own block after the block under the pointer and
    //     shows the image at once; dropping into an open block editor saves
    //     that block and adds the image after it. Clicking away keeps both.
    await step(49, 'drop images on a note and into an editor', async () => {
      const png = path.join(tmp, 'Screen shot 1.png');
      fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg==', 'base64'));
      const notePath = path.join(notesDir, 'Surukle.md');
      fs.writeFileSync(notePath, 'bir\n\niki');
      await sleep(800);
      await press('O', ['meta']); await typeText('Surukle'); await enter();
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "Surukle"', 3000), 'note did not open');
      const drop = async (x, y) => {
        try { wc.debugger.attach('1.3'); } catch { /* already attached */ }
        const data = { items: [], files: [png], dragOperationsMask: 1 };
        for (const type of ['dragEnter', 'dragOver', 'drop']) await wc.debugger.sendCommand('Input.dispatchDragEvent', { type, x, y, data });
      };
      const r1 = await rectEval(blockByText('bir'));
      await drop(r1.x, r1.y);
      assert(await waitFor2(() => /^bir\n\n!\[Screen shot 1\.png\]\(Attachments\/Screen%20shot%201\.png\)\n\niki$/.test(fs.readFileSync(notePath, 'utf8')), 4000), `drop on the note: ${JSON.stringify(fs.readFileSync(notePath, 'utf8'))}`);
      assert(await waitFor('[...document.querySelectorAll(".note-body img.att-img")].some(i => i.naturalWidth > 0)', 3000), 'image not shown');
      await clickBlock('iki');
      assert(await waitFor('document.getElementById("block-editor")?.value === "iki"', 2000), 'not editing');
      await typeText(' uc');
      const r2 = await rectEval('document.getElementById("block-editor")');
      await drop(r2.x, r2.y);
      assert(await waitFor2(() => fs.readFileSync(notePath, 'utf8').endsWith('iki uc\n\n![Screen shot 1 2.png](Attachments/Screen%20shot%201%202.png)'), 4000), `drop into the editor: ${JSON.stringify(fs.readFileSync(notePath, 'utf8'))}`);
      wc.debugger.detach();
      await clickSel('.note-title'); await sleep(500);
      assert(fs.readFileSync(notePath, 'utf8').split('![').length === 3, 'an image went missing after clicking away');
      assert(await js('document.querySelectorAll(".note-body img.att-img").length === 2'), 'both images should show');
    });

    // 50. Finding your way: the sidebar shows every place at once (Today,
    //     Graph, Calendar, Notes); the toolbar names the open note; the
    //     welcome card goes away for good; ⌘/ and the footer open the
    //     shortcuts list; a collapsed section stays collapsed.
    await step(50, 'sidebar places, toolbar title, welcome, shortcuts', async () => {
      await clickEval('[...document.querySelectorAll(".place")].find(p => p.querySelector(".place-label")?.textContent === "Home")', 'Home');
      assert(await waitFor('document.querySelector(".day-title")?.textContent.startsWith("Today") && !document.querySelector(".side-calendar") && document.querySelector(".side-notes .tree")', 3000), 'places/sections missing');
      assert((await js('document.title')) === 'Home — Mufka', `window title: ${await js('document.title')}`);
      assert(await js('!!document.querySelector(".welcome")'), 'welcome card missing on first run');
      await clickEval('[...document.querySelectorAll(".welcome button")].find(b => b.textContent === "Got it")', 'Got it');
      assert(await waitFor('!document.querySelector(".welcome")', 2000), 'welcome card did not close');
      await press('O', ['meta']); await typeText('G1'); await enter();
      assert(await waitFor('document.querySelector("#pane-title")?.textContent === "Graf / G1" && document.title === "G1 — Mufka"', 3000), `toolbar title: ${await js('document.querySelector("#pane-title")?.textContent')}`);
      await press('/', ['meta']);
      assert(await waitFor('!!document.querySelector(".palette-shortcuts") && document.querySelectorAll(".palette-shortcuts .palette-item").length > 10', 2000), 'shortcuts list missing');
      await typeText('graph');
      assert(await waitFor('[...document.querySelectorAll(".palette-shortcuts .palette-label")].some(l => l.textContent === "Graph / local graph")', 2000), 'shortcut filter');
      await press('Escape');
      await clickSel('#foot-commands');
      assert(await waitFor('!!document.querySelector(".palette-commands")', 2000), 'footer Commands did not open the palette');
      await press('Escape');
      assert(await waitFor('document.getElementById("vault-name")?.textContent === "Documents/Mufka"', 2000), `notes folder name: ${await js('document.getElementById("vault-name")?.textContent')}`);
      await clickSel('#vault-btn');
      const filesApp = process.platform === 'darwin' ? 'Finder' : 'File Explorer';
      assert(await waitFor(`[...document.querySelectorAll(".row-menu .menu-item")].map(b => b.textContent).join("|") === "Open another notes folder…|Show this folder in ${filesApp}"`, 2000), 'notes folder menu wrong');
      await press('Escape');
      await clickEval('document.querySelector(".side-notes .side-head-toggle")', 'Notes header');
      assert(await waitFor('!document.querySelector(".side-notes .tree")', 2000), 'notes did not collapse');
      wc.reload(); await sleep(1800);
      assert(await js('!document.querySelector(".side-notes .tree") && !document.querySelector(".welcome")'), 'collapse or welcome not remembered');
      await clickEval('document.querySelector(".side-notes .side-head-toggle")', 'Notes header');
      assert(await waitFor('!!document.querySelector(".side-notes .tree")', 2000), 'notes did not expand');
    });

    // 51. Planner: the week in its own mode. Add to a day and to "This week",
    //     move with ⌥→ and with ⋯ > Move to…, a past plan is "missed" and
    //     "→ Today" brings it back, a block resizes by dragging its bottom
    //     edge, ⌃Tab switches modes. Every change lands in planlar.json.
    await step(51, 'planner: add, move, missed, resize, mode switch', async () => {
      const plans = () => JSON.parse(fs.readFileSync(path.join(tmp, 'planlar.json'), 'utf8')).items;
      const byTitle = (t) => plans().find((p) => p.title === t);
      await clickSel('#mode-planner');
      assert(await waitFor('!!document.querySelector(".planner .pl-grid") && document.getElementById("mode-planner").getAttribute("aria-pressed") === "true"', 3000), 'planner did not open');
      const todayKey2 = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
      // add to today's band
      await clickEval(`document.querySelector('.pl-allday[data-drop-day="${todayKey2}"] .pl-add-field')`, 'add field');
      await typeText('Planner gorev'); await enter();
      assert(await waitFor2(() => byTitle('Planner gorev')?.key === todayKey2, 3000), 'day plan not saved');
      // add to this week
      assert(!(await js('!!document.querySelector(".pl-week")')), 'the no-day strip shows with nothing in it');
      await clickEval(`document.querySelector('.pl-allday[data-drop-day="${todayKey2}"] .pl-add-field')`, 'add field');
      await typeText('Haftalik is'); await enter();
      assert(await waitFor2(() => byTitle('Haftalik is')?.key === todayKey2, 3000), 'plan not saved');
      const hid = byTitle('Haftalik is').id;
      await hoverClickEval(`document.querySelector('.pl-task[data-id="${hid}"] .pl-menu')`, 'menu');
      await clickMenuItem('Move to…');
      await clickMenuItem('This week, no day');
      assert(await waitFor2(() => byTitle('Haftalik is')?.scope === 'week', 3000), 'week plan not saved');
      assert(await waitFor('!!document.querySelector(".pl-week")', 2000), 'strip did not appear for a no-day plan');
      // keyboard move: ⌥→ moves the focused plan one day
      const next = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
      const id = byTitle('Planner gorev').id;
      await clickEval(`document.querySelector('.pl-task[data-id="${id}"] .pl-task-title')`, 'plan row');
      await js(`document.querySelector('.pl-task[data-id="${id}"]').focus()`);
      await press('Right', ['alt']);
      assert(await waitFor2(() => byTitle('Planner gorev').key === next, 3000), '⌥→ did not move it');
      if (new Date().getDay() !== 0) assert(await waitFor(`document.activeElement?.dataset?.id === "${id}"`, 2000), 'focus not kept on the moved plan');
      await press('Z', ['meta']);
      assert(await waitFor2(() => byTitle('Planner gorev').key === todayKey2, 3000), '⌘Z did not undo the move');
      // ⋯ > Move to… > This week, no day
      await hoverClickEval(`document.querySelector('.pl-task[data-id="${id}"] .pl-menu')`, 'plan menu');
      await clickMenuItem('Move to…');
      await clickMenuItem('This week, no day');
      assert(await waitFor2(() => byTitle('Planner gorev').scope === 'week', 3000), 'Move to… did not move it');
      // missed: add to a day last week, then → Today
      await clickSel('.pl-nav button[aria-label="Previous week"]');
      await clickEval('document.querySelector(".pl-allday .pl-add-field")', 'last week Monday');
      await typeText('Eski gorev'); await enter();
      assert(await waitFor('[...document.querySelectorAll(".pl-task.missed .pl-task-title")].some(t => t.textContent === "Eski gorev")', 3000), 'past plan not marked missed');
      await clickEval('[...document.querySelectorAll(".pl-task.missed")].find(r => r.querySelector(".pl-task-title")?.textContent === "Eski gorev").querySelector(".pl-today-btn")', '→ Today');
      assert(await waitFor2(() => byTitle('Eski gorev').key === todayKey2, 3000), '→ Today did not move it');
      // a timed plan via the edit dialog, then resize its block by dragging
      await clickSel('.pl-nav button[aria-label="Next week"]');
      const eid = byTitle('Eski gorev').id;
      await js(`document.querySelector('.pl-task[data-id="${eid}"]').focus()`);
      await hoverClickEval(`document.querySelector('.pl-task[data-id="${eid}"] .pl-menu')`, 'menu');
      await clickMenuItem('Edit…');
      assert(await waitFor('!!document.querySelector(".plan-dialog")', 2000), 'edit dialog missing');
      await clickSel('.plan-dialog .saatli-check');
      await setTime('.plan-dialog .time-start', '1000');
      await setTime('.plan-dialog .time-end', '1100');
      await clickEval('[...document.querySelectorAll(".plan-dialog .btn")].find(b => b.textContent === "Save")', 'Save');
      assert(await waitFor2(() => byTitle('Eski gorev').time === '10:00' && byTitle('Eski gorev').endTime === '11:00', 3000), `times not saved: ${JSON.stringify(byTitle('Eski gorev'))}`);
      await js(`document.querySelector('.pl-block[data-id="${eid}"]').scrollIntoView({ block: 'center' })`); await sleep(200);
      const g = await rectEval(`document.querySelector('.pl-block[data-id="${eid}"] .pl-resize')`);
      wc.sendInputEvent({ type: 'mouseDown', x: g.x, y: g.y, button: 'left', clickCount: 1 });
      for (let dy = 8; dy <= 48; dy += 8) { wc.sendInputEvent({ type: 'mouseMove', x: g.x, y: g.y + dy, button: 'left' }); await sleep(20); }
      wc.sendInputEvent({ type: 'mouseUp', x: g.x, y: g.y + 48, button: 'left', clickCount: 1 });
      assert(await waitFor2(() => byTitle('Eski gorev').endTime === '12:00', 3000), `resize did not save: ${byTitle('Eski gorev').endTime}`);
      // ⌃Tab goes round: Planner → Tasks → Draw → Notes → Planner
      await press('Tab', ['control']);
      assert(await waitFor('!!document.querySelector(".tasks") && document.getElementById("mode-tasks").getAttribute("aria-pressed") === "true"', 2000), '⌃Tab did not switch to tasks');
      await press('Tab', ['control']);
      assert(await waitFor('document.getElementById("mode-draw").getAttribute("aria-pressed") === "true"', 2000), '⌃Tab did not switch to draw');
      await press('Tab', ['control']);
      assert(await waitFor('!document.querySelector(".planner") && document.getElementById("mode-notes").getAttribute("aria-pressed") === "true"', 2000), '⌃Tab did not switch to notes');
      await press('Tab', ['control']);
      assert(await waitFor('!!document.querySelector(".planner")', 2000), '⌃Tab did not switch back');
      await clickSel('#mode-notes');
    });

    // 52. Planner drag (a real Chrome drag, intercepted and dropped via CDP):
    //     a "This week" plan dropped on today's 15:00 becomes a 1h timed plan.
    await step(52, 'planner: drag a plan onto the hour grid', async () => {
      const plans = () => JSON.parse(fs.readFileSync(path.join(tmp, 'planlar.json'), 'utf8')).items;
      const p = plans().find((x) => x.title === 'Haftalik is');
      await clickSel('#mode-planner');
      assert(await waitFor(`!!document.querySelector('.pl-week .pl-task[data-id="${p.id}"]')`, 3000), 'week plan not shown');
      const tk = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
      try { wc.debugger.attach('1.3'); } catch { /* attached */ }
      await wc.debugger.sendCommand('Input.setInterceptDrags', { enabled: true });
      const from = await rectEval(`document.querySelector('.pl-week .pl-task[data-id="${p.id}"] .pl-task-title')`);
      const got = new Promise((res) => { const h = (_e, m, d) => { if (m === 'Input.dragIntercepted') { wc.debugger.removeListener('message', h); res(d.data); } }; wc.debugger.on('message', h); });
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 5; i++) await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + i * 10, y: from.y + i * 6, button: 'left', buttons: 1 });
      const data = await Promise.race([got, sleep(3000).then(() => null)]);
      assert(data, 'the drag did not start');
      const to = await js(`(()=>{const c=document.querySelector('.pl-col[data-drop-day="${tk}"]');const sc=document.querySelector('.pl-scroll');sc.scrollTop=12*48;const b=c.getBoundingClientRect();return {x:Math.round(b.x+b.width/2),y:Math.round(b.top+15*48+6)};})()`);
      for (const type of ['dragEnter', 'dragOver', 'drop']) await wc.debugger.sendCommand('Input.dispatchDragEvent', { type, x: to.x, y: to.y, data });
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 });
      await wc.debugger.sendCommand('Input.setInterceptDrags', { enabled: false });
      wc.debugger.detach();
      assert(await waitFor2(() => { const q = plans().find((x) => x.id === p.id); return q.scope === 'day' && q.key === tk && q.time === '15:00' && q.endTime === '16:00'; }, 3000), `drop did not schedule it: ${JSON.stringify(plans().find((x) => x.id === p.id))}`);
      assert(await waitFor(`!!document.querySelector('.pl-block[data-id="${p.id}"]')`, 2000), 'no block on the grid');
      await clickSel('#mode-notes');
    });

    // 53. "New plan" makes a repeating, timed plan in one dialog (Day, Repeat
    //     with chosen days, Timed); it shows on those days with the repeating
    //     look; ⌘Z removes it. Edit can turn an existing plan into a repeating one.
    await step(53, 'new plan: repeating on chosen days; make a plan repeat', async () => {
      const plans = () => JSON.parse(fs.readFileSync(path.join(tmp, 'planlar.json'), 'utf8')).items;
      const named = (t) => plans().find((p) => p.title === t);
      await clickSel('#mode-planner');
      await clickSel('.pl-new');
      assert(await waitFor('!!document.querySelector(".plan-dialog #dlg-repeat")', 2000), 'New plan dialog missing');
      await typeText('Yuzme');
      // Start on this week's Monday, so Tuesday and Thursday are in the week
      // whatever day the test runs.
      await js(`(() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const i = document.getElementById('dlg-date'); i.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await js(`(() => { const s = document.getElementById('dlg-repeat'); s.focus(); })()`);
      await js(`(() => { const s = document.getElementById('dlg-repeat'); s.value = 'custom'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      assert(await waitFor('!document.querySelector(".plan-dialog-days").hidden', 1000), 'day toggles did not appear');
      await clickSel('.day-toggle[data-dow="2"]');
      await clickSel('.day-toggle[data-dow="4"]');
      await clickSel('.plan-dialog .saatli-check');
      await setTime('.plan-dialog .time-start', '1800');
      await setTime('.plan-dialog .time-end', '1900');
      await clickEval('[...document.querySelectorAll(".plan-dialog .btn")].find(b => b.textContent === "Save")', 'Save');
      assert(await waitFor2(() => JSON.stringify(named('Yuzme')?.recur) === JSON.stringify({ type: 'weekdays', days: [2, 4] }) && named('Yuzme').time === '18:00', 3000), `repeating plan not saved: ${JSON.stringify(named('Yuzme'))}`);
      const shown = await js(`[...document.querySelectorAll('.pl-block.recurring')].filter(b => b.querySelector('.pl-block-title')?.textContent === 'Yuzme').map(b => b.closest('.pl-col').dataset.dropDay)`);
      const dows = shown.map((k) => { const [y, m, d] = k.split('-').map(Number); return ((new Date(y, m - 1, d).getDay() + 6) % 7) + 1; });
      assert(JSON.stringify(dows.filter((x) => x === 2 || x === 4)) === JSON.stringify(dows) && dows.length >= 1, `shown on the wrong days: ${JSON.stringify(dows)}`);
      await clickSel('.pl-title'); await press('Z', ['meta']);
      assert(await waitFor2(() => !named('Yuzme'), 2000), '⌘Z did not remove the new plan');
      // make an existing plan repeat every day
      const id = named('Kiraz').id;
      await hoverClickEval(`document.querySelector('.planner [data-id="${id}"] .pl-menu')`, 'Kiraz menu');
      await clickMenuItem('Edit…');
      await js(`(() => { const s = document.getElementById('dlg-repeat'); s.value = 'daily'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await clickEval('[...document.querySelectorAll(".plan-dialog .btn")].find(b => b.textContent === "Save")', 'Save');
      assert(await waitFor2(() => named('Kiraz')?.recur?.type === 'daily', 3000), 'Edit did not make it repeat');
      // It repeats from its own day (today) on: today … Sunday.
      const left = 7 - ((new Date().getDay() + 6) % 7);
      assert(await waitFor(`[...document.querySelectorAll('.planner .pl-task.recurring')].filter(r => r.querySelector('.pl-task-title')?.textContent === 'Kiraz').length === ${left}`, 2000), 'repeating look missing for Kiraz');
      await press('Z', ['meta']);
      assert(await waitFor2(() => named('Kiraz')?.recur === null, 2000), '⌘Z did not undo the repeat');
      await clickSel('#mode-notes');
    });

    // 54. Notes sort (A–Z / Z–A / last edited), the Notes button returns to the
    //     last note, guide lines are coloured per level.
    await step(54, 'notes sort, Notes button target, coloured guides', async () => {
      const rootNotes = () => js(`[...document.querySelectorAll('.side-notes .note-row')].filter(r => !r.dataset.rel.includes('/')).map(r => r.querySelector('.tree-name').textContent)`);
      await clickSel('.side-notes .side-btn[aria-label="Sort notes"]');
      assert(await waitFor('[...document.querySelectorAll(".row-menu .menu-item")].length === 5', 2000), 'sort menu missing');
      await clickMenuItem('\u2003Name (Z–A)');
      const za = await rootNotes();
      assert(za.length > 2 && JSON.stringify(za) === JSON.stringify([...za].sort((a, b) => b.localeCompare(a, 'en'))), `not Z–A: ${za}`);
      await clickSel('.side-notes .side-btn[aria-label="Sort notes"]');
      await clickMenuItem('\u2003Last edited first');
      fs.writeFileSync(path.join(notesDir, 'Yeni duzenlenen.md'), 'x');
      await sleep(900);
      assert(await waitFor(`[...document.querySelectorAll('.side-notes .note-row')].filter(r => !r.dataset.rel.includes('/'))[0]?.querySelector('.tree-name')?.textContent === 'Yeni duzenlenen'`, 3000), `last edited not first: ${await rootNotes()}`);
      await clickSel('.side-notes .side-btn[aria-label="Sort notes"]');
      await clickMenuItem('\u2003Name (A–Z)');
      // Notes button: back to the last note
      await press('O', ['meta']); await typeText('G2'); await enter();
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "G2"', 3000), 'G2 did not open');
      await clickSel('#mode-planner'); await sleep(200);
      await press('T', ['meta']);
      await clickSel('#mode-planner'); await clickSel('#mode-notes');
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "G2"', 3000), 'Notes did not return to the last note');
      // guides: a depth class per level
      assert(await waitFor('!!document.querySelector(".tree-guide.depth-0")', 5000), `no coloured guide: ${await js(`JSON.stringify({ mode: document.body.className, folders: [...document.querySelectorAll('.side-notes .folder-row')].map(r => r.dataset.rel + (r.getAttribute('aria-expanded') === 'true' ? '+' : '')), rows: document.querySelectorAll('.side-notes .tree-row').length, guides: document.querySelectorAll('.tree-guide').length, sideHidden: getComputedStyle(document.getElementById('sidebar')).display })`)}`);
    });

    await step(55, 'Settings (⌘, or the gear): calendar and Wispr Flow connections shown, offline', async () => {
      await press(',', ['meta']);
      assert(await waitFor('!!document.querySelector(".settings-dialog")', 2000), 'settings did not open');
      assert(await waitFor('/Not connected/.test(document.querySelector("[data-conn=wispr] .conn-side")?.textContent || "")', 2000), 'no Wispr connection state');
      assert(await waitFor('/Not connected/.test(document.querySelector("[data-conn=microsoft] .conn-side")?.textContent || "")', 2000), 'no Microsoft calendar state');
      // Google needs the build's client (.env.local): connectable, or "not set up" without it.
      assert(await waitFor('/Not connected|Not set up/.test(document.querySelector("[data-conn=google] .conn-side")?.textContent || "")', 2000), 'no Google calendar state');
      assert(!fs.existsSync(path.join(tmp, 'calendars.bin')), 'a calendar sign-in was stored');
      assert(await js('document.activeElement?.textContent === "Connect"'), 'Connect not focused');
      assert(!fs.existsSync(path.join(tmp, 'wispr.bin')), 'a sign-in was stored');
      await press('Escape');
      assert(await waitFor('!document.querySelector(".settings-dialog")', 2000), 'Esc did not close settings');
      // The gear next to the notes folder opens it too.
      await clickSel('#settings-btn');
      assert(await waitFor('!!document.querySelector(".settings-dialog")', 2000), 'the Settings button did not open settings');
      await press('Escape');
      assert(await waitFor('!document.querySelector(".settings-dialog")', 2000), 'settings did not close');
    });

    await step(56, 'Calendar events: Planner grid, all-day band, details, join, Home', async () => {
      // Not connected (the real handler, no sign-in): no refresh button.
      await clickSel('#mode-planner');
      assert(await waitFor('!!document.querySelector(".planner .pl-head")', 3000), 'Planner did not open');
      await sleep(400);
      assert(!(await js('!!document.querySelector(".pl-refresh")')), 'refresh button shown without a calendar');
      await press('T', ['meta']);
      // Answer the calendar request in main with two events today, as a
      // connected Microsoft calendar would (no network in tests).
      const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
      const key = todayKey;
      const next = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
      const events = [
        { id: 'ms:1', source: 'microsoft', calendar: 'Work', color: '#5AA9E6', title: 'Design review', allDay: false, start: at(10, 0), end: at(11, 0), startDate: null, endDate: null, location: 'Teams', joinUrl: 'https://teams.microsoft.com/l/meetup-join/test', webLink: null, organizer: 'Ali', attendees: ['Veli'], cancelled: false, free: false },
        { id: 'ms:2', source: 'microsoft', calendar: 'Work', color: '#D9A13B', title: 'Offsite', allDay: true, start: null, end: null, startDate: key, endDate: next, location: '', joinUrl: null, webLink: null, organizer: '', attendees: [], cancelled: false, free: false },
      ];
      let asked = 0;
      ipcMain.removeHandler('calendar:events');
      ipcMain.handle('calendar:events', () => { asked += 1; return { connected: true, events }; });
      ipcMain.removeHandler('calendar:refresh');
      ipcMain.handle('calendar:refresh', () => { wc.send('calendar:changed'); return { microsoft: { connected: true } }; });
      const opened = [];
      const realOpen = shell.openExternal;
      shell.openExternal = async (u) => { opened.push(u); };
      try {
        wc.send('calendar:changed'); // what main sends after a sign-in
        await clickSel('#mode-planner');
        assert(await waitFor('!!document.querySelector(".pl-event")', 4000), 'no event block in the Planner');
        assert(await js('document.querySelector(".pl-event .pl-block-title").textContent') === 'Design review', 'wrong event title');
        assert(await js('/10:00–11:00/.test(document.querySelector(".pl-event .pl-block-time").textContent)'), 'wrong event time');
        assert(await js(`!!document.querySelector('.pl-allday[data-drop-day="${key}"] .pl-event-chip')`), 'no all-day chip');
        // Refresh in the Planner's header asks the calendars again.
        assert(await waitFor('!!document.querySelector(".pl-refresh")', 2000), 'no refresh button');
        const before = asked;
        await clickSel('.pl-refresh');
        assert(await waitFor('(document.getElementById("toast")?.textContent || "").includes("Calendars refreshed")', 3000), 'no refresh toast');
        assert(await waitFor2(() => asked > before, 3000), 'refresh did not ask again');
        await clickSel('.pl-event');
        assert(await waitFor('!!document.querySelector(".event-card")', 2000), 'no event details');
        assert(await js('/Work/.test(document.querySelector(".event-facts").textContent)'), 'calendar name missing');
        await clickEval('[...document.querySelectorAll(".event-card .btn")].find(b => b.textContent === "Join meeting")', 'Join meeting');
        assert(await waitFor2(() => opened.includes('https://teams.microsoft.com/l/meetup-join/test'), 2000), `join did not open: ${JSON.stringify(opened)}`);
        assert(await waitFor('!document.querySelector(".event-card")', 2000), 'details stayed open');
        await press('T', ['meta']);
        assert(await waitFor('[...document.querySelectorAll(".event-row .plan-title")].map(e => e.textContent).join("|") === "Offsite|Design review"', 3000), 'Home does not list the events');
      } finally {
        shell.openExternal = realOpen;
      }
    });

    // 57. Colours and icons in the tree: rows show an icon, a folder's colour
    //     is its guide's, the row menu changes colour and icon (a picker icon
    //     or an emoji), they are saved in the vault's .mufka/tree.json, a rename
    //     keeps them, and they survive a reload.
    await step(57, 'tree: icons, colours from the row menu, kept on rename and reload', async () => {
      await clickSel('#mode-notes');
      const vault = await js('window.notes.vaultInfo().then(v => v.path)');
      fs.mkdirSync(path.join(vault, 'Tarifler'), { recursive: true });
      fs.writeFileSync(path.join(vault, 'Tarifler', 'Corba.md'), '# Corba\n');
      const row = (name) => `[...document.querySelectorAll('.tree-row')].find(r => r.querySelector('.tree-name')?.textContent === ${JSON.stringify(name)})`;
      assert(await waitFor(`!!(${row('Tarifler')})`, 4000), 'new folder not in the tree');
      assert(await js(`!!${row('Tarifler')}.querySelector('.tree-icon svg.icon-folder')`), 'no folder icon');
      await clickEval(row('Tarifler'), 'Tarifler');
      assert(await waitFor(`!!(${row('Corba')})`, 2000), 'folder did not open');
      assert(await js(`!!${row('Corba')}.querySelector('.tree-icon svg.icon-tiFileText')`), 'no note icon');
      // Colour from the menu: the row and its guide take it.
      const openMenuOf = async (name, item) => {
        await hoverClickEval(`${row(name)}.querySelector('.menu-btn')`, `${name} menu`);
        await clickEval(`[...document.querySelectorAll('.menu-item')].find(b => b.textContent === ${JSON.stringify(item)})`, item);
      };
      await openMenuOf('Tarifler', 'Colour…');
      assert(await waitFor('document.querySelectorAll(".swatch").length === 8', 2000), 'no colour swatches');
      await clickSel('.swatch[aria-label="Pink"]');
      assert(await waitFor(`${row('Tarifler')}.style.getPropertyValue('--row-c') === '#e07bb5'`, 2000), 'folder did not turn pink');
      assert(await waitFor(`[...document.querySelectorAll('.tree-guide')].some(g => /224, 123, 181|e07bb5/i.test(g.style.background))`, 3000), 'guide is not pink');
      // Kept in the vault like Obsidian's own settings, and not shown as a folder.
      const styleFile = path.join(vault, '.mufka', 'tree.json');
      const saved = () => { try { return JSON.parse(fs.readFileSync(styleFile, 'utf8')).items; } catch { return null; } };
      assert(await waitFor2(() => saved()?.Tarifler?.color === 'pink', 2000), `not saved in the vault: ${JSON.stringify(saved())}`);
      assert(!(await js(`!!(${row('.mufka')})`)), '.mufka shows in the tree');
      // Icon from the picker, emoji for the note.
      await openMenuOf('Tarifler', 'Icon…');
      await clickSel('.icon-choice[aria-label="Utensils"]');
      assert(await waitFor(`!!${row('Tarifler')}.querySelector('.tree-icon svg.icon-tiUtensils')`, 2000), 'picker icon not shown');
      await openMenuOf('Corba', 'Icon…');
      await clickSel('.emoji-input');
      await js(`(() => { const i = document.querySelector('.emoji-input'); i.value = '🍲'; return true; })()`);
      await press('Return');
      assert(await waitFor(`${row('Corba')}?.querySelector('.tree-emoji')?.textContent === '🍲'`, 2000), 'emoji icon not shown');
      // The selected note takes its folder's colour.
      await clickEval(row('Corba'), 'Corba');
      assert(await waitFor(`${row('Corba')}.classList.contains('selected') && getComputedStyle(${row('Corba')}).backgroundColor !== 'rgba(0, 0, 0, 0)'`, 2000), 'selected note not tinted');
      assert(await js(`${row('Corba')}.style.getPropertyValue('--row-c') === '#e07bb5'`), 'note does not take the folder colour');
      // Rename keeps the style; a reload keeps it too.
      await openMenuOf('Tarifler', 'Rename');
      assert(await waitFor('!!document.getElementById("tree-edit")', 2000), 'no rename field');
      await js(`(() => { const i = document.getElementById('tree-edit'); i.value = 'Yemekler'; return true; })()`);
      await press('Return');
      assert(await waitFor(`!!(${row('Yemekler')}) && ${row('Yemekler')}.style.getPropertyValue('--row-c') === '#e07bb5'`, 3000), 'rename lost the colour');
      assert(await waitFor2(() => saved()?.Yemekler?.color === 'pink' && !saved()?.Tarifler && saved()?.['Yemekler/Corba.md']?.icon === '🍲', 2000), `rename not saved: ${JSON.stringify(saved())}`);
      wc.reload(); await sleep(1800);
      await clickSel('#mode-notes');
      assert(await waitFor(`!!(${row('Yemekler')}) && !!${row('Yemekler')}.querySelector('svg.icon-tiUtensils')`, 4000), 'styles not kept after reload');
      // Default puts the level colour back.
      await openMenuOf('Yemekler', 'Colour…');
      await clickEval('document.querySelector(".style-reset")', 'Default');
      assert(await waitFor(`${row('Yemekler')}.style.getPropertyValue('--row-c') === '#6f7cf0'`, 2000), 'default colour not restored');
    });

    // 58. Arrange the tree by dragging (a real Chrome drag via CDP): the top
    //     edge of a row puts the item before it, the bottom edge after it; from
    //     another folder the note moves there and takes that place. The order
    //     is kept in .mufka/tree.json and survives a reload.
    await step(58, 'tree: drag to arrange, across folders, kept after reload', async () => {
      await clickSel('#mode-notes');
      const vault = await js('window.notes.vaultInfo().then(v => v.path)');
      for (const [rel, text] of [['Sira/A1.md', '# A1\n'], ['Sira/B2.md', '# B2\n'], ['Sira/C3.md', '# C3\n'], ['Diger/D4.md', '# D4\n']]) {
        fs.mkdirSync(path.dirname(path.join(vault, rel)), { recursive: true });
        fs.writeFileSync(path.join(vault, rel), text);
      }
      const row = (name) => `[...document.querySelectorAll('.tree-row')].find(r => r.querySelector('.tree-name')?.textContent === ${JSON.stringify(name)})`;
      const names = () => js(`[...document.querySelectorAll('.tree-row.note-row')].filter(r => r.dataset.rel.startsWith('Sira/')).map(r => r.querySelector('.tree-name').textContent).join(',')`);
      const namesAre = async (want, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if ((await names()) === want) return true; await sleep(80); } return false; };
      for (const f of ['Sira', 'Diger']) {
        assert(await waitFor(`!!(${row(f)})`, 4000), `${f} not in the tree`);
        if ((await js(`${row(f)}.querySelector('.tri').textContent`)) !== '▾') await clickEval(row(f), f);
      }
      assert(await waitFor(`!!(${row('C3')}) && !!(${row('D4')})`, 2000), 'notes not shown');
      // A real drag: press, move until Chrome starts it, then drop at a point.
      const drag = async (fromName, toName, edge) => {
        try { wc.debugger.attach('1.3'); } catch { /* attached */ }
        await wc.debugger.sendCommand('Input.setInterceptDrags', { enabled: true });
        await js(`${row(fromName)}.scrollIntoView({ block: 'center' }); true`); await sleep(80);
        const from = await rectEval(`${row(fromName)}.querySelector('.tree-name')`);
        const got = new Promise((res) => { const h = (_e, m, d) => { if (m === 'Input.dragIntercepted') { wc.debugger.removeListener('message', h); res(d.data); } }; wc.debugger.on('message', h); });
        await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
        for (let i = 1; i <= 5; i++) await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + i * 4, y: from.y + i * 3, button: 'left', buttons: 1 });
        const data = await Promise.race([got, sleep(3000).then(() => null)]);
        assert(data, 'the drag did not start');
        const to = await js(`(() => { ${row(toName)}.scrollIntoView({ block: 'nearest' }); const b = ${row(toName)}.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.top + b.height * ${edge === 'before' ? 0.15 : edge === 'into' ? 0.5 : 0.85}) }; })()`);
        for (const type of ['dragEnter', 'dragOver', 'drop']) await wc.debugger.sendCommand('Input.dispatchDragEvent', { type, x: to.x, y: to.y, data });
        await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 });
        await wc.debugger.sendCommand('Input.setInterceptDrags', { enabled: false });
        wc.debugger.detach();
      };
      await drag('C3', 'A1', 'before');
      assert(await namesAre('C3,A1,B2', 3000), `before: ${await names()}`);
      await drag('D4', 'A1', 'after');
      assert(await namesAre('C3,A1,D4,B2', 3000), `across folders: ${await names()}`);
      assert(fs.existsSync(path.join(vault, 'Sira', 'D4.md')) && !fs.existsSync(path.join(vault, 'Diger', 'D4.md')), 'D4 was not moved');
      const order = () => { try { return JSON.parse(fs.readFileSync(path.join(vault, '.mufka', 'tree.json'), 'utf8')).order; } catch { return null; } };
      assert(await waitFor2(() => JSON.stringify(order()?.Sira) === JSON.stringify(['C3.md', 'A1.md', 'D4.md', 'B2.md']), 2000), `order not saved: ${JSON.stringify(order())}`);
      wc.reload(); await sleep(1800);
      await clickSel('#mode-notes');
      if ((await js(`${row('Sira')}?.querySelector('.tri')?.textContent`)) !== '▾') await clickEval(row('Sira'), 'Sira');
      assert(await namesAre('C3,A1,D4,B2', 4000), `after reload: ${await names()}`);
      // The daily notes folder changes places like the rest but never moves into a folder.
      const daily = await js('window.notes.layout().then(l => l.daily)');
      assert(await js(`${row(daily)}?.getAttribute('draggable') === 'true' && getComputedStyle(${row(daily)}).cursor === 'grab'`), 'daily folder is not draggable or shows no hand');
      const top = () => js(`[...document.querySelectorAll('.tree-row.folder-row')].filter(r => !r.dataset.rel.includes('/')).map(r => r.dataset.rel)`);
      const before = await top();
      const last = before[before.length - 1];
      await drag(daily, last, 'after');
      await sleep(400);
      assert((await top()).at(-1) === daily, `daily folder did not move to the end: ${JSON.stringify(await top())}`);
      await drag(daily, 'Sira', 'into');
      await sleep(400);
      assert(fs.existsSync(path.join(vault, daily)) && !fs.existsSync(path.join(vault, 'Sira', daily)), 'daily folder moved into another folder');
      assert(await waitFor('(document.getElementById("toast")?.textContent || "").includes("daily notes folder")', 2000), 'no note about the daily folder');
    });

    // 59. Templates that come with Mufka: the sidebar button lists them; a
    //     budget note is named for the month, filled, and shows its card; an
    //     expense added through its dialog goes into the table and the totals. Copied into the Templates folder they become editable,
    //     and a changed one takes the built-in one's place.
    await step(59, 'built-in templates: new note from one, copy and override', async () => {
      await clickSel('#mode-notes');
      const vault = await js('window.notes.vaultInfo().then(v => v.path)');
      await clickSel('.side-notes .side-btn[aria-label="New note from template"]');
      assert(await waitFor('!!document.querySelector(".palette-new-from-template")', 2000), 'template list did not open');
      const shown = await js(`[...document.querySelectorAll('.palette-new-from-template .palette-label')].map(e => e.textContent)`);
      for (const n of ['Daily note', 'Meeting notes', 'Project', 'Book notes', 'Habit tracker', 'Budget', 'Travel plan', 'Weekly to-do', 'Job search', 'Job application']) assert(shown.includes(n), `${n} missing from ${JSON.stringify(shown)}`);
      await typeText('Budget'); await enter();
      assert(await waitFor('!!document.getElementById("tree-edit")', 2000), 'no name field');
      const d = new Date();
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      assert(await js('document.getElementById("tree-edit").value') === `Budget ${month}`, `suggested name: ${await js('document.getElementById("tree-edit").value')}`);
      await enter();
      // New notes go to the selected folder; find it wherever that is.
      const findNote = (name) => { const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name.startsWith('.')) continue; const p = path.join(dir, e.name); if (e.isDirectory()) { const r = walk(p); if (r) return r; } else if (e.name === name) return p; } return null; }; return walk(vault); };
      let file = null;
      assert(await waitFor2(() => (file = findNote(`Budget ${month}.md`)) && fs.readFileSync(file, 'utf8').includes('## Expenses'), 3000), 'budget note not made from the template');
      assert(!fs.readFileSync(file, 'utf8').includes('{{'), 'template variables left in the note');
      assert(await waitFor(`document.querySelector(".note-title")?.textContent === "Budget ${month}"`, 3000), 'budget note did not open');
      // The budget page: icon and cover, folded properties, the card, and an
      // expense added through the dialog lands in the table and the totals.
      assert(await waitFor('!!document.querySelector(".note-cover.cover-violet") && document.querySelector(".note-icon")?.textContent === "💰" && !!document.querySelector(".props.folded")', 3000), 'icon, cover or folded properties not shown');
      assert(await waitFor('!!document.querySelector(".note-body .bud-card .bud-ring") && document.querySelectorAll(".note-body table").length === 2', 3000), 'budget card or tables not shown');
      assert(await clickUntil(`[...document.querySelectorAll('.note-body .bud-add')].find(b => b.textContent.includes('expense'))`, '!!document.querySelector(".bud-dialog")', '+ Add expense'), 'add expense dialog did not open');
      await typeText('Coffee beans');
      await js(`(() => { document.querySelector('.bud-amount').value = '1.250,50'; document.querySelector('.bud-pill[data-name="Groceries"]').click(); return true; })()`);
      await js(`document.querySelector('.bud-what').focus()`);
      await enter();
      assert(await waitFor2(() => /\| Coffee beans \| Groceries \| 1250\.5 \|/.test(fs.readFileSync(file, 'utf8')), 3000), `expense row not added: ${fs.readFileSync(file, 'utf8').split('## Expenses')[1]}`);
      const stats = () => js('[...document.querySelectorAll(".bud-stat-value")].map(e => e.textContent)');
      let totals = false;
      for (let t = 0; t < 30 && !totals; t++) { const v = await stats(); totals = v[1].replace(/\D/g, '') === '12505' && v[2].startsWith('−'); if (!totals) await sleep(100); }
      assert(totals, `totals not updated: ${await stats()}`);
      assert(await js('!!document.querySelector(".note-body td .bud-chip")'), 'category not shown as a chip');
      // The Expenses table has a Total row (on screen only) with the same sum.
      assert(await waitFor('[...document.querySelectorAll(".note-body tr.bud-total")].some(r => r.querySelector(".bud-total-label")?.textContent === "Total" && r.querySelector(".bud-total-amount")?.textContent.replace(/\\D/g, "") === "12505")', 3000), `no Total row: ${await js('[...document.querySelectorAll(".note-body tr.bud-total")].map(r => r.textContent).join(" | ")')}`);
      assert(!/Total/.test(fs.readFileSync(file, 'utf8')), 'the Total row went into the file');
      // The icon can be changed from the page; the next month starts from the card.
      assert(await clickUntil('document.querySelector(".note-icon")', '!!document.querySelector(".emoji-grid")', 'page icon'), 'icon picker did not open');
      await clickEval('[...document.querySelectorAll(".emoji-choice")].find(b => b.textContent === "🚀")', 'rocket');
      assert(await waitFor2(() => /^icon: 🚀$/m.test(fs.readFileSync(file, 'utf8')), 3000), 'icon not saved');
      const next = (() => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
      await sleep(500);
      await clickSel('.bud-nav-new');
      assert(await waitFor2(() => { const f = findNote(`Budget ${next}.md`); return f && new RegExp(`^month: ${next}$`, 'm').test(fs.readFileSync(f, 'utf8')) && !fs.readFileSync(f, 'utf8').includes('Coffee beans'); }, 3000), 'next month not started');
      assert(await waitFor(`document.querySelector(".note-title")?.textContent === "Budget ${next}"`, 3000), 'next month did not open');
      await clickEval('document.querySelector(".bud-nav-step")', 'previous month');
      assert(await waitFor(`document.querySelector(".note-title")?.textContent === "Budget ${month}"`, 3000), 'previous month did not open');
      // Copy them into the Templates folder, change one: it wins over the built-in.
      await press('P', ['meta']); await typeText('Copy built-in templates'); await enter();
      const tdir = path.join(vault, 'Templates');
      assert(await waitFor2(() => ['Daily note', 'Budget', 'Travel plan', 'Book notes'].every((n) => fs.existsSync(path.join(tdir, `${n}.md`))), 3000), `templates not copied: ${fs.existsSync(tdir) ? fs.readdirSync(tdir) : 'no folder'}`);
      assert(fs.readFileSync(path.join(tdir, 'Budget.md'), 'utf8').includes('{{date:YYYY-MM}}'), 'copied template is filled, should stay a template');
      fs.writeFileSync(path.join(tdir, 'Book notes.md'), '# {{title}}\n\nMine');
      await sleep(900);
      await clickSel('.side-notes .side-btn[aria-label="New note from template"]');
      assert(await waitFor('!!document.querySelector(".palette-new-from-template")', 2000), 'template list did not open again');
      const recipes = await js(`[...document.querySelectorAll('.palette-new-from-template .palette-item')].filter(e => e.querySelector('.palette-label')?.textContent === 'Book notes').map(e => e.textContent)`);
      assert(recipes.length === 1 && !recipes[0].includes('Built-in'), `Book notes should come from the vault once: ${JSON.stringify(recipes)}`);
      await typeText('Book notes'); await enter();
      assert(await waitFor('!!document.getElementById("tree-edit")', 2000), 'no name field for the book');
      await js(`(() => { const i = document.getElementById('tree-edit'); i.value = 'Dune'; return true; })()`);
      await enter();
      assert(await waitFor2(() => { const f = findNote('Dune.md'); return f && fs.readFileSync(f, 'utf8') === '# Dune\n\nMine'; }, 3000), 'the changed template was not used');
    });

    // 60. Found by hand on Windows: right after making a note (empty, so it
    //     opens being edited), clicking the sidebar the way a person does
    //     (holding the button for a moment) must still work — the row's ⋯ menu
    //     opens and a new folder can be named — and do so again a second time.
    await step(60, 'sidebar clicks work while a new empty note is being edited', async () => {
      await clickSel('#mode-notes');
      const row = (name) => `[...document.querySelectorAll('.tree-row')].find(r => r.querySelector('.tree-name')?.textContent === ${JSON.stringify(name)})`;
      for (const round of [1, 2]) {
        await humanClickEval(`document.querySelector('.side-notes .side-btn[aria-label="New note"]')`, 'New note');
        assert(await waitFor('!!document.getElementById("tree-edit")', 2000), `round ${round}: no name field for the note`);
        await js(`(() => { const i = document.getElementById('tree-edit'); i.value = 'Bos ${round}'; return true; })()`);
        await enter();
        assert(await waitFor('!!document.getElementById("block-editor")', 3000), `round ${round}: the new note is not being edited`);
        // the ⋯ of the new note's row
        await hoverClickEval(`${row(`Bos ${round}`)}`, 'row');
        await humanClickEval(`${row(`Bos ${round}`)}.querySelector('.menu-btn')`, 'row menu');
        assert(await waitFor('!!document.querySelector(".row-menu .menu-item")', 2000), `round ${round}: the ⋯ menu did not open while editing`);
        await press('Escape'); await sleep(200);
        // a new folder, named and kept
        await humanClickEval(`document.querySelector('.side-notes .side-btn[aria-label="New folder"]')`, 'New folder');
        assert(await waitFor('!!document.getElementById("tree-edit")', 2000), `round ${round}: no name field for the folder`);
        assert(await js('document.activeElement?.id') === 'tree-edit', `round ${round}: the folder name field lost focus to ${await js('document.activeElement?.id || document.activeElement?.className')}`);
        // A redraw while the name is half typed (an async refresh landing,
        // e.g. the new note's backlinks) keeps the text and the focus.
        await typeText('Klas');
        await js('window.__mufkaRender(); true');
        assert(await js('document.activeElement?.id') === 'tree-edit', `round ${round}: a redraw took the focus from the folder name to ${await js('document.activeElement?.id || document.activeElement?.className')}`);
        await typeText(`or ${round}`); await enter();
        assert(await waitFor(`!!(${row(`Klasor ${round}`)})`, 3000), `round ${round}: folder not made; rows ${await js(`[...document.querySelectorAll('.tree-row')].map(r => r.dataset.rel || r.className).join('|')`)}; edit ${await js('document.getElementById("tree-edit")?.value')}; active ${await js('document.activeElement?.id || document.activeElement?.className')}`);
      }
    });

    // 61–64. Tasks: boards of cards, each board a note in the format of
    //     Obsidian's Kanban plugin (lib/kanban.mjs, src/tasks.js).
    const tvault = await js('window.notes.vaultInfo().then(v => v.path)');
    const boardFile = path.join(tvault, 'Tasks', 'Sprint.md');
    const boardText = () => { try { return fs.readFileSync(boardFile, 'utf8'); } catch { return ''; } };
    const colCards = (i) => `[...document.querySelectorAll('.tk-col')[${i}].querySelectorAll('.tk-card-title')].map(n => n.textContent)`;
    await step(61, 'a new task board is a Kanban note with To do, In progress, Test and Done', async () => {
      await clickSel('#mode-tasks');
      assert(await waitFor('!!document.querySelector(".tasks")', 2000), 'Tasks did not open');
      await clickSel('.side-tasks .side-btn[aria-label="New board"]');
      assert(await waitFor('!!document.querySelector(".ask-input")', 2000), 'no name field for the board');
      await typeText('Sprint'); await enter();
      assert(await waitFor2(() => boardText().includes('kanban-plugin: board'), 3000), `board file not written: ${fs.existsSync(path.join(tvault, 'Tasks')) ? fs.readdirSync(path.join(tvault, 'Tasks')) : 'no Tasks folder'}`);
      assert(/## To do[\s\S]*## In progress[\s\S]*## Test[\s\S]*## Done\n\n\*\*Complete\*\*/.test(boardText()), `default columns wrong:\n${boardText()}`);
      assert(await waitFor('[...document.querySelectorAll(".tk-col-title")].map(n => n.textContent).join("|") === "To do|In progress|Test|Done"', 3000), 'board columns not shown');
      assert(await waitFor('document.querySelector(".board-row.selected")?.textContent.includes("Sprint")', 2000), 'board not in the sidebar');
    });
    await step(62, 'tasks are added with their type, priority and due date', async () => {
      // "Add a task" under a column: the same dialog, that column chosen.
      const addIn = async (title, setup = '') => {
        await clickSel('.tk-col .tk-add');
        assert(await waitFor('!!document.querySelector(".tk-modal") && document.activeElement?.classList.contains("tk-panel-title")', 2000), 'task dialog did not open with the title focused');
        assert(await js('document.querySelector(".tk-modal select").value') === '0', 'the column was not chosen');
        await typeText(title);
        if (setup) await js(`(() => { const m = document.querySelector('.tk-modal'); ${setup}; return true; })()`);
        await enter();
        assert(await waitFor('!document.querySelector(".tk-modal")', 2000), 'dialog did not close');
      };
      await addIn('Fix login', "const sel = m.querySelectorAll('select'); sel[1].value = 'bug'; sel[2].value = 'P1'; m.querySelector('input[type=date]').value = '2030-01-15'");
      assert(await waitFor2(() => boardText().includes('- [ ] Fix login #bug !P1 @{2030-01-15}'), 3000), `task not saved:\n${boardText()}`);
      await addIn('Write docs');
      assert(await waitFor2(() => boardText().includes('- [ ] Write docs'), 3000), 'second task not saved');
      assert(await waitFor(`${colCards(0)}.join("|") === "Fix login|Write docs"`, 2000), `tasks not shown: ${await js(colCards(0))}`);
      assert(await js('!!document.querySelector(".tk-card .tk-type.bug") && document.querySelector(".tk-card .tk-prio")?.textContent === "P1"'), 'type or priority not shown on the card');
      // "New task": every field in one dialog.
      await clickSel('.tk-new');
      assert(await waitFor('!!document.querySelector(".tk-modal") && document.activeElement?.classList.contains("tk-panel-title")', 2000), 'New task dialog did not open with the title focused');
      await typeText('Release notes');
      await js(`(() => { const m = document.querySelector('.tk-modal'); const sel = m.querySelectorAll('select'); sel[0].value = '2'; sel[1].value = 'chore'; sel[2].value = 'P3'; m.querySelector('input[type=date]').value = '2030-02-01'; return true; })()`);
      await clickEval(`[...document.querySelectorAll('.tk-modal .btn')].find(b => b.textContent === 'Add task')`, 'Add task');
      assert(await waitFor2(() => /## Test\n\n- \[ \] Release notes #chore !P3 @\{2030-02-01\}/.test(boardText()), 3000), `new task not saved in Test:\n${boardText()}`);
      assert(await waitFor('!document.querySelector(".tk-modal")', 2000), 'dialog did not close');
    });
    await step(63, 'tasks move by keyboard and by dragging; ⌘Z undoes', async () => {
      await js('document.querySelector(".tk-card").focus(); true');
      await press('Right', ['alt']);
      assert(await waitFor(`${colCards(1)}.join("|") === "Fix login"`, 2000), 'card did not move to In progress');
      assert(await waitFor2(() => /## In progress\n\n- \[ \] Fix login/.test(boardText()), 3000), `move not saved:\n${boardText()}`);
      await js('document.activeElement.blur(); true');
      await cmdZ();
      assert(await waitFor(`${colCards(0)}[0] === "Fix login"`, 2000), 'undo did not bring the card back');
      assert(await waitFor2(() => /## To do\n\n- \[ \] Fix login/.test(boardText()), 3000), 'undo not saved');
      // Drag "Write docs" into Done: it becomes checked.
      await js(`(() => {
        const card = [...document.querySelectorAll('.tk-card')].find(c => c.textContent.includes('Write docs'));
        const list = document.querySelectorAll('.tk-cards')[3];
        const dt = new DataTransfer();
        card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
        const r = list.getBoundingClientRect();
        const at = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: r.bottom - 4 };
        list.dispatchEvent(new DragEvent('dragover', at));
        list.dispatchEvent(new DragEvent('drop', at));
        card.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
        return true;
      })()`);
      assert(await waitFor(`${colCards(3)}.join("|") === "Write docs"`, 2000), `drag did not move the card: ${await js(colCards(3))}`);
      assert(await waitFor2(() => /\*\*Complete\*\*\n- \[x\] Write docs/.test(boardText()), 3000), `card in Done not checked:\n${boardText()}`);
    });
    await step(64, 'a task is edited in its panel; default columns keep their names; the board follows the file', async () => {
      await clickEval(`[...document.querySelectorAll('.tk-card')].find(c => c.textContent.includes('Fix login'))`, 'Fix login card');
      assert(await waitFor('!!document.querySelector(".tk-panel")', 2000), 'card panel did not open');
      await js(`(() => {
        const p = document.querySelector('.tk-panel');
        const sel = p.querySelectorAll('select');
        sel[1].value = 'feature'; sel[2].value = 'P2';
        p.querySelector('input[type=url]').value = 'https://github.com/a/b/issues/3';
        const body = p.querySelector('.tk-panel-body'); body.value = 'Steps\\n- [x] one\\n- [ ] two';
        return true;
      })()`);
      await press('Return', ['meta']);
      assert(await waitFor2(() => boardText().includes('- [ ] Fix login #feature !P2 @{2030-01-15} https://github.com/a/b/issues/3\n\tSteps\n\t- [x] one\n\t- [ ] two'), 3000), `card edit not saved:\n${boardText()}`);
      assert(await waitFor('[...document.querySelectorAll(".tk-card")].some(c => c.querySelector(".tk-url")?.textContent === "#3" && c.querySelector(".tk-subs")?.textContent === "1/2")', 2000), 'link or sub-task count not shown');
      // Default columns keep their names; a column of your own goes before
      // Done and is named right away.
      await js(`document.querySelectorAll('.tk-col-title')[2].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); true`);
      await sleep(300);
      assert(!(await js('!!document.querySelector(".tk-col-rename")')), 'a default column could be renamed');
      await clickSel('.tk-add-col');
      assert(await waitFor('document.activeElement?.classList.contains("tk-col-rename")', 2000), 'new column name field not focused');
      await typeText('QA'); await enter();
      assert(await waitFor2(() => /## Test[\s\S]*## QA\n[\s\S]*## Done/.test(boardText()), 3000), `new column not saved before Done:\n${boardText()}`);
      // A finished task looks finished: Done's tasks carry a tick.
      assert(await js(`[...document.querySelectorAll('.tk-col')[4].querySelectorAll('.tk-card')].every(c => c.classList.contains('done') && c.querySelector('.tk-done-mark'))`), 'tasks in Done do not look done');
      // Another app (Obsidian) changes the file: the board shows it. (Changes
      // right after Mufka's own write are taken as its own: wait that out.)
      await sleep(1700);
      fs.writeFileSync(boardFile, boardText().replace('## QA\n\n', '## QA\n\n- [ ] From Obsidian #chore\n'));
      assert(await waitFor(`${colCards(3)}.includes("From Obsidian")`, 4000), `outside change not shown: ${await js(colCards(3))}`);
      // The board note opened from the notes tree opens as the board.
      await clickSel('#mode-notes');
      await js(`window.__open = [...document.querySelectorAll('.tree-row')].find(r => r.querySelector('.tree-name')?.textContent === 'Tasks'); window.__open?.click(); true`);
      await sleep(300);
      await clickEval(`[...document.querySelectorAll('.tree-row')].find(r => r.querySelector('.tree-name')?.textContent === 'Sprint')`, 'Sprint row');
      assert(await waitFor('document.getElementById("mode-tasks").getAttribute("aria-pressed") === "true" && !!document.querySelector(".tk-col")', 3000), 'board note did not open as a board');
    });

    // 64b. A board task with a due date shows on its day in the Planner and on
    //      Home; clicking it opens its board with the task's dialog.
    await step('64b', 'a task due today shows in the Planner and on Home, opens its board, and is ticked from Home', async () => {
      await sleep(1700); // past Mufka's own last write of the board
      fs.writeFileSync(boardFile, boardText().replace('## To do\n\n', `## To do\n\n- [ ] Due in the planner @{${todayK}} !P1\n`));
      await clickSel('#mode-planner');
      const chip = `[...document.querySelectorAll('.pl-board-task')].find(c => c.textContent === 'Due in the planner')`;
      assert(await waitFor(`!!(${chip}) && ${chip}.closest('[data-drop-day]')?.dataset.dropDay === ${JSON.stringify(todayK)} && ${chip}.classList.contains('p1')`, 4000), `task not on today: ${await js('[...document.querySelectorAll(".pl-board-task")].map(c => c.textContent).join("|")')}`);
      // Dragged to 15:00 it becomes a plan for that hour; the task stays.
      await js(`(() => {
        const c = ${chip}; const col = document.querySelector('.pl-col[data-drop-day="${todayK}"]');
        document.querySelector('.pl-scroll').scrollTop = 12 * 48;
        const dt = new DataTransfer(); const b = col.getBoundingClientRect();
        const at = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: b.x + b.width / 2, clientY: b.top + 15 * 48 + 6 };
        c.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
        col.dispatchEvent(new DragEvent('dragover', at)); col.dispatchEvent(new DragEvent('drop', at));
        c.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
        return true; })()`);
      const plans = () => { try { return JSON.parse(fs.readFileSync(path.join(tmp, 'planlar.json'), 'utf8')).items; } catch { return []; } };
      assert(await waitFor2(() => plans().some((p) => p.title === 'Due in the planner' && p.key === todayK && p.time === '15:00' && p.endTime === '16:00'), 3000), `no plan at 15:00: ${JSON.stringify(plans().filter((p) => p.title.includes('planner')))}`);
      assert(boardText().includes('Due in the planner'), 'the task left its board');
      await clickEval(chip, 'planner task');
      assert(await waitFor('document.getElementById("mode-tasks").getAttribute("aria-pressed") === "true"', 3000), 'the board did not open');
      assert(await waitFor('document.querySelector(".tk-panel[role=dialog] .tk-panel-title")?.value === "Due in the planner"', 3000), 'the task dialog did not open');
      await press('Escape'); await sleep(200);
      // Home lists it under Tasks, with its board; a click opens it too.
      await press('T', ['meta']);
      const row = `[...document.querySelectorAll('.home-task')].find(r => r.querySelector('.plan-title')?.textContent === 'Due in the planner')`;
      assert(await waitFor(`!!(${row}) && ${row}.textContent.includes('Sprint') && ${row}.closest('.section')?.querySelector('.section-title')?.textContent === 'Tasks'`, 3000), `not on Home: ${await js('[...document.querySelectorAll(".home-task")].map(r => r.textContent).join("|")')}`);
      await clickEval(`${row}.querySelector('.agenda-open')`, 'Home task');
      assert(await waitFor('document.querySelector(".tk-panel[role=dialog] .tk-panel-title")?.value === "Due in the planner"', 3000), 'Home did not open the task');
      await press('Escape'); await sleep(200);
      // Its box marks it done: it goes to the top of Done and stays on Home,
      // ticked and struck through; ticking again puts it back; so does ⌘Z.
      await press('T', ['meta']);
      assert(await waitFor(`!!(${row})`, 3000), 'not back on Home');
      const inDone = () => /## Done[\s\S]*- \[x\] Due in the planner/.test(boardText());
      const isOpen = () => !/## Done[\s\S]*Due in the planner/.test(boardText()) && boardText().includes('- [ ] Due in the planner');
      await clickEval(`${row}.querySelector('.home-task-box')`, 'Home task box');
      assert(await waitFor(`${row}?.classList.contains('done') && ${row}.querySelector('.home-task-box').getAttribute('aria-checked') === 'true'`, 3000), 'not shown done on Home');
      assert(await waitFor2(inDone, 3000), `not in Done:\n${boardText()}`);
      await clickEval(`${row}.querySelector('.home-task-box')`, 'Home task box again');
      assert(await waitFor(`!!(${row}) && !${row}.classList.contains('done')`, 3000), 'not open again on Home');
      assert(await waitFor2(isOpen, 3000), `not back on its column:\n${boardText()}`);
      await clickEval(`${row}.querySelector('.home-task-box')`, 'Home task box, third time');
      assert(await waitFor2(inDone, 3000), `not in Done again:\n${boardText()}`);
      await press('z', ['meta']);
      assert(await waitFor(`!!(${row}) && !${row}.classList.contains('done')`, 3000), 'undo did not open it again on Home');
      assert(await waitFor2(isOpen, 3000), `undo did not restore the board:\n${boardText()}`);
    });

    // 64c. A Wispr Flow meeting note's open to-dos can go on a board: the New
    //      task dialog comes filled in, linking back to the meeting; once the
    //      board has it, the note says so.
    await step('64c', 'a meeting to-do goes on a board through the New task dialog', async () => {
      fs.mkdirSync(path.join(tvault, 'Meetings'), { recursive: true });
      fs.writeFileSync(path.join(tvault, 'Meetings', 'Kickoff.md'), '---\nsource: Wispr Flow\nwispr_meeting: "k1"\n---\n\n# Kickoff\n\n## Tasks\n\n- [ ] Send the deck\n- [x] Book the room\n');
      await sleep(900);
      await press('O', ['meta']); await typeText('Kickoff'); await enter();
      const btn = `[...document.querySelectorAll('.meeting-task-btn')].find(b => b.closest('li').textContent.includes('Send the deck'))`;
      assert(await waitFor(`!!(${btn}) && document.querySelectorAll('.meeting-task-btn').length === 1`, 3000), `no Add to board button: ${await js('document.querySelector(".note-body")?.textContent')}`);
      await clickEval(btn, 'Add to board');
      assert(await waitFor('document.querySelector(".tk-panel[role=dialog] .tk-panel-title")?.value === "Send the deck" && document.querySelector(".tk-panel-body")?.value === "From [[Kickoff]]"', 3000), 'the New task dialog is not filled in');
      await clickEval(`[...document.querySelectorAll('.tk-panel button')].find(b => b.textContent === 'Add task')`, 'Add task');
      assert(await waitFor2(() => boardText().includes('- [ ] Send the deck\n  From [[Kickoff]]') || /Send the deck[\s\S]*From \[\[Kickoff\]\]/.test(boardText()), 3000), `task not saved:\n${boardText()}`);
      await press('O', ['meta']); await typeText('Kickoff'); await enter();
      assert(await waitFor(`[...document.querySelectorAll('.meeting-task-on')].some(s => s.textContent === 'On Sprint') && !document.querySelector('.meeting-task-btn')`, 3000), 'the note does not say the board has it');
    });

    // 64d. Done's tasks go to the board's archive (Obsidian Kanban's
    //      "## Archive"); the archive lists them and one comes back to Done.
    await step('64d', 'done tasks are archived and one is restored', async () => {
      await sleep(1700); // past Mufka's own last write of the board
      fs.writeFileSync(boardFile, boardText().replace('**Complete**\n', '**Complete**\n- [ ] Old finished one\n'));
      await clickEval(`[...document.querySelectorAll('.board-row')].find(r => r.querySelector('.board-name')?.textContent === 'Sprint')`, 'Sprint board');
      assert(await waitFor(`[...document.querySelectorAll('.tk-card-title')].some(t => t.textContent === 'Old finished one')`, 4000), 'the done task is not on the board');
      const doneCol = `[...document.querySelectorAll('.tk-col')].find(c => c.classList.contains('complete'))`;
      await clickEval(`${doneCol}.querySelector('[data-menu-anchor]')`, 'Done column menu');
      await clickEval(`[...document.querySelectorAll('.menu-item')].find(m => m.textContent.startsWith('Archive done tasks'))`, 'Archive done tasks');
      assert(await waitFor2(() => /\*\*\*\n\n## Archive\n\n[\s\S]*- \[x\] Old finished one/.test(boardText()), 3000), `not archived in the file:\n${boardText()}`);
      assert(await waitFor(`!${doneCol}.querySelector('.tk-card') && /archived/.test(document.querySelector('.tk-archived')?.textContent || '')`, 3000), 'Done still has tasks, or no archived link');
      await clickSel('.tk-archived');
      const row = `[...document.querySelectorAll('.tk-archive-row')].find(r => r.textContent.includes('Old finished one'))`;
      assert(await waitFor(`!!(${row})`, 2000), 'the archive does not list it');
      await clickEval(`${row}.querySelector('button')`, 'Restore');
      assert(await waitFor(`[...${doneCol}.querySelectorAll('.tk-card-title')].some(t => t.textContent === 'Old finished one')`, 3000), 'not back in Done');
      assert(await waitFor2(() => !/- \[x\] Old finished one\n[\s\S]*%% kanban:settings/.test(boardText().split('## Archive')[1] || ''), 3000), `still in the archive:\n${boardText()}`);
    });

    // 64e. Template pages: a book stands on the Reading shelf with its cover
    //      image and moves to Reading from its note (the start day written);
    //      a trip counts down; a meeting shows who and its action items; the
    //      tree shows a note's page icon.
    await step('64e', 'books on the shelf with covers, a trip, a meeting, page icons', async () => {
      const dir = path.join(tvault, 'Library');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'dune.png'), makePng(20, 30));
      fs.writeFileSync(path.join(dir, 'Dune.md'), '---\ntype: book\nicon: 📚\nauthor: Frank Herbert\nstatus: To read\nimage: "[[dune.png]]"\n---\n## In one sentence\n');
      fs.writeFileSync(path.join(dir, 'Shelf.md'), '---\ntype: book-shelf\n---\n```books\nfolder: Library\n```\n');
      const d = new Date(); d.setDate(d.getDate() + 10);
      const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      fs.writeFileSync(path.join(dir, 'Rome.md'), `---\ntype: trip\ndestination: Rome\nfrom: ${from}\n---\n## Packing list\n- [x] Passport\n- [ ] Adapter\n`);
      fs.writeFileSync(path.join(dir, 'Standup.md'), '---\ntype: meeting\ndate: 2026-11-16\ntime: 09:30\nattendees: [Ayse, Can]\n---\n## Action items\n- [x] One\n- [ ] Two\n');
      await sleep(900);
      await press('O', ['meta']); await typeText('Shelf'); await enter();
      const dune = `[...document.querySelectorAll('.book-shelf[data-stage="To read"] .book-item')].find(b => b.textContent.includes('Dune'))`;
      assert(await waitFor(`!!(${dune}) && !!${dune}.querySelector('img[src]')`, 4000), `Dune not on To read with its cover: ${await js('[...document.querySelectorAll(".book-shelf")].map(s => s.dataset.stage + ":" + s.textContent).join(" | ")')}`);
      await clickEval(dune, 'Dune on the shelf');
      assert(await waitFor('!!document.querySelector(".book-head img") && document.querySelector(".note-title")?.textContent === "Dune"', 3000), 'the book note has no cover head');
      await clickEval(`[...document.querySelectorAll('.book-strip .job-step')].find(s => s.textContent === 'Reading')`, 'Reading');
      assert(await waitFor2(() => { const t = fs.readFileSync(path.join(dir, 'Dune.md'), 'utf8'); return /status: Reading/.test(t) && new RegExp(`started: ${todayK}`).test(t); }, 3000), `not moved to Reading:\n${fs.readFileSync(path.join(dir, 'Dune.md'), 'utf8')}`);
      assert(await js(`[...document.querySelectorAll('.tree-row')].some(r => r.querySelector('.tree-name')?.textContent === 'Dune' && r.querySelector('.tree-emoji')?.textContent === '📚')`), `the tree does not show the page icon: ${await js(`JSON.stringify([...document.querySelectorAll('.tree-row')].map(r => r.textContent).filter(t => /Dune|Library|Shelf/.test(t)))`)} sidebar=${await js('document.getElementById("mode-notes")?.getAttribute("aria-pressed")')}`);
      await press('O', ['meta']); await typeText('Rome'); await enter();
      assert(await waitFor('/10 days to go/.test(document.querySelector(".trip-strip")?.textContent || "") && /1\\/2/.test(document.querySelector(".trip-strip")?.textContent || "")', 3000), `trip strip: ${await js('document.querySelector(".trip-strip")?.textContent')}`);
      await press('O', ['meta']); await typeText('Standup'); await enter();
      assert(await waitFor('/Ayse, Can/.test(document.querySelector(".meeting-strip")?.textContent || "") && /1\\/2/.test(document.querySelector(".meeting-strip")?.textContent || "")', 3000), `meeting strip: ${await js('document.querySelector(".meeting-strip")?.textContent')}`);
      assert(await js('document.querySelectorAll(".meeting-task-btn").length === 1'), 'the open action item has no Add to board');
    });

    // 64e4. Tasks queries: a ```tasks block lists open tasks from across the
    //       vault by due date (late ones together); ticking one ticks it in
    //       its note with the ✅ date; its note opens from the row.
    await step('64e4', 'tasks queries: grouped by due, tick in place, open the note', async () => {
      const dir = path.join(tvault, 'TQ');
      fs.mkdirSync(dir, { recursive: true });
      const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
      fs.writeFileSync(path.join(dir, 'Work.md'), `# Clients\n- [ ] Send the invoice ⏫ 📅 ${d(-3)}\n- [ ] Write the notes 🔼 📅 ${d(0)}\n- [x] Old one ✅ ${d(-9)}\n`);
      fs.writeFileSync(path.join(dir, 'Home.md'), `- [ ] Call the bank 🔽 📅 ${d(3)}\n- [ ] Someday\n`);
      fs.writeFileSync(path.join(dir, 'This week.md'), '# This week\n\n```tasks\nnot done\nhas due date\npath includes TQ/\ngroup by due\n```\n\n```tasks\ngroup by wibble\n```\n');
      await sleep(900);
      await press('O', ['meta']); await typeText('This week'); await enter();
      const groups = '[...document.querySelectorAll(".note-pane .tq .tq-group")].map(g => g.firstChild.textContent + ":" + g.querySelector(".tq-group-count").textContent).join("|")';
      assert(await waitFor(`/^Overdue:1\\|Today · .*:1\\|.*:1$/.test(${groups})`, 4000), `groups: ${await js(groups)}`);
      assert(await js('/3 tasks/.test(document.querySelector(".note-pane .tq-head")?.textContent || "") && /could not read "group by wibble"/.test(document.querySelector(".note-pane .tq-error")?.textContent || "")'), `head / error: ${await js('[...document.querySelectorAll(".note-pane .tq")].map(x => x.textContent).join(" || ")')}`);
      if (process.env.MUFKA_E2E_SHOTS) fs.writeFileSync(path.join(process.env.MUFKA_E2E_SHOTS, `tasks-query-${process.env.MUFKA_E2E_THEME || 'system'}.png`), (await wc.capturePage()).toPNG());
      const row = (txt) => `[...document.querySelectorAll(".note-pane .tq-task")].find(li => li.textContent.includes(${JSON.stringify(txt)}))`;
      await clickEval(`${row('Send the invoice')}.querySelector(".tq-check")`, 'tick the invoice');
      assert(await waitFor2(() => fs.readFileSync(path.join(dir, 'Work.md'), 'utf8').includes(`- [x] Send the invoice ⏫ 📅 ${d(-3)} ✅ ${d(0)}`), 3000), `not ticked:\n${fs.readFileSync(path.join(dir, 'Work.md'), 'utf8')}`);
      assert(await waitFor(`!(${row('Send the invoice')}) && /2 tasks/.test(document.querySelector(".note-pane .tq-head")?.textContent || "")`, 3000), `still listed: ${await js('document.querySelector(".note-pane .tq")?.textContent')}`);
      await clickEval(`${row('Call the bank')}.querySelector(".tq-src")`, 'Home link');
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "Home"', 3000), 'the task\'s note did not open');
    });

    // 64f. Right-click menus: a note's path is copied, it is duplicated and
    //      moved; a drawing in the sidebar is renamed (keeping .excalidraw)
    //      and deleted after asking.
    await step('64f', 'right-click: copy path, duplicate, move; rename and delete a drawing', async () => {
      const dir = path.join(tvault, 'Menus');
      fs.mkdirSync(path.join(dir, 'Inner'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'Alpha.md'), 'alpha');
      fs.writeFileSync(path.join(dir, 'Inner', 'keep.md'), 'k');
      fs.mkdirSync(path.join(tvault, 'Excalidraw'), { recursive: true });
      fs.writeFileSync(path.join(tvault, 'Excalidraw', 'Board sketch.excalidraw.md'), '---\nexcalidraw-plugin: parsed\n---\n');
      await sleep(900);
      await clickSel('#mode-notes'); await sleep(300);
      const row = (n) => `[...document.querySelectorAll('.tree-row')].find(r => r.querySelector('.tree-name')?.textContent === ${JSON.stringify(n)})`;
      if (!(await js(`!!(${row('Alpha')})`))) await clickEval(row('Menus'), 'Menus folder');
      assert(await waitFor(`!!(${row('Alpha')})`, 3000), 'Alpha not in the tree');
      const right = (el) => js(`(() => { const r = ${el}; r.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect(); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.x + 40, clientY: b.y + b.height / 2 })); return true; })()`);
      const pick = (label) => clickEval(`[...document.querySelectorAll('.row-menu .menu-item')].find(m => m.textContent === ${JSON.stringify(label)})`, label);
      await right(row('Alpha'));
      assert(await waitFor('[...document.querySelectorAll(".row-menu .menu-item")].map(m => m.textContent).includes("Copy full path") && !!document.querySelector(".row-menu .menu-sep")', 2000), 'no right-click menu on a note');
      await pick('Copy path');
      let clip = ''; for (let i = 0; i < 30 && clip !== 'Menus/Alpha.md'; i++) { clip = await clipboard.readText(); await sleep(100); }
      assert(clip === 'Menus/Alpha.md', `copied ${clip}`);
      await right(row('Alpha')); await pick('Duplicate');
      assert(await waitFor2(() => fs.existsSync(path.join(dir, 'Alpha 2.md')) && fs.readFileSync(path.join(dir, 'Alpha 2.md'), 'utf8') === 'alpha', 3000), 'not duplicated');
      await right(row('Alpha')); await pick('Move to…');
      assert(await waitFor('!!document.querySelector(".palette-move")', 2000), 'no folder list');
      await typeText('Menus/Inner'); await enter();
      assert(await waitFor2(() => fs.existsSync(path.join(dir, 'Inner', 'Alpha.md')) && !fs.existsSync(path.join(dir, 'Alpha.md')), 3000), 'not moved');
      const draw = (n) => `[...document.querySelectorAll('.board-row')].find(r => r.querySelector('.board-name')?.textContent === ${JSON.stringify(n)})`;
      assert(await waitFor(`!!(${draw('Board sketch')})`, 3000), 'drawing not in the sidebar');
      await right(draw('Board sketch')); await pick('Rename');
      assert(await waitFor('!!document.querySelector(".ask-input")', 2000), 'no rename field');
      await js(`(() => { const i = document.querySelector('.ask-input'); i.value = 'Wall sketch'; return true; })()`); await enter();
      assert(await waitFor2(() => fs.existsSync(path.join(tvault, 'Excalidraw', 'Wall sketch.excalidraw.md')), 3000), 'drawing not renamed with .excalidraw kept');
      assert(await waitFor(`!!(${draw('Wall sketch')})`, 3000), 'renamed drawing not in the sidebar');
      await right(draw('Wall sketch')); await pick('Delete');
      assert(await waitFor('/Delete Wall sketch/.test(document.querySelector(".plan-dialog")?.textContent || "")', 2000), 'delete was not asked');
      await clickEval(`[...document.querySelectorAll('.plan-dialog button')].find(b => b.textContent === 'Delete')`, 'Delete');
      assert(await waitFor2(() => !fs.existsSync(path.join(tvault, 'Excalidraw', 'Wall sketch.excalidraw.md')), 3000), 'drawing not deleted');
    });

    // 64g. Images in drawings are files of their own, as in Obsidian's
    //      Excalidraw plugin: one listed under "## Embedded Files" shows (in a
    //      note's ![[embed]] too); an image kept inside an older drawing moves
    //      out to a file when the drawing is next saved.
    await step('64g', 'drawing images: Embedded Files read; inline images moved out on save', async () => {
      const LZ = require('lz-string');
      const exc = path.join(tvault, 'Excalidraw');
      fs.mkdirSync(exc, { recursive: true });
      fs.mkdirSync(path.join(tvault, 'Attachments'), { recursive: true });
      fs.writeFileSync(path.join(tvault, 'Attachments', 'shot.png'), makePng(40, 30));
      const imgEl = (id, fileId) => ({ id, type: 'image', x: 0, y: 0, width: 160, height: 120, angle: 0, strokeColor: 'transparent', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 1, strokeStyle: 'solid', roughness: 0, opacity: 100, groupIds: [], frameId: null, roundness: null, seed: 1, version: 1, versionNonce: 1, isDeleted: false, boundElements: null, updated: 1, link: null, locked: false, status: 'saved', fileId, scale: [1, 1] });
      const note = (scene, extra = '') => `---\nexcalidraw-plugin: parsed\n---\n# Excalidraw Data\n\n## Text Elements\n${extra}%%\n## Drawing\n\`\`\`compressed-json\n${LZ.compressToBase64(JSON.stringify(scene))}\n\`\`\`\n%%\n`;
      fs.writeFileSync(path.join(exc, 'Linked.excalidraw.md'), note({ type: 'excalidraw', version: 2, elements: [imgEl('e1', 'aaa111')], appState: {}, files: {} }, '## Embedded Files\naaa111: [[shot.png]]\n\n'));
      const inline = `data:image/png;base64,${makePng(30, 20).toString('base64')}`;
      const oldFile = path.join(exc, 'Inline.excalidraw.md');
      fs.writeFileSync(oldFile, note({ type: 'excalidraw', version: 2, elements: [imgEl('e2', 'bbb222')], appState: {}, files: { bbb222: { id: 'bbb222', mimeType: 'image/png', dataURL: inline, created: 1 } } }));
      fs.writeFileSync(path.join(tvault, 'Shows drawing.md'), '![[Linked.excalidraw]]\n');
      await sleep(900);
      await press('O', ['meta']); await typeText('Shows drawing'); await enter();
      assert(await waitFor('decodeURIComponent(document.querySelector(".note-body .draw-embed-img")?.src || "").includes("data:image/png;base64")', 8000), 'the embedded drawing does not show its image file');
      // The older drawing: draw a rectangle, and the save moves its image out.
      await clickSel('#mode-draw');
      await clickEval(`[...document.querySelectorAll('.board-row')].find(r => r.querySelector('.board-name')?.textContent === 'Inline')`, 'Inline drawing');
      assert(await waitFor('!!document.querySelector(".draw-host canvas")', 8000), 'the editor did not open');
      await sleep(800);
      const at = await js(`(() => { const c = [...document.querySelectorAll('.draw-host canvas')].pop(); const b = c.getBoundingClientRect(); return { x: Math.round(b.x + b.width * 0.7), y: Math.round(b.y + b.height * 0.6) }; })()`);
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'r' }); wc.sendInputEvent({ type: 'char', keyCode: 'r' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'r' }); await sleep(200);
      wc.sendInputEvent({ type: 'mouseDown', x: at.x, y: at.y, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 8; i++) { wc.sendInputEvent({ type: 'mouseMove', x: at.x + i * 12, y: at.y + i * 8, button: 'left' }); await sleep(30); }
      wc.sendInputEvent({ type: 'mouseUp', x: at.x + 96, y: at.y + 64, button: 'left', clickCount: 1 });
      const moved = () => { const t = fs.readFileSync(oldFile, 'utf8'); const m = /^bbb222: \[\[(Pasted Image \d{14}_0\.png)\]\]$/m.exec(t); const json = JSON.parse(LZ.decompressFromBase64(/```compressed-json\n([\s\S]*?)\n```/.exec(t)[1].replace(/\s+/g, '')));
        return m && fs.existsSync(path.join(tvault, 'Attachments', m[1])) && !Object.keys(json.files).length ? m[1] : null; };
      assert(await waitFor2(() => moved(), 5000), `image not moved out:\n${fs.readFileSync(oldFile, 'utf8').slice(0, 400)}`);
      await press('Escape');
    });

    // 64h. Dictation with Handy (a stand-in that logs what Mufka asks of it):
    //      the microphone in a note starts Handy hidden when it is not running,
    //      then toggles its recording; the caret stays in the note; ⇧⌘D stops
    //      it; Settings → Voice says Handy is installed.
    await step('64h', 'dictate with Handy: start, the caret stays in the note, stop', async () => {
      if (process.platform === 'win32') return; // the stand-in is a shell script (pgrep finds it)
      const handy = path.join(tmp, 'Handy');
      const log = path.join(tmp, 'handy.log');
      fs.writeFileSync(handy, `#!/bin/sh\necho "$@" >> "${log}"\nif [ "$1" = "--start-hidden" ]; then i=0; while [ $i -lt 30 ]; do sleep 1; i=$((i+1)); done; fi\n`, { mode: 0o755 });
      process.env.MUFKA_HANDY_PATH = handy;
      const lines = () => { try { return fs.readFileSync(log, 'utf8').trim().split('\n'); } catch { return []; } };
      fs.writeFileSync(path.join(tvault, 'Dictation.md'), '# Dictation\n\nFirst line\n');
      await sleep(900);
      BrowserWindow.getAllWindows()[0].emit('focus'); // Handy found when the window gets the focus
      await press('O', ['meta']); await typeText('Dictation'); await enter();
      assert(await waitFor('!!document.querySelector("#pane-actions .dictate-btn")', 4000), 'no microphone button');
      await clickSel('#pane-actions .dictate-btn');
      assert(await waitFor('document.activeElement?.id === "block-editor"', 2000), `the caret is not in the note: ${await js('document.activeElement?.id || document.activeElement?.className')}`);
      assert(await waitFor2(() => lines().join('|') === '--start-hidden|--toggle-transcription', 6000), `asked Handy: ${lines().join('|')}`);
      assert(await waitFor('document.querySelector("#pane-actions .dictate-btn.on .dictate-time")?.textContent.startsWith("0:")', 3000), 'not shown as listening');
      await press('D', ['meta', 'shift']);
      assert(await waitFor2(() => lines().join('|') === '--start-hidden|--toggle-transcription|--toggle-transcription', 4000), `stop sent: ${lines().join('|')}`);
      assert(await waitFor('!document.querySelector("#pane-actions .dictate-btn.on")', 2000), 'still shown as listening');
      await press(',', ['meta']);
      assert(await waitFor('/Installed/.test(document.querySelector(\'[data-conn="handy"] .conn-side\')?.textContent || "")', 3000), 'Settings does not say Handy is installed');
      await press('Escape');
      require('child_process').spawnSync('pkill', ['-f', handy]);
      delete process.env.MUFKA_HANDY_PATH;
      await press('Escape');
    });

    // 64i. A new note from an audio file: decoded to the 16 kHz mono WAV that
    //      Handy reads (a stand-in answers here as Handy's --json does), the
    //      text becomes a note, the recording is kept and plays in it.
    await step('64i', 'new note from an audio file: text from Handy, the recording kept and playable', async () => {
      if (process.platform === 'win32') return; // the stand-in is a shell script
      const handy = path.join(tmp, 'Handy');
      const log = path.join(tmp, 'handy2.log');
      fs.writeFileSync(handy, `#!/bin/sh\necho "$@" >> "${log}"\nif [ "$1" = "--transcribe-file" ]; then head -c 4 "$2" >> "${log}"; echo '{"audio_secs":0.5,"text":"Call the bank on Monday."}'; fi\n`, { mode: 0o755 });
      process.env.MUFKA_HANDY_PATH = handy;
      BrowserWindow.getAllWindows()[0].emit('focus');
      // Half a second of a 440 Hz tone, as a 44.1 kHz WAV (any audio the page can decode).
      const rate = 44100; const n = rate / 2; const wav = Buffer.alloc(44 + n * 2);
      wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
      for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), 44 + i * 2);
      await sleep(400);
      await press('P', ['meta']); await typeText('New note from audio'); await enter();
      assert(await waitFor('!!document.querySelector(".voice-dialog input[type=file]")', 3000), 'no New note from audio dialog');
      await js(`(() => { const bin = Uint8Array.from(atob(${JSON.stringify(wav.toString('base64'))}), c => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([bin], 'Bank memo.wav', { type: 'audio/wav' })); const p = document.querySelector('.voice-dialog input[type=file]'); p.files = dt.files; p.dispatchEvent(new Event('change')); return true; })()`);
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "Bank memo"', 8000), `no voice note: ${await js('document.querySelector(".voice-status")?.textContent')}`);
      const note = () => { const f = fs.readdirSync(tvault, { recursive: true }).find((p) => String(p).endsWith('Bank memo.md')); return f ? fs.readFileSync(path.join(tvault, f), 'utf8') : ''; };
      assert(/type: voice-note[\s\S]*!\[\[Bank memo\.wav\]\]\n\nCall the bank on Monday\./.test(note()), `note text:\n${note()}`);
      assert(/--transcribe-file .*\.wav --json\nRIFF/.test(fs.readFileSync(log, 'utf8')), `asked Handy: ${fs.readFileSync(log, 'utf8')}`);
      assert(await waitFor('!!document.querySelector(".note-body audio.att-audio")', 3000), 'the recording does not play in the note');
      delete process.env.MUFKA_HANDY_PATH;
    });

    // 64j. A meeting to-do that names a day gets "Plan <day>": one click puts
    //      it in the Planner on that day (counted from the meeting's date).
    await step('64j', 'a meeting to-do that names a day goes in the Planner', async () => {
      fs.writeFileSync(path.join(tvault, 'Meetings', 'Bank call.md'), '---\ntype: meeting\ndate: 2026-11-16\n---\n\n## Action items\n\n- [ ] Call the bank tomorrow at 15:00\n- [ ] Review the budget\n');
      await sleep(900);
      await press('O', ['meta']); await typeText('Bank call'); await enter();
      const btn = `[...document.querySelectorAll('.meeting-task-btn')].find(b => b.textContent.startsWith('Plan '))`;
      assert(await waitFor(`(${btn})?.textContent === 'Plan Tue 17 Nov · 15:00' && [...document.querySelectorAll('.meeting-task-btn')].filter(b => b.textContent.startsWith('Plan ')).length === 1`, 3000), `no Plan button: ${await js('[...document.querySelectorAll(".meeting-task-btn")].map(b => b.textContent).join("|")')}`);
      await clickEval(btn, 'Plan');
      assert(await waitFor(`[...document.querySelectorAll('.meeting-task-on')].some(s => s.textContent === 'In Planner · Tue 17 Nov · 15:00')`, 3000), 'the note does not say the Planner has it');
      const plans = () => { try { return JSON.parse(fs.readFileSync(path.join(tmp, 'planlar.json'), 'utf8')).items || []; } catch { return []; } };
      assert(await waitFor2(() => plans().some((p) => p.key === '2026-11-17' && p.time === '15:00' && p.title === 'Call the bank tomorrow at 15:00'), 3000), `plan not saved: ${JSON.stringify(plans().slice(-2))}`);
    });

    // 64k. VoiceStudio writes it down: a stand-in for its local server takes
    //      the audio as it is; the note says VoiceStudio wrote it.
    await step('64k', 'new note from audio written down by VoiceStudio', async () => {
      const http = require('http');
      let got = '';
      const server = http.createServer((req, res) => {
        res.setHeader('content-type', 'application/json');
        if (req.url === '/health') { res.end('{"status":"ok"}'); return; }
        let body = ''; req.on('data', (d) => { body += d.toString('latin1'); });
        req.on('end', () => { got = body; res.end(JSON.stringify({ text: 'Pay the rent on Friday.', duration_s: 1 })); });
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      process.env.MUFKA_STUDIO_URL = `http://127.0.0.1:${server.address().port}`;
      try {
        BrowserWindow.getAllWindows()[0].emit('focus');
        await sleep(600);
        await press('P', ['meta']); await typeText('New note from audio'); await enter();
        assert(await waitFor('!!document.querySelector(".voice-dialog input[type=file]")', 3000), 'no New note from audio dialog');
        const studio = `document.querySelector('.voice-engine-seg button[data-engine="studio"]')`;
        if (await js(`!!${studio}`)) await clickEval(studio, 'VoiceStudio');
        assert(await waitFor('/VoiceStudio turns it/.test(document.querySelector(".voice-lede")?.textContent || "")', 2000), 'VoiceStudio not chosen');
        await js(`(() => { const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(2000).fill(7)], 'Rent memo.m4a', { type: 'audio/mp4' })); const p = document.querySelector('.voice-dialog input[type=file]'); p.files = dt.files; p.dispatchEvent(new Event('change')); return true; })()`);
        assert(await waitFor('document.querySelector(".note-title")?.textContent === "Rent memo"', 8000), `no voice note: ${await js('document.querySelector(".voice-status")?.textContent')}`);
        const f = fs.readdirSync(tvault, { recursive: true }).find((p) => String(p).endsWith('Rent memo.md'));
        const note = fs.readFileSync(path.join(tvault, f), 'utf8');
        assert(/source: VoiceStudio[\s\S]*!\[\[Rent memo\.m4a\]\]\n\nPay the rent on Friday\./.test(note), `note text:\n${note}`);
        assert(/name="audio"; filename="Rent memo\.m4a"/.test(got), 'the audio was not sent as it is');
        assert(/name="mode"\r\n\r\naccurate\r\n/.test(got), 'not asked for the model chosen in VoiceStudio');
      } finally {
        delete process.env.MUFKA_STUDIO_URL;
        server.close();
      }
    });

    // 64l. Quick note (⌃⌥N, File → Quick Note…): a small window; a line goes
    //      to today's daily note with the time, "Name: text" to that note.
    await step('64l', 'quick note adds a line to the daily note or a named note', async () => {
      fs.writeFileSync(path.join(tvault, 'Groceries.md'), '# Groceries\n\n- bread\n');
      await sleep(900);
      const item = Menu.getApplicationMenu().items.flatMap((m) => (m.submenu ? m.submenu.items : [])).find((i) => i.label === 'Quick Note…');
      assert(item, 'no Quick Note… in the menu');
      const quick = async (text) => {
        item.click();
        let q = null;
        for (let i = 0; i < 40 && !q; i++) { await sleep(100); q = BrowserWindow.getAllWindows().find((w) => w.webContents !== wc && !w.isDestroyed() && w.getSize()[1] < 200); }
        assert(q, 'no quick note window');
        const qjs = (c) => q.webContents.executeJavaScript(c);
        for (let i = 0; i < 40 && !(await qjs('!!document.querySelector(".quick-input")').catch(() => false)); i++) await sleep(100);
        q.focus();
        for (const ch of text) { q.webContents.sendInputEvent({ type: 'char', keyCode: ch }); await sleep(5); }
        await sleep(300);
        // "Name: text" waits for the main process to find the note.
        for (let i = 0; i < 30 && text.includes(':') && (await qjs('document.querySelector(".quick-to").textContent')) === "→ Today's daily note"; i++) await sleep(100);
        const chip = await qjs('document.querySelector(".quick-to").textContent');
        q.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); q.webContents.sendInputEvent({ type: 'char', keyCode: '\r' }); q.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
        for (let i = 0; i < 40 && !q.isDestroyed(); i++) await sleep(100);
        assert(q.isDestroyed(), 'the quick note window did not close');
        return chip;
      };
      assert(await quick('Ask Mert about the logo') === "→ Today's daily note", 'not shown going to the daily note');
      const daily = () => { const f = fs.readdirSync(tvault, { recursive: true }).find((p) => path.basename(String(p)) === `${todayKey}.md`); return f ? fs.readFileSync(path.join(tvault, f), 'utf8') : ''; };
      assert(/^- \d\d:\d\d Ask Mert about the logo$/m.test(daily()), `daily note:\n${daily()}`);
      assert(await quick('groceries: oat milk') === '→ Groceries', 'not shown going to Groceries');
      assert(fs.readFileSync(path.join(tvault, 'Groceries.md'), 'utf8') === '# Groceries\n\n- bread\n- oat milk\n', 'not added to Groceries');
    });

    // 64m. Quick note dictation: the mic turns into a running Stop timer, a
    //      second press (Enter) stops Handy, and what Handy types lands in
    //      the box to be checked and added with Enter.
    await step('64m', 'quick note mic shows listening, stops, and waits for Enter', async () => {
      if (process.platform === 'win32') return; // the stand-in is a shell script
      const handy = path.join(tmp, 'Handy');
      const log = path.join(tmp, 'handy-quick.log');
      fs.writeFileSync(handy, `#!/bin/sh\necho "$@" >> "${log}"\nif [ "$1" = "--start-hidden" ]; then i=0; while [ $i -lt 30 ]; do sleep 1; i=$((i+1)); done; fi\n`, { mode: 0o755 });
      process.env.MUFKA_HANDY_PATH = handy;
      try {
        const item = Menu.getApplicationMenu().items.flatMap((m) => (m.submenu ? m.submenu.items : [])).find((i) => i.label === 'Quick Note…');
        item.click();
        let q = null;
        for (let i = 0; i < 40 && !q; i++) { await sleep(100); q = BrowserWindow.getAllWindows().find((w) => w.webContents !== wc && !w.isDestroyed() && w.getSize()[1] < 200); }
        assert(q, 'no quick note window');
        const qjs = (c) => q.webContents.executeJavaScript(c);
        const qwait = async (c, ms = 4000) => { for (let i = 0; i < ms / 100; i++) { if (await qjs(c).catch(() => false)) return true; await sleep(100); } return false; };
        assert(await qwait('!!document.querySelector(".quick-mic") && !document.querySelector(".quick-mic").hidden'), 'no mic in the quick box');
        assert(await qwait('/click the mic to speak/.test(document.querySelector(".quick-hint").textContent)'), 'hint does not mention the mic');
        q.focus();
        const r = await qjs('(() => { const b = document.querySelector(".quick-mic").getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; })()');
        q.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
        q.webContents.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
        assert(await qwait('document.querySelector(".quick-mic").classList.contains("rec") && /Stop/.test(document.querySelector(".quick-mic").textContent)', 6000), 'mic did not turn into Stop');
        assert(await qjs('/Listening/.test(document.querySelector(".quick-hint").textContent) && document.querySelector(".quick-input").placeholder.startsWith("Listening")'), 'not shown as listening');
        q.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); q.webContents.sendInputEvent({ type: 'char', keyCode: '\r' }); q.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
        assert(await qwait('document.querySelector(".quick-input").placeholder === "Writing it down…" && /writing down/.test(document.querySelector(".quick-hint").textContent)'), 'not shown as writing it down');
        assert(!q.isDestroyed(), 'Enter while listening closed the box');
        const toggles = fs.readFileSync(log, 'utf8').split('\n').filter((l) => l === '--toggle-transcription').length;
        assert(toggles === 2, `Handy toggled ${toggles} times`);
        q.webContents.insertText('Buy stamps');
        assert(await qwait('/Check it/.test(document.querySelector(".quick-hint").textContent) && !document.querySelector(".quick-mic").classList.contains("wait")'), 'not asked to check the text');
        q.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); q.webContents.sendInputEvent({ type: 'char', keyCode: '\r' }); q.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
        for (let i = 0; i < 40 && !q.isDestroyed(); i++) await sleep(100);
        assert(q.isDestroyed(), 'the quick note window did not close');
        const f = fs.readdirSync(tvault, { recursive: true }).find((p) => path.basename(String(p)) === `${todayKey}.md`);
        assert(/^- \d\d:\d\d Buy stamps$/m.test(fs.readFileSync(path.join(tvault, f), 'utf8')), 'dictated line not in the daily note');
      } finally {
        require('child_process').spawnSync('pkill', ['-f', handy]);
        delete process.env.MUFKA_HANDY_PATH;
      }
    });

    // 65. File recovery: a saved change keeps the text it replaced; the
    //     version comes back from Version history; a deleted note comes back
    //     from Recover deleted notes. Versions live outside the vault.
    await step(65, 'version history restores a version; a deleted note is recovered', async () => {
      const file = path.join(notesDir, 'Gecmis.md');
      fs.writeFileSync(file, 'ilk hali\n');
      await clickSel('#mode-notes');
      await sleep(1700); // past the watcher's own-write window
      await press('O', ['meta']); await typeText('Gecmis');
      assert(await waitFor('document.querySelector(".palette-item.selected .palette-label")?.textContent === "Gecmis"', 3000), 'note not in the switcher');
      await enter();
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "Gecmis"', 3000), 'note did not open');
      await setNoteSource('ikinci hali\n');
      assert(await waitFor2(() => fs.readFileSync(file, 'utf8') === 'ikinci hali\n', 3000), 'edit not saved');
      assert(!fs.readdirSync(notesDir).some((n) => /history/i.test(n)), 'history written into the vault');
      assert(fs.existsSync(path.join(tmp, 'history')), 'no history folder in userData');
      await press('P', ['meta']); await typeText('version history');
      assert(await waitFor('document.querySelector(".palette-item.selected .palette-label")?.textContent === "Version history of this note"', 2000), 'command not found');
      await enter();
      assert(await waitFor('document.querySelectorAll(".history-dialog .hist-row").length === 1', 3000), `versions: ${await js('document.querySelectorAll(".history-dialog .hist-row").length')}`);
      assert(await waitFor('[...document.querySelectorAll(".hist-line.add")].some(l => l.textContent.includes("ilk hali")) && [...document.querySelectorAll(".hist-line.del")].some(l => l.textContent.includes("ikinci hali"))', 2000), 'changes not shown');
      await clickEval(`[...document.querySelectorAll('.history-dialog button')].find(b => b.textContent === 'Restore this version')`, 'restore button');
      assert(await waitFor2(() => fs.readFileSync(file, 'utf8') === 'ilk hali\n', 3000), `not restored: ${JSON.stringify(fs.readFileSync(file, 'utf8'))}`);
      assert(await waitFor('!document.querySelector(".history-dialog") && document.querySelector(".note-body")?.textContent.includes("ilk hali")', 3000), 'restored text not shown');
      // What the restore replaced is a version too.
      await press('P', ['meta']); await typeText('version history'); await enter();
      assert(await waitFor('document.querySelectorAll(".history-dialog .hist-row").length === 2', 3000), 'replaced text not kept');
      await press('Escape');
      assert(await waitFor('!document.querySelector(".history-dialog")', 2000), 'Esc did not close');
      // Delete the note, then bring it back.
      await clickSel('[data-menu-anchor="menu-note"]');
      await clickEval(`[...document.querySelectorAll('.menu-item')].find(b => b.textContent === 'Delete')`, 'Delete');
      await clickEval(`[...document.querySelectorAll('.menu-item')].find(b => b.textContent === 'Delete')`, 'confirm Delete');
      assert(await waitFor2(() => !fs.existsSync(file), 3000), 'note not deleted');
      await press('P', ['meta']); await typeText('recover deleted'); await enter();
      assert(await waitFor('[...document.querySelectorAll(".hist-row-deleted")].some(r => r.textContent.includes("Gecmis"))', 3000), 'deleted note not listed');
      await clickEval(`[...document.querySelectorAll('.hist-row-deleted')].find(r => r.textContent.includes('Gecmis')).querySelector('button')`, 'restore deleted');
      assert(await waitFor2(() => fs.existsSync(file) && fs.readFileSync(file, 'utf8') === 'ilk hali\n', 3000), 'deleted note not restored');
      await press('Escape');
      assert(await waitFor('!document.querySelector(".history-dialog")', 2000), 'Esc did not close after a restore');
    });

    // 66. Find and replace in the note: ⌘F highlights matches in the preview
    //     (case and Turkish i ignored; one is hidden in a link's address, so
    //     its block is marked), ⌥⌘F replaces all, ⌘Z undoes it, and the
    //     source view marks matches behind its text.
    await step(66, 'find and replace in the note', async () => {
      const file = path.join(notesDir, 'Bul.md');
      fs.writeFileSync(file, 'elma armut\n\nbir ELMA daha\n\n[link](https://elma.example)\n');
      await sleep(1700);
      await press('O', ['meta']); await typeText('Bul');
      assert(await waitFor('document.querySelector(".palette-item.selected .palette-label")?.textContent === "Bul"', 3000), 'note not in the switcher');
      await enter();
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "Bul"', 3000), 'note did not open');
      await press('F', ['meta']);
      assert(await waitFor('document.activeElement?.id === "find-input"', 2000), 'find field not focused');
      await typeText('elma');
      assert(await waitFor('document.querySelector(".find-count")?.textContent === "1 of 3"', 2000), `count: ${await js('document.querySelector(".find-count")?.textContent')}`);
      assert(await js('CSS.highlights.get("find-match")?.size === 2 && CSS.highlights.get("find-current")?.size === 1'), 'matches not highlighted');
      await enter(); await enter();
      assert(await waitFor('document.querySelector(".find-count")?.textContent === "3 of 3" && !!document.querySelector(".block.find-block")', 2000), 'the match in the link address is not marked');
      await press('F', ['meta', 'alt']);
      assert(await waitFor('document.querySelector(".find-box.replacing") && document.activeElement?.id === "find-replace-input"', 2000), 'replace field not shown');
      await typeText('kiraz');
      await press('Return', ['meta']);
      assert(await waitFor2(() => fs.readFileSync(file, 'utf8') === 'kiraz armut\n\nbir kiraz daha\n\n[link](https://kiraz.example)\n', 3000), `not replaced: ${JSON.stringify(fs.readFileSync(file, 'utf8'))}`);
      assert(await waitFor('document.querySelector(".find-count")?.textContent === "No results"', 2000), 'count after replace');
      await press('Escape');
      assert(await waitFor('document.getElementById("find-bar").hidden && !CSS.highlights.get("find-match")', 2000), 'Esc did not close');
      await cmdZ();
      assert(await waitFor2(() => fs.readFileSync(file, 'utf8').startsWith('elma armut'), 3000), 'undo did not bring the text back');
      // ⇧⌘F still searches every note.
      await press('F', ['meta', 'shift']);
      assert(await waitFor('document.activeElement?.id === "ara-input"', 2000), '⇧⌘F did not open search');
      // Source view: matches marked behind the text; replace one.
      await press('O', ['meta']); await typeText('Bul');
      assert(await waitFor('document.querySelector(".palette-item.selected .palette-label")?.textContent === "Bul"', 3000), 'note not in the switcher');
      await enter();
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "Bul"', 3000), 'note did not reopen');
      await press('E', ['meta']);
      assert(await waitFor('!!document.querySelector("#note-editor")', 2000), 'no source view');
      await press('F', ['meta', 'alt']);
      await retype('#find-input', 'elma');
      assert(await waitFor('document.querySelectorAll("#find-backdrop .find-mark").length === 3 && document.querySelectorAll("#find-backdrop .find-mark.current").length === 1', 2000), 'source matches not marked');
      await retype('#find-replace-input', 'erik'); await enter();
      assert(await waitFor2(() => fs.readFileSync(file, 'utf8').startsWith('erik armut\n\nbir ELMA'), 3000), `source replace: ${JSON.stringify(fs.readFileSync(file, 'utf8'))}`);
      assert(await waitFor('document.querySelector(".find-count")?.textContent === "1 of 2"', 2000), `count after one: ${await js('document.querySelector(".find-count")?.textContent')}`);
      await press('Escape');
      assert(await waitFor('!document.getElementById("find-backdrop") && document.activeElement?.id === "note-editor"', 2000), 'source view not restored');
      await press('E', ['meta']);
    });

    // 67. Search operators: words are all needed, file:/-file: narrow it, the
    //     hit is marked in the result, and opening it shows the hit in the note.
    await step(67, 'search operators, marked hits, the hit shown in the note', async () => {
      await press('F', ['meta', 'shift']);
      assert(await waitFor('document.activeElement?.id === "ara-input"', 2000), 'search not focused');
      await typeText('file:Bul elma');
      assert(await waitFor('document.querySelectorAll(".ara-result").length === 1 && document.querySelector(".ara-result mark.ara-hit")?.textContent === "ELMA"', 3000), `results: ${await js('[...document.querySelectorAll(".ara-result")].map(r=>r.textContent).join(" | ")')}`);
      assert(await js('!document.querySelector(".ara-create")'), 'an operator query offered to create a note');
      await clickSel('.ara-result');
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "Bul" && !document.getElementById("find-bar").hidden && document.querySelector(".find-count")?.textContent === "1 of 2"', 3000), `find after open: ${await js('document.querySelector(".find-count")?.textContent')}`);
      await retype('#ara-input', 'elma -file:Bul');
      assert(await waitFor('![...document.querySelectorAll(".ara-result")].some(r => r.textContent.startsWith("Bul"))', 2000), '-file: did not exclude');
      await retype('#ara-input', 'zzqqxx');
      assert(await waitFor('!!document.querySelector(".ara-help")', 2000), 'no operator help when nothing is found');
      await retype('#ara-input', ''); await sleep(200);
      await press('O', ['meta']); await typeText('Gecmis'); await enter();
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "Gecmis" && document.getElementById("find-bar").hidden', 3000), 'the find bar from a search stayed on another note');
    });

    // 68. Code blocks are coloured by their language; editing one shows its
    //     plain source.
    await step(68, 'code blocks are coloured by language', async () => {
      const file = path.join(notesDir, 'Kod.md');
      fs.writeFileSync(file, '```python\ndef selam(ad):\n    return f"Merhaba {ad}"  # yorum\n```\n\n```\nduz metin\n```\n');
      await sleep(1700);
      await press('O', ['meta']); await typeText('Kod');
      assert(await waitFor('document.querySelector(".palette-item.selected .palette-label")?.textContent === "Kod"', 3000), 'note not in the switcher');
      await enter();
      assert(await waitFor('!!document.querySelector(".note-body pre code.language-python span.hljs-keyword")', 3000), 'python not coloured');
      const colours = await js(`(()=>{const c=document.querySelector('.note-body code.language-python'); const k=c.querySelector('.hljs-keyword'), m=c.querySelector('.hljs-comment'); return [getComputedStyle(c).color, getComputedStyle(k).color, getComputedStyle(m).color];})()`);
      assert(new Set(colours).size === 3, `token colours: ${colours}`);
      assert(await js('document.querySelectorAll(".note-body pre")[1].querySelectorAll("span").length === 0'), 'a block without a language was coloured');
      await clickEval(`document.querySelector('.note-body pre code.language-python')`, 'code block');
      assert(await waitFor('document.getElementById("block-editor")?.value.startsWith("```python")', 2000), 'editing did not show the source');
      await press('Escape');
    });

    // 69. Pasting a web page's HTML gives Markdown; ⇧⌘V (Paste as Plain
    //     Text) and a paste inside a code block keep the plain text.
    await step(69, 'pasted HTML becomes Markdown; plain paste stays plain', async () => {
      const file = path.join(notesDir, 'Yapistir.md');
      fs.writeFileSync(file, 'Basla\n');
      await sleep(1700);
      await press('O', ['meta']); await typeText('Yapistir');
      assert(await waitFor('document.querySelector(".palette-item.selected .palette-label")?.textContent === "Yapistir"', 3000), 'note not in the switcher');
      await enter();
      await toSource();
      const html = '<h2>Liste</h2><ul><li><b>kalın</b> madde</li><li><a href="https://example.com">bağlantı</a></li></ul>';
      const put = async (h, t) => clipboard.write([new ClipboardItem({ 'text/html': new Blob([h], { type: 'text/html' }), 'text/plain': new Blob([t], { type: 'text/plain' }) })]);
      await put(html, 'Liste\nkalın madde\nbağlantı');
      await js(`(()=>{const t=document.querySelector('#note-editor'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); return true;})()`);
      wc.paste(); await sleep(300);
      assert(await waitFor2(() => fs.readFileSync(file, 'utf8') === 'Basla\n## Liste\n\n- **kalın** madde\n- [bağlantı](https://example.com)', 3000), `paste: ${JSON.stringify(fs.readFileSync(file, 'utf8'))}`);
      wc.send('menu:action', 'paste-plain'); await sleep(400);
      assert(await waitFor2(() => fs.readFileSync(file, 'utf8').endsWith('(https://example.com)Liste\nkalın madde\nbağlantı'), 3000), `plain paste: ${JSON.stringify(fs.readFileSync(file, 'utf8'))}`);
      // Inside a code block: plain.
      await js(`(()=>{const t=document.querySelector('#note-editor'); t.value='\`\`\`\\n'; t.dispatchEvent(new Event('input',{bubbles:true})); t.setSelectionRange(4,4); return true;})()`);
      wc.paste(); await sleep(300);
      assert(await waitFor2(() => fs.readFileSync(file, 'utf8') === '```\nListe\nkalın madde\nbağlantı', 3000), `code paste: ${JSON.stringify(fs.readFileSync(file, 'utf8'))}`);
      await press('E', ['meta']);
    });

    // 70. Tabs: ⌘Enter in the switcher opens a note in a new tab; ⇧⌘[ ⇧⌘]
    //     switch, each tab keeps its place; ⌘W closes; a closed tab reopens;
    //     the tabs are saved; one tab hides the strip.
    await step(70, 'tabs: a note from a note opens beside it; switch, close, reopen', async () => {
      const tabNames = 'JSON.stringify([...document.querySelectorAll("#tab-strip .tab-item")].map(t => (t.classList.contains("active") ? "*" : "") + t.textContent.replace("×", "")))';
      const title = 'document.querySelector(".note-title")?.textContent';
      await press('O', ['meta']); await typeText('Bul'); await enter();
      assert(await waitFor(`${title} === "Bul"`, 3000), 'Bul did not open');
      // Earlier steps left tabs open: keep only this one.
      if (!(await js('document.getElementById("tab-strip").hidden'))) {
        await js(`(() => { const r = document.querySelector('#tab-strip .tab-item.active'); const b = r.getBoundingClientRect(); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.x + 20, clientY: b.y + b.height / 2 })); return true; })()`);
        await sleep(200);
        await clickEval(`[...document.querySelectorAll('button, [role=menuitem]')].find(b => b.textContent.trim() === 'Close other tabs')`, 'Close other tabs');
      }
      assert(await waitFor(`${title} === "Bul" && document.getElementById("tab-strip").hidden`, 3000), 'one tab should hide the strip');
      // A plain Enter opens Kod beside Bul.
      await press('O', ['meta']); await typeText('Kod');
      assert(await waitFor('document.querySelector(".palette-item.selected .palette-label")?.textContent === "Kod"', 3000), 'Kod not in the switcher');
      await enter();
      assert(await waitFor(`${tabNames} === '["Bul","*Kod"]' && ${title} === "Kod"`, 3000), `tabs: ${await js(tabNames)}`);
      await press('[', ['meta', 'shift']);
      assert(await waitFor(`${tabNames} === '["*Bul","Kod"]' && ${title} === "Bul"`, 3000), `after ⇧⌘[: ${await js(tabNames)}`);
      // Kod is already open: going to it goes to its tab.
      await press('O', ['meta']); await typeText('Kod'); await enter();
      assert(await waitFor(`${tabNames} === '["Bul","*Kod"]'`, 3000), `not back to Kod's tab: ${await js(tabNames)}`);
      await press('[', ['meta', 'shift']);
      await press('O', ['meta']); await typeText('Gecmis'); await enter();
      assert(await waitFor(`${tabNames} === '["Bul","*Gecmis","Kod"]'`, 3000), `Gecmis not after Bul: ${await js(tabNames)}`);
      // Within a tab, the Planner and back.
      await clickSel('#mode-planner');
      assert(await waitFor(`${tabNames} === '["Bul","*Planner","Kod"]'`, 3000), `Planner not in the tab: ${await js(tabNames)}`);
      await press('[', ['meta']);
      assert(await waitFor(`${title} === "Gecmis"`, 3000), 'back within the tab');
      assert(await js('JSON.parse(localStorage.getItem("mufka-tabs")).tabs.length === 3'), 'tabs not saved');
      await press('W', ['meta']);
      assert(await waitFor(`${tabNames} === '["Bul","*Kod"]' && ${title} === "Kod"`, 3000), `close tab: ${await js(tabNames)}`);
      await press('P', ['meta']); await typeText('reopen closed tab');
      assert(await waitFor('document.querySelector(".palette-item.selected .palette-label")?.textContent === "Reopen closed tab"', 2000), 'reopen command missing');
      await enter();
      assert(await waitFor(`${tabNames} === '["Bul","*Gecmis","Kod"]'`, 3000), `reopen: ${await js(tabNames)}`);
      await press('[', ['meta', 'shift']);
      assert(await waitFor(`${title} === "Bul"`, 3000), 'not on Bul');
      for (let i = 0; i < 2; i++) {
        await clickEval(`[...document.querySelectorAll('#tab-strip .tab-item')].find(t => !t.classList.contains('active')).querySelector('.tab-close')`, 'close button');
        await sleep(200);
      }
      assert(await waitFor(`document.getElementById("tab-strip").hidden && ${title} === "Bul"`, 3000), 'close by ×');
      // ⌥⌘T (the + in the strip): a new empty note in its own tab, ready to type in.
      await press('T', ['meta', 'alt']);
      assert(await waitFor(`${tabNames} === '["Bul","*Untitled"]' && document.activeElement?.id === "block-editor"`, 3000), `new note tab: ${await js(tabNames)}`);
      const untitled = fs.readdirSync(notesDir, { recursive: true }).find((p) => path.basename(String(p)) === 'Untitled.md');
      assert(untitled, 'no Untitled.md');
      await typeText('yeni sekme');
      await press('Escape'); await sleep(700);
      assert(fs.readFileSync(path.join(notesDir, untitled), 'utf8').startsWith('yeni sekme'), 'typed text not saved');
      await press('W', ['meta']);
      assert(await waitFor(`document.getElementById("tab-strip").hidden && ${title} === "Bul"`, 3000), 'new note tab did not close');
    });

    // 71. The right pane: ⌥⌘Enter in the switcher opens a note there; its
    //     tasks tick in its file; clicking its text swaps the panes and edits.
    await step(71, 'split: a note to the right, tasks, swap to edit, close', async () => {
      const tasksFile = path.join(notesDir, 'Gorevler.md');
      fs.writeFileSync(tasksFile, '- [ ] bir\n- [ ] iki\n');
      await sleep(1700);
      await press('O', ['meta']); await typeText('Gorevler');
      assert(await waitFor('document.querySelector(".palette-item.selected .palette-label")?.textContent === "Gorevler"', 3000), 'not in the switcher');
      await press('Return', ['meta', 'alt']);
      assert(await waitFor('!document.getElementById("split-pane").hidden && document.querySelector(".split-title")?.textContent === "Gorevler" && document.querySelector(".note-title")?.textContent === "Bul"', 3000), 'not opened to the right');
      await clickEval(`document.querySelectorAll('.split-col input.task-check')[1]`, 'task in the right pane');
      assert(await waitFor2(() => fs.readFileSync(tasksFile, 'utf8') === '- [ ] bir\n- [x] iki\n', 3000), `task: ${JSON.stringify(fs.readFileSync(tasksFile, 'utf8'))}`);
      assert(await js('localStorage.getItem("mufka-split") === "Gorevler.md"'), 'the right pane is not remembered');
      await clickEval(`[...document.querySelectorAll('.split-col .block')].find(b => b.textContent.includes('bir'))`, 'text in the right pane');
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "Gorevler" && document.querySelector(".split-title")?.textContent === "Bul" && !!document.getElementById("block-editor")', 3000), 'swap to edit');
      await press('Escape');
      await clickSel('.split-close');
      assert(await waitFor('document.getElementById("split-pane").hidden && localStorage.getItem("mufka-split") === ""', 2000), 'right pane not closed');
    });

    // 72. Properties: edited in place (text, tags, checkbox), added with ⌘;,
    //     removed; an alias makes [[Takma]] link to the note.
    await step(72, 'properties editor and aliases', async () => {
      const file = path.join(notesDir, 'Ozellik.md');
      fs.writeFileSync(file, '---\nstatus: aktif\ntags: [bir]\ndone: false\n---\nGovde\n');
      fs.writeFileSync(path.join(notesDir, 'Baglanti.md'), 'Bak: [[Takma]]\n');
      await sleep(1700);
      await press('O', ['meta']); await typeText('Ozellik'); await enter();
      assert(await waitFor('document.querySelectorAll(".note-body .props .prop-row").length === 3', 3000), 'properties not shown');
      await retype('#prop-note-0-v', 'bitti'); await enter();
      assert(await waitFor2(() => fs.readFileSync(file, 'utf8').includes('status: bitti'), 3000), `text: ${fs.readFileSync(file, 'utf8')}`);
      await clickSel('#prop-note-1-v'); await typeText('iki'); await enter();
      assert(await waitFor2(() => fs.readFileSync(file, 'utf8').includes('tags: [bir, iki]'), 3000), `tags: ${fs.readFileSync(file, 'utf8')}`);
      assert(await waitFor('document.activeElement?.id === "prop-note-1-v"', 2000), 'focus left the tag field');
      await clickSel('#prop-note-2-v');
      assert(await waitFor2(() => fs.readFileSync(file, 'utf8').includes('done: true'), 3000), `checkbox: ${fs.readFileSync(file, 'utf8')}`);
      await js('document.activeElement.blur()');
      await press(';', ['meta']);
      assert(await waitFor('document.activeElement?.id === "prop-note-new"', 2000), '⌘; did not start a new property');
      await typeText('aliases'); await enter();
      assert(await waitFor('document.activeElement?.id === "prop-note-3-v"', 3000), `new value not focused: ${await js('document.activeElement?.id')}`);
      await typeText('Takma'); await enter();
      assert(await waitFor2(() => /aliases:\n {2}- Takma\n---\nGovde/.test(fs.readFileSync(file, 'utf8')), 3000), `alias: ${fs.readFileSync(file, 'utf8')}`);
      await hoverClickEval(`document.querySelector('.note-body .prop-row .prop-del')`, 'remove status');
      assert(await waitFor2(() => !fs.readFileSync(file, 'utf8').includes('status:'), 3000), 'property not removed');
      assert(await waitFor('document.querySelectorAll(".note-body .props .prop-row").length === 3', 2000), 'rows after remove');
      // ⌘Z brings it back.
      await js('document.activeElement.blur()');
      await cmdZ();
      assert(await waitFor2(() => fs.readFileSync(file, 'utf8').includes('status: bitti'), 3000), 'undo did not bring the property back');
      // The alias resolves.
      await press('O', ['meta']); await typeText('Baglanti'); await enter();
      assert(await waitFor('document.querySelector(".note-body a.wikilink")?.className === "wikilink"', 4000), `alias link: ${await js('document.querySelector(".note-body a.wikilink")?.className')}`);
      await clickSel('.note-body a.wikilink');
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "Ozellik"', 3000), 'alias link did not open the note');
    });

    // 73. The "/" menu: "/tas" + Enter starts a task, "/co" a code block with
    //     the caret inside, "/link" goes on to the note suggestions.
    await step(73, 'the / menu inserts blocks', async () => {
      const file = path.join(notesDir, 'Slash.md');
      fs.writeFileSync(file, 'ilk\n');
      await sleep(1700);
      await press('O', ['meta']); await typeText('Slash'); await enter();
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "Slash"', 3000), 'note did not open');
      await clickSel('.note-body .block-tail'); // a new block after "ilk"
      await typeText('/tas');
      assert(await waitFor('document.querySelector("#suggest-list .suggest-item.selected .suggest-label")?.textContent === "Task"', 2000), `menu: ${await js('document.querySelector("#suggest-list")?.textContent')} value=${JSON.stringify(await blockVal())} active=${await js('document.activeElement?.id')}`);
      await enter();
      await typeText('yap');
      assert(await waitFor('document.getElementById("block-editor")?.value === "- [ ] yap"', 2000), `after task: ${JSON.stringify(await blockVal())}`);
      await press('Escape');
      await clickSel('.note-body .block-tail');
      await typeText('/co');
      assert(await waitFor('document.querySelector("#suggest-list .suggest-item.selected .suggest-label")?.textContent === "Code block"', 2000), 'code block not offered');
      await enter();
      await typeText('x = 1');
      assert(await waitFor('document.getElementById("block-editor")?.value === "```\\nx = 1\\n```"', 2000), `code: ${JSON.stringify(await blockVal())}`);
      await press('Escape');
      assert(await waitFor2(() => fs.readFileSync(file, 'utf8').includes('- [ ] yap') && fs.readFileSync(file, 'utf8').includes('```\nx = 1\n```'), 3000), `saved: ${JSON.stringify(fs.readFileSync(file, 'utf8'))}`);
      await clickBlock('yap'); await press('End');
      await typeText(' /lin');
      assert(await waitFor('document.querySelector("#suggest-list .suggest-item.selected .suggest-label")?.textContent === "Link to a note"', 2000), 'link item not offered');
      await enter();
      assert(await waitFor('document.getElementById("block-editor")?.value.endsWith("yap [[") && !!document.querySelector("#suggest-list .suggest-item")', 2000), `link: ${JSON.stringify(await blockVal())}`);
      await press('Escape'); await press('Escape');
    });

    // 74. Appearance: Settings switches light / dark / system; the page's
    //     colours follow and the choice is saved for the next start.
    await step(74, 'appearance: light, dark, follow the system', async () => {
      const settings = path.join(tmp, 'settings.json');
      const bg = 'getComputedStyle(document.body.closest("html")).getPropertyValue("--ground").trim()';
      await press(',', ['meta']);
      const startTheme = process.env.MUFKA_E2E_THEME || 'system';
      assert(await waitFor(`!!document.querySelector('.theme-seg button[data-theme="${startTheme}"][aria-pressed="true"]')`, 3000), `${startTheme} not chosen at start`);
      await clickSel('.theme-seg button[data-theme="light"]');
      assert(await waitFor(`${bg} === "#ffffff"`, 3000), `light: ${await js(bg)}`);
      assert(await waitFor2(() => JSON.parse(fs.readFileSync(settings, 'utf8')).theme === 'light', 2000), 'light not saved');
      await clickSel('.theme-seg button[data-theme="dark"]');
      assert(await waitFor(`${bg} === "#1e2025"`, 3000), `dark: ${await js(bg)}`);
      await clickSel('.theme-seg button[data-theme="system"]');
      assert(await waitFor2(() => !('theme' in JSON.parse(fs.readFileSync(settings, 'utf8'))), 2000), 'system should clear the saved choice');
      await press('Escape');
    });

    // 75. The vault index: the notes are saved outside the vault for the next
    //     start; a note changed outside Mufka reaches search and backlinks.
    await step(75, 'vault index: saved cache, outside changes picked up', async () => {
      const indexDir = path.join(tmp, 'index');
      assert(await waitFor2(() => fs.existsSync(indexDir) && fs.readdirSync(indexDir).some((f) => f.endsWith('.json')), 9000), 'no saved index');
      // One file per notes folder (this run switched folders once).
      const holdsKod = () => fs.readdirSync(indexDir).filter((f) => f.endsWith('.json'))
        .some((f) => { try { return JSON.parse(fs.readFileSync(path.join(indexDir, f), 'utf8')).notes.some((n) => n.rel === 'Kod.md' && n.content.includes('def selam')); } catch { return false; } });
      assert(await waitFor2(holdsKod, 9000), 'the index does not hold the notes');
      assert(!fs.readdirSync(notesDir).includes('index'), 'index written into the vault');
      fs.writeFileSync(path.join(notesDir, 'Disarida.md'), 'zebrakelime ve [[Kod]]\n');
      await sleep(1700);
      await press('F', ['meta', 'shift']);
      await typeText('zebrakelime');
      assert(await waitFor('[...document.querySelectorAll(".ara-result")].some(r => r.textContent.startsWith("Disarida"))', 4000), 'outside note not found by search');
      await retype('#ara-input', ''); await sleep(200);
      await press('O', ['meta']); await typeText('Kod'); await enter();
      assert(await waitFor('[...document.querySelectorAll(".backlink-title")].some(b => b.textContent === "Disarida")', 5000), `backlink not shown: ${await js('document.querySelector(".backlinks")?.textContent')}`);
    });

    // 76. The habit tracker template: this week's grid, today marked; ticking
    //     a day writes an x into the table and the card counts it; a habit is
    //     added through its dialog.
    await step(76, 'habit tracker: tick today, add a habit', async () => {
      await clickSel('.side-notes .side-btn[aria-label="New note from template"]');
      assert(await waitFor('!!document.querySelector(".palette-new-from-template")', 2000), 'template list did not open');
      await typeText('Habit tracker'); await enter();
      assert(await waitFor('!!document.getElementById("tree-edit")', 2000), 'no name field');
      const name = await js('document.getElementById("tree-edit").value');
      await enter();
      assert(await waitFor(`document.querySelector(".note-title")?.textContent === ${JSON.stringify(name)}`, 3000), 'habit note did not open');
      assert(await waitFor('!!document.querySelector(".hab-card .hab-ring") && document.querySelectorAll(".hab-row").length === 4 && document.querySelectorAll("td.hab-today").length === 4', 3000), 'card, rows or today column not shown');
      await clickEval('document.querySelector(".hab-row td.hab-today .hab-cell")', 'today, first habit');
      assert(await waitFor('document.querySelector(".hab-card .bud-spent")?.textContent.startsWith("1 of 4") && document.querySelector(".hab-row td.hab-today .hab-cell")?.getAttribute("aria-pressed") === "true"', 3000), `tick not counted: ${await js('document.querySelector(".hab-card .bud-spent")?.textContent')}`);
      assert(await clickUntil('[...document.querySelectorAll(".bud-add")].find(b => b.textContent.includes("habit"))', '!!document.querySelector(".hab-name-input")', '+ Add habit'), 'add habit dialog did not open');
      await typeText('Stretch');
      await enter();
      assert(await waitFor('document.querySelectorAll(".hab-row").length === 5 && [...document.querySelectorAll(".hab-item")].some(e => e.textContent.startsWith("Stretch"))', 3000), 'habit not added');
    });

    // 77. Job search: the board from its template; a new application from the
    //     form lands in the first column; dragging a card moves its status;
    //     the application's strip moves it with one click.
    await step(77, 'job search: board, new application, drag, stage strip', async () => {
      await clickSel('.side-notes .side-btn[aria-label="New note from template"]');
      assert(await waitFor('!!document.querySelector(".palette-new-from-template")', 2000), 'template list did not open');
      await typeText('Job search'); await enter();
      assert(await waitFor('!!document.getElementById("tree-edit")', 2000), 'no name field');
      await enter();
      assert(await waitFor('!!document.querySelector(".job-board") && document.querySelectorAll(".job-col").length === 6', 3000), 'board not shown');
      assert(await clickUntil('document.querySelector(".job-new")', '!!document.querySelector(".job-company")', '+ New application'), 'new application form did not open');
      await typeText('Acme');
      await js(`(() => { document.querySelector('.job-role').value = 'Frontend Lead'; return true; })()`);
      await js(`document.querySelector('.job-company').focus()`);
      await enter();
      const vault = await js('window.notes.vaultInfo().then(v => v.path)');
      const findNote = (name) => { const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name.startsWith('.')) continue; const p = path.join(dir, e.name); if (e.isDirectory()) { const r = walk(p); if (r) return r; } else if (e.name === name) return p; } return null; }; return walk(vault); };
      let file = null;
      assert(await waitFor2(() => (file = findNote('Acme – Frontend Lead.md')) && /^status: Applied$/m.test(fs.readFileSync(file, 'utf8')), 4000), 'application note not made');
      assert(await waitFor('[...document.querySelectorAll(".job-col")][0].querySelectorAll(".job-card").length === 1', 4000), `card not in Applied: ${await js('[...document.querySelectorAll(".job-col")].map(c => c.dataset.stage + ":" + c.querySelectorAll(".job-card").length).join(" ") + " | " + document.querySelector(".note-title")?.textContent + " | " + document.querySelectorAll(".job-board").length')} ${file}`);
      await js(`(() => { const card = document.querySelector('.job-card'); const col = [...document.querySelectorAll('.job-col')].find(c => c.dataset.stage === 'Technical'); const dt = new DataTransfer(); card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); col.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); col.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); return true; })()`);
      assert(await waitFor2(() => /^status: Technical$/m.test(fs.readFileSync(file, 'utf8')), 4000), 'drag did not move the status');
      assert(await waitFor('[...document.querySelectorAll(".job-col")].find(c => c.dataset.stage === "Technical").querySelectorAll(".job-card").length === 1', 4000), 'card did not move');
      await clickSel('.job-card');
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "Acme – Frontend Lead" && document.querySelector(".job-step.on")?.textContent === "Technical" && !!document.querySelector(".props.folded")', 3000), 'application strip not shown');
      await clickEval('[...document.querySelectorAll(".job-step")].find(b => b.textContent === "Offer")', 'Offer');
      assert(await waitFor2(() => /^status: Offer$/m.test(fs.readFileSync(file, 'utf8')), 3000), 'strip did not move the status');
    });

    // 78. Weekly to-do: seven days as columns (their text hidden), today
    //     marked; a task added to today goes under its heading; ticking it
    //     writes [x]; "Show as text" brings the headings back.
    await step(78, 'weekly to-do: add and tick a task, show as text', async () => {
      await clickSel('.side-notes .side-btn[aria-label="New note from template"]');
      assert(await waitFor('!!document.querySelector(".palette-new-from-template")', 2000), 'template list did not open');
      await typeText('Weekly to-do'); await enter();
      assert(await waitFor('!!document.getElementById("tree-edit")', 2000), 'no name field');
      const name = await js('document.getElementById("tree-edit").value');
      await enter();
      assert(await waitFor('document.querySelectorAll(".wk-day").length === 7 && document.querySelectorAll(".wk-day.today").length === 1 && !!document.querySelector(".wk-hidden")', 3000), 'week board not shown');
      assert(await clickUntil('document.querySelector(".wk-day.today .wk-add")', '!!document.querySelector(".wk-new")', '+ Add'), 'no field for a new task');
      // A note changing outside Mufka mid-typing draws the board again; what
      // is typed must survive it (CI machines are slow enough to hit this).
      const vault = await js('window.notes.vaultInfo().then(v => v.path)');
      await typeText('Water');
      const redraws = await js('(window.__wkDraws = 0, new MutationObserver(() => { window.__wkDraws += 1; }).observe(document.querySelector(".wk-box").parentElement, { childList: true }), 0)');
      fs.writeFileSync(path.join(vault, 'Elsewhere.md'), 'changed outside\n');
      await sleep(2500);
      void redraws;
      assert(await js('document.activeElement?.classList.contains("wk-new") && document.activeElement.value === "Water"'), `typing lost on redraw: ${await js('document.activeElement?.className + " / " + document.querySelector(".wk-new")?.value')}`);
      await typeText(' the plants'); await enter();
      const findNote = (n) => { const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name.startsWith('.')) continue; const p = path.join(dir, e.name); if (e.isDirectory()) { const r = walk(p); if (r) return r; } else if (e.name === n) return p; } return null; }; return walk(vault); };
      const file = findNote(`${name}.md`);
      const dayName = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][(new Date().getDay() + 6) % 7];
      assert(await waitFor2(() => new RegExp(`## ${dayName}\\n(?:- \\[.\\] .*\\n)*- \\[ \\] Water the plants`).test(fs.readFileSync(file, 'utf8')), 3000), `task not under ${dayName}: ${fs.readFileSync(file, 'utf8')}`);
      await press('Escape');
      await clickEval('[...document.querySelectorAll(".wk-day.today .wk-task")].find(t => t.textContent === "Water the plants").querySelector(".wk-check")', 'tick');
      assert(await waitFor2(() => /- \[x\] Water the plants/.test(fs.readFileSync(file, 'utf8')), 3000), 'tick not saved');
      await clickSel('.wk-as-text');
      assert(await waitFor('!document.querySelector(".wk-hidden") && document.querySelectorAll(".note-body h2").length >= 7', 3000), 'days not shown as text');
    });

    // 79. Projects: the board from its template; a new project opens with its
    //     strip; ticking a task moves its progress; its stage changes with a
    //     click and the board shows it there.
    await step(79, 'projects: board, new project, progress, stage', async () => {
      await clickSel('.side-notes .side-btn[aria-label="New note from template"]');
      assert(await waitFor('!!document.querySelector(".palette-new-from-template")', 2000), 'template list did not open');
      await typeText('Project board'); await enter();
      assert(await waitFor('!!document.getElementById("tree-edit")', 2000), 'no name field');
      const board = await js('document.getElementById("tree-edit").value');
      await enter();
      assert(await waitFor('!!document.querySelector(".job-board") && document.querySelectorAll(".job-col").length === 4', 3000), 'project board not shown');
      assert(await clickUntil('document.querySelector(".job-new")', '!!document.querySelector(".prj-name")', '+ New project'), 'new project form did not open');
      await typeText('Garden shed');
      await enter();
      assert(await waitFor('document.querySelector(".note-title")?.textContent === "Garden shed" && document.querySelector(".job-step.on")?.textContent === "Planning"', 4000), `new project did not open with its strip: ${await js('document.querySelector(".note-title")?.textContent + " | " + document.querySelector(".job-step.on")?.textContent + " | " + document.getElementById("toast")?.textContent')}`);
      assert(await waitFor('document.querySelector(".prj-progress-text")?.textContent === "0/4"', 2000), `progress: ${await js('document.querySelector(".prj-progress-text")?.textContent')}`);
      await clickEval('document.querySelector(".note-body input.task-check")', 'first task');
      assert(await waitFor('document.querySelector(".prj-progress-text")?.textContent === "1/4"', 3000), 'progress did not move');
      // The tick saves and draws the page again; click once it has settled.
      await sleep(600);
      for (let i = 0; i < 3 && !(await js('document.querySelector(".job-step.on")?.textContent === "Active"')); i++) {
        await clickEval('[...document.querySelectorAll(".job-step")].find(b => b.textContent === "Active")', 'Active');
        await waitFor('document.querySelector(".job-step.on")?.textContent === "Active"', 1500);
      }
      assert(await js('document.querySelector(".job-step.on")?.textContent === "Active"'), 'stage did not change');
      await press('O', ['meta']); await typeText(board); await enter();
      assert(await waitFor('[...document.querySelectorAll(".job-col")].find(c => c.dataset.stage === "Active")?.textContent.includes("Garden shed")', 4000), 'board does not show the project as active');
    });

    // 80. Today: this week's to-do and habit notes (made in steps 76 and 78)
    //     show the day's part; a task added there lands under today's
    //     heading; the daily note can start from its template and take a mood.
    await step(80, "today: the week's to-do and habits, daily template, mood", async () => {
      await press('T', ['meta']);
      assert(await waitFor('[...document.querySelectorAll(".section-title")].map(e => e.textContent).join("|").includes("This week\'s to-do") && !!document.querySelector(".today-habit .hab-cell")', 4000), `today does not show the week's notes: ${await js('[...document.querySelectorAll(".section-title")].map(e => e.textContent).join("|")')}`);
      await clickSel('.today-add-input');
      await typeText('Call the plumber'); await enter();
      assert(await waitFor('[...document.querySelectorAll(".today-task")].some(t => t.textContent === "Call the plumber")', 3000), 'task not added for today');
      if (await js('!!document.querySelector(".daily-from-template")')) {
        await clickSel('.daily-from-template');
        assert(await waitFor('[...document.querySelectorAll(".daily-note h2")].some(h => h.textContent === "Top 3")', 3000), 'daily note not made from the template');
      }
      await clickEval('[...document.querySelectorAll(".mood")].find(b => b.title === "Good")', 'Good');
      assert(await waitFor('document.querySelector(".mood.on")?.title === "Good"', 3000), 'mood not set');
    });

    // 81. Settings → AI clients (MCP): off by default; turning it on and
    //     allowing writes is saved to settings.json; the copied config starts
    //     this app's MCP server with ELECTRON_RUN_AS_NODE.
    await step(81, 'settings: AI clients (MCP) switches and copied config; updates and menu bar switches', async () => {
      await press(',', ['meta']);
      assert(await waitFor('!!document.querySelector(".settings-dialog .mcp-row")', 3000), 'no AI clients section');
      const box = (k) => `document.querySelector('.mcp-row input[data-mcp="${k}"]')`;
      assert(await waitFor(`${box('enabled')}.checked === false && ${box('allowWrite')}.disabled === true && ${box('allowTicks')}.disabled === true`, 2000), 'not off by default');
      const settingsFile = path.join(tmp, 'settings.json');
      const saved = () => { try { return JSON.parse(fs.readFileSync(settingsFile, 'utf8')).mcp || {}; } catch { return {}; } };
      await clickEval(box('enabled'), 'enable MCP');
      assert(await waitFor2(() => saved().enabled === true && saved().allowWrite === false, 3000), `not saved: ${JSON.stringify(saved())}`);
      assert(await waitFor(`${box('allowWrite')}.disabled === false`, 2000), 'write switch still disabled');
      await clickEval(box('allowWrite'), 'allow writing');
      assert(await waitFor2(() => saved().allowWrite === true, 3000), 'allowWrite not saved');
      await clickEval(box('allowTicks'), 'allow ticking');
      assert(await waitFor2(() => saved().allowTicks === true && saved().allowWrite === true, 3000), `allowTicks not saved: ${JSON.stringify(saved())}`);
      assert(JSON.parse(fs.readFileSync(settingsFile, 'utf8')).vaultRoot, 'vault root not recorded for the server');
      // clipboard.readText() is async in this Electron.
      const copied = async (ok) => { for (let i = 0; i < 30; i++) { const t = await clipboard.readText(); if (ok(t)) return true; await sleep(100); } return false; };
      await clickSel('.mcp-row [data-mcp-copy="json"]');
      assert(await copied((t) => { try { const c = JSON.parse(t).mcpServers.mufka; return c.env.ELECTRON_RUN_AS_NODE === '1' && c.args[0].endsWith(path.join('out', 'main', 'mcp-server.js')) && c.args.includes(tmp); } catch { return false; } }), `config not copied: ${(await clipboard.readText()).slice(0, 200)}`);
      await clickSel('.mcp-row [data-mcp-copy="command"]');
      assert(await copied((t) => t.startsWith('claude mcp add --transport stdio --scope user --env ELECTRON_RUN_AS_NODE=1 mufka -- ')), `command not copied: ${await clipboard.readText()}`);
      // Updates: on by default; in a run that is not the installed app it says so.
      const upd = 'document.querySelector(\'.upd-row input[data-update="auto"]\')';
      assert(await waitFor(`${upd}.checked === true && document.querySelector('.upd-status')?.textContent.includes('updates work in the installed app')`, 2000), `updates section: ${await js('document.querySelector(".upd-row")?.textContent')}`);
      await clickEval(upd, 'automatic updates off');
      assert(await waitFor2(() => JSON.parse(fs.readFileSync(settingsFile, 'utf8')).autoUpdate === false, 3000), 'autoUpdate off not saved');
      await clickEval(upd, 'automatic updates on');
      assert(await waitFor2(() => !('autoUpdate' in JSON.parse(fs.readFileSync(settingsFile, 'utf8'))), 3000), 'autoUpdate on should clear the key');
      // Today's plan in the menu bar / tray: on by default, off is saved.
      const bar = 'document.querySelector(\'.menubar-row input[data-menubar="on"]\')';
      assert(await waitFor(`${bar}?.checked === true`, 2000), 'menu bar switch not on by default');
      await clickEval(bar, 'menu bar off');
      assert(await waitFor2(() => JSON.parse(fs.readFileSync(settingsFile, 'utf8')).menubar === false, 3000), 'menu bar off not saved');
      await clickEval(bar, 'menu bar on');
      assert(await waitFor2(() => !('menubar' in JSON.parse(fs.readFileSync(settingsFile, 'utf8'))), 3000), 'menu bar on should clear the key');
      await clickEval(box('enabled'), 'disable MCP');
      assert(await waitFor2(() => saved().enabled === false, 3000), 'not turned off');
      await press('Escape');
    });
  } catch (e) {
    failedStep = (e && e.message) || String(e);
  }

  for (const line of results) console.log(line);
  if (failedStep) console.log(`[E2E] FAIL: ${failedStep}`);
  else console.log(`[E2E] OK (${results.length} steps)`);
  // Windows keeps the app's files locked while it runs: a temp folder that
  // cannot go yet is left for the system to clear, never a reason to hang.
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* still in use */ }
  app.exit(failedStep ? 1 : 0);
}, 300));
