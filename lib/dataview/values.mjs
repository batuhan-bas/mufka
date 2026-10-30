// Dataview values: the types a query works with, as the Obsidian Dataview
// plugin has them — null, number, string, boolean, date and duration (Luxon),
// link, list, object and function — with its ordering, truthiness, equality and
// text form. Pure: no DOM, no fs.
import { DateTime, Duration } from 'luxon';

export { DateTime, Duration };

// A link to a note (or a heading / block in it). `path` is the vault path with
// its extension ("Folder/Note.md"), or the raw target when it does not resolve.
export class Link {
  constructor(path, { display = null, subpath = null, embed = false, type = 'file' } = {}) {
    this.path = path;
    this.display = display;
    this.subpath = subpath;
    this.embed = embed;
    this.type = type;
  }

  static file(path, display = null, embed = false) { return new Link(path, { display, embed }); }

  withDisplay(display) { return new Link(this.path, { ...this, display }); }
  withEmbed(embed) { return new Link(this.path, { ...this, embed }); }
  toFile() { return new Link(this.path, { display: this.display, embed: this.embed }); }

  // The note's name: the path without folders and the .md extension.
  fileName() { return this.path.slice(this.path.lastIndexOf('/') + 1).replace(/\.md$/i, ''); }

  equals(o) { return o instanceof Link && o.path === this.path && (o.subpath || null) === (this.subpath || null); }

  // Wiki-link markdown, the way Dataview writes links into its output.
  markdown() {
    const target = this.path.replace(/\.md$/i, '') + (this.subpath ? `#${this.subpath}` : '');
    const shown = this.display != null ? `|${this.display}` : '';
    return `${this.embed ? '!' : ''}[[${target}${shown}]]`;
  }

  toString() { return this.markdown(); }
}

export const isLink = (v) => v instanceof Link;
export const isDate = (v) => DateTime.isDateTime(v);
export const isDuration = (v) => Duration.isDuration(v);
export const isArray = (v) => Array.isArray(v);
export const isObject = (v) => v != null && typeof v === 'object' && !isArray(v) && !isLink(v) && !isDate(v) && !isDuration(v);

export function typeOf(v) {
  if (v == null) return 'null';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'function') return 'function';
  if (isDate(v)) return 'date';
  if (isDuration(v)) return 'duration';
  if (isLink(v)) return 'link';
  if (isArray(v)) return 'array';
  return 'object';
}

// Dataview's truthiness: empty strings, lists and objects, zero and null are false.
export function truthy(v) {
  switch (typeOf(v)) {
    case 'null': return false;
    case 'number': return v !== 0 && !Number.isNaN(v);
    case 'string': return v.length > 0;
    case 'boolean': return v;
    case 'date': return v.toMillis() !== 0;
    case 'duration': return v.as('seconds') !== 0;
    case 'link': return !!v.path;
    case 'array': return v.length > 0;
    case 'object': return Object.keys(v).length > 0;
    default: return true;
  }
}

// Sort order between types, as Dataview orders mixed lists.
const TYPE_ORDER = ['null', 'boolean', 'number', 'string', 'date', 'duration', 'link', 'array', 'object', 'function'];

// Total order: -1, 0 or 1. Strings compare by code point (like Dataview), links
// by their name, lists element by element, objects by their keys and values.
export function compare(a, b) {
  const ta = typeOf(a);
  const tb = typeOf(b);
  if (ta !== tb) return Math.sign(TYPE_ORDER.indexOf(ta) - TYPE_ORDER.indexOf(tb));
  switch (ta) {
    case 'null': return 0;
    case 'boolean':
    case 'number': return a === b ? 0 : (a < b ? -1 : 1);
    case 'string': return a === b ? 0 : (a < b ? -1 : 1);
    case 'date': return Math.sign(a.toMillis() - b.toMillis());
    case 'duration': return Math.sign(a.as('milliseconds') - b.as('milliseconds'));
    case 'link': {
      const c = compare(a.path.toLowerCase(), b.path.toLowerCase());
      return c || compare(a.subpath || '', b.subpath || '');
    }
    case 'array': {
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        const c = compare(a[i], b[i]);
        if (c) return c;
      }
      return Math.sign(a.length - b.length);
    }
    case 'object': {
      const ka = Object.keys(a).sort();
      const kb = Object.keys(b).sort();
      const c = compare(ka, kb);
      if (c) return c;
      for (const k of ka) {
        const d = compare(a[k], b[k]);
        if (d) return d;
      }
      return 0;
    }
    default: return 0;
  }
}

export const equals = (a, b) => compare(a, b) === 0;

// --- text form -------------------------------------------------------------

export const DEFAULT_DATE_FORMAT = 'MMMM dd, yyyy';
export const DEFAULT_DATETIME_FORMAT = 'h:mm a - MMMM dd, yyyy';

const isMidnight = (d) => d.hour === 0 && d.minute === 0 && d.second === 0 && d.millisecond === 0;

export function formatDate(d) {
  return d.toFormat(isMidnight(d) ? DEFAULT_DATE_FORMAT : DEFAULT_DATETIME_FORMAT);
}

// "3 days, 4 hours, 5 minutes": the non-zero parts, largest first.
export function formatDuration(d) {
  const units = ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds', 'milliseconds'];
  const n = d.shiftTo(...units).normalize();
  const parts = [];
  for (const u of units) {
    const v = n.get(u);
    if (v) parts.push(`${v} ${v === 1 ? u.slice(0, -1) : u}`);
  }
  return parts.length ? parts.join(', ') : '0 seconds';
}

// Plain text of a value (what string() returns and what joins use).
export function toText(v) {
  switch (typeOf(v)) {
    case 'null': return 'null';
    case 'string': return v;
    case 'number': return String(v);
    case 'boolean': return String(v);
    case 'date': return formatDate(v);
    case 'duration': return formatDuration(v);
    case 'link': return v.markdown();
    case 'array': return v.map(toText).join(', ');
    case 'object': return `{ ${Object.entries(v).map(([k, x]) => `${k}: ${toText(x)}`).join(', ')} }`;
    case 'function': return '<function>';
    default: return String(v);
  }
}

// --- parsing raw metadata ---------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}(?:-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?)?$/;

// A date written in a note: ISO dates and date-times, in local time.
export function parseDate(s) {
  const t = String(s).trim();
  if (!ISO_DATE.test(t)) return null;
  const d = DateTime.fromISO(t.replace(' ', 'T'), { setZone: /Z|[+-]\d{2}:?\d{2}$/.test(t) });
  return d.isValid ? d : null;
}

const DURATION_UNITS = {
  ms: 'milliseconds', millisecond: 'milliseconds', milliseconds: 'milliseconds',
  s: 'seconds', sec: 'seconds', secs: 'seconds', second: 'seconds', seconds: 'seconds',
  m: 'minutes', min: 'minutes', mins: 'minutes', minute: 'minutes', minutes: 'minutes',
  h: 'hours', hr: 'hours', hrs: 'hours', hour: 'hours', hours: 'hours',
  d: 'days', day: 'days', days: 'days',
  w: 'weeks', wk: 'weeks', wks: 'weeks', week: 'weeks', weeks: 'weeks',
  mo: 'months', month: 'months', months: 'months',
  y: 'years', yr: 'years', yrs: 'years', year: 'years', years: 'years',
};

// "1 day", "3h 20m", "2 hours, 30 minutes".
export function parseDuration(s) {
  const t = String(s).trim().toLowerCase();
  if (!t) return null;
  const re = /(-?\d+(?:\.\d+)?)\s*([a-z]+)\s*,?\s*/gy;
  const parts = {};
  let m;
  let at = 0;
  while ((m = re.exec(t))) {
    const unit = DURATION_UNITS[m[2]];
    if (!unit) return null;
    parts[unit] = (parts[unit] || 0) + Number(m[1]);
    at = re.lastIndex;
  }
  if (at !== t.length || !Object.keys(parts).length) return null;
  return Duration.fromObject(parts);
}

// A field name as Dataview also offers it: lower case, formatting removed,
// spaces as dashes ("Due Date" -> "due-date").
export function canonicalName(name) {
  return String(name)
    .replace(/[*_~`=]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}\p{Emoji_Presentation}_-]/gu, '');
}
