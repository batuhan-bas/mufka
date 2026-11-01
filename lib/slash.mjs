// The "/" menu in the editor, as in Obsidian and Notion: typing "/" at the
// start of a line (or after a space) lists things to insert; typing more
// filters them ("/h2", "/task", "/tablo"…). Pure: what each item inserts and
// where the caret goes. Items with an `action` are run by the app instead
// (attach a file, insert a template, add a property).

import { fuzzyMatch } from './fuzzy.mjs';

// at: true when the "/" starts its line (block items go there directly;
// mid-line they start a new line).
const ITEMS = [
  { id: 'h1', label: 'Heading 1', keys: 'h1 title başlık', block: '# ' },
  { id: 'h2', label: 'Heading 2', keys: 'h2 başlık', block: '## ' },
  { id: 'h3', label: 'Heading 3', keys: 'h3 başlık', block: '### ' },
  { id: 'bullet', label: 'Bulleted list', keys: 'ul list liste madde', block: '- ' },
  { id: 'numbered', label: 'Numbered list', keys: 'ol list liste sıra', block: '1. ' },
  { id: 'task', label: 'Task', keys: 'todo checkbox görev yapılacak', block: '- [ ] ' },
  { id: 'quote', label: 'Quote', keys: 'blockquote alıntı', block: '> ' },
  { id: 'callout', label: 'Callout', keys: 'note info admonition not uyarı', block: '> [!note] ', after: '\n> ' },
  { id: 'code', label: 'Code block', keys: 'pre fence kod', block: '```', after: '\n\n```', caretAfter: 1 },
  { id: 'table', label: 'Table', keys: 'grid tablo', block: '| ', after: ' |  |\n| --- | --- |\n|  |  |' },
  { id: 'divider', label: 'Divider', keys: 'hr rule line çizgi ayırıcı', block: '---\n' },
  { id: 'link', label: 'Link to a note', keys: 'wiki [[ bağlantı', text: '[[' },
  { id: 'embed', label: 'Embed a note or image', keys: 'transclude ![[ göm', text: '![[' },
  { id: 'mermaid', label: 'Diagram (Mermaid)', keys: 'flowchart chart diyagram şema', block: '```mermaid\nflowchart TD\n  A[Start] --> B[', after: 'Next]\n```' },
  { id: 'dataview', label: 'Query (Dataview)', keys: 'dql list table sorgu', block: '```dataview\nLIST\nFROM "', after: '"\n```' },
  { id: 'date', label: "Today's date", keys: 'today now tarih bugün', dynamic: 'date' },
  { id: 'time', label: 'Time now', keys: 'clock hour saat şimdi', dynamic: 'time' },
  { id: 'daily', label: "Link to today's note", keys: 'daily journal günlük', dynamic: 'daily' },
  { id: 'attach', label: 'Attach a file…', keys: 'image picture file upload resim dosya ek', action: 'attach' },
  { id: 'template', label: 'Insert a template…', keys: 'snippet şablon', action: 'template' },
  { id: 'property', label: 'Add a property', keys: 'frontmatter yaml metadata özellik', action: 'property' },
];

// The "/" being typed at `caret`: { kind: 'slash', query, start, atLineStart } or null.
export function detectSlash(value, caret) {
  const before = String(value).slice(0, caret);
  const line = before.slice(before.lastIndexOf('\n') + 1);
  const m = /(^|\s)\/([^\s/][^/\n]{0,24}|)$/u.exec(line);
  if (!m || /\s\s$/.test(m[2])) return null;
  // Not inside a fenced code block.
  let fence = false;
  for (const l of before.split('\n').slice(0, -1)) if (/^\s*(```|~~~)/.test(l)) fence = !fence;
  if (fence) return null;
  const start = before.length - m[2].length - 1;
  const atLineStart = line.slice(0, line.length - m[2].length - 1).trim() === '';
  return { kind: 'slash', query: m[2], start, atLineStart };
}

function pad(n) { return String(n).padStart(2, '0'); }

// The rows for `query`: [{ id, label, detail, insert, caret, action }],
// insert replacing the "/query" text; caret = where it goes inside insert.
export function slashItems(query, { atLineStart = true, now = new Date(), dailyLink = null } = {}) {
  const q = String(query || '').trim();
  const rows = [];
  for (const it of ITEMS) {
    if (it.id === 'daily' && !dailyLink) continue;
    let score = 0;
    if (q) {
      const m = fuzzyMatch(q, it.label) || fuzzyMatch(q, it.keys);
      if (!m) continue;
      score = m.score + (fuzzyMatch(q, it.label) ? 1 : 0);
    }
    let insert = '';
    let caret = 0;
    if (it.block != null) {
      const lead = atLineStart ? '' : '\n';
      insert = lead + it.block + (it.after || '');
      caret = lead.length + it.block.length + (it.caretAfter || 0);
    } else if (it.text) {
      insert = it.text; caret = insert.length;
    } else if (it.dynamic === 'date') {
      insert = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`; caret = insert.length;
    } else if (it.dynamic === 'time') {
      insert = `${pad(now.getHours())}:${pad(now.getMinutes())}`; caret = insert.length;
    } else if (it.dynamic === 'daily') {
      insert = `[[${dailyLink}]]`; caret = insert.length;
    }
    rows.push({ id: it.id, label: it.label, detail: it.action ? '' : preview(it, insert), insert, caret, action: it.action || null, score });
  }
  if (q) rows.sort((a, b) => b.score - a.score);
  return rows;
}

function preview(it, insert) {
  if (it.dynamic) return insert;
  const first = insert.replace(/^\n/, '').split('\n')[0];
  return first.length > 18 ? `${first.slice(0, 18)}…` : first;
}
