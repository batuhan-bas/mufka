// Books: each book is a note (type: book) with its status, author, dates, a
// rating and an image of its cover; a ```books block shows them all as a
// bookcase, a shelf per status. Pure; drawn by src/books-view.js.
//
// ```books
// folder: Books
// ```
import { readProps } from './properties.mjs';

export const BOOK_STAGES = ['To read', 'Reading', 'Finished'];
export const STOPPED = 'Stopped';

const prop = (props, ...names) => {
  const p = props.find((x) => names.includes(String(x.key).toLowerCase()));
  if (!p || p.value == null) return '';
  if (p.value instanceof Date) return p.value.toISOString().slice(0, 10);
  return String(p.value).trim();
};
const fold = (s) => String(s || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');

// The status as the shelf names it; other ways of writing it are understood.
const ALIASES = {
  'to read': 'To read', 'want to read': 'To read', 'tbr': 'To read', 'unread': 'To read', 'planned': 'To read',
  'reading': 'Reading', 'currently reading': 'Reading', 'in progress': 'Reading',
  'finished': 'Finished', 'read': 'Finished', 'done': 'Finished', 'completed': 'Finished',
  'stopped': STOPPED, 'abandoned': STOPPED, 'dnf': STOPPED, 'on hold': STOPPED, 'paused': STOPPED,
};
export function bookStatus(raw) {
  return ALIASES[fold(raw)] || (String(raw || '').trim() || BOOK_STAGES[0]);
}

// 0–5 from "4", "4/5", "★★★★☆" or "8/10"; 0 when none.
export function bookRating(raw) {
  const s = String(raw || '').trim();
  if (!s) return 0;
  const stars = (s.match(/★/g) || []).length;
  if (stars) return Math.min(5, stars);
  const m = /^(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+))?$/.exec(s);
  if (!m) return 0;
  const n = Number(m[1]); const of = m[2] ? Number(m[2]) : 5;
  return Math.max(0, Math.min(5, Math.round((n / (of || 5)) * 5)));
}

// The image of the cover as written ("[[sapiens.jpg]]", "Ekler/x.png") → the
// file's name or path, without the brackets; '' when none.
export function coverImage(raw) {
  return String(raw || '').trim().replace(/^!?\[\[|\]\]$/g, '').split('|')[0].trim();
}

export const mayBeBook = (src) => /^---\r?\n/.test(src) && /^type:\s*["']?book["']?\s*$/m.test(src);

// The book a note is, or null.
export function bookOf(rel, src) {
  if (!mayBeBook(String(src || ''))) return null;
  const r = readProps(src);
  if (!r.props) return null;
  if (prop(r.props, 'type').toLowerCase() !== 'book') return null;
  return {
    rel,
    title: prop(r.props, 'title') || rel.replace(/^.*\//, '').replace(/\.md$/i, ''),
    status: bookStatus(prop(r.props, 'status')),
    author: prop(r.props, 'author', 'authors'),
    started: prop(r.props, 'started', 'start'),
    finished: prop(r.props, 'finished', 'end', 'read'),
    rating: bookRating(prop(r.props, 'rating')),
    image: coverImage(prop(r.props, 'image', 'cover_image', 'book_cover')),
  };
}

// The shelves, top to bottom: Reading (latest started first), To read (by
// title), Finished (latest finished first), then Stopped and any other status.
export function bookShelves(books) {
  const by = (key, desc) => (a, b) => {
    const x = a[key] || ''; const y = b[key] || '';
    return (desc ? y.localeCompare(x) : x.localeCompare(y)) || a.title.localeCompare(b.title);
  };
  const order = [['Reading', by('started', true)], ['To read', by('title')], ['Finished', by('finished', true)], [STOPPED, by('title')]];
  const shelves = order.map(([stage, sort]) => ({ stage, sort, items: [] }));
  for (const b of books) {
    let s = shelves.find((x) => x.stage === b.status);
    if (!s) { s = { stage: b.status, sort: by('title'), items: [] }; shelves.push(s); }
    s.items.push(b);
  }
  return shelves
    .filter((s) => s.items.length || BOOK_STAGES.includes(s.stage))
    .map(({ stage, sort, items }) => ({ stage, items: items.sort(sort) }));
}

// The numbers over the shelves; "this year" by the finished date.
export function bookStats(books, now = new Date()) {
  const year = String(now.getFullYear());
  return {
    reading: books.filter((b) => b.status === 'Reading').length,
    finishedThisYear: books.filter((b) => b.status === 'Finished' && b.finished.startsWith(year)).length,
    toRead: books.filter((b) => b.status === 'To read').length,
  };
}

// The properties to change when a book moves to `stage` on `today`
// ('YYYY-MM-DD'): the status, and the day it was started or finished when
// that is not written yet. [[key, value], …]
export function stageChanges(book, stage, today) {
  const out = [['status', stage]];
  if (stage === 'Reading' && !book.started) out.push(['started', today]);
  if (stage === 'Finished' && !book.finished) out.push(['finished', today]);
  return out;
}
