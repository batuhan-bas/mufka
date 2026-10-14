import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MCP_URL, clientMetadata, redirectUrlFor, parseCallback, callbackPage,
  resultText, resultData, accountName, findTool,
} from '../lib/wispr.mjs';

test('Mufka registers as a public native client with a loopback redirect', () => {
  assert.equal(MCP_URL, 'https://api.wisprflow.ai/connect/mcp');
  const url = redirectUrlFor(51234);
  assert.equal(url, 'http://127.0.0.1:51234/callback');
  const m = clientMetadata(url);
  assert.deepEqual(m.redirect_uris, [url]);
  assert.equal(m.token_endpoint_auth_method, 'none');
  assert.deepEqual(m.grant_types, ['authorization_code', 'refresh_token']);
  assert.match(m.scope, /offline_access/);
});

test('the sign-in reply must carry our state', () => {
  assert.deepEqual(parseCallback('/callback?code=abc&state=s1', 's1'), { ok: true, code: 'abc' });
  assert.equal(parseCallback('/callback?code=abc&state=other', 's1').ok, false);
  assert.equal(parseCallback('/callback?code=abc', 's1').ok, false);
  assert.equal(parseCallback('/callback?code=abc&state=', '').ok, false);
  assert.equal(parseCallback('/favicon.ico', 's1'), null);
  assert.deepEqual(parseCallback('/callback?error=access_denied&state=s1', 's1'), { ok: false, error: 'Sign-in was cancelled' });
  assert.equal(parseCallback('/callback?state=s1', 's1').ok, false);
});

test('the callback page has no user input in it', () => {
  assert.match(callbackPage(true), /connected/);
  assert.match(callbackPage(false), /could not connect/);
});

test('tool results: text, data and the account name', () => {
  const text = { content: [{ type: 'text', text: '{"name":"Batuhan","aliases":["B"]}' }] };
  assert.equal(resultText(text), '{"name":"Batuhan","aliases":["B"]}');
  assert.deepEqual(resultData(text), { name: 'Batuhan', aliases: ['B'] });
  assert.equal(accountName(text), 'Batuhan');
  assert.equal(accountName({ structuredContent: { user: { display_name: 'Ada' } } }), 'Ada');
  assert.equal(accountName({ content: [{ type: 'text', text: 'Name: Ada Lovelace\nAliases: none' }] }), 'Ada Lovelace');
  assert.equal(accountName({ content: [] }), '');
  assert.equal(resultData({ content: [{ type: 'text', text: 'not json' }] }), null);
});

test('tools are found by name pattern', () => {
  const tools = [{ name: 'search_meetings' }, { name: 'get_account_info' }];
  assert.equal(findTool(tools, /account/).name, 'get_account_info');
  assert.equal(findTool(tools, /scratchpad/), null);
  assert.equal(findTool(undefined, /x/), null);
});
