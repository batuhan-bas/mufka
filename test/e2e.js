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
// A repeating plan, as older data has them (no UI creates them now).
fs.writeFileSync(path.join(tmp, 'planlar.json'), JSON.stringify({ version: 3, items: [
  { id: 'rep1', scope: 'day', key: '2026-01-05', title: 'Vitamin', time: '', endTime: '', done: false, created: 1, recur: { type: 'daily' }, doneDates: {}, exceptions: {} },
] }));
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

require('../out/main/index.js'); // the build: npm test runs `npm run build` first

const notesDir = path.join(tmp, 'Notes');
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
async function clickEval(expr, label) { const r = await rectEval(expr); assert(r, `element not found: ${label || expr}`); await clickAt(r.x, r.y); }
async function clickSel(sel) { await clickEval(`document.querySelector(${JSON.stringify(sel)})`, sel); }
async function hoverClickEval(expr, label) { const r = await rectEval(expr); assert(r, `element not found: ${label || expr}`); wc.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y }); await sleep(70); await clickAt(r.x, r.y); }

async function typeText(t) { for (const ch of t) { wc.sendInputEvent({ type: 'char', keyCode: ch }); await sleep(10); } await sleep(50); }
async function press(keyCode, modifiers = []) { wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); await sleep(140); }
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
    for (const ch of digits) { wc.sendInputEvent({ type: 'keyDown', keyCode: ch }); wc.sendInputEvent({ type: 'char', keyCode: ch }); wc.sendInputEvent({ type: 'keyUp', keyCode: ch }); await sleep(90); }
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
      // two small moves: a hover needs a move into the slot, not just a position
      wc.sendInputEvent({ type: 'mouseMove', x: at.x, y: at.y - 3 }); await sleep(60);
      wc.sendInputEvent({ type: 'mouseMove', x: at.x, y: at.y });
      assert(await waitFor('!!document.querySelector(".pl-col .pl-hint:not([hidden])")', 2000), 'no hover hint');
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
        dest.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
        dest.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
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
      const g = await js(`(() => {
        const row = ${treeRow('Kutu')};
        const kids = [...document.querySelectorAll('.tree-row')].filter(r => r.dataset.rel && r.dataset.rel.startsWith('Kutu/'));
        const span = kids.length ? (kids[kids.length-1].offsetTop + kids[kids.length-1].offsetHeight) - (row.offsetTop + row.offsetHeight) : 0;
        const want = row.offsetTop + row.offsetHeight;
        const guide = [...document.querySelectorAll('.tree-guide')].find(x => Math.abs(x.offsetTop - want) < 3);
        return { found: !!guide, h: guide ? guide.offsetHeight : 0, span, pe: guide ? getComputedStyle(guide).pointerEvents : null, total: document.querySelectorAll('.tree-guide').length };
      })()`);
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
          assert(m.inside && m.gap >= 0 && m.gap <= 16, `${label}: ⋯ not within 16px of pane edge (gap ${m.gap})`);
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
        dest.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
        dest.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
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
      assert(await waitFor('document.querySelector(".note-body dl.frontmatter")', 2500), 'frontmatter not rendered as properties');
      assert(!(await js('!!document.querySelector(".note-body hr")')), 'frontmatter fence rendered as a rule');
      assert(await js('document.querySelectorAll(".note-body table th").length === 2'), 'table header missing');
      assert(await js('document.querySelector(".note-body td.align-right")?.textContent === "2"'), 'column alignment missing');
      assert(await js('[...document.querySelectorAll(".note-body .block")].some(b => b.querySelector("li ul input.task-check"))'), 'nested task not nested');
      assert(await js('[...document.querySelectorAll(".note-body sup.footnote-ref")].some(s => s.textContent === "[1]")'), 'footnote reference not resolved across blocks');
      await clickEval(`document.querySelector('.note-body li ul input.task-check')`, 'nested task checkbox');
      assert(await waitFor2(() => fs.readFileSync(blokPath, 'utf8') === src.replace('- [ ] alt gorev', '- [x] alt gorev'), 3000), 'nested task did not toggle exactly its line');
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
      assert(await waitFor('document.querySelector(".note-body dl.frontmatter")', 3000), 'note from the chosen folder not opened');
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
      assert((await js('getComputedStyle(document.querySelector(".note-body .callout-warning")).borderLeftColor')) === 'rgb(230, 162, 60)', 'callout color not applied');
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
      assert(await waitFor(`${api}?.ids().includes("Graf/G1.md") && ${api}.settled()`, 8000), 'graph did not show and settle');
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
      await press('O', ['meta']); await typeText('G3'); await enter();
      assert(await waitFor(`${title} === "G3"`, 3000), 'G3 did not open');
      await press('[', ['meta']);
      assert(await waitFor(`${title} === "G1"`, 3000), 'Cmd+[ did not go back');
      await press(']', ['meta']);
      assert(await waitFor(`${title} === "G3"`, 3000), 'Cmd+] did not go forward');
      await clickSel('#nav-back');
      assert(await waitFor(`${title} === "G1"`, 3000), 'back button did not go back');
      await clickSel('#nav-back');
      assert(await waitFor(`${title} === "Bahseden"`, 3000), 'second back wrong');
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
      assert(await waitFor('document.getElementById("vault-name")?.textContent === "Notes (Mufka)"', 2000), `notes folder name: ${await js('document.getElementById("vault-name")?.textContent')}`);
      await clickSel('#vault-btn');
      assert(await waitFor('[...document.querySelectorAll(".row-menu .menu-item")].map(b => b.textContent).join("|") === "Open another notes folder…|Show this folder in Finder"', 2000), 'notes folder menu wrong');
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
      // ⌃Tab back to notes and again to the planner
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
      assert(await waitFor('[...document.querySelectorAll(".row-menu .menu-item")].length === 4', 2000), 'sort menu missing');
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
      assert(await waitFor('!!document.querySelector(".tree-guide.depth-0")', 2000), 'no coloured guide');
    });

    await step(55, 'Settings: calendar and Wispr Flow connections shown, offline', async () => {
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
      assert(await js(`[...document.querySelectorAll('.tree-guide')].some(g => /224, 123, 181|e07bb5/i.test(g.style.background))`), 'guide is not pink');
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
  } catch (e) {
    failedStep = (e && e.message) || String(e);
  }

  for (const line of results) console.log(line);
  fs.rmSync(tmp, { recursive: true, force: true });
  if (failedStep) { console.log(`[E2E] FAIL: ${failedStep}`); app.exit(1); }
  else { console.log(`[E2E] OK (${results.length} steps)`); app.exit(0); }
}, 300));
