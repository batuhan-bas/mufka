// A new element with a class and text (either may be left out).
export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// A form in a dialog box. Add the fields to `box`, then show(okLabel, save,
// first): Cancel and OK buttons, ↵ saves, Esc and a click outside close.
// save() checks the fields and calls close() itself.
export function formDialog(title, cls = '') {
  const layer = el('div', 'palette-layer');
  const box = el('div', `palette plan-dialog bud-dialog${cls ? ` ${cls}` : ''}`);
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', title);
  box.append(el('div', 'plan-dialog-title', title));
  const restore = document.activeElement;
  const close = () => { layer.remove(); if (restore && restore.isConnected) restore.focus(); };
  const field = (label, input, id) => { input.id = id; const f = el('div', 'bud-field'); const l = el('label', '', label); l.htmlFor = id; f.append(l, input); return f; };
  const show = (okLabel, save, first) => {
    const actions = el('div', 'plan-dialog-actions');
    actions.append(el('span', 'bud-keys', '↵ add · esc cancel'));
    const cancel = el('button', 'btn quiet', 'Cancel'); cancel.type = 'button'; cancel.addEventListener('click', close);
    const ok = el('button', 'btn primary', okLabel); ok.type = 'button'; ok.addEventListener('click', save);
    actions.append(cancel, ok);
    box.append(actions);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); save(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    });
    layer.append(box);
    layer.addEventListener('mousedown', (e) => { if (e.target === layer) close(); });
    document.body.append(layer);
    first.focus();
  };
  return { box, close, field, show };
}
