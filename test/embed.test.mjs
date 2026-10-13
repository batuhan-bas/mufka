import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNoteTarget, embedSection } from '../lib/embed.mjs';
import { renderMarkdown } from '../lib/markdown.mjs';

function makeDoc() {
  const el = (tag) => ({
    tag, attrs: {}, children: [], _text: null,
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    set textContent(v) { this._text = v; this.children = []; },
    get textContent() { return this._text != null ? this._text : this.children.map((c) => c.textContent).join(''); },
  });
  return { createElement: el, createTextNode: (t) => ({ tag: '#text', textContent: t }) };
}
const doc = makeDoc();
const findAll = (n, pred, acc = []) => { if (pred(n)) acc.push(n); for (const c of n.children || []) findAll(c, pred, acc); return acc; };

test('note targets vs files', () => {
  assert.ok(isNoteTarget('Plan'));
  assert.ok(isNoteTarget('Dir/Plan.md'));
  assert.ok(isNoteTarget('v1.2 notes'), 'a dot in a title is not an extension');
  assert.ok(!isNoteTarget('pic.png'));
  assert.ok(!isNoteTarget('doc.pdf'));
});

test('sections: whole note without frontmatter, or one heading', () => {
  const src = '---\na: 1\n---\n\n# Top\nintro\n## A\na text\n### A1\ndeep\n## B\nb text';
  assert.equal(embedSection(src), '# Top\nintro\n## A\na text\n### A1\ndeep\n## B\nb text');
  assert.equal(embedSection(src, 'a'), '## A\na text\n### A1\ndeep');
  assert.equal(embedSection(src, 'B'), '## B\nb text');
  assert.equal(embedSection(src, 'none'), null);
});

const notes = {
  Plan: { rel: 'Plan.md', content: '# Plan\n- [ ] task\n\n## Later\nsoon' },
  Loop: { rel: 'Loop.md', content: 'again ![[Loop]]' },
};
const embedNote = (t) => notes[t] || null;

test('a note embed renders its content read-only, with a title link', () => {
  const [p] = renderMarkdown('see ![[Plan]]', { doc, embedNote });
  const [box] = findAll(p, (n) => n.attrs && n.attrs.class === 'embed');
  assert.equal(box.attrs['data-embed'], 'Plan.md');
  assert.equal(box.children[0].attrs['data-wiki'], 'Plan');
  const boxes = findAll(box, (n) => n.tag === 'input');
  assert.equal(boxes.length, 1);
  assert.equal(boxes[0].attrs.disabled, '');
  assert.equal(boxes[0].attrs['data-line'], undefined);
  const [p2] = renderMarkdown('![[Plan#Later]]', { doc, embedNote });
  assert.match(p2.textContent, /Later.*soon/s);
  assert.doesNotMatch(p2.textContent, /task/);
});

test('embeds do not loop; files still render as attachments', () => {
  const [p] = renderMarkdown('![[Loop]]', { doc, embedNote });
  assert.equal(findAll(p, (n) => n.attrs && n.attrs.class === 'embed').length, 1, 'the inner self-embed is a link');
  const [q] = renderMarkdown('![[pic.png]]', { doc, embedNote, attach: () => ({ local: true, exists: true, isImage: true, url: 'u', name: 'pic.png', rel: 'pic.png' }) });
  assert.equal(findAll(q, (n) => n.tag === 'img').length, 1);
  const [r] = renderMarkdown('![[Nope]]', { doc, embedNote, attach: () => ({ local: true, exists: false, name: 'Nope' }) });
  assert.match(r.textContent, /not found/);
});
