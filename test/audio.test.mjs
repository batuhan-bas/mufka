import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wavFromSamples, voiceNoteName, voiceNoteText, HANDY_RATE } from '../lib/audio.mjs';

test('a 16-bit mono WAV at 16 kHz, as Handy reads it', () => {
  const w = wavFromSamples(new Float32Array([0, 1, -1, 0.5, 2]));
  const v = new DataView(w.buffer);
  const str = (a, n) => String.fromCharCode(...w.slice(a, a + n));
  assert.deepEqual([str(0, 4), str(8, 4), str(12, 4), str(36, 4)], ['RIFF', 'WAVE', 'fmt ', 'data']);
  assert.deepEqual([v.getUint16(20, true), v.getUint16(22, true), v.getUint32(24, true), v.getUint16(34, true)], [1, 1, HANDY_RATE, 16]);
  assert.equal(v.getUint32(40, true), 10);
  assert.equal(w.length, 44 + 10);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => v.getInt16(44 + i * 2, true)), [0, 32767, -32768, 16383, 32767]);
});

test('the voice note: name, date, the kept recording, the text', () => {
  const d = new Date(2026, 10, 16, 0, 30);
  assert.equal(voiceNoteName(d), 'Voice note 2026-11-16 00.30');
  assert.equal(voiceNoteText({ date: d, audio: 'Voice note 2026-11-16 00.30.webm', text: ' Send the deck. ' }),
    '---\ntype: voice-note\ndate: 2026-11-16\ntime: "00:30"\nsource: Handy\n---\n\n![[Voice note 2026-11-16 00.30.webm]]\n\nSend the deck.\n');
  assert.match(voiceNoteText({ date: d, text: '' }), /Handy heard no words/);
});
