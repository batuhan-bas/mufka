// The Dataview page index: every note of the vault as a page of fields, the way
// the Obsidian Dataview plugin sees it — frontmatter (YAML), inline fields
// (`Key:: value`, `[key:: value]`, `(key:: value)`), and the implicit `file`
// object (name, path, folder, link, dates, size, tags, links, tasks and list
// items). Pure: notes come in as [{ rel, content, mtime?, ctime?, size? }].
import YAML from 'yaml';
import { resolveLink, folderOf } from '../notestree.mjs';
import { scanTags } from '../tags.mjs';
import { parseWikiInner } from '../links.mjs';
import { DateTime, Link, isDate, parseDate, parseDuration, canonicalName } from './values.mjs';

// --- raw values ---------------------------------------------------------------

const WIKI_ONLY = /^!?\[\[([^\]]+)\]\]$/;

// A wiki link written as a value ("[[Note|shown]]"), resolved from `fromRel`.
export function linkValue(inner, fromRel, relList, embed = false) {
  const { target, heading, alias } = parseWikiInner(inner);
  const rel = target ? resolveLink(target, fromRel, relList) : fromRel;
  const path = rel || `${target}${/\.md$/i.test(target) ? '' : '.md'}`;
  return new Link(path, { display: alias != null ? alias.trim() : null, subpath: heading != null ? heading.trim() : null, embed, type: heading != null ? 'header' : 'file' });
}

// A string from frontmatter: a lone link, a date or a duration becomes that type.
function stringValue(s, ctx) {
  const t = s.trim();
  const m = WIKI_ONLY.exec(t);
  if (m) return linkValue(m[1], ctx.rel, ctx.relList, t.startsWith('!'));
  const d = parseDate(t);
  if (d) return d;
  if (/\d/.test(t) && /[a-z]/i.test(t) && t.length < 40) {
    const dur = parseDuration(t);
    if (dur) return dur;
  }
  return s;
}

function yamlValue(v, ctx) {
  if (v == null) return null;
  if (typeof v === 'string') return stringValue(v, ctx);
  if (v instanceof Date) return DateTime.fromJSDate(v);
  if (Array.isArray(v)) {
    // [[link]] in flow YAML parses as a nested list: [["Note"]].
    if (v.length === 1 && Array.isArray(v[0]) && v[0].length === 1 && typeof v[0][0] === 'string') {
      return linkValue(v[0][0], ctx.rel, ctx.relList);
    }
    return v.map((x) => yamlValue(x, ctx));
  }
  if (typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = yamlValue(x, ctx);
    return o;
  }
  return v;
}

// One atom of an inline field value; `null` when the text is just text.
function inlineAtom(t, ctx) {
  if (/^[-+]?\d+(?:\.\d+)?$/.test(t)) return { v: Number(t) };
  if (/^(true|false)$/i.test(t)) return { v: t.toLowerCase() === 'true' };
  const m = WIKI_ONLY.exec(t);
  if (m) return { v: linkValue(m[1], ctx.rel, ctx.relList, t.startsWith('!')) };
  const d = parseDate(t);
  if (d) return { v: d };
  const dur = /\d/.test(t) ? parseDuration(t) : null;
  if (dur) return { v: dur };
  const q = /^"((?:[^"\\]|\\.)*)"$/.exec(t);
  if (q) return { v: q[1].replace(/\\(.)/g, '$1') };
  return null;
}

// The value of `Key:: value`: a number, boolean, link, date or duration, a list
// of those when comma separated, else the text itself.
export function inlineValue(raw, ctx) {
  const t = String(raw).trim();
  if (!t) return null;
  const one = inlineAtom(t, ctx);
  if (one) return one.v;
  if (t.includes(',')) {
    const parts = t.split(',').map((p) => p.trim());
    const atoms = parts.map((p) => inlineAtom(p, ctx));
    if (parts.length > 1 && atoms.every(Boolean)) return atoms.map((a) => a.v);
  }
  return t;
}

// --- fields -------------------------------------------------------------------

// Set a field under its own name and its canonical one; a repeated name
// collects its values into a list, as Dataview does.
function addField(target, key, value, seen) {
  const names = [...new Set([key.trim(), canonicalName(key)])].filter(Boolean);
  for (const name of names) {
    if (name === 'file') continue;
    if (seen.has(name)) {
      const cur = target[name];
      target[name] = Array.isArray(cur) && seen.get(name) ? [...cur, value] : [cur, value];
      seen.set(name, true);
    } else {
      target[name] = value;
      seen.set(name, false);
    }
  }
}

const FULL_FIELD = /^\s*(?:>\s*)*(?:(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?)?([^\s\[\]()`:#>][^\[\]()`:]*?)::(?!:)\s?(.*)$/;
const BRACKET_FIELD = /\[([^\[\]()]+?)::\s*((?:[^\[\]]|\[\[[^\]]*\]\])*)\]/g;
const PAREN_FIELD = /\(([^\[\]()]+?)::\s*((?:[^()[\]]|\[\[[^\]]*\]\])*)\)/g;

// The inline fields of one line: [{ key, raw }].
export function lineFields(line) {
  const out = [];
  const noCode = line.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));
  for (const re of [BRACKET_FIELD, PAREN_FIELD]) {
    re.lastIndex = 0;
    for (const m of noCode.matchAll(re)) {
      const key = m[1].replace(/[*_~]/g, '').trim();
      if (key) out.push({ key, raw: line.slice(m.index + m[0].indexOf('::') + 2, m.index + m[0].length - 1).trim() });
    }
  }
  if (!out.length) {
    const m = FULL_FIELD.exec(noCode);
    if (m && !/:\/\//.test(m[1])) {
      const key = m[1].replace(/[*_~]/g, '').trim();
      const at = noCode.indexOf('::', m.index) + 2;
      if (key) out.push({ key, raw: line.slice(at).trim() });
    }
  }
  return out;
}

// --- list items and tasks -----------------------------------------------------

const LIST_RE = /^((?:[ \t]*>)*)([ \t]*)([-*+]|\d+[.)])[ \t]+(?:\[(.)\][ \t]?)?(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const BLOCK_ID_RE = /\s\^([A-Za-z0-9-]+)\s*$/;
// Tasks plugin shorthand dates.
const EMOJI_DATES = [['📅', 'due'], ['✅', 'completion'], ['➕', 'created'], ['🛫', 'start'], ['⏳', 'scheduled']];

const indentOf = (s) => s.replace(/\t/g, '    ').length;

function wikiLinksIn(text, ctx) {
  const out = [];
  for (const m of text.matchAll(/(!?)\[\[([^\]]+)\]\]/g)) out.push(linkValue(m[2], ctx.rel, ctx.relList, m[1] === '!'));
  return out;
}

function tagsIn(text) {
  return scanTags(text).map((t) => `#${t}`);
}

// --- one page -------------------------------------------------------------------

function frontmatterOf(lines) {
  if (lines[0] !== '---') return { yaml: null, end: -1 };
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---' || lines[i] === '...') return { yaml: lines.slice(1, i).join('\n'), end: i };
  }
  return { yaml: null, end: -1 };
}

function withParents(tags) {
  const out = new Set();
  for (const t of tags) {
    const parts = t.replace(/^#/, '').split('/');
    for (let i = 1; i <= parts.length; i++) out.add(`#${parts.slice(0, i).join('/')}`);
  }
  return [...out];
}

function dayOf(name, fields) {
  const m = /(\d{4})-?(\d{2})-?(\d{2})/.exec(name);
  if (m) {
    const d = DateTime.fromObject({ year: +m[1], month: +m[2], day: +m[3] });
    if (d.isValid) return d;
  }
  return isDate(fields.date) ? fields.date.startOf('day') : null;
}

function buildPage(note, relList) {
  const rel = note.rel;
  const ctx = { rel, relList };
  const content = String(note.content == null ? '' : note.content);
  const lines = content.split('\n');
  const page = {};
  const seen = new Map();

  // Frontmatter.
  const fm = frontmatterOf(lines);
  let frontmatter = {};
  if (fm.yaml != null) {
    try {
      const parsed = YAML.parse(fm.yaml, { uniqueKeys: false });
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) frontmatter = yamlValue(parsed, ctx);
    } catch { /* not YAML Dataview can read: no fields */ }
  }
  for (const [k, v] of Object.entries(frontmatter)) addField(page, k, v, seen);

  // Body: headings, inline fields, list items and tasks.
  const lists = [];
  const stack = []; // open list items by indentation
  let section = null;
  let inFence = null;
  for (let i = fm.end + 1; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (!inFence) inFence = fence[1][0];
      else if (fence[1][0] === inFence) inFence = null;
      continue;
    }
    if (inFence) continue;
    const h = HEADING_RE.exec(line);
    if (h) { section = h[2]; stack.length = 0; continue; }
    if (!line.trim()) continue;

    const fields = lineFields(line);
    for (const f of fields) addField(page, f.key, inlineValue(f.raw, ctx), seen);

    const li = LIST_RE.exec(line);
    if (!li) {
      // A paragraph line ends the lists above it (indented continuations do not).
      if (!/^\s/.test(line)) stack.length = 0;
      continue;
    }
    const indent = indentOf(li[2]);
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack.length ? stack[stack.length - 1].item : null;
    const text = li[5];
    const sectionLink = new Link(rel, { subpath: section, type: section ? 'header' : 'file' });
    const item = {
      symbol: li[3],
      link: sectionLink,
      section: sectionLink,
      text,
      visual: text,
      path: rel,
      line: i,
      lineCount: 1,
      list: parent ? parent.list : i,
      outlinks: wikiLinksIn(text, ctx),
      tags: tagsIn(text),
      children: [],
      task: li[4] != null,
      annotated: fields.length > 0,
      parent: parent ? parent.line : null,
      blockId: (BLOCK_ID_RE.exec(text) || [])[1] || null,
    };
    if (item.task) {
      item.status = li[4];
      item.checked = li[4] !== ' ';
      item.completed = li[4] === 'x' || li[4] === 'X';
    }
    const itemSeen = new Map();
    for (const f of fields) addField(item, f.key, inlineValue(f.raw, ctx), itemSeen);
    for (const [emoji, key] of EMOJI_DATES) {
      const m = new RegExp(`${emoji}\\uFE0F?\\s*(\\d{4}-\\d{2}-\\d{2})`, 'u').exec(text);
      if (m && item[key] === undefined) item[key] = parseDate(m[1]);
    }
    if (parent) parent.children.push(item);
    lists.push(item);
    stack.push({ indent, item });
  }
  for (const it of lists) it.fullyCompleted = fullyDone(it);

  // Links and tags of the whole note.
  const outlinks = [];
  const linkKeys = new Set();
  let fenceOpen = false;
  for (let i = fm.end + 1; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { fenceOpen = !fenceOpen; continue; }
    if (fenceOpen) continue;
    for (const l of wikiLinksIn(lines[i].replace(/`[^`]*`/g, ''), ctx)) {
      const key = `${l.path}#${l.subpath || ''}`;
      if (!linkKeys.has(key)) { linkKeys.add(key); outlinks.push(l); }
    }
  }
  for (const v of Object.values(frontmatter)) {
    for (const x of Array.isArray(v) ? v : [v]) {
      if (x instanceof Link && !linkKeys.has(`${x.path}#${x.subpath || ''}`)) { linkKeys.add(`${x.path}#${x.subpath || ''}`); outlinks.push(x); }
    }
  }

  const etags = scanTags(content).map((t) => `#${t}`);
  const name = rel.slice(rel.lastIndexOf('/') + 1).replace(/\.md$/i, '');
  const ms = (x) => (Number.isFinite(x) ? DateTime.fromMillis(x) : null);
  const mtime = ms(note.mtime);
  const ctime = ms(note.ctime) || mtime;
  const aliasesRaw = frontmatter.aliases ?? frontmatter.alias;
  page.file = {
    name,
    path: rel,
    folder: folderOf(rel),
    ext: 'md',
    link: new Link(rel),
    size: Number.isFinite(note.size) ? note.size : content.length,
    ctime,
    cday: ctime ? ctime.startOf('day') : null,
    mtime,
    mday: mtime ? mtime.startOf('day') : null,
    tags: withParents(etags),
    etags,
    outlinks,
    inlinks: [],
    aliases: aliasesRaw == null ? [] : (Array.isArray(aliasesRaw) ? aliasesRaw : [aliasesRaw]).map(String),
    tasks: lists.filter((it) => it.task),
    lists,
    frontmatter,
    starred: false,
    day: dayOf(name, page),
  };
  return page;
}

function fullyDone(item) {
  if (item.task && !item.completed) return false;
  return item.children.every(fullyDone);
}

// --- the index --------------------------------------------------------------------

export function buildIndex(notes) {
  const list = (notes || []).filter((n) => n && /\.md$/i.test(n.rel));
  const relList = list.map((n) => ({ rel: n.rel }));
  const pages = new Map();
  for (const n of list) pages.set(n.rel, buildPage(n, relList));
  for (const [rel, p] of pages) {
    for (const l of p.file.outlinks) {
      const target = pages.get(l.path);
      if (target && l.path !== rel && !target.file.inlinks.some((x) => x.path === rel)) target.file.inlinks.push(new Link(rel));
    }
  }
  return {
    pages,
    relList,
    page: (rel) => pages.get(rel) || null,
    resolve: (target, fromRel) => resolveLink(target, fromRel || '', relList),
  };
}
