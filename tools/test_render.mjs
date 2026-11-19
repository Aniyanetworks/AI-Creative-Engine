// Offline test of online rendering: backend (storage + dispatch + status) and the GitHub Actions scripts,
// against local stand-ins for Supabase (REST + Storage) and the GitHub API.   Run: node tools/test_render.mjs
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createStorage } from '../app/server/storage.js';
import { createRenderer } from '../app/server/render.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUCKET = 'ace-videos';

// ---------- stand-ins ----------
const objects = new Map(); // "<path>" -> { body: Buffer, contentType }
const runs = new Map();    // id -> { result, status }
const github = { calls: [], fail: 0 };
const n8n = { calls: [], folderCalls: [], fail: false, folderFail: false, nothingToDelete: false };
let bucketCreated = false;

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (d) => chunks.push(d));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const u = new URL(req.url, 'http://x');
    const p = decodeURIComponent(u.pathname);
    const send = (code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(obj === undefined ? '' : JSON.stringify(obj)); };

    // GitHub
    let m = p.match(/^\/repos\/([^/]+\/[^/]+)\/actions\/workflows\/([^/]+)\/dispatches$/);
    if (m && req.method === 'POST') {
      github.calls.push({ repo: m[1], workflow: m[2], auth: req.headers.authorization, body: JSON.parse(body.toString() || '{}') });
      if (github.fail) return send(github.fail, { message: 'nope' });
      return send(204);
    }
    // n8n "save video to Drive" webhook
    if (p === '/webhook/drive' && req.method === 'POST' && /json/.test(req.headers['content-type'] || '')) {
      const j = JSON.parse(body.toString() || '{}');
      n8n.folderCalls.push(j);
      if (n8n.folderFail) return send(500, { message: 'Workflow error' });
      if (j.action === 'ensure') return send(200, { action: 'ensure', id: 'FOLDER_' + (j.names || []).filter(Boolean).slice(-1)[0], trail: ['A', 'B', 'C'], ok: true });
      if (j.action === 'delete') return send(200, { ok: true, deleted: !n8n.nothingToDelete, id: j.id || 'by-names' });
    }
    if (p === '/webhook/drive' && req.method === 'POST') {
      const text = body.toString('latin1');
      const name = (/name="name"\r\n\r\n([^\r]*)/.exec(text) || [])[1];
      const folderId = (/name="folderId"\r\n\r\n([^\r]*)/.exec(text) || [])[1];
      n8n.calls.push({ name, folderId, bytes: body.length, hasFile: /name="file"; filename="[^"]+"/.test(text) });
      if (n8n.fail) return send(500, { message: 'Workflow error' });
      return send(200, { id: 'DRV' + n8n.calls.length, url: 'https://drive.google.com/file/d/DRV' + n8n.calls.length + '/view' });
    }
    // PostgREST
    if (p === '/rest/v1/ace_runs') {
      const id = (u.searchParams.get('id') || '').replace('eq.', '');
      return send(200, runs.has(id) ? [{ id, ...runs.get(id) }] : []);
    }
    // Storage
    if (p === '/storage/v1/bucket' && req.method === 'POST') { if (bucketCreated) return send(409, { message: 'The resource already exists' }); bucketCreated = true; return send(200, { name: BUCKET }); }
    m = p.match(/^\/storage\/v1\/object\/list\/([^/]+)$/);
    if (m) {
      const prefix = JSON.parse(body.toString()).prefix;
      const list = [...objects.keys()].filter((k) => k.startsWith(prefix + '/')).map((k) => ({ name: k.slice(prefix.length + 1), id: 'id-' + k, metadata: { size: objects.get(k).body.length }, updated_at: '2026-11-19T00:00:00Z' }));
      return send(200, list);
    }
    m = p.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/);
    if (m && req.method === 'POST') return objects.has(m[2]) ? send(200, { signedURL: `/object/sign/${m[1]}/${m[2]}?token=tok123` }) : send(400, { message: 'Object not found' });
    m = p.match(/^\/storage\/v1\/object\/([^/]+)$/);
    if (m && req.method === 'DELETE') { for (const k of JSON.parse(body.toString()).prefixes) objects.delete(k); return send(200, []); }
    m = p.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
    if (m && req.method === 'POST') {
      const exists = objects.has(m[2]);
      if (exists && req.headers['x-upsert'] !== 'true') return send(409, { message: 'The resource already exists', error: 'Duplicate' });
      objects.set(m[2], { body, contentType: req.headers['content-type'] });
      return send(200, { Key: m[1] + '/' + m[2] });
    }
    if (m && req.method === 'GET') {
      if (!objects.has(m[2])) return send(400, { message: 'Object not found', error: 'not_found' });
      res.setHeader('content-type', objects.get(m[2]).contentType || 'application/octet-stream');
      return res.end(objects.get(m[2]).body);
    }
    send(404, { message: 'unmocked ' + req.method + ' ' + p });
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;

let ok = true;
const check = (label, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + label + (cond ? '' : '  -> ' + String(extra).slice(0, 220))); if (!cond) ok = false; };
const reset = () => { objects.clear(); github.calls.length = 0; github.fail = 0; };

// ---------- backend: renderer ----------
const storage = createStorage(base, 'secret-key', BUCKET);
const renderer = createRenderer({ storage, token: 'ghp_test', repo: 'acme/engine', apiBase: base });
const RUN = 'abc123def456';

reset();
let s = await renderer.status(RUN);
check('idle before any render', s.configured && s.status === 'idle' && s.videos.length === 0, JSON.stringify(s));

let d = await renderer.dispatch(RUN, { by: 'auto' });
check('automatic dispatch starts a render', d.started === true, JSON.stringify(d));
const call = github.calls[0];
check('GitHub got the right repo, workflow, ref and inputs', call && call.repo === 'acme/engine' && call.workflow === 'render-videos.yml' && call.body.ref === 'main' && call.body.inputs.run_id === RUN, JSON.stringify(call));
check('GitHub call is authenticated with the token', call && call.auth === 'Bearer ghp_test');
s = await renderer.status(RUN);
check('status is "queued" right after dispatch', s.status === 'queued', JSON.stringify(s));

d = await renderer.dispatch(RUN, { by: 'auto' });
check('second automatic trigger backs off (in progress)', d.started === false && d.reason === 'in-progress' && github.calls.length === 1, JSON.stringify(d));

// simulate the workflow finishing
objects.set(`${RUN}/2-second-video.mp4`, { body: Buffer.alloc(2048), contentType: 'video/mp4' });
objects.set(`${RUN}/1-first-video.mp4`, { body: Buffer.alloc(4096), contentType: 'video/mp4' });
objects.set(`${RUN}/status.json`, { body: Buffer.from(JSON.stringify({ status: 'done', requestedAt: new Date().toISOString(), runUrl: 'https://github.com/acme/engine/actions/runs/1' })), contentType: 'application/json' });
s = await renderer.status(RUN);
check('done status lists the MP4s in order, without status.json', s.status === 'done' && s.videos.map((v) => v.n).join() === '1,2' && s.videos.every((v) => /\.mp4$/.test(v.name)), JSON.stringify(s));
check('videos have signed play and download links', s.videos[0].url.includes('token=tok123') && s.videos[0].downloadUrl.includes('download=1-first-video.mp4'), JSON.stringify(s.videos[0]));
check('keeps the GitHub run link', s.runUrl === 'https://github.com/acme/engine/actions/runs/1');

d = await renderer.dispatch(RUN, { by: 'auto' });
check('automatic trigger does not re-render a finished run', d.started === false && d.reason === 'already-attempted', JSON.stringify(d));
d = await renderer.dispatch(RUN, { by: 'me@example.com', force: true });
check('the button (force) renders again', d.started === true && github.calls.length === 2, JSON.stringify(d));

// stale render
objects.set(`${RUN}/status.json`, { body: Buffer.from(JSON.stringify({ status: 'rendering', requestedAt: new Date(Date.now() - 2 * 3600e3).toISOString() })), contentType: 'application/json' });
s = await renderer.status(RUN);
check('a render stuck for 2 hours is reported as failed', s.status === 'failed' && /45 minutes/.test(s.message), JSON.stringify(s));
d = await renderer.dispatch(RUN, { by: 'auto' });
check('an automatic trigger never restarts a failed render (no loops, no wasted credits)', d.started === false && d.reason === 'already-attempted', JSON.stringify(d));
d = await renderer.dispatch(RUN, { by: 'me@example.com', force: true });
check('the button can restart a stale or failed render', d.started === true, JSON.stringify(d));

// GitHub refuses
reset();
github.fail = 403;
let threw = null;
try { await renderer.dispatch('zzz999yyy888', { by: 'auto' }); } catch (e) { threw = e; }
check('GitHub refusal raises a helpful error', !!threw && /HTTP 403/.test(threw.message) && /Actions read and write/.test(threw.message), threw && threw.message);
s = await renderer.status('zzz999yyy888');
check('refusal is recorded as failed so the UI can show it', s.status === 'failed' && /GitHub refused/.test(s.message), JSON.stringify(s));

// shouldAuto
const full = { options: { dryRun: false, maxImages: 20, maxVideos: 5 } };
const withScenes = { videos: [{ scenes: [{ vo: 'x' }] }] };
check('auto-render: full run with storyboards', renderer.shouldAuto(full, withScenes) === true);
check('auto-render: not for dry runs', renderer.shouldAuto({ options: { dryRun: true, maxVideos: 0 } }, withScenes) === false);
check('auto-render: not for image tests (maxVideos 0)', renderer.shouldAuto({ options: { dryRun: false, maxImages: 1, maxVideos: 0 } }, withScenes) === false);
check('auto-render: not without storyboards', renderer.shouldAuto(full, { videos: [{ scenes: [] }] }) === false);
const off = createRenderer({ storage, token: '', repo: 'acme/engine', apiBase: base });
check('without a GitHub token online rendering is off', off.configured === false && off.shouldAuto(full, withScenes) === false && (await off.status(RUN)).configured === false);

// ---------- GitHub Actions scripts (run as separate processes, like the runner does) ----------
function run(script, args, env) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [script, ...args], { cwd: root, env: { ...process.env, SUPABASE_URL: base, SUPABASE_SERVICE_KEY: 'secret-key', ...env } });
    let out = '', err = '';
    c.stdout.on('data', (x) => (out += x)); c.stderr.on('data', (x) => (err += x));
    c.on('close', (code) => resolve({ code, out, err }));
  });
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'render-ci-'));
const ghOut = path.join(tmp, 'github_output');
const RUN2 = 'run2abcdef12';
reset();
runs.set(RUN2, { status: 'success', result: { videos: [{ id: 1, scenes: [{}] }, { id: 2, scenes: [{}] }, { id: 3, scenes: [] }, { id: 4, scenes: [{}] }] } });

let r = await run('video/ci/plan.mjs', [], { RUN_ID: RUN2, GITHUB_OUTPUT: ghOut, GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'acme/engine', GITHUB_RUN_ID: '42' });
const matrix = (fs.existsSync(ghOut) ? fs.readFileSync(ghOut, 'utf8') : '').match(/matrix=(.*)/);
check('plan: matrix lists only videos that have storyboards', r.code === 0 && matrix && JSON.parse(matrix[1]).n.join() === '1,2,4', r.err + r.out + (matrix && matrix[1]));
let st = JSON.parse(objects.get(RUN2 + '/status.json').body.toString());
check('plan: marks the render as started with the GitHub run link', st.status === 'rendering' && st.total === 3 && st.runUrl === 'https://github.com/acme/engine/actions/runs/42', JSON.stringify(st));

fs.writeFileSync(ghOut, '');
r = await run('video/ci/plan.mjs', [], { RUN_ID: RUN2, GITHUB_OUTPUT: ghOut, ONLY: '2' });
check('plan: --only picks a single video', r.code === 0 && fs.readFileSync(ghOut, 'utf8').includes('"n":[2]'), r.err + fs.readFileSync(ghOut, 'utf8'));

r = await run('video/ci/plan.mjs', [], { RUN_ID: 'nosuchrun123' });
check('plan: unknown run fails and records why', r.code === 1 && !!objects.get('nosuchrun123/status.json') && JSON.parse(objects.get('nosuchrun123/status.json').body.toString()).status === 'failed', 'exit ' + r.code + ' | stored: ' + JSON.stringify([...objects.keys()]) + ' | err: ' + r.err);
r = await run('video/ci/plan.mjs', [], { RUN_ID: '../../etc' });
check('plan: rejects a malformed run id', r.code === 1 && /malformed/.test(r.err), r.err);

const outDir = path.join(tmp, 'out'); fs.mkdirSync(outDir);
fs.writeFileSync(path.join(outDir, '1-missed-call.mp4'), Buffer.alloc(20000, 1));
fs.writeFileSync(path.join(outDir, '2-other.mp4'), Buffer.alloc(30000, 2));
r = await run('video/ci/upload.mjs', [RUN2, outDir], {});
check('upload: stores each MP4 under the run folder as video/mp4', r.code === 0 && objects.get(RUN2 + '/1-missed-call.mp4').contentType === 'video/mp4' && objects.get(RUN2 + '/2-other.mp4').body.length === 30000, r.err + r.out);
fs.writeFileSync(path.join(outDir, '9-tiny.mp4'), Buffer.alloc(100));
r = await run('video/ci/upload.mjs', [RUN2, outDir], {});
check('upload: refuses a broken (tiny) render', r.code !== 0 && /broken/.test(r.err), r.err);
r = await run('video/ci/upload.mjs', [RUN2, path.join(tmp, 'empty')], {});
check('upload: fails when there is nothing to upload', r.code === 1 && /No \.mp4/.test(r.err), r.err);

r = await run('video/ci/finish.mjs', [], { RUN_ID: RUN2, PREPARE_RESULT: 'success', RENDER_RESULT: 'success' });
st = JSON.parse(objects.get(RUN2 + '/status.json').body.toString());
check('finish: success is recorded as done with the file list', r.code === 0 && st.status === 'done' && st.videos.length >= 2 && st.finishedAt, JSON.stringify(st));
r = await run('video/ci/finish.mjs', [], { RUN_ID: RUN2, PREPARE_RESULT: 'success', RENDER_RESULT: 'failure' });
st = JSON.parse(objects.get(RUN2 + '/status.json').body.toString());
check('finish: a failed render is recorded as failed with a hint to the log', st.status === 'failed' && /GitHub Actions log/.test(st.message), JSON.stringify(st));
r = await run('video/ci/finish.mjs', [], { RUN_ID: RUN2, PREPARE_RESULT: 'failure', RENDER_RESULT: 'skipped' });
st = JSON.parse(objects.get(RUN2 + '/status.json').body.toString());
check('finish: a failed start is recorded as failed', st.status === 'failed' && /could not start/.test(st.message), JSON.stringify(st));
reset();
r = await run('video/ci/finish.mjs', [], { RUN_ID: 'emptyrun12345', PREPARE_RESULT: 'success', RENDER_RESULT: 'success' });
st = JSON.parse(objects.get('emptyrun12345/status.json').body.toString());
check('finish: "success" with no uploaded files is not reported as done', st.status === 'failed' && /no video files/.test(st.message), JSON.stringify(st));

// ---------- the real server routes, running as its own process against the same stand-ins ----------
const PORT = 8799;
const srv = spawn(process.execPath, ['app/server/index.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT), SUPABASE_URL: base, SUPABASE_SERVICE_KEY: 'secret-key', AUTH_REQUIRED: 'false', N8N_DRIVE_WEBHOOK_URL: base + '/webhook/drive', GH_DISPATCH_TOKEN: 'ghp_route', GITHUB_REPO: 'acme/engine', GITHUB_API_URL: base },
});
let srvLog = '';
srv.stdout.on('data', (x) => (srvLog += x)); srv.stderr.on('data', (x) => (srvLog += x));
for (let i = 0; i < 50 && !srvLog.includes('API on'); i++) await new Promise((r) => setTimeout(r, 200));
const api = async (method, p) => { const x = await fetch('http://127.0.0.1:' + PORT + p, { method }); let j = null; try { j = await x.json(); } catch { /* none */ } return { status: x.status, json: j }; };

reset();
runs.set('routerun0001', { status: 'success', result: { videos: [{ id: 1, scenes: [{ vo: 'x' }] }] } });
runs.set('routerun0002', { status: 'running', result: null });
runs.set('routerun0003', { status: 'success', result: { videos: [{ id: 1, scenes: [] }] } });

let x = await api('GET', '/api/jobs/routerun0001/videos');
check('route: videos status is idle for a fresh run', x.status === 200 && x.json.configured === true && x.json.status === 'idle', JSON.stringify(x));
x = await api('POST', '/api/jobs/routerun0002/render-videos');
check('route: cannot render a run that has not finished', x.status === 409 && /finished/.test(x.json.error), JSON.stringify(x));
x = await api('POST', '/api/jobs/routerun0003/render-videos');
check('route: cannot render a run without storyboards', x.status === 409 && /storyboards/.test(x.json.error), JSON.stringify(x));
x = await api('POST', '/api/jobs/doesnotexist1/render-videos');
check('route: unknown run is a 404', x.status === 404, JSON.stringify(x));
x = await api('POST', '/api/jobs/routerun0001/render-videos');
check('route: the button starts a render through GitHub', x.status === 200 && x.json.ok === true && github.calls.length === 1 && github.calls[0].body.inputs.run_id === 'routerun0001' && github.calls[0].auth === 'Bearer ghp_route', JSON.stringify(x) + JSON.stringify(github.calls));
x = await api('POST', '/api/jobs/routerun0001/render-videos');
check('route: clicking again while rendering is refused', x.status === 409 && /already in progress/.test(x.json.error) && github.calls.length === 1, JSON.stringify(x));
x = await api('GET', '/api/jobs/routerun0001/videos');
check('route: status now shows the render is queued', x.json.status === 'queued', JSON.stringify(x));
// ---- voice choice ----
x = await api('GET', '/api/voices');
check('route: voices fall back to stock voices without an ElevenLabs key', x.status === 200 && x.json.source === 'stock' && x.json.voices.length >= 5 && x.json.voices.every((v) => v.id && v.name), JSON.stringify(x).slice(0, 200));
runs.set('routerun0004', { status: 'success', result: { videos: [{ id: 1, scenes: [{ vo: 'x' }] }] } });
const post = async (p, body) => { const y = await fetch('http://127.0.0.1:' + PORT + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: y.status, json: await y.json().catch(() => null) }; };
x = await post('/api/jobs/routerun0004/render-videos', { voiceId: 'bad id!' });
check('route: a malformed voice id is rejected before anything starts', x.status === 400 && !github.calls.some((c) => c.body.inputs.run_id === 'routerun0004'), JSON.stringify(x));
x = await post('/api/jobs/routerun0004/render-videos', { voiceId: 'pNInz6obpgDQGcFmaJgB' });
const vc = github.calls.find((c) => c.body.inputs.run_id === 'routerun0004');
check('route: the chosen voice is passed to the workflow', x.status === 200 && vc && vc.body.inputs.voice_id === 'pNInz6obpgDQGcFmaJgB' && vc.body.inputs.drive_only === 'false', JSON.stringify(vc));
x = await api('GET', '/api/jobs/routerun0004/videos');
check('route: the chosen voice is shown in the status', x.json.voiceId === 'pNInz6obpgDQGcFmaJgB', JSON.stringify(x.json));

const { listVoices } = await import('../app/server/voices.js');
let v = await listVoices({ apiKey: 'k', base, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }) });
check('voices: a key without Voices:Read falls back to stock voices', v.source === 'stock' && v.voices.length >= 5);
v = await listVoices({ apiKey: 'k', fetchImpl: async () => ({ ok: true, json: async () => ({ voices: [{ voice_id: 'AAAAAAAAAAAAAAAAAAAA', name: 'Mine', labels: { accent: 'british', gender: 'male' }, preview_url: 'https://x/p.mp3' }, { voice_id: 'bad', name: 'Junk' }] }) }) });
check('voices: lists the account voices with notes and previews, skipping junk ids', v.source === 'account' && v.voices.length === 1 && v.voices[0].name === 'Mine' && /british/.test(v.voices[0].note) && v.voices[0].previewUrl === 'https://x/p.mp3', JSON.stringify(v));

// ---- Google Drive copies through n8n ----
reset();
x = await api('POST', '/api/jobs/routerun0001/save-to-drive');
check('route: save-to-drive needs rendered videos first', x.status === 409 && /Render the videos first/.test(x.json.error), JSON.stringify(x));
const DR = 'driverun0001';
runs.set(DR, { status: 'success', result: { videos: [{ id: 1, scenes: [{ vo: 'x' }] }, { id: 2, scenes: [{ vo: 'y' }] }] } });
objects.set(DR + '/1-first.mp4', { body: Buffer.alloc(20000, 7), contentType: 'video/mp4' });
objects.set(DR + '/2-second.mp4', { body: Buffer.alloc(25000, 8), contentType: 'video/mp4' });
objects.set(DR + '/status.json', { body: Buffer.from(JSON.stringify({ status: 'done', requestedAt: new Date().toISOString() })), contentType: 'application/json' });
x = await api('POST', '/api/jobs/' + DR + '/save-to-drive');
const dc = github.calls.find((c) => c.body.inputs.run_id === DR);
check('route: save-to-drive starts the workflow in Drive-only mode (no re-render)', x.status === 200 && dc && dc.body.inputs.drive_only === 'true', JSON.stringify(x) + JSON.stringify(dc));
x = await api('GET', '/api/jobs/' + DR + '/videos');
check('route: status says the Drive copy is in progress', x.json.task === 'drive' && x.json.status === 'queued', JSON.stringify(x.json));

const hookUrl = base + '/webhook/drive';
r = await run('video/ci/drive.mjs', [DR, '--from-storage', '--strict'], { N8N_DRIVE_WEBHOOK_URL: hookUrl });
check('drive: downloads each stored video and sends it to n8n with a run-prefixed name', r.code === 0 && n8n.calls.length === 2 && n8n.calls.every((c) => c.hasFile && c.bytes > 20000) && n8n.calls[0].name === '1-first.mp4' && n8n.calls.every((c) => c.folderId === 'FOLDER_Videos') && n8n.folderCalls.length === 1 && n8n.folderCalls[0].names.length === 3 && n8n.folderCalls[0].names[2] === 'Videos', r.err + r.out + JSON.stringify(n8n.calls));
x = await api('GET', '/api/jobs/' + DR + '/videos');
check('drive: the app gets a Drive link for every video', x.json.videos.length === 2 && x.json.videos.every((q) => /drive\.google\.com\/file\/d\/DRV/.test(q.driveUrl)) && x.json.videos.every((q) => !/drive\.json/.test(q.name)), JSON.stringify(x.json.videos));

n8n.fail = true; n8n.calls.length = 0;
const dir2 = path.join(tmp, 'out2'); fs.mkdirSync(dir2); fs.writeFileSync(path.join(dir2, '3-third.mp4'), Buffer.alloc(30000, 3));
r = await run('video/ci/drive.mjs', [DR, dir2], { N8N_DRIVE_WEBHOOK_URL: hookUrl });
check('drive: a failing n8n does not fail the render job (best effort)', r.code === 0 && /failed for 3-third/.test(r.err), r.err);
const note = JSON.parse(objects.get(DR + '/3-third.mp4.drive.json').body.toString());
check('drive: the failure is recorded for the app instead of a link', !!note.error && !note.url, JSON.stringify(note));
r = await run('video/ci/drive.mjs', [DR, '--from-storage', '--strict'], { N8N_DRIVE_WEBHOOK_URL: hookUrl });
check('drive: --strict fails the job when nothing could be uploaded', r.code === 1, 'exit ' + r.code);
r = await run('video/ci/drive.mjs', [DR, dir2], { N8N_DRIVE_WEBHOOK_URL: '' });
check('drive: without the webhook URL the optional step is a harmless no-op', r.code === 0 && /not set/.test(r.err), r.err);
r = await run('video/ci/drive.mjs', [DR, '--from-storage', '--strict'], { N8N_DRIVE_WEBHOOK_URL: '' });
check('drive: ...but the explicit button reports it (strict)', r.code === 1, 'exit ' + r.code);
n8n.fail = false;

r = await run('video/ci/finish.mjs', [], { RUN_ID: DR, PREPARE_RESULT: 'success', RENDER_RESULT: 'skipped', DRIVE_RESULT: 'success', DRIVE_ONLY: 'true' });
st = JSON.parse(objects.get(DR + '/status.json').body.toString());
check('finish: a Drive-only run (render skipped) ends as done', r.code === 0 && st.status === 'done' && !st.message, JSON.stringify(st));
r = await run('video/ci/finish.mjs', [], { RUN_ID: DR, PREPARE_RESULT: 'success', RENDER_RESULT: 'skipped', DRIVE_RESULT: 'failure', DRIVE_ONLY: 'true' });
st = JSON.parse(objects.get(DR + '/status.json').body.toString());
check('finish: a failed Drive copy leaves the videos as done and explains', st.status === 'done' && /Google Drive failed/.test(st.message), JSON.stringify(st));

const wf = fs.readFileSync(path.join(root, '.github', 'workflows', 'render-videos.yml'), 'utf8');
check('workflow: declares voice_id and drive_only inputs, the Drive secret, and a Drive-only job', /voice_id:/.test(wf) && /drive_only:/.test(wf) && /N8N_DRIVE_WEBHOOK_URL: \$\{\{ secrets\.N8N_DRIVE_WEBHOOK_URL \}\}/.test(wf) && /\n  drive:\n/.test(wf) && /inputs\.voice_id \|\| vars\.ELEVENLABS_VOICE_ID/.test(wf));

// ---- choosing which videos to render ----
runs.set('routerun0005', { status: 'success', result: { videos: [{ id: 1, scenes: [{ vo: 'a' }] }, { id: 2, scenes: [{ vo: 'b' }] }, { id: 3, scenes: [] }] } });
x = await post('/api/jobs/routerun0005/render-videos', { only: [2, 'x'] });
check('route: a malformed video selection is rejected', x.status === 400 && !github.calls.some((c) => c.body.inputs.run_id === 'routerun0005'), JSON.stringify(x));
x = await post('/api/jobs/routerun0005/render-videos', { only: [3] });
check('route: a video without a storyboard cannot be selected', x.status === 400 && /no storyboard/.test(x.json.error), JSON.stringify(x));
x = await post('/api/jobs/routerun0005/render-videos', { only: [2, 1, 2] });
const oc = github.calls.find((c) => c.body.inputs.run_id === 'routerun0005');
check('route: the selection goes to the workflow sorted and de-duplicated', x.status === 200 && oc && oc.body.inputs.only === '1,2', JSON.stringify(oc));
x = await api('GET', '/api/jobs/routerun0005/videos');
check('route: the status remembers which videos were requested', Array.isArray(x.json.only) && x.json.only.join() === '1,2', JSON.stringify(x.json));
runs.set('routerun0006', { status: 'success', result: { videos: [{ id: 1, scenes: [{ vo: 'a' }] }] } });
await post('/api/jobs/routerun0006/render-videos', {});
check('route: no selection means every video (empty "only")', github.calls.find((c) => c.body.inputs.run_id === 'routerun0006').body.inputs.only === '');

// ---- Drive folder structure and clean-up on delete ----
const delApi = (id) => api('DELETE', '/api/jobs/' + id);
runs.set('folderrun001', { created_at: '2026-11-20T10:00:00Z', url: 'https://www.acme-hvac.com', result: { business: 'Acme: Heating / Cooling', videos: [{ id: 1, scenes: [{ vo: 'x' }] }] }, status: 'success' });
n8n.folderCalls.length = 0;
fs.writeFileSync(ghOut, '');
r = await run('video/ci/plan.mjs', [], { RUN_ID: 'folderrun001', GITHUB_OUTPUT: ghOut, N8N_DRIVE_WEBHOOK_URL: hookUrl });
const planOut = fs.readFileSync(ghOut, 'utf8');
check('plan: prepares the Drive folder once and passes its id on', r.code === 0 && n8n.folderCalls.length === 1 && /folder=FOLDER_Videos/.test(planOut), r.err + planOut);
check('plan: folder path is <business>/<date · run id>/Videos with unsafe characters removed', JSON.stringify(n8n.folderCalls[0].names) === JSON.stringify(['Acme Heating Cooling', '2026-11-20 · folder', 'Videos']), JSON.stringify(n8n.folderCalls[0]));
runs.set('folderrun002', { created_at: '2026-11-20T10:00:00Z', url: 'https://x.test', result: { business: 'Acme', drive_folder_id: 'MAINRUNFOLDER', videos: [{ id: 1, scenes: [{ vo: 'x' }] }] }, status: 'success' });
n8n.folderCalls.length = 0; fs.writeFileSync(ghOut, '');
r = await run('video/ci/plan.mjs', [], { RUN_ID: 'folderrun002', GITHUB_OUTPUT: ghOut, N8N_DRIVE_WEBHOOK_URL: hookUrl });
check('plan: when the main workflow already made the run folder, Videos goes inside it', n8n.folderCalls.length === 1 && n8n.folderCalls[0].parentId === 'MAINRUNFOLDER' && JSON.stringify(n8n.folderCalls[0].names) === '["Videos"]', JSON.stringify(n8n.folderCalls));
n8n.folderCalls.length = 0; n8n.calls.length = 0;
const dir3 = path.join(tmp, 'out3'); fs.mkdirSync(dir3); fs.writeFileSync(path.join(dir3, '1-a.mp4'), Buffer.alloc(30000, 5));
r = await run('video/ci/drive.mjs', ['folderrun001', dir3], { N8N_DRIVE_WEBHOOK_URL: hookUrl, DRIVE_VIDEOS_FOLDER_ID: 'PREPARED' });
check('drive: uses the folder prepared by the plan step without creating another', r.code === 0 && n8n.folderCalls.length === 0 && n8n.calls[0].folderId === 'PREPARED', r.err + JSON.stringify(n8n.calls));

// deleting a run
objects.set('folderrun001/1-a.mp4', { body: Buffer.alloc(100), contentType: 'video/mp4' });
objects.set('folderrun001/status.json', { body: Buffer.from('{}'), contentType: 'application/json' });
n8n.folderCalls.length = 0;
x = await delApi('folderrun001');
check('delete: the run folder is looked up by business and run name, and trashed in Drive', x.status === 200 && x.json.drive === 'deleted' && n8n.folderCalls.length === 1 && n8n.folderCalls[0].action === 'delete' && JSON.stringify(n8n.folderCalls[0].names) === JSON.stringify(['Acme Heating Cooling', '2026-11-20 · folder']), JSON.stringify(x.json) + JSON.stringify(n8n.folderCalls));
check('delete: the stored videos are removed too', x.json.videos === 'deleted' && ![...objects.keys()].some((k) => k.startsWith('folderrun001/')), JSON.stringify([...objects.keys()]));
n8n.folderCalls.length = 0;
x = await delApi('folderrun002');
check('delete: a run whose workflow saved the folder id deletes exactly that folder', x.json.drive === 'deleted' && n8n.folderCalls[0].id === 'MAINRUNFOLDER' && !n8n.folderCalls[0].names, JSON.stringify(n8n.folderCalls));
runs.set('folderrun003', { created_at: '2026-11-20T10:00:00Z', url: 'https://x.test', result: { business: 'Acme', videos: [] }, status: 'success' });
n8n.nothingToDelete = true;
x = await delApi('folderrun003');
check('delete: nothing in Drive for the run is fine', x.status === 200 && x.json.drive === 'none', JSON.stringify(x.json));
n8n.nothingToDelete = false; n8n.folderFail = true;
runs.set('folderrun004', { created_at: '2026-11-20T10:00:00Z', url: 'https://x.test', result: { business: 'Acme', videos: [] }, status: 'success' });
x = await delApi('folderrun004');
check('delete: if Drive cannot be reached the run is still removed and the app is told', x.status === 200 && x.json.ok === true && x.json.drive === 'failed' && !!x.json.driveError, JSON.stringify(x.json));
n8n.folderFail = false;
runs.set('folderrun005', { created_at: '2026-11-20T10:00:00Z', url: 'https://x.test', result: null, status: 'running' });
n8n.folderCalls.length = 0;
x = await delApi('folderrun005');
check('delete: a run with no result yet does not touch Drive', x.status === 200 && x.json.drive === 'none' && n8n.folderCalls.length === 0, JSON.stringify(x.json));

srv.kill();

server.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);
