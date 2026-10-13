// Pure backlink index: for every note, which notes link to it. No DOM, no fs,
// no Electron — imported by the renderer and by node:test.
//
// A backlink is any wiki link in note S whose target resolves to note T (from
// S's folder). The index maps T's rel -> [{ rel: S, line }] where `line` is the
// trimmed source line that contains the link (a one-line excerpt), one entry
// per link occurrence. Links in code are ignored (scanWikiLinks handles that).

import { scanWikiLinks, parseWikiInner } from './links.mjs';
import { resolveLink } from './notestree.mjs';

export function buildBacklinkIndex(notes) {
  const relList = notes.map((n) => ({ rel: n.rel }));
  const index = new Map();
  for (const n of notes) {
    scanWikiLinks(n.content, (inner, _li, lineText) => {
      const { target } = parseWikiInner(inner);
      if (!target) return;
      const targetRel = resolveLink(target, n.rel, relList);
      if (!targetRel || targetRel === n.rel) return; // skip missing + self-links
      if (!index.has(targetRel)) index.set(targetRel, []);
      index.get(targetRel).push({ rel: n.rel, line: lineText.trim() });
    });
  }
  return index;
}

// Entries linking to `rel` (empty array when none).
export function backlinksFor(index, rel) {
  return (index && index.get(rel)) || [];
}
