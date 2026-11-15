// Trips (lib/trips.mjs): the strip under a trip's title — how long until it
// starts, which day of it this is, or how long since it ended; where and when;
// how much is packed and how many bookings are done.
import { tripTime, tripDays } from '../lib/trips.mjs';
import { factsRow } from './jobs-view.js';
import { progressBar } from './projects-view.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
const date = (key) => new Date(`${key.slice(0, 10)}T12:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

// The countdown: a number and what it counts.
function countdown(t) {
  if (!t) return null;
  const box = el('span', `trip-countdown ${t.when}`);
  if (t.when === 'before') {
    if (t.days === 1) box.append(el('b', null, 'Tomorrow'));
    else box.append(el('b', null, String(t.days)), document.createTextNode(' days to go'));
  } else if (t.when === 'during') box.append(document.createTextNode('Day '), el('b', null, String(t.day)), document.createTextNode(` of ${t.of}`));
  else box.append(document.createTextNode(t.days === 0 ? 'Back today' : `Back ${plural(t.days, 'day')} ago`));
  return box;
}

export function tripStrip(trip, now = new Date()) {
  const box = el('div', 'job-strip trip-strip');
  const c = countdown(tripTime(trip, now));
  if (c) box.append(c);
  const days = tripDays(trip);
  const when = trip.from ? `${date(trip.from)}${trip.to && trip.to !== trip.from ? ` – ${date(trip.to)}` : ''}${days > 1 ? ` · ${days} days` : ''}` : '';
  const extra = [];
  if (trip.packing.total) {
    const p = el('span', 'job-fact trip-fact-packing');
    p.append(el('span', 'job-fact-label', 'Packing'), progressBar(trip.packing.done, trip.packing.total));
    extra.push(p);
  }
  if (trip.bookings.total) {
    const b = el('span', 'job-fact');
    b.append(el('span', 'job-fact-label', 'Bookings'), document.createTextNode(`${trip.bookings.done} of ${trip.bookings.total} done`));
    extra.push(b);
  }
  const facts = factsRow([['Where', trip.destination], ['When', when]], extra);
  if (facts.children.length) box.append(facts);
  if (!c && !facts.children.length) box.append(el('div', 'job-facts trip-empty', 'Add where and when (destination, from and to) in the properties to count down to it.'));
  return box;
}
