// A ```tasks block (lib/tasks-query.mjs): the vault's tasks that pass the
// query, grouped, each with its box, dates and the note it is in.
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const PRIORITY_EMOJI = { highest: '🔺', high: '⏫', medium: '🔼', low: '🔽', lowest: '⏬' };
const asDate = (k) => new Date(`${k}T12:00`);
const shortDay = (k) => asDate(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function dayLabel(k, today) {
  const d = asDate(k);
  const t = asDate(today);
  const days = Math.round((d - t) / 86400000);
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  if (d.getFullYear() !== t.getFullYear()) opts.year = 'numeric';
  const text = d.toLocaleDateString(undefined, opts);
  return days === 0 ? `Today · ${text}` : days === 1 ? `Tomorrow · ${text}` : text;
}

// res: runTasksQuery's result; src: the query. o: { md(text) → nodes,
// onToggle(task, done), onOpen(rel), today }
export function tasksBlock(res, src, o) {
  const box = el('div', 'tq');
  // A press here is for the list, not for editing the note's text.
  box.addEventListener('mousedown', (e) => { if (e.target.closest('.tq-task, .tq-src')) e.stopPropagation(); });
  if (res.error) {
    box.classList.add('tq-has-error');
    box.append(el('div', 'tq-error', `Tasks: ${res.error}. Mufka reads filters on status, dates, priority, tags, path, heading and description, and sort by, group by and limit.`));
    return box;
  }
  const hide = res.hide;
  const head = el('div', 'tq-head');
  head.append(el('b', null, 'Tasks'));
  if (!hide.has('task count')) head.append(el('span', null, `· ${res.total} ${res.total === 1 ? 'task' : 'tasks'}`));
  head.append(el('span', 'tq-gap'));
  const summary = String(src || '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !/^(hide|show|explain|short|full)/i.test(l)).join(' · ');
  if (summary) { const q = el('span', 'tq-query', summary); q.title = src; head.append(q); }
  box.append(head);
  if (!res.shown) { box.append(el('p', 'tq-empty', 'No tasks match.')); return box; }

  for (const g of res.groups) {
    if (g.label != null) {
      const label = g.date === 'overdue' ? 'Overdue' : g.date ? dayLabel(g.date, res.today) : g.label;
      const h = el('div', `tq-group${g.date === 'overdue' ? ' late' : ''}`);
      h.append(el('span', null, label), el('span', 'tq-group-count', String(g.tasks.length)));
      box.append(h);
    }
    const list = el('ul', 'tq-list');
    for (const t of g.tasks) {
      const done = t.statusType === 'DONE' || t.statusType === 'CANCELLED';
      const li = el('li', `tq-task${done ? ' done' : ''}${t.statusType === 'CANCELLED' ? ' cancelled' : ''}`);
      li.dataset.rel = t.rel; li.dataset.line = String(t.line);
      const check = el('input', 'tq-check');
      check.type = 'checkbox'; check.checked = done;
      check.setAttribute('aria-label', `Done: ${t.description}`);
      check.addEventListener('change', () => o.onToggle(t, check.checked));
      const body = el('div', 'tq-body');
      const text = el('span', 'tq-text');
      text.append(...o.md(t.description || ' '));
      if (t.priority !== 'none' && !hide.has('priority')) text.append(document.createTextNode(` ${PRIORITY_EMOJI[t.priority]}`));
      body.append(text);
      const meta = el('div', 'tq-meta');
      const chip = (cls, s) => meta.append(el('span', `tq-chip${cls ? ` ${cls}` : ''}`, s));
      if (t.due && !hide.has('due date')) chip(!done && t.due < res.today ? 'late' : !done && t.due === res.today ? 'today' : '', `📅 ${t.due === res.today ? 'Today' : shortDay(t.due)}`);
      if (t.scheduled && !hide.has('scheduled date')) chip('', `⏳ ${shortDay(t.scheduled)}`);
      if (t.start && !hide.has('start date')) chip('', `🛫 ${shortDay(t.start)}`);
      if (t.recurrence && !hide.has('recurrence rule')) chip('', `🔁 ${t.recurrence}`);
      if (t.done && !hide.has('done date')) chip('', `✅ ${shortDay(t.done)}`);
      if (t.cancelled && !hide.has('cancelled date')) chip('', `❌ ${shortDay(t.cancelled)}`);
      if (meta.childNodes.length) body.append(meta);
      li.append(check, body);
      if (!hide.has('backlink') && !hide.has('backlinks')) {
        const src2 = el('button', 'tq-src', t.heading ? `${t.filename.replace(/\.md$/i, '')} › ${t.heading}` : t.filename.replace(/\.md$/i, ''));
        src2.type = 'button'; src2.title = `Open ${t.rel}`;
        src2.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); o.onOpen(t.rel, e); });
        li.append(src2);
      }
      list.append(li);
    }
    box.append(list);
  }
  if (res.shown < res.total) box.append(el('div', 'tq-foot', `${res.shown} of ${res.total} tasks`));
  return box;
}
