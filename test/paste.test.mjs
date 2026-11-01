import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToMarkdown, isRichHtml, insideCodeFence } from '../lib/paste.mjs';

test('a web page becomes Markdown as people type it', () => {
  const md = htmlToMarkdown('<h2>Başlık</h2><p>Bir <b>kalın</b>, <i>eğik</i> ve <a href="https://x.com/a">bağlantı</a>.</p><hr><blockquote><p>alıntı</p></blockquote>');
  assert.equal(md, '## Başlık\n\nBir **kalın**, *eğik* ve [bağlantı](https://x.com/a).\n\n---\n\n> alıntı');
});

test('lists, nested lists, numbered lists and tasks', () => {
  assert.equal(htmlToMarkdown('<ul><li>bir<ul><li>iç</li></ul></li><li>iki</li></ul>'), '- bir\n  - iç\n- iki');
  assert.equal(htmlToMarkdown('<ol start="3"><li>üç</li><li>dört</li></ol>'), '3. üç\n4. dört');
  assert.equal(htmlToMarkdown('<ul><li><input type="checkbox" checked> bitti</li><li><input type="checkbox"> yap</li></ul>'), '- [x] bitti\n- [ ] yap');
});

test('tables, strikethrough and code with its language', () => {
  assert.equal(htmlToMarkdown('<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>'), '| a   | b   |\n| --- | --- |\n| 1   | 2   |');
  assert.equal(htmlToMarkdown('<del>eski</del>'), '~~eski~~');
  assert.equal(htmlToMarkdown('<pre><code class="language-js">const a = 1;\n  b()</code></pre>'), '```js\nconst a = 1;\n  b()\n```');
});

test('Google Docs: styled spans are bold and italic, its wrapper is not', () => {
  const html = '<b style="font-weight:normal;" id="docs-internal-guid-1"><p><span style="font-weight:700">Kalın</span> <span style="font-style:italic">eğik</span> düz</p></b>';
  assert.equal(htmlToMarkdown(html), '**Kalın** *eğik* düz');
});

test('scripts, buttons, bad links and pasted data images are dropped', () => {
  assert.equal(htmlToMarkdown('<p>a<script>alert(1)</script><button>Tıkla</button> <a href="javascript:x()">yazı</a></p>'), 'a yazı');
  assert.equal(htmlToMarkdown('<img src="data:image/png;base64,AAA" alt="x"><img src="https://x.com/a b.png" alt="Resim">'), '![Resim](https://x.com/a%20b.png)');
});

test('when HTML is worth converting, and where paste stays plain', () => {
  assert.equal(isRichHtml('<meta charset="utf-8"><div>just text</div>'), false);
  assert.equal(isRichHtml('<p>a <strong>b</strong></p>'), true);
  assert.equal(isRichHtml('<span style="font-weight:700">x</span>'), true);
  const text = 'a\n```js\nconst x\n';
  assert.equal(insideCodeFence(text, text.length), true);
  assert.equal(insideCodeFence('a\n```\nx\n```\nb', 14), false);
});
