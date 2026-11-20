#!/usr/bin/env node
// Renders the storyboards produced by the Creative Engine into 1080x1920 MP4 ads.
//
//   node render.mjs <runId>              run saved in Supabase (needs SUPABASE_URL + SUPABASE_SERVICE_KEY in ../.env)
//   node render.mjs --file pack.json     an ad pack downloaded from the app (Report tab > Download .json)
//   node render.mjs --demo               built-in sample, silent: checks that rendering works on this machine
//
// Options:  --only 1,3     only these video numbers      --no-voice   silent videos with captions
//           --stills 20,90 also save PNG stills at these frames (to inspect the design)
//           --require-voice  fail instead of rendering silent videos when ELEVENLABS_API_KEY is missing (used in the cloud)
//           --stills-only  with --stills: skip rendering the video (fast design check)
//           --out <dir>    output folder (default video/out/<run>)      --crf 16   quality (lower = better; default 16, raised automatically if a file would be too big)
//
// Voiceover: ElevenLabs. Put ELEVENLABS_API_KEY (and optionally ELEVENLABS_VOICE_ID) in ../.env.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition, ensureBrowser } from '@remotion/renderer';
import { buildTimeline, estimateAlignment } from './timing.mjs';
import { ensureSfx } from './scripts/make-sfx.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

// ---------- args ----------
const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const opt = (n) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : undefined; };
const VALUED = new Set(['--file', '--only', '--stills', '--out', '--crf']);
const positional = argv.filter((a, i) => !a.startsWith('--') && !VALUED.has(argv[i - 1]));
const runId = positional[0];

// ---------- env ----------
const env = {};
try {
  for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0 && !line.trim().startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
} catch { /* optional */ }
const pick = (n) => String(process.env[n] || env[n] || '').trim();

const slug = (s) => String(s || 'video').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'video';
const log = (...a) => console.log(...a);

// ---------- load the ad pack ----------
async function loadPack() {
  if (flag('demo')) {
    const demo = JSON.parse(fs.readFileSync(path.join(here, 'demo.json'), 'utf8'));
    return { tag: 'demo', pack: { business: demo.brand.name, brief: { brand_colors: demo.brand.colors, business_name: demo.brand.name }, videos: [{ id: 1, title: demo.title, cta: demo.cta, scenes: demo.scenes }] } };
  }
  const file = opt('file');
  if (file) {
    const pack = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    return { tag: slug(path.basename(file, '.json')), pack: pack.result || pack };
  }
  if (!runId) throw new Error('Give a run id (node render.mjs <runId>), --file <pack.json>, or --demo.');
  const base = pick('SUPABASE_URL').replace(/\/+$/, ''); const key = pick('SUPABASE_SERVICE_KEY');
  if (!base || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are needed in ../.env to load a run by id. Or download the pack from the app and use --file.');
  const r = await fetch(`${base}/rest/v1/ace_runs?id=eq.${encodeURIComponent(runId)}&select=result,status`, { headers: { apikey: key, Authorization: 'Bearer ' + key } });
  if (!r.ok) throw new Error('Supabase answered HTTP ' + r.status + ' while loading the run.');
  const rows = await r.json();
  if (!rows[0]) throw new Error('No run with id ' + runId + '. Copy the id from the "Render videos" box on the run page.');
  if (!rows[0].result) throw new Error('That run has no result yet (status: ' + rows[0].status + ').');
  return { tag: runId, pack: rows[0].result };
}

// ---------- ElevenLabs voiceover with word timing ----------
async function voiceover(text, file) {
  const voice = pick('ELEVENLABS_VOICE_ID') || '21m00Tcm4TlvDq8ikWAM'; // "Rachel", a stock voice
  const model = pick('ELEVENLABS_MODEL') || 'eleven_multilingual_v2';
  const base = (pick('ELEVENLABS_BASE_URL') || 'https://api.elevenlabs.io').replace(/\/+$/, ''); // overridable for tests
  const r = await fetch(`${base}/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': pick('ELEVENLABS_API_KEY'), 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.25, use_speaker_boost: true } }),
  });
  if (!r.ok) {
    const body = await r.text();
    const hint = r.status === 401 ? ' (check ELEVENLABS_API_KEY)' : r.status === 402 || /quota/i.test(body) ? ' (ElevenLabs credits used up)' : r.status === 404 ? ' (check ELEVENLABS_VOICE_ID)' : '';
    throw new Error('ElevenLabs HTTP ' + r.status + hint + ': ' + body.slice(0, 160));
  }
  const j = await r.json();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(j.audio_base64, 'base64'));
  return j.alignment || j.normalized_alignment;
}

// ---------- main ----------
const { tag, pack } = await loadPack();
const videos = (pack.videos || []).map((v, i) => ({ ...v, n: v.id || i + 1 })).filter((v) => Array.isArray(v.scenes) && v.scenes.length);
if (!videos.length) throw new Error('This run has no video storyboards. Re-run the job with the latest workflow (videos need "scenes").');
const only = opt('only') ? opt('only').split(',').map((x) => parseInt(x, 10)) : null;
const todo = videos.filter((v) => !only || only.includes(v.n));
const brief = pack.brief || {};
// Colours the person chose in the app (Brief tab) win over the ones detected on the website.
const custom = Array.isArray(pack.brand_colors_override) ? pack.brand_colors_override.filter((c) => /^#[0-9a-f]{6}$/i.test(c)) : [];
const brand = { name: pack.business || brief.business_name || 'Your brand', colors: custom.length ? custom : (brief.brand_colors || []) };

if (flag('require-voice') && !pick('ELEVENLABS_API_KEY')) throw new Error('ELEVENLABS_API_KEY is missing, so the videos would have no voiceover. Add it (for cloud renders: GitHub repository secret ELEVENLABS_API_KEY).');
const wantVoice = !flag('no-voice') && !flag('demo') && !!pick('ELEVENLABS_API_KEY');
if (!flag('no-voice') && !flag('demo') && !wantVoice) log('No ELEVENLABS_API_KEY in ../.env: rendering silent videos with captions.\n');

const publicDir = path.join(here, 'public');
const outDir = path.resolve(opt('out') || path.join(here, 'out', slug(tag)));
fs.mkdirSync(outDir, { recursive: true });

log(`Brand: ${brand.name} | colours: ${brand.colors.join(', ') || 'default'} | videos: ${todo.map((v) => v.n).join(', ')}\n`);

const jobs = [];
for (const v of todo) {
  const text = v.scenes.map((s) => s.vo).join(' ');
  let alignment; let audioFile = null;
  if (wantVoice) {
    process.stdout.write(`Video ${v.n}: voiceover… `);
    const rel = `audio/${slug(tag)}-${v.n}.mp3`;
    alignment = await voiceover(text, path.join(publicDir, rel));
    audioFile = rel;
    log('done');
  } else {
    alignment = estimateAlignment(text);
  }
  const tl = buildTimeline({ scenes: v.scenes, alignment, leadSec: wantVoice ? 0.4 : 0.3 });
  jobs.push({ v, audioFile, tl });
}

ensureSfx(publicDir);
log('\nPreparing the renderer (the first run downloads a headless Chrome, about 100 MB)…');
await ensureBrowser();
log('Bundling the video project…');
const serveUrl = await bundle({ entryPoint: path.join(here, 'src', 'index.ts'), publicDir });

const stills = opt('stills') ? opt('stills').split(',').map((x) => parseInt(x, 10)) : [];
const results = [];
for (const { v, audioFile, tl } of jobs) {
  const inputProps = { brand, title: v.title || '', cta: v.cta || '', scenes: tl.scenes, words: tl.words, audioFile, audioStartSec: tl.leadSec, durationSec: tl.durationSec };
  const composition = await selectComposition({ serveUrl, id: 'AdVideo', inputProps });
  const base = `${v.n}-${slug(v.title)}`;
  for (const f of stills) {
    await renderStill({ composition, serveUrl, inputProps, frame: Math.min(f, composition.durationInFrames - 1), output: path.join(outDir, `${base}-frame${f}.png`), overwrite: true });
  }
  if (flag('stills-only')) { results.push(...stills.map((f) => `${base}-frame${f}.png`)); continue; }
  const outputLocation = path.join(outDir, base + '.mp4');
  process.stdout.write(`Rendering video ${v.n} (${tl.durationSec.toFixed(1)}s)  0%`);
  // High quality: slow x264 preset, sharp frames (JPEG quality 95 instead of the default 80, which softens text edges), BT.709 colour
  // and a clean audio bitrate. Supabase's free plan refuses files over 50 MB, so if a video comes out over 45 MB it is encoded again
  // a little smaller (rare: a 35 second ad is normally 15 to 25 MB).
  const MAX_MB = 45;
  let crf = parseInt(opt('crf') || '16', 10);
  for (let attempt = 0; attempt < 3; attempt++) {
    await renderMedia({
      composition, serveUrl, inputProps, outputLocation, codec: 'h264', crf, overwrite: true,
      x264Preset: 'slow', jpegQuality: 95, pixelFormat: 'yuv420p', colorSpace: 'bt709', audioBitrate: '192k',
      onProgress: ({ progress }) => process.stdout.write(`\rRendering video ${v.n} (${tl.durationSec.toFixed(1)}s)  ${(progress * 100).toFixed(0)}%`),
    });
    if (fs.statSync(outputLocation).size / 1048576 <= MAX_MB || opt('crf')) break;
    crf += 3; log(`\r${' '.repeat(60)}\rVideo ${v.n} is over ${MAX_MB} MB: encoding again at crf ${crf}`);
  }
  const mb = (fs.statSync(outputLocation).size / 1048576).toFixed(1);
  log(`\r${' '.repeat(60)}\rVideo ${v.n}: ${outputLocation} (${tl.durationSec.toFixed(1)}s, ${mb} MB${audioFile ? ', with voiceover' : ', silent'})`);
  results.push(outputLocation);
}
log(`\nDone. ${results.length} video(s) in ${outDir}`);
