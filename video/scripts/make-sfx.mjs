// Synthesises a tiny SFX kit as 16-bit mono WAVs (no downloads, fully deterministic).
// whoosh = filtered noise swell, pop = pitch-dropping sine, hit = low thump with a click.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SR = 44100;

function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1; }

function wav(samples) {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 0.9 / peak : 1;
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * gain * 32767))), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

function whoosh() {
  const n = Math.floor(SR * 0.55); const rnd = lcg(7); const out = new Float32Array(n); let y = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const fc = 260 + 5200 * Math.sin(Math.PI * Math.min(1, t * 1.25)); // cutoff sweeps up then eases back
    const a = 1 - Math.exp((-2 * Math.PI * fc) / SR);
    y += a * (rnd() - y);
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 2) * Math.exp(-t * 1.6);
    out[i] = y * env;
  }
  return out;
}

function pop() {
  const n = Math.floor(SR * 0.16); const out = new Float32Array(n); let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 180 + 560 * Math.exp(-t * 38);
    phase += (2 * Math.PI * f) / SR;
    out[i] = Math.sin(phase) * Math.exp(-t * 26);
  }
  return out;
}

function hit() {
  const n = Math.floor(SR * 0.55); const rnd = lcg(21); const out = new Float32Array(n); let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 55 + 40 * Math.exp(-t * 14);
    phase += (2 * Math.PI * f) / SR;
    const click = t < 0.012 ? rnd() * (1 - t / 0.012) * 0.6 : 0;
    out[i] = Math.sin(phase) * Math.exp(-t * 6.5) + click;
  }
  return out;
}

export function ensureSfx(publicDir) {
  const dir = path.join(publicDir, 'sfx');
  fs.mkdirSync(dir, { recursive: true });
  const kit = { 'whoosh.wav': whoosh, 'pop.wav': pop, 'hit.wav': hit };
  let made = 0;
  for (const [name, fn] of Object.entries(kit)) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) { fs.writeFileSync(file, wav(fn())); made++; }
  }
  return made;
}

// `node scripts/make-sfx.mjs` regenerates the kit into ../public/sfx
const self = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  const publicDir = path.join(path.dirname(self), '..', 'public');
  for (const f of ['whoosh.wav', 'pop.wav', 'hit.wav']) { try { fs.unlinkSync(path.join(publicDir, 'sfx', f)); } catch { /* not there yet */ } }
  console.log('SFX written:', ensureSfx(publicDir));
}
