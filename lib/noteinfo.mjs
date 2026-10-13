// Pure per-note facts for the right sidebar: the outline (headings), outgoing
// links, and unlinked mentions (other notes naming this note's title in plain
// text, without a [[link]]) — plus turning one such mention into a link.

import { parseMarkdown } from './mdparse.mjs';
import { scanWikiLinks, parseWikiInner } from './links.mjs';
import { resolveLink } from './notestree.mjs';

function plainText(node) {
  if (node.value != null && node.type !== 'html') return node.value;
  return (node.children || []).map(plainText).join('');
}

// Heading text as the renderer shows it: [[T|alias]] → alias, [[F/T#h]] → T › h,
// ==mark== → mark (so it matches the rendered heading for scrolling).
function shownText(t) {
  return t
    .replace(/!?\[\[([^\]]+)\]\]/g, (_m, inner) => {
      const bar = inner.indexOf('|');
      if (bar !== -1) return inner.slice(bar + 1);
      const [target, heading] = inner.split('#');
      const base = target.slice(target.lastIndexOf('/') + 1);
      return heading ? `${base} › ${heading}` : base;
    })
    .replace(/==([^=\n]+)==/g, (_m, x) => x);
}

// [{ depth, text, line }] in document order (line is 0-based).
export function outline(content) {
  const out = [];
  const walk = (n) => {
    if (n.type === 'heading') out.push({ depth: n.depth, text: shownText(plainText(n)).trim(), line: n.position.start.line - 1 });
    else if (n.type === 'root' || n.type === 'blockquote' || n.type === 'list' || n.type === 'listItem') (n.children || []).forEach(walk);
  };
  walk(parseMarkdown(String(content == null ? '' : content)));
  return out.filter((h) => h.text);
}

// Wiki links of a note, unique by target: [{ target, rel | null }] where rel is
// the resolved note (null = not created yet). Attachments are left out.
export function outgoingLinks(content, fromRel, notes) {
  const seen = new Set();
  const out = [];
  scanWikiLinks(content, (inner) => {
    const { target } = parseWikiInner(inner);
    if (!target || /\.(?!md$)[A-Za-z0-9]{1,8}$/.test(target)) return;
    const rel = resolveLink(target, fromRel, notes);
    const key = rel || `?${target.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ target, rel });
  });
  return out;
}

function fold(s) { return String(s).replace(/[İIı]/g, 'i').toLowerCase(); }
const WORD = /[\p{L}\p{N}_]/u;

// Plain-text occurrences of `title` in `content`: whole words, case/i-ı
// folded, not inside [[links]], `code`, fenced code or the frontmatter.
// → [{ line, start, end }] (0-based line, character offsets in that line).
export function findMentions(content, title) {
  const t = fold(String(title).trim());
  if (t.length < 2) return [];
  const lines = String(content == null ? '' : content).split('\n');
  const out = [];
  let inFence = false;
  let i0 = 0;
  if (lines[0] === '---') { const end = lines.indexOf('---', 1); if (end > 0) i0 = end + 1; }
  for (let li = i0; li < lines.length; li += 1) {
    const line = lines[li];
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    // Blank out links, code spans and markdown link targets, keeping offsets.
    const masked = line
      .replace(/\[\[[^\]]*\]\]/g, (m) => ' '.repeat(m.length))
      .replace(/`[^`]*`/g, (m) => ' '.repeat(m.length))
      .replace(/\]\([^)]*\)/g, (m) => ' '.repeat(m.length));
    const f = fold(masked);
    for (let at = f.indexOf(t); at !== -1; at = f.indexOf(t, at + 1)) {
      const before = masked[at - 1]; const after = masked[at + t.length];
      if ((before && WORD.test(before)) || (after && WORD.test(after))) continue;
      out.push({ line: li, start: at, end: at + t.length });
    }
  }
  return out;
}

// Other notes that mention `rel`'s title without linking to it.
// notes: [{ rel, content }] → [{ rel, line, text, start, end }] (first mention
// per line), skipping notes that already link to `rel`.
export function unlinkedMentions(notes, rel) {
  const title = rel.slice(rel.lastIndexOf('/') + 1).replace(/\.md$/i, '');
  const relList = notes.map((n) => ({ rel: n.rel }));
  const out = [];
  for (const n of notes) {
    if (n.rel === rel) continue;
    let links = false;
    scanWikiLinks(n.content, (inner) => {
      const { target } = parseWikiInner(inner);
      if (target && resolveLink(target, n.rel, relList) === rel) links = true;
    });
    if (links) continue;
    const lines = String(n.content).split('\n');
    const seenLines = new Set();
    for (const m of findMentions(n.content, title)) {
      if (seenLines.has(m.line)) continue;
      seenLines.add(m.line);
      out.push({ rel: n.rel, line: m.line, text: lines[m.line].trim(), start: m.start, end: m.end });
    }
  }
  return out;
}

// Replace one mention (line/start/end from findMentions) with a wiki link.
// The written text keeps its case: "mufka" → [[Mufka|mufka]] when it differs.
export function linkMention(content, mention, title) {
  const lines = String(content).split('\n');
  const line = lines[mention.line];
  if (line == null) return content;
  const found = line.slice(mention.start, mention.end);
  if (fold(found) !== fold(title)) return content; // the file changed: do nothing
  const link = found === title ? `[[${title}]]` : `[[${title}|${found}]]`;
  lines[mention.line] = line.slice(0, mention.start) + link + line.slice(mention.end);
  return lines.join('\n');
}
