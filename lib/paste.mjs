// Pasting from a web page, Google Docs, Word or Mail: the clipboard's HTML
// becomes Markdown (headings, bold and italic, links, lists and task lists,
// tables, quotes, code with its language, images by address), as in
// Obsidian. turndown does the conversion; the rules below make its output
// look like what people type in Mufka ("- " lists, "**bold**", fenced code).
import TurndownService from 'turndown';
import gfmPlugin from '@joplin/turndown-plugin-gfm';

const { gfm } = gfmPlugin;

// Tags that make HTML worth converting; text with none of them is pasted as
// the plain text the clipboard also holds.
const RICH = /<(a\s|b[\s>]|strong|i[\s>]|em[\s>]|h[1-6]|ul|ol|li|table|img|pre|code|blockquote|hr|del|s[\s>]|strike|span[^>]*font-(?:weight|style))/i;

export function isRichHtml(html) {
  return typeof html === 'string' && RICH.test(html);
}

const bold = (el) => /font-weight:\s*(bold|[6-9]00)/i.test(el.getAttribute('style') || '');
const italic = (el) => /font-style:\s*italic/i.test(el.getAttribute('style') || '');

function service() {
  const td = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  });
  td.use(gfm);
  const DROP = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'NOSCRIPT', 'TEMPLATE', 'BUTTON', 'SELECT', 'TEXTAREA', 'IFRAME', 'OBJECT', 'SVG']);
  td.remove((n) => DROP.has(n.nodeName.toUpperCase()) || (n.nodeName === 'INPUT' && (n.getAttribute('type') || '').toLowerCase() !== 'checkbox'));

  // "- item", nested lists indented by the width of their parent's marker.
  td.addRule('listItem', {
    filter: 'li',
    replacement(content, node, options) {
      const parent = node.parentNode;
      let prefix = `${options.bulletListMarker} `;
      if (parent && parent.nodeName === 'OL') {
        const start = Number(parent.getAttribute('start')) || 1;
        prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `;
      }
      const body = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/\n/gm, `\n${' '.repeat(prefix.length)}`);
      return prefix + body.replace(/^(\[[ x]\])\s+/, '$1 ') + (node.nextSibling && !/\n$/.test(body) ? '\n' : '');
    },
  });

  // Google Docs marks bold and italic with styled spans, and wraps the
  // whole paste in a <b style="font-weight:normal">.
  td.addRule('styledSpan', {
    filter: (n) => (n.nodeName === 'SPAN' || n.nodeName === 'B') && (bold(n) || italic(n) || /font-weight:\s*(normal|400)/i.test(n.getAttribute('style') || '')),
    replacement(content, node) {
      if (!content.trim()) return content;
      const b = bold(node) && node.nodeName === 'SPAN';
      const i = italic(node);
      if (!b && !i) return content;
      const lead = content.match(/^\s*/)[0];
      const trail = content.match(/\s*$/)[0];
      const mark = (b ? '**' : '') + (i ? '*' : '');
      return `${lead}${mark}${content.trim()}${[...mark].reverse().join('')}${trail}`;
    },
  });

  // Links without an address, or to javascript:, keep only their text.
  td.addRule('plainLink', {
    filter: (n) => n.nodeName === 'A' && !/^(https?:|mailto:|obsidian:)/i.test(n.getAttribute('href') || ''),
    replacement: (content) => content,
  });

  // Images from the web keep their address; pasted data: images are dropped
  // (Mufka saves pasted image files as attachments instead).
  td.addRule('image', {
    filter: 'img',
    replacement(_content, node) {
      const src = node.getAttribute('src') || '';
      if (!/^https?:/i.test(src)) return '';
      const alt = (node.getAttribute('alt') || '').replace(/[[\]\n]/g, ' ').trim();
      return `![${alt}](${src.replace(/[()\s]/g, encodeURIComponent)})`;
    },
  });
  return td;
}

let td = null;

// Markdown for `html`; '' when it holds nothing.
export function htmlToMarkdown(html) {
  if (!td) td = service();
  const body = String(html || '').replace(/<!--[\s\S]*?-->/g, '');
  return td.turndown(body)
    .replace(/ /g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Is `offset` inside a fenced code block of `text`? (Paste stays plain there.)
export function insideCodeFence(text, offset) {
  let open = false;
  for (const line of text.slice(0, offset).split('\n').slice(0, -1)) {
    if (/^\s*(```|~~~)/.test(line)) open = !open;
  }
  return open;
}
