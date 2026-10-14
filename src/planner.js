// Planner: the week as Mon–Sun columns. On top of each day its to-dos (no
// time); below, an hour grid with timed plans as blocks (overlaps side by
// side). A "This week" strip holds plans with no day. Plans left undone after
// their time are marked "missed" in red pencil. Narrow panes get a list.
//
// Everything that changes data goes through `api` (src/renderer.js), so this
// file only draws and handles input. Pure logic is in lib/week.mjs.
//
// Moving a plan: drag it (to another day, another time, the week strip or a
// day's to-do band), or use its ⋯ menu "Move to…", or the keyboard on a focused
// plan: ⌥←/⌥→ day, ⌥↑/⌥↓ 15 minutes, Space done, Enter edit, Delete remove.

import { weekDates, layoutDay, toMinutes, toTime, snap, span, moveTo, resizeTo, isMissed, firstHour, SNAP } from '../lib/week.mjs';
import { dayKey, weekKey, addDays, isToday, formatWeekRange } from '../lib/dates.mjs';
import { describeRecur } from '../lib/recur.mjs';
import { icon } from './icons.js';

const HOUR = 48;        // px per hour in the grid
const NARROW = 620;     // below this pane width: list layout (7 columns get too thin)

let scrollTop = null;   // keep the grid's scroll across re-renders
let drag = null;        // { p, fromKey } while dragging
let editing = null;     // id of the plan being edited inline
let resizing = false;   // true while a block's bottom edge is dragged

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WD_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

export function renderPlanner(container, weekDate, api) {
  const days = weekDates(weekDate);
  const wkey = weekKey(weekDate);
  const now = new Date();
  const root = el('div', 'planner');
  root.setAttribute('aria-label', 'Planner');

  // --- header: week title + ‹ Today › ---
  const head = el('div', 'pl-head');
  const title = el('h1', 'pl-title', isThisWeek(days, now) ? 'This week' : `Week ${wkey.split('-W')[1].replace(/^0/, '')}`);
  const sub = el('span', 'pl-range', formatWeekRange(weekDate));
  const nav = el('div', 'navgroup pl-nav');
  const prev = el('button', null, '‹'); prev.setAttribute('aria-label', 'Previous week'); prev.title = 'Previous week (⌥⌘←)';
  const today = el('button', null, 'Today'); today.title = 'This week (⌘T on the day page)';
  const next = el('button', null, '›'); next.setAttribute('aria-label', 'Next week'); next.title = 'Next week (⌥⌘→)';
  prev.addEventListener('click', () => api.goWeek(addDays(weekDate, -7)));
  next.addEventListener('click', () => api.goWeek(addDays(weekDate, 7)));
  today.addEventListener('click', () => api.goWeek(new Date()));
  today.disabled = isThisWeek(days, now);
  nav.append(prev, today, next);
  // The one obvious way to plan: title, day, time, repeat.
  const add = el('button', 'btn primary pl-new');
  add.type = 'button';
  add.title = 'New plan: pick the day, a time and whether it repeats (⇧⌘P)';
  add.append(icon('plus', { size: 15 }), el('span', null, 'New plan'));
  add.addEventListener('click', () => api.newPlan(isThisWeek(days, now) ? now : days[0]));
  head.append(title, sub, add, nav);
  root.append(head);

  // Plans with no day (older data, or moved here): shown only when there are
  // some — new plans always get a day through "New plan".
  const weekItems = api.weekItems(wkey);
  if (weekItems.length) {
    const strip = el('section', 'pl-week');
    strip.setAttribute('aria-label', 'This week, no day yet');
    strip.dataset.dropWeek = wkey;
    strip.append(el('span', 'pl-label', 'No day yet · drag to a day'));
    for (const p of weekItems) strip.append(taskRow(p, null, api, now));
    dropZone(strip, api, () => ({ scope: 'week', key: wkey }));
    root.append(strip);
  }

  const narrow = container.clientWidth > 0 && container.clientWidth < NARROW;
  root.append(narrow ? listView(days, api, now) : gridView(days, api, now));
  root.append(Object.assign(el('div', 'pl-live'), { id: 'pl-live' }));
  root.querySelector('.pl-live').setAttribute('aria-live', 'polite');
  container.append(root);

  const scroller = root.querySelector('.pl-scroll');
  if (scroller) {
    const layouts = days.map((d) => layoutDay([...api.dayItems(d).filter((p) => p.time), ...api.dayEvents(d).filter((e) => !e.allDay)]));
    scroller.scrollTop = scrollTop != null ? scrollTop : firstHour(layouts) * HOUR;
    scroller.addEventListener('scroll', () => { scrollTop = scroller.scrollTop; });
  }
  const f = editing && root.querySelector('.pl-edit-title');
  if (f) { f.focus(); f.select(); }
}

function isThisWeek(days, now) { return days.some((d) => dayKey(d) === dayKey(now)); }

// --- wide: columns with a to-do band and an hour grid ---
function gridView(days, api, now) {
  const wrap = el('div', 'pl-grid-wrap');
  const top = el('div', 'pl-grid pl-top');
  top.append(el('div', 'pl-gutter'));
  for (const [i, d] of days.entries()) top.append(dayHeader(d, i, api, now));
  top.append(el('div', 'pl-gutter pl-allday-label', 'To-do'));
  for (const d of days) {
    const key = dayKey(d);
    const band = el('div', `pl-allday${key < dayKey(now) ? ' past' : ''}${isToday(d, now) ? ' today' : ''}`);
    band.dataset.dropDay = key;
    for (const ev of api.dayEvents(d).filter((x) => x.allDay)) band.append(eventChip(ev, api));
    for (const p of api.dayItems(d).filter((x) => !x.time)) band.append(taskRow(p, key, api, now));
    band.append(addButton(`Add a to-do on ${WD_LONG[(d.getDay() + 6) % 7]}`, (t) => api.add({ scope: 'day', date: d, title: t }), '+ To-do'));
    dropZone(band, api, () => ({ scope: 'day', key, untimed: true }));
    top.append(band);
  }
  // The day headers scroll with the grid (sticky) so both share the same width
  // and the columns line up whatever the scrollbar takes.
  const scroll = el('div', 'pl-scroll');
  scroll.append(top);
  const grid = el('div', 'pl-grid pl-hours');
  const gutter = el('div', 'pl-gutter pl-times');
  for (let h = 0; h < 24; h += 1) gutter.append(el('div', 'pl-hour-label', h === 0 ? '' : `${String(h).padStart(2, '0')}:00`));
  grid.append(gutter);
  for (const d of days) grid.append(hourColumn(d, api, now));
  scroll.append(grid);
  wrap.append(scroll);
  return wrap;
}

function dayHeader(d, i, api, now) {
  const key = dayKey(d);
  const h = el('div', `pl-day-head${isToday(d, now) ? ' today' : ''}${key < dayKey(now) ? ' past' : ''}`);
  const open = el('button', 'pl-day-open');
  open.type = 'button';
  open.title = `Open ${WD_LONG[i]}: plans and daily note`;
  open.append(el('span', 'pl-wd', WD[i]), el('span', 'pl-dn', String(d.getDate())));
  open.addEventListener('click', () => api.openDay(d));
  h.append(open);
  const missed = api.dayItems(d).filter((p) => isMissed(p, key, now)).length;
  if (missed) h.append(el('span', 'pl-missed-count', `${missed} missed`));
  if (api.hasDaily(key)) {
    const n = el('button', 'pl-note-link');
    n.type = 'button';
    n.append(icon('notes', { size: 13 }), el('span', null, 'Note'));
    n.title = 'Open this day\'s note';
    n.addEventListener('click', () => api.openDay(d));
    h.append(n);
  }
  return h;
}

function hourColumn(d, api, now) {
  const key = dayKey(d);
  const col = el('div', `pl-col${isToday(d, now) ? ' today' : ''}${key < dayKey(now) ? ' past' : ''}`);
  col.dataset.dropDay = key;
  col.setAttribute('aria-label', `${WD_LONG[(d.getDay() + 6) % 7]} timed plans`);
  for (let h = 0; h < 24; h += 1) col.append(el('div', 'pl-slot'));
  if (isToday(d, now)) {
    const line = el('div', 'pl-now');
    line.style.top = `${((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR}px`;
    line.setAttribute('aria-hidden', 'true');
    col.append(line);
  }
  const timed = [...api.dayItems(d).filter((p) => p.time), ...api.dayEvents(d).filter((e) => !e.allDay)];
  for (const it of layoutDay(timed)) col.append(it.plan.kind === 'event' ? eventBlock(it, api) : block(it, key, api, now));
  // Hovering an empty hour says how to add a plan there.
  const hint = el('div', 'pl-hint');
  hint.setAttribute('aria-hidden', 'true');
  hint.hidden = true;
  col.append(hint);
  col.addEventListener('mousemove', (e) => {
    const empty = e.target === col || e.target.classList.contains('pl-slot');
    if (!empty || drag) { hint.hidden = true; return; }
    const min = snap(minutesAt(col, e.clientY) - 15, 30);
    hint.style.top = `${(min / 60) * HOUR}px`;
    hint.textContent = `Double-click to add at ${toTime(min)}`;
    hint.hidden = false;
  });
  col.addEventListener('mouseleave', () => { hint.hidden = true; });
  // Double-click an empty hour to add a plan there.
  col.addEventListener('dblclick', (e) => {
    if (e.target !== col && !e.target.classList.contains('pl-slot')) return;
    const min = snap(minutesAt(col, e.clientY) - 15, 30);
    api.newPlan(d, { time: toTime(min), endTime: toTime(min + 60) });
  });
  dropZone(col, api, (e) => ({ scope: 'day', key, at: minutesAt(col, e.clientY) }));
  return col;
}

// A calendar event (read-only): in the calendar's colour, opens its details.
function eventBlock(it, api) {
  const ev = it.plan;
  const b = el('div', `pl-block pl-event${ev.free ? ' free' : ''}`);
  b.style.setProperty('--ev', ev.color);
  b.style.top = `${(it.start / 60) * HOUR}px`;
  b.style.height = `${Math.max(18, ((it.end - it.start) / 60) * HOUR - 2)}px`;
  b.style.left = `calc(${(it.lane / it.lanes) * 100}% + 2px)`;
  b.style.width = `calc(${100 / it.lanes}% - 4px)`;
  b.tabIndex = 0;
  b.setAttribute('role', 'button');
  const end = ev.endTime === '24:00' ? '00:00' : ev.endTime;
  b.setAttribute('aria-label', `${ev.title}, ${ev.time}–${end}, ${ev.calendar || 'calendar'}${ev.joinUrl ? ', online meeting' : ''}`);
  b.title = `${ev.title} · ${ev.calendar || 'Calendar'}`;
  const body = el('div', 'pl-block-body');
  body.append(el('span', 'pl-block-title', ev.title), el('span', 'pl-block-time', `${ev.time}–${end}`));
  if (it.end - it.start < 45) b.classList.add('short');
  b.append(body);
  const open = (e) => { e.stopPropagation(); api.openEvent(ev); };
  b.addEventListener('click', open);
  b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); } });
  return b;
}

// An all-day calendar event in a day's top band.
function eventChip(ev, api) {
  const c = el('button', 'pl-event-chip');
  c.type = 'button';
  c.style.setProperty('--ev', ev.color);
  c.textContent = ev.title;
  c.title = `${ev.title} · all day · ${ev.calendar || 'Calendar'}`;
  c.addEventListener('click', (e) => { e.stopPropagation(); api.openEvent(ev); });
  return c;
}

function minutesAt(col, clientY) {
  const r = col.getBoundingClientRect();
  return Math.max(0, Math.min(24 * 60 - SNAP, ((clientY - r.top) / HOUR) * 60));
}

function block(it, key, api, now) {
  const p = it.plan;
  const b = el('div', `pl-block${p.done ? ' done' : ''}${isMissed(p, key, now) ? ' missed' : ''}${p.recur ? ' recurring' : ''}`);
  b.style.top = `${(it.start / 60) * HOUR}px`;
  b.style.height = `${Math.max(18, ((it.end - it.start) / 60) * HOUR - 2)}px`;
  b.style.left = `calc(${(it.lane / it.lanes) * 100}% + 2px)`;
  b.style.width = `calc(${100 / it.lanes}% - 4px)`;
  b.tabIndex = 0;
  b.dataset.id = p.id;
  b.setAttribute('role', 'button');
  b.setAttribute('aria-label', `${p.title}, ${p.time}${p.endTime ? `–${p.endTime}` : ''}${p.recur ? `, repeats ${describeRecur(p.recur).toLowerCase()}` : ''}${p.done ? ', done' : ''}${isMissed(p, key, now) ? ', missed' : ''}`);
  if (p.recur) b.title = `Repeats: ${describeRecur(p.recur)}`;
  const check = el('input', 'pl-check');
  check.type = 'checkbox'; check.checked = Boolean(p.done); check.tabIndex = -1;
  check.setAttribute('aria-label', 'Done');
  check.addEventListener('change', () => api.toggle(p));
  const body = el('div', 'pl-block-body');
  const tl = el('span', 'pl-block-time');
  if (p.recur) tl.append(icon('repeat', { size: 11 }));
  tl.append(document.createTextNode(`${p.time}${p.endTime ? `–${p.endTime}` : ''}${isMissed(p, key, now) ? ' · missed' : ''}`));
  // Title first: in a short block it is what must stay readable.
  body.append(el('span', 'pl-block-title', p.title), tl);
  if (it.end - it.start < 45) b.classList.add('short');
  b.append(check, body);
  b.append(menuButton(p, key, api));
  wireItem(b, p, key, api);
  if (!p._occ) {
    const grip = el('div', 'pl-resize');
    grip.setAttribute('aria-hidden', 'true');
    grip.title = 'Drag to change the end time';
    grip.addEventListener('pointerdown', (e) => startResize(e, b, p, api));
    b.append(grip);
  }
  b.addEventListener('dblclick', (e) => { e.stopPropagation(); api.edit(p); });
  return b;
}

function startResize(e, b, p, api) {
  e.preventDefault(); e.stopPropagation();
  resizing = true; // a draggable block must not start a move drag now
  const s = span(p);
  // How far the edge moved, not where the pointer is: grabbing it does not jump.
  const y0 = e.clientY;
  const endAt = (ev) => Math.max(s.start + SNAP, snap(s.end + ((ev.clientY - y0) / HOUR) * 60));
  const move = (ev) => { b.style.height = `${((endAt(ev) - s.start) / 60) * HOUR - 2}px`; };
  const up = (ev) => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
    resizing = false;
    const t = resizeTo(p, endAt(ev));
    if (t.endTime !== p.endTime) api.update(p, t, `${p.title} now ends ${t.endTime}`);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

// A to-do row (day band or week strip).
function taskRow(p, key, api, now) {
  const missed = key ? isMissed(p, key, now) : false;
  const r = el('div', `pl-task${p.done ? ' done' : ''}${missed ? ' missed' : ''}${p.recur ? ' recurring' : ''}`);
  if (p.recur) r.title = `Repeats: ${describeRecur(p.recur)}`;
  r.tabIndex = 0;
  r.dataset.id = p.id;
  const check = el('input', 'pl-check');
  check.type = 'checkbox'; check.checked = Boolean(p.done); check.tabIndex = -1;
  check.setAttribute('aria-label', `Done: ${p.title}`);
  check.addEventListener('change', () => api.toggle(p));
  if (editing === p.id) {
    const f = el('input', 'pl-edit-title');
    f.value = p.title; f.setAttribute('aria-label', 'Title');
    const done = (save) => { editing = null; if (save && f.value.trim() && f.value.trim() !== p.title) api.update(p, { title: f.value.trim() }); else api.refresh(); };
    f.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } if (e.key === 'Escape') { e.preventDefault(); done(false); } e.stopPropagation(); });
    f.addEventListener('blur', () => done(true));
    r.append(check, f);
    return r;
  }
  const body = el('div', 'pl-task-body');
  const t = el('span', 'pl-task-title', p.title);
  t.title = 'Double-click to rename';
  t.addEventListener('dblclick', () => { editing = p.id; api.refresh(); });
  if (p.recur) { const rt = el('span', 'pl-repeat'); rt.append(icon('repeat', { size: 11 }), el('span', null, describeRecur(p.recur))); body.append(t, rt); } else body.append(t);
  // Missed: the title turns red pencil and a small line under it says so,
  // with a one-click way to bring it to today.
  if (missed) {
    const meta = el('div', 'pl-missed-line');
    meta.append(el('span', 'pl-missed-tag', 'missed'));
    const mv = el('button', 'pl-today-btn', '→ Today');
    mv.type = 'button'; mv.title = 'Move to today';
    mv.addEventListener('click', (e) => { e.stopPropagation(); api.update(p, { scope: 'day', key: dayKey(now) }, `${p.title} moved to today`); });
    meta.append(mv);
    body.append(meta);
  }
  r.append(check, body);
  r.append(menuButton(p, key, api));
  wireItem(r, p, key, api);
  return r;
}

function menuButton(p, key, api) {
  const m = el('button', 'menu-btn pl-menu');
  m.type = 'button';
  m.setAttribute('aria-label', 'Options');
  m.setAttribute('aria-haspopup', 'menu');
  m.dataset.menuAnchor = `pl-${p.id}-${key || 'week'}`;
  m.append(icon('more', { size: 14 }));
  m.addEventListener('click', (e) => { e.stopPropagation(); api.menu(m.dataset.menuAnchor, p, key); });
  return m;
}

// Drag (mouse) and keyboard moves for a plan element.
function wireItem(node, p, key, api) {
  if (!p._occ) {
    node.draggable = true;
    node.addEventListener('dragstart', (e) => {
      if (resizing) { e.preventDefault(); return; }
      drag = { p, fromKey: key };
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', p.title); } catch { /* ignore */ }
      node.classList.add('dragging');
    });
    node.addEventListener('dragend', () => { drag = null; node.classList.remove('dragging'); document.querySelectorAll('.pl-drop').forEach((z) => z.classList.remove('pl-drop')); });
  }
  node.addEventListener('keydown', (e) => {
    if (e.target !== node) return;
    if (e.key === ' ') { e.preventDefault(); api.toggle(p); return; }
    if (e.key === 'Enter') { e.preventDefault(); if (p.time) api.edit(p); else { editing = p.id; api.refresh(); } return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); api.remove(p); return; }
    if (!e.altKey || p._occ) return;
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && key) {
      e.preventDefault();
      const to = dayKey(addDays(new Date(`${key}T12:00:00`), e.key === 'ArrowLeft' ? -1 : 1));
      api.update(p, { scope: 'day', key: to }, `${p.title} moved to ${to}`, true);
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && p.time) {
      e.preventDefault();
      const s = span(p);
      const t = moveTo(p, s.start + (e.key === 'ArrowUp' ? -SNAP : SNAP));
      api.update(p, t, `${p.title} at ${t.time}`, true);
    }
  });
}

// A drop target: target(e) says where the plan goes.
function dropZone(zone, api, target) {
  zone.addEventListener('dragover', (e) => { if (!drag) return; e.preventDefault(); zone.classList.add('pl-drop'); });
  zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('pl-drop'); });
  zone.addEventListener('drop', (e) => {
    if (!drag) return;
    e.preventDefault(); e.stopPropagation();
    zone.classList.remove('pl-drop');
    const { p } = drag; drag = null;
    const t = target(e);
    if (t.scope === 'week') { api.update(p, { scope: 'week', key: t.key, time: '', endTime: '' }, `${p.title} moved to this week`); return; }
    if (t.untimed) { api.update(p, { scope: 'day', key: t.key, time: '', endTime: '' }, `${p.title} moved to ${t.key}`); return; }
    const times = p.time ? moveTo(p, t.at) : { time: toTime(snap(t.at, 30)), endTime: toTime(snap(t.at, 30) + 60) };
    api.update(p, { scope: 'day', key: t.key, ...times }, `${p.title} moved to ${t.key} ${times.time}`);
  });
}

function addButton(label, onAdd, placeholder = '+ Add') {
  const wrap = el('div', 'pl-add');
  const f = el('input', 'pl-add-field');
  f.type = 'text'; f.placeholder = placeholder; f.setAttribute('aria-label', label);
  f.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && f.value.trim()) { e.preventDefault(); const t = f.value.trim(); f.value = ''; onAdd(t); }
    if (e.key === 'Escape') { f.value = ''; f.blur(); }
  });
  wrap.append(f);
  return wrap;
}

// --- narrow: days stacked as a list ---
function listView(days, api, now) {
  const list = el('div', 'pl-list');
  for (const [i, d] of days.entries()) {
    const key = dayKey(d);
    const sec = el('section', `pl-list-day${isToday(d, now) ? ' today' : ''}${key < dayKey(now) ? ' past' : ''}`);
    sec.dataset.dropDay = key;
    sec.append(dayHeader(d, i, api, now));
    const items = api.dayItems(d);
    for (const ev of api.dayEvents(d)) {
      const c = eventChip(ev, api);
      if (ev.time) c.prepend(el('span', 'pl-list-time', `${ev.time}–${ev.endTime === '24:00' ? '00:00' : ev.endTime} `));
      sec.append(c);
    }
    for (const p of items.filter((x) => x.time)) {
      const r = taskRow(p, key, api, now);
      r.querySelector('.pl-task-body')?.prepend(el('span', 'pl-list-time', `${p.time}${p.endTime ? `–${p.endTime}` : ''}`));
      sec.append(r);
    }
    for (const p of items.filter((x) => !x.time)) sec.append(taskRow(p, key, api, now));
    sec.append(addButton(`Add a to-do on ${WD_LONG[i]}`, (t) => api.add({ scope: 'day', date: d, title: t }), '+ To-do'));
    dropZone(sec, api, () => ({ scope: 'day', key, untimed: true }));
    list.append(sec);
  }
  return list;
}

export function plannerFocus(id) {
  const n = document.querySelector(`.planner [data-id="${CSS.escape(id)}"]`);
  if (n) n.focus();
}
export function announce(text) {
  const l = document.getElementById('pl-live');
  if (l) l.textContent = text;
}
