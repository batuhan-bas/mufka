// Pure block segmentation for the live-preview editor. Splits a Markdown source
// into top-level blocks, each with its EXACT source line range [start, end]
// (inclusive, 0-based). The ranges come from the same syntax tree the renderer
// draws (lib/mdparse.mjs), so the preview and the editable ranges always agree:
// a whole table, a nested list or the frontmatter is one block. No DOM, no fs.
//
// Blank lines between blocks belong to no block (they stay in the source and
// round-trip verbatim).

import { parseMarkdown } from './mdparse.mjs';

const IMAGE_ONLY = /^(?:!\[[^\]]*\]\([^)]+\)|!\[\[[^\]]+\]\])$/;

const TYPES = {
  heading: 'heading',
  paragraph: 'paragraph',
  list: 'list',
  blockquote: 'quote',
  code: 'code',
  thematicBreak: 'rule',
  table: 'table',
  yaml: 'frontmatter',
  html: 'html',
  footnoteDefinition: 'footnote',
  definition: 'definition',
};

// Return [{ type, start, end }] for every top-level block. Types: heading,
// paragraph, image (a paragraph that is only one image), list, quote, code,
// rule, table, frontmatter, html, footnote, definition.
export function parseBlocks(src) {
  const text = String(src == null ? '' : src);
  const lines = text.split('\n');
  return parseMarkdown(text).children.map((node) => {
    const start = node.position.start.line - 1;
    const end = node.position.end.line - 1;
    let type = TYPES[node.type] || 'paragraph';
    if (type === 'paragraph' && start === end && IMAGE_ONLY.test(lines[start].trim())) type = 'image';
    return { type, start, end };
  });
}

// The exact source text of a block.
export function blockText(src, block) {
  return String(src == null ? '' : src).split('\n').slice(block.start, block.end + 1).join('\n');
}

// Replace a block's source lines with `text`, returning the new full source.
// With text === blockText(src, block) this is a no-op (byte-identical).
export function replaceBlockText(src, block, text) {
  const lines = String(src == null ? '' : src).split('\n');
  const next = lines.slice(0, block.start).concat(String(text).split('\n'), lines.slice(block.end + 1));
  return next.join('\n');
}

// Insert a new block with `text` after `block` (a blank separator line keeps it
// a separate block). Returns { src, start } where start is the new block's first
// line. If `block` is null, append at end of source.
export function insertBlockAfter(src, block, text) {
  const lines = String(src == null ? '' : src).split('\n');
  const at = block ? block.end + 1 : lines.length;
  const piece = ['', ...String(text).split('\n')];
  const next = lines.slice(0, at).concat(piece, lines.slice(at));
  return { src: next.join('\n'), start: at + 1 };
}

// Add `text` as its own block: after the block starting at line `afterStart`,
// at the very top (-1), or at the end (null / no such block). Blank lines keep
// it apart from its neighbours, so it never merges into a paragraph.
// → { src, start } (start = the new block's first line)
export function addBlock(src, afterStart, text) {
  const s = String(src == null ? '' : src);
  const piece = String(text).replace(/^\n+|\n+$/g, '');
  if (s.trim() === '') return { src: piece, start: 0 };
  const lines = s.split('\n');
  const blocks = parseBlocks(s);
  let at;
  if (afterStart === -1) at = 0;
  else {
    const b = afterStart == null ? null : blocks.find((x) => x.start === afterStart);
    at = b ? b.end + 1 : lines.length;
  }
  if (at >= lines.length) {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    const start = lines.length + 1;
    return { src: [...lines, '', ...piece.split('\n')].join('\n'), start };
  }
  const before = at > 0 && lines[at - 1].trim() !== '' ? [''] : [];
  const after = lines[at] !== undefined && lines[at].trim() !== '' ? [''] : [];
  const start = at + before.length;
  return { src: [...lines.slice(0, at), ...before, ...piece.split('\n'), ...after, ...lines.slice(at)].join('\n'), start };
}
