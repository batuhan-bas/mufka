// Tabs of the content pane. A tab is a place (a location, as in
// lib/navhistory.mjs: { view: 'note', rel }, { view: 'day', key }…) with its
// own back/forward history. Pure: the renderer shows the active tab and tells
// this model where it is; closed tabs can be reopened.

const CLOSED_KEEP = 20;

// newNav(): a fresh back/forward history for a new tab.
export function createTabs(newNav) {
  let tabs = [];
  let activeId = null;
  let closed = [];
  let seq = 0;

  const index = (id) => tabs.findIndex((t) => t.id === id);
  const make = (loc) => ({ id: `t${++seq}`, loc: loc || null, nav: newNav() });

  return {
    get list() { return tabs.slice(); },
    get active() { return tabs.find((t) => t.id === activeId) || null; },
    get count() { return tabs.length; },
    get canReopen() { return closed.length > 0; },

    // A new tab at `loc`, after the active one (or at the end); active by default.
    add(loc, { activate = true } = {}) {
      const t = make(loc);
      const at = index(activeId);
      tabs.splice(at === -1 ? tabs.length : at + 1, 0, t);
      if (activate || !activeId) activeId = t.id;
      return t;
    },
    activate(id) {
      if (index(id) === -1) return null;
      activeId = id;
      return this.active;
    },
    // The tab `step` places from the active one, wrapping.
    neighbour(step) {
      if (!tabs.length) return null;
      const i = index(activeId);
      return tabs[(i + step + tabs.length) % tabs.length];
    },
    // Close a tab; the last one never closes. Returns the tab now active if
    // the active one was closed (its neighbour, as in a browser), else null.
    close(id) {
      const i = index(id);
      if (i === -1 || tabs.length === 1) return null;
      const [t] = tabs.splice(i, 1);
      if (t.loc) closed = [...closed, { loc: t.loc, at: i }].slice(-CLOSED_KEEP);
      if (t.id !== activeId) return null;
      activeId = tabs[Math.min(i, tabs.length - 1)].id;
      return this.active;
    },
    // Every tab but this one.
    closeOthers(id) {
      if (index(id) === -1) return;
      for (const t of tabs) if (t.id !== id && t.loc) closed.push({ loc: t.loc, at: 0 });
      closed = closed.slice(-CLOSED_KEEP);
      tabs = tabs.filter((t) => t.id === id);
      activeId = id;
    },
    // The most recently closed tab, back where it was and active.
    reopen() {
      const c = closed.pop();
      if (!c) return null;
      const t = make(c.loc);
      tabs.splice(Math.min(c.at, tabs.length), 0, t);
      activeId = t.id;
      return t;
    },
    move(id, to) {
      const i = index(id);
      if (i === -1) return;
      const [t] = tabs.splice(i, 1);
      tabs.splice(Math.max(0, Math.min(to, tabs.length)), 0, t);
    },
    // A note or folder moved: fix the places that pointed into it.
    remap(oldRel, newRel) {
      const fix = (r) => (r === oldRel ? newRel : (r && r.startsWith(`${oldRel}/`) ? newRel + r.slice(oldRel.length) : r));
      for (const t of [...tabs, ...closed]) if (t.loc && t.loc.rel) t.loc = { ...t.loc, rel: fix(t.loc.rel) };
    },
    // Drop the tabs whose place is gone (`valid(loc)` false). The active tab
    // stays (the renderer moves it somewhere that exists); so does the last.
    prune(valid) {
      tabs = tabs.filter((t) => t.id === activeId || !t.loc || valid(t.loc));
      closed = closed.filter((c) => valid(c.loc));
    },
    // For saving: the places and which is active.
    toJSON() {
      return { tabs: tabs.map((t) => t.loc).filter(Boolean), active: Math.max(0, tabs.filter((t) => t.loc).findIndex((t) => t.id === activeId)) };
    },
    // Saved tabs back (their histories start empty); invalid places are skipped.
    restore(data, valid = () => true) {
      const all = data && Array.isArray(data.tabs) ? data.tabs : [];
      const want = all[data && data.active];
      const locs = all.filter((l) => l && typeof l.view === 'string' && valid(l));
      if (!locs.length) return false;
      tabs = locs.map(make);
      activeId = tabs[Math.max(0, locs.indexOf(want))].id;
      return true;
    },
  };
}
