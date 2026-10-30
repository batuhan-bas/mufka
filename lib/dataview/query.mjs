// Running a parsed Dataview query against the page index: FROM picks pages,
// then WHERE / SORT / GROUP BY / FLATTEN / LIMIT run in the order written, and
// the result takes the shape of its view (table, list, task list, calendar).
// Pure: the result holds values; lib/dataview/render.mjs draws them.
import { DataviewError, parseQuery, parseExpression } from './parse.mjs';
import { evaluate, field } from './eval.mjs';
import { linkValue } from './index.mjs';
import { Link, compare, truthy, toText, typeOf, isDate } from './values.mjs';

// --- FROM ---------------------------------------------------------------------------

export function sourcePages(src, index, thisRel) {
  const all = [...index.pages.keys()];
  if (!src) return new Set(all);
  switch (src.k) {
    case 'folder': {
      const p = src.path.replace(/^\/+|\/+$/g, '');
      if (!p) return new Set(all);
      const file = /\.md$/i.test(p) ? p : `${p}.md`;
      return new Set(all.filter((rel) => rel === file || rel.startsWith(`${p}/`)));
    }
    case 'tag': {
      const t = src.tag.toLowerCase();
      return new Set(all.filter((rel) => index.pages.get(rel).file.tags.some((x) => x.toLowerCase() === t)));
    }
    case 'linked': {
      const target = src.inner.trim() ? linkValue(src.inner, thisRel, index.relList).path : thisRel;
      const page = index.pages.get(target);
      return new Set(page ? page.file.inlinks.map((l) => l.path) : []);
    }
    case 'outgoing': {
      const target = src.inner.trim() ? linkValue(src.inner, thisRel, index.relList).path : thisRel;
      const page = index.pages.get(target);
      return new Set(page ? page.file.outlinks.map((l) => l.path).filter((p) => index.pages.has(p)) : []);
    }
    case 'and': {
      const r = sourcePages(src.r, index, thisRel);
      return new Set([...sourcePages(src.l, index, thisRel)].filter((x) => r.has(x)));
    }
    case 'or': return new Set([...sourcePages(src.l, index, thisRel), ...sourcePages(src.r, index, thisRel)]);
    case 'not': {
      const out = sourcePages(src.e, index, thisRel);
      return new Set(all.filter((x) => !out.has(x)));
    }
    default: throw new DataviewError('Unknown source');
  }
}

// --- rows ---------------------------------------------------------------------------

// A task row also carries its page's fields (and `file`), as in Dataview.
function taskRow(page, task) {
  const data = {};
  for (const [k, v] of Object.entries(page)) if (k !== 'file') data[k] = v;
  Object.assign(data, task);
  data.file = page.file;
  return data;
}

function evalIn(e, data, env) {
  return evaluate(e, { data, index: env.index, thisPage: env.thisPage, thisRel: env.thisRel });
}

function sortRows(rows, keys, env) {
  const withKeys = rows.map((r, i) => ({ r, i, k: keys.map((key) => evalIn(key.e, r.data, env)) }));
  withKeys.sort((a, b) => {
    for (let j = 0; j < keys.length; j++) {
      const c = compare(a.k[j], b.k[j]) * keys[j].dir;
      if (c) return c;
    }
    return a.i - b.i;
  });
  return withKeys.map((x) => x.r);
}

const keyId = (v) => `${typeOf(v)}:${typeOf(v) === 'link' ? v.path.toLowerCase() + '#' + (v.subpath || '') : toText(v)}`;

function groupRows(rows, op, env) {
  const groups = new Map();
  for (const r of rows) {
    const key = evalIn(op.e, r.data, env);
    const id = keyId(key);
    if (!groups.has(id)) groups.set(id, { key, rows: [] });
    groups.get(id).rows.push(r);
  }
  const out = [];
  for (const g of groups.values()) {
    const data = { key: g.key, rows: g.rows.map((r) => r.data) };
    if (op.name) data[op.name] = g.key;
    out.push({ id: g.key, data, group: g.rows });
  }
  return out.sort((a, b) => compare(a.id, b.id));
}

function flattenRows(rows, op, env) {
  const out = [];
  for (const r of rows) {
    const v = evalIn(op.e, r.data, env);
    const items = Array.isArray(v) ? v : [v];
    if (!items.length) { out.push(r); continue; }
    for (const x of items) out.push({ ...r, data: { ...r.data, [op.name]: x } });
  }
  return out;
}

function runOps(rows, ops, env) {
  let grouped = false;
  for (const op of ops) {
    if (op.op === 'where') rows = rows.filter((r) => truthy(evalIn(op.e, r.data, env)));
    else if (op.op === 'sort') rows = sortRows(rows, op.keys, env);
    else if (op.op === 'group') { rows = groupRows(rows, op, env); grouped = true; }
    else if (op.op === 'flatten') rows = flattenRows(rows, op, env);
    else if (op.op === 'limit') {
      const n = evalIn(op.e, {}, env);
      if (typeof n !== 'number') throw new DataviewError('LIMIT takes a number');
      rows = rows.slice(0, Math.max(0, n));
    }
  }
  return { rows, grouped };
}

// --- tasks: keep the tree of each matching task ------------------------------------

function taskTrees(matched) {
  const byKey = new Map(matched.map((t) => [`${t.path}:${t.line}`, t]));
  const isMatchedAncestor = (t) => {
    let p = t.parent;
    const parents = t._parents || [];
    for (const pl of parents) if (byKey.has(`${t.path}:${pl}`)) return true;
    return p != null && byKey.has(`${t.path}:${p}`);
  };
  return matched.filter((t) => !isMatchedAncestor(t));
}

// --- the query ------------------------------------------------------------------------

// env: { index, thisRel }. Returns a result object:
//   { type: 'table', headers, rows: [[...]], idColumn }
//   { type: 'list', items: [{ id, value }] | groups }
//   { type: 'task', groups: [{ key, tasks }] }
//   { type: 'calendar', entries: [{ date, link, value }] }
export function runQuery(source, env) {
  const q = typeof source === 'string' ? parseQuery(source) : source;
  const index = env.index;
  const thisRel = env.thisRel || '';
  const ctx = { index, thisRel, thisPage: index.page(thisRel) };
  const rels = [...sourcePages(q.source, index, thisRel)].sort((a, b) => compare(a.toLowerCase(), b.toLowerCase()));

  if (q.type === 'TASK') {
    const rows = [];
    for (const rel of rels) {
      const page = index.page(rel);
      const ancestors = new Map();
      for (const t of page.file.tasks.length ? page.file.lists : []) {
        ancestors.set(t.line, t.parent != null ? [t.parent, ...(ancestors.get(t.parent) || [])] : []);
      }
      for (const t of page.file.tasks) {
        const data = taskRow(page, t);
        data._parents = ancestors.get(t.line) || [];
        rows.push({ id: page.file.link, data });
      }
    }
    const { rows: out, grouped } = runOps(rows, q.ops, ctx);
    if (grouped) {
      return { type: 'task', groups: out.map((g) => ({ key: g.id, tasks: taskTrees(g.group.map((r) => r.data)) })) };
    }
    // Ungrouped: one group per note, in result order.
    const byFile = new Map();
    for (const r of out) {
      const k = r.data.path;
      if (!byFile.has(k)) byFile.set(k, { key: new Link(k), tasks: [] });
      byFile.get(k).tasks.push(r.data);
    }
    return { type: 'task', groups: [...byFile.values()].map((g) => ({ key: g.key, tasks: taskTrees(g.tasks) })), flat: byFile.size <= 1 };
  }

  const rows = rels.map((rel) => ({ id: index.page(rel).file.link, data: index.page(rel) }));
  const { rows: out, grouped } = runOps(rows, q.ops, ctx);

  if (q.type === 'TABLE') {
    return {
      type: 'table',
      idColumn: q.withoutId ? null : (grouped ? 'Group' : 'File'),
      headers: q.fields.map((f) => f.name),
      rows: out.map((r) => [...(q.withoutId ? [] : [r.id]), ...q.fields.map((f) => evalIn(f.e, r.data, ctx))]),
      count: out.length,
    };
  }
  if (q.type === 'LIST') {
    const expr = q.fields[0] ? q.fields[0].e : null;
    if (grouped && !expr) {
      return { type: 'list', groups: out.map((g) => ({ key: g.id, items: g.group.map((r) => r.id) })) };
    }
    return {
      type: 'list',
      items: out.map((r) => {
        const value = expr ? evalIn(expr, r.data, ctx) : undefined;
        return { id: q.withoutId ? undefined : r.id, value };
      }),
    };
  }
  // CALENDAR
  const entries = [];
  for (const r of out) {
    const d = evalIn(q.fields[0].e, r.data, ctx);
    if (isDate(d)) entries.push({ date: d, link: r.id });
  }
  return { type: 'calendar', entries };
}

// `= expression` in a note: its value for that note.
export function runInline(source, env) {
  const expr = typeof source === 'string' ? parseExpression(source) : source;
  const index = env.index;
  const ctx = { index, thisRel: env.thisRel, thisPage: index.page(env.thisRel || '') };
  const data = ctx.thisPage || {};
  return evaluate(expr, { data, index, thisPage: ctx.thisPage, thisRel: ctx.thisRel });
}

export { field };
