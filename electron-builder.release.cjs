// npm run dist:release — the Mac build for Releases, signed with Calexis Labs'
// Developer ID and notarized by Apple, so it opens without "Open Anyway".
//
// The usual build (package.json "build") stays as it is: scripts/after-pack.cjs
// signs it ad-hoc or with a development identity. Here electron-builder signs
// instead (hardened runtime, entitlements), then sends the app to Apple.
//
// Needs, in the environment (never in the repo):
//   APPLE_API_KEY      path to the App Store Connect team key (.p8)
//   APPLE_API_KEY_ID   its Key ID
//   APPLE_API_ISSUER   the Issuer ID
// and the "Developer ID Application: Calexis Labs OU (B5XU49S3PN)" identity in
// the keychain. MUFKA_RELEASE_IDENTITY overrides the identity.

const base = require('./package.json').build;

const { afterPack, ...rest } = base;

module.exports = {
  ...rest,
  mac: {
    ...base.mac,
    identity: process.env.MUFKA_RELEASE_IDENTITY || 'Calexis Labs OU (B5XU49S3PN)',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: true,
  },
};
