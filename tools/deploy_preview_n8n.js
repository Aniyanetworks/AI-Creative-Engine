// Creates (or updates) the n8n workflow "ACE - Get image" and activates it. Run once (and after edits):
//   NODE_OPTIONS="--dns-result-order=ipv4first" node tools/deploy_preview_n8n.js
//
// The app shows generated ad images in its previews. Drive files are private, so the app cannot simply link to them;
// instead its backend asks this private webhook for the file (using your Google Drive credential in n8n) and passes
// it on to the signed-in user as a picture link. Only image files named like the app's ads ("..._static_<n>.png") are ever returned.
// The private webhook path is kept in workflow/.preview-webhook-path (git-ignored).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const base = (env.N8N_BASE_URL || '').replace(/\/+$/, '').replace(/\/home.*$/, '');
const key = env.N8N_API;
if (!base || !key) { console.error('Need N8N_API and N8N_BASE_URL in .env'); process.exit(1); }
const H = { 'X-N8N-API-KEY': key, 'content-type': 'application/json' };
const CRED = { googleDriveOAuth2Api: { id: 'WpF0dPs521RPKvik', name: 'Manam Google Drive account' } };
const NAME = 'ACE - Get image';

const pathFile = path.join(root, 'workflow', '.preview-webhook-path');
const webhookPath = fs.existsSync(pathFile) ? fs.readFileSync(pathFile, 'utf8').trim() : 'ace-preview-' + crypto.randomBytes(14).toString('hex');
fs.writeFileSync(pathFile, webhookPath);

const id = () => crypto.randomUUID();
const drive = (name, position, parameters, extra = {}) => ({ id: id(), name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position, credentials: CRED, ...extra,
  parameters: { authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api', ...parameters } });
const nodes = [
  { id: id(), name: 'Receive', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: id(),
    parameters: { httpMethod: 'POST', path: webhookPath, responseMode: 'lastNode', options: {} } },
  drive('Inspect file', [240, 0], {
    method: 'GET', url: "=https://www.googleapis.com/drive/v3/files/{{ String($json.body.id || '').replace(/[^A-Za-z0-9_-]/g, '') }}",
    sendQuery: true, queryParameters: { parameters: [{ name: 'fields', value: 'id,name,mimeType,size,thumbnailLink' }, { name: 'supportsAllDrives', value: 'true' }] }, options: {},
  }, { onError: 'continueRegularOutput' }),
  { id: id(), name: 'Is an ad image?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [480, 0],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
      conditions: [{ id: 'c1', leftValue: "={{ /^image[/]/.test($json.mimeType || '') && /_static_[0-9]+[.](png|jpe?g|webp)$/i.test($json.name || '') && Number($json.size || 0) < 9000000 }}", rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} } },
  // Hand back Drive's own picture link (a short-lived address that needs no sign-in) instead of moving the image bytes through
  // n8n: downloads and base64 answers of a megabyte or more stalled or dropped the connection on this n8n server.
  { id: id(), name: 'Link', type: 'n8n-nodes-base.code', typeVersion: 2, position: [720, -80],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const f = $input.first().json;
if (!f.thumbnailLink) return [{ json: { ok: true, ready: false, name: f.name } }];
const full = (($('Receive').first().json.body || {}).size) === 'full'; // 'full' = original size (used when posting to Meta)
return [{ json: { ok: true, ready: true, name: f.name, url: String(f.thumbnailLink).split('=s')[0] + (full ? '=s0' : '=s1000') } }];` } },
  { id: id(), name: 'Refuse', type: 'n8n-nodes-base.code', typeVersion: 2, position: [720, 100],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "throw new Error('Not an ad image.');" } },
];
const connections = {
  Receive: { main: [[{ node: 'Inspect file', type: 'main', index: 0 }]] },
  'Inspect file': { main: [[{ node: 'Is an ad image?', type: 'main', index: 0 }]] },
  'Is an ad image?': { main: [[{ node: 'Link', type: 'main', index: 0 }], [{ node: 'Refuse', type: 'main', index: 0 }]] },
};

(async () => {
  const body = JSON.stringify({ name: NAME, nodes, connections, settings: { executionOrder: 'v1', saveDataSuccessExecution: 'none', saveDataErrorExecution: 'all' } });
  const list = await (await fetch(base + '/api/v1/workflows?limit=50&name=' + encodeURIComponent(NAME), { headers: H })).json();
  const existing = (list.data || []).find((w) => w.name === NAME);
  const r = existing
    ? await fetch(base + '/api/v1/workflows/' + existing.id, { method: 'PUT', headers: H, body })
    : await fetch(base + '/api/v1/workflows', { method: 'POST', headers: H, body });
  const j = await r.json();
  if (!r.ok) { console.error('HTTP', r.status, JSON.stringify(j).slice(0, 600)); process.exit(1); }
  console.log(existing ? 'Updated' : 'Created', 'workflow id', j.id, '(' + nodes.length + ' nodes)');
  await fetch(base + '/api/v1/workflows/' + j.id + '/deactivate', { method: 'POST', headers: H });
  const a = await fetch(base + '/api/v1/workflows/' + j.id + '/activate', { method: 'POST', headers: H });
  console.log('Activate: HTTP', a.status, a.ok ? '(active)' : (await a.text()).slice(0, 200));
  console.log('\nThe app finds it automatically on this machine. For Netlify add N8N_PREVIEW_WEBHOOK_URL (Secret):\n  ' + base + '/webhook/' + webhookPath);
})();
