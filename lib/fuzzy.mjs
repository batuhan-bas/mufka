// Pure fuzzy matching for the quick switcher and command palette, in the
// spirit of Obsidian's: the query's characters must appear in order; matches
// at the start, after a separator and in a row score higher; shorter targets
// win ties. Case- and accent-insensitive, with Turkish i/ı/İ/I folded together.

// One character → its folded form: lower case, accents dropped (ş → s, ü → u),
// and Turkish dotless/dotted i folded to i.
function foldChar(c) {
  if (c === 'İ' || c === 'I' || c === 'ı') return 'i';
  return c.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').charAt(0) || c;
}

const SEPARATOR = /[\s/_\-.()[\]]/;

// → { score, indices } or null. indices are positions in `text` that matched
// (for highlighting). An empty query matches everything with score 0.
export function fuzzyMatch(query, text) {
  const q = [...String(query).trim()].filter((c) => c !== ' ').map(foldChar);
  const t = [...String(text)];
  if (q.length === 0) return { score: 0, indices: [] };
  const tf = t.map(foldChar);
  // Greedy from each place the first character occurs; keep the best run, so
  // "note" in "Unread notes" matches the word "notes", not the n of "Unread".
  let best = null;
  for (let s0 = tf.indexOf(q[0]); s0 !== -1; s0 = tf.indexOf(q[0], s0 + 1)) {
    const run = greedy(q, t, tf, s0);
    if (!run) break; // a later start cannot complete either
    if (!best || run.score > best.score) best = run;
  }
  if (!best) return null;
  best.score -= t.length * 0.05;
  // Exact (folded) substring bonus: typing a word should rank that word first.
  const at = tf.join('').indexOf(q.join(''));
  if (at !== -1) best.score += 10 + (at === 0 ? 10 : 0);
  return best;
}

function greedy(q, t, tf, from) {
  const indices = [];
  let score = 0;
  let qi = 0;
  let prev = -2;
  for (let i = from; i < tf.length && qi < q.length; i += 1) {
    if (tf[i] !== q[qi]) continue;
    let s = 1;
    if (i === 0) s += 8;
    else if (SEPARATOR.test(t[i - 1])) s += 6;
    else if (t[i] !== t[i].toLowerCase() && t[i - 1] === t[i - 1].toLowerCase()) s += 4; // camelCase hump
    if (prev === i - 1) s += 5;
    score += s;
    indices.push(i);
    prev = i;
    qi += 1;
  }
  return qi < q.length ? null : { score, indices };
}

// items: [{ ...anything }], key(item) → string to match. Returns the matching
// items as [{ item, score, indices }], best first (stable for equal scores).
export function fuzzyFilter(query, items, key) {
  const out = [];
  items.forEach((item, i) => {
    const m = fuzzyMatch(query, key(item));
    if (m) out.push({ item, score: m.score, indices: m.indices, i });
  });
  out.sort((a, b) => b.score - a.score || a.i - b.i);
  return out.map(({ item, score, indices }) => ({ item, score, indices }));
}

// Most-recent-first list of note rels, without duplicates, capped.
export function pushRecent(list, rel, max = 30) {
  return [rel, ...list.filter((r) => r !== rel)].slice(0, max);
}
