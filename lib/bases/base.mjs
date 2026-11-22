// Obsidian Bases: a `.base` file (or a ```base block) is YAML with filters,
// formulas, property names, summaries and views; a view shows the notes that
// pass its filters as a table, cards or a list, sorted, grouped and limited.
// Runs on the Dataview page index (lib/dataview/index.mjs). Pure.
import YAML from 'yaml';
import { DateTime } from 'luxon';
import { Link } from '../dataview/values.mjs';
import { folderOf } from '../notestree.mjs';
import { BaseError, FileRef, compile, evaluate, truthy, compareValues, sameValue, textOf, isDate, isDuration, typeName } from './expr.mjs';

export { BaseError };

export const VIEW_TYPES = ['table', 'cards', 'list'];

// The YAML of a base as an object; throws BaseError when it cannot be read.
export function parseBase(text) {
  let doc;
  try { doc = YAML.parse(String(text || ''), { logLevel: 'error' }) || {}; } catch (err) { throw new BaseError(`The base is not valid YAML: ${err.message.split('\n')[0]}`); }
  if (typeof doc !== 'object' || Array.isArray(doc)) throw new BaseError('A base is a set of keys: filters, formulas, properties, views');
  const views = Array.isArray(doc.views) && doc.views.length ? doc.views.filter((v) => v && typeof v === 'object') : [{ type: 'table', name: 'Table' }];
  return {
    filters: doc.filters ?? null,
    formulas: doc.formulas && typeof doc.formulas === 'object' ? doc.formulas : {},
    properties: doc.properties && typeof doc.properties === 'object' ? doc.properties : {},
    summaries: doc.summaries && typeof doc.summaries === 'object' ? doc.summaries : {},
    views: views.map((v, i) => ({ ...v, type: String(v.type || 'table'), name: String(v.name ?? (i ? `View ${i + 1}` : 'Table')) })),
  };
}

// "author", "note.author", "file.name", "formula.days" → { scope, name, id }
// where id is the canonical key ("note.author").
export function propRef(key) {
  const s = String(key || '').trim();
  const m = /^(note|file|formula)\.(.+)$/.exec(s);
  if (m) return { scope: m[1], name: m[2], id: `${m[1]}.${m[2]}` };
  return { scope: 'note', name: s, id: `note.${s}` };
}

const FILE_LABELS = { name: 'Name', basename: 'Name', path: 'Path', folder: 'Folder', ext: 'Extension', size: 'Size', ctime: 'Created', mtime: 'Modified', tags: 'Tags', links: 'Links', backlinks: 'Backlinks', embeds: 'Embeds' };

// The heading of a column: its displayName, else its name.
export function propLabel(config, key) {
  const r = propRef(key);
  const p = config.properties[r.id] || config.properties[key] || (r.scope === 'note' ? config.properties[r.name] : null);
  if (p && p.displayName != null) return String(p.displayName);
  if (r.scope === 'file') return FILE_LABELS[r.name] || r.name;
  return r.name;
}

// A note as a file object for expressions (`file`, `this`, `link.asFile()`).
function fileRefOf(page, index) {
  const f = page.file;
  const rel = f.path;
  const leaf = rel.slice(rel.lastIndexOf('/') + 1);
  const embeds = f.outlinks.filter((l) => l.embed);
  return new FileRef({
    name: leaf,
    basename: leaf.replace(/\.md$/i, ''),
    path: rel,
    folder: f.folder,
    ext: 'md',
    size: f.size,
    ctime: f.ctime,
    mtime: f.mtime,
    tags: f.etags,
    links: f.outlinks.filter((l) => !l.embed),
    embeds,
    properties: f.frontmatter,
    backlinks: () => f.inlinks.map((l) => (index.pages.get(l.path) ? fileRefOf(index.pages.get(l.path), index) : l)),
  });
}

// The file object of a path that is not a note (the .base file itself).
function plainFileRef(rel) {
  const leaf = rel.slice(rel.lastIndexOf('/') + 1);
  const dot = leaf.lastIndexOf('.');
  return new FileRef({ name: leaf, basename: dot > 0 ? leaf.slice(0, dot) : leaf, path: rel, folder: folderOf(rel), ext: dot > 0 ? leaf.slice(dot + 1) : '', size: 0, ctime: null, mtime: null, tags: [], links: [], embeds: [], properties: {} });
}

// A frontmatter value by name, any case; undefined when there is none.
function noteProp(page, name) {
  const fm = page ? page.file.frontmatter : null;
  if (!fm) return undefined;
  if (name in fm) return fm[name];
  const k = Object.keys(fm).find((x) => x.toLowerCase() === String(name).toLowerCase());
  return k === undefined ? undefined : fm[k];
}

// Evaluation context for one row.
function rowContext(page, env) {
  const cache = new Map();
  const busy = new Set();
  const ctx = {
    note: (name) => noteProp(page, name),
    file: env.fileOf(page),
    thisFile: env.thisFile,
    thisNote: env.thisPage ? (name) => noteProp(env.thisPage, name) : null,
    resolve: (t) => env.index.resolve(t, page.file.path),
    fileAt: (rel) => (env.index.pages.get(rel) ? env.fileOf(env.index.pages.get(rel)) : null),
    now: env.now,
    formula: (name) => {
      if (cache.has(name)) return cache.get(name);
      const src = env.config.formulas[name];
      if (src == null) return null;
      if (busy.has(name)) throw new BaseError(`The formula ${name} uses itself`);
      busy.add(name);
      let v;
      try { v = evaluate(compile(String(src)), ctx); } finally { busy.delete(name); }
      cache.set(name, v);
      return v;
    },
  };
  return ctx;
}

// Whether a row passes a filter: a string expression, or { and | or | not: [...] }.
export function passes(filter, ctx) {
  if (filter == null) return true;
  if (typeof filter === 'string') return truthy(evaluate(compile(filter), ctx));
  if (typeof filter === 'boolean') return filter;
  if (Array.isArray(filter)) return filter.every((f) => passes(f, ctx));
  if (typeof filter === 'object') {
    if (Array.isArray(filter.and)) return filter.and.every((f) => passes(f, ctx));
    if (Array.isArray(filter.or)) return filter.or.some((f) => passes(f, ctx));
    if (Array.isArray(filter.not)) return !filter.not.some((f) => passes(f, ctx));
    if (filter.and == null && filter.or == null && filter.not == null) return true;
  }
  throw new BaseError('A filter is an expression or a list under and / or / not');
}

// A property's value in a row: "note.x", "file.x" or "formula.x".
export function valueIn(ctx, key) {
  const r = propRef(key);
  if (r.scope === 'formula') return ctx.formula(r.name);
  if (r.scope === 'file') {
    const f = ctx.file;
    if (r.name === 'name') return new Link(f.path, { display: f.basename });
    if (r.name === 'file') return f;
    if (r.name === 'backlinks') return f.backlinks ? f.backlinks() : [];
    return f[r.name] ?? null;
  }
  const v = ctx.note(r.name);
  return v === undefined ? null : v;
}

// --- summaries ---------------------------------------------------------------------

const nums = (vals) => vals.map((v) => (typeof v === 'number' ? v : null)).filter((v) => v != null && Number.isFinite(v));
const dates = (vals) => vals.filter(isDate);
const filled = (v) => !(v == null || v === '' || (Array.isArray(v) && !v.length));
const round = (n) => (n == null ? null : Math.round(n * 100) / 100);
const SUMMARIES = {
  average: (v) => { const n = nums(v); return n.length ? round(n.reduce((s, x) => s + x, 0) / n.length) : null; },
  sum: (v) => round(nums(v).reduce((s, x) => s + x, 0)),
  min: (v) => { const n = nums(v); return n.length ? Math.min(...n) : null; },
  max: (v) => { const n = nums(v); return n.length ? Math.max(...n) : null; },
  range: (v) => {
    const d = dates(v);
    if (d.length && d.length >= nums(v).length) { const ms = d.map((x) => x.toMillis()); return `${Math.round((Math.max(...ms) - Math.min(...ms)) / 86400000)} days`; }
    const n = nums(v); return n.length ? round(Math.max(...n) - Math.min(...n)) : null;
  },
  median: (v) => { const n = nums(v).sort((a, b) => a - b); if (!n.length) return null; const m = Math.floor(n.length / 2); return round(n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2); },
  stddev: (v) => { const n = nums(v); if (!n.length) return null; const mean = n.reduce((s, x) => s + x, 0) / n.length; return round(Math.sqrt(n.reduce((s, x) => s + (x - mean) ** 2, 0) / n.length)); },
  earliest: (v) => { const d = dates(v); return d.length ? d.reduce((a, b) => (b < a ? b : a)) : null; },
  latest: (v) => { const d = dates(v); return d.length ? d.reduce((a, b) => (b > a ? b : a)) : null; },
  checked: (v) => v.filter((x) => x === true).length,
  unchecked: (v) => v.filter((x) => x === false).length,
  empty: (v) => v.filter((x) => !filled(x)).length,
  filled: (v) => v.filter(filled).length,
  unique: (v) => v.filter(filled).filter((x, i, a) => a.findIndex((y) => sameValue(x, y)) === i).length,
};

function summarize(name, values, env) {
  const fn = SUMMARIES[String(name).toLowerCase()];
  if (fn) return fn(values);
  const src = env.config.summaries[name];
  if (src == null) throw new BaseError(`Unknown summary ${name}`);
  return evaluate(compile(String(src)), { note: () => undefined, file: null, formula: () => null, now: env.now, vars: { values } });
}

// --- running a view ----------------------------------------------------------------

// The view to show: by name, by position, else the first.
export function pickView(config, which) {
  if (which != null && which !== '') {
    const byName = config.views.findIndex((v) => v.name === String(which));
    if (byName !== -1) return byName;
    const n = Number(which);
    if (Number.isInteger(n) && n >= 0 && n < config.views.length) return n;
  }
  return 0;
}

// The sort of a view: [{ property, direction }] (also a single object, or a
// list of property names).
function sortsOf(view) {
  const raw = view.sort == null ? [] : Array.isArray(view.sort) ? view.sort : [view.sort];
  return raw.map((s) => (typeof s === 'string' ? { property: s, direction: 'ASC' } : s && s.property ? { property: String(s.property), direction: String(s.direction || 'ASC').toUpperCase() } : null)).filter(Boolean);
}

// Run view `which` of `config` over `index`.
//   thisRel: where the base is shown (the .base file, or the note embedding it).
// → { view, viewIndex, columns: [{ key, label }], groups: [{ key, label, rows }],
//     total, shown, summaries: { key: value }, error }
//   rows: [{ rel, title, values: { key: value } }]
export function runView(config, which, index, { thisRel = '', now = DateTime.now() } = {}) {
  const viewIndex = pickView(config, which);
  const view = config.views[viewIndex];
  const refs = new Map();
  const fileOf = (page) => { if (!refs.has(page)) refs.set(page, fileRefOf(page, index)); return refs.get(page); };
  const thisPage = index.pages.get(thisRel) || null;
  const env = { config, index, now, fileOf, thisPage, thisFile: thisPage ? fileOf(thisPage) : thisRel ? plainFileRef(thisRel) : null };

  const order = Array.isArray(view.order) && view.order.length ? view.order.map(String) : ['file.name'];
  const columns = order.map((key) => ({ key: propRef(key).id, label: propLabel(config, key) }));
  const base = { view, viewIndex, columns, groups: [], total: 0, shown: 0, summaries: {}, error: null };

  const rows = [];
  for (const page of index.pages.values()) {
    const ctx = rowContext(page, env);
    if (!passes(config.filters, ctx) || !passes(view.filters, ctx)) continue;
    rows.push({ page, ctx });
  }
  base.total = rows.length;

  const sorts = sortsOf(view);
  const name = (r) => r.page.file.path.slice(r.page.file.path.lastIndexOf('/') + 1).replace(/\.md$/i, '');
  rows.sort((a, b) => {
    for (const s of sorts) {
      const x = valueIn(a.ctx, s.property); const y = valueIn(b.ctx, s.property);
      // Empty values last, whichever way.
      const ex = x == null || x === ''; const ey = y == null || y === '';
      if (ex || ey) { if (ex !== ey) return ex ? 1 : -1; continue; }
      const c = compareValues(x, y);
      if (c) return s.direction === 'DESC' ? -c : c;
    }
    return name(a).localeCompare(name(b), undefined, { numeric: true, sensitivity: 'base' });
  });
  const limit = Number(view.limit);
  const kept = Number.isInteger(limit) && limit > 0 ? rows.slice(0, limit) : rows;
  base.shown = kept.length;

  const toRow = (r) => {
    const values = {};
    for (const c of columns) values[c.key] = valueIn(r.ctx, c.key);
    const row = { rel: r.page.file.path, title: name(r), values, ctx: r.ctx };
    if (view.image) row.imageValue = valueIn(r.ctx, String(view.image));
    return row;
  };

  const g = view.groupBy && (typeof view.groupBy === 'string' ? { property: view.groupBy } : view.groupBy);
  if (g && g.property) {
    const dir = String(g.direction || 'ASC').toUpperCase();
    const groups = [];
    for (const r of kept) {
      const v = valueIn(r.ctx, g.property);
      let grp = groups.find((x) => sameValue(x.value, v) || (x.value == null && (v == null || v === '')));
      if (!grp) { grp = { value: v === '' ? null : v, rows: [] }; groups.push(grp); }
      grp.rows.push(r);
    }
    groups.sort((a, b) => { const c = compareValues(a.value, b.value); return dir === 'DESC' ? -c : c; });
    let list = groups;
    if (Array.isArray(view.groupOrder)) {
      list = view.groupOrder.map((want) => groups.find((x) => (want == null ? x.value == null : sameValue(x.value, want)))).filter(Boolean);
    }
    base.groups = list.map((x) => ({ key: x.value == null ? null : textOf(x.value), label: x.value == null ? 'None' : textOf(x.value), value: x.value, rows: x.rows.map(toRow) }));
  } else {
    base.groups = [{ key: null, label: null, value: null, rows: kept.map(toRow) }];
  }

  const sums = view.summaries && typeof view.summaries === 'object' ? view.summaries : {};
  for (const [key, sname] of Object.entries(sums)) {
    const id = propRef(key).id;
    const values = kept.map((r) => valueIn(r.ctx, id));
    base.summaries[id] = { name: String(sname), value: summarize(String(sname), values, env) };
    for (const grp of base.groups) {
      grp.summaries = grp.summaries || {};
      grp.summaries[id] = { name: String(sname), value: summarize(String(sname), grp.rows.map((r) => r.values[id] !== undefined ? r.values[id] : valueIn(r.ctx, id)), env) };
    }
  }
  for (const grp of base.groups) for (const r of grp.rows) delete r.ctx;
  return base;
}

// Run safely: the result, or { error } with the message.
export function runBase(text, which, index, opts) {
  try {
    const config = typeof text === 'string' ? parseBase(text) : text;
    return { config, ...runView(config, which, index, opts) };
  } catch (err) {
    return { error: err instanceof BaseError ? err.message : `The base could not be run: ${err && err.message ? err.message : err}` };
  }
}

// The property a column writes to when its cell is changed in the view: only a
// note's own property can be changed. → the frontmatter key or null.
export function editableKey(key) {
  const r = propRef(key);
  return r.scope === 'note' ? r.name : null;
}

// The text typed in a cell as the value to write: a number stays a number, a
// list (when the old value was one) is split at commas, a date keeps its
// YYYY-MM-DD form.
export function cellInput(old, text) {
  const t = String(text ?? '').trim();
  if (Array.isArray(old)) return t ? t.split(',').map((x) => x.trim()).filter(Boolean) : [];
  if (typeof old === 'boolean' || t === 'true' || t === 'false') return t === 'true';
  if (t !== '' && /^-?\d+(?:\.\d+)?$/.test(t)) return Number(t);
  return t;
}

// What a new note made from a view should have so it shows in it: the folder
// of a file.inFolder("…") filter (else the base's own), the tags of
// file.hasTag("…") and the values of 'prop == "value"' among the filters that
// must all hold. → { folder, props: [[key, value]] }
export function newNoteDefaults(config, which, baseFolder = '') {
  const view = config.views[pickView(config, which)];
  const must = [];
  const take = (f) => {
    if (typeof f === 'string') must.push(f);
    else if (f && typeof f === 'object' && Array.isArray(f.and)) f.and.forEach(take);
  };
  take(config.filters); take(view && view.filters);
  let folder = baseFolder; const tags = []; const props = [];
  for (const f of must) {
    let m = /^\s*file\.inFolder\(\s*["']([^"']*)["']\s*\)\s*$/.exec(f);
    if (m) { folder = m[1].replace(/^\/+|\/+$/g, ''); continue; }
    m = /^\s*file\.hasTag\(\s*["']([^"']+)["']/.exec(f);
    if (m) { tags.push(m[1].replace(/^#/, '')); continue; }
    m = /^\s*(?:note\.)?([A-Za-z_][\w-]*)\s*==\s*(?:"([^"]*)"|'([^']*)'|(-?\d+(?:\.\d+)?)|(true|false))\s*$/.exec(f);
    if (m && !['file', 'formula', 'this'].includes(m[1])) props.push([m[1], m[4] != null ? Number(m[4]) : m[5] != null ? m[5] === 'true' : (m[2] ?? m[3])]);
  }
  if (tags.length) props.unshift(['tags', tags]);
  return { folder, props };
}

export { textOf, typeName, isDate, isDuration };
