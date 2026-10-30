// dataviewjs: running a note's script with Dataview's `dv` API. The script
// sees the vault's pages (no files, no network) and its output is a list of
// render ops ({ op: 'paragraph', value }, { op: 'table', … }, …) that the app
// draws. Runs inside the sandbox window (src/dvjs.js); pure otherwise.
import { DateTime, Duration, Link, compare, equals, parseDuration, toText, isLink } from './values.mjs';
import { resolveLink } from '../notestree.mjs';
import { parseSource, DataviewError } from './parse.mjs';
import { sourcePages, runQuery } from './query.mjs';
import { FUNCTIONS, dateLiteral } from './eval.mjs';
import { dataArray, isDataArray } from './data-array.mjs';
import { toWire, fromWire } from './wire.mjs';

export const MAX_OPS = 500;

// An index (as lib/dataview/index.mjs builds) from wire pages: { rel: page }.
export function indexFromWire(wirePages) {
  const pages = new Map();
  for (const [rel, p] of Object.entries(wirePages || {})) {
    const page = fromWire(p);
    // file.tasks travels as part of file.lists (see indexToWire).
    if (page.file) page.file.tasks = (page.file.lists || []).filter((it) => it.task);
    pages.set(rel, page);
  }
  const relList = [...pages.keys()].map((rel) => ({ rel }));
  return {
    pages,
    relList,
    page: (rel) => pages.get(rel) || null,
    resolve: (target, fromRel) => resolveLink(target, fromRel || '', relList),
  };
}

export function indexToWire(index) {
  const out = {};
  for (const [rel, p] of index.pages) out[rel] = toWire({ ...p, file: { ...p.file, tasks: undefined } });
  return out;
}

const plain = (x) => (isDataArray(x) ? x.array() : x);
const deep = (x) => {
  const v = plain(x);
  if (Array.isArray(v)) return v.map(deep);
  if (v && typeof v === 'object' && !isLink(v) && !DateTime.isDateTime(v) && !Duration.isDuration(v)) {
    const o = {};
    for (const [k, y] of Object.entries(v)) o[k] = deep(y);
    return o;
  }
  return v;
};

const TAGS = new Set(['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'b', 'i', 'strong', 'em', 'u', 's', 'small', 'mark', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'hr', 'br', 'sup', 'sub']);

export function createDv(index, thisRel) {
  const ops = [];
  const push = (op) => {
    if (ops.length >= MAX_OPS) throw new DataviewError(`A script can draw at most ${MAX_OPS} things`);
    ops.push(op);
  };
  const pageOf = (path) => {
    if (path == null) return undefined;
    const p = isLink(path) ? path.path : String(path);
    const rel = index.pages.has(p) ? p : index.pages.has(`${p}.md`) ? `${p}.md` : index.resolve(p.replace(/\.md$/i, ''), thisRel);
    return rel ? index.page(rel) : undefined;
  };
  const pagesOf = (source) => {
    const src = source == null || source === '' ? null : parseSource(source);
    return [...sourcePages(src, index, thisRel)].sort((a, b) => compare(a.toLowerCase(), b.toLowerCase()));
  };
  const queryValue = (dql) => {
    const r = runQuery(String(dql), { index, thisRel });
    if (r.type === 'table') return { type: 'table', headers: [...(r.idColumn ? [r.idColumn] : []), ...r.headers], values: r.rows, idMeaning: { type: 'path' } };
    if (r.type === 'list') return { type: 'list', values: r.items ? r.items.map((i) => (i.value !== undefined ? i.value : i.id)) : r.groups.map((g) => ({ key: g.key, rows: g.items })) };
    if (r.type === 'task') return { type: 'task', values: r.groups.flatMap((g) => g.tasks) };
    return { type: 'calendar', values: r.entries };
  };
  const ctx = { index, thisRel, thisPage: index.page(thisRel) };
  const func = {};
  for (const [name, f] of Object.entries(FUNCTIONS)) func[name] = (...args) => f(args.map(deep), ctx);

  const dv = {
    current: () => index.page(thisRel),
    page: (path) => pageOf(path),
    pages: (source) => dataArray(pagesOf(source).map((rel) => index.page(rel))),
    pagePaths: (source) => dataArray(pagesOf(source)),
    array: (x) => dataArray(plain(x) == null ? [] : Array.isArray(plain(x)) ? plain(x) : [plain(x)]),
    isArray: (x) => Array.isArray(x) || isDataArray(x),
    fileLink: (path, embed = false, display) => new Link(String(path), { embed, display: display ?? null }),
    sectionLink: (path, section, embed = false, display) => new Link(String(path), { subpath: section, embed, display: display ?? null, type: 'header' }),
    blockLink: (path, block, embed = false, display) => new Link(String(path), { subpath: `^${block}`, embed, display: display ?? null, type: 'block' }),
    date: (x) => (x == null ? null : DateTime.isDateTime(x) ? x : typeof x === 'string' ? dateLiteral(x) : null),
    duration: (x) => (x == null ? null : Duration.isDuration(x) ? x : parseDuration(String(x))),
    compare: (a, b) => compare(a, b),
    equal: (a, b) => equals(a, b),
    clone: (x) => fromWire(toWire(deep(x))),
    luxon: { DateTime, Duration },
    func,
    value: { isArray: (x) => Array.isArray(x) || isDataArray(x) },
    io: {
      load: () => { throw new DataviewError('dv.io is not available in Mufka: scripts cannot read files'); },
      csv: () => { throw new DataviewError('dv.io is not available in Mufka: scripts cannot read files'); },
    },
    view: () => { throw new DataviewError('dv.view is not available in Mufka: scripts cannot load other scripts'); },
    query: async (dql) => {
      try { return { successful: true, value: queryValue(dql) }; } catch (e) { return { successful: false, error: e.message }; }
    },
    tryQuery: async (dql) => queryValue(dql),
    queryMarkdown: async (dql) => ({ successful: false, error: 'queryMarkdown is not available in Mufka' }),

    // drawing
    header: (level, text) => push({ op: 'header', level: Math.min(6, Math.max(1, Number(level) || 1)), value: toWire(deep(text)) }),
    paragraph: (text) => push({ op: 'paragraph', value: toWire(deep(text)) }),
    span: (text) => push({ op: 'span', value: toWire(deep(text)) }),
    el: (tag, text, attrs = {}) => {
      const t = String(tag).toLowerCase();
      push({ op: 'el', tag: TAGS.has(t) ? t : 'div', value: toWire(deep(text)), cls: attrs && attrs.cls ? String(Array.isArray(attrs.cls) ? attrs.cls.join(' ') : attrs.cls) : null });
    },
    list: (values) => push({ op: 'list', values: toWire(deep(values) || []) }),
    table: (headers, values) => push({ op: 'table', headers: (deep(headers) || []).map((h) => toText(h)), rows: toWire(deep(values) || []) }),
    taskList: (tasks, groupByFile = true) => push({ op: 'tasks', tasks: toWire(deep(tasks) || []), groupByFile: !!groupByFile }),
    execute: (dql) => push({ op: 'query', result: toWire(runQuery(String(dql), { index, thisRel })) }),
    markdownTable: (headers, values) => {
      const h = (deep(headers) || []).map(toText);
      const rows = (deep(values) || []).map((r) => `| ${r.map((c) => toText(c).replace(/\|/g, '\\|')).join(' | ')} |`);
      return [`| ${h.join(' | ')} |`, `| ${h.map(() => '---').join(' | ')} |`, ...rows].join('\n');
    },
    markdownList: (values) => (deep(values) || []).map((v) => `- ${toText(v)}`).join('\n'),
  };
  Object.defineProperty(dv, 'container', { get() { throw new DataviewError('dv.container is not available in Mufka: draw with dv.paragraph, dv.table, dv.list…'); } });
  return { dv, ops };
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

// Run `code` for the note at `thisRel`. Returns { ops, error }.
export async function runScript(code, index, thisRel) {
  const { dv, ops } = createDv(index, thisRel);
  try {
    const fn = new AsyncFunction('dv', 'input', '"use strict";\n' + String(code));
    await fn(dv, undefined);
    return { ops, error: null };
  } catch (e) {
    return { ops, error: e && e.message ? e.message : String(e) };
  }
}
