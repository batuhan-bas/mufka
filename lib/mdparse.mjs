// Pure Markdown parser: source -> mdast syntax tree (https://github.com/syntax-tree/mdast).
// CommonMark plus GitHub Flavored Markdown (tables, task lists, strikethrough,
// autolinks, footnotes) and YAML frontmatter — what Obsidian vaults use. The
// renderer (lib/markdown.mjs) and the block editor's segmentation
// (lib/blocks.mjs) both read this tree, so the preview and the editable ranges
// always agree. Every node carries position.start/end (1-based line, column,
// and 0-based offset into the source). No DOM, no fs.

import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { frontmatter } from 'micromark-extension-frontmatter';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';

const extensions = [gfm(), frontmatter(['yaml'])];
const mdastExtensions = [gfmFromMarkdown(), frontmatterFromMarkdown(['yaml'])];

export function parseMarkdown(src) {
  return fromMarkdown(String(src == null ? '' : src), { extensions, mdastExtensions });
}

// Frontmatter YAML as display rows [{ key, value }]. Deliberately small — not a
// YAML parser: top-level `key: value` lines, plus `- item` lines (and inline
// `[a, b]` lists) folded into the previous key. Returns null when the block
// does not look like simple key/value data, so the caller can show it raw.
export function frontmatterRows(yaml) {
  const rows = [];
  for (const line of String(yaml).split('\n')) {
    if (line.trim() === '' || /^\s*#/.test(line)) continue;
    // A plain key (letters, digits, _ . - and spaces), then ':' and a space or end.
    const kv = /^([\p{L}\d_][\p{L}\d_ .-]*):(?:\s+(.*))?$/u.exec(line);
    if (kv) {
      rows.push({ key: kv[1].trim(), value: unquote(stripInlineList((kv[2] || '').trim())) });
      continue;
    }
    const item = /^\s+-\s+(.*)$/.exec(line) || /^-\s+(.*)$/.exec(line);
    if (item && rows.length) {
      const last = rows[rows.length - 1];
      last.value = last.value ? `${last.value}, ${unquote(item[1].trim())}` : unquote(item[1].trim());
      continue;
    }
    return null;
  }
  return rows;
}

function stripInlineList(v) {
  const m = /^\[(.*)\]$/.exec(v);
  return m ? m[1].split(',').map((s) => unquote(s.trim())).filter(Boolean).join(', ') : v;
}

function unquote(v) {
  const m = /^(["'])(.*)\1$/.exec(v);
  return m ? m[2] : v;
}
