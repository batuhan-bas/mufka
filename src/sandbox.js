// The sandbox page (src/sandbox.html), driven by main.js. Only plain JSON
// comes in and goes out.
//   __dvjs: runs a dataviewjs script against the last vault snapshot it was
//           sent (lib/dataview/dvjs.mjs).
//   __mermaid: draws a Mermaid diagram as SVG text.
import { indexFromWire, runScript } from '../lib/dataview/dvjs.mjs';

let current = { version: null, index: null };

window.__dvjs = async ({ version, snapshot, code, thisRel }) => {
  if (snapshot) current = { version, index: indexFromWire(snapshot) };
  if (current.version !== version || !current.index) return { needSnapshot: true };
  return runScript(code, current.index, thisRel);
};

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", "Helvetica Neue", sans-serif';
let mermaid = null;
let seq = 0;

async function loadMermaid() {
  if (mermaid) return mermaid;
  mermaid = (await import('mermaid')).default;
  // The app's own dark colours; labels as SVG text (the diagram is shown as an image).
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    fontFamily: FONT,
    themeVariables: {
      darkMode: true,
      background: '#1e2025',
      fontFamily: FONT,
      primaryColor: '#272c47',
      primaryTextColor: '#e4e6ea',
      primaryBorderColor: '#8e98ff',
      secondaryColor: '#1c3533',
      secondaryTextColor: '#e4e6ea',
      secondaryBorderColor: '#44c7b5',
      tertiaryColor: '#25282e',
      tertiaryTextColor: '#e4e6ea',
      tertiaryBorderColor: '#3b3f48',
      lineColor: '#9a9fa9',
      textColor: '#e4e6ea',
      mainBkg: '#272c47',
      nodeBorder: '#8e98ff',
      clusterBkg: '#17191d',
      clusterBorder: '#3b3f48',
      edgeLabelBackground: '#1e2025',
      noteBkgColor: '#25282e',
      noteTextColor: '#e4e6ea',
      noteBorderColor: '#3b3f48',
    },
  });
  return mermaid;
}

window.__mermaid = async (code) => {
  try {
    const m = await loadMermaid();
    const { svg } = await m.render(`mufka-diagram-${++seq}`, String(code));
    return { svg };
  } catch (e) {
    for (const el of document.querySelectorAll('[id^="dmufka-diagram-"], [id^="mufka-diagram-"]')) el.remove();
    return { error: e && e.message ? e.message : String(e) };
  }
};
