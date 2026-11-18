// Tests the ElevenLabs voiceover path of render.mjs against a local stand-in server (no key or credits needed).
// Run: node test-voice.mjs   (needs out/real-pack.json, or edit the path; renders stills only, not video)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pack = JSON.parse(fs.readFileSync(path.join(here, 'out', 'real-pack.json'), 'utf8'));
const expectedText = pack.videos[0].scenes.map((s) => s.vo).join(' ');
const wav = fs.readFileSync(path.join(here, 'public', 'sfx', 'whoosh.wav'));

const seen = [];
const srv = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const j = body ? JSON.parse(body) : {};
    seen.push({ url: req.url, key: req.headers['xi-api-key'], model: j.model_id, text: j.text });
    const chars = [...j.text];
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      audio_base64: wav.toString('base64'),
      alignment: { characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.05), character_end_times_seconds: chars.map((_, i) => (i + 1) * 0.05) },
    }));
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

const out = path.join(here, 'out', 'voice-test');
// spawn (async), not spawnSync: a blocking call would freeze this process and the stand-in server inside it.
const r = await new Promise((resolve) => {
  const child = spawn(process.execPath, ['render.mjs', '--file', 'out/real-pack.json', '--only', '1', '--stills', '30', '--stills-only', '--out', out], {
    cwd: here,
    env: { ...process.env, ELEVENLABS_API_KEY: 'test-key-123', ELEVENLABS_BASE_URL: 'http://127.0.0.1:' + port, ELEVENLABS_VOICE_ID: 'voice-abc' },
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', (d) => (stdout += d));
  child.stderr.on('data', (d) => (stderr += d));
  child.on('close', (status) => resolve({ status, stdout, stderr }));
});
srv.close();
if (r.status !== 0 || !seen.length) console.log('--- render.mjs output (tail) ---\n' + ((r.stdout || '') + (r.stderr || '')).slice(-900));

let ok = true;
const check = (l, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + l + (c ? '' : '  -> ' + x)); if (!c) ok = false; };
check('render.mjs exited cleanly', r.status === 0, (r.stderr || r.stdout || '').slice(-300));
check('called the with-timestamps endpoint for the chosen voice', seen.length === 1 && /\/v1\/text-to-speech\/voice-abc\/with-timestamps/.test(seen[0].url), JSON.stringify(seen));
check('sent the API key header', !!seen[0] && seen[0].key === 'test-key-123');
check('voiceover text is exactly the scene lines joined', !!seen[0] && seen[0].text === expectedText, seen[0] && seen[0].text);
check('audio file was written for the bundle', fs.existsSync(path.join(here, 'public', 'audio', 'real-pack-1.mp3')));
check('stills were produced with voice timing applied', fs.existsSync(out) && fs.readdirSync(out).some((f) => /frame30\.png$/.test(f)));
console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);
