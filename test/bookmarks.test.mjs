import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookmarkedPaths, toggleBookmark, renameBookmark, normalizeBookmarks } from '../lib/bookmarks.mjs';
import { countText } from '../lib/wordcount.mjs';

const obs = { items: [
  { type: 'file', ctime: 1, path: 'A.md' },
  { type: 'group', ctime: 2, title: 'G', items: [{ type: 'file', ctime: 3, path: 'Dir/B.md' }, { type: 'search', query: 'x' }] },
  { type: 'folder', ctime: 4, path: 'Dir' },
] };

test('reads file bookmarks, groups flattened, others kept', () => {
  assert.deepEqual(bookmarkedPaths(obs), ['A.md', 'Dir/B.md']);
  assert.deepEqual(bookmarkedPaths(null), []);
  assert.deepEqual(normalizeBookmarks({ nope: 1 }), { items: [] });
});

test('toggle adds at the end and removes everywhere, keeping other entries', () => {
  const added = toggleBookmark(obs, 'C.md', 9);
  assert.deepEqual(added.items[3], { type: 'file', ctime: 9, path: 'C.md' });
  const removed = toggleBookmark(obs, 'Dir/B.md');
  assert.deepEqual(bookmarkedPaths(removed), ['A.md']);
  assert.deepEqual(removed.items[1].items, [{ type: 'search', query: 'x' }]);
  assert.equal(removed.items[2].type, 'folder');
  assert.deepEqual(bookmarkedPaths(toggleBookmark({}, 'X.md', 1)), ['X.md']);
});

test('rename follows the note', () => {
  assert.deepEqual(bookmarkedPaths(renameBookmark(obs, 'Dir/B.md', 'Dir/B2.md')), ['A.md', 'Dir/B2.md']);
});

test('word and character counts', () => {
  assert.deepEqual(countText('---\ntags: [a, b]\n---\n# Hello world\n\n- [ ] it\'s a well-known **test** 42'), { words: 7, characters: 50 });
  assert.deepEqual(countText(''), { words: 0, characters: 0 });
  assert.equal(countText('İstanbul’da çay').words, 2);
});

test('a folder rename moves the bookmarks inside it', () => {
  assert.deepEqual(bookmarkedPaths(renameBookmark(obs, 'Dir', 'Moved/Dir')), ['A.md', 'Moved/Dir/B.md']);
});
