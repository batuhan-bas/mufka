import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, toggleTaskLine } from '../lib/markdown.mjs';

// Minimal fake DOM so the pure renderer can be tested without a browser.
function makeDoc() {
  function el(tag) {
    return {
      tag, attrs: {}, children: [], _text: null,
      appendChild(c) { this.children.push(c); return c; },
      setAttribute(k, v) { this.attrs[k] = v; },
      getAttribute(k) { return this.attrs[k]; },
      set textContent(v) { this._text = v; this.children = []; },
      get textContent() {
        if (this._text != null) return this._text;
        return this.children.map((c) => c.textContent).join('');
      },
    };
  }
  return {
    createElement: (tag) => el(tag),
    createTextNode: (t) => ({ tag: '#text', isText: true, textContent: t }),
  };
}

const doc = makeDoc();
const render = (md, opts = {}) => renderMarkdown(md, { doc, ...opts });
// Find first descendant with tag.
function find(node, tag) {
  if (node.tag === tag) return node;
  for (const c of node.children || []) { const r = find(c, tag); if (r) return r; }
  return null;
}
function findAll(node, tag, acc = []) {
  if (node.tag === tag) acc.push(node);
  for (const c of node.children || []) findAll(c, tag, acc);
  return acc;
}

test('headings # to ###', () => {
  const b = render('# A\n## B\n### C');
  assert.deepEqual(b.map((n) => n.tag), ['h1', 'h2', 'h3']);
  assert.equal(b[0].textContent, 'A');
});

test('paragraph with nested bold/italic and inline code', () => {
  const [p] = render('Normal **bold _it_** and `code`.');
  assert.equal(p.tag, 'p');
  const strong = find(p, 'strong');
  assert.ok(strong);
  assert.ok(find(strong, 'em'), 'italic nested inside bold');
  assert.equal(find(p, 'code').textContent, 'code');
  assert.equal(p.textContent, 'Normal bold it and code.');
});

test('fenced code keeps raw text; a script tag stays inert text', () => {
  const [pre] = render('```\n<script>alert(1)</script>\n```');
  assert.equal(pre.tag, 'pre');
  const code = find(pre, 'code');
  assert.equal(code.textContent, '<script>alert(1)</script>');
  // No actual <script> element was created anywhere.
  assert.equal(findAll(pre, 'script').length, 0);
});

test('inline script-looking text never becomes an element', () => {
  const [p] = render('danger <script>x</script> ok');
  assert.equal(findAll(p, 'script').length, 0);
  assert.equal(p.textContent, 'danger <script>x</script> ok');
});

test('blockquote, hr, bullet and ordered lists', () => {
  const blocks = render('> quote\n\n---\n\n- one\n- two\n\n1. a\n2. b');
  assert.equal(blocks[0].tag, 'blockquote');
  assert.equal(blocks[1].tag, 'hr');
  assert.equal(blocks[2].tag, 'ul');
  assert.equal(findAll(blocks[2], 'li').length, 2);
  assert.equal(blocks[3].tag, 'ol');
});

test('task items become checkboxes with state and source line', () => {
  const [ul] = render('- [ ] todo\n- [x] done');
  const boxes = findAll(ul, 'input');
  assert.equal(boxes.length, 2);
  assert.equal(boxes[0].getAttribute('type'), 'checkbox');
  assert.equal(boxes[0].getAttribute('checked'), undefined);
  assert.equal(boxes[1].getAttribute('checked'), 'checked');
  assert.equal(boxes[0].getAttribute('data-line'), '0');
  assert.equal(boxes[1].getAttribute('data-line'), '1');
});

test('external links: only http/https become anchors', () => {
  const [p] = render('see [site](https://x.dev) and [bad](javascript:alert(1))');
  const a = find(p, 'a');
  assert.equal(a.getAttribute('href'), 'https://x.dev');
  assert.equal(a.getAttribute('data-external'), 'true');
  assert.equal(a.textContent, 'site');
  // The javascript: link is left as literal text, no anchor for it.
  assert.equal(findAll(p, 'a').length, 1);
  assert.ok(p.textContent.includes('[bad](javascript:alert(1))'));
});

test('wiki links carry the title and mark missing notes', () => {
  const noteExists = (t) => t === 'Var';
  const [p] = render('[[Var]] and [[Yok]]', { noteExists });
  const links = findAll(p, 'a');
  assert.equal(links[0].getAttribute('data-wiki'), 'Var');
  assert.equal(links[0].getAttribute('class'), 'wikilink');
  assert.equal(links[1].getAttribute('class'), 'wikilink missing');
});

test('wiki link alias, path and heading syntax', () => {
  const [p] = render('[[Folder/Title#Bölüm|göster]] and [[Not#Giriş]] and [[A/B]]');
  const links = findAll(p, 'a');
  assert.equal(links[0].getAttribute('data-wiki'), 'Folder/Title');
  assert.equal(links[0].getAttribute('data-heading'), 'Bölüm');
  assert.equal(links[0].textContent, 'göster');
  assert.equal(links[1].getAttribute('data-wiki'), 'Not');
  assert.equal(links[1].getAttribute('data-heading'), 'Giriş');
  assert.equal(links[1].textContent, 'Not › Giriş');
  assert.equal(links[2].getAttribute('data-wiki'), 'A/B');
  assert.equal(links[2].textContent, 'B');
});

test('attachments: image, file, missing, embed, remote', () => {
  const attach = (raw) => {
    if (/^https?:/.test(raw)) return { remote: true };
    const name = decodeURIComponent(raw).replace(/^Ekler\//, '');
    const inEkler = raw.startsWith('Ekler/') || !raw.includes('/');
    const exists = ['foto.png', 'rapor.pdf'].includes(name);
    return { url: `mufka-att://v/Ekler/${encodeURIComponent(name)}`, rel: `Ekler/${name}`, name, isImage: /\.(png|jpg)$/.test(name), exists, local: inEkler };
  };
  const [p] = render('![resim](Ekler/foto.png) [belge](Ekler/rapor.pdf) ![](Ekler/yok.png) ![[foto.png]] ![x](https://y/z.png)', { attach });
  const img = findAll(p, 'img');
  assert.equal(img.length, 2); // Ekler/foto.png and the embed ![[foto.png]]
  assert.equal(img[0].getAttribute('src'), 'mufka-att://v/Ekler/foto.png');
  assert.equal(img[0].getAttribute('alt'), 'resim');
  const files = findAll(p, 'a').filter((a) => a.getAttribute('class') === 'att-file');
  assert.equal(files[0].getAttribute('data-att'), 'Ekler/rapor.pdf');
  const missing = findAll(p, 'span').filter((s) => s.getAttribute('class') === 'att-missing');
  assert.equal(missing[0].textContent, 'File not found: yok.png');
  const remote = findAll(p, 'a').filter((a) => a.getAttribute('data-external') === 'true');
  assert.equal(remote.length, 1);
});

test('malformed input does not throw', () => {
  assert.doesNotThrow(() => render('**unclosed\n`code without end\n[x]('));
  assert.doesNotThrow(() => render(''));
  assert.doesNotThrow(() => render(null));
});

test('toggleTaskLine flips only the given line', () => {
  const src = '- [ ] a\n- [x] b';
  assert.equal(toggleTaskLine(src, 0), '- [x] a\n- [x] b');
  assert.equal(toggleTaskLine(src, 1), '- [ ] a\n- [ ] b');
  assert.equal(toggleTaskLine(src, 5), src); // out of range, unchanged
});

// --- Obsidian-vault syntax (the census of a real vault: frontmatter 91% of
// notes, nested lists 58%, tables 46%, tags 31%) ---

test('frontmatter renders as a property list, not a rule + text', () => {
  const blocks = render('---\ntitle: Rapor\ntags: [iş, "q1"]\naliases:\n  - R1\n  - R2\n---\n\nmetin');
  assert.equal(blocks[0].tag, 'dl');
  assert.equal(blocks[0].getAttribute('class'), 'frontmatter');
  const dts = findAll(blocks[0], 'dt').map((n) => n.textContent);
  const dds = findAll(blocks[0], 'dd').map((n) => n.textContent);
  assert.deepEqual(dts, ['title', 'tags', 'aliases']);
  assert.deepEqual(dds, ['Rapor', 'iş, q1', 'R1, R2']);
  assert.equal(findAll(blocks[0], 'hr').length, 0);
  assert.equal(blocks[1].tag, 'p');
});

test('frontmatter that is not simple key/value data is shown raw', () => {
  const [pre] = render('---\n{ weird: yaml }\n---');
  assert.equal(pre.tag, 'pre');
  assert.equal(pre.getAttribute('class'), 'frontmatter frontmatter-raw');
  assert.equal(pre.textContent, '{ weird: yaml }');
});

test('nested lists nest, and nested tasks keep their own source line', () => {
  const [ul] = render('- bir\n  - iki\n    - [x] üç\n- dört');
  const lis = findAll(ul, 'li');
  assert.equal(lis.length, 4);
  const inner = find(lis[0], 'ul');
  assert.ok(inner, 'second level is a list inside the first item');
  assert.ok(find(inner, 'ul'), 'third level too');
  const box = find(ul, 'input');
  assert.equal(box.getAttribute('data-line'), '2');
  assert.equal(box.getAttribute('checked'), 'checked');
});

test('tables: header, body, alignment as classes (no inline styles)', () => {
  const [table] = render('| Ad | Puan |\n| :-- | --: |\n| Ali | 3 |\n| Ayşe | **5** |');
  assert.equal(table.tag, 'table');
  assert.deepEqual(findAll(table, 'th').map((n) => n.textContent), ['Ad', 'Puan']);
  assert.equal(findAll(table, 'tr').length, 3);
  const tds = findAll(table, 'td');
  assert.equal(tds[1].getAttribute('class'), 'align-right');
  assert.equal(tds[0].getAttribute('class'), 'align-left');
  assert.ok(find(tds[3], 'strong'), 'inline formatting inside cells');
  assert.equal(findAll(table, 'td').some((n) => n.getAttribute('style') != null), false);
});

test('headings #### to ######', () => {
  assert.deepEqual(render('#### d\n##### e\n###### f').map((n) => n.tag), ['h4', 'h5', 'h6']);
});

test('tags, highlights and strikethrough', () => {
  const [p] = render('Bir #proje/mufka notu ==önemli== ve ~~eski~~ (#etiket), ama a#b ve #123 değil');
  const tags = findAll(p, 'span').filter((s) => s.getAttribute('class') === 'tag');
  assert.deepEqual(tags.map((t) => t.getAttribute('data-tag')), ['proje/mufka', 'etiket']);
  assert.equal(find(p, 'mark').textContent, 'önemli');
  assert.equal(find(p, 'del').textContent, 'eski');
});

test('obsidian syntax is not applied inside code', () => {
  const [p] = render('`#notag [[nolink]] ==x==`');
  assert.equal(findAll(p, 'span').length, 0);
  assert.equal(findAll(p, 'a').length, 0);
  assert.equal(find(p, 'code').textContent, '#notag [[nolink]] ==x==');
});

test('a single line break inside a paragraph is a line break, like Obsidian', () => {
  const [p] = render('bir\niki');
  assert.equal(findAll(p, 'br').length, 1);
  assert.equal(p.textContent, 'biriki');
});

test('footnotes render a reference and a definition', () => {
  const blocks = render('Metin[^1].\n\n[^1]: Dipnot.');
  assert.equal(find(blocks[0], 'sup').textContent, '[1]');
  const def = blocks.find((b) => b.getAttribute && b.getAttribute('class') === 'footnote');
  assert.ok(def);
  assert.ok(def.textContent.includes('Dipnot.'));
});

test('block HTML stays inert text', () => {
  const blocks = render('<div>\n<script>alert(1)</script>\n</div>');
  assert.equal(blocks.flatMap((b) => findAll(b, 'script')).length, 0);
  assert.ok(blocks.map((b) => b.textContent).join('').includes('<script>alert(1)</script>'));
});

test('toggleTaskLine handles nested, ordered, plus and quoted tasks', () => {
  assert.equal(toggleTaskLine('- a\n  - [ ] b', 1), '- a\n  - [x] b');
  assert.equal(toggleTaskLine('1. [x] a', 0), '1. [ ] a');
  assert.equal(toggleTaskLine('+ [ ] a', 0), '+ [x] a');
  assert.equal(toggleTaskLine('> - [ ] a', 0), '> - [x] a');
  assert.equal(toggleTaskLine('- [ ] a [x] b', 0), '- [x] a [x] b'); // only the box
  assert.equal(toggleTaskLine('[ ] not a task', 0), '[ ] not a task');
});

test('a block resolves footnotes and link references defined elsewhere in the note', () => {
  const full = 'Metin[^1] ve [site][s].\n\nBaşka blok.\n\n[^1]: Dipnot.\n\n[s]: https://x.dev';
  const blocks = render('Metin[^1] ve [site][s].', { refs: full });
  assert.equal(blocks.length, 1, 'definitions from refs are not rendered');
  assert.equal(find(blocks[0], 'sup').textContent, '[1]');
  assert.equal(find(blocks[0], 'a').getAttribute('href'), 'https://x.dev');
  // Without refs the same block keeps the literal text.
  assert.ok(render('Metin[^1].')[0].textContent.includes('[^1]'));
});

test('callouts render as titled boxes; foldable ones as details', () => {
  const [box] = render('> [!warning] Mind the **gap**\n> - [ ] check it');
  assert.equal(box.tag, 'div');
  assert.equal(box.attrs.class, 'callout callout-warning');
  assert.equal(box.attrs['data-callout'], 'warning');
  assert.equal(box.children[0].attrs.class, 'callout-title');
  assert.equal(box.children[0].textContent, 'Mind the gap');
  assert.ok(find(box.children[0], 'strong'));
  const content = box.children[1];
  assert.equal(content.attrs.class, 'callout-content');
  assert.equal(find(content, 'input').attrs['data-line'], '1');

  const [closed] = render('> [!faq]- Why?\n> Because.');
  assert.equal(closed.tag, 'details');
  assert.equal(closed.attrs.class, 'callout callout-question');
  assert.equal(closed.attrs.open, undefined);
  assert.equal(closed.children[0].tag, 'summary');
  const [open] = render('> [!note]+');
  assert.equal(open.attrs.open, '');
  assert.equal(open.children[0].textContent, 'Note');
  assert.equal(open.children.length, 1);

  const [plain] = render('> quote');
  assert.equal(plain.tag, 'blockquote');
});

test('callout content stays inert text', () => {
  const [box] = render('> [!note] <img src=x onerror=alert(1)>\n> <script>alert(1)</script>');
  assert.equal(findAll(box, 'img').length, 0);
  assert.equal(findAll(box, 'script').length, 0);
});
