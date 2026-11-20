// Creates (or updates) the n8n workflow "ACE - Render one image" and activates it. Run once (and after edits):
//   NODE_OPTIONS="--dns-result-order=ipv4first" node tools/deploy_image_n8n.js
//
// The app's "Generate image" button on a static ad calls this private webhook. The workflow makes one image with your
// OpenAI credential (same model and quality settings as the main workflow) and saves it to the run's "Static ads" folder in
// Google Drive (through the "ACE - Save video to Drive" folder service, so deploy that first). The webhook answers at once
// with the execution id; the app then looks for the saved file in Drive (finished runs keep no data, since it would hold
// the whole image) and reads the execution only to report a failure, so no callback address is needed.
// The private webhook path is kept in workflow/.image-webhook-path (git-ignored).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const base = (env.N8N_BASE_URL || '').replace(/\/+$/, '').replace(/\/home.*$/, '');
const key = env.N8N_API;
if (!base || !key) { console.error('Need N8N_API and N8N_BASE_URL in .env'); process.exit(1); }
const ROOT_ID = env.DRIVE_FOLDER_ID || 'root';
const H = { 'X-N8N-API-KEY': key, 'content-type': 'application/json' };
const CRED = {
  openAiApi: { id: 'fj3WhBV98VkK9qr3', name: 'Manam- OpenAi account' },
  googleDriveOAuth2Api: { id: 'WpF0dPs521RPKvik', name: 'Manam Google Drive account' },
};
const NAME = 'ACE - Render one image';
// gpt-image-1 is not available to this OpenAI account (checked via its model list); gpt-image-2 is. Override with IMAGE_MODEL in .env.
const IMAGE_MODEL = env.IMAGE_MODEL || 'gpt-image-2';

let driveHook = '';
try { driveHook = base + '/webhook/' + fs.readFileSync(path.join(root, 'workflow', '.drive-webhook-path'), 'utf8').trim(); } catch { /* deploy_drive_n8n.js first */ }
if (!driveHook) console.warn('Note: workflow/.drive-webhook-path not found; images will go to the root folder. Run tools/deploy_drive_n8n.js first.');

const pathFile = path.join(root, 'workflow', '.image-webhook-path');
const webhookPath = fs.existsSync(pathFile) ? fs.readFileSync(pathFile, 'utf8').trim() : 'ace-image-' + crypto.randomBytes(14).toString('hex');
fs.writeFileSync(pathFile, webhookPath);

const id = () => crypto.randomUUID();
const nodes = [
  { id: id(), name: 'Receive', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: id(),
    parameters: { httpMethod: 'POST', path: webhookPath, responseMode: 'responseNode', options: {} } },
  // Answer straight away with this run's execution id (the app polls that one execution); the work continues afterwards.
  { id: id(), name: 'Reply with id', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [120, 0],
    parameters: { respondWith: 'json', responseBody: "={{ JSON.stringify({ execution_id: String($execution.id), request_id: $json.body.request_id }) }}", options: {} } },
  { id: id(), name: 'Drive folder', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [300, 0], onError: 'continueRegularOutput',
    parameters: { method: 'POST', url: driveHook || 'http://invalid.local', sendBody: true, specifyBody: 'json',
      jsonBody: "={{ JSON.stringify($('Receive').first().json.body.folder_request || {}) }}", options: { timeout: 60000 } } },
  { id: id(), name: 'Prepare', type: 'n8n-nodes-base.code', typeVersion: 2, position: [480, 0],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `
const b = $('Receive').first().json.body || {};
const r = $input.first().json || {};
const prompt = String(b.image_prompt || '').trim();
if (!prompt) throw new Error('No image prompt was sent.');
const aspect = b.aspect === '9:16' ? '9:16' : '1:1';
const quality = ['low', 'medium', 'high'].includes(b.quality) ? b.quality : 'medium';
return [{ json: {
  request_id: String(b.request_id || ''), prompt, size: aspect === '9:16' ? '1024x1536' : '1024x1024', quality,
  file_name: String(b.file_name || 'static.png').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80),
  folder_id: r.id || ${JSON.stringify(ROOT_ID)}, folder_ok: !!r.id,
} }];` } },
  { id: id(), name: 'OpenAI Image', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [720, 0], credentials: { openAiApi: CRED.openAiApi },
    retryOnFail: true, maxTries: 2, waitBetweenTries: 5000,
    parameters: { method: 'POST', url: 'https://api.openai.com/v1/images/generations', authentication: 'predefinedCredentialType', nodeCredentialType: 'openAiApi',
      sendBody: true, specifyBody: 'json',
      jsonBody: "={{ JSON.stringify({ model: " + JSON.stringify(IMAGE_MODEL) + ", prompt: $json.prompt, size: $json.size, quality: $json.quality, n: 1 }) }}",
      options: { timeout: 240000 } } },
  { id: id(), name: 'Make file', type: 'n8n-nodes-base.code', typeVersion: 2, position: [960, 0],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `
const p = $('Prepare').first().json;
const b64 = $input.first().json.data && $input.first().json.data[0] && $input.first().json.data[0].b64_json;
if (!b64) throw new Error('OpenAI returned no image: ' + JSON.stringify($input.first().json.error || $input.first().json).slice(0, 240));
const bin = await this.helpers.prepareBinaryData(Buffer.from(b64, 'base64'), p.file_name, 'image/png');
return [{ json: { file_name: p.file_name }, binary: { data: bin } }];` } },
  { id: id(), name: 'Save to Drive', type: 'n8n-nodes-base.googleDrive', typeVersion: 3, position: [1200, 0], credentials: { googleDriveOAuth2Api: CRED.googleDriveOAuth2Api },
    parameters: { resource: 'file', operation: 'upload', inputDataFieldName: 'data', name: '={{ $json.file_name }}',
      driveId: { __rl: true, mode: 'list', value: 'My Drive' },
      folderId: { __rl: true, mode: 'id', value: "={{ $('Prepare').first().json.folder_id }}" }, options: {} } },
  { id: id(), name: 'Done', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1440, 0],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `
const p = $('Prepare').first().json;
const up = $input.first().json || {};
if (!up.id) throw new Error('Google Drive did not return a file id.');
return [{ json: { request_id: p.request_id, id: up.id, url: 'https://drive.google.com/file/d/' + up.id + '/view', file_name: p.file_name, folder_ok: p.folder_ok } }];` } },
];
const chain = ['Receive', 'Reply with id', 'Drive folder', 'Prepare', 'OpenAI Image', 'Make file', 'Save to Drive', 'Done'];
const connections = {};
for (let i = 0; i < chain.length - 1; i++) connections[chain[i]] = { main: [[{ node: chain[i + 1], type: 'main', index: 0 }]] };

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
  console.log('\nThe app finds it automatically on this machine. For Netlify add N8N_IMAGE_WEBHOOK_URL (Secret):\n  ' + base + '/webhook/' + webhookPath);
})();
