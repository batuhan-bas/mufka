// Dataview values as plain JSON and back: dates, durations and links are
// tagged objects, so pages and results can cross to the dataviewjs sandbox
// window and back. Functions are dropped.
import { DateTime, Duration, Link, isDate, isDuration, isLink } from './values.mjs';

export function toWire(v, depth = 0) {
  if (depth > 40) return null;
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'function') return null;
  if (isDate(v)) return { $d: v.toISO(), z: v.zoneName };
  if (isDuration(v)) return { $u: v.toObject() };
  if (isLink(v)) return { $l: [v.path, v.display, v.subpath, v.embed, v.type] };
  if (Array.isArray(v)) return v.map((x) => toWire(x, depth + 1));
  if (typeof v === 'object') {
    if (v.lambda) return null;
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = toWire(x, depth + 1);
    return o;
  }
  return null;
}

export function fromWire(v) {
  if (v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(fromWire);
  if (typeof v.$d === 'string') {
    const d = DateTime.fromISO(v.$d, { setZone: true });
    return d.isValid ? d : null;
  }
  if (v.$u && typeof v.$u === 'object') return Duration.fromObject(v.$u);
  if (Array.isArray(v.$l)) {
    const [path, display, subpath, embed, type] = v.$l;
    return new Link(String(path), { display, subpath, embed: !!embed, type: type || 'file' });
  }
  const o = {};
  for (const [k, x] of Object.entries(v)) o[k] = fromWire(x);
  return o;
}
