import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, localGraph, neighbourhood, filterGraph, createSimulation } from '../lib/graph.mjs';
import { scanTags, buildTagIndex } from '../lib/tags.mjs';

const notes = [
  { rel: 'A.md', content: 'see [[B]] and [[C|cee]] and [[B]] again #proje' },
  { rel: 'B.md', content: '[[A]] back, [[Yok]] missing, ![[pic.png]]' },
  { rel: 'Dir/C.md', content: '---\ntags: [proje, Okul]\n---\n[[D]]' },
  { rel: 'D.md', content: '`[[A]]` in code only' },
  { rel: 'E.md', content: 'alone' },
];

test('notes and links: one link per pair, attachments and code ignored', () => {
  const g = buildGraph(notes);
  assert.deepEqual(g.nodes.map((n) => n.id), ['A.md', 'B.md', 'Dir/C.md', 'D.md', 'E.md']);
  assert.deepEqual(g.links, [
    { source: 'A.md', target: 'B.md' },
    { source: 'A.md', target: 'Dir/C.md' },
    { source: 'Dir/C.md', target: 'D.md' },
  ]);
  assert.equal(g.nodes.find((n) => n.id === 'A.md').degree, 2);
  assert.equal(g.nodes.find((n) => n.id === 'E.md').degree, 0);
  assert.equal(g.nodes.find((n) => n.id === 'Dir/C.md').label, 'C');
});

test('tags and unresolved links as extra nodes', () => {
  const g = buildGraph(notes, { tags: true, unresolved: true });
  const tag = g.nodes.find((n) => n.id === 'tag:proje');
  assert.equal(tag.kind, 'tag');
  assert.equal(tag.label, '#proje');
  assert.equal(tag.degree, 2);
  assert.ok(g.nodes.some((n) => n.id === 'tag:okul'));
  const miss = g.nodes.find((n) => n.kind === 'missing');
  assert.deepEqual([miss.id, miss.label], ['missing:yok', 'Yok']);
  assert.ok(g.links.some((l) => l.source === 'B.md' && l.target === 'missing:yok'));
});

test('local graph by depth', () => {
  const g = buildGraph(notes);
  assert.deepEqual([...neighbourhood(g, 'B.md', 1)].sort(), ['A.md', 'B.md']);
  assert.deepEqual([...neighbourhood(g, 'B.md', 2)].sort(), ['A.md', 'B.md', 'Dir/C.md']);
  const l = localGraph(g, 'Dir/C.md', 1);
  assert.deepEqual(l.nodes.map((n) => n.id).sort(), ['A.md', 'D.md', 'Dir/C.md']);
  assert.equal(l.links.length, 2);
});

test('filters: query (i/ı folded) and orphans', () => {
  const g = buildGraph([...notes, { rel: 'Işık.md', content: '' }], { tags: true });
  assert.deepEqual(filterGraph(g, { query: 'IŞIK' }).nodes.map((n) => n.id), ['Işık.md']);
  const a = filterGraph(g, { query: 'a' });
  assert.ok(a.nodes.some((n) => n.id === 'tag:proje'), 'tags of matched notes stay');
  assert.ok(!filterGraph(g, { orphans: false }).nodes.some((n) => n.id === 'E.md'));
});

test('force layout: settles, finite, linked nodes end closer than unlinked', () => {
  const g = buildGraph(notes);
  const sim = createSimulation(g);
  for (let i = 0; i < 300; i += 1) sim.tick();
  assert.ok(sim.alpha < 0.01);
  for (const n of sim.nodes) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
  const d = (a, b) => Math.hypot(sim.node(a).x - sim.node(b).x, sim.node(a).y - sim.node(b).y);
  assert.ok(d('A.md', 'B.md') < d('B.md', 'E.md'));
  const pinned = sim.node('E.md'); pinned.fx = 500; pinned.fy = -20;
  sim.reheat(); sim.tick();
  assert.deepEqual([pinned.x, pinned.y], [500, -20]);
});

test('tags: inline, frontmatter, not in code or headings', () => {
  assert.deepEqual(scanTags('# Heading\nsome #tag and #iş/plan, `#code`\n```\n#fenced\n```\n#123 #a1'), ['tag', 'iş/plan', 'a1']);
  assert.deepEqual(scanTags('---\ntags:\n  - one\n  - "two"\ntitle: x\n---\nbody #One'), ['one', 'two']);
  assert.deepEqual(scanTags('---\ntag: a, b\n---\n'), ['a', 'b']);
  const idx = buildTagIndex(notes);
  assert.deepEqual(idx.map((t) => [t.tag, t.count]), [['proje', 2], ['Okul', 1]]);
  assert.deepEqual(idx[0].notes, ['A.md', 'Dir/C.md']);
});
