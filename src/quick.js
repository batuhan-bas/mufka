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
  hint.textContent = r && r.to
    ? `Enter adds “${body}” to ${r.to}`
    : 'Enter adds it · Esc closes · start with “Note name:” to put it in that note';
}

let busy = false;
input.addEventListener('input', showTarget);
input.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape') { e.preventDefault(); api.quickClose(); return; }
  if (e.key !== 'Enter' || e.isComposing || busy) return;
  e.preventDefault();
  if (!input.value.trim()) return;
  busy = true;
  const r = await api.quickAdd(input.value);
  busy = false;
  if (r && r.ok) {
    input.value = '';
    hint.textContent = `Added to ${r.to || "today's daily note"}`;
    hint.classList.add('done');
    setTimeout(() => api.quickClose(), 700);
  } else hint.textContent = (r && r.error) || 'Could not add it';
});

api.voice().then((v) => { if (!v || !v.handy) mic.hidden = true; });
mic.addEventListener('click', () => { input.focus(); api.handyToggle(); });

input.focus();
showTarget();
