// Verifies the dev-only window.__mufkaCheckDue hook is ABSENT when the app
// reports as packaged. Uses its own window + stub IPC so isPackaged can be true.

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path'); const fs = require('fs'); const os = require('os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mufka-pkg-'));
app.setPath('userData', tmpDir);
ipcMain.on('mufka:isPackaged', (e) => { e.returnValue = true; });
ipcMain.handle('planner:load', () => null);
ipcMain.handle('planner:save', () => ({ ok: true }));
ipcMain.handle('planner:notify', () => ({ ok: true }));
ipcMain.handle('notes:tree', () => ({ folders: [], notes: [] }));
ipcMain.handle('notes:dailyDates', () => []);
ipcMain.handle('notes:readDaily', () => null);
// Called at launch since attachments and backlinks were added
ipcMain.handle('attach:list', () => []);
ipcMain.handle('notes:all', () => []);
ipcMain.handle('notes:layout', () => ({ daily: 'Daily', attachments: 'Attachments', relative: false }));
ipcMain.handle('bookmarks:list', () => []);
ipcMain.handle('vault:info', () => ({ name: 'Notes', path: '/tmp/Notes', custom: false }));

let sawError = false;
app.whenReady().then(() => {
  const win = new BrowserWindow({ show: false, webPreferences: {
    preload: path.join(__dirname, '..', 'out', 'preload', 'index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  const wc = win.webContents;
  wc.on('console-message', ({ level, message }) => { if (level === 'warning' || level === 'error') { sawError = true; console.log('[ERR]', message); } });
  win.loadFile(path.join(__dirname, '..', 'out', 'renderer', 'index.html')).then(() => setTimeout(async () => {
    const hook = await wc.executeJavaScript('typeof window.__mufkaCheckDue');
    console.log('[HOOK]', hook);
    if (hook !== 'undefined') sawError = true;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log(sawError ? '[RESULT] FAIL' : '[RESULT] OK');
    app.exit(sawError ? 1 : 0);
  }, 1500));
});
