// Pure plan-list logic. No DOM, no Electron. Imported by renderer and tests.

// Timed plans first (ascending), then untimed by creation order.
export function byTimeThenCreated(a, b) {
  if (a.time && b.time) return a.time.localeCompare(b.time);
  if (a.time) return -1;
  if (b.time) return 1;
  return a.created - b.created;
}

export function genId(now = Date.now(), rnd = Math.random) {
  return `p-${now}-${rnd().toString(36).slice(2, 8)}`;
}

// Fold a string for search: treat i, ı, İ, I as the same letter, then
// lower-case the rest. The four I-variants are mapped to plain "i" before
// lower-casing so a query matches regardless of dotted/dotless form.
export function foldTR(s) {
  return s.replace(/[İIıi]/g, 'i').toLowerCase();
}

// Case-insensitive substring match over plan titles, with i/ı/İ/I unified.
export function matchesQuery(plan, query) {
  const q = foldTR(query.trim());
  if (!q) return false;
  return foldTR(plan.title).includes(q);
}

// All plans whose title matches the query, most recently created first.
// Empty/whitespace query returns nothing. Does not mutate the input.
export function searchPlans(items, query) {
  if (!query.trim()) return [];
  return items
    .filter((p) => matchesQuery(p, query))
    .sort((a, b) => b.created - a.created);
}
