// Markdown table rows as text: what lib/budget.mjs and lib/habits.mjs read
// and write. Pure.

// The cells of a table row, without the outer pipes; "\|" stays inside a cell.
export function tableCells(line) {
  let l = String(line).trim();
  if (l.startsWith('|')) l = l.slice(1);
  if (l.endsWith('|') && !l.endsWith('\\|')) l = l.slice(0, -1);
  return l.split(/(?<!\\)\|/).map((c) => c.trim());
}
export const isTableRow = (line) => /^\s*\|.*\|\s*$/.test(line);
export const isTableRule = (line) => isTableRow(line) && tableCells(line).every((c) => /^:?-{1,}:?$/.test(c));
export const tableRow = (cells) => `| ${cells.join(' | ')} |`;
export const escapeCell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();

// The tables of a note outside code blocks, each under the heading above it:
// [{ heading, start, end }] — start: the header line, end: the last row (0-based).
export function findTables(src) {
  const lines = String(src == null ? '' : src).split('\n');
  const out = [];
  let heading = ''; let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (f) { if (!fence) fence = f[1][0]; else if (f[1][0] === fence) fence = null; continue; }
    if (fence) continue;
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) { heading = h[1]; continue; }
    if (!isTableRow(line) || !isTableRule(lines[i + 1] || '')) continue;
    let end = i + 1;
    while (end + 1 < lines.length && isTableRow(lines[end + 1])) end += 1;
    out.push({ heading, start: i, end });
    i = end;
  }
  return out;
}
