// The MCP Apps view (ui://mufka/view.html): what read_note, list_projects and
// list_job_applications look like in a host that shows views (Claude
// Desktop, claude.ai). Mufka's own pieces draw it — the Markdown renderer and
// the project and job boards — with Mufka's styles, so it looks like the app.
// A card opens its note here; a task box ticks the task when the user allows
// it (toggle_task, which refuses a line that changed since it was shown).
// Built into one HTML file by scripts/build-mcp-ui.mjs.
import { App, applyDocumentTheme } from '@modelcontextprotocol/ext-apps';
import { renderMarkdown } from '../../lib/markdown.mjs';
import { projectsBoard } from '../../src/projects-view.js';
import { jobsBoard } from '../../src/jobs-view.js';
import { DEFAULT_STAGES } from '../../lib/jobs.mjs';

const root = document.getElementById('root');
const app = new App({ name: 'Mufka', version: '1.0.0' }, {}, { autoResize: true });
const history = []; // what Back returns to
let current = null; // the structured content on screen

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function setTheme(ctx) {
  const t = ctx && ctx.theme;
  applyDocumentTheme(t === 'light' || t === 'dark' ? t : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
}

function message(text) {
  const m = el('div', 'mv-message', text);
  m.setAttribute('role', 'status');
  root.querySelector('.mv-message')?.remove();
  root.prepend(m);
  setTimeout(() => m.remove(), 5000);
}

// A tool's result → its structured content, or an error message.
async function call(name, args) {
  const res = await app.callServerTool({ name, arguments: args });
  if (res.isError) throw new Error((res.content && res.content[0] && res.content[0].text) || 'Mufka could not do that');
  return res.structuredContent;
}

// A view shown again (Back) is asked for again: a tick on the way may have
// changed it. On failure, as it was.
async function fresh(sc) {
  try {
    if (sc.view === 'projects') return await call('list_projects', sc.status ? { status: sc.status } : {});
    if (sc.view === 'jobs') return await call('list_job_applications', sc.status ? { status: sc.status } : {});
    if (sc.view === 'note') return await call('read_note', { path: sc.note.path });
  } catch { /* keep what was shown */ }
  return sc;
}

async function openNote(path) {
  try {
    const sc = await call('read_note', { path });
    if (current) history.push(current);
    show(sc);
  } catch (err) { message(err.message); }
}

function topBar(title, sub) {
  const bar = el('div', 'mv-bar');
  if (history.length) {
    const back = el('button', 'btn quiet mv-back', '‹ Back'); back.type = 'button';
    back.addEventListener('click', async () => show(await fresh(history.pop()), { back: true }));
    bar.append(back);
  }
  const t = el('div', 'mv-title');
  t.append(el('span', 'mv-title-main', title));
  if (sub) t.append(el('span', 'mv-title-sub', sub));
  bar.append(t);
  return bar;
}

function noteView({ note, canTick }) {
  const box = el('div', 'mv-note');
  box.append(topBar(note.title, note.path));
  const body = el('div', 'md mv-md');
  for (const n of renderMarkdown(note.content, { doc: document })) body.append(n);
  const lines = note.content.split('\n');
  for (const check of body.querySelectorAll('input.task-check')) {
    const line = Number(check.getAttribute('data-line'));
    if (!canTick) {
      check.disabled = true;
      check.title = 'To tick tasks here, allow it in Mufka → Settings → AI clients (MCP)';
      continue;
    }
    check.addEventListener('change', async () => {
      check.disabled = true;
      try {
        show(await call('toggle_task', { path: note.path, line, expect: lines[line], done: check.checked }), { keepHistory: true });
      } catch (err) {
        check.checked = !check.checked;
        check.disabled = false;
        message(err.message);
      }
    });
  }
  box.append(body);
  if (note.backlinks && note.backlinks.length) {
    const links = el('div', 'mv-backlinks');
    links.append(el('div', 'mv-sub', `Linked from ${note.backlinks.length}`));
    for (const b of note.backlinks) {
      const a = el('button', 'mv-link', b.path.replace(/\.md$/i, '')); a.type = 'button';
      a.addEventListener('click', () => openNote(b.path));
      links.append(a);
    }
    box.append(links);
  }
  return box;
}

function boardView(title, board) {
  const box = el('div', 'mv-board');
  box.append(topBar(title), board);
  return box;
}

function show(sc, { back = false, keepHistory = false } = {}) {
  if (!sc || !sc.view) return;
  if (!back && !keepHistory && sc.view !== 'note') history.length = 0;
  current = sc;
  let view;
  if (sc.view === 'note') view = noteView(sc);
  else if (sc.view === 'projects') {
    const items = sc.projects.map((p) => ({ rel: p.path, status: p.status, done: p.done, total: p.total, start: p.start, due: p.due }));
    view = boardView(sc.status ? `Projects · ${sc.status}` : 'Projects', projectsBoard(items, { onOpen: openNote }));
  } else if (sc.view === 'jobs') {
    const items = sc.jobs.map((j) => ({ rel: j.path, company: j.company, role: j.role, status: j.status, applied: j.applied, location: j.location }));
    view = boardView(sc.status ? `Job applications · ${sc.status}` : 'Job applications', jobsBoard(items, { stages: DEFAULT_STAGES, onOpen: openNote }));
  } else return;
  root.replaceChildren(view);
}

app.ontoolresult = (params) => show(params.structuredContent);
app.onhostcontextchanged = (ctx) => setTheme({ ...app.getHostContext(), ...ctx });
setTheme(null);
app.connect().then(() => setTheme(app.getHostContext())).catch((err) => message(`Mufka view: ${err.message}`));
