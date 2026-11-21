// Movies: each movie is a note (type: movie) with its status, director, year,
// genre, where and when it was watched, a rating and an image of its poster;
// a ```movies block shows them all as a watchlist, a row of posters per
// status. Pure; drawn by src/movies-view.js.
//
// ```movies
// folder: Movies
// ```
import { readProps } from './properties.mjs';
import { bookRating, coverImage } from './books.mjs';

export const MOVIE_STAGES = ['To watch', 'Watched'];
export const STOPPED = 'Stopped';

const prop = (props, ...names) => {
  const p = props.find((x) => names.includes(String(x.key).toLowerCase()));
  if (!p || p.value == null) return '';
  if (p.value instanceof Date) return p.value.toISOString().slice(0, 10);
  if (Array.isArray(p.value)) return p.value.map(String).join(', ');
  return String(p.value).trim();
};
const fold = (s) => String(s || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');

// The status as the row names it; other ways of writing it are understood.
const ALIASES = {
  'to watch': 'To watch', 'want to watch': 'To watch', 'watchlist': 'To watch', 'unwatched': 'To watch', 'planned': 'To watch',
  'watched': 'Watched', 'seen': 'Watched', 'done': 'Watched', 'finished': 'Watched', 'completed': 'Watched',
  'stopped': STOPPED, 'abandoned': STOPPED, 'dropped': STOPPED, 'paused': STOPPED,
};
export function movieStatus(raw) {
  return ALIASES[fold(raw)] || (String(raw || '').trim() || MOVIE_STAGES[0]);
}

export const mayBeMovie = (src) => /^---\r?\n/.test(src) && /^type:\s*["']?(movie|film)["']?\s*$/m.test(src);

// The movie a note is, or null.
export function movieOf(rel, src) {
  if (!mayBeMovie(String(src || ''))) return null;
  const r = readProps(src);
  if (!r.props) return null;
  if (!['movie', 'film'].includes(prop(r.props, 'type').toLowerCase())) return null;
  return {
    rel,
    title: prop(r.props, 'title') || rel.replace(/^.*\//, '').replace(/\.md$/i, ''),
    status: movieStatus(prop(r.props, 'status')),
    director: prop(r.props, 'director', 'directors'),
    year: prop(r.props, 'year'),
    genre: prop(r.props, 'genre', 'genres'),
    watched: prop(r.props, 'watched', 'watched_on', 'seen'),
    where: prop(r.props, 'where', 'platform'),
    rating: bookRating(prop(r.props, 'rating')),
    image: coverImage(prop(r.props, 'image', 'poster', 'cover_image')),
  };
}

// The rows, top to bottom: To watch (by title), Watched (latest watched
// first), then Stopped and any other status.
export function movieRows(movies) {
  const by = (key, desc) => (a, b) => {
    const x = a[key] || ''; const y = b[key] || '';
    return (desc ? y.localeCompare(x) : x.localeCompare(y)) || a.title.localeCompare(b.title);
  };
  const order = [['To watch', by('title')], ['Watched', by('watched', true)], [STOPPED, by('title')]];
  const rows = order.map(([stage, sort]) => ({ stage, sort, items: [] }));
  for (const m of movies) {
    let r = rows.find((x) => x.stage === m.status);
    if (!r) { r = { stage: m.status, sort: by('title'), items: [] }; rows.push(r); }
    r.items.push(m);
  }
  return rows
    .filter((r) => r.items.length || MOVIE_STAGES.includes(r.stage))
    .map(({ stage, sort, items }) => ({ stage, items: items.sort(sort) }));
}

// The numbers over the rows; "this year" by the watched date; the average of
// the rated movies, to one decimal (0 when none is rated).
export function movieStats(movies, now = new Date()) {
  const year = String(now.getFullYear());
  const rated = movies.filter((m) => m.rating);
  return {
    toWatch: movies.filter((m) => m.status === 'To watch').length,
    watchedThisYear: movies.filter((m) => m.status === 'Watched' && m.watched.startsWith(year)).length,
    average: rated.length ? Math.round((rated.reduce((s, m) => s + m.rating, 0) / rated.length) * 10) / 10 : 0,
  };
}

// The properties to change when a movie moves to `stage` on `today`
// ('YYYY-MM-DD'): the status, and the day it was watched when that is not
// written yet. [[key, value], …]
export function movieStageChanges(movie, stage, today) {
  const out = [['status', stage]];
  if (stage === 'Watched' && !movie.watched) out.push(['watched', today]);
  return out;
}
