// Packs the app for this machine (electron-builder --dir into dist-smoke/),
// then starts the MCP server the way an AI client will: the packaged app's
// own binary with ELECTRON_RUN_AS_NODE=1 and the server inside app.asar.
// Calls list_notes on the sample vault once and reads the MCP Apps view. Part of `npm run smoke:packaged`;
// run it before a release (it needs `npm run build` first).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import builder from 'electron-builder';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repo = fileURLToPath(new URL('..', import.meta.url));
const out = path.join(repo, 'dist-smoke');
const { version } = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
const { Platform, Arch } = builder;

// An ad-hoc signature is enough here (scripts/sign-mac.mjs reads this), and
// does not need the keychain unlocked; release builds still use Developer ID.
process.env.MUFKA_SIGN_IDENTITY ||= '-';
fs.rmSync(out, { recursive: true, force: true });
await builder.build({
  projectDir: repo,
  targets: Platform.current().createTarget('dir', Arch[process.arch]),
  config: { directories: { output: 'dist-smoke' } },
  publish: 'never',
});

// The packed app's binary and its app.asar.
const unpacked = fs.readdirSync(out).map((d) => path.join(out, d)).find((d) => fs.statSync(d).isDirectory());
const macApp = fs.readdirSync(unpacked).find((n) => n.endsWith('.app'));
const binary = process.platform === 'darwin' ? path.join(unpacked, macApp, 'Contents', 'MacOS', 'Mufka')
  : process.platform === 'win32' ? path.join(unpacked, 'Mufka.exe') : path.join(unpacked, 'mufka');
const resources = process.platform === 'darwin' ? path.join(unpacked, macApp, 'Contents', 'Resources') : path.join(unpacked, 'resources');
const server = path.join(resources, 'app.asar', 'out', 'main', 'mcp-server.js');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'mufka-mcp-smoke-'));
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ mcp: { enabled: true } }));
const transport = new StdioClientTransport({
  command: binary,
  args: [server, '--user-data', userData],
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', MUFKA_VAULT: path.join(repo, 'test', 'fixtures', 'mcp-vault') },
  stderr: 'pipe',
});
let errText = '';
transport.stderr?.on('data', (d) => { errText += d; });
const client = new Client({ name: 'packaged-smoke', version: '1.0.0' });
let ok = false;
try {
  await client.connect(transport);
  const v = client.getServerVersion();
  const res = await client.callTool({ name: 'list_notes', arguments: { sort: 'name' } });
  const body = JSON.parse(res.content[0].text);
  // The MCP Apps view, read from out/mcp-ui/ inside app.asar.
  const viewRes = await client.readResource({ uri: 'ui://mufka/view.html' });
  const viewHtml = viewRes.contents[0].text;
  ok = !res.isError && v.version === version && body.notes.some((n) => n.path === 'Home.md') && viewHtml.length > 100000 && viewHtml.includes('<div id="root">');
  console.log(`[MCP] server ${v.name} ${v.version} from ${path.relative(repo, server)}: ${body.total} notes, view ${(viewHtml.length / 1024).toFixed(0)} kB`);
} catch (err) {
  console.log(`[MCP] ${err.message}\n${errText}`);
} finally {
  await client.close().catch(() => {});
  fs.rmSync(userData, { recursive: true, force: true });
}
console.log(ok ? '[RESULT] OK' : '[RESULT] FAIL');
process.exit(ok ? 0 : 1);
