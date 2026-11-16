// The page's entry: the quick note box (⌃⌥N, a small window of its own, see
// main.js openQuick) or the app.
if (location.hash === '#quick') import('./quick.js');
else import('./renderer.js');
