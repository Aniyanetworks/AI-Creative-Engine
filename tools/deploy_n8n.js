// Creates or updates the workflow in n8n via the public API.
// Reads N8N_API from .env; base URL from N8N_BASE_URL in .env or argv[2].
// Run with: NODE_OPTIONS="--dns-result-order=ipv4first" node tools/deploy_n8n.js [baseUrl]
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const base = (process.argv[2] || env.N8N_BASE_URL || '').replace(/\/+$/, '').replace(/\/home.*$/, '');
const key = env.N8N_API;
if (!base || !key) { console.error('Need N8N_API in .env and a base URL'); process.exit(1); }
const H = { 'X-N8N-API-KEY': key, 'content-type': 'application/json' };
(async () => {
  const wf = JSON.parse(fs.readFileSync(path.join(root, 'workflow', 'creative-engine.n8n.json'), 'utf8'));
  const list = await (await fetch(base + '/api/v1/workflows?limit=20&name=' + encodeURIComponent(wf.name), { headers: H })).json();
  const existing = (list.data || []).find((w) => w.name === wf.name);
  // Copy optional settings from .env into the Config node at deploy time (the local JSON file stays free of secrets).
  const map = { heygen_key: 'HEYGEN_API_KEY', heygen_avatar_id: 'HEYGEN_AVATAR_ID', heygen_voice_id: 'HEYGEN_VOICE_ID', apify_token: 'APIFY_TOKEN', drive_folder_id: 'DRIVE_FOLDER_ID' };
  const applied = [];
  for (const a of wf.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments) {
    if (map[a.name] && env[map[a.name]]) { a.value = env[map[a.name]]; applied.push(a.name); }
  }
  console.log('Config values taken from .env:', applied.length ? applied.join(', ') : 'none');
  const body = JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings });
  const r = existing
    ? await fetch(base + '/api/v1/workflows/' + existing.id, { method: 'PUT', headers: H, body })
    : await fetch(base + '/api/v1/workflows', { method: 'POST', headers: H, body });
  const j = await r.json();
  console.log('HTTP', r.status, r.ok ? (existing ? 'updated' : 'created') + ' id ' + j.id + ' active=' + j.active : JSON.stringify(j).slice(0, 500));
})();
