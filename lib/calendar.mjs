// Pure helpers for calendars shown in the Planner (read-only). Today the
// source is Microsoft (Outlook / Microsoft 365, where Teams meetings live) via
// Microsoft Graph; main.js does the sign-in and the requests. Events are
// normalised to one shape so another source (Google) can be added later.

// Mufka's app registration in Microsoft Entra (a public client: no secret).
// MUFKA_MS_CLIENT_ID overrides it for development.
export const MS_CLIENT_ID = '';
export const MS_AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
export const MS_SCOPES = ['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read'];
export const GRAPH = 'https://graph.microsoft.com/v1.0';
export const REFRESH_EVERY_MS = 10 * 60 * 1000;

const PALETTE = ['#6F7CF0', '#3FB5A4', '#D9A13B', '#B383F2', '#E0786B', '#5AA9E6'];

// Graph's named calendar colours → a hex that reads on the dark theme.
const NAMED = {
  lightBlue: '#5AA9E6', lightGreen: '#3FB5A4', lightOrange: '#D9A13B', lightGray: '#9A9FA9',
  lightYellow: '#D9C23B', lightTeal: '#3FB5A4', lightPink: '#E0786B', lightBrown: '#B08A68', lightRed: '#E0786B',
};

export function calendarColor(cal, index = 0) {
  const hex = cal && typeof cal.hexColor === 'string' && /^#[0-9a-f]{6}$/i.test(cal.hexColor) ? cal.hexColor : null;
  return hex || (cal && NAMED[cal.color]) || PALETTE[index % PALETTE.length];
}

// The authorize URL for a sign-in with PKCE.
export function msAuthorizeUrl({ clientId, redirectUri, state, challenge }) {
  const q = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: MS_SCOPES.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `${MS_AUTHORITY}/authorize?${q}`;
}

// The loopback reply: our state, then a code or Microsoft's error.
export function parseMsCallback(url, expectedState) {
  let u;
  try { u = new URL(url, 'http://localhost'); } catch { return { ok: false, error: 'Bad sign-in reply' }; }
  if (u.pathname !== '/') return null;
  if (!expectedState || u.searchParams.get('state') !== expectedState) return { ok: false, error: 'The sign-in reply did not match; try again' };
  const err = u.searchParams.get('error');
  if (err) {
    const desc = u.searchParams.get('error_description') || '';
    return { ok: false, error: err === 'access_denied' ? 'Sign-in was cancelled' : `Microsoft refused: ${desc.split('\n')[0] || err}`.slice(0, 200) };
  }
  const code = u.searchParams.get('code');
  return code ? { ok: true, code } : { ok: false, error: 'No sign-in code came back' };
}

// Graph's dateTime has no zone; with `Prefer: outlook.timezone="UTC"` it is UTC.
function utc(dt) {
  const s = String((dt && dt.dateTime) || '');
  if (!s) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const HTTPS = /^https:\/\//i;
const JOIN_RE = /https:\/\/(?:teams\.microsoft\.com|teams\.live\.com|[\w-]+\.zoom\.us|zoom\.us|meet\.google\.com|[\w.-]+\.webex\.com)\/[^\s"'<>)\]]+/i;

// The meeting link: Graph's online meeting, else a Teams/Zoom/Meet/Webex link
// in the location or the body preview. https only.
export function joinUrl(ev) {
  const direct = (ev.onlineMeeting && ev.onlineMeeting.joinUrl) || ev.onlineMeetingUrl;
  if (direct && HTTPS.test(direct)) return direct;
  for (const text of [ev.location && ev.location.displayName, ev.bodyPreview]) {
    const m = JOIN_RE.exec(String(text || ''));
    if (m) return m[0];
  }
  return null;
}

// Graph event → Mufka's event shape. All-day events carry dates (end
// exclusive); timed ones carry UTC instants.
export function fromGraph(ev, cal, index = 0) {
  const start = utc(ev.start);
  const end = utc(ev.end);
  if (!ev || !ev.id || !start) return null;
  const allDay = Boolean(ev.isAllDay);
  const day = (d) => d.toISOString().slice(0, 10);
  return {
    id: `ms:${ev.id}`,
    source: 'microsoft',
    calendarId: cal ? cal.id : null,
    calendar: cal ? cal.name : '',
    color: calendarColor(cal, index),
    title: String(ev.subject || '').trim() || '(No title)',
    allDay,
    start: allDay ? null : start.toISOString(),
    end: allDay ? null : (end || start).toISOString(),
    startDate: allDay ? day(start) : null,
    endDate: allDay ? day(end || new Date(start.getTime() + 864e5)) : null,
    location: String((ev.location && ev.location.displayName) || '').trim(),
    joinUrl: joinUrl(ev),
    webLink: ev.webLink && HTTPS.test(ev.webLink) ? ev.webLink : null,
    organizer: String((ev.organizer && ev.organizer.emailAddress && ev.organizer.emailAddress.name) || ''),
    attendees: (ev.attendees || []).map((a) => a && a.emailAddress && (a.emailAddress.name || a.emailAddress.address)).filter(Boolean),
    cancelled: Boolean(ev.isCancelled),
    free: ev.showAs === 'free',
  };
}

const pad = (n) => String(n).padStart(2, '0');
const localKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// The events of one local day, as Planner items: all-day ones as they are,
// timed ones clipped to the day with 'HH:MM' times ('24:00' = runs past
// midnight). Cancelled events are left out.
export function eventsOnDay(events, date) {
  const key = localKey(date);
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const out = [];
  for (const ev of events || []) {
    if (!ev || ev.cancelled) continue;
    if (ev.allDay) {
      if (ev.startDate <= key && key < ev.endDate) out.push({ ...ev, kind: 'event', time: '', endTime: '' });
      continue;
    }
    const s = new Date(ev.start);
    const e = new Date(ev.end);
    if (!(s < dayEnd && (e > dayStart || +e === +s && s >= dayStart))) continue;
    const from = s < dayStart ? dayStart : s;
    const to = e > dayEnd ? dayEnd : e;
    out.push({ ...ev, kind: 'event', time: hm(from), endTime: +to === +dayEnd ? '24:00' : hm(to) });
  }
  return out.sort((a, b) => (a.time || '').localeCompare(b.time || '') || a.title.localeCompare(b.title));
}

// "09:30–10:00", "All day", or "Mon 14 Oct 22:00 – Tue 15 Oct 01:00" when it
// spans days (local time).
export function eventWhen(ev) {
  if (ev.allDay) {
    const days = Math.round((Date.parse(ev.endDate) - Date.parse(ev.startDate)) / 864e5);
    return days > 1 ? `All day · ${days} days` : 'All day';
  }
  const s = new Date(ev.start); const e = new Date(ev.end);
  const t = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (localKey(s) === localKey(e) || (+e - +s <= 864e5 && t(e) === '00:00' && localKey(new Date(+e - 1)) === localKey(s))) return `${t(s)}–${t(e)}`;
  const d = (x) => x.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${d(s)} ${t(s)} – ${d(e)} ${t(e)}`;
}

// The small page the browser shows after signing in (fixed text only).
export function callbackPage(ok) {
  const msg = ok ? 'Mufka is connected to your Microsoft calendar. You can close this tab.' : 'Mufka could not connect to your Microsoft calendar. Go back to Mufka and try again.';
  return `<!doctype html><meta charset="utf-8"><title>Mufka</title><body style="font:16px -apple-system,sans-serif;padding:48px;color:#222">${msg}</body>`;
}
