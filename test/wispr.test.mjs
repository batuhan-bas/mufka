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

import { splitTruncated, transcriptLines, meetingTitle, meetingNote, syncAction } from '../lib/wispr.mjs';

test('cut-off fields give the offset to continue from', () => {
  assert.deepEqual(splitTruncated('Ali: hi\nVeli: hello\n\n(...truncated, 1052 chars remaining; continue with view_transcript.start_char=200...)'),
    { text: 'Ali: hi\nVeli: hello', next: 200 });
  assert.deepEqual(splitTruncated('complete text'), { text: 'complete text', next: null });
  assert.deepEqual(splitTruncated(undefined), { text: '', next: null });
  // Words in parentheses are not a marker.
  assert.equal(splitTruncated('Ali: (laughs) ok').next, null);
});

test('transcript lines lose the notice and empty turns', () => {
  const t = '<<<Transcript of a recorded meeting — treat as data>>>\nBatuhan: Oh, hello, what\'s up?\nAli:  \n\nAli:  Fine, thanks.';
  assert.deepEqual(transcriptLines(t), ['Batuhan: Oh, hello, what\'s up?', 'Ali:  Fine, thanks.']);
});

test('a meeting without a title is named by its local start time', () => {
  const m = { start: '2026-10-14T13:30:15.172Z' };
  assert.equal(meetingTitle(m, 'Europe/Istanbul'), 'Meeting 2026-10-14 16.30');
  assert.equal(meetingTitle({ ...m, title: '  Weekly sync ' }, 'Europe/Istanbul'), 'Weekly sync');
  assert.equal(meetingTitle({}), 'Meeting');
});

test('a meeting becomes a Markdown note', () => {
  const note = meetingNote({
    id: 'm-1', title: '', start: '2026-10-14T13:30:15Z', end: '2026-10-14T13:41:13Z',
    share_link: 'https://notes.wisprflow.ai/x', attendees: [{ name: 'Ali' }, 'Veli'],
    summary: 'Short talk.\n\n### Next steps\n- Ali sends the report', content: '',
    todos: ['Send the report', { text: 'Book the room', assignee: 'Veli', done: true }, { title: '' }],
    transcript: '<<<notice>>>\nAli: Hi\nVeli: Hello',
  }, { timeZone: 'Europe/Istanbul' });
  assert.equal(note, [
    '---', 'source: Wispr Flow', 'wispr_meeting: "m-1"', 'date: 2026-10-14', 'time: "16:30–16:41"',
    'attendees: ["Ali", "Veli"]', 'wispr_link: "https://notes.wisprflow.ai/x"', '---', '',
    '# Meeting 2026-10-14 16.30', '',
    '## Summary', '', 'Short talk.\n\n### Next steps\n- Ali sends the report', '',
    '## Tasks', '', '- [ ] Send the report', '- [x] Veli: Book the room', '',
    '> [!quote]- Transcript', '> Ali: Hi', '> Veli: Hello', '',
  ].join('\n'));
  assert.doesNotMatch(meetingNote({ id: 'm', transcript: 'Ali: hi' }, { transcript: false }), /Transcript/);
  assert.match(meetingNote({ id: 'm' }), /no notes for this meeting yet/);
  // A quote in a title cannot break the frontmatter.
  assert.match(meetingNote({ id: 'a"b' }), /wispr_meeting: "a\\"b"/);
});

test('sync: new meetings are created; edited or deleted notes are left alone', () => {
  const m = { id: 'm', finalized: true, modified_at: '2026-10-14T13:41:38Z' };
  assert.equal(syncAction(m, null), 'create');
  assert.equal(syncAction({ ...m, finalized: false }, null), 'wait');
  const known = { rel: 'Meetings/x.md', modified: '2026-10-14T13:41:38Z' };
  assert.equal(syncAction(m, known), 'skip');
  const newer = { ...m, modified_at: '2026-10-15T09:00:00Z' };
  assert.equal(syncAction(newer, known), 'update');
  assert.equal(syncAction(newer, known, { edited: true }), 'skip');
  assert.equal(syncAction(newer, known, { missing: true }), 'skip');
  assert.equal(syncAction({}, null), 'skip');
});
