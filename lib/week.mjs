// Pure logic for the Planner's week view: the week's days, placing timed
// plans on an hour grid (with side-by-side lanes for overlaps), snapping and
// moving times, and what counts as "missed". No DOM.

import { dayKey, startOfWeek, addDays } from './dates.mjs';

export const SNAP = 15;            // minutes; drags and keyboard moves snap to this
export const DEFAULT_LENGTH = 60;  // a plan with only a start time shows as 1 hour
const DAY = 24 * 60;

// Monday … Sunday of the week containing `date`.
export function weekDates(date) {
  const mon = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

// 'HH:MM' → minutes after midnight (null if not a time).
export function toMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ''));
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v <= DAY ? v : null;
}
// minutes → 'HH:MM' (clamped to 00:00–23:59; 24:00 is shown as 23:59).
export function toTime(min) {
  const v = Math.max(0, Math.min(DAY - 1, Math.round(min)));
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}
export function snap(min, step = SNAP) { return Math.round(min / step) * step; }

// Start and end minutes of a timed plan (end defaults to start + 1h, capped at
// midnight).
export function span(plan) {
  const start = toMinutes(plan.time);
  if (start == null) return null;
  const end = toMinutes(plan.endTime);
  return { start, end: end != null && end > start ? end : Math.min(DAY, start + DEFAULT_LENGTH) };
}

// Place timed plans: overlapping ones share the width in lanes.
// → [{ plan, start, end, lane, lanes }] sorted by start.
export function layoutDay(plans) {
  const items = plans.map((plan) => ({ plan, ...span(plan) })).filter((x) => x.start != null)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const laneEnds = [];
    for (const it of cluster) {
      let lane = laneEnds.findIndex((e) => e <= it.start);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.end); } else laneEnds[lane] = it.end;
      it.lane = lane;
    }
    for (const it of cluster) { it.lanes = laneEnds.length; out.push(it); }
    cluster = [];
  };
  for (const it of items) {
    if (cluster.length && it.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  if (cluster.length) flush();
  return out;
}

// Move a timed plan to start at `start` minutes, keeping its length; the
// result never runs past midnight. → { time, endTime }
export function moveTo(plan, start) {
  const s = span(plan);
  const len = s ? s.end - s.start : DEFAULT_LENGTH;
  const st = Math.max(0, Math.min(DAY - SNAP, snap(start)));
  const en = Math.min(DAY - 1, st + len);
  return { time: toTime(st), endTime: plan.endTime || len !== DEFAULT_LENGTH ? toTime(en) : '' };
}
// Change only the end (resize). At least one snap step long.
export function resizeTo(plan, end) {
  const s = span(plan);
  const en = Math.max(s.start + SNAP, Math.min(DAY - 1, snap(end)));
  return { time: plan.time, endTime: toTime(en) };
}

// Missed: not done, and its day is over — or it is today and its time has
// passed (end, or start + 1h). Plans without a day (week list) never are.
export function isMissed(plan, key, now = new Date()) {
  if (plan.done) return false;
  const today = dayKey(now);
  if (key < today) return true;
  if (key > today) return false;
  const s = span(plan);
  return Boolean(s) && s.end <= now.getHours() * 60 + now.getMinutes();
}

// Where to scroll the hour grid: an hour before the first plan of the week,
// else 07:00 — never past 16:00 so the evening stays reachable.
export function firstHour(dayLayouts) {
  const starts = dayLayouts.flat().map((x) => x.start);
  const h = starts.length ? Math.floor(Math.min(...starts) / 60) - 1 : 7;
  return Math.max(0, Math.min(16, h));
}
