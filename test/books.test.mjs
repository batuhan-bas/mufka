import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookOf, bookStatus, bookRating, coverImage, bookShelves, bookStats, stageChanges } from '../lib/books.mjs';

const note = (props) => `---\ntype: book\n${props}\n---\n\n## In one sentence\n`;

test('a book note, and notes that are not books', () => {
  const b = bookOf('Books/Sapiens.md', note('author: Yuval Noah Harari\nstatus: reading\nstarted: 2026-11-02\nrating: 4\nimage: "[[sapiens.jpg]]"'));
  assert.deepEqual(b, { rel: 'Books/Sapiens.md', title: 'Sapiens', status: 'Reading', author: 'Yuval Noah Harari', started: '2026-11-02', finished: '', rating: 4, image: 'sapiens.jpg' });
  assert.equal(bookOf('a.md', '---\ntype: project\n---\n'), null);
  assert.equal(bookOf('a.md', '# no properties'), null);
  // The old template: a status in lower case, an empty rating.
  assert.equal(bookOf('B.md', note('status: reading\nrating:')).rating, 0);
});

test('statuses, ratings and cover images as people write them', () => {
  assert.deepEqual(['to-read', 'Want to read', 'READ', 'dnf', '', 'Lent out'].map(bookStatus), ['To read', 'To read', 'Finished', 'Stopped', 'To read', 'Lent out']);
  assert.deepEqual(['★★★☆☆', '4/5', '8/10', '5', 'great', ''].map(bookRating), [3, 4, 4, 5, 0, 0]);
  assert.deepEqual(['[[sapiens.jpg]]', '![[Ekler/x.png|200]]', 'covers/y.webp', ''].map(coverImage), ['sapiens.jpg', 'Ekler/x.png', 'covers/y.webp', '']);
});

test('the shelves: Reading, To read, Finished, then Stopped and others', () => {
  const b = (title, status, more = {}) => ({ rel: `${title}.md`, title, status, author: '', started: '', finished: '', rating: 0, image: '', ...more });
  const shelves = bookShelves([
    b('Dune', 'To read'), b('Atomic Habits', 'To read'),
    b('Sapiens', 'Reading', { started: '2026-11-02' }), b('Pragmatic', 'Reading', { started: '2026-10-28' }),
    b('Hobbit', 'Finished', { finished: '2026-10-30' }), b('1984', 'Finished', { finished: '2025-12-01' }),
    b('Ulysses', 'Stopped'), b('Lent', 'Lent out'),
  ]);
  assert.deepEqual(shelves.map((s) => `${s.stage}: ${s.items.map((x) => x.title).join(', ')}`), [
    'Reading: Sapiens, Pragmatic', 'To read: Atomic Habits, Dune', 'Finished: Hobbit, 1984', 'Stopped: Ulysses', 'Lent out: Lent',
  ]);
  assert.deepEqual(bookShelves([]).map((s) => s.stage), ['Reading', 'To read', 'Finished']);
  assert.deepEqual(bookStats(shelves.flatMap((s) => s.items), new Date(2026, 10, 15)), { reading: 2, finishedThisYear: 1, toRead: 2 });
});

test('moving a book writes the day it was started or finished, once', () => {
  assert.deepEqual(stageChanges({ started: '', finished: '' }, 'Reading', '2026-11-15'), [['status', 'Reading'], ['started', '2026-11-15']]);
  assert.deepEqual(stageChanges({ started: '2026-11-01', finished: '' }, 'Finished', '2026-11-15'), [['status', 'Finished'], ['finished', '2026-11-15']]);
  assert.deepEqual(stageChanges({ started: '2026-11-01', finished: '2026-11-10' }, 'Finished', '2026-11-15'), [['status', 'Finished']]);
  assert.deepEqual(stageChanges({}, 'To read', '2026-11-15'), [['status', 'To read']]);
});
