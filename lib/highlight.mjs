// Code block colours: the language named after the opening fence (```js) is
// tokenised by lowlight (highlight.js grammars, as a syntax tree, so the
// renderer still builds the DOM itself and never uses innerHTML). Blocks with
// no language, or one it does not know, stay plain, as in Obsidian.
import { createLowlight, common } from 'lowlight';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import powershell from 'highlight.js/lib/languages/powershell';
import dart from 'highlight.js/lib/languages/dart';
import http from 'highlight.js/lib/languages/http';

const low = createLowlight({ ...common, dockerfile, powershell, dart, http });
// Names people write that the grammars do not list.
low.registerAlias({ javascript: ['jsx', 'mjs', 'cjs'], typescript: ['tsx', 'mts'], bash: ['zsh', 'console'], xml: ['svg', 'vue'], plaintext: ['text', 'txt'] });

const MAX = 200_000; // a huge block is shown plain rather than slow down typing

// The highlighted tree for `code` in `lang`: hast children, or null.
export function highlightCode(code, lang) {
  const name = String(lang || '').trim().toLowerCase();
  if (!name || code.length > MAX || !low.registered(name)) return null;
  try { return low.highlight(name, code).children; } catch { return null; }
}

// hast nodes → DOM nodes made with `doc` (spans with hljs-* classes).
export function hastToDom(nodes, doc) {
  const out = [];
  for (const n of nodes) {
    if (n.type === 'text') out.push(doc.createTextNode(n.value));
    else if (n.type === 'element') {
      const el = doc.createElement('span');
      const cls = (n.properties && n.properties.className) || [];
      if (cls.length) el.setAttribute('class', cls.join(' '));
      for (const c of hastToDom(n.children || [], doc)) el.appendChild(c);
      out.push(el);
    }
  }
  return out;
}
