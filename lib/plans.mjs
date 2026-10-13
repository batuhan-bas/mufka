// Pure plan-list logic. No DOM, no Electron. Imported by renderer and tests.

// Timed plans first (ascending), then untimed by creation order.
export function byTimeThenCreated(a, b) {
  if (a.time && b.time) return a.time.localeCompare(b.time);
  if (a.time) return -1;
  if (b.time) return 1;
  return a.created - b.created;
}

// Plans of one scope+key, sorted for display. Does not mutate the input.
export function plansFor(items, scope, key) {
  return items
    .filter((p) => p.scope === scope && p.key === key)
    .sort(byTimeThenCreated);
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

function pad(h, m) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Split a typed entry into an optional leading time (or time range) and title.
// Accepts "HH:MM" / "H.MM", optionally a range "HH:MM-HH:MM" (spaces allowed
// around the dash). The time must be followed by a space and a non-empty title,
// otherwise the whole text is the title.
// Returns { time: 'HH:MM' | '', endTime: 'HH:MM' | '', title }.
export function parseEntry(raw) {
  const text = (raw || '').trim();
  const m = /^(\d{1,2})[:.](\d{2})(?:\s*-\s*(\d{1,2})[:.](\d{2}))?\s+(.+)$/.exec(text);
  if (m) {
    const h = Number(m[1]); const min = Number(m[2]);
    const title = m[5].trim();
    const valid = h <= 23 && min <= 59 && title;
    if (valid) {
      let endTime = '';
      if (m[3] !== undefined) {
        const eh = Number(m[3]); const em = Number(m[4]);
        if (eh <= 23 && em <= 59) endTime = pad(eh, em);
      }
      return { time: pad(h, min), endTime, title };
    }
  }
  return { time: '', endTime: '', title: text };
}

// The single-text form of a plan, for the in-place editor:
// "18:30-19:30 Spor", "18:30 Spor", or just "Spor".
export function formatPlanText(plan) {
  if (!plan.time) return plan.title;
  const range = plan.endTime ? `${plan.time}-${plan.endTime}` : plan.time;
  return `${range} ${plan.title}`;
}

// Union two plan lists by id: keep all existing, append imported plans whose
// id is not already present. Used by import so a restore never clobbers plans
// that exist today. Returns the merged list and how many were added.
export function mergeById(existing, incoming) {
  const ids = new Set(existing.map((p) => p.id));
  const added = incoming.filter((p) => !ids.has(p.id));
  return { items: [...existing, ...added], added: added.length };
}

// All plans whose title matches the query, most recently created first.
// Empty/whitespace query returns nothing. Does not mutate the input.
export function searchPlans(items, query) {
  if (!query.trim()) return [];
  return items
    .filter((p) => matchesQuery(p, query))
    .sort((a, b) => b.created - a.created);
}
