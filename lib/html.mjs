// HTML written in notes, made safe: an allowlist of formatting tags (b, i, u,
// mark, kbd, sub/sup, br, details/summary, div, span, tables, lists…) with a
// few harmless attributes becomes real elements; anything else — script,
// iframe, style, unknown tags like <name> — stays visible as text, and
// comments are hidden, as in Obsidian. Pure: elements come from `doc`.

export const ALLOWED = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'blockquote', 'br', 'caption', 'center', 'cite', 'code', 'col', 'colgroup',
  'dd', 'del', 'details', 'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'font', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 'rp', 'rt', 'ruby', 's',
  'samp', 'small', 'span', 'strike', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th',
  'thead', 'time', 'tr', 'tt', 'u', 'ul', 'var', 'wbr',
]);
export const VOID = new Set(['br', 'hr', 'img', 'wbr', 'col']);

// Attributes kept, per tag ('*' = every tag). Never style, on*, class or id.
const ATTRS = {
  '*': ['title', 'dir', 'lang'],
  a: ['href'],
  img: ['src', 'alt', 'width', 'height', 'align'],
  td: ['colspan', 'rowspan', 'align', 'valign'],
  th: ['colspan', 'rowspan', 'align', 'valign', 'scope'],
  col: ['span'], colgroup: ['span'],
  ol: ['start', 'reversed', 'type'], li: ['value'],
  details: ['open'],
  p: ['align'], div: ['align'], h1: ['align'], h2: ['align'], h3: ['align'], h4: ['align'], h5: ['align'], h6: ['align'],
  table: ['align'], time: ['datetime'], abbr: ['title'], q: ['cite'], blockquote: ['cite'], bdo: ['dir'],
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', middot: '·', bull: '•', larr: '←', rarr: '→', uarr: '↑', darr: '↓', times: '×', divide: '÷', deg: '°', euro: '€' };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    const v = ENTITIES[e.toLowerCase()];
    return v != null ? v : m;
  });
}

const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

// Split HTML into tokens: { type: 'open', tag, attrs, self, raw } | { type:
// 'close', tag, raw } | { type: 'comment' } | { type: 'text', text }.
export function htmlTokens(src) {
  const s = String(src);
  const out = [];
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt === -1) { out.push({ type: 'text', text: s.slice(i) }); break; }
    if (lt > i) out.push({ type: 'text', text: s.slice(i, lt) });
    if (s.startsWith('<!--', lt)) {
      const end = s.indexOf('-->', lt + 4);
      out.push({ type: 'comment' });
      i = end === -1 ? s.length : end + 3;
      continue;
    }
    const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/.exec(s.slice(lt));
    if (!m) { out.push({ type: 'text', text: '<' }); i = lt + 1; continue; }
    const tag = m[2].toLowerCase();
    if (m[1]) out.push({ type: 'close', tag, raw: m[0] });
    else {
      const attrs = {};
      for (const a of m[3].matchAll(ATTR_RE)) attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '');
      out.push({ type: 'open', tag, attrs, self: !!m[4], raw: m[0] });
    }
    i = lt + m[0].length;
  }
  return out;
}

const isHttp = (u) => /^https?:\/\//i.test(u);

// The element for an allowed tag, with its safe attributes; null when it
// cannot be shown (an image that is not in the vault, say).
function element(tag, attrs, ctx) {
  const { doc, opts } = ctx;
  if (tag === 'img') {
    const src = attrs.src || '';
    const info = opts && opts.attach && src && !/^[a-z][a-z0-9+.-]*:/i.test(src) ? opts.attach(src) : null;
    if (!info || !info.local || !info.exists || !info.isImage) return null;
    const img = doc.createElement('img');
    img.setAttribute('src', info.url);
    img.setAttribute('class', 'att-img');
    img.setAttribute('data-att', info.rel || src);
    img.setAttribute('alt', attrs.alt || info.name);
    for (const k of ['width', 'height']) if (/^\d{1,4}%?$/.test(attrs[k] || '')) img.setAttribute(k, attrs[k]);
    return img;
  }
  const el = doc.createElement(tag === 'center' ? 'div' : tag === 'font' ? 'span' : tag === 'strike' || tag === 'tt' ? (tag === 'strike' ? 's' : 'code') : tag);
  if (tag === 'center') el.setAttribute('align', 'center');
  if (tag === 'a') {
    const href = attrs.href || '';
    if (isHttp(href)) {
      el.setAttribute('href', href);
      el.setAttribute('data-external', 'true');
      el.setAttribute('rel', 'noreferrer');
    }
  }
  for (const k of [...ATTRS['*'], ...(ATTRS[tag] || [])]) {
    if (k === 'href' || k === 'src' || attrs[k] == null) continue;
    el.setAttribute(k, attrs[k]);
  }
  return el;
}

// Apply HTML tokens into a running tree: `stack` holds the open elements
// ([{ tag, el }]); `emit(node)` adds to the innermost one (or the output).
// Text becomes text nodes via `text(str)` (so callers can keep their #tags).
export function applyHtml(src, stack, emit, ctx, text) {
  const { doc } = ctx;
  const put = (n) => { if (stack.length) stack[stack.length - 1].el.appendChild(n); else emit(n); };
  const putText = (t) => { for (const n of text ? text(t) : [doc.createTextNode(t)]) put(n); };
  for (const t of htmlTokens(src)) {
    if (t.type === 'comment') continue;
    if (t.type === 'text') { putText(decodeEntities(t.text)); continue; }
    if (!ALLOWED.has(t.tag)) { putText(t.raw); continue; }
    if (t.type === 'open') {
      const el = element(t.tag, t.attrs, ctx);
      if (!el) { if (t.tag === 'img' && t.attrs.alt) putText(t.attrs.alt); continue; }
      put(el);
      if (!VOID.has(t.tag) && !t.self) stack.push({ tag: t.tag, el });
      continue;
    }
    // A close tag ends the innermost element of its kind (and what is inside it).
    const at = stack.map((x) => x.tag).lastIndexOf(t.tag);
    if (at !== -1) stack.length = at;
  }
}
