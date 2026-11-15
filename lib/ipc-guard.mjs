// Privileged IPC is answered only for Mufka's own window: a renderer main.js
// registered, from its main frame (not an embedded frame), still showing the
// app's page — out/renderer/index.html in a build, the dev server's
// index.html in development. test/ipc-security.test.mjs checks this.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// appRenderers: ids of the app's webContents; isPackaged and devUrl are read
// on each call; rendererFile: the built page's absolute path.
export function createSenderCheck({ appRenderers, isPackaged, devUrl, rendererFile }) {
  function trustedSender(event) {
    try {
      if (!appRenderers.has(event.sender.id) || !event.senderFrame || event.senderFrame !== event.sender.mainFrame) return false;
      const url = new URL(event.senderFrame.url);
      const dev = devUrl();
      if (!isPackaged() && dev) {
        const expected = new URL(`${dev}/index.html`);
        return url.origin === expected.origin && url.pathname === expected.pathname;
      }
      return url.protocol === 'file:' && fileURLToPath(url) === path.resolve(rendererFile);
    } catch { return false; }
  }

  function assertTrustedSender(event) {
    if (!trustedSender(event)) throw new Error('unauthorized IPC sender');
  }

  // Notes IPC. Each handler wraps a helper and reports errors as { error }.
  function wrap(fn) {
    return async (_e, ...args) => {
      try { assertTrustedSender(_e); return await fn(...args); } catch (err) { return { error: err.message }; }
    };
  }

  return { trustedSender, assertTrustedSender, wrap };
}
