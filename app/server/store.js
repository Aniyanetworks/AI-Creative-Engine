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
      if (r.status === 404 || /ace_(runs|profiles|usage|connections)|user_id/.test(msg)) msg += ' (did you run supabase/schema.sql?)';
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

  // Connected accounts (see app/server/meta.js): tokens are stored encrypted. Needs the ace_connections table.
  const connections = {
    async get(userId, provider) { const rows = await call('ace_connections', '?user_id=eq.' + q(userId) + '&provider=eq.' + q(provider) + '&select=*'); return rows[0] ? { userId, provider, displayName: rows[0].display_name, dataEnc: rows[0].data_enc, expiresAt: rows[0].expires_at } : null; },
    async put(c) { await call('ace_connections', '?on_conflict=user_id,provider', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: c.userId, provider: c.provider, display_name: c.displayName || null, data_enc: c.dataEnc, expires_at: c.expiresAt || null, updated_at: new Date().toISOString() }) }); },
    async remove(userId, provider) { await call('ace_connections', '?user_id=eq.' + q(userId) + '&provider=eq.' + q(provider), { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); },
  };

  // Usage events (see app/server/usage.js). Needs the ace_usage table from supabase/schema.sql.
  const usage = {
    async add(ev) {
      await call('ace_usage', '', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: ev.userId || null, run_id: ev.runId || null, kind: ev.kind, units: ev.units || 0, unit_label: ev.unitLabel || null, quality: ev.quality || null, est_cost: ev.cost || 0, meta: ev.meta || null }) });
    },
    async has(runId, kind) { const rows = await call('ace_usage', '?run_id=eq.' + q(runId) + '&kind=eq.' + q(kind) + '&select=id&limit=1'); return rows.length > 0; },
    async list({ userId, since, runId } = {}) {
      const f = (userId ? '&user_id=eq.' + q(userId) : '') + (since ? '&created_at=gte.' + q(since) : '') + (runId ? '&run_id=eq.' + q(runId) : '');
      const rows = await call('ace_usage', '?select=*&order=created_at.desc&limit=5000' + f);
      return rows.map((r) => ({ id: r.id, userId: r.user_id, runId: r.run_id, kind: r.kind, units: Number(r.units), unitLabel: r.unit_label, quality: r.quality, cost: Number(r.est_cost), meta: r.meta, at: r.created_at }));
    },
  };

  return {
    kind: 'supabase',
    profiles,
    usage,
    connections,
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
  const usageFile = path.join(dataDir, 'usage.json');
  let events = [];
  try { events = JSON.parse(fs.readFileSync(usageFile, 'utf8')); } catch { events = []; }
  const usage = {
    async add(ev) { events.unshift({ id: Date.now() + Math.random(), userId: ev.userId || null, runId: ev.runId || null, kind: ev.kind, units: ev.units || 0, unitLabel: ev.unitLabel || null, quality: ev.quality || null, cost: ev.cost || 0, meta: ev.meta || null, at: new Date().toISOString() }); fs.writeFileSync(usageFile, JSON.stringify(events.slice(0, 5000))); },
    async has(runId, kind) { return events.some((e) => e.runId === runId && e.kind === kind); },
    async list({ userId, since, runId } = {}) { return events.filter((e) => (!userId || e.userId === userId) && (!since || e.at >= since) && (!runId || e.runId === runId)); },
  };
  return {
    kind: 'local',
    usage,
    connections: (() => { const m = new Map(); return { async get(u, pv) { return m.get(u + '|' + pv) || null; }, async put(c) { m.set(c.userId + '|' + c.provider, c); }, async remove(u, pv) { m.delete(u + '|' + pv); } }; })(),
    profiles: null, // accounts need Supabase
    async list() { return jobs.map(slim); },
    async get(id) { return jobs.find((j) => j.id === id) || null; },
    async insert(job) { jobs.unshift({ status: 'running', ...job }); save(); },
    async update(id, patch) { const j = jobs.find((x) => x.id === id); if (j) { Object.assign(j, patch); save(); } },
    async remove(id) { jobs = jobs.filter((j) => j.id !== id); save(); },
    async ping() { /* always available */ },
  };
}
