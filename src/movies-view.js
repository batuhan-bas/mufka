// Movies (lib/movies.mjs): the head of a movie's note (its poster beside the
// title, the row it is in, director, year, genre, when and where it was
// watched, stars), the ```movies watchlist (a wall of posters per status), and
// the New movie dialog.
import { MOVIE_STAGES, STOPPED } from '../lib/movies.mjs';
import { stageSteps, factsRow } from './jobs-view.js';
import { stars, shortDate, hueOf, shelfBoard, imageSlot } from './books-view.js';
import { el, formDialog } from './dom.js';

const stageClass = (s) => (s === 'Watched' ? 'job-s-offer' : s === STOPPED ? 'job-s-2' : 'job-s-0');

// A colour of its own for a movie without an image, from its title.
const HUES = [30, 200, 8, 110, 340, 260, 175, 45];

// The poster: the image when there is one, else a plain poster with the title
// and year. onPoster(): add or change the image.
export function moviePoster(movie, url, { big = false, onPoster } = {}) {
  const c = el('div', `movie-poster${big ? ' big' : ''}${url ? ' has-image' : ''}`);
  if (url) {
    const img = el('img');
    img.src = url; img.alt = `Poster of ${movie.title}`; img.draggable = false;
    c.append(img);
  } else {
    c.style.setProperty('--h', String(hueOf(movie.title, HUES)));
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
const opened = new Set(); // rows shown in full, by stage
export function watchlist(rows, stats, o) {
  const avg = stats.average ? `${stats.average.toFixed(1)} ★` : '—';
  return shelfBoard(rows, {
    cls: 'bookcase watchlist', stats: [['To watch', stats.toWatch], ['Watched this year', stats.watchedThisYear], ['Average rating', avg]],
    newLabel: '+ New movie', onNew: o.onNew, onOpen: o.onOpen, onMove: o.onMove,
    shown: 10, opened, redraw: () => watchlist(rows, stats, o),
    rowCls: 'movie-row ', classOf: stageClass, wallCls: 'movie-wall', itemCls: 'book-item movie-item', dragType: 'text/x-mufka-movie',
    label: (m, stage) => `${m.title}${m.year ? ` (${m.year})` : ''}, ${stage}`,
    visual: (m) => moviePoster(m, o.urlOf(m), { onPoster: () => o.onPoster(m) }),
    caption: (cap, m, stage) => {
      if (stage === 'Watched' && m.rating) cap.append(stars(m.rating));
      else if (m.director) cap.append(el('span', null, m.director));
      else if (m.year) cap.append(el('span', null, m.year));
    },
    emptyRow: 'No movies here yet', plank: false,
    emptyAll: 'No movies yet. Add one with "+ New movie": each movie is a note of its own.',
    hint: 'Drag a poster to the other row to mark it watched; the day is filled in. A poster is any image: on a movie, "Add poster" picks one.',
  });
}

// The New movie dialog. poster: { pick(), paste(), files(paths) } each →
// Promise<{ name, url } | null>, an image put in the attachments;
// onSave({ title, director, year, stage, image }).
export function openMovieDialog({ poster, pathOf }, onSave) {
  const { box, close, field, show } = formDialog('New movie', 'book-dialog');
  const grid = el('div', 'book-dialog-grid');
  const { slot, image } = imageSlot(box, 'poster', poster, pathOf);
  const fields = el('div', 'book-dialog-fields');
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
  const save = () => {
    if (!title.value.trim()) { title.focus(); return; }
    close();
    onSave({ title: title.value.trim(), director: director.value.trim(), year: year.value.trim(), stage, image: image() ? image().name : '' });
  };
  show('Add movie', save, title);
}
