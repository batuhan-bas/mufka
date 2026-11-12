// Mufka's notes as an MCP server: search, read and list notes, job
// applications and projects, and (when the user allows it) create notes and
// add to them. Built on the app's own pure modules, so a search here finds
// what Mufka's search finds. Run by mcp/server.mjs; tests drive it in-process.
//
// Settings decide on every call: settings.mcp.enabled (off: every tool
// answers how to turn it on) and settings.mcp.allowWrite (off: the write
// tools are not listed, and refuse when called anyway).
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listVault, readNote, createNote, appendToNote, noteRel, folderRel, vaultLayoutOf } from '../lib/vaultfs.mjs';
import { createVaultCache } from '../lib/vault-cache.mjs';
import { parseQuery, isEmptyQuery, searchDoc, matchNote, hitTerms, snippetFor } from '../lib/search.mjs';
import { buildBacklinkIndex, backlinksFor } from '../lib/backlinks.mjs';
import { scanTags } from '../lib/tags.mjs';
import { readProps } from '../lib/properties.mjs';
import { jobOf } from '../lib/jobs.mjs';
import { projectOf, daysLeft } from '../lib/projects.mjs';
import { foldTR } from '../lib/plans.mjs';

const READ = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const OFF = 'Access to Mufka notes is turned off. The user can turn it on in Mufka → Settings → AI clients (MCP).';
const NO_WRITE = 'Writing to Mufka notes is not allowed. The user can allow it in Mufka → Settings → AI clients (MCP).';

const titleOf = (rel) => path.posix.basename(rel).replace(/\.md$/i, '');
const iso = (ms) => new Date(ms).toISOString();
const json = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const fail = (message) => ({ isError: true, content: [{ type: 'text', text: message }] });
// Property values as JSON can hold them (YAML dates become YYYY-MM-DD).
const plain = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : Array.isArray(v) ? v.map(plain) : v);

// root(): the vault folder; settings(): Mufka's settings.json, read anew.
export function createMufkaServer({ root, settings, version = '0.0.0' }) {
  const server = new McpServer({ name: 'mufka', version }, {
    instructions: 'Mufka is a notes app; these tools read the user\'s Markdown notes (an Obsidian-compatible vault). Paths are relative to the vault, like "Projects/Website.md". Write tools exist only when the user has allowed writing.',
  });
  const cache = createVaultCache({ read: (abs) => readNote(root(), abs).content });
  const enabled = () => Boolean(settings().mcp && settings().mcp.enabled);
  const writable = () => enabled() && Boolean(settings().mcp.allowWrite);

  // Every note with its text; files are read again only when they changed.
  function notes() {
    const { notes: listing } = listVault(root());
    cache.refresh(listing.map((n) => ({ rel: n.rel, abs: n.rel, mtime: n.mtime, ctime: n.mtime, size: n.size })));
    return cache.all();
  }
  const templatesFolder = () => { const t = vaultLayoutOf(root()).templates; return t ? `${t}/` : null; };
  const notTemplates = (list) => { const t = templatesFolder(); return t ? list.filter((n) => !n.rel.startsWith(t)) : list; };

  // A tool that answers only when access is on, and turns thrown errors (a
  // refused path, a missing note) into an error result the client can show.
  const guarded = (handler, { write = false } = {}) => async (args) => {
    if (!enabled()) return fail(OFF);
    if (write && !writable()) return fail(NO_WRITE);
    try { return await handler(args); } catch (err) { return fail(err.message); }
  };

  server.registerTool('search_notes', {
    title: 'Search notes',
    description: 'Search the user\'s notes with Mufka\'s search syntax and return matching notes with a snippet. Plain words must all appear, in any case; the Turkish i, ı, İ and I count as one letter ("istanbul" finds "İSTANBUL"), while ç, ğ, ö, ş and ü must be typed as they are. Also: "exact phrase", -word to exclude, a OR b, /regex/, #tag, file:name, path:folder, line:(a b) on one line, section:(a b) under one heading, task:word in a task, task-todo:, task-done:, [property:value].',
    inputSchema: {
      query: z.string().min(1).describe('Search text in Mufka\'s syntax, e.g. `budget #2026 -draft` or `path:Projects task-todo:deploy`'),
      limit: z.number().int().min(1).max(50).default(20).describe('Most results to return'),
    },
    annotations: { title: 'Search notes', ...READ },
  }, guarded(({ query, limit }) => {
    const tree = parseQuery(query);
    if (isEmptyQuery(tree)) return fail('The query has nothing to search for');
    const terms = hitTerms(tree);
    const hits = [];
    for (const n of notes()) {
      const doc = searchDoc({ rel: n.rel, title: titleOf(n.rel), content: n.content });
      if (!matchNote(tree, doc)) continue;
      const snip = snippetFor(doc, terms);
      const inTitle = terms.some((t) => (t.text ? foldTR(doc.title).includes(foldTR(t.text)) : new RegExp(t.re.source, 'iu').test(doc.title)));
      hits.push({ path: n.rel, title: doc.title, snippet: snip ? snip.text : '', modified: iso(n.mtime), inTitle });
    }
    hits.sort((a, b) => Number(b.inTitle) - Number(a.inTitle) || b.modified.localeCompare(a.modified));
    return json({ total: hits.length, results: hits.slice(0, limit).map(({ inTitle, ...h }) => h) });
  }));

  server.registerTool('read_note', {
    title: 'Read a note',
    description: 'Read one note: its Markdown text, its frontmatter properties, its #tags, and the notes that link to it ([[backlinks]]).',
    inputSchema: { path: z.string().describe('Vault-relative path of the note, e.g. "Projects/Website.md"') },
    annotations: { title: 'Read a note', ...READ },
  }, guarded(({ path: rel }) => {
    const clean = noteRel(rel);
    const all = notes();
    const n = all.find((x) => x.rel === clean);
    if (!n) return fail(`No note at ${clean}`);
    const props = readProps(n.content);
    return json({
      path: n.rel,
      title: titleOf(n.rel),
      properties: props.props ? Object.fromEntries(props.props.map((p) => [p.key, plain(p.value)])) : {},
      tags: scanTags(n.content),
      backlinks: backlinksFor(buildBacklinkIndex(all), n.rel).map((b) => ({ path: b.rel, line: b.line })),
      modified: iso(n.mtime),
      content: n.content,
    });
  }));

  server.registerTool('list_notes', {
    title: 'List notes',
    description: 'List notes, newest first or by name; optionally only those in a folder (and its subfolders) or with a #tag (nested tags included: "work" also lists #work/meetings).',
    inputSchema: {
      folder: z.string().optional().describe('Vault-relative folder, e.g. "Projects"'),
      tag: z.string().optional().describe('A tag with or without #, e.g. "work"'),
      sort: z.enum(['modified', 'name']).default('modified'),
      limit: z.number().int().min(1).max(200).default(50),
    },
    annotations: { title: 'List notes', ...READ },
  }, guarded(({ folder, tag, sort, limit }) => {
    const dir = folder ? folderRel(folder) : '';
    const want = tag ? foldTR(tag.replace(/^#/, '')) : null;
    let list = notes().filter((n) => !dir || n.rel.startsWith(`${dir}/`));
    const withTags = list.map((n) => ({ n, tags: scanTags(n.content) }));
    const picked = want ? withTags.filter(({ tags }) => tags.some((t) => { const f = foldTR(t); return f === want || f.startsWith(`${want}/`); })) : withTags;
    const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
    picked.sort((a, b) => (sort === 'name' ? collator.compare(a.n.rel, b.n.rel) : b.n.mtime - a.n.mtime));
    list = picked.slice(0, limit);
    return json({ total: picked.length, notes: list.map(({ n, tags }) => ({ path: n.rel, title: titleOf(n.rel), modified: iso(n.mtime), tags })) });
  }));

  server.registerTool('list_job_applications', {
    title: 'List job applications',
    description: 'List the job applications kept in Mufka: notes with company and status properties (or type: job), with company, role, status, the date applied, location and the posting link.',
    inputSchema: { status: z.string().optional().describe('Only this status, e.g. "Applied", "Technical", "Offer", "Rejected" (case ignored)') },
    annotations: { title: 'List job applications', ...READ },
  }, guarded(({ status }) => {
    let jobs = notTemplates(notes()).map((n) => jobOf(n.rel, n.content)).filter(Boolean);
    if (status) jobs = jobs.filter((j) => foldTR(j.status) === foldTR(status));
    jobs.sort((a, b) => String(b.applied).localeCompare(String(a.applied)));
    return json(jobs.map((j) => ({ path: j.rel, company: j.company, role: j.role, status: j.status, applied: j.applied, location: j.location, salary: j.salary, link: j.link })));
  }));

  server.registerTool('list_projects', {
    title: 'List projects',
    description: 'List the projects kept in Mufka (notes with type: project): status (Planning, Active, On hold, Done), checklist progress, start and due dates, and days left (negative when late).',
    inputSchema: { status: z.string().optional().describe('Only this status, e.g. "Active" (case ignored)') },
    annotations: { title: 'List projects', ...READ },
  }, guarded(({ status }) => {
    let ps = notTemplates(notes()).map((n) => projectOf(n.rel, n.content)).filter(Boolean);
    if (status) ps = ps.filter((p) => foldTR(p.status) === foldTR(status));
    ps.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.rel.localeCompare(b.rel));
    return json(ps.map((p) => ({
      path: p.rel, title: titleOf(p.rel), status: p.status, done: p.done, total: p.total,
      progress: p.total ? Math.round((p.done / p.total) * 100) / 100 : null,
      start: p.start || null, due: p.due || null, daysLeft: daysLeft(p.due),
    })));
  }));

  const writeTools = [
    server.registerTool('create_note', {
      title: 'Create a note',
      description: 'Create a new Markdown note. Fails if a note already exists at that path (it never replaces one). Folders that do not exist yet are made.',
      inputSchema: {
        path: z.string().describe('Vault-relative path for the new note; ".md" is added when missing, e.g. "Ideas/Garden"'),
        content: z.string().describe('The note\'s Markdown text'),
      },
      annotations: { title: 'Create a note', ...WRITE },
    }, guarded(({ path: rel, content }) => json({ path: createNote(root(), rel, content) }), { write: true })),
    server.registerTool('append_to_note', {
      title: 'Add to a note',
      description: 'Add text at the end of an existing note, on a new line. Nothing in the note is changed or removed.',
      inputSchema: {
        path: z.string().describe('Vault-relative path of an existing note, e.g. "Daily/2026-11-12.md"'),
        text: z.string().min(1).describe('Markdown text to add at the end'),
      },
      annotations: { title: 'Add to a note', ...WRITE },
    }, guarded(({ path: rel, text }) => json({ path: appendToNote(root(), rel, text) }), { write: true })),
  ];

  // Show the write tools only while writing is allowed; the SDK tells a
  // connected client that the list changed.
  function syncWriteTools() {
    for (const t of writeTools) { if (writable() && !t.enabled) t.enable(); else if (!writable() && t.enabled) t.disable(); }
  }
  syncWriteTools();
  return { server, syncWriteTools };
}
