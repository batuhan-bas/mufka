// One task line ("- [ ] …", "> 1. [x] …") in a note's text: flip its box, or
// set it while making sure it is still the line the caller saw. Pure, and
// small on purpose: the MCP server uses it without lib/markdown.mjs.

// Optional quote markers and indentation, a list marker (- * + 1. 1)), then
// [ ] / [x] / any other one-character state. Group 1 is everything before the
// box, group 2 its state.
export const TASK_RE = /^((?:\s*>)*\s*(?:[-*+]|\d+[.)])\s+)\[([^\]\n])\](?=\s|$)/;

// Flip the checkbox state of a single task line in the raw source.
export function toggleTaskLine(src, lineIndex) {
  const lines = String(src).split('\n');
  const l = lines[lineIndex];
  if (l === undefined) return src;
  const m = TASK_RE.exec(l);
  if (!m) return src;
  const checked = m[2] !== ' '; // any other state unchecks, as in Obsidian
  lines[lineIndex] = `${m[1]}[${checked ? ' ' : 'x'}]${l.slice(m[0].length)}`;
  return lines.join('\n');
}

// Tick (done: true) or untick one task, but only if line `lineIndex` is still
// exactly `expect`: the note may have changed since it was shown, and then the
// wrong line would be changed. Throws when it is not that task any more.
export function setTaskLine(src, lineIndex, { expect, done }) {
  const lines = String(src).split('\n');
  const l = lines[lineIndex];
  if (l === undefined || l !== expect) throw new Error('The note has changed since it was shown; show it again');
  const m = TASK_RE.exec(l);
  if (!m) throw new Error('That line is not a task');
  lines[lineIndex] = `${m[1]}[${done ? 'x' : ' '}]${l.slice(m[0].length)}`;
  return lines.join('\n');
}
