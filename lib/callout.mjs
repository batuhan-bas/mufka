// Pure Obsidian callout detection on mdast. A callout is a blockquote whose
// first line is `[!type]`, optionally followed by `+`/`-` (foldable, open or
// closed) and a title:
//
//   > [!warning]- Be **careful**
//   > body
//
// Unknown types are still callouts (Obsidian treats them as "note").

// Obsidian's aliases, mapped to the type whose look they share.
const KINDS = {
  note: 'note',
  abstract: 'abstract', summary: 'abstract', tldr: 'abstract',
  info: 'info',
  todo: 'todo',
  tip: 'tip', hint: 'tip', important: 'tip',
  success: 'success', check: 'success', done: 'success',
  question: 'question', help: 'question', faq: 'question',
  warning: 'warning', caution: 'warning', attention: 'warning',
  failure: 'failure', fail: 'failure', missing: 'failure',
  danger: 'danger', error: 'danger',
  bug: 'bug',
  example: 'example',
  quote: 'quote', cite: 'quote',
};

const HEAD_RE = /^\[!([A-Za-z][\w-]*)\]([+-]?)(?:[ \t]+|(?=\n)|$)/;

// The callout kind for a type name: a known alias's canonical type, else 'note'.
export function calloutKind(type) {
  const t = String(type).toLowerCase();
  return Object.hasOwn(KINDS, t) ? KINDS[t] : 'note';
}

// Default title: the type as written, capitalised ("[!faq]" → "Faq").
export function defaultCalloutTitle(type) {
  const t = String(type);
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

// blockquote mdast node → { type, kind, fold, title, body } or null.
//   type:  the name as written, lower-cased ('faq')
//   kind:  calloutKind(type) ('question')
//   fold:  '' (not foldable), '+' (open) or '-' (closed)
//   title: inline mdast nodes of the title ([] = use defaultCalloutTitle)
//   body:  block mdast nodes under the title
export function parseCallout(node) {
  if (!node || node.type !== 'blockquote') return null;
  const first = node.children[0];
  if (!first || first.type !== 'paragraph') return null;
  const lead = first.children[0];
  if (!lead || lead.type !== 'text') return null;
  const m = HEAD_RE.exec(lead.value);
  if (!m) return null;

  // Split the first paragraph at its first line end: before it is the title.
  const rest = [{ ...lead, value: lead.value.slice(m[0].length) }, ...first.children.slice(1)];
  const title = [];
  let body = [];
  for (let i = 0; i < rest.length; i += 1) {
    const c = rest[i];
    if (c.type === 'break') { body = rest.slice(i + 1); break; }
    if (c.type === 'text' && c.value.includes('\n')) {
      const at = c.value.indexOf('\n');
      if (at > 0) title.push({ ...c, value: c.value.slice(0, at) });
      const after = c.value.slice(at + 1);
      body = [...(after ? [{ ...c, value: after }] : []), ...rest.slice(i + 1)];
      break;
    }
    if (!(c.type === 'text' && c.value === '')) title.push(c);
  }
  const blocks = body.length ? [{ ...first, children: body }] : [];
  return {
    type: m[1].toLowerCase(),
    kind: calloutKind(m[1]),
    fold: m[2],
    title: trimTitle(title),
    body: [...blocks, ...node.children.slice(1)],
  };
}

// Drop trailing whitespace of the title's last text node.
function trimTitle(nodes) {
  const out = [...nodes];
  const last = out[out.length - 1];
  if (last && last.type === 'text') {
    const v = last.value.replace(/[ \t]+$/, '');
    if (v) out[out.length - 1] = { ...last, value: v }; else out.pop();
  }
  return out;
}
