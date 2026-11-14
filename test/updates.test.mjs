import test from 'node:test';
import assert from 'node:assert/strict';
import { autoUpdatesOn, updateStatus } from '../lib/updates.mjs';

test('automatic update checks are on unless turned off', () => {
  assert.equal(autoUpdatesOn({}), true);
  assert.equal(autoUpdatesOn(null), true);
  assert.equal(autoUpdatesOn({ autoUpdate: true }), true);
  assert.equal(autoUpdatesOn({ autoUpdate: false }), false);
});

test('status lines for each state', () => {
  const at = { current: '1.12.0', packaged: true };
  assert.deepEqual(updateStatus({ state: 'idle' }, at), { text: 'Mufka 1.12.0', restart: false });
  assert.equal(updateStatus({ state: 'checking' }, at).text, 'Checking for updates…');
  assert.equal(updateStatus({ state: 'downloading', version: '1.13.0', percent: 41.6 }, at).text, 'Downloading Mufka 1.13.0 · 42%');
  assert.equal(updateStatus({ state: 'downloading' }, at).text, 'Downloading Mufka');
  assert.deepEqual(updateStatus({ state: 'ready', version: '1.13.0' }, at), { text: 'Mufka 1.13.0 is ready; it is installed when Mufka restarts', restart: true });
  assert.equal(updateStatus({ state: 'none' }, at).text, 'Mufka 1.12.0 · up to date');
  assert.equal(updateStatus({ state: 'error', error: 'net::ERR_INTERNET_DISCONNECTED' }, at).text, 'Could not check for updates: net::ERR_INTERNET_DISCONNECTED');
  assert.equal(updateStatus({ state: 'ready', version: '9' }, { current: '1.12.0', packaged: false }).text, 'Mufka 1.12.0 · updates work in the installed app');
});
