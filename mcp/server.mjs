// Mufka's MCP server over stdio, started by an AI client (Claude Desktop,
// Claude Code, Cursor) as its own process: the Mufka app with
// ELECTRON_RUN_AS_NODE=1, or node. Settings → AI clients (MCP) copies the
// command. stdout carries the protocol; anything else goes to stderr.
//   mcp-server.js [--user-data <Mufka's userData folder>]
import fs from 'node:fs';
import path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMufkaServer } from './tools.mjs';
import { userDataFrom, readSettings, locateVault } from './locate.mjs';
import pkg from '../package.json' with { type: 'json' };

const userData = userDataFrom(process.argv);
const settings = () => readSettings(userData);
const { server, syncWriteTools } = createMufkaServer({
  root: () => locateVault({ userData, settings: settings() }),
  settings,
  version: pkg.version,
});

// "Allow writing" switched in the app shows or hides the write tools here.
fs.watchFile(path.join(userData, 'settings.json'), { interval: 2000 }, () => syncWriteTools());

// The client closing our stdin is the end; the watcher would keep us alive.
const quit = () => { fs.unwatchFile(path.join(userData, 'settings.json')); process.exit(0); };
process.stdin.on('end', quit);
process.stdin.on('close', quit);

await server.connect(new StdioServerTransport());
process.stderr.write(`Mufka MCP server: notes in ${locateVault({ userData, settings: settings() })}\n`);
