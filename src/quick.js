// Quick note (⌃⌥N): one line typed or dictated from anywhere. Enter adds it to
// today's daily note, or "Name: text" to that note (lib/quicknote.mjs, written
// by main.js); Esc closes. The box is its own small window.
import { icon } from './icons.js';

const api = window.notes;
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

document.body.className = 'quick-page';
const box = el('div', 'quick-box');
const row = el('div', 'quick-row');
const mic = el('button', 'icon-btn-sq quick-mic');
mic.type = 'button';
mic.title = 'Dictate (Handy)';
mic.append(icon('mic'));
const input = el('input', 'quick-input');
input.placeholder = 'Quick note…';
input.setAttribute('aria-label', 'Quick note');
const chip = el('span', 'quick-to');
const hint = el('div', 'quick-hint');
row.append(mic, input, chip);
box.append(row, hint);
document.body.replaceChildren(box);

let asked = 0;
async function showTarget() {
  const text = input.value.trim();
  const n = ++asked;
  const r = text ? await api.quickTarget(text) : { to: null };
  if (n !== asked) return;
  chip.textContent = `→ ${r && r.to ? r.to : "Today's daily note"}`;
  const body = r && r.to ? text.replace(/^[^:]*:\s*/, '') : '';
  if (rec || waiting) return;
  if (r && r.to) setHint([`Enter adds “${body}” to ${r.to}`]);
  else if (dictated && text) setHint(['Check it, then ', el('b', null, 'Enter'), ' adds it · Esc closes']);
  else setHint([`${mic.hidden ? '' : 'Type or click the mic to speak · '}Enter adds it · Esc closes · start with “Note name:” to put it in that note`]);
}

// Dictation with Handy: one click starts it, the button turns into a running
// Stop timer; a second click (or Enter, or Esc) stops it and Handy types what
// it heard into the box, where it waits for Enter like typed text.
let rec = null; // null | { started, timer } while Handy listens
let waiting = null; // timeout while Handy writes it down
let dictated = false; // the box holds what Handy heard
const setHint = (text, cls = '') => { hint.className = `quick-hint ${cls}`.trim(); hint.replaceChildren(...text); };
function micIdle() {
  mic.className = 'icon-btn-sq quick-mic';
  mic.title = 'Dictate (Handy)';
  mic.replaceChildren(icon('mic'));
  input.placeholder = 'Quick note…';
}
async function toggleMic() {
  if (waiting) return;
  input.focus();
  const res = await api.handyToggle();
  if (!res || res.error) { setHint([(res && res.error) || 'Could not reach Handy'], 'err'); return; }
  if (!rec) {
    rec = { started: Date.now() };
    mic.className = 'quick-mic rec';
    mic.title = 'Stop';
    const t = el('span', 'quick-mic-time', '0:00');
    mic.replaceChildren(el('span', 'quick-mic-dot'), t, el('b', null, 'Stop'));
    rec.timer = setInterval(() => { const s = Math.floor((Date.now() - rec.started) / 1000); t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 1000);
    input.placeholder = 'Listening… speak now';
    setHint(['● Listening · click ', el('b', null, 'Stop'), ' (or press Enter) when you’re done'], 'rec');
    return;
  }
  clearInterval(rec.timer); rec = null;
  micIdle();
  mic.classList.add('wait');
  input.placeholder = 'Writing it down…';
  setHint(['Handy is writing down what you said…']);
  waiting = setTimeout(() => { waiting = null; micIdle(); setHint(['Handy sent no words back · try again or type it'], 'err'); }, 30000);
}
function heard() {
  if (!waiting) return;
  clearTimeout(waiting); waiting = null;
  dictated = true;
  micIdle();
}

let busy = false;
input.addEventListener('input', () => { heard(); showTarget(); });
input.addEventListener('keydown', async (e) => {
  if (rec && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); toggleMic(); return; }
  if (e.key === 'Escape') { e.preventDefault(); api.quickClose(); return; }
  if (e.key !== 'Enter' || e.isComposing || busy || waiting) return;
  e.preventDefault();
  if (!input.value.trim()) return;
  busy = true;
  const r = await api.quickAdd(input.value);
  busy = false;
  if (r && r.ok) {
    input.value = '';
    setHint([`Added to ${r.to || "today's daily note"}`], 'done');
    setTimeout(() => api.quickClose(), 700);
  } else setHint([(r && r.error) || 'Could not add it'], 'err');
});

mic.hidden = true;
api.voice().then((v) => { mic.hidden = !(v && v.handy && v.handy.installed); if (!input.value) showTarget(); });
mic.addEventListener('click', toggleMic);

input.focus();
showTarget();
