// Audio for Handy's --transcribe-file, which wants a WAV of 16 kHz, mono,
// 16-bit samples. The renderer decodes and resamples (Web Audio); this packs
// the samples. Pure: no DOM, no fs.

export const HANDY_RATE = 16000;

// Float samples (-1..1) → the bytes of a 16-bit PCM mono WAV at `rate`.
export function wavFromSamples(samples, rate = HANDY_RATE) {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const text = (at, s) => { for (let i = 0; i < s.length; i += 1) v.setUint8(at + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  text(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

// "Voice note 2026-11-16 00.30" for a recording made at `date`.
export function voiceNoteName(date) {
  const p = (x) => String(x).padStart(2, '0');
  return `Voice note ${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}.${p(date.getMinutes())}`;
}

// The note made from a recording: its date and where it came from, the
// recording itself when it is kept (![[name]], played in place), then the text.
export function voiceNoteText({ date, audio = '', text = '' }) {
  const p = (x) => String(x).padStart(2, '0');
  const day = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  const body = String(text).trim() || '_Handy heard no words in it._';
  return ['---', 'type: voice-note', `date: ${day}`, `time: "${p(date.getHours())}:${p(date.getMinutes())}"`, 'source: Handy', '---', '',
    ...(audio ? [`![[${audio}]]`, ''] : []), body, ''].join('\n');
}
