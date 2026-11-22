// Movies (lib/movies.mjs): the head of a movie's note (its poster beside the
// title, the row it is in, director, year, genre, when and where it was
// watched, stars), the ```movies watchlist (a wall of posters per status), and
// the New movie dialog.
import { MOVIE_STAGES, STOPPED } from '../lib/movies.mjs';
import { stageSteps, factsRow } from './jobs-view.js';
import { stars } from './books-view.js';
import { el } from './dom.js';

const stageClass = (s) => (s === 'Watched' ? 'job-s-offer' : s === STOPPED ? 'job-s-2' : 'job-s-0');
const shortDate = (key) => (key ? new Date(`${key.slice(0, 10)}T12:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

// A colour of its own for a movie without an image, from its title.
const HUES = [30, 200, 8, 110, 340, 260, 175, 45];
function hueOf(title) {
  let h = 0;
  for (const ch of String(title)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

// The poster: the image when there is one, else a plain poster with the title
// and year. onPoster(): add or change the image.
export function moviePoster(movie, url, { big = false, onPoster } = {}) {
  const c = el('div', `movie-poster${big ? ' big' : ''}${url ? ' has-image' : ''}`);
  if (url) {
    const img = el('img');
    img.src = url; img.alt = `Poster of ${movie.title}`; img.draggable = false;
    c.append(img);
  } else {
    c.style.setProperty('--h', String(hueOf(movie.title)));
    const long = movie.title.length > 16 || movie.title.split(/\s+/).some((w) => w.length > 9);
    c.append(el('span', `movie-poster-title${long ? ' long' : ''}`, movie.title));
    if (movie.year) c.append(el('span', 'movie-poster-year', movie.year));
  }
  if (onPoster) {
    const b = el('button', 'book-cover-btn', url ? 'Change poster' : 'Add poster');
    b.type = 'button';
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onPoster(); });
    c.append(b);
  }
  return c;
}

// The head of a movie's note: the poster, then the title (`titleEl`, the
// note's own) with the steps and the facts. onStage(stage), onRate(n), onPoster().
export function movieHead(movie, url, titleEl, { onStage, onRate, onPoster }) {
  const head = el('div', 'book-head movie-head');
  head.append(moviePoster(movie, url, { big: true, onPoster }));
  const side = el('div', 'book-head-side');
  const strip = el('div', 'job-strip book-strip');
  strip.append(stageSteps({ stages: MOVIE_STAGES, aside: STOPPED, current: movie.status, classOf: stageClass, onStage }));
  strip.append(factsRow([['Director', movie.director], ['Year', movie.year], ['Genre', movie.genre]]));
  const rate = el('span', 'job-fact book-fact-rating');
  rate.append(el('span', 'job-fact-label', 'Rating'), stars(movie.rating, onRate));
  strip.append(factsRow([['Watched', shortDate(movie.watched)], ['Where', movie.where]], [rate]));
  side.append(titleEl, strip);
  head.append(side);
  return head;
}

// The watchlist. urlOf(movie) → its poster's address or ''; onOpen(rel),
// onMove(rel, stage), onPoster(movie), onNew().
const SHOWN = 10; // a long row shows this many until "Show all"
const opened = new Set(); // rows shown in full, by stage
export function watchlist(rows, stats, { urlOf, onOpen, onMove, onPoster, onNew }) {
  const box = el('div', 'bookcase watchlist');
  const head = el('div', 'job-head');
  const row = el('div', 'job-stats');
  const avg = stats.average ? `${stats.average.toFixed(1)} ★` : '—';
  for (const [label, value] of [['To watch', stats.toWatch], ['Watched this year', stats.watchedThisYear], ['Average rating', avg]]) {
    const x = el('div', 'job-stat');
    x.append(el('div', 'job-stat-value', String(value)), el('div', 'job-stat-label', label));
    row.append(x);
  }
  head.append(row);
  const add = el('button', 'btn primary job-new', '+ New movie'); add.type = 'button';
  add.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onNew(); });
  head.append(add);
  box.append(head);

  const all = rows.flatMap((r) => r.items);
  for (const r of rows) {
    const sec = el('section', `book-shelf movie-row ${stageClass(r.stage)}`);
    sec.dataset.stage = r.stage;
    const h = el('div', 'book-shelf-head');
    h.append(el('span', 'job-step-dot'), el('span', 'book-shelf-name', r.stage), el('span', 'book-shelf-count', String(r.items.length)));
    const full = opened.has(r.stage);
    if (r.items.length > SHOWN) {
      const more = el('button', 'book-shelf-more', full ? 'Show fewer' : `Show all ${r.items.length}`); more.type = 'button';
      more.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (full) opened.delete(r.stage); else opened.add(r.stage);
        sec.replaceWith(watchlist(rows, stats, { urlOf, onOpen, onMove, onPoster, onNew }).querySelector(`.movie-row[data-stage="${CSS.escape(r.stage)}"]`));
      });
      h.append(more);
    }
    sec.append(h);
    const wall = el('div', 'movie-wall');
    for (const m of full ? r.items : r.items.slice(0, SHOWN)) {
      const item = el('div', 'book-item movie-item');
      item.draggable = true;
      item.dataset.rel = m.rel;
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', `${m.title}${m.year ? ` (${m.year})` : ''}, ${r.stage}`);
      item.append(moviePoster(m, urlOf(m), { onPoster: () => onPoster(m) }));
      const cap = el('div', 'book-caption');
      cap.append(el('b', null, m.title));
      if (r.stage === 'Watched' && m.rating) cap.append(stars(m.rating));
      else if (m.director) cap.append(el('span', null, m.director));
      else if (m.year) cap.append(el('span', null, m.year));
      item.append(cap);
      item.addEventListener('click', (e) => { e.preventDefault(); onOpen(m.rel); });
      item.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onOpen(m.rel); } });
      item.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-mufka-movie', m.rel); e.dataTransfer.effectAllowed = 'move'; item.classList.add('dragging'); });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
      wall.append(item);
    }
    if (!r.items.length) wall.append(el('div', 'book-shelf-empty', 'No movies here yet'));
    sec.append(wall);
    sec.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-mufka-movie')) { e.preventDefault(); sec.classList.add('drop'); } });
    sec.addEventListener('dragleave', (e) => { if (!sec.contains(e.relatedTarget)) sec.classList.remove('drop'); });
    sec.addEventListener('drop', (e) => {
      const rel = e.dataTransfer.getData('text/x-mufka-movie');
      sec.classList.remove('drop');
      if (!rel) return;
      e.preventDefault(); e.stopPropagation();
      const m = all.find((x) => x.rel === rel);
      if (m && m.status !== r.stage) onMove(rel, r.stage);
    });
    box.append(sec);
  }
  if (!all.length) box.append(el('p', 'bud-empty', 'No movies yet. Add one with "+ New movie": each movie is a note of its own.'));
  box.append(el('p', 'book-hint', 'Drag a poster to the other row to mark it watched; the day is filled in. A poster is any image: on a movie, "Add poster" picks one.'));
  return box;
}

// The New movie dialog. poster: { pick(), paste(), files(paths) } each →
// Promise<{ name, url } | null>, an image put in the attachments;
// onSave({ title, director, year, stage, image }).
export function openMovieDialog({ poster, pathOf }, onSave) {
  const layer = el('div', 'palette-layer');
  const box = el('div', 'palette plan-dialog bud-dialog book-dialog');
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'New movie');
  box.append(el('div', 'plan-dialog-title', 'New movie'));
  let image = null; // { name, url }
  const grid = el('div', 'book-dialog-grid');
  const slot = el('button', 'book-dialog-cover'); slot.type = 'button';
  slot.setAttribute('aria-label', 'Add a poster');
  const drawSlot = () => {
    slot.replaceChildren();
    if (image) {
      const img = el('img'); img.src = image.url; img.alt = 'Poster';
      slot.append(img);
      slot.classList.add('has-image');
    } else {
      slot.classList.remove('has-image');
      slot.append(el('span', 'book-dialog-plus', '+'), el('span', null, 'Add a poster'), el('small', null, 'Drop an image, paste one, or click to pick a file'));
    }
  };
  const take = (res) => { if (res && res.url) { image = res; drawSlot(); } };
  slot.addEventListener('click', async () => take(await poster.pick()));
  slot.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); slot.classList.add('drop'); } });
  slot.addEventListener('dragleave', () => slot.classList.remove('drop'));
  slot.addEventListener('drop', async (e) => {
    slot.classList.remove('drop');
    const files = [...e.dataTransfer.files].map(pathOf).filter(Boolean);
    if (!files.length) return;
    e.preventDefault();
    take(await poster.files(files));
  });
  drawSlot();
  const fields = el('div', 'book-dialog-fields');
  const field = (label, input, id) => { input.id = id; const f = el('div', 'bud-field'); const l = el('label', '', label); l.htmlFor = id; f.append(l, input); return f; };
  const title = Object.assign(el('input', 'ask-input movie-title-input'), { placeholder: 'Title' });
  const director = Object.assign(el('input', 'ask-input movie-director-input'), { placeholder: 'Director' });
  const year = Object.assign(el('input', 'ask-input movie-year-input'), { placeholder: 'Year', inputMode: 'numeric' });
  let stage = MOVIE_STAGES[0];
  const steps = el('div', 'book-dialog-stages');
  const drawSteps = () => steps.replaceChildren(stageSteps({ stages: MOVIE_STAGES, current: stage, classOf: stageClass, onStage: (s) => { stage = s; drawSteps(); } }));
  drawSteps();
  const listField = el('div', 'bud-field'); listField.append(el('label', '', 'List'), steps);
  const pair = el('div', 'movie-dialog-pair');
  pair.append(field('Director', director, 'movie-f2'), field('Year', year, 'movie-f3'));
  fields.append(field('Title', title, 'movie-f1'), pair, listField);
  grid.append(slot, fields);
  box.append(grid);
  const restore = document.activeElement;
  const close = () => { layer.remove(); if (restore && restore.isConnected) restore.focus(); };
  const save = () => {
    if (!title.value.trim()) { title.focus(); return; }
    close();
    onSave({ title: title.value.trim(), director: director.value.trim(), year: year.value.trim(), stage, image: image ? image.name : '' });
  };
  const actions = el('div', 'plan-dialog-actions');
  actions.append(el('span', 'bud-keys', '↵ add · esc cancel'));
  const cancel = el('button', 'btn quiet', 'Cancel'); cancel.type = 'button'; cancel.addEventListener('click', close);
  const ok = el('button', 'btn primary', 'Add movie'); ok.type = 'button'; ok.addEventListener('click', save);
  actions.append(cancel, ok);
  box.append(actions);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  // ⌘V with an image on the clipboard: the poster (text still pastes into the fields).
  box.addEventListener('paste', async (e) => {
    if (![...(e.clipboardData?.items || [])].some((i) => i.type.startsWith('image/'))) return;
    e.preventDefault();
    take(await poster.paste());
  });
  layer.append(box);
  layer.addEventListener('mousedown', (e) => { if (e.target === layer) close(); });
  document.body.append(layer);
  title.focus();
}
