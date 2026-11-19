// Minimal Supabase Storage client for the GitHub Actions render workflow (Node 20, no dependencies).
// Same bucket and file layout as app/server/storage.js: "<runId>/<n>-<title>.mp4" and "<runId>/status.json".
import fs from 'fs';

const clean = (v) => String(v || '').trim().replace(/^['"]|['"]$/g, '');
export const BUCKET = clean(process.env.VIDEO_BUCKET) || 'ace-videos';
const url = clean(process.env.SUPABASE_URL).replace(/\/+$/, '');
const key = clean(process.env.SUPABASE_SERVICE_KEY);
if (!url || !key) { console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set (GitHub repository secrets).'); process.exit(1); }

const root = url + '/storage/v1';
const H = { apikey: key, Authorization: 'Bearer ' + key };
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

async function call(p, opts = {}) {
  const r = await fetch(root + p, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { ok: r.ok, status: r.status, json, text };
}

let ready = false;
export async function ensureBucket() {
  if (ready) return;
  const r = await call('/bucket', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: 52428800 }) });
  if (!r.ok && r.status !== 409 && !/already exists|Duplicate/i.test(r.text)) throw new Error('Could not create the storage bucket: HTTP ' + r.status + ' ' + r.text.slice(0, 160));
  ready = true;
}

export async function putObject(objectPath, body, contentType) {
  await ensureBucket();
  const r = await call('/object/' + BUCKET + '/' + enc(objectPath), { method: 'POST', headers: { 'content-type': contentType, 'x-upsert': 'true' }, body });
  if (!r.ok) throw new Error('Upload of ' + objectPath + ' failed: HTTP ' + r.status + ' ' + r.text.slice(0, 160));
}
export const putJson = (objectPath, obj) => putObject(objectPath, JSON.stringify(obj), 'application/json');
export const putFile = (objectPath, file, contentType) => putObject(objectPath, fs.readFileSync(file), contentType);

export async function getJson(objectPath) {
  await ensureBucket();
  const r = await call('/object/' + BUCKET + '/' + enc(objectPath));
  if (r.status === 404 || (r.status === 400 && /not.?found/i.test(r.text))) return null;
  if (!r.ok) throw new Error('Read of ' + objectPath + ' failed: HTTP ' + r.status);
  return r.json;
}

export async function getBuffer(objectPath) {
  await ensureBucket();
  const r = await fetch(root + '/object/' + BUCKET + '/' + enc(objectPath), { headers: H });
  if (!r.ok) throw new Error('Download of ' + objectPath + ' failed: HTTP ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

export async function list(prefix) {
  await ensureBucket();
  const r = await call('/object/list/' + BUCKET, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prefix, limit: 100, sortBy: { column: 'name', order: 'asc' } }) });
  if (!r.ok) throw new Error('Listing ' + prefix + ' failed: HTTP ' + r.status);
  return (r.json || []).filter((o) => o && o.name && o.id !== null).map((o) => o.name);
}

export const supabaseUrl = url;
export const supabaseKey = key;
export const runLink = () => (process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null);
