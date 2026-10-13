import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCallout, calloutKind, defaultCalloutTitle } from '../lib/callout.mjs';
import { parseMarkdown } from '../lib/mdparse.mjs';

const quote = (md) => parseMarkdown(md).children[0];
const text = (nodes) => nodes.map((n) => (n.value != null ? n.value : text(n.children || []))).join('');

test('a plain blockquote is not a callout', () => {
  assert.equal(parseCallout(quote('> just a quote')), null);
  assert.equal(parseCallout(quote('> [link](x) here')), null);
  assert.equal(parseCallout(quote('> [!] empty')), null);
  assert.equal(parseCallout(quote('> **[!note]** bold first')), null);
  assert.equal(parseCallout(quote('para')), null);
});

test('type, title and body', () => {
  const c = parseCallout(quote('> [!tip] Use **this**\n> body line\n>\n> second'));
  assert.equal(c.type, 'tip');
  assert.equal(c.kind, 'tip');
  assert.equal(c.fold, '');
  assert.equal(text(c.title), 'Use this');
  assert.equal(c.body.length, 2);
  assert.equal(text(c.body[0].children), 'body line');
  assert.equal(text(c.body[1].children), 'second');
});

test('no title, title only, and fold markers', () => {
  const a = parseCallout(quote('> [!NOTE]\n> only body'));
  assert.equal(a.type, 'note');
  assert.deepEqual(a.title, []);
  assert.equal(text(a.body[0].children), 'only body');
  const b = parseCallout(quote('> [!info] Heads up'));
  assert.equal(text(b.title), 'Heads up');
  assert.deepEqual(b.body, []);
  assert.equal(parseCallout(quote('> [!faq]- Closed')).fold, '-');
  assert.equal(parseCallout(quote('> [!faq]+ Open')).fold, '+');
  assert.equal(parseCallout(quote('> [!faq]+')).fold, '+');
  assert.equal(text(parseCallout(quote('> [!todo] Trailing   ')).title), 'Trailing');
});

test('a title ending with formatting, then a body', () => {
  const c = parseCallout(quote('> [!warning] Be *careful*\n> now'));
  assert.equal(text(c.title), 'Be careful');
  assert.equal(text(c.body[0].children), 'now');
});

test('aliases share a look; unknown types look like note', () => {
  assert.equal(calloutKind('FAQ'), 'question');
  assert.equal(calloutKind('caution'), 'warning');
  assert.equal(calloutKind('error'), 'danger');
  assert.equal(calloutKind('cite'), 'quote');
  assert.equal(calloutKind('my-own'), 'note');
  assert.equal(calloutKind('constructor'), 'note');
  assert.equal(defaultCalloutTitle('faq'), 'Faq');
});
