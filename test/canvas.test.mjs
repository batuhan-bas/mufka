import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCanvas, stringifyCanvas, edgeGeometry, facingSides, groupMembers, moveNodes, removeItems, updateItem, paintOrder, freeSpot, bounds } from '../lib/canvas.mjs';

const file = `{
	"nodes":[
		{"id":"g","type":"group","x":0,"y":0,"width":600,"height":300,"label":"Shipped"},
		{"id":"a","type":"text","text":"# Bases","x":20,"y":20,"width":250,"height":120,"color":"4"},
		{"id":"b","type":"file","file":"Tasks spec.md","x":300,"y":20,"width":250,"height":120},
		{"id":"c","type":"link","url":"https://jsoncanvas.org","x":700,"y":40,"width":250,"height":80,"styleAttributes":{}}
	],
	"edges":[
		{"id":"e1","fromNode":"a","fromSide":"right","toNode":"b","toSide":"left","label":"then"},
		{"id":"e2","fromNode":"b","toNode":"c"},
		{"id":"bad","fromNode":"a","toNode":"missing"}
	],
	"metadata":{"version":"1.0-1.0"}
}`;

test('reading and writing a canvas the way Obsidian does', () => {
  const c = parseCanvas(file);
  assert.equal(c.nodes.length, 4);
  assert.deepEqual(c.edges.map((e) => e.id), ['e1', 'e2']); // the edge to a missing node goes
  assert.deepEqual(c.nodes[3].styleAttributes, {}); // unknown fields kept
  const out = stringifyCanvas(c);
  assert.match(out, /^\{\n\t"nodes": \[/);
  assert.deepEqual(JSON.parse(out).metadata, { version: '1.0-1.0' });
  assert.deepEqual(parseCanvas(''), { nodes: [], edges: [], rest: {} });
  assert.match(parseCanvas('{nope').error, /not valid JSON/);
});

test('edges: named sides, or the sides that face each other', () => {
  const c = parseCanvas(file);
  const g1 = edgeGeometry(c, c.edges[0]);
  assert.deepEqual([g1.from, g1.to], [{ x: 270, y: 80 }, { x: 300, y: 80 }]);
  assert.match(g1.path, /^M270 80 C 310 80, 260 80, 300 80$/);
  assert.deepEqual(facingSides(c.nodes[2], c.nodes[3]), ['right', 'left']);
  assert.deepEqual(facingSides({ x: 0, y: 0, width: 100, height: 50 }, { x: 0, y: 300, width: 100, height: 50 }), ['bottom', 'top']);
});

test('groups carry what is inside; removing a node removes its edges', () => {
  const c = parseCanvas(file);
  assert.deepEqual(groupMembers(c, c.nodes[0]).map((n) => n.id), ['a', 'b']);
  const moved = moveNodes(c, ['g'], 10, 5);
  assert.deepEqual(moved.nodes.map((n) => [n.id, n.x, n.y]), [['g', 10, 5], ['a', 30, 25], ['b', 310, 25], ['c', 700, 40]]);
  const less = removeItems(c, ['b']);
  assert.deepEqual(less.edges, []);
  assert.equal(updateItem(c, 'e1', { label: 'next' }).edges[0].label, 'next');
  assert.deepEqual(paintOrder([{ id: 1, type: 'text' }, { id: 2, type: 'group' }]).map((n) => n.id), [2, 1]);
  assert.deepEqual(freeSpot(c, 20, 20, 100, 60), { x: 20, y: 170 });
  assert.deepEqual(bounds(c.nodes), { x: 0, y: 0, width: 950, height: 300 });
});
