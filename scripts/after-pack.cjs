// electron-builder afterPack hook: sign the packed Mufka.app before the .dmg is
// made (mac.identity is null, so electron-builder itself does not sign).
// See scripts/sign-mac.mjs for why.

const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  // A universal build packs x64 and arm64 apps first, then merges them; the
  // merge needs both unsigned, so only the merged app is signed.
  if (/-temp$/.test(context.appOutDir)) return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const { signApp } = await import('./sign-mac.mjs');
  const id = signApp(app);
  console.log(`  • signed ${path.basename(app)} with ${id === '-' ? 'an ad-hoc signature' : id}`);
};
