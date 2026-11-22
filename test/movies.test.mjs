import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movieOf, movieStatus, movieRows, movieStats, movieStageChanges } from '../lib/movies.mjs';

const note = (props) => `---\ntype: movie\n${props}\n---\n\n## In one sentence\n`;

test('a movie note, and notes that are not movies', () => {
  const m = movieOf('Movies/Arrival.md', note('director: Denis Villeneuve\nyear: 2016\ngenre: [Sci-fi, Drama]\nstatus: seen\nwatched: 2026-11-14\nwhere: Netflix\nrating: 5\nposter: "[[arrival.jpg]]"'));
  assert.deepEqual(m, { rel: 'Movies/Arrival.md', title: 'Arrival', status: 'Watched', director: 'Denis Villeneuve', year: '2016', genre: 'Sci-fi, Drama', watched: '2026-11-14', where: 'Netflix', rating: 5, image: 'arrival.jpg' });
  assert.equal(movieOf('F.md', '---\ntype: film\n---\n').status, 'To watch');
  assert.equal(movieOf('a.md', '---\ntype: book\n---\n'), null);
  assert.equal(movieOf('a.md', '# no properties'), null);
});

test('statuses as people write them', () => {
  assert.deepEqual(['to-watch', 'Watchlist', 'SEEN', 'dropped', '', 'With friends'].map(movieStatus), ['To watch', 'To watch', 'Watched', 'Stopped', 'To watch', 'With friends']);
});

test('the rows: To watch, Watched, then Stopped and others; the numbers', () => {
  const m = (title, status, more = {}) => ({ rel: `${title}.md`, title, status, director: '', year: '', genre: '', watched: '', where: '', rating: 0, image: '', ...more });
  const rows = movieRows([
    m('Tenet', 'To watch'), m('Dune', 'To watch'),
    m('Arrival', 'Watched', { watched: '2026-11-14', rating: 5 }), m('Parasite', 'Watched', { watched: '2026-10-02', rating: 4 }),
    m('Old', 'Watched', { watched: '2025-06-01' }), m('Long', 'Stopped'), m('Mine', 'With friends'),
  ]);
  assert.deepEqual(rows.map((r) => `${r.stage}: ${r.items.map((x) => x.title).join(', ')}`), [
    'To watch: Dune, Tenet', 'Watched: Arrival, Parasite, Old', 'Stopped: Long', 'With friends: Mine',
  ]);
  assert.deepEqual(movieRows([]).map((r) => r.stage), ['To watch', 'Watched']);
  assert.deepEqual(movieStats(rows.flatMap((r) => r.items), new Date(2026, 10, 22)), { toWatch: 2, watchedThisYear: 2, average: 4.5 });
  assert.equal(movieStats([]).average, 0);
});

test('marking a movie watched writes the day, once', () => {
  assert.deepEqual(movieStageChanges({ watched: '' }, 'Watched', '2026-11-22'), [['status', 'Watched'], ['watched', '2026-11-22']]);
  assert.deepEqual(movieStageChanges({ watched: '2026-11-01' }, 'Watched', '2026-11-22'), [['status', 'Watched']]);
  assert.deepEqual(movieStageChanges({ watched: '' }, 'To watch', '2026-11-22'), [['status', 'To watch']]);
});
