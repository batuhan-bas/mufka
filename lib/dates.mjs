// Pure date math. No DOM, no Electron. Imported by renderer and node:test.
// Weeks start on Monday. Display strings use en-GB (LOCALE); keys are ASCII.

export function pad2(n) {
  return String(n).padStart(2, '0');
}

// Local-time y/m/d (month is 1-based) to avoid UTC off-by-one near midnight.
export function dayKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function monthKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

// ISO-8601 week: week 1 contains the year's first Thursday; weeks start Monday.
export function isoWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // Thursday of the current ISO week decides the week-year.
  const day = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  d.setDate(d.getDate() - day + 3);
  const thursday = d.getTime();
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  const fday = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - fday + 3);
  const week = 1 + Math.round((thursday - firstThursday.getTime()) / (7 * 86400000));
  return { year: d.getFullYear(), week };
}

export function weekKey(date) {
  const { year, week } = isoWeek(date);
  return `${year}-W${pad2(week)}`;
}

export function keyFor(scope, date) {
  if (scope === 'day') return dayKey(date);
  if (scope === 'week') return weekKey(date);
  if (scope === 'month') return monthKey(date);
  throw new Error(`unknown scope: ${scope}`);
}

export function parseDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

export function addWeeks(date, n) {
  return addDays(date, n * 7);
}

export function addMonths(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setMonth(d.getMonth() + n);
  return d;
}

// Monday as the first day of the week.
export function startOfWeek(date) {
  const day = (date.getDay() + 6) % 7;
  return addDays(date, -day);
}

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function isToday(date, now = new Date()) {
  return sameDay(date, now);
}

// Weeks (arrays of 7 Dates, Mon..Sun) covering the month, with leading/trailing
// days from adjacent months so the grid is rectangular.
export function monthGrid(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = startOfWeek(first);
  const weeks = [];
  let cursor = start;
  // Enough weeks to cover any month (4-6); stop once we pass the month end.
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let i = 0; i < 7; i++) {
      row.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(row);
    const last = row[6];
    if (last.getMonth() !== date.getMonth() && last > new Date(date.getFullYear(), date.getMonth() + 1, 0)) {
      break;
    }
  }
  return weeks;
}

// --- display helpers ---
// British English: day before month, which reads naturally with weeks that
// start on Monday. Keys stay ASCII.
export const LOCALE = 'en-GB';

export function formatDayLong(date) {
  return date.toLocaleDateString(LOCALE, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function formatMonthLong(date) {
  return date.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
}

export function formatWeekRange(date) {
  const start = startOfWeek(date);
  const end = addDays(start, 6);
  const { week } = isoWeek(date);
  const s = start.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
  const e = end.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
  return `Week ${week} · ${s} – ${e}`;
}

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// "4 October 2026" — numeric day, long month, year. No weekday.
export function formatDayNumeric(date) {
  return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
}

// "Sunday" — long weekday name.
export function formatWeekdayLong(date) {
  return date.toLocaleDateString(LOCALE, { weekday: 'long' });
}

// "Sunday, 4 October" — long weekday, day, long month. No year.
export function formatDayPretty(date) {
  const dm = date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });
  return `${formatWeekdayLong(date)}, ${dm}`;
}

// "28 September – 4 October 2026" — the week's Monday to Sunday; year only on the end.
export function formatWeekSpan(date) {
  const start = startOfWeek(date);
  const end = addDays(start, 6);
  const s = start.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });
  const e = end.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
  return `${s} – ${e}`;
}

// Monday of a given ISO week. Week 1 is the week containing 4 January.
export function dateOfIsoWeek(year, week) {
  const jan4 = new Date(year, 0, 4);
  return addDays(startOfWeek(jan4), (week - 1) * 7);
}

// A representative Date for a plan key, so search results can navigate there.
export function dateFromKey(scope, key) {
  if (scope === 'day') return parseDayKey(key);
  if (scope === 'month') {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1);
  }
  if (scope === 'week') {
    const [y, w] = key.split('-W').map(Number);
    return dateOfIsoWeek(y, w);
  }
  throw new Error(`unknown scope: ${scope}`);
}
