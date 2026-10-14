// Pure helpers for the Wispr Flow connection: Mufka is an MCP client of
// Wispr Flow's read-only remote MCP server (Notetaker meetings, Scratchpad,
// calendar). Sign-in is OAuth in the browser (dynamic client registration +
// PKCE, a loopback redirect); main.js does the network and the storage.

export const MCP_URL = 'https://api.wisprflow.ai/connect/mcp';
export const CALLBACK_PATH = '/callback';
export const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

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
