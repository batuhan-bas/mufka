// Pure recurrence logic. No DOM, no Electron. Imported by renderer and tests.
//
// A recurring plan is a day-scoped template. Its `key` is the anchor date
// (first possible occurrence). Occurrences are computed on the fly; per-date
// completion lives in `doneDates`, per-date deletions in `exceptions`.
//
// recur shapes:
//   null
//   { type: 'daily' }
//   { type: 'weekdays', days: [1..7] }   // ISO: 1=Mon .. 7=Sun
//   { type: 'monthday', day: 1..31 }

import { WEEKDAY_SHORT } from './dates.mjs';

// ISO weekday 1..7 (Mon..Sun) for a Date.
export function isoDow(date) {
  return ((date.getDay() + 6) % 7) + 1;
}

function atMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// Does a template with this recurrence and anchor produce an occurrence on
// `date`? Occurrences never fall before the anchor.
export function occursOn(recur, anchor, date) {
  if (!recur) return false;
  if (atMidnight(date) < atMidnight(anchor)) return false;
  switch (recur.type) {
    case 'daily':
      return true;
    case 'weekdays':
      return Array.isArray(recur.days) && recur.days.includes(isoDow(date));
    case 'monthday':
      return date.getDate() === recur.day;
    default:
      return false;
  }
}

// Normalise raw recurrence input into a valid recur object, or null.
export function normalizeRecur(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.type === 'daily') return { type: 'daily' };
  if (raw.type === 'weekdays') {
    const days = Array.isArray(raw.days)
      ? [...new Set(raw.days.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort()
      : [];
    return days.length ? { type: 'weekdays', days } : null;
  }
  if (raw.type === 'monthday') {
    const day = Number(raw.day);
    return Number.isInteger(day) && day >= 1 && day <= 31
      ? { type: 'monthday', day }
      : null;
  }
  return null;
}

// Short description shown next to a recurring plan.
export function describeRecur(recur) {
  if (!recur) return '';
  if (recur.type === 'daily') return 'Every day';
  if (recur.type === 'weekdays') {
    return recur.days.map((d) => WEEKDAY_SHORT[d - 1]).join(', ');
  }
  if (recur.type === 'monthday') return `Monthly on day ${recur.day}`;
  return '';
}

// The "Repeat" choices offered when making or editing a plan, for a plan on
// `date`. Each choice turns into a recur object (null = does not repeat).
//   none · daily · weekdays (Mon–Fri) · weekly (that weekday) · custom
//   (any set of weekdays) · monthly (that day of the month)
export function repeatChoices(date) {
  const dow = isoDow(date);
  return [
    { id: 'none', label: 'Does not repeat' },
    { id: 'daily', label: 'Every day' },
    { id: 'weekdays', label: 'Every weekday (Mon–Fri)' },
    { id: 'weekly', label: `Every week on ${WEEKDAY_LONG[dow - 1]}` },
    { id: 'custom', label: 'On chosen days…' },
    { id: 'monthly', label: `Every month on day ${date.getDate()}` },
  ];
}

// Choice id (+ the chosen days for 'custom', ISO 1..7) → recur object.
export function recurFromChoice(id, date, days = []) {
  if (id === 'daily') return { type: 'daily' };
  if (id === 'weekdays') return { type: 'weekdays', days: [1, 2, 3, 4, 5] };
  if (id === 'weekly') return { type: 'weekdays', days: [isoDow(date)] };
  if (id === 'custom') return normalizeRecur({ type: 'weekdays', days });
  if (id === 'monthly') return { type: 'monthday', day: date.getDate() };
  return null;
}

// recur object → the choice that shows it (for editing), with its days.
export function choiceFromRecur(recur, date) {
  if (!recur) return { id: 'none', days: [] };
  if (recur.type === 'daily') return { id: 'daily', days: [] };
  if (recur.type === 'monthday') return { id: 'monthly', days: [] };
  const days = recur.days || [];
  if (days.join() === '1,2,3,4,5') return { id: 'weekdays', days };
  if (days.length === 1 && days[0] === isoDow(date)) return { id: 'weekly', days };
  return { id: 'custom', days };
}

const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
