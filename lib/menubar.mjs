// What Mufka shows in the macOS menu bar and the Windows system tray: today's
// plans, and next to the icon the plan going on now with the time it has left,
// or the next one with the time until it. Pure: main.js reads the plans and
// draws it.
import { activeOn } from './notify.mjs';
import { eventsOnDay } from './calendar.mjs';

// Minutes since midnight for 'HH:MM' (24:00 allowed as an end), or null.
function minutesOf(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time || '');
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

// Today's plans that are not done: timed ones by start time, then the rest.
// Each is { title, time, endTime }.
export function todayPlans(items, now) {
  const list = (Array.isArray(items) ? items : [])
    .filter((p) => p && activeOn(p, now))
    .map((p) => ({ title: String(p.title || '').trim() || 'Untitled', time: p.time || '', endTime: p.endTime || '' }));
  const start = (p) => minutesOf(p.time) ?? Infinity;
  return list.sort((a, b) => start(a) - start(b));
}

// Today's calendar events as the same kind of items (kind: 'event'); all-day
// ones have no time. An event running past midnight ends at the day's end.
export function todayEvents(events, now) {
  return eventsOnDay(events, now).map((e) => ({ title: String(e.title || '').trim() || 'Busy', time: e.time, endTime: e.endTime === '24:00' ? '23:59' : e.endTime, kind: 'event' }));
}

// Plans and events together: timed ones by start time, then the rest.
export function mergeDay(plans, events) {
  const start = (p) => minutesOf(p.time) ?? Infinity;
  return [...plans, ...events].map((x, i) => ({ x, i })).sort((a, b) => start(a.x) - start(b.x) || a.i - b.i).map(({ x }) => x);
}

// 45 → "45m", 80 → "1h 20m", 120 → "2h".
export function duration(min) {
  const h = Math.floor(min / 60); const m = min % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

const short = (title, max) => (title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title);

// The text next to the icon: "Tennis · 25m left" while a plan with an end time
// is going on, "Tennis · now" in a plan's first minute, "Tennis · in 25m"
// before the next one today; '' when nothing is left today (only the icon).
export function menubarTitle(plans, now, max = 24) {
  const n = now.getHours() * 60 + now.getMinutes();
  const timed = plans.filter((p) => minutesOf(p.time) != null);
  const current = timed.find((p) => {
    const s = minutesOf(p.time); const e = minutesOf(p.endTime);
    return e != null && e > s && s <= n && n < e;
  });
  if (current) return `${short(current.title, max)} · ${duration(minutesOf(current.endTime) - n)} left`;
  const starting = timed.find((p) => minutesOf(p.time) === n);
  if (starting) return `${short(starting.title, max)} · now`;
  const next = timed.find((p) => minutesOf(p.time) > n);
  if (next) return `${short(next.title, max)} · in ${duration(minutesOf(next.time) - n)}`;
  return '';
}

// The rows of the menu: "09:00–10:00  Tennis"; plans already over are marked
// `past` (shown dimmed).
export function menubarRows(plans, now) {
  const n = now.getHours() * 60 + now.getMinutes();
  return plans.map((p) => {
    const s = minutesOf(p.time); const e = minutesOf(p.endTime);
    const when = s == null ? '' : (e != null && e > s ? `${p.time}–${p.endTime}` : p.time);
    const end = e != null && e > s ? e : s;
    const title = p.kind === 'event' ? `📅 ${p.title}` : p.title;
    return { label: when ? `${when}  ${title}` : title, past: end != null && end <= n && !(s === n) };
  });
}

// The tasks part of the menu: board tasks due today, then late ones
// (lib/kanban.mjs dayTasks, why 'due' / 'late'), by priority; at most `max`.
// [{ label, task }]
export function menubarTasks(tasks, max = 8) {
  const prio = (t) => (t.priority ? Number(t.priority.slice(1)) : 9);
  const order = { late: 0, due: 1 };
  return tasks.filter((t) => t.why === 'due' || t.why === 'late')
    .sort((a, b) => order[a.why] - order[b.why] || prio(a) - prio(b))
    .slice(0, max)
    .map((t) => ({ label: `${t.priority ? `${t.priority} · ` : ''}${t.title} · ${t.why === 'late' ? 'late' : t.board}`, task: t }));
}
