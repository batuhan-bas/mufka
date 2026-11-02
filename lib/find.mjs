// Find and replace inside one note. Pure: works on a string, so the find bar
// (src/find-bar.js) uses it on the note's source and on the text the preview
// shows, and the tests run it directly.
//
// Matching ignores case unless asked, and treats the Turkish dotted and
// dotless i (I, İ, ı, i) as one letter, so "istanbul" finds "İstanbul" and
// "ISTANBUL". Folding keeps every character one character long, so a match's
// offsets are offsets in the original text.

const SAME_I = /[Iİı]/g;

export function foldCase(s) {
  const base = s.replace(SAME_I, 'i');
  // Nearly always lower-casing keeps the length (fast path, native); the few
  // letters that grow (e.g. "ẞ" → "ss") are kept as they are.
  const lo = base.toLowerCase();
  if (lo.length === base.length) return lo;
  let out = '';
  for (const ch of base) {
    const l = ch.toLowerCase();
    out += l.length === ch.length ? l : ch;
  }
  return out;
}

// Every non-overlapping match of `query` in `text`: [{ start, end }].
export function findMatches(text, query, { caseSensitive = false } = {}) {
  if (!query || typeof text !== 'string') return [];
  const hay = caseSensitive ? text : foldCase(text);
  const needle = caseSensitive ? query : foldCase(query);
  const out = [];
  let i = hay.indexOf(needle);
  while (i !== -1) {
    out.push({ start: i, end: i + needle.length });
    i = hay.indexOf(needle, i + needle.length);
  }
  return out;
}

// `text` with `matches` (sorted, non-overlapping) replaced by `replacement`.
export function replaceMatches(text, matches, replacement) {
  let out = '';
  let at = 0;
  for (const m of matches) {
    out += text.slice(at, m.start) + replacement;
    at = m.end;
  }
  return out + text.slice(at);
}

// The match to show first: the first one at or after `offset` (wrapping).
export function matchAtOrAfter(matches, offset) {
  if (!matches.length) return -1;
  const i = matches.findIndex((m) => m.start >= offset);
  return i === -1 ? 0 : i;
}
