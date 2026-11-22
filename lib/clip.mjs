// Web clipper: a web page's article as a note, as Obsidian Web Clipper makes
// it — the text in Markdown, and where it came from in the properties
// (source, author, published, created, description, tags: clippings).
// Works on a parsed (inert) Document; no network, no fs.

import { htmlToMarkdown } from './paste.mjs';

const JUNK = 'script, style, noscript, template, iframe, object, embed, form, button, input, select, textarea, svg, canvas, nav, aside, footer, header, [role=navigation], [role=banner], [role=contentinfo], [role=complementary], [aria-hidden=true], [hidden]';
const JUNK_NAME = /(^|[\s_-])(ad|ads|advert|banner|promo|sponsor|share|sharing|social|comment|comments|related|recommend|newsletter|subscribe|signup|cookie|consent|popup|modal|breadcrumb|sidebar|menu|footer|masthead|byline-share|toolbar|pagination|outbrain|taboola)([\s_-]|$)/i;

const meta = (doc, ...names) => {
  for (const n of names) {
    const el = doc.querySelector(`meta[property="${n}"], meta[name="${n}"], meta[itemprop="${n}"]`);
    const v = el && (el.getAttribute('content') || '').trim();
    if (v) return v;
  }
  return '';
};

// JSON-LD blocks (schema.org Article, NewsArticle…), flattened.
function jsonLd(doc) {
  const out = [];
  for (const s of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    let d;
    try { d = JSON.parse(s.textContent); } catch { continue; }
    const walk = (x) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { out.push(x); if (x['@graph']) walk(x['@graph']); } };
    walk(d);
  }
  return out;
}
const names = (a) => (Array.isArray(a) ? a : [a]).map((x) => (typeof x === 'string' ? x : x && x.name)).filter(Boolean).map((x) => String(x).trim());

// What the page says about itself.
export function clipMeta(doc, url) {
  const ld = jsonLd(doc).find((x) => /Article|BlogPosting|Report|WebPage/i.test([].concat(x['@type'] || []).join(' '))) || {};
  const title = meta(doc, 'og:title', 'twitter:title') || (ld.headline || '').trim() || (doc.querySelector('h1')?.textContent || '').trim() || (doc.title || '').trim();
  const authors = names(ld.author);
  const author = authors.length ? authors : [meta(doc, 'author', 'article:author', 'parsely-author', 'sailthru.author')].filter((x) => x && !/^https?:/i.test(x));
  const published = (ld.datePublished || meta(doc, 'article:published_time', 'datePublished', 'pubdate', 'date') || doc.querySelector('time[datetime]')?.getAttribute('datetime') || '').trim();
  const day = /^(\d{4}-\d{2}-\d{2})/.exec(published);
  return {
    title: title.replace(/\s+/g, ' ').slice(0, 300),
    author: [...new Set(author)],
    published: day ? day[1] : '',
    description: (meta(doc, 'og:description', 'description', 'twitter:description') || ld.description || '').replace(/\s+/g, ' ').trim().slice(0, 500),
    site: meta(doc, 'og:site_name') || (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } })(),
  };
}

const textLen = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().length;

// The element that holds the article: <article> / <main> when there is one,
// else the block with the most paragraph text.
export function articleElement(doc) {
  const body = doc.body;
  if (!body) return null;
  const articles = Array.from(doc.querySelectorAll('article, [itemprop=articleBody], [role=main], main')).filter((a) => textLen(a) > 200);
  if (articles.length) return articles.sort((a, b) => textLen(b) - textLen(a))[0];
  const scores = new Map();
  for (const p of Array.from(body.querySelectorAll('p, pre, li, blockquote'))) {
    const n = textLen(p);
    if (n < 40) continue;
    const parent = p.parentElement;
    if (!parent) continue;
    scores.set(parent, (scores.get(parent) || 0) + n);
    const grand = parent.parentElement;
    if (grand) scores.set(grand, (scores.get(grand) || 0) + n / 2);
  }
  let best = body; let top = 0;
  for (const [el, s] of scores) if (s > top) { best = el; top = s; }
  return best;
}

// The article's HTML: junk removed, links and images made absolute.
export function articleHtml(doc, url) {
  const root = articleElement(doc);
  if (!root) return '';
  const el = root.cloneNode(true);
  for (const x of Array.from(el.querySelectorAll(JUNK))) x.remove();
  for (const x of Array.from(el.querySelectorAll('[class], [id]'))) {
    if (!el.contains(x)) continue; // gone with a parent already
    const name = `${x.getAttribute('class') || ''} ${x.getAttribute('id') || ''}`;
    if (JUNK_NAME.test(name) && textLen(x) < 2000) x.remove();
  }
  const abs = (v) => { try { return new URL(v, url).href; } catch { return v; } };
  for (const a of Array.from(el.querySelectorAll('a[href]'))) { const h = a.getAttribute('href'); if (!h.startsWith('#')) a.setAttribute('href', abs(h)); }
  for (const img of Array.from(el.querySelectorAll('img'))) {
    // Lazy images keep the real address in data-src or srcset.
    const src = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('src') || (img.getAttribute('srcset') || '').split(',').pop().trim().split(/\s+/)[0] || '';
    if (!src || /^data:/i.test(src)) { img.remove(); continue; }
    img.setAttribute('src', abs(src));
  }
  return el.innerHTML;
}

const yamlStr = (s) => JSON.stringify(String(s));

// The note: { name, content }. today: "YYYY-MM-DD".
export function clipNote({ url, meta: m, markdown, today }) {
  const lines = ['---', `title: ${yamlStr(m.title || url)}`, `source: ${yamlStr(url)}`];
  if (m.author && m.author.length) lines.push('author:', ...m.author.map((a) => `  - ${yamlStr(`[[${a.replace(/[[\]|#^]/g, '')}]]`)}`));
  if (m.published) lines.push(`published: ${m.published}`);
  lines.push(`created: ${today}`);
  if (m.description) lines.push(`description: ${yamlStr(m.description)}`);
  lines.push('tags:', '  - clippings', '---', '');
  let body = String(markdown || '').trim();
  // The article often starts with its own title as a heading: keep one.
  const first = /^#{1,2}\s+(.+)\n*/.exec(body);
  if (first && first[1].trim().toLowerCase() === String(m.title).trim().toLowerCase()) body = body.slice(first[0].length);
  const name = String(m.title || '').replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Clipping';
  return { name, content: `${lines.join('\n')}${body}\n` };
}

// The whole clip from a parsed page.
export function clipPage(doc, url, today) {
  const m = clipMeta(doc, url);
  return clipNote({ url, meta: m, markdown: htmlToMarkdown(articleHtml(doc, url)), today });
}
