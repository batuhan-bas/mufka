// Offscreen render for PDF export. Uses the SAME Markdown renderer as the app.
// main.js loads export.html in a hidden window, calls window.__renderNote, then
// printToPDF. Wiki/external links are rendered as anchors but the print CSS
// shows them as plain black text.

import { renderMarkdown } from '../lib/markdown.mjs';
import { resolveAttachment } from '../lib/attach.mjs';

// `html`, when given, is the note as the app drew it (Dataview results,
// diagrams and drawings as images); the export page's CSP keeps it inert.
window.__renderNote = (title, src, files = [], noteDir = '', html = null) => {
  const vaultFiles = new Set(files);
  const root = document.getElementById('doc');
  root.replaceChildren();
  const h = document.createElement('h1');
  h.textContent = title;
  root.append(h);
  const md = document.createElement('div');
  md.className = 'md';
  const attach = (raw) => resolveAttachment(raw, vaultFiles, noteDir);
  if (typeof html === 'string') {
    md.innerHTML = html;
    md.querySelectorAll('input').forEach((i) => { i.disabled = true; });
  } else for (const n of renderMarkdown(src, { doc: document, attach })) md.append(n);
  // Paper cannot unfold: folded callouts print open.
  md.querySelectorAll('details').forEach((d) => { d.open = true; });
  root.append(md);
  return true;
};
