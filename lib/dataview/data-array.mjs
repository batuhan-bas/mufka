// Dataview's DataArray: a list with query helpers (where, sort, groupBy, …)
// where reading a field of the list reads it from every element
// (`pages.file.name` is the list of names), as dataviewjs scripts expect.
import { compare, equals, truthy, canonicalName } from './values.mjs';

function fieldOf(v, key) {
  if (v == null || typeof v !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(v, key)) return v[key];
  const c = canonicalName(key);
  return Object.prototype.hasOwnProperty.call(v, c) ? v[c] : undefined;
}

const unwrap = (x) => (isDataArray(x) ? x.array() : x);

class Impl {
  constructor(values) { this.values = values; }

  get length() { return this.values.length; }

  where(f) { return dataArray(this.values.filter((x, i) => truthy(f(x, i)))); }
  filter(f) { return this.where(f); }
  map(f) { return dataArray(this.values.map((x, i) => f(x, i))); }
  flatMap(f) {
    const out = [];
    this.values.forEach((x, i) => { const r = unwrap(f(x, i)); if (Array.isArray(r)) out.push(...r); else out.push(r); });
    return dataArray(out);
  }
  mutate(f) { this.values.forEach((x, i) => f(x, i)); return this; }
  forEach(f) { this.values.forEach((x, i) => f(x, i)); }
  limit(n) { return dataArray(this.values.slice(0, n)); }
  slice(s, e) { return dataArray(this.values.slice(s, e)); }
  concat(other) { return dataArray([...this.values, ...(unwrap(other) || [])]); }
  indexOf(x, from) { return this.values.findIndex((y, i) => i >= (from || 0) && equals(x, y)); }
  find(f) { return this.values.find((x, i) => truthy(f(x, i))); }
  findIndex(f) { return this.values.findIndex((x, i) => truthy(f(x, i))); }
  includes(x) { return this.values.some((y) => equals(x, y)); }
  join(sep) { return this.values.map((x) => (x == null ? '' : String(x))).join(sep == null ? ', ' : sep); }
  sort(key, direction, comparator) {
    const k = key || ((x) => x);
    const cmp = comparator || compare;
    const dir = direction === 'desc' ? -1 : 1;
    return dataArray([...this.values].sort((a, b) => cmp(k(a), k(b)) * dir));
  }
  sortInPlace(key, direction, comparator) {
    this.values = unwrap(this.sort(key, direction, comparator));
    return this;
  }
  groupBy(key, comparator) {
    const groups = [];
    for (const x of this.values) {
      const kv = key(x);
      const g = groups.find((y) => (comparator ? comparator(y.key, kv) === 0 : equals(y.key, kv)));
      if (g) g.rows.push(x); else groups.push({ key: kv, rows: [x] });
    }
    groups.sort((a, b) => (comparator || compare)(a.key, b.key));
    return dataArray(groups.map((g) => ({ key: g.key, rows: dataArray(g.rows) })));
  }
  distinct(key, comparator) {
    const out = [];
    const keys = [];
    for (const x of this.values) {
      const kv = key ? key(x) : x;
      if (!keys.some((y) => (comparator ? comparator(y, kv) === 0 : equals(y, kv)))) { keys.push(kv); out.push(x); }
    }
    return dataArray(out);
  }
  every(f) { return this.values.every((x, i) => truthy(f(x, i))); }
  some(f) { return this.values.some((x, i) => truthy(f(x, i))); }
  none(f) { return !this.some(f); }
  first() { return this.values.length ? this.values[0] : undefined; }
  last() { return this.values.length ? this.values[this.values.length - 1] : undefined; }
  // Each element's `key`; lists are flattened one level.
  to(key) {
    const out = [];
    for (const x of this.values) {
      const v = unwrap(fieldOf(x, key));
      if (v === undefined) continue;
      if (Array.isArray(v)) out.push(...v); else out.push(v);
    }
    return dataArray(out);
  }
  into(key) {
    const out = [];
    for (const x of this.values) {
      const v = unwrap(fieldOf(x, key));
      if (v === undefined) continue;
      if (Array.isArray(v)) out.push(...v.flat(Infinity)); else out.push(v);
    }
    return dataArray(out);
  }
  // Every element and, recursively, the elements under its `key` (e.g. children).
  expand(key) {
    const out = [];
    const walk = (x) => { out.push(x); for (const c of unwrap(fieldOf(x, key)) || []) walk(c); };
    this.values.forEach(walk);
    return dataArray(out);
  }
  array() { return [...this.values]; }
  sum() { return this.values.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0); }
  avg() { const n = this.values.filter((x) => typeof x === 'number'); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : undefined; }
  min() { return this.values.length ? this.values.reduce((a, b) => (compare(a, b) <= 0 ? a : b)) : undefined; }
  max() { return this.values.length ? this.values.reduce((a, b) => (compare(a, b) >= 0 ? a : b)) : undefined; }
  [Symbol.iterator]() { return this.values[Symbol.iterator](); }
  toString() { return this.join(', '); }
}

const MARK = Symbol('dataArray');

export function isDataArray(x) { return !!(x && x[MARK]); }

export function dataArray(values) {
  const impl = new Impl(Array.isArray(values) ? values : unwrap(values) == null ? [] : [...unwrap(values)]);
  return new Proxy(impl, {
    get(t, prop) {
      if (prop === MARK) return true;
      if (typeof prop === 'symbol') return t[prop];
      if (prop in t) {
        const v = t[prop];
        return typeof v === 'function' ? v.bind(t) : v;
      }
      if (/^\d+$/.test(prop)) return t.values[Number(prop)];
      return t.to(prop);
    },
    has(t, prop) { return prop in t || (typeof prop === 'string' && /^\d+$/.test(prop) && Number(prop) < t.values.length); },
  });
}
