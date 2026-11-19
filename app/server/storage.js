// Supabase Storage (REST) for rendered videos: a private bucket, objects under "<runId>/", plus a small
// "<runId>/status.json" that tracks the online render. Uses the secret key, so it only runs on the backend.
export function createStorage(baseUrl, key, bucket = 'ace-videos') {
  const root = baseUrl.replace(/\/+$/, '') + '/storage/v1';
  const H = { apikey: key, Authorization: 'Bearer ' + key };
  const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

  async function call(path, opts = {}) {
    const r = await fetch(root + path, { ...opts, headers: { ...H, ...(opts.headers || {}) }, signal: AbortSignal.timeout(20000) });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    return { ok: r.ok, status: r.status, json, text };
  }
  const fail = (what, r) => Object.assign(new Error('Storage ' + what + ' failed (HTTP ' + r.status + '): ' + String((r.json && (r.json.message || r.json.error)) || r.text).slice(0, 160)), { status: 502 });

  let ready = null;
  return {
    bucket,
    // Creates the private bucket on first use (a 409 means it already exists).
    async ensureBucket() {
      if (!ready) {
        ready = (async () => {
          const r = await call('/bucket', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: 52428800 }) });
          if (!r.ok && r.status !== 409 && !/already exists|Duplicate/i.test(r.text)) throw fail('bucket creation', r);
        })().catch((e) => { ready = null; throw e; });
      }
      return ready;
    },
    // Returns true if written, false if the object already exists and upsert is off (used as a lock).
    async putJson(path, obj, { upsert = true } = {}) {
      await this.ensureBucket();
      const r = await call('/object/' + bucket + '/' + enc(path), { method: 'POST', headers: { 'content-type': 'application/json', 'x-upsert': upsert ? 'true' : 'false' }, body: JSON.stringify(obj) });
      if (r.ok) return true;
      if (!upsert && (r.status === 409 || /already exists|Duplicate/i.test(r.text))) return false;
      throw fail('write', r);
    },
    async getJson(path) {
      await this.ensureBucket();
      const r = await call('/object/' + bucket + '/' + enc(path));
      if (r.status === 404 || (r.status === 400 && /not.?found/i.test(r.text))) return null;
      if (!r.ok) throw fail('read', r);
      return r.json;
    },
    async list(prefix) {
      await this.ensureBucket();
      const r = await call('/object/list/' + bucket, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prefix, limit: 100, sortBy: { column: 'name', order: 'asc' } }) });
      if (!r.ok) throw fail('list', r);
      return (r.json || []).filter((o) => o && o.name && o.id !== null).map((o) => ({ name: o.name, size: (o.metadata && o.metadata.size) || 0, updatedAt: o.updated_at || null }));
    },
    // Short-lived link the browser can play or download without any key.
    async sign(path, seconds = 3600, downloadName) {
      const r = await call('/object/sign/' + bucket + '/' + enc(path), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn: seconds }) });
      if (!r.ok || !r.json || !r.json.signedURL) throw fail('signing', r);
      const u = r.json.signedURL.startsWith('http') ? r.json.signedURL : root + r.json.signedURL;
      return downloadName ? u + (u.includes('?') ? '&' : '?') + 'download=' + encodeURIComponent(downloadName) : u;
    },
  };
}
