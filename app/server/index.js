// Local backend for the AI Creative Engine UI.
// Keeps the n8n API key out of the browser, starts runs through the workflow's webhook,
// and turns n8n executions into progress + results.
import express from 'express';
import fs from 'fs';
import path from 'path';
import dns from 'dns';
import net from 'net';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createSupabaseStore, createLocalStore } from './store.js';
import { createAuth, rateLimiter } from './auth.js';

dns.setDefaultResultOrder('ipv4first');
if (net.setDefaultAutoSelectFamilyAttemptTimeout) net.setDefaultAutoSelectFamilyAttemptTimeout(5000);

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(here, '..', '..');
const PORT = Number(process.env.PORT || 8787);
const WORKFLOW_NAME = 'AI Creative Engine: URL to Ad Pack';

// ---- config from the project's .env (never sent to the browser) ----
const env = {};
try {
  for (const line of fs.readFileSync(path.join(projectRoot, '.env'), 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0 && !line.trim().startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
} catch { /* handled below */ }
const N8N_BASE = (process.env.N8N_BASE_URL || env.N8N_BASE_URL || 'https://n8n.srv1300653.hstgr.cloud').replace(/\/+$/, '');
const N8N_KEY = process.env.N8N_API || env.N8N_API;
let webhookPath = '';
try { webhookPath = fs.readFileSync(path.join(projectRoot, 'workflow', '.webhook-path'), 'utf8').trim(); } catch { /* handled in status */ }

// ---- run storage: Supabase when configured, otherwise a local file ----
const SUPABASE_URL = process.env.SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_KEY;
const store = SUPABASE_URL && SUPABASE_KEY
  ? createSupabaseStore(SUPABASE_URL, SUPABASE_KEY)
  : createLocalStore(path.join(here, 'data'));
const FINAL = new Set(['success', 'error']);

// ---- accounts: Supabase Auth + admin approval (only when Supabase storage is configured) ----
const SUPABASE_PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const AUTH_ON = store.kind === 'supabase' && String(process.env.AUTH_REQUIRED || env.AUTH_REQUIRED || '').toLowerCase() !== 'false';
const auth = AUTH_ON ? createAuth({ supabaseUrl: SUPABASE_URL, apiKey: SUPABASE_PUBLISHABLE || SUPABASE_KEY }) : null;

// ---- n8n helpers ----
async function n8n(p, opts = {}) {
  if (!N8N_KEY) throw Object.assign(new Error('N8N_API is missing from .env'), { status: 500 });
  const r = await fetch(N8N_BASE + '/api/v1' + p, {
    ...opts,
    headers: { 'X-N8N-API-KEY': N8N_KEY, 'content-type': 'application/json', ...(opts.headers || {}) },
    signal: AbortSignal.timeout(30000),
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!r.ok) throw Object.assign(new Error('n8n ' + r.status + ': ' + (json.message || text).slice(0, 200)), { status: 502 });
  return json;
}
let workflowId = null;
async function getWorkflow() {
  if (workflowId) return n8n('/workflows/' + workflowId);
  const list = await n8n('/workflows?limit=20&name=' + encodeURIComponent(WORKFLOW_NAME));
  const wf = (list.data || []).find((w) => w.name === WORKFLOW_NAME);
  if (!wf) throw Object.assign(new Error('Workflow "' + WORKFLOW_NAME + '" not found in n8n. Run tools/deploy_n8n.js.'), { status: 404 });
  workflowId = wf.id;
  return wf;
}

// ---- pipeline stages (map UI steps to workflow nodes) ----
const STAGES = [
  { key: 'site', label: 'Read website', node: 'Fetch Website' },
  { key: 'brief', label: 'Brand brief', node: 'Brand Brief' },
  { key: 'competitors', label: 'Competitor analysis', node: 'Competitor Analysis' },
  { key: 'hooks', label: '10 hooks and angles', node: 'Hooks and Angles' },
  { key: 'statics', label: '20 static concepts', node: 'Static Concepts' },
  { key: 'images', label: 'Render images', node: 'Collect Images' },
  { key: 'scripts', label: '5 video scripts', node: 'Video Scripts' },
  { key: 'videos', label: 'Render videos', node: 'Render Videos' },
  { key: 'pack', label: 'Package and save report', node: 'Final Output' },
];

const firstJson = (runData, node) => {
  const run = runData && runData[node] && runData[node][0];
  const items = run && run.data && run.data.main && run.data.main[0];
  return items && items[0] && items[0].json;
};

function summarise(job, exec) {
  const out = { id: job.id, url: job.url, businessName: job.businessName || '', createdAt: job.createdAt, options: job.options || {}, executionId: job.executionId || null };
  const runData = exec && exec.data && exec.data.resultData && exec.data.resultData.runData;
  const done = new Set(Object.keys(runData || {}).filter((n) => runData[n] && runData[n].length && !runData[n][0].error));
  const status = !exec ? 'queued' : exec.finished && exec.status === 'success' ? 'success'
    : ['error', 'crashed', 'canceled'].includes(exec.status) ? 'error' : 'running';
  let seenRunning = false;
  out.stages = STAGES.map((s) => {
    let state = 'pending';
    if (done.has(s.node)) state = 'done';
    else if (status === 'running' && !seenRunning) { state = 'active'; seenRunning = true; }
    else if (status === 'error' && !seenRunning) { state = 'failed'; seenRunning = true; }
    return { key: s.key, label: s.label, state };
  });
  // The image/video steps are skipped on dry runs; show them as skipped rather than pending forever.
  // Dry runs render nothing; those workflow nodes still execute (as pass-throughs), so mark the steps skipped.
  if (job.options && job.options.dryRun) out.stages.forEach((s) => { if (['images', 'videos'].includes(s.key) && s.state !== 'failed') s.state = status === 'running' || status === 'queued' ? (s.state === 'done' ? 'skipped' : s.state) : 'skipped'; });
  out.status = status;
  if (status === 'success') out.result = firstJson(runData, 'Final Output') || null;
  if (status === 'error') {
    const err = exec.data && exec.data.resultData && exec.data.resultData.error;
    out.error = (err && (err.message || err.description)) || 'The workflow stopped with an error. Open the execution in n8n for details.';
    out.failedNode = exec.data && exec.data.resultData && exec.data.resultData.lastNodeExecuted;
  }
  return out;
}

async function findExecution(job) {
  const wf = await getWorkflow();
  // The list endpoint omits running executions unless asked by status, so query each status.
  const lists = await Promise.all(['running', 'success', 'error'].map((st) => n8n('/executions?workflowId=' + wf.id + '&status=' + st + '&limit=8&includeData=false').catch(() => ({ data: [] }))));
  const list = { data: lists.flatMap((l) => l.data || []).sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt)) };
  const claimed = new Set((await store.list()).map((j) => j.executionId).filter(Boolean));
  const since = new Date(job.createdAt).getTime() - 15000;
  for (const e of list.data || []) {
    if (claimed.has(e.id) || new Date(e.startedAt).getTime() < since) continue;
    const full = await n8n('/executions/' + e.id + '?includeData=true');
    const body = firstJson(full.data && full.data.resultData && full.data.resultData.runData, 'Webhook');
    if (body && body.body && body.body.job_id === job.id) { job.executionId = e.id; await store.update(job.id, { executionId: e.id }); return full; }
  }
  return null;
}

// Rebuilds the API shape from a finished run saved in the database.
const fromStored = (job) => ({
  id: job.id, url: job.url, businessName: job.businessName || '', createdAt: job.createdAt, options: job.options || {},
  executionId: job.executionId || null, status: job.status, stages: job.stages || [], result: job.result || undefined,
  error: job.error || undefined, failedNode: job.failedNode || undefined,
});

// Asks n8n where a run is and, once it has finished, saves the outcome so it no longer depends on n8n's history.
async function refreshJob(job) {
  if (FINAL.has(job.status) && (job.stages || job.status === 'error')) return fromStored(job);
  let exec = null;
  if (job.executionId) exec = await n8n('/executions/' + job.executionId + '?includeData=true');
  else exec = await findExecution(job);
  const out = summarise(job, exec);
  if (!exec && Date.now() - new Date(job.createdAt).getTime() > 90000) {
    out.status = 'error';
    out.error = 'n8n never started an execution for this run. Check that the workflow is active and the webhook path is current.';
  }
  if (FINAL.has(out.status)) {
    await store.update(job.id, { status: out.status, stages: out.stages, result: out.result || null, error: out.error || null, failedNode: out.failedNode || null, finishedAt: new Date().toISOString() });
  } else if (job.status !== out.status) {
    await store.update(job.id, { status: out.status });
  }
  return out;
}

// Keeps unfinished runs moving even when nobody has the page open.
let syncing = false;
setInterval(async () => {
  if (syncing) return;
  syncing = true;
  try {
    const pending = (await store.list()).filter((j) => !FINAL.has(j.status) && Date.now() - new Date(j.createdAt).getTime() < 2 * 3600 * 1000);
    for (const j of pending) { const full = await store.get(j.id); if (full) await refreshJob(full).catch(() => {}); }
  } catch { /* storage or n8n briefly unavailable */ }
  finally { syncing = false; }
}, 15000);

const app = express();
app.set('trust proxy', false);
app.use(express.json({ limit: '1mb' }));

// ---- auth middleware ----
const bearer = (req) => { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7) : ''; };
async function authenticate(req, res, next) {
  if (!AUTH_ON) { req.user = { id: null, email: 'local', approved: true, isAdmin: true }; return next(); }
  try {
    const u = await auth.verify(bearer(req));
    if (!u) return res.status(401).json({ error: 'Please sign in.', code: 'unauthenticated' });
    const p = await store.profiles.ensure(u, ADMIN_EMAILS.includes(u.email));
    req.user = { id: u.id, email: u.email, approved: !!(p && p.approved), isAdmin: !!(p && p.is_admin) };
    next();
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
}
const approved = (req, res, next) => (req.user.approved ? next() : res.status(403).json({ error: 'Your account is waiting for approval.', code: 'pending' }));
const adminOnly = (req, res, next) => (req.user.isAdmin ? next() : res.status(403).json({ error: 'Admins only.', code: 'forbidden' }));
const authLimiter = rateLimiter({ max: 12, windowMs: 60000 });
const ownsJob = (user, job) => user.isAdmin || !AUTH_ON || job.userId === user.id;

app.get('/api/auth/config', (_req, res) => res.json({ enabled: AUTH_ON }));
if (AUTH_ON) {
  const clean = (b) => ({ email: String((b && b.email) || '').trim().toLowerCase(), password: String((b && b.password) || '') });
  app.post('/api/auth/signin', authLimiter, async (req, res) => {
    try { const { email, password } = clean(req.body); res.json(await auth.signIn(email, password)); }
    catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });
  app.post('/api/auth/signup', authLimiter, async (req, res) => {
    try {
      const { email, password } = clean(req.body);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
      if (password.length < 8) return res.status(400).json({ error: 'Use a password of at least 8 characters.' });
      res.json(await auth.signUp(email, password));
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });
  app.post('/api/account/password', authLimiter, authenticate, async (req, res) => {
    try {
      const cur = String((req.body && req.body.currentPassword) || '');
      const next = String((req.body && req.body.newPassword) || '');
      if (!cur) return res.status(400).json({ error: 'Enter your current password.' });
      if (next.length < 8) return res.status(400).json({ error: 'Use a new password of at least 8 characters.' });
      if (next === cur) return res.status(400).json({ error: 'The new password must be different from the current one.' });
      await auth.changePassword(req.user.email, cur, next);
      res.json({ ok: true });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });
  app.post('/api/auth/refresh', authLimiter, async (req, res) => {
    try { res.json(await auth.refresh(String((req.body && req.body.refreshToken) || ''))); }
    catch (e) { res.status(401).json({ error: 'Your session expired. Please sign in again.', code: 'unauthenticated' }); }
  });
}

app.get('/api/me', authenticate, (req, res) => res.json({ email: req.user.email, approved: req.user.approved, isAdmin: req.user.isAdmin, authEnabled: AUTH_ON }));

// Admin: approve or revoke people.
app.get('/api/admin/users', authenticate, adminOnly, async (_req, res) => {
  try { res.json((await store.profiles.list()).map((p) => ({ id: p.id, email: p.email, approved: p.approved, isAdmin: p.is_admin, createdAt: p.created_at }))); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});
for (const [action, value] of [['approve', true], ['revoke', false]]) {
  app.post('/api/admin/users/:id/' + action, authenticate, adminOnly, async (req, res) => {
    try {
      if (req.params.id === req.user.id) return res.status(400).json({ error: "You can't change your own access." });
      await store.profiles.setApproved(req.params.id, value);
      res.json({ ok: true });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });
}

app.get('/api/status', authenticate, approved, async (_req, res) => {
  const s = { backend: true, n8nUrl: N8N_BASE, hasApiKey: !!N8N_KEY, hasWebhookPath: !!webhookPath, n8n: false, workflow: null, storage: { kind: store.kind, ok: true } };
  try { await store.ping(); if (AUTH_ON) await store.pingAuthTables(); } catch (e) { s.storage = { kind: store.kind, ok: false, error: e.message }; }
  try {
    const wf = await getWorkflow();
    s.n8n = true;
    s.workflow = { id: wf.id, name: wf.name, active: !!wf.active };
  } catch (e) { s.error = e.message; }
  res.json(s);
});

for (const [route, action] of [['activate', 'activate'], ['deactivate', 'deactivate']]) {
  app.post('/api/workflow/' + route, authenticate, adminOnly, async (_req, res) => {
    try { const wf = await getWorkflow(); const r = await n8n('/workflows/' + wf.id + '/' + action, { method: 'POST' }); res.json({ active: !!r.active }); }
    catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });
}

app.post('/api/jobs', authenticate, approved, async (req, res) => {
  try {
    const b = req.body || {};
    let u;
    try { u = new URL(String(b.url || '').trim()); } catch { return res.status(400).json({ error: 'Enter a full website address, e.g. https://example.com' }); }
    if (!['http:', 'https:'].includes(u.protocol)) return res.status(400).json({ error: 'Only http(s) addresses are allowed.' });
    if (!webhookPath) return res.status(500).json({ error: 'workflow/.webhook-path not found. Run tools/build_workflow.js and tools/deploy_n8n.js.' });
    const wf = await getWorkflow();
    if (!wf.active) return res.status(409).json({ error: 'The workflow is inactive. Activate it first (button at the top).' });

    if (AUTH_ON && !req.user.isAdmin) {
      const mine = (await store.list({ userId: req.user.id })).filter((j) => !FINAL.has(j.status));
      if (mine.length >= 2) return res.status(429).json({ error: 'You already have 2 runs in progress. Wait for one to finish.' });
    }
    const clamp = (v, max) => Math.max(0, Math.min(max, parseInt(v, 10) || 0));
    const options = { dryRun: !!b.dryRun, maxImages: clamp(b.maxImages, 20), maxVideos: clamp(b.maxVideos, 5) };
    const job = { id: crypto.randomBytes(6).toString('hex'), url: u.href, businessName: String(b.businessName || '').slice(0, 120), createdAt: new Date().toISOString(), options, executionId: null, userId: req.user.id };
    const body = {
      url: job.url, business_name: job.businessName, competitor_notes: String(b.competitorNotes || '').slice(0, 20000),
      dry_run: options.dryRun, max_images: options.maxImages, max_videos: options.maxVideos, job_id: job.id,
    };
    const r = await fetch(N8N_BASE + '/webhook/' + webhookPath, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    if (!r.ok) return res.status(502).json({ error: 'n8n webhook answered HTTP ' + r.status + '. Is the workflow active?' });
    await store.insert({ ...job, status: 'running' });
    res.json({ id: job.id });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.get('/api/jobs', authenticate, approved, async (req, res) => {
  try {
    const rows = await store.list(AUTH_ON && !req.user.isAdmin ? { userId: req.user.id } : {});
    res.json(rows.map((j) => ({ id: j.id, url: j.url, businessName: j.businessName, createdAt: j.createdAt, options: j.options, status: j.status || 'running' })));
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Removes the run from this app's list (and the database); the n8n execution itself is left untouched.
app.delete('/api/jobs/:id', authenticate, approved, async (req, res) => {
  try {
    const job = await store.get(req.params.id);
    if (!job || !ownsJob(req.user, job)) return res.status(404).json({ error: 'Unknown job' });
    await store.remove(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.get('/api/jobs/:id', authenticate, approved, async (req, res) => {
  try {
    const job = await store.get(req.params.id);
    if (!job || !ownsJob(req.user, job)) return res.status(404).json({ error: 'Unknown job' });
    res.json(await refreshJob(job));
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Serve the built UI when present (npm start)
const dist = path.join(here, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, '127.0.0.1', () => console.log('API on http://127.0.0.1:' + PORT + ' -> n8n ' + N8N_BASE));
