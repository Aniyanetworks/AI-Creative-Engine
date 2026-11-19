// Creates (or updates) the n8n workflow "ACE - Save video to Drive" and activates it. Run once (and again after edits):
//   NODE_OPTIONS="--dns-result-order=ipv4first" node tools/deploy_drive_n8n.js
//
// One private webhook, three jobs (all use your existing Google Drive credential):
//   multipart upload  fields: file, name, folderId           -> saves the file, replies {id, url}
//   JSON ensure       {action:'ensure', names:[a,b,c], parentId?, create?:false}
//                     finds or creates the nested folders root/a/b/c (names may be fewer; create:false only looks)
//                     -> {id (deepest), trail:[ids], url}
//   JSON delete       {action:'delete', id}  or  {action:'delete', names:[client, run]}  -> moves that folder to the Drive bin
// The root folder is DRIVE_FOLDER_ID from .env. The private webhook path is kept in workflow/.drive-webhook-path.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const base = (env.N8N_BASE_URL || '').replace(/\/+$/, '').replace(/\/home.*$/, '');
const key = env.N8N_API;
if (!base || !key) { console.error('Need N8N_API and N8N_BASE_URL in .env'); process.exit(1); }
const ROOT_ID = env.DRIVE_FOLDER_ID || 'root';
const H = { 'X-N8N-API-KEY': key, 'content-type': 'application/json' };
const CRED = { googleDriveOAuth2Api: { id: 'WpF0dPs521RPKvik', name: 'Manam Google Drive account' } };
const NAME = 'ACE - Save video to Drive';
const FOLDER = 'application/vnd.google-apps.folder';
const LEVELS = 3;

const pathFile = path.join(root, 'workflow', '.drive-webhook-path');
const webhookPath = fs.existsSync(pathFile) ? fs.readFileSync(pathFile, 'utf8').trim() : crypto.randomBytes(16).toString('hex');
fs.writeFileSync(pathFile, webhookPath);

const nodes = [];
const conn = {};
let x = 0;
const add = (node, row = 0) => { node.id = crypto.randomUUID(); node.position = [x, row]; x += 240; nodes.push(node); return node.name; };
const link = (a, b, out = 0) => { conn[a] = conn[a] || { main: [] }; while (conn[a].main.length <= out) conn[a].main.push([]); conn[a].main[out].push({ node: b, type: 'main', index: 0 }); };
const code = (name, jsCode, row) => add({ name, type: 'n8n-nodes-base.code', typeVersion: 2, parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode } }, row);
const driveApi = (name, parameters, row) => add({ name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, credentials: CRED, parameters: { authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api', options: {}, ...parameters } }, row);
const ifNode = (name, left, row) => add({ name, type: 'n8n-nodes-base.if', typeVersion: 2.2, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ id: 'c1', leftValue: left, rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} } }, row);

// ----- entry and routing -----
const receive = add({ name: 'Receive', type: 'n8n-nodes-base.webhook', typeVersion: 2, webhookId: crypto.randomUUID(), parameters: { httpMethod: 'POST', path: webhookPath, responseMode: 'lastNode', options: { binaryPropertyName: 'file' } } });
const isFolderJob = ifNode('Folder job?', "={{ ['ensure','delete'].includes(String($json.body && $json.body.action)) }}");
link(receive, isFolderJob);

// ----- upload (multipart): the first uploaded file arrives as file0 -----
const upload = add({
  name: 'Save to Drive', type: 'n8n-nodes-base.googleDrive', typeVersion: 3, credentials: CRED,
  parameters: {
    resource: 'file', operation: 'upload', inputDataFieldName: 'file0',
    name: '={{ $json.body.name || "video.mp4" }}',
    driveId: { __rl: true, mode: 'list', value: 'My Drive' },
    folderId: { __rl: true, mode: 'id', value: '={{ $json.body.folderId || ' + JSON.stringify(ROOT_ID) + ' }}' },
    options: {},
  },
}, 300);
const reply = add({ name: 'Reply with link', type: 'n8n-nodes-base.set', typeVersion: 3.4, parameters: { mode: 'manual', assignments: { assignments: [
  { id: crypto.randomUUID(), name: 'id', value: '={{ $json.id }}', type: 'string' },
  { id: crypto.randomUUID(), name: 'url', value: '=https://drive.google.com/file/d/{{ $json.id }}/view', type: 'string' },
] }, includeOtherFields: false, options: {} } }, 300);
link(isFolderJob, upload, 1);
link(upload, reply);

// ----- nested folders: find or create, one level at a time (up to LEVELS deep) -----
const init = code('Start', `
const b = $('Receive').first().json.body || {};
return [{ json: { parent: b.parentId || ${JSON.stringify(ROOT_ID)}, trail: [] } }];`, -150);
link(isFolderJob, init, 0);
let exits = [[init, 0]]; // [node, output] pairs that feed the next level
for (let i = 1; i <= LEVELS; i++) {
  const q = code('Look up ' + i, `
const st = $input.first().json;
const names = ($('Receive').first().json.body || {}).names || [];
const name = String(names[${i - 1}] || '').trim();
const BS = String.fromCharCode(92);
const esc = (s) => s.split(BS).join(BS + BS).split("'").join(BS + "'");
const q = name && st.parent
  ? "name = '" + esc(name) + "' and '" + st.parent + "' in parents and mimeType = '${FOLDER}' and trashed = false"
  : "name = '__none__' and 'root' in parents and trashed = false";
return [{ json: { ...st, name, q } }];`, -150);
  const find = driveApi('Find ' + i, { method: 'GET', url: 'https://www.googleapis.com/drive/v3/files', sendQuery: true, queryParameters: { parameters: [
    { name: 'q', value: '={{ $json.q }}' }, { name: 'fields', value: 'files(id,name)' }, { name: 'pageSize', value: '5' },
    { name: 'supportsAllDrives', value: 'true' }, { name: 'includeItemsFromAllDrives', value: 'true' }] } }, -150);
  const decide = code('Decide ' + i, `
const st = $('Look up ${i}').first().json;
const hit = (($input.first().json || {}).files || [])[0];
const rb = $('Receive').first().json.body || {};
const mayCreate = rb.action === 'ensure' && rb.create !== false; // deleting never creates folders
if (!st.name) return [{ json: { parent: st.parent, trail: st.trail, need_create: false } }];
if (hit) return [{ json: { parent: hit.id, trail: [...st.trail, hit.id], need_create: false } }];
if (!st.parent || !mayCreate) return [{ json: { parent: null, trail: st.trail, need_create: false } }];
return [{ json: { parent: st.parent, trail: st.trail, name: st.name, need_create: true } }];`, -150);
  const need = ifNode('Missing ' + i + '?', '={{ $json.need_create }}', -150);
  const create = driveApi('Create ' + i, { method: 'POST', url: 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ name: $json.name, mimeType: '" + FOLDER + "', parents: [$json.parent] }) }}" }, -50);
  const made = code('Created ' + i, `
const before = $('Decide ${i}').first().json;
const id = $input.first().json.id;
return [{ json: { parent: id, trail: [...before.trail, id], need_create: false } }];`, -50);
  for (const [n, o] of exits) link(n, q, o);
  link(q, find); link(find, decide); link(decide, need);
  link(need, create, 0); link(create, made);
  exits = [[need, 1], [made, 0]];
}

const result = code('Folder result', `
const b = $('Receive').first().json.body || {};
const st = $input.first().json;
const trail = st.trail || [];
let id = b.id || trail[trail.length - 1] || null;
if (st.parent === null && !b.id) id = null; // a level was not found (create:false) or its parent was missing
// Deleting by name needs at least client + run, so the root or a whole client folder is never trashed by mistake.
if (b.action === 'delete' && !b.id && (b.names || []).filter(Boolean).length < 2) id = null;
return [{ json: { action: b.action, id, trail, ok: !!id, url: id ? 'https://drive.google.com/drive/folders/' + id : null } }];`, -150);
for (const [n, o] of exits) link(n, result, o);

const isDelete = ifNode('Delete?', '={{ $json.action === "delete" }}', -150);
const found = ifNode('Found?', '={{ !!$json.id }}', -150);
const trash = driveApi('Move to bin', { method: 'PATCH', url: '=https://www.googleapis.com/drive/v3/files/{{ $json.id }}?supportsAllDrives=true', sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify({ trashed: true }) }}' }, -50);
const deleted = code('Deleted', `return [{ json: { ok: true, deleted: true, id: $('Folder result').first().json.id } }];`, -50);
const nothing = code('Nothing to delete', `return [{ json: { ok: true, deleted: false } }];`, 50);
const ensureReply = code('Ensure reply', `return [{ json: $('Folder result').first().json }];`, 50);
link(result, isDelete);
link(isDelete, found, 0); link(isDelete, ensureReply, 1);
link(found, trash, 0); link(found, nothing, 1);
link(trash, deleted);

(async () => {
  const body = JSON.stringify({ name: NAME, nodes, connections: conn, settings: { executionOrder: 'v1' } });
  const list = await (await fetch(base + '/api/v1/workflows?limit=50&name=' + encodeURIComponent(NAME), { headers: H })).json();
  const existing = (list.data || []).find((w) => w.name === NAME);
  const r = existing
    ? await fetch(base + '/api/v1/workflows/' + existing.id, { method: 'PUT', headers: H, body })
    : await fetch(base + '/api/v1/workflows', { method: 'POST', headers: H, body });
  const j = await r.json();
  if (!r.ok) { console.error('HTTP', r.status, JSON.stringify(j).slice(0, 600)); process.exit(1); }
  console.log(existing ? 'Updated' : 'Created', 'workflow id', j.id, '(' + nodes.length + ' nodes, root folder ' + ROOT_ID + ')');
  // Re-activate so the webhook picks up the new graph.
  await fetch(base + '/api/v1/workflows/' + j.id + '/deactivate', { method: 'POST', headers: H });
  const a = await fetch(base + '/api/v1/workflows/' + j.id + '/activate', { method: 'POST', headers: H });
  console.log('Activate: HTTP', a.status, a.ok ? '(active)' : (await a.text()).slice(0, 200));
  console.log('\nWebhook URL (keep it private):\n  ' + base + '/webhook/' + webhookPath);
})();
