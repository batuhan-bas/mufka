// Re-sign a macOS .app so notifications work.
//
// Since Electron 42, notifications go through Apple's UNNotification API,
// which refuses apps whose signature is only the linker's automatic one
// (flags "adhoc,linker-signed") — that is what node_modules' Electron.app and
// an unsigned electron-builder build carry. A real signature fixes it:
//   1. MUFKA_SIGN_IDENTITY, if set;
//   2. else the first valid "Apple Development" / "Developer ID Application"
//      identity in the keychain (a stable identity: macOS remembers the
//      notification permission across rebuilds);
//   3. else an ad-hoc signature ("-"): works too, but each build is a new
//      identity, so macOS may ask for notification permission again.
// macOS also refuses apps that run from a temporary folder (/tmp).
//
// Usage: node scripts/sign-mac.mjs <path/to/App.app>   (also used by
// scripts/after-pack.cjs for npm run dist, and by npm run sign:dev).

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// `security find-identity -v -p codesigning` output → identity name or null.
export function pickIdentity(securityOutput) {
  const names = [...String(securityOutput).matchAll(/^\s*\d+\)\s+[0-9A-F]{40}\s+"([^"]+)"/gm)].map((m) => m[1]);
  return names.find((n) => n.startsWith('Developer ID Application:'))
    || names.find((n) => n.startsWith('Apple Development:'))
    || null;
}

export function chooseIdentity(env = process.env) {
  if (env.MUFKA_SIGN_IDENTITY) return env.MUFKA_SIGN_IDENTITY;
  try {
    return pickIdentity(execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' })) || '-';
  } catch {
    return '-';
  }
}

export function signApp(appPath, identity = chooseIdentity()) {
  execFileSync('codesign', ['--force', '--deep', '--sign', identity, appPath], { stdio: 'inherit' });
  return identity;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const appPath = process.argv[2];
  if (process.platform !== 'darwin') process.exit(0);
  if (!appPath) { console.error('usage: node scripts/sign-mac.mjs <App.app>'); process.exit(2); }
  const id = signApp(appPath);
  console.log(`signed ${appPath} with ${id === '-' ? 'an ad-hoc signature' : id}`);
}
