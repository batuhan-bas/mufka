// Pure editor autocomplete triggers, as in Obsidian: typing "[[" suggests
// notes, "#" followed by a letter suggests tags. Works on the text of a
// textarea and its caret; the caller shows the list and applies a choice.

// What is being completed at `caret`, or null.
//   { kind: 'link', query, start }  start = index of the "[[" (inclusive)
//   { kind: 'tag', query, start }   start = index of the "#"
// A link query stops at "|" or "#" (alias / heading are typed by hand) and
// never spans lines or a closing "]]".
export function detectTrigger(value, caret) {
  const before = String(value).slice(0, caret);
  const line = before.slice(before.lastIndexOf('\n') + 1);
  const lineStart = before.length - line.length;
  const open = line.lastIndexOf('[[');
  if (open !== -1) {
    const q = line.slice(open + 2);
    if (!/[\]|#]/.test(q) && !q.includes('[[')) return { kind: 'link', query: q, start: lineStart + open };
  }
  const tag = /(^|[\s(])#([\p{L}\d_/-]*)$/u.exec(line);
  if (tag && /^\p{L}/u.test(tag[2]) && !/^\s*#+\s/.test(line)) {
    return { kind: 'tag', query: tag[2], start: before.length - tag[2].length - 1 };
  }
  return null;
}

// Replace the trigger text with `insert` (e.g. "[[Title]]" or "#tag "). For a
// link, a "]]" right after the caret (typed or auto-closed) is consumed.
// → { value, caret }
export function applySuggestion(value, caret, trigger, insert) {
  const v = String(value);
  let end = caret;
  if (trigger.kind === 'link' && v.slice(caret, caret + 2) === ']]') end = caret + 2;
  const next = v.slice(0, trigger.start) + insert + v.slice(end);
  return { value: next, caret: trigger.start + insert.length };
}

// The link text for a note: its title, or Folder/Title when another note in
// the vault has the same title (so the link stays unambiguous).
export function linkTextFor(rel, allRels) {
  const noExt = rel.replace(/\.md$/i, '');
  const title = noExt.slice(noExt.lastIndexOf('/') + 1);
  const fold = (s) => s.toLowerCase();
  const same = allRels.filter((r) => fold(r.replace(/\.md$/i, '').split('/').pop()) === fold(title));
  return same.length > 1 ? noExt : title;
}
