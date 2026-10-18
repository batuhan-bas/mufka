// Screenshots of Mufka with made-up data, for checking how it looks on another
// system (CI uploads them). Uses temp folders only: never the real notes.
//   electron scripts/screens.cjs <out dir>      (after `npm run build`)
const { app, BrowserWindow } = require('electron');
const path = require('path'); const fs = require('fs'); const os = require('os');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mufka-screens-'));
app.setPath('userData', tmp);
app.setPath('documents', path.join(tmp, 'Documents'));
const out = path.resolve(process.argv[process.argv.length - 1]);
fs.mkdirSync(out, { recursive: true });

const vault = path.join(tmp, 'Documents', 'Mufka');
const note = (rel, text) => { fs.mkdirSync(path.dirname(path.join(vault, rel)), { recursive: true }); fs.writeFileSync(path.join(vault, rel), text); };
note('Projects/Mufka/Roadmap.md', '---\ntags: project\nstatus: active\n---\nA calm place for plans and notes. See [[Ideas]].\n\n## Now\n\n- [x] Week planner\n- [ ] Windows build\n\n> [!tip] Principle\n> Every note is a file you own.\n\n| Day | Plan |\n|---|---|\n| Mon | Write |\n');
note('Projects/Website.md', '# Website\n');
note('Meetings/Sprint review.md', '# Sprint review\n');
note('Ideas.md', '# Ideas\n\n- A weekly review\n');
fs.mkdirSync(path.join(vault, '.mufka'), { recursive: true });
fs.writeFileSync(path.join(vault, '.mufka', 'tree.json'), JSON.stringify({ version: 1, items: { Projects: { color: 'violet', icon: 'tiBriefcase' }, Meetings: { color: 'teal', icon: 'tiUsers' }, 'Ideas.md': { icon: 'tiLightbulb' } }, order: {} }));
const day = (off) => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const plan = (n, key, title, time = '', endTime = '', extra = {}) => ({ id: `p${n}`, scope: 'day', key, title, time, endTime, done: false, created: n, recur: null, doneDates: {}, exceptions: {}, ...extra });
fs.writeFileSync(path.join(tmp, 'planlar.json'), JSON.stringify({ version: 3, items: [
  plan(1, day(0), 'Morning run', '07:30', '08:15', { recur: { type: 'weekdays', days: [1, 3, 5] } }),
  plan(2, day(1), 'Design review', '10:00', '11:30'),
  plan(3, day(2), 'Read 20 pages'),
  plan(4, day(3), 'Write the release notes', '14:00', '16:00'),
  plan(5, day(4), 'Clean the desk'),
] }));

require(path.join(__dirname, '..', 'out', 'main', 'index.js'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  try {
    await sleep(2000);
    const win = BrowserWindow.getAllWindows()[0]; const wc = win.webContents;
    win.setContentSize(1280, 800); await sleep(300);
    const js = (code) => wc.executeJavaScript(code);
    const shot = async (name) => { await sleep(400); fs.writeFileSync(path.join(out, `${name}.png`), (await wc.capturePage()).toPNG()); };
    await js('try{localStorage.setItem("mufka-welcome","done")}catch{}; true');
    await js('document.getElementById("mode-planner").click(); true'); await sleep(800);
    await shot('1-planner');
    await js('document.getElementById("mode-notes").click(); true'); await sleep(500);
    const click = (name) => js(`(()=>{const r=[...document.querySelectorAll('.tree-row')].find(r=>r.querySelector('.tree-name')?.textContent===${JSON.stringify(name)}); r?.click(); return !!r})()`);
    for (const f of ['Projects', 'Mufka']) { await click(f); await sleep(250); }
    await click('Roadmap'); await sleep(800);
    await shot('2-note');
    await js('document.querySelector(\'.side-btn[aria-label="New note from template"]\').click(); true'); await sleep(500);
    await shot('3-templates');
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' }); await sleep(300);
    await js('document.getElementById("foot-keys").click(); true'); await sleep(500);
    await shot('4-shortcuts');
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' }); await sleep(300);
    wc.send('menu:action', 'settings'); await sleep(900);
    await shot('5-settings');
    const info = await js('({ cls: document.documentElement.className, kbd: [...document.querySelectorAll("kbd")].map(k => k.textContent), font: getComputedStyle(document.body).fontFamily })');
    fs.writeFileSync(path.join(out, 'info.json'), JSON.stringify({ platform: process.platform, ...info }, null, 2));
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    app.exit(process.exitCode || 0);
  }
});
