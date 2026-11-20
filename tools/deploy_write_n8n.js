// Creates (or updates) the n8n workflow "ACE - Write more" and activates it. Run once (and after edits):
//   NODE_OPTIONS="--dns-result-order=ipv4first" node tools/deploy_write_n8n.js
//
// Behind the app's "Generate more" and "Rewrite" buttons. One private webhook, two jobs, for hooks, static ads and video scripts:
//   op "more"    write N NEW items that differ from the existing ones (optionally following the user's instruction)
//   op "update"  rewrite ONE existing item, applying the user's instruction
// Claude is called with the Anthropic credential kept in n8n, using the same prompt files as the main workflow plus a short
// override. The webhook answers at once with its execution id; the app then reads that (small, text-only) execution.
// The private webhook path is kept in workflow/.write-webhook-path (git-ignored).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { CLEAN_TAGS, VIDEO_NORMALIZER } = require('./lib/fragments');
const root = path.join(__dirname, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const base = (env.N8N_BASE_URL || '').replace(/\/+$/, '').replace(/\/home.*$/, '');
const key = env.N8N_API;
if (!base || !key) { console.error('Need N8N_API and N8N_BASE_URL in .env'); process.exit(1); }
const H = { 'X-N8N-API-KEY': key, 'content-type': 'application/json' };
const CRED = { anthropicApi: { id: 'n5ALzhD4GiO2Ert9', name: 'Anthropic account' } };
const MODEL = env.CLAUDE_MODEL || 'claude-sonnet-5-5';
const NAME = 'ACE - Write more';
const prompt = (f) => fs.readFileSync(path.join(root, 'prompts', f), 'utf8');
const PROMPTS = { hooks: prompt('hooks.md'), statics: prompt('statics.md'), videos: prompt('video_scripts.md') };

const pathFile = path.join(root, 'workflow', '.write-webhook-path');
const webhookPath = fs.existsSync(pathFile) ? fs.readFileSync(pathFile, 'utf8').trim() : 'ace-write-' + crypto.randomBytes(14).toString('hex');
fs.writeFileSync(pathFile, webhookPath);

const id = () => crypto.randomUUID();
const code = (name, position, jsCode) => ({ id: id(), name, type: 'n8n-nodes-base.code', typeVersion: 2, position, parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode } });

const BUILD = `
const b = $('Receive').first().json.body || {};
const PROMPTS = ${JSON.stringify(PROMPTS)};
const kind = ['hooks', 'statics', 'videos'].includes(b.kind) ? b.kind : null;
if (!kind) throw new Error('Unknown kind.');
const op = b.op === 'update' ? 'update' : 'more';
const MAX = { hooks: 10, statics: 10, videos: 5 };
const count = op === 'update' ? 1 : Math.max(1, Math.min(MAX[kind], parseInt(b.count, 10) || 1));
const instruction = String(b.instruction || '').replace(/ +/g, ' ').trim().slice(0, 400);
const nextId = parseInt(b.nextId, 10) || 1;
const noun = { hooks: 'hooks', statics: 'static ad concepts', videos: 'video scripts' }[kind];
let override;
if (op === 'update') {
  override = 'MODE: REWRITE ONE. Ignore every rule about how many items to return and about using each hook twice. Return the SAME JSON shape with exactly ONE item in the array: a rewritten version of the CURRENT item given in the user message. Keep its id' + (kind === 'statics' ? ', hook_id and aspect' : '') + ' unless the instruction says otherwise. Keep every other rule (character limits, allowed CTAs, proof-only claims, safe-image rules).'
    + (instruction ? ' Apply this instruction from the user: ' + instruction : ' The user gave no instruction: improve it, make it sharper and more specific.');
} else {
  override = 'MODE: EXTEND. Ignore every rule about the total number of items and about using each hook twice. Return the SAME JSON shape with exactly ' + count + ' NEW ' + noun + ' in the array. They must be clearly different from the EXISTING items listed in the user message (different angle, wording, and ' + (kind === 'statics' ? 'visual style' : 'idea') + '). Number the ids from ' + nextId + ' upward. Keep every other rule (character limits, allowed CTAs, proof-only claims, safe-image rules).'
    + (instruction ? ' Focus: ' + instruction : '');
}
const parts = ['BRAND BRIEF:\\n' + JSON.stringify(b.brief || {})];
if (kind !== 'hooks') parts.push('HOOKS:\\n' + JSON.stringify(b.hooks || []));
if (op === 'more') parts.push('EXISTING ' + noun.toUpperCase() + ' (do not repeat these):\\n' + JSON.stringify(b.existing || []));
if (op === 'update') parts.push('CURRENT ITEM TO REWRITE:\\n' + JSON.stringify(b.item || {}));
const per = { hooks: 700, statics: 1700, videos: 2600 }[kind];
const max_tokens = Math.min(16000, 1200 + per * count);
return [{ json: { kind, op, count, nextId, itemId: b.item && b.item.id, _req: { model: /^[A-Za-z0-9][A-Za-z0-9._-]{2,59}$/.test(String(b.model || '')) ? String(b.model) : ${JSON.stringify(MODEL)}, max_tokens, system: PROMPTS[kind] + '\\n\\n' + override, messages: [{ role: 'user', content: parts.join('\\n\\n') }] } } }];`;

const PARSE = `
const meta = $('Build').first().json;
const resp = $input.first().json;
if (resp.error) throw new Error('Anthropic error: ' + JSON.stringify(resp.error).slice(0, 300));
if (resp.stop_reason === 'max_tokens') throw new Error('The model ran out of room (max_tokens). Try asking for fewer items.');
const text = (resp.content || []).map((c) => c.text || '').join('');
const a = text.indexOf('{'), z = text.lastIndexOf('}');
if (a < 0 || z < 0) throw new Error('The model returned no JSON: ' + text.slice(0, 200));
let data;
try { data = JSON.parse(text.slice(a, z + 1)); } catch (e) { throw new Error('The model returned invalid JSON: ' + e.message); }
${CLEAN_TAGS}
${VIDEO_NORMALIZER}
const CTAS = ['Learn More', 'Sign Up', 'Book Now', 'Contact Us', 'Get Quote', 'Apply Now', 'Download', 'Shop Now'];
const list = data[meta.kind];
if (!Array.isArray(list) || !list.length) throw new Error('The model returned no ' + meta.kind + '.');
const idFor = (i) => (meta.op === 'update' ? meta.itemId : meta.nextId + i);
let items = list.slice(0, meta.count);
if (meta.kind === 'hooks') {
  items = items.map((h, i) => ({ ...h, id: idFor(i), hook: String(h.hook || '').trim() })).filter((h) => h.hook);
} else if (meta.kind === 'statics') {
  items = items.map((s, i) => ({ ...s, id: idFor(i), aspect: s.aspect === '9:16' ? '9:16' : '1:1', cta: CTAS.includes(s.cta) ? s.cta : 'Learn More', hashtags: cleanTags(s.hashtags) })).filter((s) => s.image_prompt && s.headline);
} else {
  items = items.map((v, i) => ({ ...normalizeVideo(v, i), id: idFor(i) }));
}
if (!items.length) throw new Error('Nothing usable came back. Try again.');
return [{ json: { kind: meta.kind, op: meta.op, items, usage: resp.usage || null } }];`;

const nodes = [
  { id: id(), name: 'Receive', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: id(),
    parameters: { httpMethod: 'POST', path: webhookPath, responseMode: 'responseNode', options: {} } },
  { id: id(), name: 'Reply with id', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [220, 0],
    parameters: { respondWith: 'json', responseBody: "={{ JSON.stringify({ execution_id: String($execution.id) }) }}", options: {} } },
  code('Build', [440, 0], BUILD),
  { id: id(), name: 'Claude', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [660, 0], credentials: CRED, retryOnFail: true, maxTries: 2, waitBetweenTries: 5000,
    parameters: { method: 'POST', url: 'https://api.anthropic.com/v1/messages', authentication: 'predefinedCredentialType', nodeCredentialType: 'anthropicApi',
      sendHeaders: true, headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }] },
      sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json._req) }}', options: { timeout: 240000 } } },
  code('Parse', [880, 0], PARSE),
];
const chain = ['Receive', 'Reply with id', 'Build', 'Claude', 'Parse'];
const connections = {};
for (let i = 0; i < chain.length - 1; i++) connections[chain[i]] = { main: [[{ node: chain[i + 1], type: 'main', index: 0 }]] };

// A syntax check of the Code nodes, like build_workflow.js does.
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
for (const n of nodes.filter((n) => n.type === 'n8n-nodes-base.code')) {
  try { new AsyncFn('$', '$input', '$json', '$itemIndex', n.parameters.jsCode); } catch (e) { console.error('SYNTAX ERROR in "' + n.name + '":', e.message); process.exit(1); }
}

(async () => {
  const body = JSON.stringify({ name: NAME, nodes, connections, settings: { executionOrder: 'v1', saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all' } });
  const list = await (await fetch(base + '/api/v1/workflows?limit=50&name=' + encodeURIComponent(NAME), { headers: H })).json();
  const existing = (list.data || []).find((w) => w.name === NAME);
  const r = existing
    ? await fetch(base + '/api/v1/workflows/' + existing.id, { method: 'PUT', headers: H, body })
    : await fetch(base + '/api/v1/workflows', { method: 'POST', headers: H, body });
  const j = await r.json();
  if (!r.ok) { console.error('HTTP', r.status, JSON.stringify(j).slice(0, 600)); process.exit(1); }
  console.log(existing ? 'Updated' : 'Created', 'workflow id', j.id, '(' + nodes.length + ' nodes, model ' + MODEL + ')');
  await fetch(base + '/api/v1/workflows/' + j.id + '/deactivate', { method: 'POST', headers: H });
  const a = await fetch(base + '/api/v1/workflows/' + j.id + '/activate', { method: 'POST', headers: H });
  console.log('Activate: HTTP', a.status, a.ok ? '(active)' : (await a.text()).slice(0, 200));
  console.log('\nThe app finds it automatically on this machine. For Netlify add N8N_WRITE_WEBHOOK_URL (Secret):\n  ' + base + '/webhook/' + webhookPath);
})();
