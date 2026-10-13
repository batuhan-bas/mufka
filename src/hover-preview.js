// Page preview: hovering a [[wiki link]] for a moment shows the linked note in
// a small popover, as in Obsidian. The popover stays while the pointer is over
// the link or the popover itself, so it can be scrolled; Esc or leaving closes it.
//
//   attachHoverPreview(root, { resolve(target) → rel|null, read(rel) → Promise<string>,
//                              renderInto(el, content, rel), open(rel, heading) })
// Call it on a container of rendered Markdown; it watches a[data-wiki] inside.

const SHOW_DELAY = 450;
const HIDE_DELAY = 250;

let pop = null;        // the one popover element
let showTimer = 0;
let hideTimer = 0;
let anchor = null;

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

export function hidePreview() {
  clearTimeout(showTimer); clearTimeout(hideTimer);
  if (pop) { pop.remove(); pop = null; }
  anchor = null;
}

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hidePreview, HIDE_DELAY);
}

async function show(a, api) {
  const target = a.getAttribute('data-wiki');
  const heading = a.getAttribute('data-heading');
  const rel = api.resolve(target);
  hidePreview();
  anchor = a;
  pop = el('div', 'hover-preview');
  pop.setAttribute('role', 'tooltip');
  const head = el('button', 'hover-preview-title', rel ? rel.slice(rel.lastIndexOf('/') + 1).replace(/\.md$/i, '') : target);
  head.type = 'button';
  head.addEventListener('click', () => { hidePreview(); api.open(rel, heading, target); });
  const body = el('div', 'hover-preview-body md');
  pop.append(head, body);
  pop.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  pop.addEventListener('mouseleave', scheduleHide);
  document.body.append(pop);
  place(a);
  if (!rel) { body.append(el('div', 'hover-preview-empty', 'Not created yet. Click the link to create it.')); return; }
  const content = await api.read(rel);
  if (!pop || anchor !== a) return; // moved on meanwhile
  if (!content.trim()) body.append(el('div', 'hover-preview-empty', 'Empty note'));
  else api.renderInto(body, content, rel);
  place(a);
  if (heading) {
    const want = heading.trim().toLowerCase();
    const h = [...body.querySelectorAll('h1, h2, h3, h4, h5, h6')].find((x) => x.textContent.trim().toLowerCase() === want);
    if (h) body.scrollTop = h.offsetTop - body.offsetTop;
  }
}

// Below the link if it fits, else above; kept inside the window.
function place(a) {
  if (!pop) return;
  const r = a.getBoundingClientRect();
  const w = pop.offsetWidth; const h = pop.offsetHeight;
  let left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
  let top = r.bottom + 6;
  if (top + h > window.innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
  top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
  left = Math.max(8, left);
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}

export function attachHoverPreview(root, api) {
  root.querySelectorAll('a[data-wiki]').forEach((a) => {
    a.addEventListener('mouseenter', () => {
      clearTimeout(hideTimer);
      if (anchor === a && pop) return;
      clearTimeout(showTimer);
      showTimer = setTimeout(() => { show(a, api); }, SHOW_DELAY);
    });
    a.addEventListener('mouseleave', () => { clearTimeout(showTimer); if (anchor === a) scheduleHide(); });
    a.addEventListener('mousedown', hidePreview);
  });
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop) hidePreview(); });
// Scrolling the page moves the link away; scrolling inside the popover is fine.
document.addEventListener('scroll', (e) => { if (pop && !pop.contains(e.target)) hidePreview(); }, true);
