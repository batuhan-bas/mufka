// Pure back/forward history of what the content pane showed, like a browser's
// (Obsidian: Cmd+[ / Cmd+]). A location is a plain object, e.g.
// { view: 'note', rel }, { view: 'day', key } or { view: 'graph' }.

export function sameLocation(a, b) {
  return Boolean(a && b) && a.view === b.view && a.rel === b.rel && a.key === b.key;
}

export function createNavHistory(limit = 100) {
  let back = [];
  let fwd = [];
  return {
    // Leaving `from` for `to`: remember `from`; a new path drops the forward stack.
    visit(from, to) {
      if (!from || sameLocation(from, to)) return;
      if (!sameLocation(back[back.length - 1], from)) back.push(from);
      if (back.length > limit) back = back.slice(-limit);
      fwd = [];
    },
    // Go back from `current`; `valid(loc)` skips places that no longer exist.
    back(current, valid = () => true) {
      while (back.length) {
        const loc = back.pop();
        if (!valid(loc) || sameLocation(loc, current)) continue;
        if (current) fwd.push(current);
        return loc;
      }
      return null;
    },
    forward(current, valid = () => true) {
      while (fwd.length) {
        const loc = fwd.pop();
        if (!valid(loc) || sameLocation(loc, current)) continue;
        if (current) back.push(current);
        return loc;
      }
      return null;
    },
    get canBack() { return back.length > 0; },
    get canForward() { return fwd.length > 0; },
  };
}
