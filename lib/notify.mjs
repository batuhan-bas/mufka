// Pure logic for deciding which plans are "due now". No DOM, no Electron.
// A plan is due when its clock time is reached while the app is running; the
// caller passes the window (since, now] so a plan only fires as its minute
// arrives, never retroactively on launch.

import { dayKey, parseDayKey } from './dates.mjs';
import { occursOn } from './recur.mjs';

// Minutes since midnight for an 'HH:MM' string, or null if malformed.
function minutesOf(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time || '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Day-scoped, timed, not-done plans whose scheduled instant on `now`'s date
// falls in (sinceMs, nowMs]. Returns { id, title, time } view objects.
// `now` is a Date; sinceMs/nowMs are epoch ms (nowMs defaults to now.getTime()).
// A day plan that happens on `date` and is not done there: a one-off on its
// day, or a repeating one on a day it repeats (not skipped, not ticked).
export function activeOn(p, date) {
  if (p.scope !== 'day') return false;
  const key = dayKey(date);
  if (!p.recur) return p.key === key && !p.done;
  return occursOn(p.recur, parseDayKey(p.key), date)
    && !(p.exceptions && p.exceptions[key])
    && !(p.doneDates && p.doneDates[key]);
}

export function duePlans(items, now, sinceMs, nowMs = now.getTime()) {
  const out = [];
  for (const p of items) {
    if (!p.time || !activeOn(p, now)) continue;

    const mins = minutesOf(p.time);
    if (mins === null) continue;
    const scheduled = new Date(
      now.getFullYear(), now.getMonth(), now.getDate(),
      Math.floor(mins / 60), mins % 60, 0, 0,
    ).getTime();

    if (scheduled > sinceMs && scheduled <= nowMs) {
      out.push({ id: p.id, title: p.title, time: p.time });
    }
  }
  return out;
}
