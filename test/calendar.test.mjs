process.env.TZ = 'Europe/Istanbul'; // UTC+3: local days below are Istanbul days

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MS_SCOPES, calendarColor, msAuthorizeUrl, parseMsCallback, joinUrl, fromGraph, eventsOnDay, eventWhen,
} from '../lib/calendar.mjs';

const cal = { id: 'c1', name: 'Calendar', hexColor: '#3366ff' };

test('sign-in asks only for reading calendars (plus who you are and staying signed in)', () => {
  assert.deepEqual(MS_SCOPES, ['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read']);
  const u = new URL(msAuthorizeUrl({ clientId: 'abc', redirectUri: 'http://localhost:5050', state: 's', challenge: 'ch' }));
  assert.equal(u.origin + u.pathname, 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('redirect_uri'), 'http://localhost:5050');
  assert.equal(u.searchParams.get('scope'), 'openid profile offline_access User.Read Calendars.Read');
});

test('the sign-in reply must carry our state', () => {
  assert.deepEqual(parseMsCallback('/?code=abc&state=s1', 's1'), { ok: true, code: 'abc' });
  assert.equal(parseMsCallback('/?code=abc&state=x', 's1').ok, false);
  assert.equal(parseMsCallback('/favicon.ico', 's1'), null);
  assert.deepEqual(parseMsCallback('/?error=access_denied&state=s1', 's1'), { ok: false, error: 'Sign-in was cancelled' });
  assert.match(parseMsCallback('/?error=invalid_request&error_description=AADSTS50011%3A+bad+redirect&state=s1', 's1').error, /AADSTS50011/);
});

test('calendar colours: Graph hex, else a named colour, else the palette', () => {
  assert.equal(calendarColor(cal), '#3366ff');
  assert.equal(calendarColor({ color: 'lightGreen' }), '#3FB5A4');
  assert.equal(calendarColor({ hexColor: '', color: 'auto' }, 1), '#3FB5A4');
});

test('meeting links: online meeting first, then a known link in the text; https only', () => {
  assert.equal(joinUrl({ onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/x' } }), 'https://teams.microsoft.com/l/meetup-join/x');
  assert.equal(joinUrl({ location: { displayName: 'Zoom https://acme.zoom.us/j/123?pwd=a' } }), 'https://acme.zoom.us/j/123?pwd=a');
  assert.equal(joinUrl({ bodyPreview: 'Join: https://meet.google.com/abc-defg-hij.' }), 'https://meet.google.com/abc-defg-hij.');
  assert.equal(joinUrl({ onlineMeetingUrl: 'javascript:alert(1)' }), null);
  assert.equal(joinUrl({ bodyPreview: 'http://teams.microsoft.com/x' }), null);
  assert.equal(joinUrl({}), null);
});

test('Graph events become Mufka events', () => {
  const timed = fromGraph({
    id: 'e1', subject: ' Standup ', isAllDay: false,
    start: { dateTime: '2026-10-15T06:30:00.0000000', timeZone: 'UTC' },
    end: { dateTime: '2026-10-15T07:00:00.0000000', timeZone: 'UTC' },
    location: { displayName: 'Room 2' }, onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/x' },
    organizer: { emailAddress: { name: 'Ali' } }, attendees: [{ emailAddress: { name: 'Veli', address: 'v@x.com' } }],
    webLink: 'https://outlook.office365.com/owa/?itemid=1', showAs: 'busy',
  }, cal);
  assert.equal(timed.id, 'ms:e1');
  assert.equal(timed.title, 'Standup');
  assert.equal(timed.start, '2026-10-15T06:30:00.000Z');
  assert.equal(timed.end, '2026-10-15T07:00:00.000Z');
  assert.equal(timed.joinUrl, 'https://teams.microsoft.com/l/x');
  assert.deepEqual([timed.organizer, timed.attendees, timed.color, timed.allDay], ['Ali', ['Veli'], '#3366ff', false]);
  const allDay = fromGraph({ id: 'e2', subject: '', isAllDay: true,
    start: { dateTime: '2026-10-16T00:00:00.0000000' }, end: { dateTime: '2026-10-18T00:00:00.0000000' } }, cal);
  assert.deepEqual([allDay.title, allDay.startDate, allDay.endDate, allDay.start], ['(No title)', '2026-10-16', '2026-10-18', null]);
  assert.equal(fromGraph({ id: 'x' }, cal), null);
  assert.equal(fromGraph({ id: 'w', start: { dateTime: '2026-10-15T06:00:00' }, webLink: 'file:///etc' }, cal).webLink, null);
});

test('a day shows its events: all-day by date, timed ones clipped to the day', () => {
  const ev = (id, start, end) => fromGraph({ id, subject: id, start: { dateTime: start }, end: { dateTime: end } }, cal);
  const events = [
    ev('morning', '2026-10-15T06:30:00', '2026-10-15T07:00:00'), // 09:30–10:00 local
    ev('late', '2026-10-15T20:00:00', '2026-10-15T22:30:00'), // 23:00–01:30 local
    fromGraph({ id: 'trip', subject: 'Trip', isAllDay: true, start: { dateTime: '2026-10-15T00:00:00' }, end: { dateTime: '2026-10-17T00:00:00' } }, cal),
    { ...ev('gone', '2026-10-15T08:00:00', '2026-10-15T09:00:00'), cancelled: true },
  ];
  const d15 = eventsOnDay(events, new Date(2026, 9, 15));
  assert.deepEqual(d15.map((e) => [e.title, e.time, e.endTime]), [['Trip', '', ''], ['morning', '09:30', '10:00'], ['late', '23:00', '24:00']]);
  const d16 = eventsOnDay(events, new Date(2026, 9, 16));
  assert.deepEqual(d16.map((e) => [e.title, e.time, e.endTime]), [['Trip', '', ''], ['late', '00:00', '01:30']]);
  assert.deepEqual(eventsOnDay(events, new Date(2026, 9, 17)), []);
  assert.equal(d15[1].kind, 'event');
});

test('when an event happens, in words', () => {
  const ev = (start, end) => fromGraph({ id: 'x', start: { dateTime: start }, end: { dateTime: end } }, cal);
  assert.equal(eventWhen(ev('2026-10-15T06:30:00', '2026-10-15T07:00:00')), '09:30–10:00');
  assert.equal(eventWhen(ev('2026-10-15T20:00:00', '2026-10-15T21:00:00')), '23:00–00:00');
  assert.match(eventWhen(ev('2026-10-15T20:00:00', '2026-10-15T22:30:00')), /^Thu 15 Oct 23:00 – Fri 16 Oct 01:30$/);
  assert.equal(eventWhen(fromGraph({ id: 'a', isAllDay: true, start: { dateTime: '2026-10-15T00:00:00' }, end: { dateTime: '2026-10-17T00:00:00' } }, cal)), 'All day · 2 days');
});

import { GOOGLE_SCOPES, googleAuthorizeUrl, fromGoogle, callbackPage } from '../lib/calendar.mjs';

test('Google sign-in: calendar read only, offline access, PKCE', () => {
  assert.deepEqual(GOOGLE_SCOPES, ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar.readonly']);
  const u = new URL(googleAuthorizeUrl({ clientId: 'id.apps', redirectUri: 'http://127.0.0.1:5050', state: 's', challenge: 'ch' }));
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('redirect_uri'), 'http://127.0.0.1:5050');
  assert.match(callbackPage(true, 'Google'), /Google calendar/);
});

test('Google events become Mufka events', () => {
  const gcal = { id: 'primary', name: 'Me', hexColor: '#039be5' };
  const timed = fromGoogle({
    id: 'a', summary: 'Planning', status: 'confirmed',
    start: { dateTime: '2026-10-15T09:30:00+03:00' }, end: { dateTime: '2026-10-15T10:00:00+03:00' },
    hangoutLink: 'https://meet.google.com/abc-defg-hij', htmlLink: 'https://www.google.com/calendar/event?eid=x',
    organizer: { email: 'ali@x.com', displayName: 'Ali' },
    attendees: [{ email: 'me@x.com', self: true, responseStatus: 'accepted' }, { email: 'veli@x.com' }, { email: 'room@x.com', resource: true }],
  }, gcal);
  assert.equal(timed.id, 'g:a');
  assert.equal(timed.start, '2026-10-15T06:30:00.000Z');
  assert.equal(timed.joinUrl, 'https://meet.google.com/abc-defg-hij');
  assert.deepEqual([timed.organizer, timed.attendees, timed.color, timed.cancelled], ['Ali', ['veli@x.com'], '#039be5', false]);
  const allDay = fromGoogle({ id: 'b', summary: 'Trip', start: { date: '2026-10-16' }, end: { date: '2026-10-18' }, transparency: 'transparent' }, gcal);
  assert.deepEqual([allDay.allDay, allDay.startDate, allDay.endDate, allDay.free], [true, '2026-10-16', '2026-10-18', true]);
  const zoom = fromGoogle({ id: 'c', start: { dateTime: '2026-10-15T12:00:00Z' }, end: { dateTime: '2026-10-15T13:00:00Z' },
    conferenceData: { entryPoints: [{ entryPointType: 'phone', uri: 'tel:+1' }, { entryPointType: 'video', uri: 'https://acme.zoom.us/j/1' }] } }, gcal);
  assert.equal(zoom.joinUrl, 'https://acme.zoom.us/j/1');
  assert.equal(zoom.title, '(No title)');
  const declined = fromGoogle({ id: 'd', start: { dateTime: '2026-10-15T12:00:00Z' }, attendees: [{ self: true, responseStatus: 'declined' }] }, gcal);
  assert.equal(declined.cancelled, true);
  assert.equal(fromGoogle({ id: 'e', start: {} }, gcal), null);
  assert.equal(fromGoogle({ id: 'f', status: 'cancelled', start: { date: '2026-10-15' } }, gcal).cancelled, true);
});

test('your own meetings show no organizer line', () => {
  const g = fromGoogle({ id: 'o', start: { dateTime: '2026-10-15T17:30:00Z' }, organizer: { email: 'me@x.com', self: true } }, { id: 'p' });
  assert.equal(g.organizer, '');
  const m = fromGraph({ id: 'o', isOrganizer: true, start: { dateTime: '2026-10-15T17:30:00' }, organizer: { emailAddress: { name: 'Me' } } }, { id: 'c' });
  assert.equal(m.organizer, '');
  assert.equal(fromGraph({ id: 'o2', start: { dateTime: '2026-10-15T17:30:00' }, organizer: { emailAddress: { name: 'Ali' } } }, { id: 'c' }).organizer, 'Ali');
});
