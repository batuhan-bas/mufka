// Heading folds for the live-preview editor. A folded heading hides the
// blocks after it up to the next heading of the same or a higher level.
// Folds are kept outside the note (like Obsidian), keyed by the heading's
// text and which occurrence of that text it is, so edits elsewhere keep them.
// Pure: works on the source and its blocks (lib/blocks.mjs). No DOM, no fs.

// "## Title" → { level: 2, text: 'Title' }; setext ("Title\n===") too.
export function headingOf(blockText) {
  const lines = String(blockText).split('\n');
  const atx = /^ {0,3}(#{1,6})(?:\s+(.*?))?(?:\s+#+)?\s*$/.exec(lines[0]);
  if (atx) return { level: atx[1].length, text: (atx[2] || '').trim() };
  const last = lines[lines.length - 1];
  if (lines.length > 1 && /^ {0,3}(=+|-+)\s*$/.test(last)) {
    return { level: last.trim()[0] === '=' ? 1 : 2, text: lines.slice(0, -1).join(' ').trim() };
  }
  return null;
}

// blocks: [{ type, start, end }]; textOf(block) → its source text.
// folded: Set of keys. Returns { heads: [{ key, level, text, index, end,
// folded, hidden }], hidden: Set of block starts }. A heading's section is
// blocks index+1 … end (inclusive); `hidden` counts those blocks.
export function foldPlan(blocks, textOf, folded = new Set()) {
  const seen = new Map();
  const heads = [];
  blocks.forEach((b, index) => {
    if (b.type !== 'heading') return;
    const h = headingOf(textOf(b));
    if (!h) return;
    const n = (seen.get(h.text) || 0) + 1;
    seen.set(h.text, n);
    heads.push({ key: n > 1 ? `${h.text}#${n}` : h.text, level: h.level, text: h.text, index, start: b.start });
  });
  for (const h of heads) {
    const next = heads.find((x) => x.index > h.index && x.level <= h.level);
    h.end = next ? next.index - 1 : blocks.length - 1;
    h.hidden = h.end - h.index;
    h.folded = folded.has(h.key) && h.hidden > 0;
  }
  const hidden = new Set();
  for (const h of heads) {
    if (!h.folded) continue;
    for (let i = h.index + 1; i <= h.end; i++) hidden.add(blocks[i].start);
  }
  return { heads, hidden };
}

// The heading a block belongs to: itself when it is one, else the nearest
// heading above whose section holds it.
export function headingFor(plan, blockIndex) {
  let best = null;
  for (const h of plan.heads) if (h.index <= blockIndex && h.end >= blockIndex) best = h;
  return best;
}

// Keys to unfold so the block at blockIndex is shown.
export function foldsHiding(plan, blockIndex) {
  return plan.heads.filter((h) => h.folded && h.index < blockIndex && h.end >= blockIndex).map((h) => h.key);
}
