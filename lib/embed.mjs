// Pure helpers for note embeds (![[Note]], ![[Note#Heading]]): which part of
// the embedded note to show.

import { outline } from './noteinfo.mjs';
import { findBlock } from './blockref.mjs';
import { frontmatterEnd } from './properties.mjs';

// Is an embed target a note (no extension, or .md) rather than a file?
export function isNoteTarget(target) {
  return !/\.(?!md$)[A-Za-z0-9]{1,8}$/i.test(String(target).trim());
}

function fold(s) { return String(s).replace(/[İIı]/g, 'i').toLowerCase().trim(); }

// The text to embed: the whole note without its frontmatter, or one heading's
// section (the heading line up to the next heading of the same or a higher
// level), or one block ("^id", lib/blockref.mjs). null when it does not exist.
export function embedSection(content, heading) {
  const text = String(content == null ? '' : content);
  const lines = text.split('\n');
  if (!heading) {
    const end = frontmatterEnd(lines);
    if (end > 0) return lines.slice(end + 1).join('\n').replace(/^\n+/, '');
    return text;
  }
  if (String(heading).startsWith('^')) { const b = findBlock(text, heading.slice(1)); return b ? b.text : null; }
  const heads = outline(text);
  const i = heads.findIndex((h) => fold(h.text) === fold(heading));
  if (i === -1) return null;
  const h = heads[i];
  const next = heads.slice(i + 1).find((x) => x.depth <= h.depth);
  return lines.slice(h.line, next ? next.line : lines.length).join('\n').replace(/\n+$/, '');
}
