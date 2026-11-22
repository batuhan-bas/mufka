// Books (lib/books.mjs): the head of a book's note (its cover beside the title,
// the shelf it is on, author, dates, stars), the ```books bookcase (a shelf per
// status, books standing with their covers), and the New book dialog.
import { BOOK_STAGES, STOPPED } from '../lib/books.mjs';
import { stageSteps, factsRow } from './jobs-view.js';
import { el, formDialog } from './dom.js';

const stageClass = (s) => (s === 'Finished' ? 'job-s-offer' : s === STOPPED ? 'job-s-2' : s === 'Reading' ? 'job-s-1' : 'job-s-0');
export const shortDate = (key) => (key ? new Date(`${key.slice(0, 10)}T12:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

// A colour of its own for a book or movie without an image, from its title.
export function hueOf(title, hues) {
  let h = 0;
  for (const ch of String(title)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return hues[h % hues.length];
}
const HUES = [18, 160, 210, 268, 340, 42, 120, 190];

// The cover: the image when there is one, else a plain cover with the title
// and author. onCover(): add or change the image.
export function bookCover(book, url, { big = false, onCover } = {}) {
  const c = el('div', `book-cover${big ? ' big' : ''}${url ? ' has-image' : ''}`);
  if (url) {
    const img = el('img');
    img.src = url; img.alt = `Cover of ${book.title}`; img.draggable = false;
    c.append(img);
  } else {
    c.style.setProperty('--h', String(hueOf(book.title, HUES)));
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

// A bookcase of shelves, or a watchlist of rows: stats and "+ New" on top,
// then a section per stage with its items, dragged between sections to move
// them. rows: [{ stage, items }]. c: { cls, stats: [[label, value]], newLabel,
// onNew, onOpen(rel), onMove(rel, stage), shown, opened (Set of stages shown
// in full), redraw() → a new board, rowCls, classOf(stage), wallCls, itemCls,
// dragType, label(item, stage), visual(item), caption(cap, item, stage),
// emptyRow, plank, emptyAll, hint }.
export function shelfBoard(rows, c) {
  const box = el('div', c.cls);
  const head = el('div', 'job-head');
  const row = el('div', 'job-stats');
  for (const [label, value] of c.stats) {
    const x = el('div', 'job-stat');
    x.append(el('div', 'job-stat-value', String(value)), el('div', 'job-stat-label', label));
    row.append(x);
  }
  head.append(row);
  const add = el('button', 'btn primary job-new', c.newLabel); add.type = 'button';
  add.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); c.onNew(); });
  head.append(add);
  box.append(head);

  const all = rows.flatMap((r) => r.items);
  for (const r of rows) {
    const sec = el('section', `book-shelf ${c.rowCls}${c.classOf(r.stage)}`);
    sec.dataset.stage = r.stage;
    const h = el('div', 'book-shelf-head');
    h.append(el('span', 'job-step-dot'), el('span', 'book-shelf-name', r.stage), el('span', 'book-shelf-count', String(r.items.length)));
    const full = c.opened.has(r.stage);
    if (r.items.length > c.shown) {
      const more = el('button', 'book-shelf-more', full ? 'Show fewer' : `Show all ${r.items.length}`); more.type = 'button';
      more.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (full) c.opened.delete(r.stage); else c.opened.add(r.stage);
        sec.replaceWith(c.redraw().querySelector(`.book-shelf[data-stage="${CSS.escape(r.stage)}"]`));
      });
      h.append(more);
    }
    sec.append(h);
    const wall = el('div', c.wallCls);
    for (const x of full ? r.items : r.items.slice(0, c.shown)) {
      const item = el('div', c.itemCls);
      item.draggable = true;
      item.dataset.rel = x.rel;
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', c.label(x, r.stage));
      item.append(c.visual(x));
      const cap = el('div', 'book-caption');
      cap.append(el('b', null, x.title));
      c.caption(cap, x, r.stage);
      item.append(cap);
      item.addEventListener('click', (e) => { e.preventDefault(); c.onOpen(x.rel); });
      item.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); c.onOpen(x.rel); } });
      item.addEventListener('dragstart', (e) => { e.dataTransfer.setData(c.dragType, x.rel); e.dataTransfer.effectAllowed = 'move'; item.classList.add('dragging'); });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
      wall.append(item);
    }
    if (!r.items.length) wall.append(el('div', 'book-shelf-empty', c.emptyRow));
    sec.append(wall);
    if (c.plank) sec.append(el('div', 'book-plank'));
    sec.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes(c.dragType)) { e.preventDefault(); sec.classList.add('drop'); } });
    sec.addEventListener('dragleave', (e) => { if (!sec.contains(e.relatedTarget)) sec.classList.remove('drop'); });
    sec.addEventListener('drop', (e) => {
      const rel = e.dataTransfer.getData(c.dragType);
      sec.classList.remove('drop');
      if (!rel) return;
      e.preventDefault(); e.stopPropagation();
      const x = all.find((y) => y.rel === rel);
      if (x && x.status !== r.stage) c.onMove(rel, r.stage);
    });
    box.append(sec);
  }
  if (!all.length) box.append(el('p', 'bud-empty', c.emptyAll));
  box.append(el('p', 'book-hint', c.hint));
  return box;
}

// The bookcase. urlOf(book) → its cover's address or ''; onOpen(rel),
// onMove(rel, stage), onCover(book), onNew().
const opened = new Set(); // shelves shown in full, by stage
export function bookcase(shelves, stats, o) {
  return shelfBoard(shelves, {
    cls: 'bookcase', stats: [['Reading', stats.reading], ['Finished this year', stats.finishedThisYear], ['To read', stats.toRead]],
    newLabel: '+ New book', onNew: o.onNew, onOpen: o.onOpen, onMove: o.onMove,
    shown: 8, opened, redraw: () => bookcase(shelves, stats, o),
    rowCls: '', classOf: stageClass, wallCls: 'book-row', itemCls: 'book-item', dragType: 'text/x-mufka-book',
    label: (b, stage) => `${b.title}${b.author ? `, ${b.author}` : ''}, ${stage}`,
    visual: (b) => bookCover(b, o.urlOf(b), { onCover: () => o.onCover(b) }),
    caption: (cap, b, stage) => {
      if (stage === 'Finished' && b.rating) cap.append(stars(b.rating));
      else if (stage === 'Reading' && b.started) cap.append(el('span', null, `Since ${shortDate(b.started)}`));
      else if (b.author) cap.append(el('span', null, b.author));
    },
    emptyRow: 'No books here yet', plank: true,
    emptyAll: 'No books yet. Add one with "+ New book": each book is a note of its own.',
    hint: 'Drag a book to another shelf to change where you are with it. A cover is any image: on a book, "Add cover" picks one.',
  });
}

// The image box of the New book / New movie dialog: click to pick a file,
// drop one, or paste one into the dialog. noun: 'cover' | 'poster'. source:
// { pick(), paste(), files(paths) } each → Promise<{ name, url } | null>.
// → { slot, image() → { name, url } | null }.
export function imageSlot(box, noun, source, pathOf) {
  let image = null;
  const slot = el('button', 'book-dialog-cover'); slot.type = 'button';
  slot.setAttribute('aria-label', `Add a ${noun}`);
  const draw = () => {
    slot.replaceChildren();
    if (image) {
      const img = el('img'); img.src = image.url; img.alt = noun[0].toUpperCase() + noun.slice(1);
      slot.append(img);
      slot.classList.add('has-image');
    } else {
      slot.classList.remove('has-image');
      slot.append(el('span', 'book-dialog-plus', '+'), el('span', null, `Add a ${noun}`), el('small', null, 'Drop an image, paste one, or click to pick a file'));
    }
  };
  const take = (res) => { if (res && res.url) { image = res; draw(); } };
  slot.addEventListener('click', async () => take(await source.pick()));
  slot.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); slot.classList.add('drop'); } });
  slot.addEventListener('dragleave', () => slot.classList.remove('drop'));
  slot.addEventListener('drop', async (e) => {
    slot.classList.remove('drop');
    const files = [...e.dataTransfer.files].map(pathOf).filter(Boolean);
    if (!files.length) return;
    e.preventDefault();
    take(await source.files(files));
  });
  // ⌘V with an image on the clipboard: the image (text still pastes into the fields).
  box.addEventListener('paste', async (e) => {
    if (![...(e.clipboardData?.items || [])].some((i) => i.type.startsWith('image/'))) return;
    e.preventDefault();
    take(await source.paste());
  });
  draw();
  return { slot, image: () => image };
}

// The New book dialog. cover: { pick() → Promise<{ name, url } | null>,
// paste() → the same, files(paths) → the same } puts an image in the
// attachments; onSave({ title, author, stage, image }).
export function openBookDialog({ cover, pathOf }, onSave) {
  const { box, close, field, show } = formDialog('New book', 'book-dialog');
  const grid = el('div', 'book-dialog-grid');
  const { slot, image } = imageSlot(box, 'cover', cover, pathOf);
  const fields = el('div', 'book-dialog-fields');
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
  const save = () => {
    if (!title.value.trim()) { title.focus(); return; }
    close();
    onSave({ title: title.value.trim(), author: author.value.trim(), stage, image: image() ? image().name : '' });
  };
  show('Add book', save, title);
}
