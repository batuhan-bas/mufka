// The ```week block of a weekly to-do note (lib/weekly.mjs): the week as
// seven columns; tick a task, click its words to change them, drag it to
// another day, add one with "+ Add", move what is left to the next day.
import { weekSummary } from '../lib/weekly.mjs';
import { periodNav } from './budget-view.js';

const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

// monday: the Date the week starts (for the dates under the day names), or null.
// today: Mon = 0 … Sun = 6, or -1. on: { toggle(line), add(day, text),
// edit(line, text), move(line, day), carry(day), text() } — text() shows the
// note's days as plain text under the board (showText: they are shown).
export function weekBoard(src, { monday = null, today = -1, nav = null, showText = false, on }) {
  const sum = weekSummary(src);
  const box = el('div', 'wk-box');
  const head = el('div', 'wk-head');
  if (nav) head.append(periodNav(nav));
  const progress = el('div', 'wk-progress');
  const line = el('span', 'wk-count');
  line.append(el('b', '', `${sum.done} of ${sum.total}`), document.createTextNode(' done'));
  const bar = el('span', 'bud-cat-track wk-bar'); const fill = el('i');
  fill.style.width = `${sum.total ? (sum.done / sum.total) * 100 : 0}%`;
  bar.append(fill);
  progress.append(line, bar);
  const asText = el('button', 'wk-as-text', showText ? 'Hide the text' : 'Show as text'); asText.type = 'button';
  asText.setAttribute('aria-pressed', String(showText));
  asText.addEventListener('click', (e) => { stop(e); on.text(); });
  progress.append(asText);
  head.append(progress);
  box.append(head);

  const grid = el('div', 'wk-grid');
  const days = sum.days.slice().sort((a, b) => a.day - b.day);
  for (const d of days) {
    const col = el('div', `wk-day${d.day === today ? ' today' : ''}${today >= 0 && d.day < today ? ' past' : ''}`);
    col.dataset.day = String(d.day);
    const h = el('div', 'wk-day-head');
    const name = el('div', 'wk-day-name', NAMES[d.day]);
    if (monday) {
      const date = new Date(monday); date.setDate(monday.getDate() + d.day);
      name.append(el('span', 'wk-day-date', date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })));
    }
    h.append(name);
    const open = d.tasks.filter((t) => !t.done).length;
    if (d.tasks.length) h.append(el('span', 'wk-day-count', `${d.tasks.length - open}/${d.tasks.length}`));
    col.append(h);
    const list = el('div', 'wk-tasks');
    for (const t of d.tasks) {
      const row = el('div', `wk-task${t.done ? ' done' : ''}`);
      row.draggable = true;
      row.dataset.line = String(t.line);
      const box2 = el('button', 'wk-check'); box2.type = 'button';
      box2.setAttribute('role', 'checkbox'); box2.setAttribute('aria-checked', String(t.done));
      box2.setAttribute('aria-label', t.text || 'Task');
      box2.addEventListener('click', (e) => { stop(e); on.toggle(t.line); });
      const words = el('button', 'wk-text', t.text || ' '); words.type = 'button';
      words.title = 'Click to change; drag to another day';
      words.addEventListener('click', (e) => {
        stop(e);
        const input = el('input', 'wk-edit'); input.value = t.text;
        input.setAttribute('aria-label', 'Task');
        let done = false;
        const finish = (save) => {
          if (done) return;
          done = true;
          if (save && input.value.trim() !== t.text) { on.edit(t.line, input.value); return; }
          words.hidden = false; input.remove();
        };
        input.addEventListener('keydown', (k) => { if (k.key === 'Enter') { k.preventDefault(); finish(true); } if (k.key === 'Escape') { k.preventDefault(); k.stopPropagation(); finish(false); } });
        input.addEventListener('blur', () => finish(true));
        input.addEventListener('mousedown', (m) => m.stopPropagation());
        words.hidden = true;
        row.append(input);
        input.focus(); input.select();
      });
      row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-mufka-task', String(t.line)); e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.append(box2, words);
      list.append(row);
    }
    col.append(list);
    const add = el('button', 'wk-add', '+ Add'); add.type = 'button';
    add.addEventListener('click', (e) => {
      stop(e);
      const input = el('input', 'wk-edit wk-new'); input.placeholder = 'A task'; input.setAttribute('aria-label', `New task for ${NAMES[d.day]}`);
      const keep = () => { const v = input.value; input.value = ''; return v; };
      let closed = false;
      const close = () => { if (closed) return; closed = true; if (input.isConnected) input.replaceWith(add); };
      input.addEventListener('keydown', (k) => {
        if (k.key === 'Enter') { k.preventDefault(); const v = keep(); if (v.trim()) on.add(d.day, v, true); }
        if (k.key === 'Escape') { k.preventDefault(); k.stopPropagation(); close(); }
      });
      input.addEventListener('blur', () => { if (closed) return; const v = keep(); if (v.trim()) { closed = true; on.add(d.day, v, false); } else close(); });
      input.addEventListener('mousedown', (m) => m.stopPropagation());
      add.replaceWith(input);
      input.focus();
    });
    col.append(add);
    const later = days.find((x) => x.day > d.day);
    if (open && later) {
      const carry = el('button', 'wk-carry', `Move ${open} to ${NAMES[later.day].slice(0, 3)} →`); carry.type = 'button';
      carry.title = `Move the ${open} open ${open === 1 ? 'task' : 'tasks'} to ${NAMES[later.day]}`;
      carry.addEventListener('click', (e) => { stop(e); on.carry(d.day); });
      col.append(carry);
    }
    col.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-mufka-task')) { e.preventDefault(); col.classList.add('drop'); } });
    col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('drop'); });
    col.addEventListener('drop', (e) => {
      const lineNo = e.dataTransfer.getData('text/x-mufka-task');
      col.classList.remove('drop');
      if (lineNo === '') return;
      stop(e);
      if (!d.tasks.some((t) => String(t.line) === lineNo)) on.move(Number(lineNo), d.day);
    });
    grid.append(col);
  }
  box.append(grid);
  if (!days.length) box.append(el('p', 'bud-empty', 'Add headings for the days (## Monday, ## Tuesday…) and tasks under them.'));
  return box;
}

// Focus the "new task" field of a day again after the board was drawn anew.
export function focusNewTask(container, day) {
  const col = container.querySelector(`.wk-day[data-day="${day}"]`);
  const add = col && col.querySelector('.wk-add');
  if (add) add.click();
}
