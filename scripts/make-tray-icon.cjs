// Draws the macOS menu bar icon from the app icon's mark (build/icon.svg):
// build/trayTemplate.png and @2x, black on transparent (macOS tints a
// "Template" image for light and dark menu bars). The Windows tray uses the
// app icon itself. Run it with Electron after changing the icon:
//   npx electron scripts/make-tray-icon.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path');

const build = path.join(__dirname, '..', 'build');
const svg = fs.readFileSync(path.join(build, 'icon.svg'), 'utf8');
const mark = svg.match(/<path d="([^"]+)"/)[1];
const dot = svg.match(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/);
// The mark sits in 129..552 × 104..567 of the inner tile; a square around it.
const art = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="96 90 490 490">
  <path d="${mark}" fill="#000"/><circle cx="${dot[1]}" cy="${dot[2]}" r="${dot[3]}" fill="#000"/></svg>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  for (const [name, size] of [['trayTemplate.png', 16], ['trayTemplate@2x.png', 32]]) {
    win.setContentSize(size, size);
    const html = `<html><body style="margin:0;background:transparent"><img width="${size}" height="${size}" src="data:image/svg+xml;base64,${Buffer.from(art).toString('base64')}"></body></html>`;
    await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
    await new Promise((r) => setTimeout(r, 300));
    const img = (await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })).resize({ width: size, height: size });
    fs.writeFileSync(path.join(build, name), img.toPNG());
    console.log(name, img.getSize());
  }
  app.quit();
});
