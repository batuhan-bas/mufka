// Pure Markdown renderer. Turns the syntax tree from lib/mdparse.mjs into an
// array of DOM block nodes built only with createElement / createTextNode /
// textContent / setAttribute — never innerHTML, so any HTML in the source (e.g.
// a <script> tag) stays inert text.
//
// The `doc` is injected so node:test can pass a minimal fake document.
// `noteExists(title)` marks wiki links to missing notes; links default to
// existing. Task checkboxes carry data-line = source line index so the caller
// can rewrite that line on toggle.
//
// Supported: CommonMark (headings 1-6, emphasis, code, quotes, nested lists,
// rules, links, images) + GFM (tables, task lists, strikethrough, autolinks,
// footnotes) + YAML frontmatter (shown as a property list) + Obsidian syntax:
// wiki links [[Title|alias#heading]], embeds ![[file]], #tags, ==highlights==,
// callouts > [!note] Title (lib/callout.mjs).
// Like Obsidian, a single line break inside a paragraph is a line break.
// Only http(s) links become anchors; other schemes stay literal text.

import { parseWikiInner } from './links.mjs';
import { parseMarkdown, frontmatterRows } from './mdparse.mjs';
import { parseCallout, defaultCalloutTitle } from './callout.mjs';
import { applyHtml } from './html.mjs';
import { isNoteTarget, embedSection } from './embed.mjs';

function appendAll(parent, nodes) { for (const n of nodes) parent.appendChild(n); }

function isHttp(url) { return /^https?:\/\//i.test(url); }

// An external (http/https only) anchor whose content is `text` or child nodes.
function extLink(content, url, doc) {
  if (!isHttp(url)) return doc.createTextNode(`[${content}](${url})`);
  const a = doc.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('data-external', 'true');
  a.setAttribute('rel', 'noreferrer');
  if (Array.isArray(content)) appendAll(a, content);
  else a.textContent = content;
  return a;
}

// Render an attachment reference. `embed` is true for `![...]` / `![[...]]`
// (image/embed intent), false for a plain `[...](local)` link. The resolver
// opts.attach(rawPath) decides image vs file vs missing vs remote; without it
// (node tests) the raw Markdown is kept as text.
function attachmentNode(rawPath, alt, doc, opts, embed) {
  const info = opts && opts.attach ? opts.attach(rawPath) : null;
  const raw = () => doc.createTextNode(`${embed ? '!' : ''}[${alt}](${rawPath})`);
  if (!info) return raw();
  if (info.remote) return extLink(alt || rawPath, rawPath, doc);
  if (!info.local) return raw();
  if (!info.exists) {
    const s = doc.createElement('span');
    s.setAttribute('class', 'att-missing');
    s.textContent = `File not found: ${info.name}`;
    return s;
  }
  if (embed && info.isImage) {
    const img = doc.createElement('img');
    img.setAttribute('src', info.url);
    img.setAttribute('alt', alt || info.name);
    img.setAttribute('class', 'att-img');
    img.setAttribute('data-att', info.rel || rawPath);
    return img;
  }
  const a = doc.createElement('a');
  a.setAttribute('class', 'att-file');
  a.setAttribute('data-att', info.rel || rawPath);
  a.textContent = alt || info.name;
  return a;
}

// ![[x]]: a note (rendered inline, like Obsidian's transclusion) when
// opts.embedNote finds one, else an attachment. Embeds nest at most 3 deep and
// never loop; past that they show as a plain link. Embedded content is
// read-only: its checkboxes are disabled (their lines belong to another note).
const MAX_EMBED_DEPTH = 3;
function embedNode(inner, doc, opts) {
  const { target, heading } = parseWikiInner(inner);
  // A drawing (Sketch.excalidraw) is drawn by the app.
  if (opts && opts.embedDrawing && /\.excalidraw(\.md)?$/i.test(target)) {
    const d = opts.embedDrawing(target);
    if (d) return d;
  }
  const note = opts && opts.embedNote && isNoteTarget(target) ? opts.embedNote(target) : null;
  if (!note) return attachmentNode(inner, '', doc, opts, true);
  const stack = opts.embedStack || [];
  if (stack.includes(note.rel) || stack.length >= MAX_EMBED_DEPTH) return wikiLink(inner, doc, opts.noteExists);
  const box = doc.createElement('div');
  box.setAttribute('class', 'embed');
  box.setAttribute('data-embed', note.rel);
  const title = wikiLink(heading ? `${target}#${heading}` : target, doc, opts.noteExists);
  title.setAttribute('class', 'wikilink embed-title');
  box.appendChild(title);
  const body = doc.createElement('div');
  body.setAttribute('class', 'embed-body');
  const part = embedSection(note.content, heading);
  if (part == null) body.textContent = `Heading not found: ${heading}`;
  else {
    const inner2 = { ...opts, refs: undefined, readOnly: true, embedStack: [...stack, note.rel], attach: note.attach || opts.attach };
    appendAll(body, renderMarkdown(part, inner2));
  }
  box.appendChild(body);
  return box;
}

// A wiki link's inner text may carry an alias (|) and a heading anchor (#).
// data-wiki holds the resolution target; data-heading (if any) is scrolled to
// when the link is followed. The visible text is the alias, else the title
// (last path segment) plus " › Heading" when a heading is present.
function wikiLink(inner, doc, noteExists) {
  const { target, heading, alias } = parseWikiInner(inner);
  const a = doc.createElement('a');
  const exists = noteExists ? noteExists(target) : true;
  a.setAttribute('class', exists ? 'wikilink' : 'wikilink missing');
  a.setAttribute('data-wiki', target);
  if (heading) a.setAttribute('data-heading', heading);
  const base = target.slice(target.lastIndexOf('/') + 1);
  a.textContent = alias != null ? alias : (heading ? `${base} › ${heading}` : base);
  return a;
}

// Obsidian syntax inside plain text (never inside code): embeds ![[x]], wiki
// links [[x]], ==highlights==, #tags; a soft line break becomes <br>.
const INLINE_RE = /!\[\[([^\]]+)\]\]|\[\[([^\]]+)\]\]|==([^=\n]+)==|(^|[\s(])#([\p{L}\d_/-]*\p{L}[\p{L}\d_/-]*)|\n/gu;

function textNodes(value, doc, opts) {
  const out = [];
  let last = 0;
  const plain = (t) => { if (t) out.push(doc.createTextNode(t)); };
  for (const m of value.matchAll(INLINE_RE)) {
    const lead = m[4] || '';
    plain(value.slice(last, m.index + lead.length));
    if (m[1] != null) out.push(embedNode(m[1].trim(), doc, opts));
    else if (m[2] != null) out.push(wikiLink(m[2], doc, opts && opts.noteExists));
    else if (m[3] != null) { const mk = doc.createElement('mark'); mk.textContent = m[3]; out.push(mk); }
    else if (m[5] != null) {
      const t = doc.createElement('span');
      t.setAttribute('class', 'tag');
      t.setAttribute('data-tag', m[5]);
      t.textContent = `#${m[5]}`;
      out.push(t);
    } else out.push(doc.createElement('br'));
    last = m.index + m[0].length;
  }
  plain(value.slice(last));
  return out;
}

// Plain text of a subtree (link labels, image alts).
function plainText(node) {
  if (node.value != null) return node.value;
  return (node.children || []).map(plainText).join('');
}

// The node's exact source, for things shown verbatim (e.g. a javascript: link).
function sourceOf(node, ctx) {
  const p = node.position;
  return p ? ctx.src.slice(p.start.offset, p.end.offset) : plainText(node);
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function linkNode(node, url, ctx) {
  const { doc, opts } = ctx;
  if (isHttp(url)) return extLink(inline(node.children, ctx), url, doc);
  if (HAS_SCHEME.test(url)) return doc.createTextNode(sourceOf(node, ctx));
  return attachmentNode(url, plainText(node), doc, opts, false);
}

// Inline HTML arrives as separate tags around Markdown ("a <b>", "bold", "</b>"),
// so open tags hold what follows until they close.
function inline(nodes, ctx) {
  const out = [];
  const stack = [];
  const emit = (n) => { if (stack.length) stack[stack.length - 1].el.appendChild(n); else out.push(n); };
  for (const n of nodes || []) {
    if (n.type === 'html') applyHtml(n.value, stack, (x) => out.push(x), ctx, (t) => textNodes(t, ctx.doc, ctx.opts));
    else for (const x of inlineNode(n, ctx)) emit(x);
  }
  return out;
}

// A block of HTML on its own (inside a list or quote).
function htmlBlock(value, ctx) {
  const out = [];
  applyHtml(value, [], (x) => out.push(x), ctx);
  return out;
}

function inlineNode(node, ctx) {
  const { doc, opts } = ctx;
  const wrap = (tag) => { const e = doc.createElement(tag); appendAll(e, inline(node.children, ctx)); return [e]; };
  switch (node.type) {
    case 'text': return textNodes(node.value, doc, opts);
    case 'emphasis': return wrap('em');
    case 'strong': return wrap('strong');
    case 'delete': return wrap('del');
    case 'inlineCode': {
      // `= expression`: an inline Dataview query (not `==highlight==`).
      if (opts.inlineQuery && /^=(?!=)/.test(node.value)) {
        const out = opts.inlineQuery(node.value.slice(1).trim());
        if (out) return [out];
      }
      const c = doc.createElement('code'); c.textContent = node.value; return [c];
    }
    case 'break': return [doc.createElement('br')];
    case 'link': return [linkNode(node, node.url, ctx)];
    case 'image': return [attachmentNode(node.url, node.alt || '', doc, opts, true)];
    case 'linkReference': {
      const def = ctx.definitions.get(String(node.identifier).toLowerCase());
      return [def ? linkNode(node, def.url, ctx) : doc.createTextNode(sourceOf(node, ctx))];
    }
    case 'imageReference': {
      const def = ctx.definitions.get(String(node.identifier).toLowerCase());
      return [def ? attachmentNode(def.url, node.alt || '', doc, opts, true) : doc.createTextNode(sourceOf(node, ctx))];
    }
    case 'footnoteReference': {
      const sup = doc.createElement('sup');
      sup.setAttribute('class', 'footnote-ref');
      sup.textContent = `[${node.label || node.identifier}]`;
      return [sup];
    }
    // Inline HTML stays inert, visible text.
    case 'html': return [doc.createTextNode(node.value)];
    default: return [doc.createTextNode(sourceOf(node, ctx))];
  }
}

function listItem(item, ordered, ctx) {
  const { doc } = ctx;
  const li = doc.createElement('li');
  if (item.checked != null) {
    li.setAttribute('class', 'task');
    const box = doc.createElement('input');
    box.setAttribute('type', 'checkbox');
    box.setAttribute('class', 'task-check');
    if (ctx.opts.readOnly) box.setAttribute('disabled', '');
    else box.setAttribute('data-line', String(item.position.start.line - 1));
    if (item.checked) box.setAttribute('checked', 'checked');
    li.appendChild(box);
  }
  for (const child of item.children) {
    // Tight lists put the text straight into <li>, like the old renderer.
    if (child.type === 'paragraph' && !item.spread) appendAll(li, inline(child.children, ctx));
    else appendAll(li, block(child, ctx));
  }
  return li;
}

function table(node, ctx) {
  const { doc } = ctx;
  const t = doc.createElement('table');
  const align = node.align || [];
  const row = (r, cellTag) => {
    const tr = doc.createElement('tr');
    r.children.forEach((cell, c) => {
      const td = doc.createElement(cellTag);
      // A class, not style="text-align": the CSP has no 'unsafe-inline' styles.
      if (align[c]) td.setAttribute('class', `align-${align[c]}`);
      appendAll(td, inline(cell.children, ctx));
      tr.appendChild(td);
    });
    return tr;
  };
  const [head, ...body] = node.children;
  const thead = doc.createElement('thead');
  thead.appendChild(row(head, 'th'));
  t.appendChild(thead);
  if (body.length) {
    const tbody = doc.createElement('tbody');
    for (const r of body) tbody.appendChild(row(r, 'td'));
    t.appendChild(tbody);
  }
  return t;
}

function frontmatterNode(node, ctx) {
  const { doc } = ctx;
  const rows = frontmatterRows(node.value);
  if (!rows) {
    const pre = doc.createElement('pre');
    pre.setAttribute('class', 'frontmatter frontmatter-raw');
    const code = doc.createElement('code');
    code.textContent = node.value;
    pre.appendChild(code);
    return pre;
  }
  const dl = doc.createElement('dl');
  dl.setAttribute('class', 'frontmatter');
  for (const { key, value } of rows) {
    const dt = doc.createElement('dt'); dt.textContent = key;
    const dd = doc.createElement('dd'); dd.textContent = value;
    dl.appendChild(dt); dl.appendChild(dd);
  }
  return dl;
}

// An Obsidian callout: a titled box. Foldable ones ("[!x]-" / "[!x]+") are a
// native <details>, so they open and close with the keyboard too.
function calloutNode(c, ctx) {
  const { doc } = ctx;
  const box = doc.createElement(c.fold ? 'details' : 'div');
  box.setAttribute('class', `callout callout-${c.kind}`);
  box.setAttribute('data-callout', c.type);
  if (c.fold === '+') box.setAttribute('open', '');
  const title = doc.createElement(c.fold ? 'summary' : 'div');
  title.setAttribute('class', 'callout-title');
  if (c.title.length) appendAll(title, inline(c.title, ctx));
  else title.textContent = defaultCalloutTitle(c.type);
  box.appendChild(title);
  if (c.body.length) {
    const content = doc.createElement('div');
    content.setAttribute('class', 'callout-content');
    appendAll(content, c.body.flatMap((n) => block(n, ctx)));
    box.appendChild(content);
  }
  return box;
}

function block(node, ctx) {
  const { doc, opts } = ctx;
  const el = (tag, kids) => { const e = doc.createElement(tag); appendAll(e, kids); return [e]; };
  switch (node.type) {
    case 'heading': return el(`h${node.depth}`, inline(node.children, ctx));
    case 'paragraph': return el('p', inline(node.children, ctx));
    case 'blockquote': {
      const callout = parseCallout(node);
      if (callout) return [calloutNode(callout, ctx)];
      return el('blockquote', node.children.flatMap((c) => block(c, ctx)));
    }
    case 'list': {
      const list = doc.createElement(node.ordered ? 'ol' : 'ul');
      if (node.ordered && node.start != null && node.start !== 1) list.setAttribute('start', String(node.start));
      for (const item of node.children) list.appendChild(listItem(item, node.ordered, ctx));
      return [list];
    }
    case 'code': {
      // Dataview queries and diagrams are drawn by the app (opts.blocks), when it can.
      const lang = String(node.lang || '').toLowerCase();
      if (opts.blocks && opts.blocks[lang]) {
        const out = opts.blocks[lang](node.value, node.meta || '');
        if (out) return [out];
      }
      const pre = doc.createElement('pre');
      const code = doc.createElement('code');
      if (node.lang) code.setAttribute('class', `language-${node.lang}`);
      code.textContent = node.value;
      pre.appendChild(code);
      return [pre];
    }
    case 'thematicBreak': return [doc.createElement('hr')];
    case 'table': return [table(node, ctx)];
    case 'yaml': return [frontmatterNode(node, ctx)];
    case 'footnoteDefinition': {
      const div = doc.createElement('div');
      div.setAttribute('class', 'footnote');
      const label = doc.createElement('sup');
      label.textContent = `[${node.label || node.identifier}]`;
      div.appendChild(label);
      for (const c of node.children) appendAll(div, c.type === 'paragraph' ? inline(c.children, ctx) : block(c, ctx));
      return [div];
    }
    case 'definition': return [];
    case 'html': return htmlBlock(node.value, ctx);
    default: return el('p', [doc.createTextNode(sourceOf(node, ctx))]);
  }
}

// The source of every footnote / link definition in a document. The block
// editor renders every block of a note against the same document, so the last
// result is kept: one full parse per note version instead of one per block.
let definitionsCache = { full: null, defs: [] };
function definitionsOf(full) {
  if (definitionsCache.full !== full) {
    const defs = [];
    for (const n of parseMarkdown(full).children) {
      if (n.type === 'definition' || n.type === 'footnoteDefinition') {
        defs.push(full.slice(n.position.start.offset, n.position.end.offset));
      }
    }
    definitionsCache = { full, defs };
  }
  return definitionsCache.defs;
}

// The definitions in `full` that `src` (one block of it) lacks.
function missingDefinitions(src, full) {
  return definitionsOf(full).filter((def) => !src.includes(def));
}

// `opts.refs` is the whole document when `src` is one block of it (the block
// editor): footnote references and [text][ref] links in the block resolve
// against definitions elsewhere in the note, without rendering those.
export function renderMarkdown(src, opts = {}) {
  const doc = opts.doc || (typeof document !== 'undefined' ? document : null);
  if (!doc) throw new Error('renderMarkdown needs a document');
  const text = String(src == null ? '' : src);
  const extra = opts.refs ? missingDefinitions(text, String(opts.refs)) : [];
  const parsed = extra.length ? `${text}\n\n${extra.join('\n\n')}` : text;
  const tree = parseMarkdown(parsed);
  const definitions = new Map();
  for (const n of tree.children) if (n.type === 'definition') definitions.set(String(n.identifier).toLowerCase(), n);
  const ctx = { doc, opts, src: parsed, definitions };
  // An HTML block may open an element (<details>) that holds the Markdown
  // blocks after it until a later HTML block closes it.
  const out = [];
  const stack = [];
  const emit = (n) => { if (stack.length) stack[stack.length - 1].el.appendChild(n); else out.push(n); };
  for (const n of tree.children) {
    if (!(n.position.start.offset < text.length || text.length === 0)) continue;
    if (n.type === 'html') applyHtml(n.value, stack, (x) => out.push(x), ctx);
    else for (const x of block(n, ctx)) emit(x);
  }
  return out;
}

// A task line: optional quote markers and indentation, a list marker (- * + 1. 1)),
// then [ ] / [x]. Group 1 is everything before the box, group 2 its state.
const TASK_RE = /^((?:\s*>)*\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/;

// Flip the checkbox state of a single task line in the raw source.
export function toggleTaskLine(src, lineIndex) {
  const lines = String(src).split('\n');
  const l = lines[lineIndex];
  if (l === undefined) return src;
  const m = TASK_RE.exec(l);
  if (!m) return src;
  const checked = m[2].toLowerCase() === 'x';
  lines[lineIndex] = `${m[1]}[${checked ? ' ' : 'x'}]${l.slice(m[0].length)}`;
  return lines.join('\n');
}
