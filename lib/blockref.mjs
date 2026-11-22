// Block references, as in Obsidian: a paragraph or list item that ends in
// " ^id" can be linked ([[Note#^id]]) and embedded (![[Note#^id]]). A "^id"
// on a line of its own names the block just above it (a table, a list, code).
// Pure: text in, text out. No DOM, no fs.

import { parseMarkdown } from './mdparse.mjs';

const ID = '[A-Za-z0-9-]+';
const TRAILING_ID = new RegExp(`(?:^|\\s)\\^(${ID})\\s*$`);
const ONLY_ID = new RegExp(`^\\s*\\^(${ID})\\s*$`);

function plainText(node) {
  if (node.value != null) return node.value;
  return (node.children || []).map(plainText).join('');
}
const line0 = (n) => n.position.start.line - 1;
const line1 = (n) => n.position.end.line - 1;

// The id a line ends with, or null.
export function idOfLine(line) {
  const m = TRAILING_ID.exec(String(line));
  return m ? m[1] : null;
}

// A line without its trailing " ^id".
export function withoutId(line) {
  return String(line).replace(new RegExp(`(^|\\s)\\^${ID}\\s*$`), '').replace(/\s+$/, '');
}

// Text without any block ids (each line's trailing one; lines that are only an id go).
export function stripBlockIds(text) {
  return String(text).split('\n').filter((l) => !ONLY_ID.test(l)).map((l) => (idOfLine(l) ? withoutId(l) : l)).join('\n');
}

// What a note's blocks are, for the [[Note#^ suggestions: paragraphs, quotes
// and list items (nested ones too), in order. Each: { kind, text (one line,
// no id), heading (nearest above, or ''), id (or null), idLine (the line an
// id goes at the end of), start, end }.
export function blockChoices(content) {
  const src = String(content == null ? '' : content);
  const lines = src.split('\n');
  const out = [];
  let heading = '';
  const add = (kind, node, idLine, textNode) => {
    const text = withoutId(plainText(textNode).split('\n').map((s) => s.trim()).join(' ')).trim();
    if (!text || ONLY_ID.test(text)) return;
    out.push({ kind, text, heading, id: idOfLine(lines[idLine]), idLine, start: line0(node), end: line1(node) });
  };
  const items = (list) => {
    for (const item of list.children) {
      const para = item.children.find((c) => c.type === 'paragraph');
      if (para) add('item', item, line1(para), para);
      for (const c of item.children) if (c.type === 'list') items(c);
    }
  };
  for (const node of parseMarkdown(src).children) {
    if (node.type === 'heading') heading = plainText(node).trim();
    else if (node.type === 'paragraph') add('paragraph', node, line1(node), node);
    else if (node.type === 'blockquote') add('quote', node, line1(node), node);
    else if (node.type === 'list') items(node);
  }
  return out;
}

// Where block `id` is: { start, end, line, text } (lines, inclusive; text is
// the block's source without ids, list items dedented), or null.
export function findBlock(content, id) {
  const src = String(content == null ? '' : content);
  const lines = src.split('\n');
  const want = String(id).replace(/^\^/, '');
  const at = lines.findIndex((l) => idOfLine(l) === want);
  if (at === -1) return null;
  const top = parseMarkdown(src).children;
  const range = (start, end) => {
    const part = lines.slice(start, end + 1);
    const indent = Math.min(...part.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)[0].length));
    return { start, end, line: at, text: stripBlockIds(part.map((l) => l.slice(indent)).join('\n')).replace(/\n+$/, '') };
  };
  if (ONLY_ID.test(lines[at])) {
    const prev = top.filter((n) => line1(n) < at).pop();
    return prev ? range(line0(prev), line1(prev)) : null;
  }
  const hit = blockChoices(src).find((c) => c.idLine === at);
  if (hit) return range(hit.start, hit.end);
  const node = top.find((n) => line0(n) <= at && line1(n) >= at);
  return node ? range(line0(node), line1(node)) : null;
}

// A new id that is not used in the note yet. rand() → [0, 1).
export function newBlockId(content, rand = Math.random) {
  const used = new Set(String(content).split('\n').map(idOfLine).filter(Boolean));
  for (;;) {
    let id = '';
    for (let i = 0; i < 6; i++) id += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(rand() * 36)];
    if (!used.has(id)) return id;
  }
}

// Give a block (one of blockChoices) an id unless it has one:
// → { content, id }.
export function ensureBlockId(content, choice, rand = Math.random) {
  if (choice.id) return { content, id: choice.id };
  const id = newBlockId(content, rand);
  return { content: addBlockId(content, choice.idLine, id), id };
}

// Put " ^id" at the end of line `line`.
export function addBlockId(content, line, id) {
  const lines = String(content).split('\n');
  lines[line] = `${lines[line].replace(/\s+$/, '')} ^${id}`;
  return lines.join('\n');
}

// A "^id" line of its own after a block (a table, code) that ends at `end`.
export function addBlockIdLine(content, end, id) {
  const lines = String(content).split('\n');
  lines.splice(end + 1, 0, '', `^${id}`);
  return lines.join('\n');
}
