// Creates (or updates) the n8n workflow "ACE - Write more" and activates it. Run once (and after edits):
//   NODE_OPTIONS="--dns-result-order=ipv4first" node tools/deploy_write_n8n.js
//
// Behind the app's "Generate more" and "Rewrite" buttons. One private webhook, two jobs, for hooks, static ads and video scripts:
//   op "more"    write N NEW items that differ from the existing ones (optionally following the user's instruction)
//   op "update"  rewrite ONE existing item, applying the user's instruction
//   op "tags"    write hashtags for posts that have none
//   op "research" area-by-area local competitor research with Claude's web search tool (real businesses, with source links)
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
if (b.op === 'research') {
  const area = String(b.area || '').replace(/ +/g, ' ').trim().slice(0, 80);
  if (!area) throw new Error('Name an area to research.');
  const keywords = (Array.isArray(b.keywords) ? b.keywords : []).map((x) => String(x).slice(0, 60)).slice(0, 8);
  const system = 'You are a local-market competitor researcher for a paid-social strategist. Use the web search tool to find REAL businesses that compete with the brand in the given AREA (a city or region; include its main towns if it is a region). Find 4 to 8 competitors, preferring those with a strong local presence or visible advertising. For each one, report only what you actually saw in search results or on their pages (or on public ad-library pages if they came up): name, website, what they do, the offers they push, claims or hooks visible on their site or ads, price signals if public, strengths, gaps or weaknesses, the channels they use, and the source URLs. NEVER invent a competitor, quote, price, rating or claim: if you could not find something, use null or an empty list, and lower the confidence. Then give local notes (how crowded the market is, seasonality, language or local terms worth using), opportunities (angles the brand can own in this area, tied to what the competitors are not saying), and caveats. Return ONLY one JSON object, with no text before or after it, shaped like: {"area": string, "summary": string, "competitors": [{"name": string, "website": string|null, "what_they_do": string, "offers": [string], "claims_or_hooks_seen": [string], "price_signals": string|null, "strengths": [string], "gaps": [string], "channels": [string], "source_urls": [string], "confidence": "high"|"medium"|"low"}], "local_notes": [string], "opportunities": [string], "caveats": [string]}';
  const user = 'BRAND BRIEF:\\n' + JSON.stringify(b.brief || {}) + '\\n\\nAREA: ' + area + (keywords.length ? '\\nSEARCH KEYWORDS: ' + keywords.join('; ') : '');
  return [{ json: { kind: 'competitors', op: 'research', area, count: 1, nextId: 0, _req: { model: /^[A-Za-z0-9][A-Za-z0-9._-]{2,59}$/.test(String(b.model || '')) ? String(b.model) : ${JSON.stringify(MODEL)}, max_tokens: 8000, system, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }], messages: [{ role: 'user', content: user }] } } }];
}
const kind = ['hooks', 'statics', 'videos'].includes(b.kind) ? b.kind : null;
if (!kind) throw new Error('Unknown kind.');
const op = b.op === 'update' ? 'update' : b.op === 'tags' ? 'tags' : 'more';
if (op === 'tags') {
  if (kind === 'hooks') throw new Error('Hooks do not get hashtags.');
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 20);
  if (!items.length) throw new Error('Nothing to tag.');
  const system = 'You write hashtags for social media ad posts. For EACH item in the user message return 6 to 8 hashtags: each a single word or camel-case phrase starting with # (for example #HVACRepair), no spaces or punctuation. Mix 2 broad industry tags, 3 to 4 niche or problem-specific tags, and 1 to 2 location or audience tags ONLY if the brand brief names a place or audience. No competitor brand names, no banned or misleading tags, no engagement-bait tags (#fyp, #followforfollow). Return ONLY a JSON object: {"tags":[{"id":<the item id>,"hashtags":["#...","#..."]}]} with one entry per item.';
  const user = 'BRAND BRIEF:\\n' + JSON.stringify(b.brief || {}) + '\\n\\nITEMS (' + kind + '):\\n' + JSON.stringify(items);
  return [{ json: { kind, op, count: items.length, nextId: 0, ids: items.map((x) => x.id), _req: { model: /^[A-Za-z0-9][A-Za-z0-9._-]{2,59}$/.test(String(b.model || '')) ? String(b.model) : ${JSON.stringify(MODEL)}, max_tokens: Math.min(8000, 600 + 220 * items.length), system, messages: [{ role: 'user', content: user }] } } }];
}
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
if (meta.op === 'research') {
  if (resp.stop_reason === 'pause_turn') throw new Error('The research took too long and was paused. Try again, or research a smaller area.');
  if (resp.stop_reason === 'max_tokens') throw new Error('The research ran out of room. Try again.');
  const blocks = (resp.content || []).filter((c) => c.type === 'text' && c.text && c.text.indexOf('{') >= 0);
  const last = blocks.length ? blocks[blocks.length - 1].text : '';
  const a1 = last.indexOf('{'), z1 = last.lastIndexOf('}');
  if (a1 < 0 || z1 < 0) throw new Error('The research returned no result. Try again.');
  let r;
  try { r = JSON.parse(last.slice(a1, z1 + 1)); } catch (e) { throw new Error('The research result was not valid: ' + e.message); }
  // Web search adds citation tags such as <cite index=...>; the page shows plain text and shows the sources separately.
  const txt = (v, m) => String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/ +/g, ' ').trim().slice(0, m || 300);
  const arr = (x, n, m) => (Array.isArray(x) ? x : []).map((v) => txt(v, m)).filter(Boolean).slice(0, n || 8);
  const url = (u) => { const t = String(u || '').trim(); return /^https?:[/][/]/i.test(t) ? t.slice(0, 300) : null; };
  const competitors = (Array.isArray(r.competitors) ? r.competitors : []).slice(0, 10).map((c) => ({
    name: txt(c.name, 100), website: url(c.website), what_they_do: txt(c.what_they_do, 400),
    offers: arr(c.offers, 5), claims_or_hooks_seen: arr(c.claims_or_hooks_seen, 5), price_signals: c.price_signals ? txt(c.price_signals, 200) : null,
    strengths: arr(c.strengths, 4), gaps: arr(c.gaps, 4), channels: arr(c.channels, 6, 40), source_urls: arr((c.source_urls || []).map(url), 5, 300),
    confidence: ['high', 'medium', 'low'].includes(c.confidence) ? c.confidence : 'low',
  })).filter((c) => c.name);
  if (!competitors.length) throw new Error('No competitors were found for that area. Try a nearby city or different keywords.');
  const item = { area: meta.area, summary: txt(r.summary, 700), competitors, local_notes: arr(r.local_notes, 6), opportunities: arr(r.opportunities, 8), caveats: arr(r.caveats, 5) };
  const su = resp.usage && resp.usage.server_tool_use;
  return [{ json: { kind: 'competitors', op: 'research', item, usage: resp.usage || null, searches: (su && su.web_search_requests) || 0 } }];
}
if (resp.stop_reason === 'max_tokens') throw new Error('The model ran out of room (max_tokens). Try asking for fewer items.');
const text = (resp.content || []).map((c) => c.text || '').join('');
const a = text.indexOf('{'), z = text.lastIndexOf('}');
if (a < 0 || z < 0) throw new Error('The model returned no JSON: ' + text.slice(0, 200));
let data;
try { data = JSON.parse(text.slice(a, z + 1)); } catch (e) { throw new Error('The model returned invalid JSON: ' + e.message); }
${CLEAN_TAGS}
${VIDEO_NORMALIZER}
const CTAS = ['Learn More', 'Sign Up', 'Book Now', 'Contact Us', 'Get Quote', 'Apply Now', 'Download', 'Shop Now'];
if (meta.op === 'tags') {
  const got = Array.isArray(data.tags) ? data.tags : [];
  const tagged = got.map((t) => ({ id: t.id, hashtags: cleanTags(t.hashtags) })).filter((t) => meta.ids.includes(t.id) && t.hashtags.length);
  if (!tagged.length) throw new Error('No hashtags came back. Try again.');
  return [{ json: { kind: meta.kind, op: 'tags', items: tagged, usage: resp.usage || null } }];
}
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
