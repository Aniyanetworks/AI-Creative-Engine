// Creates (or updates) the small n8n workflow that receives a video file and saves it to Google Drive,
// then activates it. Run once:  NODE_OPTIONS="--dns-result-order=ipv4first" node tools/deploy_drive_n8n.js
// The workflow uses your existing Google Drive credential and the folder DRIVE_FOLDER_ID from .env (default: My Drive root).
// The private webhook path is saved to workflow/.drive-webhook-path (git-ignored); the full URL is printed for you.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const base = (env.N8N_BASE_URL || '').replace(/\/+$/, '').replace(/\/home.*$/, '');
const key = env.N8N_API;
if (!base || !key) { console.error('Need N8N_API and N8N_BASE_URL in .env'); process.exit(1); }
const H = { 'X-N8N-API-KEY': key, 'content-type': 'application/json' };
const CRED = { googleDriveOAuth2Api: { id: 'WpF0dPs521RPKvik', name: 'Manam Google Drive account' } };
const NAME = 'ACE - Save video to Drive';

const pathFile = path.join(root, 'workflow', '.drive-webhook-path');
const webhookPath = fs.existsSync(pathFile) ? fs.readFileSync(pathFile, 'utf8').trim() : crypto.randomBytes(16).toString('hex');
fs.writeFileSync(pathFile, webhookPath);

const nodes = [
  { id: crypto.randomUUID(), name: 'Receive video', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: crypto.randomUUID(),
    parameters: { httpMethod: 'POST', path: webhookPath, responseMode: 'lastNode', options: { binaryPropertyName: 'file' } } }, // uploaded files arrive as file0, file1, ...
  { id: crypto.randomUUID(), name: 'Save to Drive', type: 'n8n-nodes-base.googleDrive', typeVersion: 3, position: [260, 0], credentials: CRED,
    parameters: {
      resource: 'file', operation: 'upload', inputDataFieldName: 'file0', 
      name: '={{ $json.body.name || "video.mp4" }}',
      driveId: { __rl: true, mode: 'list', value: 'My Drive' },
      folderId: { __rl: true, mode: 'id', value: env.DRIVE_FOLDER_ID || 'root' },
      options: {},
    } },
  { id: crypto.randomUUID(), name: 'Reply with link', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [520, 0],
    parameters: { mode: 'manual', assignments: { assignments: [
      { id: crypto.randomUUID(), name: 'id', value: '={{ $json.id }}', type: 'string' },
      { id: crypto.randomUUID(), name: 'url', value: '=https://drive.google.com/file/d/{{ $json.id }}/view', type: 'string' },
    ] }, includeOtherFields: false, options: {} } },
];
const connections = {
  'Receive video': { main: [[{ node: 'Save to Drive', type: 'main', index: 0 }]] },
  'Save to Drive': { main: [[{ node: 'Reply with link', type: 'main', index: 0 }]] },
};

(async () => {
  const body = JSON.stringify({ name: NAME, nodes, connections, settings: { executionOrder: 'v1' } });
  const list = await (await fetch(base + '/api/v1/workflows?limit=50&name=' + encodeURIComponent(NAME), { headers: H })).json();
  const existing = (list.data || []).find((w) => w.name === NAME);
  const r = existing
    ? await fetch(base + '/api/v1/workflows/' + existing.id, { method: 'PUT', headers: H, body })
    : await fetch(base + '/api/v1/workflows', { method: 'POST', headers: H, body });
  const j = await r.json();
  if (!r.ok) { console.error('HTTP', r.status, JSON.stringify(j).slice(0, 500)); process.exit(1); }
  console.log(existing ? 'Updated' : 'Created', 'workflow id', j.id);
  const a = await fetch(base + '/api/v1/workflows/' + j.id + '/activate', { method: 'POST', headers: H });
  console.log('Activate: HTTP', a.status, a.ok ? '(active)' : (await a.text()).slice(0, 200));
  console.log('\nWebhook URL (keep it private):\n  ' + base + '/webhook/' + webhookPath);
  console.log('\nNext: node video/ci/set-secrets.mjs   (copies this URL to the GitHub secret N8N_DRIVE_WEBHOOK_URL)');
})();
