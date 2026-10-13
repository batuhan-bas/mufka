// Render build/icon.svg to build/icon.png (1024x1024, transparent corners)
// with Electron's offscreen renderer, so no image library is needed.
// Run: npx electron scripts/make-icon.cjs  (scripts/make-icns.sh does this)
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'build/icon.svg'), 'utf8');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024, height: 1024, show: false, transparent: true,
    webPreferences: { offscreen: true },
  });
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 300));
  const img = (await win.webContents.capturePage()).resize({ width: 1024, height: 1024, quality: 'best' });
  fs.writeFileSync(path.join(root, 'build/icon.png'), img.toPNG());
  console.log('wrote build/icon.png');
  app.exit(0);
});
