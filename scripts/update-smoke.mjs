// Checks the updater end to end on this Mac: packs Mufka twice — as it is
// (the installed app) and as version 99.0.0 (the update: a zip and its
// latest-mac.yml, as a release carries them) — serves the update from a
// local server, starts the installed one pointed at it (MUFKA_UPDATE_FEED),
// and waits for it to find and download 99.0.0.
//
// Both are named "MufkaUpdateTest" with their own app id, so they have their
// own data folder and caches and never touch the real Mufka's settings, notes
// or updater state. It passes when the system updater (Squirrel.Mac) has the
// update ready to install; signed ad hoc, a signature refusal at that step
// still shows the feed and the download work (the log says which happened).
// `npm run smoke:update` (needs `npm run build` first; macOS).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import builder from 'electron-builder';

const repo = fileURLToPath(new URL('..', import.meta.url));
const out = path.join(repo, 'dist-update');
const NAME = 'MufkaUpdateTest';
const { Platform, Arch } = builder;
process.env.MUFKA_SIGN_IDENTITY ||= '-';
fs.rmSync(out, { recursive: true, force: true });

const pack = (target, dir, version) => builder.build({
  projectDir: repo,
  targets: Platform.MAC.createTarget(target, Arch[process.arch]),
  // Its own id and name: no shared updater cache or ShipIt state with Mufka.
  config: { appId: 'com.mufka.updatetest', productName: NAME, directories: { output: path.join(out, dir) }, extraMetadata: { name: 'mufka-update-test', productName: NAME, ...(version ? { version } : {}) } },
  publish: 'never',
});
// A zip target, as releases have: electron-builder writes the app's
// app-update.yml (where to look for updates) only for dmg or zip targets.
await pack('zip', 'installed');
await pack('zip', 'feed', '99.0.0');

const feed = path.join(out, 'feed');
if (!fs.existsSync(path.join(feed, 'latest-mac.yml'))) throw new Error(`no latest-mac.yml in ${feed}: ${fs.readdirSync(feed)}`);
const server = http.createServer((req, res) => {
  const file = path.join(feed, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(feed) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-length': fs.statSync(file).size });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

// Its own data folder (named after the app) with a throwaway vault.
const userData = path.join(os.homedir(), 'Library', 'Application Support', NAME);
const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'mufka-update-vault-'));
fs.mkdirSync(userData, { recursive: true });
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ vaultPath: vault }));

const installedDir = fs.readdirSync(path.join(out, 'installed')).map((d) => path.join(out, 'installed', d)).find((d) => fs.statSync(d).isDirectory());
const bin = path.join(installedDir, `${NAME}.app`, 'Contents', 'MacOS', NAME);
const child = spawn(bin, [], { env: { ...process.env, MUFKA_UPDATE_FEED: url }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
child.stdout.on('data', (d) => { log += d; });
child.stderr.on('data', (d) => { log += d; });

const found = () => /Found version 99\.0\.0/.test(log);
// main.js logs this once the system updater (Squirrel.Mac) has the update.
const downloaded = () => /Mufka 99\.0\.0 is ready to install/.test(log);
const signature = () => /code signature|did not pass validation|designated requirement/i.test(log);
const t0 = Date.now();
while (Date.now() - t0 < 180000 && !(downloaded() || (found() && signature()))) await new Promise((r) => setTimeout(r, 500));
child.kill();
server.close();
fs.rmSync(userData, { recursive: true, force: true });
fs.rmSync(vault, { recursive: true, force: true });
for (const dir of ['mufka-update-test-updater', 'com.mufka.updatetest.ShipIt', 'com.mufka.updatetest']) fs.rmSync(path.join(os.homedir(), 'Library', 'Caches', dir), { recursive: true, force: true });

const lines = log.split('\n').filter((l) => /update|version|download|error|signature/i.test(l)).slice(-12);
console.log(lines.map((l) => `  ${l.trim()}`).join('\n'));
if (downloaded()) console.log('[UPDATE] OK: found and downloaded 99.0.0');
else if (found() && signature()) console.log('[UPDATE] OK (feed and download): found and fetched 99.0.0; the system refused the ad-hoc signature, as expected without Developer ID');
else console.log(`[UPDATE] FAIL: the update was not found or not downloaded\n--- app output ---\n${log.split('\n').slice(-30).join('\n')}`);
process.exit(downloaded() || (found() && signature()) ? 0 : 1);
