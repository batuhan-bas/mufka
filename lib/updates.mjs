// Updates (electron-updater, from GitHub Releases): what Settings and the
// sidebar say about them. main.js reports a state:
//   { state: 'idle' | 'checking' | 'none' | 'downloading' | 'ready' | 'error',
//     version? (the new one), percent?, error? }
// Pure; tested in test/updates.test.mjs.

// Automatic checks are on unless the user turned them off.
export const autoUpdatesOn = (settings) => !(settings && settings.autoUpdate === false);

// The status line: { text, restart } — restart: offer "Restart" to install.
// current: this Mufka's version; packaged: false in development, where the
// app never updates itself.
export function updateStatus(s, { current, packaged }) {
  if (!packaged) return { text: `Mufka ${current} · updates work in the installed app`, restart: false };
  const st = (s && s.state) || 'idle';
  if (st === 'checking') return { text: 'Checking for updates…', restart: false };
  if (st === 'downloading') {
    const what = ['Downloading Mufka', s.version].filter(Boolean).join(' ');
    return { text: Number.isFinite(s.percent) ? `${what} · ${Math.round(s.percent)}%` : what, restart: false };
  }
  if (st === 'ready') return { text: `Mufka ${s.version} is ready; it is installed when Mufka restarts`, restart: true };
  if (st === 'none') return { text: `Mufka ${current} · up to date`, restart: false };
  if (st === 'error') return { text: `Could not check for updates${s.error ? `: ${s.error}` : ''}`, restart: false };
  return { text: `Mufka ${current}`, restart: false };
}
