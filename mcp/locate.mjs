// Where Mufka keeps its data and notes, found without Electron: the MCP server
// runs as its own process (started by an AI client), not inside the app.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveVaultRoot, defaultNotesPlace } from '../lib/vault.mjs';

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const hasFiles = (p) => { try { return fs.readdirSync(p).some((n) => !n.startsWith('.')); } catch { return false; } };

// Electron's userData for an app named "Mufka". The copied client config
// passes --user-data with the app's real one; this is the fallback.
export function defaultUserData({ platform = process.platform, env = process.env, home = os.homedir() } = {}) {
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Mufka');
  if (platform === 'win32') return path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Mufka');
  return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Mufka');
}

export function readSettings(userData) {
  try { return JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8')) || {}; } catch { return {}; }
}

// The vault folder, in this order: MUFKA_VAULT (tests and the eval), the
// folder chosen in Settings, the one the app last opened (settings.vaultRoot:
// it knows the real Documents folder, which may be redirected on Windows),
// then the default the app would use.
export function locateVault({ userData, settings, env = process.env, home = os.homedir() }) {
  if (env.MUFKA_VAULT) return path.resolve(env.MUFKA_VAULT);
  const documents = path.join(home, 'Documents');
  const fallback = typeof settings.vaultRoot === 'string' && path.isAbsolute(settings.vaultRoot) && isDir(settings.vaultRoot)
    ? settings.vaultRoot
    : defaultNotesPlace({ userData, documents, settings, isDir, hasFiles }).root;
  return resolveVaultRoot(settings, fallback, isDir).root;
}

// --user-data <dir> from the command line, else the default.
export function userDataFrom(argv) {
  const i = argv.indexOf('--user-data');
  return i !== -1 && argv[i + 1] ? path.resolve(argv[i + 1]) : defaultUserData();
}
