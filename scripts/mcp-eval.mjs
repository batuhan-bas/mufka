// A fixed set of questions to the MCP server against a small vault
// (test/fixtures/mcp-vault), checking the right notes come back, Turkish
// letters included. `npm run eval:mcp`; part of `npm test`.
//
// A case (scripts/mcp-eval-cases.json): { name, tool, args } and what to
// check on the values of `field` (default: each result's path):
//   paths: exactly these (any order) · first: this one first ·
//   includes: these among them · none: nothing found
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMufkaServer } from '../mcp/tools.mjs';

const vault = fileURLToPath(new URL('../test/fixtures/mcp-vault', import.meta.url));
const cases = JSON.parse(fs.readFileSync(new URL('./mcp-eval-cases.json', import.meta.url), 'utf8'));

const { server } = createMufkaServer({ root: () => vault, settings: () => ({ mcp: { enabled: true } }) });
const [a, b] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: 'mcp-eval', version: '1.0.0' });
await server.connect(a);
await client.connect(b);

// The values a case looks at: the results' paths, or `field` ("backlinks.path").
function values(result, field) {
  const list = Array.isArray(result) ? result : result.results || result.notes || null;
  if (!field) return list.map((r) => r.path);
  const [head, sub] = field.split('.');
  const pick = (o) => (sub ? o[head].map((x) => x[sub]) : o[head]);
  return list ? list.map((o) => o[head]) : pick(result);
}

const same = (x, y) => JSON.stringify([...x].map(String).sort()) === JSON.stringify([...y].map(String).sort());
let failed = 0;
for (const c of cases) {
  const res = await client.callTool({ name: c.tool, arguments: c.args });
  const text = res.content[0].text;
  let ok; let got;
  if (res.isError) { ok = false; got = text; } else {
    const v = values(JSON.parse(text), c.field);
    got = JSON.stringify(v);
    ok = (!c.paths || same(v, c.paths))
      && (!c.first || v[0] === c.first)
      && (!c.includes || c.includes.every((x) => v.includes(x)))
      && (!c.none || v.length === 0);
  }
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${c.name}${ok ? '' : `\n      ${c.tool} ${JSON.stringify(c.args)} → ${got}`}`);
}
await client.close();
console.log(`\n${cases.length - failed}/${cases.length} cases pass`);
process.exit(failed ? 1 : 0);
