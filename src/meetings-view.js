// Meetings (lib/meetings.mjs): the strip under a meeting's title — when it
// was, who was there, how many of its action items are done.
import { factsRow } from './jobs-view.js';
import { progressBar } from './projects-view.js';
import { el } from './dom.js';


export function meetingStrip(m) {
  const box = el('div', 'job-strip meeting-strip');
  const day = /^\d{4}-\d{2}-\d{2}/.test(m.date)
    ? new Date(`${m.date.slice(0, 10)}T12:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    : m.date;
  const when = [day, m.time].filter(Boolean).join(' · ');
  const extra = [];
  if (m.actions.total) {
    const a = el('span', 'job-fact meeting-fact-actions');
    a.append(el('span', 'job-fact-label', 'Action items'), progressBar(m.actions.done, m.actions.total));
    extra.push(a);
  }
  const facts = factsRow([['When', when], ['Who', m.attendees.join(', ')]], extra);
  if (!facts.children.length) return null;
  box.append(facts);
  return box;
}
