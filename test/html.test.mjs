import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../lib/markdown.mjs';
import { htmlTokens, decodeEntities } from '../lib/html.mjs';

// Minimal fake DOM so the pure renderer can be tested without a browser.
function makeDoc() {
  function el(tag) {
    return {
      tag, attrs: {}, children: [], _text: null,
      appendChild(c) { this.children.push(c); return c; },
      setAttribute(k, v) { this.attrs[k] = v; },
      getAttribute(k) { return this.attrs[k]; },
      set textContent(v) { this._text = v; this.children = []; },
      get textContent() { return this._text != null ? this._text : this.children.map((c) => c.textContent).join(''); },
    };
  }
  return { createElement: (tag) => el(tag), createTextNode: (t) => ({ tag: '#text', isText: true, textContent: t }) };
}
const doc = makeDoc();
const render = (md, opts = {}) => renderMarkdown(md, { doc, ...opts });
function find(node, tag) {
  if (node.tag === tag) return node;
  for (const c of node.children || []) { const r = find(c, tag); if (r) return r; }
  return null;
}
const tags = (node, acc = []) => { if (node.tag && node.tag !== '#text') acc.push(node.tag); for (const c of node.children || []) tags(c, acc); return acc; };

test('inline formatting tags become elements and hold the Markdown inside them', () => {
  const [p] = render('Press <kbd>Ctrl</kbd>, then <b>bold **and strong**</b> and H<sub>2</sub>O<br>next');
  assert.equal(find(p, 'kbd').textContent, 'Ctrl');
  assert.ok(find(find(p, 'b'), 'strong'), 'Markdown inside an HTML tag still renders');
  assert.equal(find(p, 'sub').textContent, '2');
  assert.ok(find(p, 'br'));
  assert.equal(p.textContent, 'Press Ctrl, then bold and strong and H2Onext');
});

test('a <details> block holds the Markdown blocks until it closes', () => {
  const out = render('<details>\n<summary>More</summary>\n\n- one\n- two\n\n</details>\n\nAfter');
  assert.equal(out.length, 2);
  assert.equal(out[0].tag, 'details');
  assert.equal(find(out[0], 'summary').textContent, 'More');
  assert.ok(find(out[0], 'ul'), 'the list sits inside details');
  assert.equal(out[1].tag, 'p');
});

test('script, style, iframe and unknown tags stay visible text; comments are hidden', () => {
  const [p] = render('a <script>alert(1)</script> <iframe src="x"></iframe> b <day> c <!-- note --> d');
  assert.deepEqual(tags(p), ['p']);
  assert.equal(p.textContent, 'a <script>alert(1)</script> <iframe src="x"></iframe> b <day> c  d');
  const blocks = render('<style>body{}</style>');
  assert.equal(tags(blocks[0]).includes('style'), false);
});

test('only harmless attributes are kept; links are http(s) only', () => {
  const [p] = render('<span style="color:red" onclick="x()" class="c" title="t">s</span> <a href="javascript:alert(1)">bad</a> <a href="https://example.com">ok</a>');
  const span = find(p, 'span');
  assert.deepEqual(span.attrs, { title: 't' });
  const links = p.children.filter((c) => c.tag === 'a');
  assert.equal(links[0].attrs.href, undefined);
  assert.equal(links[1].attrs.href, 'https://example.com');
  assert.equal(links[1].attrs['data-external'], 'true');
});

test('images only from the vault, through the attachment resolver', () => {
  const attach = (raw) => (raw === 'pic.png' ? { local: true, exists: true, isImage: true, url: 'mufka-att://pic.png', name: 'pic.png', rel: 'pic.png' } : { local: true, exists: false });
  const [p] = render('<img src="pic.png" width="200" onerror="x()"> <img src="https://evil/x.png" alt="remote">', { attach });
  const img = find(p, 'img');
  assert.equal(img.attrs.src, 'mufka-att://pic.png');
  assert.equal(img.attrs.width, '200');
  assert.equal(img.attrs.onerror, undefined);
  assert.equal(p.children.filter((c) => c.tag === 'img').length, 1);
  assert.match(p.textContent, /remote/);
});

test('tables in HTML, entities, and the tokenizer', () => {
  const [t] = render('<table><tr><th colspan="2">H</th></tr><tr><td>a &amp; b</td><td>&lt;c&gt;</td></tr></table>');
  assert.equal(t.tag, 'table');
  assert.equal(find(t, 'th').attrs.colspan, '2');
  assert.equal(find(t, 'td').textContent, 'a & b');
  assert.equal(decodeEntities('&#x41;&#66;&nbsp;&unknown;'), 'AB &unknown;');
  assert.deepEqual(htmlTokens('<b class="x">t</b>').map((x) => x.type), ['open', 'text', 'close']);
});

test('the editor keeps <details>…</details> and the Markdown inside it as one block', async () => {
  const { parseBlocks } = await import('../lib/blocks.mjs');
  const src = 'Intro\n\n<details>\n<summary>More</summary>\n\n- one\n\n</details>\n\nAfter';
  assert.deepEqual(parseBlocks(src).map((b) => [b.type, b.start, b.end]), [['paragraph', 0, 0], ['html', 2, 7], ['paragraph', 9, 9]]);
  assert.deepEqual(parseBlocks('<br>\n\nx').map((b) => b.type), ['html', 'paragraph']);
});
