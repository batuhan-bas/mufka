import { test } from 'node:test';
import assert from 'node:assert/strict';
import domino from '@mixmark-io/domino';
import { clipMeta, articleElement, clipPage, clipNote } from '../lib/clip.mjs';

const page = `<!doctype html><html><head>
<title>Notes that last | The Blog</title>
<meta property="og:title" content="Notes that last">
<meta property="og:site_name" content="The Blog">
<meta name="description" content="One idea per note, in your own words.">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","headline":"Notes that last","author":[{"@type":"Person","name":"Jane Doe"}],"datePublished":"2026-11-12T08:00:00Z"}</script>
</head><body>
<header><nav><a href="/">Home</a> <a href="/about">About</a></nav></header>
<div class="layout">
  <aside class="sidebar"><p>Subscribe to our newsletter for more posts like this one, every week.</p></aside>
  <article>
    <h1>Notes that last</h1>
    <p>Writing is not what follows research; it is the medium in which the work is done, every day.</p>
    <div class="share-buttons"><a href="https://x.com/share">Share</a></div>
    <h2>One idea per note</h2>
    <p>A note that holds one thought can be linked from many places. See <a href="/blog/links">links</a>.</p>
    <img data-src="/img/cards.png" src="data:image/gif;base64,R0lGOD" alt="Cards">
    <ul><li>Short</li><li>In your own words</li></ul>
  </article>
</div>
<footer><p>© The Blog, all rights reserved, since forever and a day.</p></footer>
</body></html>`;
const doc = domino.createDocument(page);
const url = 'https://example.com/blog/notes-that-last';

test('what the page says about itself', () => {
  assert.deepEqual(clipMeta(doc, url), { title: 'Notes that last', author: ['Jane Doe'], published: '2026-11-12', description: 'One idea per note, in your own words.', site: 'The Blog' });
  assert.equal(articleElement(doc).nodeName, 'ARTICLE');
});

test('the article as a note with its properties', () => {
  const { name, content } = clipPage(doc, url, '2026-11-23');
  assert.equal(name, 'Notes that last');
  assert.ok(content.startsWith('---\ntitle: "Notes that last"\nsource: "https://example.com/blog/notes-that-last"\nauthor:\n  - "[[Jane Doe]]"\npublished: 2026-11-12\ncreated: 2026-11-23\ndescription: "One idea per note, in your own words."\ntags:\n  - clippings\n---\n'), content);
  const body = content.split('---\n')[2];
  assert.ok(!/^# Notes that last/m.test(body), 'the title is not repeated');
  assert.match(body, /^Writing is not what follows research/m);
  assert.match(body, /^## One idea per note$/m);
  assert.match(body, /\[links\]\(https:\/\/example\.com\/blog\/links\)/);
  assert.match(body, /!\[Cards\]\(https:\/\/example\.com\/img\/cards\.png\)/);
  assert.match(body, /^- In your own words$/m);
  assert.ok(!/Share|newsletter|Home|rights reserved/.test(body), body);
});

test('a page without an <article>: the block with the most text', () => {
  const d = domino.createDocument('<body><div id="menu"><p>Menu</p></div><div id="post"><p>First paragraph of the post, long enough to count as text.</p><p>Second paragraph of the post, also long enough to count.</p></div></body>');
  assert.equal(articleElement(d).getAttribute('id'), 'post');
  assert.equal(clipNote({ url: 'https://a.b/c', meta: { title: 'A/B: c?', author: [] }, markdown: 'x', today: '2026-01-01' }).name, 'A B c');
});
