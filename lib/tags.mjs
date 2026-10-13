// Pure tag scanning: the #tags of a note, as Obsidian counts them — inline
// #tags in text (not in code, not in headings' "# " marker) and the
// frontmatter `tags:` / `tag:` property (inline list, block list or a
// comma/space separated string). Tags are returned without '#', in the case
// first seen; nested tags keep their '/' (e.g. "proje/mufka").

// Same tag shape as lib/markdown.mjs: letters, digits, _ / -, at least one letter.
const TAG_RE = /(^|[\s(])#([\p{L}\d_/-]*\p{L}[\p{L}\d_/-]*)/gu;

export function scanTags(content) {
  const text = String(content == null ? '' : content);
  const out = [];
  const seen = new Set();
  const add = (t) => {
    const tag = String(t).trim().replace(/^#/, '');
    if (!tag || !/\p{L}/u.test(tag) || !/^[\p{L}\d_/-]+$/u.test(tag)) return;
    const key = tag.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(tag);
  };

  let lines = text.split('\n');
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      frontmatterTags(lines.slice(1, end)).forEach(add);
      lines = lines.slice(end + 1);
    }
  }
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const noCode = line.replace(/`[^`]*`/g, ' ');
    for (const m of noCode.matchAll(TAG_RE)) add(m[2]);
  }
  return out;
}

function frontmatterTags(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^(tags?)\s*:\s*(.*)$/i.exec(lines[i]);
    if (!m) continue;
    const v = m[2].trim();
    if (v) {
      v.replace(/^\[|\]$/g, '').split(/[,\s]+/).map((s) => s.replace(/^["']|["']$/g, '')).forEach((s) => s && out.push(s));
    } else {
      for (let j = i + 1; j < lines.length && /^\s*-\s+/.test(lines[j]); j += 1) {
        out.push(lines[j].replace(/^\s*-\s+/, '').trim().replace(/^["']|["']$/g, ''));
      }
    }
  }
  return out;
}

// notes: [{ rel, content }] → [{ tag, count, notes: [rel...] }], most used
// first, then by name. Tags differing only in case count together.
export function buildTagIndex(notes) {
  const map = new Map();
  for (const n of notes) {
    for (const tag of scanTags(n.content)) {
      const key = tag.toLowerCase();
      if (!map.has(key)) map.set(key, { tag, count: 0, notes: [] });
      const e = map.get(key);
      e.count += 1;
      e.notes.push(n.rel);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'en'));
}
