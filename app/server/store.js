// Run storage. Uses Supabase (PostgREST) when SUPABASE_URL + SUPABASE_SERVICE_KEY are set,
// otherwise a local JSON file. Both expose the same async interface.
import fs from 'fs';
import path from 'path';

// App-shape job:
// { id, userId, url, businessName, createdAt, options, executionId, status, stages, result, error, failedNode, finishedAt }

const toRow = (j) => ({
  id: j.id, url: j.url, business_name: j.businessName || '', options: j.options || {},
  user_id: j.userId || null,
  execution_id: j.executionId || null, status: j.status || 'running',
  stages: j.stages || null, result: j.result || null, error: j.error || null,
  failed_node: j.failedNode || null, finished_at: j.finishedAt || null,
  ...(j.createdAt ? { created_at: j.createdAt } : {}),
});
const fromRow = (r) => ({
  id: r.id, userId: r.user_id || null, url: r.url, businessName: r.business_name || '', options: r.options || {},
  executionId: r.execution_id || null, status: r.status, stages: r.stages || null, result: r.result || null,
  error: r.error || null, failedNode: r.failed_node || null, finishedAt: r.finished_at || null, createdAt: r.created_at,
});
const PATCH_MAP = { businessName: 'business_name', executionId: 'execution_id', failedNode: 'failed_node', finishedAt: 'finished_at', userId: 'user_id' };
const toPatch = (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [PATCH_MAP[k] || k, v]));

export function createSupabaseStore(baseUrl, key) {
  const rest = baseUrl.replace(/\/+$/, '') + '/rest/v1/';
  const H = { apikey: key, Authorization: 'Bearer ' + key, 'content-type': 'application/json' };
  async function call(table, qs, opts = {}) {
    const r = await fetch(rest + table + qs, { ...opts, headers: { ...H, ...(opts.headers || {}) }, signal: AbortSignal.timeout(20000) });
    const text = await r.text();
    if (!r.ok) {
      let msg = text.slice(0, 200);
      try { const j = JSON.parse(text); msg = j.message || j.hint || msg; } catch { /* keep raw */ }
      if (r.status === 404 || /ace_(runs|profiles)|user_id/.test(msg)) msg += ' (did you run supabase/schema.sql?)';
      throw Object.assign(new Error('Supabase ' + r.status + ': ' + msg), { status: 502 });
    }
    return text ? JSON.parse(text) : null;
  }
  const q = encodeURIComponent;
  const LIST_COLS = 'id,user_id,url,business_name,options,execution_id,status,created_at,finished_at';

  const profiles = {
    async get(id) { const rows = await call('ace_profiles', '?id=eq.' + q(id) + '&select=*'); return rows[0] || null; },
    // Creates the profile on first sight. Listed admin emails are approved automatically.
    async ensure(user, isAdminEmail) {
      let p = await this.get(user.id);
      if (!p) {
        await call('ace_profiles', '?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ id: user.id, email: user.email, approved: !!isAdminEmail, is_admin: !!isAdminEmail }) });
        p = await this.get(user.id);
      } else if (isAdminEmail && (!p.is_admin || !p.approved)) {
        await call('ace_profiles', '?id=eq.' + q(user.id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ is_admin: true, approved: true }) });
        p = await this.get(user.id);
      }
      return p;
    },
    async list() { return call('ace_profiles', '?select=*&order=created_at.desc&limit=500'); },
    async setApproved(id, approved) { await call('ace_profiles', '?id=eq.' + q(id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ approved: !!approved }) }); },
  };

  return {
    kind: 'supabase',
    profiles,
    async list(filter = {}) {
      const who = filter.userId ? '&user_id=eq.' + q(filter.userId) : '';
      return (await call('ace_runs', '?select=' + LIST_COLS + who + '&order=created_at.desc&limit=200')).map(fromRow);
    },
    async get(id) { const rows = await call('ace_runs', '?id=eq.' + q(id) + '&select=*'); return rows[0] ? fromRow(rows[0]) : null; },
    async insert(job) { await call('ace_runs', '', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(toRow(job)) }); },
    async update(id, patch) { await call('ace_runs', '?id=eq.' + q(id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(toPatch(patch)) }); },
    async remove(id) { await call('ace_runs', '?id=eq.' + q(id), { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); },
    async ping() {
      // The public/anon key can read nothing useful here and cannot write; the backend needs a secret key.
      let role = '';
      if (key.startsWith('sb_publishable_')) role = 'publishable';
      else if (!key.startsWith('sb_secret_')) { try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch { /* unknown format: let the request decide */ } }
      if (role === 'publishable' || role === 'anon') {
        throw Object.assign(new Error('SUPABASE_SERVICE_KEY is a public (anon/publishable) key. Use the secret key instead: Project Settings > API Keys > "secret" (sb_secret_...) or the legacy "service_role" key.'), { status: 500 });
      }
      await call('ace_runs', '?select=id&limit=1');
    },
    async pingAuthTables() { await call('ace_profiles', '?select=id&limit=1'); },
  };
}

export function createLocalStore(dataDir) {
  const file = path.join(dataDir, 'jobs.json');
  fs.mkdirSync(dataDir, { recursive: true });
  let jobs = [];
  try { jobs = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { jobs = []; }
  const save = () => fs.writeFileSync(file, JSON.stringify(jobs.slice(0, 200), null, 2));
  const slim = ({ result, stages, ...rest }) => rest; // list view stays light
  return {
    kind: 'local',
    profiles: null, // accounts need Supabase
    async list() { return jobs.map(slim); },
    async get(id) { return jobs.find((j) => j.id === id) || null; },
    async insert(job) { jobs.unshift({ status: 'running', ...job }); save(); },
    async update(id, patch) { const j = jobs.find((x) => x.id === id); if (j) { Object.assign(j, patch); save(); } },
    async remove(id) { jobs = jobs.filter((j) => j.id !== id); save(); },
    async ping() { /* always available */ },
  };
}
