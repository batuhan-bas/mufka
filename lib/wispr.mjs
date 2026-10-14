// Pure helpers for the Wispr Flow connection: Mufka is an MCP client of
// Wispr Flow's read-only remote MCP server (Notetaker meetings, Scratchpad,
// calendar). Sign-in is OAuth in the browser (dynamic client registration +
// PKCE, a loopback redirect); main.js does the network and the storage.

export const MCP_URL = 'https://api.wisprflow.ai/connect/mcp';
export const CALLBACK_PATH = '/callback';
export const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
// Imported meetings go to this vault folder (created by the first import).
export const MEETINGS_FOLDER = 'Meetings';
export const SYNC_EVERY_MS = 15 * 60 * 1000;

// What Mufka registers itself as: a public (no secret) native client.
export function clientMetadata(redirectUrl) {
  return {
    client_name: 'Mufka',
    redirect_uris: [String(redirectUrl)],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: 'openid offline_access',
  };
}

export function redirectUrlFor(port) {
  return `http://127.0.0.1:${port}${CALLBACK_PATH}`;
}

// The browser comes back to the loopback server: accept only our path, with
// the state we sent, and either a code or the provider's error.
export function parseCallback(url, expectedState) {
  let u;
  try { u = new URL(url, 'http://127.0.0.1'); } catch { return { ok: false, error: 'Bad sign-in reply' }; }
  if (u.pathname !== CALLBACK_PATH) return null;
  if (!expectedState || u.searchParams.get('state') !== expectedState) return { ok: false, error: 'The sign-in reply did not match; try again' };
  const err = u.searchParams.get('error');
  if (err) return { ok: false, error: err === 'access_denied' ? 'Sign-in was cancelled' : `Wispr Flow refused: ${err}` };
  const code = u.searchParams.get('code');
  return code ? { ok: true, code } : { ok: false, error: 'No sign-in code came back' };
}

// The small page the browser shows after sign-in (plain text content only).
export function callbackPage(ok) {
  const msg = ok ? 'Mufka is connected to Wispr Flow. You can close this tab.' : 'Mufka could not connect to Wispr Flow. Go back to Mufka and try again.';
  return `<!doctype html><meta charset="utf-8"><title>Mufka</title><body style="font:16px -apple-system,sans-serif;padding:48px;color:#222">${msg}</body>`;
}

// The text of an MCP tool result: its text parts joined.
export function resultText(result) {
  const parts = (result && Array.isArray(result.content)) ? result.content : [];
  return parts.filter((p) => p && p.type === 'text' && typeof p.text === 'string').map((p) => p.text).join('\n');
}

// The structured part of a result: structuredContent, else JSON in the text.
export function resultData(result) {
  if (result && result.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent;
  const text = resultText(result).trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// A display name from the account tool's answer, whatever its shape.
export function accountName(result) {
  const data = resultData(result);
  const pick = (o) => o && (o.name || o.display_name || o.displayName || o.full_name || o.email);
  const fromData = pick(data) || pick(data && (data.user || data.account));
  if (fromData) return String(fromData);
  const line = resultText(result).split('\n').map((s) => s.trim()).find(Boolean);
  return line ? line.replace(/^(name|user)\s*:\s*/i, '').slice(0, 80) : '';
}

// The tool that answers "who am I": its name contains "account" (Wispr
// names it get_account_info today); found by name so a rename does not break it.
export function findTool(tools, pattern) {
  return (tools || []).find((t) => pattern.test(t.name)) || null;
}

// --- meetings → notes -------------------------------------------------------
// Long fields arrive in ranges: "(...truncated, N chars remaining; continue
// with view_transcript.start_char=12000...)" ends a cut-off one.

const TRUNC_RE = /\s*\(\.\.\.truncated,[^)]*?start_char=(\d+)[^)]*\)\s*$/;

// → { text, next }: the text without the marker, and the offset to continue
// from (null when complete).
export function splitTruncated(text) {
  const s = String(text || '');
  const m = TRUNC_RE.exec(s);
  return m ? { text: s.slice(0, m.index), next: Number(m[1]) } : { text: s, next: null };
}

// Wispr wraps a transcript in a one-line "<<< … >>>" notice; the rest is
// "Speaker: words" lines.
export function transcriptLines(text) {
  return String(text || '').split('\n')
    .filter((l) => !/^<<<.*>>>\s*$/.test(l.trim()))
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '' && !/^[^:]{1,60}:\s*$/.test(l));
}

function parts(date, timeZone) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const o = Object.fromEntries(f.formatToParts(date).map((p) => [p.type, p.value]));
  return { day: `${o.year}-${o.month}-${o.day}`, time: `${o.hour}:${o.minute}` };
}

// The note's title: Wispr's title, else "Meeting 2026-10-14 16.30" (local time).
export function meetingTitle(m, timeZone) {
  const t = String((m && m.title) || '').trim();
  if (t) return t;
  const start = m && m.start ? new Date(m.start) : null;
  if (!start || Number.isNaN(start.getTime())) return 'Meeting';
  const p = parts(start, timeZone);
  return `Meeting ${p.day} ${p.time.replace(':', '.')}`;
}

// A todo may be a string or an object; done ones are ticked.
function todoLine(t) {
  if (typeof t === 'string') return t.trim() ? `- [ ] ${t.trim()}` : '';
  if (!t || typeof t !== 'object') return '';
  const text = String(t.text || t.title || t.description || t.content || '').trim();
  if (!text) return '';
  const done = Boolean(t.done || t.completed || t.is_completed || t.status === 'done' || t.status === 'completed');
  const who = String(t.assignee || t.owner || '').trim();
  return `- [${done ? 'x' : ' '}] ${who && !text.startsWith(who) ? `${who}: ` : ''}${text}`;
}

const yaml = (s) => JSON.stringify(String(s));

// The whole note for a meeting (from get_meeting, transcript already joined).
export function meetingNote(m, { timeZone, transcript = true } = {}) {
  const title = meetingTitle(m, timeZone);
  const start = m.start ? new Date(m.start) : null;
  const end = m.end ? new Date(m.end) : null;
  const ok = (d) => d && !Number.isNaN(d.getTime());
  const fm = ['---', 'source: Wispr Flow', `wispr_meeting: ${yaml(m.id)}`];
  if (ok(start)) {
    const p = parts(start, timeZone);
    fm.push(`date: ${p.day}`, `time: ${yaml(ok(end) ? `${p.time}–${parts(end, timeZone).time}` : p.time)}`);
  }
  const names = (m.attendees || []).map((a) => (typeof a === 'string' ? a : a && (a.name || a.display_name || a.email))).filter(Boolean);
  if (names.length) fm.push(`attendees: [${names.map(yaml).join(', ')}]`);
  if (m.share_link) fm.push(`wispr_link: ${yaml(m.share_link)}`);
  fm.push('---', '');
  const out = [...fm, `# ${title}`, ''];
  const summary = String(m.summary || '').trim();
  if (summary) out.push('## Summary', '', summary, '');
  const todos = (m.todos || []).map(todoLine).filter(Boolean);
  if (todos.length) out.push('## Tasks', '', ...todos, '');
  const notes = String(m.content || '').trim();
  if (notes) out.push('## My notes', '', notes, '');
  const lines = transcript ? transcriptLines(m.transcript) : [];
  if (lines.length) out.push('> [!quote]- Transcript', ...lines.map((l) => `> ${l}`), '');
  if (!summary && !todos.length && !notes && !lines.length) out.push('_Wispr Flow has no notes for this meeting yet._', '');
  return `${out.join('\n').trimEnd()}\n`;
}

// What to do with each meeting. known: { [id]: { rel, modified } }; state of
// the note on disk: missing (deleted by the user) / edited (changed since the
// import). A deleted or edited note is left alone; drafts wait for Wispr.
export function syncAction(meeting, known, disk = {}) {
  if (!meeting || !meeting.id) return 'skip';
  if (meeting.finalized === false) return 'wait';
  if (!known) return 'create';
  if (disk.missing) return 'skip';
  if (String(meeting.modified_at || '') <= String(known.modified || '')) return 'skip';
  return disk.edited ? 'skip' : 'update';
}
