// Trips: a note (type: trip) with where (destination) and when (from, to); its
// page shows how long until it starts, which day of it this is, or how long
// since it ended, with how much of the packing list is packed and how many
// bookings are done. Pure; drawn by src/trips-view.js.
import { readProps } from './properties.mjs';

const prop = (props, ...names) => {
  const p = props.find((x) => names.includes(String(x.key).toLowerCase()));
  if (!p || p.value == null) return '';
  if (p.value instanceof Date) return p.value.toISOString().slice(0, 10);
  return String(p.value).trim();
};
const DAY = 86400000;
const dayOf = (key) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(key || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// The lines of the section under `## <heading>` (to the next heading).
function section(src, heading) {
  const lines = String(src || '').split(/\r?\n/);
  const at = lines.findIndex((l) => new RegExp(`^##\\s+${heading}\\s*$`, 'i').test(l));
  if (at < 0) return [];
  const out = [];
  for (const l of lines.slice(at + 1)) { if (/^#{1,2}\s/.test(l)) break; out.push(l); }
  return out;
}
// Ticked and all checklist lines in some lines.
function ticks(lines) {
  let done = 0; let total = 0;
  for (const l of lines) {
    const m = /^\s*[-*+] \[(.)\]/.exec(l);
    if (!m) continue;
    total += 1;
    if (m[1] !== ' ') done += 1;
  }
  return { done, total };
}
// Rows of the Bookings table, and those whose Done cell says it is done.
function bookings(lines) {
  const rows = lines.filter((l) => /^\s*\|/.test(l)).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  if (rows.length < 2) return { done: 0, total: 0 };
  const at = rows[0].findIndex((c) => /^done$/i.test(c));
  const body = rows.slice(1).filter((r) => !r.every((c) => /^:?-+:?$/.test(c)) && r.some((c) => c));
  const done = at < 0 ? 0 : body.filter((r) => r[at] && !/^(no|-|❌|✗|x̶)$/i.test(r[at])).length;
  return { done, total: body.length };
}

export const mayBeTrip = (src) => /^---\r?\n/.test(src) && /^type:\s*["']?trip["']?\s*$/m.test(src);

export function tripOf(rel, src) {
  if (!mayBeTrip(String(src || ''))) return null;
  const r = readProps(src);
  if (!r.props || prop(r.props, 'type').toLowerCase() !== 'trip') return null;
  return {
    rel,
    destination: prop(r.props, 'destination', 'where'),
    from: prop(r.props, 'from', 'start', 'departure'),
    to: prop(r.props, 'to', 'end', 'return'),
    packing: ticks(section(src, 'Packing list')),
    bookings: bookings(section(src, 'Bookings')),
  };
}

// Where the trip is in time on `now`:
//   { when: 'before', days }  days until it starts (1 = tomorrow)
//   { when: 'during', day, of } the day of the trip it is (1-based)
//   { when: 'after', days }   days since it ended (0 = it ended today)
// null without a start date.
export function tripTime(trip, now = new Date()) {
  const from = dayOf(trip.from);
  if (!from) return null;
  const to = dayOf(trip.to) || from;
  const today = midnight(now);
  const of = Math.round((to - from) / DAY) + 1;
  if (today < from) return { when: 'before', days: Math.round((from - today) / DAY) };
  if (today <= to) return { when: 'during', day: Math.round((today - from) / DAY) + 1, of };
  return { when: 'after', days: Math.round((today - to) / DAY) };
}

// Its length in days (from and to both counted), or 0.
export function tripDays(trip) {
  const from = dayOf(trip.from); const to = dayOf(trip.to);
  return from && to && to >= from ? Math.round((to - from) / DAY) + 1 : 0;
}
