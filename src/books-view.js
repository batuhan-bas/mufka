// Books (lib/books.mjs): the head of a book's note (its cover beside the title,
// the shelf it is on, author, dates, stars), the ```books bookcase (a shelf per
// status, books standing with their covers), and the New book dialog.
import { BOOK_STAGES, STOPPED } from '../lib/books.mjs';
import { stageSteps, factsRow } from './jobs-view.js';
import { el } from './dom.js';

const stageClass = (s) => (s === 'Finished' ? 'job-s-offer' : s === STOPPED ? 'job-s-2' : s === 'Reading' ? 'job-s-1' : 'job-s-0');
const shortDate = (key) => (key ? new Date(`${key.slice(0, 10)}T12:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

// A colour of its own for a book without an image, from its title.
const HUES = [18, 160, 210, 268, 340, 42, 120, 190];
function hueOf(title) {
  let h = 0;
  for (const ch of String(title)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

// The cover: the image when there is one, else a plain cover with the title
// and author. onCover(): add or change the image.
export function bookCover(book, url, { big = false, onCover } = {}) {
  const c = el('div', `book-cover${big ? ' big' : ''}${url ? ' has-image' : ''}`);
  if (url) {
    const img = el('img');
    img.src = url; img.alt = `Cover of ${book.title}`; img.draggable = false;
    c.append(img);
  } else {
    c.style.setProperty('--h', String(hueOf(book.title)));
    // A long title, or a long word in it, in smaller type so words stay whole.
    const long = book.title.length > 18 || book.title.split(/\s+/).some((w) => w.length > 9);
    c.append(el('span', `book-cover-title${long ? ' long' : ''}`, book.title), el('span', 'book-cover-author', book.author));
  }
  if (onCover) {
    const b = el('button', 'book-cover-btn', url ? 'Change cover' : 'Add cover');
    b.type = 'button';
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onCover(); });
    c.append(b);
  }
  return c;
}

// Stars to read; with onRate(n) they can be clicked (the same star again
// clears the rating).
export function stars(rating, onRate) {
  const box = el('span', `book-stars${onRate ? ' can-rate' : ''}`);
  box.setAttribute('aria-label', rating ? `${rating} of 5 stars` : 'Not rated');
  for (let i = 1; i <= 5; i += 1) {
    const s = el(onRate ? 'button' : 'span', `book-star${i <= rating ? ' on' : ''}`, '★');
    if (onRate) {
      s.type = 'button'; s.title = `${i} ${i === 1 ? 'star' : 'stars'}`;
      s.setAttribute('aria-label', `Rate ${i} of 5`);
      s.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onRate(i === rating ? 0 : i); });
    }
    box.append(s);
  }
  return box;
}

// The head of a book's note: the cover, then the title (`titleEl`, the note's
// own) with the shelf steps and the facts. onStage(stage), onRate(n), onCover().
export function bookHead(book, url, titleEl, { onStage, onRate, onCover }) {
  const head = el('div', 'book-head');
  head.append(bookCover(book, url, { big: true, onCover }));
  const side = el('div', 'book-head-side');
  const strip = el('div', 'job-strip book-strip');
  strip.append(stageSteps({ stages: BOOK_STAGES, aside: STOPPED, current: book.status, classOf: stageClass, onStage }));
  const rate = el('span', 'job-fact book-fact-rating');
  rate.append(el('span', 'job-fact-label', 'Rating'), stars(book.rating, onRate));
  strip.append(factsRow([['Author', book.author], ['Started', shortDate(book.started)], ['Finished', shortDate(book.finished)]], [rate]));
  side.append(titleEl, strip);
  head.append(side);
  return head;
}

// The bookcase. urlOf(book) → its cover's address or ''; onOpen(rel),
// onMove(rel, stage), onCover(book), onNew().
const SHOWN = 8; // a long shelf shows this many until "Show all"
const opened = new Set(); // shelves shown in full, by stage
export function bookcase(shelves, stats, { urlOf, onOpen, onMove, onCover, onNew }) {
  const box = el('div', 'bookcase');
  const head = el('div', 'job-head');
  const row = el('div', 'job-stats');
  for (const [label, value] of [['Reading', stats.reading], ['Finished this year', stats.finishedThisYear], ['To read', stats.toRead]]) {
    const x = el('div', 'job-stat');
    x.append(el('div', 'job-stat-value', String(value)), el('div', 'job-stat-label', label));
    row.append(x);
  }
  head.append(row);
  const add = el('button', 'btn primary job-new', '+ New book'); add.type = 'button';
  add.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onNew(); });
  head.append(add);
  box.append(head);

  const all = shelves.flatMap((s) => s.items);
  for (const shelf of shelves) {
    const sec = el('section', `book-shelf ${stageClass(shelf.stage)}`);
    sec.dataset.stage = shelf.stage;
    const h = el('div', 'book-shelf-head');
    h.append(el('span', 'job-step-dot'), el('span', 'book-shelf-name', shelf.stage), el('span', 'book-shelf-count', String(shelf.items.length)));
    const full = opened.has(shelf.stage);
    if (shelf.items.length > SHOWN) {
      const more = el('button', 'book-shelf-more', full ? 'Show fewer' : `Show all ${shelf.items.length}`); more.type = 'button';
      more.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (full) opened.delete(shelf.stage); else opened.add(shelf.stage);
        sec.replaceWith(bookcase(shelves, stats, { urlOf, onOpen, onMove, onCover, onNew }).querySelector(`.book-shelf[data-stage="${CSS.escape(shelf.stage)}"]`));
      });
      h.append(more);
    }
    sec.append(h);
    const books = el('div', 'book-row');
    for (const b of full ? shelf.items : shelf.items.slice(0, SHOWN)) {
      const item = el('div', 'book-item');
      item.draggable = true;
      item.dataset.rel = b.rel;
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', `${b.title}${b.author ? `, ${b.author}` : ''}, ${shelf.stage}`);
      item.append(bookCover(b, urlOf(b), { onCover: () => onCover(b) }));
      const cap = el('div', 'book-caption');
      cap.append(el('b', null, b.title));
      if (shelf.stage === 'Finished' && b.rating) cap.append(stars(b.rating));
      else if (shelf.stage === 'Reading' && b.started) cap.append(el('span', null, `Since ${shortDate(b.started)}`));
      else if (b.author) cap.append(el('span', null, b.author));
      item.append(cap);
      item.addEventListener('click', (e) => { e.preventDefault(); onOpen(b.rel); });
      item.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onOpen(b.rel); } });
      item.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-mufka-book', b.rel); e.dataTransfer.effectAllowed = 'move'; item.classList.add('dragging'); });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
      books.append(item);
    }
    if (!shelf.items.length) books.append(el('div', 'book-shelf-empty', 'No books here yet'));
    sec.append(books, el('div', 'book-plank'));
    sec.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-mufka-book')) { e.preventDefault(); sec.classList.add('drop'); } });
    sec.addEventListener('dragleave', (e) => { if (!sec.contains(e.relatedTarget)) sec.classList.remove('drop'); });
    sec.addEventListener('drop', (e) => {
      const rel = e.dataTransfer.getData('text/x-mufka-book');
      sec.classList.remove('drop');
      if (!rel) return;
      e.preventDefault(); e.stopPropagation();
      const b = all.find((x) => x.rel === rel);
      if (b && b.status !== shelf.stage) onMove(rel, shelf.stage);
    });
    box.append(sec);
  }
  if (!all.length) box.append(el('p', 'bud-empty', 'No books yet. Add one with "+ New book": each book is a note of its own.'));
  box.append(el('p', 'book-hint', 'Drag a book to another shelf to change where you are with it. A cover is any image: on a book, "Add cover" picks one.'));
  return box;
}

// The New book dialog. cover: { pick() → Promise<{ name, url } | null>,
// paste() → the same, files(paths) → the same } puts an image in the
// attachments; onSave({ title, author, stage, image }).
export function openBookDialog({ cover, pathOf }, onSave) {
  const layer = el('div', 'palette-layer');
  const box = el('div', 'palette plan-dialog bud-dialog book-dialog');
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'New book');
  box.append(el('div', 'plan-dialog-title', 'New book'));
  let image = null; // { name, url }
  const grid = el('div', 'book-dialog-grid');
  const slot = el('button', 'book-dialog-cover'); slot.type = 'button';
  slot.setAttribute('aria-label', 'Add a cover');
  const drawSlot = () => {
    slot.replaceChildren();
    if (image) {
      const img = el('img'); img.src = image.url; img.alt = 'Cover';
      slot.append(img);
      slot.classList.add('has-image');
    } else {
      slot.classList.remove('has-image');
      slot.append(el('span', 'book-dialog-plus', '+'), el('span', null, 'Add a cover'), el('small', null, 'Drop an image, paste one, or click to pick a file'));
    }
  };
  const take = (res) => { if (res && res.url) { image = res; drawSlot(); } };
  slot.addEventListener('click', async () => take(await cover.pick()));
  slot.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); slot.classList.add('drop'); } });
  slot.addEventListener('dragleave', () => slot.classList.remove('drop'));
  slot.addEventListener('drop', async (e) => {
    slot.classList.remove('drop');
    const files = [...e.dataTransfer.files].map(pathOf).filter(Boolean);
    if (!files.length) return;
    e.preventDefault();
    take(await cover.files(files));
  });
  drawSlot();
  const fields = el('div', 'book-dialog-fields');
  const field = (label, input, id) => { input.id = id; const f = el('div', 'bud-field'); const l = el('label', '', label); l.htmlFor = id; f.append(l, input); return f; };
  const title = Object.assign(el('input', 'ask-input book-title-input'), { placeholder: 'Title' });
  const author = Object.assign(el('input', 'ask-input book-author-input'), { placeholder: 'Author' });
  let stage = BOOK_STAGES[0];
  const steps = el('div', 'book-dialog-stages');
  const drawSteps = () => steps.replaceChildren(stageSteps({ stages: BOOK_STAGES, current: stage, classOf: stageClass, onStage: (s) => { stage = s; drawSteps(); } }));
  drawSteps();
  const shelfField = el('div', 'bud-field'); shelfField.append(el('label', '', 'Shelf'), steps);
  fields.append(field('Title', title, 'book-f1'), field('Author', author, 'book-f2'), shelfField);
  grid.append(slot, fields);
  box.append(grid);
  const restore = document.activeElement;
  const close = () => { layer.remove(); if (restore && restore.isConnected) restore.focus(); };
  const save = () => {
    if (!title.value.trim()) { title.focus(); return; }
    close();
    onSave({ title: title.value.trim(), author: author.value.trim(), stage, image: image ? image.name : '' });
  };
  const actions = el('div', 'plan-dialog-actions');
  actions.append(el('span', 'bud-keys', '↵ add · esc cancel'));
  const cancel = el('button', 'btn quiet', 'Cancel'); cancel.type = 'button'; cancel.addEventListener('click', close);
  const ok = el('button', 'btn primary', 'Add book'); ok.type = 'button'; ok.addEventListener('click', save);
  actions.append(cancel, ok);
  box.append(actions);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  // ⌘V with an image on the clipboard: the cover (text still pastes into the fields).
  box.addEventListener('paste', async (e) => {
    if (![...(e.clipboardData?.items || [])].some((i) => i.type.startsWith('image/'))) return;
    e.preventDefault();
    take(await cover.paste());
  });
  layer.append(box);
  layer.addEventListener('mousedown', (e) => { if (e.target === layer) close(); });
  document.body.append(layer);
  title.focus();
}
