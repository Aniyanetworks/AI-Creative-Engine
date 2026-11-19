// Generates workflow/creative-engine.n8n.json from prompts/*.md
// Uses n8n's stored credentials (Anthropic, OpenAI, Google Drive); no API keys inside the workflow.
// Usage: node tools/build_workflow.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const prompt = (name) => JSON.stringify(fs.readFileSync(path.join(root, 'prompts', name + '.md'), 'utf8').trim());

// Credentials that already exist in the n8n instance.
const CRED = {
  anthropicApi: { id: 'n5ALzhD4GiO2Ert9', name: 'Anthropic account' },
  openAiApi: { id: 'fj3WhBV98VkK9qr3', name: 'Manam- OpenAi account' },
  googleDriveOAuth2Api: { id: 'WpF0dPs521RPKvik', name: 'Manam Google Drive account' },
};

// Random webhook path so the URL is not guessable (keep stable across rebuilds).
const pathFile = path.join(root, 'workflow', '.webhook-path');
let webhookPath;
if (fs.existsSync(pathFile)) webhookPath = fs.readFileSync(pathFile, 'utf8').trim();
else { webhookPath = 'creative-engine-' + crypto.randomBytes(12).toString('hex'); fs.writeFileSync(pathFile, webhookPath); }

// The Drive folder service (tools/deploy_drive_n8n.js) keeps its private webhook path in workflow/.drive-webhook-path.
let driveHookUrl = '';
try {
  const e = fs.readFileSync(path.join(root, '.env'), 'utf8').match(/^N8N_BASE_URL=(.*)$/m);
  const base = (e ? e[1].trim().replace(/^['"]|['"]$/g, '') : 'https://n8n.srv1300653.hstgr.cloud').replace(/[/]+$/, '');
  driveHookUrl = base + '/webhook/' + fs.readFileSync(path.join(root, 'workflow', '.drive-webhook-path'), 'utf8').trim();
} catch { /* not deployed yet: uploads go straight to the root folder */ }

const BASE = `
const cfg = $('Config').first().json;
const input = $('Webhook').first().json.body || {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
`;

const nodes = [];
const links = []; // [from, to, outputIndex]
let col = 0;
const place = (node, row = 300) => {
  node.position = [col * 260, row];
  col += 1;
  node.id = node.id || node.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  nodes.push(node);
  return node.name;
};
let prev = null;
const seq = (name) => { if (prev) links.push([prev, name, 0]); prev = name; return name; };

const codeNode = (name, body, mode = 'runOnceForAllItems', extra = {}) =>
  seq(place({ name, type: 'n8n-nodes-base.code', typeVersion: 2, parameters: { mode, language: 'javaScript', jsCode: body }, ...extra }));

// ---------- Trigger + config ----------
seq(place({
  name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, webhookId: crypto.randomUUID(),
  parameters: { httpMethod: 'POST', path: webhookPath, responseMode: 'onReceived', options: {} },
}));

const field = (name, value) => ({ id: name, name, value, type: 'string' });
seq(place({
  name: 'Config', type: 'n8n-nodes-base.set', typeVersion: 3.4,
  notes: 'Settings only. API keys live in n8n credentials (Anthropic, OpenAI, Google Drive). heygen_* and apify_token are optional; no n8n credential exists for them.',
  parameters: {
    assignments: { assignments: [
      field('claude_model', 'claude-sonnet-5-5'),
      field('image_model', 'gpt-image-1'),
      field('image_quality', 'medium'),
      field('drive_folder_id', 'root'),
      field('drive_hook_url', driveHookUrl),
      field('max_images', '20'),
      field('max_videos', '5'),
      field('ad_country', 'CA'),
      field('apify_token', ''),
      field('apify_actor', 'apify~facebook-ads-scraper'),
      field('heygen_key', ''),
      field('heygen_avatar_id', ''),
      field('heygen_voice_id', ''),
    ] },
    includeOtherFields: true, options: {},
  },
}));

// ---------- Fetch website ----------
codeNode('Fetch Website', BASE + `
const url = (input.url || '').trim();
if (!/^https?:\\/\\//i.test(url)) throw new Error('Webhook body needs "url" starting with http(s)://');
let text = '';
try {
  text = await this.helpers.httpRequest({ method: 'GET', url: 'https://r.jina.ai/' + url, headers: { Accept: 'text/plain' }, json: false });
} catch (e) { /* fall through to direct fetch */ }
if (!text || text.length < 200) {
  const html = await this.helpers.httpRequest({ method: 'GET', url, json: false });
  text = String(html).replace(/<script[\\s\\S]*?<\\/script>/gi, ' ').replace(/<style[\\s\\S]*?<\\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ');
}
text = String(text).slice(0, 24000);
if (text.length < 200) throw new Error('Could not read enough text from ' + url);

// Brand signals from the raw page: dominant colours, logo / share image, title.
const signals = { colors: [], logo_url: null, og_image: null, page_title: null };
try {
  const raw = String(await this.helpers.httpRequest({ method: 'GET', url, json: false, timeout: 20000 })).slice(0, 600000);
  const counts = {};
  for (const m of raw.matchAll(/#([0-9a-fA-F]{6})\\b/g)) { const h = '#' + m[1].toLowerCase(); counts[h] = (counts[h] || 0) + 1; }
  const grey = (h) => { const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16); return Math.max(r, g, b) - Math.min(r, g, b) < 24; };
  signals.colors = Object.entries(counts).filter(([h]) => !grey(h)).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([h]) => h);
  const abs = (u) => { try { return new URL(u, url).href; } catch (e) { return null; } };
  const og = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(raw) || /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(raw);
  if (og) signals.og_image = abs(og[1]);
  const logo = /<img[^>]+(?:class|id|alt|src)=["'][^"']*logo[^"']*["'][^>]*>/i.exec(raw);
  if (logo) { const s = /src=["']([^"']+)["']/i.exec(logo[0]); if (s) signals.logo_url = abs(s[1]); }
  const t = /<title[^>]*>([^<]+)<\\/title>/i.exec(raw);
  if (t) signals.page_title = t[1].trim().slice(0, 120);
} catch (e) { /* signals stay empty */ }

return [{ json: {
  site_signals: signals,
  url,
  business_name_hint: input.business_name || '',
  competitor_notes: input.competitor_notes || '',
  dry_run: input.dry_run === true || input.dry_run === 'true',
  started_at: new Date().toISOString(),
  site_text: text,
} }];
`);

// ---------- LLM step = Prep (Code) -> Claude (HTTP, n8n credential) -> Parse (Code) ----------
const PARSE_HELPERS = `
const resp = $input.first().json;
if (resp.error) throw new Error('Anthropic error: ' + JSON.stringify(resp.error).slice(0, 300));
if (resp.stop_reason === 'max_tokens') throw new Error('Model output was cut off (max_tokens). Raise max_tokens for this step.');
const text = (resp.content || []).map((c) => c.text || '').join('');
const a = text.indexOf('{'), b = text.lastIndexOf('}');
if (a < 0 || b < 0) throw new Error('Model returned no JSON: ' + text.slice(0, 200));
let data;
try { data = JSON.parse(text.slice(a, b + 1)); } catch (e) { throw new Error('Model returned invalid JSON: ' + e.message); }
`;

function llmStep(key, promptFile, maxTokens, { pre = '', user, parse }) {
  const prepName = key + ' (prep)';
  const callName = key + ' (Claude)';
  const parseName = key;
  codeNode(prepName, BASE + `
const ctx = $input.first().json;
let extra = {};
${pre}
const SYSTEM = ${prompt(promptFile)};
const user = ${user};
return [{ json: { ...ctx, ...extra, _req: {
  model: cfg.claude_model, max_tokens: ${maxTokens}, system: SYSTEM,
  messages: [{ role: 'user', content: user }],
} } }];
`);
  seq(place({
    name: callName, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,
    credentials: { anthropicApi: CRED.anthropicApi },
    parameters: {
      method: 'POST', url: 'https://api.anthropic.com/v1/messages',
      authentication: 'predefinedCredentialType', nodeCredentialType: 'anthropicApi',
      sendHeaders: true, headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }] },
      sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json._req) }}',
      options: { timeout: 240000 },
    },
  }));
  codeNode(parseName, BASE + `
const ctx = { ...$('${prepName}').first().json }; delete ctx._req;
${PARSE_HELPERS}
${parse}
`);
}

llmStep('Brand Brief', 'brand_brief', 6000, {
  user: `'Website URL: ' + ctx.url + '\\n\\nDETECTED SITE SIGNALS (from the page source):\\n' + JSON.stringify(ctx.site_signals) + '\\n\\nWEBSITE TEXT:\\n' + ctx.site_text`,
  parse: `
if (ctx.business_name_hint) data.business_name = ctx.business_name_hint;
delete ctx.site_text;
return [{ json: { ...ctx, brief: data } }];`,
});

llmStep('Competitor Analysis', 'competitors', 6000, {
  pre: `
let ads = [];
let adLibraryError = null;
if (cfg.apify_token) {
  try {
    const kws = (ctx.brief.competitor_search_keywords || []).slice(0, 3);
    for (const kw of kws) {
      const searchUrl = 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=' + cfg.ad_country +
        '&q=' + encodeURIComponent(kw) + '&search_type=keyword_unordered&media_type=all';
      const items = await this.helpers.httpRequest({
        method: 'POST',
        url: 'https://api.apify.com/v2/acts/' + cfg.apify_actor + '/run-sync-get-dataset-items?token=' + cfg.apify_token,
        headers: { 'content-type': 'application/json' },
        body: { startUrls: [{ url: searchUrl }], resultsLimit: 15 },
        json: true, timeout: 280000,
      });
      for (const it of (Array.isArray(items) ? items : [])) {
        ads.push({
          keyword: kw,
          advertiser: it.pageName || it.page_name || it.advertiser || null,
          text: (it.snapshot && (it.snapshot.body && it.snapshot.body.text || it.snapshot.title)) || it.adText || it.body || it.text || null,
          started: it.startDate || it.start_date || null,
          format: it.displayFormat || (it.snapshot && it.snapshot.displayFormat) || null,
          cta: (it.snapshot && it.snapshot.ctaText) || it.ctaText || null,
        });
      }
    }
    ads = ads.filter((a) => a.text).slice(0, 45);
  } catch (e) { adLibraryError = String(e.message || e).slice(0, 300); }
}
extra = { raw_competitor_ads: ads, ad_library_error: adLibraryError };
`,
  user: `'BRAND BRIEF:\\n' + JSON.stringify(ctx.brief) + '\\n\\nAD LIBRARY ADS (' + ads.length + '):\\n' + (ads.length ? JSON.stringify(ads) : 'none') + '\\n\\nMANUAL NOTES:\\n' + (ctx.competitor_notes || 'none')`,
  parse: `return [{ json: { ...ctx, competitors: data } }];`,
});

llmStep('Hooks and Angles', 'hooks', 10000, {
  user: `'BRAND BRIEF:\\n' + JSON.stringify(ctx.brief) + '\\n\\nCOMPETITOR ANALYSIS:\\n' + JSON.stringify(ctx.competitors)`,
  parse: `
if (!Array.isArray(data.hooks) || data.hooks.length < 10) throw new Error('Expected 10 hooks, got ' + (data.hooks || []).length);
return [{ json: { ...ctx, hooks: data.hooks.slice(0, 10) } }];`,
});

llmStep('Static Concepts', 'statics', 20000, {
  user: `'BRAND BRIEF:\\n' + JSON.stringify(ctx.brief) + '\\n\\nHOOKS:\\n' + JSON.stringify(ctx.hooks)`,
  parse: `
if (!Array.isArray(data.statics) || data.statics.length < 20) throw new Error('Expected 20 statics, got ' + (data.statics || []).length);
const statics = data.statics.slice(0, 20).map((s, i) => ({ ...s, id: i + 1 }));
const render_count = ctx.dry_run ? 0 : Math.max(0, Math.min(parseInt(input.max_images !== undefined && input.max_images !== '' ? input.max_images : cfg.max_images, 10) || 0, statics.length));
return [{ json: { ...ctx, statics, render_count } }];`,
});

// ---------- Google Drive folders: <root>/<business>/<date> · <run id>/{Static ads, Videos, report} ----------
codeNode('Plan Drive Folders', BASE + `
const ctx = $input.first().json;
const clean = (s) => String(s || '').split('/').join(' ').split(String.fromCharCode(92)).join(' ').replace(/[:*?"<>|]/g, ' ').replace(/ +/g, ' ').trim().slice(0, 80);
const business = clean(ctx.brief && ctx.brief.business_name) || 'Unnamed business';
const runKey = new Date().toISOString().slice(0, 10) + ' · ' + String(input.job_id || Date.now()).slice(0, 6);
return [{ json: { ...ctx, drive_names: [business, runKey, 'Static ads'] } }];`);
seq(place({
  name: 'Drive Folders', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, onError: 'continueRegularOutput',
  parameters: {
    method: 'POST', url: "={{ $('Config').first().json.drive_hook_url }}", sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ action: 'ensure', names: $('Plan Drive Folders').first().json.drive_names }) }}",
    options: { timeout: 60000 },
  },
}));
codeNode('Attach Drive Folders', `
const ctx = { ...$('Plan Drive Folders').first().json };
const r = $input.first().json || {};
delete ctx.drive_names;
ctx.drive = r.id && Array.isArray(r.trail) ? { static_id: r.id, run_id: r.trail[1] || null, run_url: r.trail[1] ? 'https://drive.google.com/drive/folders/' + r.trail[1] : null } : { error: String(r.error && (r.error.message || r.error) || r.message || 'Drive folder service unavailable').slice(0, 200) };
return [{ json: ctx }];`);

// ---------- Render statics: OpenAI image (n8n credential) -> Google Drive (n8n credential) ----------
const anyRenders = place({
  name: 'Any Images To Render', type: 'n8n-nodes-base.if', typeVersion: 2.2,
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ id: 'c1', leftValue: '={{ $json.render_count }}', rightValue: 0, operator: { type: 'number', operation: 'gt' } }],
      combinator: 'and',
    },
    options: {},
  },
});
links.push([prev, anyRenders, 0]);
prev = null; // IF outputs wired manually below

const splitName = place({
  name: 'Split Statics', type: 'n8n-nodes-base.code', typeVersion: 2,
  parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: BASE + `
const base = $input.first().json;
const slug = String((base.brief && base.brief.business_name) || 'business').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'business';
return base.statics.slice(0, base.render_count).map((s) => ({ json: { static: s, slug, image_model: cfg.image_model, image_quality: cfg.image_quality } }));
` },
});
links.push([anyRenders, splitName, 0]);

const openai = place({
  name: 'OpenAI Image', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
  retryOnFail: true, maxTries: 2, waitBetweenTries: 5000, onError: 'continueRegularOutput',
  credentials: { openAiApi: CRED.openAiApi },
  parameters: {
    method: 'POST', url: 'https://api.openai.com/v1/images/generations',
    authentication: 'predefinedCredentialType', nodeCredentialType: 'openAiApi',
    sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ model: $json.image_model, prompt: $json.static.image_prompt, size: $json.static.aspect === '9:16' ? '1024x1536' : '1024x1024', quality: $json.image_quality, n: 1 }) }}",
    options: { timeout: 240000, batching: { batch: { batchSize: 3, batchInterval: 1000 } } },
  },
});
links.push([splitName, openai, 0]);

const makeBin = place({
  name: 'Make Image File', type: 'n8n-nodes-base.code', typeVersion: 2,
  parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: `
const src = $('Split Statics').item.json;
const b64 = $json.data && $json.data[0] && $json.data[0].b64_json;
const file_name = src.slug + '_static_' + src.static.id + '.png';
if (!b64) return { json: { file_name, error: JSON.stringify($json.error || $json).slice(0, 300) } };
const bin = await this.helpers.prepareBinaryData(Buffer.from(b64, 'base64'), file_name, 'image/png');
return { json: { file_name }, binary: { data: bin } };
` },
});
links.push([openai, makeBin, 0]);

const drive = place({
  name: 'Upload To Drive', type: 'n8n-nodes-base.googleDrive', typeVersion: 3, onError: 'continueRegularOutput',
  credentials: { googleDriveOAuth2Api: CRED.googleDriveOAuth2Api },
  parameters: {
    resource: 'file', operation: 'upload', inputDataFieldName: 'data',
    name: '={{ $json.file_name }}',
    driveId: { __rl: true, mode: 'list', value: 'My Drive' },
    folderId: { __rl: true, mode: 'id', value: "={{ ($('Attach Drive Folders').first().json.drive || {}).static_id || $('Config').first().json.drive_folder_id }}" },
    options: {},
  },
});
links.push([makeBin, drive, 0]);

const collect = place({
  name: 'Collect Images', type: 'n8n-nodes-base.code', typeVersion: 2,
  parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `
const base = { ...$('Static Concepts').first().json };
const done = {};
for (const it of $input.all()) {
  const j = it.json || {};
  const m = j.id && j.name ? /_static_(\\d+)\\.png$/.exec(j.name) : null;
  if (m) done[m[1]] = j.id;
}
base.statics = base.statics.map((s, i) => {
  if (done[s.id]) return { ...s, image_url: 'https://drive.google.com/file/d/' + done[s.id] + '/view', image_status: 'ok' };
  if (base.render_count === 0) return { ...s, image_url: null, image_status: base.dry_run ? 'skipped (dry_run)' : 'skipped (max_images=0)' };
  return { ...s, image_url: null, image_status: i < base.render_count ? 'failed (see execution for the OpenAI or Drive error)' : 'skipped (max_images)' };
});
return [{ json: base }];
` },
});
links.push([drive, collect, 0]);
links.push([anyRenders, collect, 1]); // nothing to render: go straight through
prev = collect;

// ---------- Video scripts + render ----------
llmStep('Video Scripts', 'video_scripts', 12000, {
  user: `'BRAND BRIEF:\\n' + JSON.stringify(ctx.brief) + '\\n\\nHOOKS:\\n' + JSON.stringify(ctx.hooks)`,
  parse: `
if (!Array.isArray(data.videos) || data.videos.length < 5) throw new Error('Expected 5 video scripts, got ' + (data.videos || []).length);

const ICONS = ['bolt', 'clock', 'phone', 'shield', 'chart', 'check', 'wrench', 'star', 'mail', 'calendar', 'target', 'dollar'];
const KINDS = ['hook', 'point', 'proof', 'cta'];
const str = (v, n) => String(v == null ? '' : v).replace(/\\s+/g, ' ').trim().slice(0, n);

// Fallback storyboard when the model returns only a plain script: one scene per sentence.
const scenesFromScript = (script, cta) => {
  const sentences = String(script || '').match(/[^.!?]+[.!?]*/g) || [];
  const parts = sentences.map((x) => x.trim()).filter(Boolean).slice(0, 6);
  return parts.map((vo, i) => ({
    kind: i === 0 ? 'hook' : i === parts.length - 1 ? 'cta' : 'point',
    vo, headline: vo.split(' ').slice(0, 5).join(' ').replace(/[.,!?]+$/, ''), highlight: '', sub: i === parts.length - 1 ? str(cta, 40) : '', icon: 'star',
  }));
};

const videos = data.videos.slice(0, 5).map((v, i) => {
  let scenes = Array.isArray(v.scenes) ? v.scenes : [];
  if (scenes.length < 3) scenes = scenesFromScript(v.spoken_script, v.cta);
  scenes = scenes.slice(0, 7).map((sc, k, all) => {
    const headline = str(sc.headline, 40);
    const words = headline.split(' ');
    const hl = words.find((w) => w.toLowerCase().replace(/[^a-z0-9%+$]/g, '') === String(sc.highlight || '').toLowerCase().replace(/[^a-z0-9%+$]/g, '')) || '';
    return {
      kind: KINDS.includes(sc.kind) ? sc.kind : k === 0 ? 'hook' : k === all.length - 1 ? 'cta' : 'point',
      vo: str(sc.vo, 220), headline, highlight: hl, sub: str(sc.sub, 60), icon: ICONS.includes(sc.icon) ? sc.icon : 'star',
    };
  }).filter((sc) => sc.vo);
  if (scenes.length < 2) throw new Error('Video ' + (i + 1) + ' has no usable storyboard');
  const spoken = scenes.map((sc) => sc.vo).join(' '); // the voiceover is exactly the scene lines
  return { ...v, id: v.id || i + 1, scenes, spoken_script: spoken, captions: scenes.map((sc) => sc.headline) };
});
return [{ json: { ...ctx, videos } }];`,
});

codeNode('Render Videos', BASE + `
const ctx = $input.first().json;
const skip = ctx.dry_run || !cfg.heygen_key || !cfg.heygen_avatar_id || !cfg.heygen_voice_id;
const reason = ctx.dry_run ? 'storyboard ready (dry run)' : 'storyboard ready (render on your computer with video/render.mjs, or set heygen_* in Config for an avatar video)';
const limit = Math.min(parseInt(input.max_videos !== undefined && input.max_videos !== '' ? input.max_videos : cfg.max_videos, 10) || 0, ctx.videos.length);
const H = { 'X-Api-Key': cfg.heygen_key, 'content-type': 'application/json' };

const submit = async (v) => {
  if (skip) return { ...v, video_id: null, video_url: null, video_status: reason };
  try {
    const r = await this.helpers.httpRequest({
      method: 'POST', url: 'https://api.heygen.com/v2/video/generate', headers: H, json: true,
      body: {
        caption: false, dimension: { width: 720, height: 1280 },
        video_inputs: [{
          character: { type: 'avatar', avatar_id: cfg.heygen_avatar_id, avatar_style: 'normal' },
          voice: { type: 'text', input_text: v.spoken_script, voice_id: cfg.heygen_voice_id },
          background: { type: 'color', value: '#F5F5F5' },
        }],
      },
    });
    const id = r && r.data && r.data.video_id;
    if (!id) throw new Error('no video_id in response');
    return { ...v, video_id: id, video_url: null, video_status: 'processing' };
  } catch (e) {
    return { ...v, video_id: null, video_url: null, video_status: 'failed: ' + String(e.message || e).slice(0, 200) };
  }
};

const vids = [];
for (const v of ctx.videos.slice(0, limit)) vids.push(await submit(v));
vids.push(...ctx.videos.slice(limit).map((v) => ({ ...v, video_id: null, video_url: null, video_status: skip ? reason : 'skipped (max_videos)' })));

const deadline = Date.now() + 20 * 60 * 1000;
while (vids.some((v) => v.video_status === 'processing') && Date.now() < deadline) {
  await sleep(20000);
  for (const v of vids.filter((x) => x.video_status === 'processing')) {
    try {
      const r = await this.helpers.httpRequest({ method: 'GET', url: 'https://api.heygen.com/v1/video_status.get?video_id=' + v.video_id, headers: H, json: true });
      const d = (r && r.data) || {};
      if (d.status === 'completed') { v.video_url = d.video_url; v.video_status = 'ok'; }
      else if (d.status === 'failed') { v.video_status = 'failed: ' + JSON.stringify(d.error || '').slice(0, 200); }
    } catch (e) { /* keep polling */ }
  }
}
for (const v of vids) if (v.video_status === 'processing') v.video_status = 'timed out (still rendering: check HeyGen, id ' + v.video_id + ')';
return [{ json: { ...ctx, videos: vids } }];
`);

// ---------- Package ----------
codeNode('Package and Deliver', BASE + `
const ctx = $input.first().json;
const b = ctx.brief, c = ctx.competitors;
const L = [];
L.push('# Ad Pack: ' + b.business_name, '', 'Source: ' + ctx.url, 'Generated: ' + new Date().toISOString(), '');
L.push('## Brand brief', '', '- **What they do:** ' + b.one_liner, '- **Offer:** ' + (b.offer || 'n/a'), '- **Audience:** ' + (b.audience || []).join('; '), '- **Proof used:** ' + (b.proof || []).join('; '), '');
if ((b.claims_to_verify || []).length) L.push('**Verify with client before running:**', ...b.claims_to_verify.map((x) => '- ' + x), '');
L.push('## Competitor analysis (' + c.source + ')', '', '> ' + (c.caveat || ''), '');
L.push('**White space:** ' + (c.white_space || []).join('; '), '', '**Saturated:** ' + (c.saturated || []).join('; '), '');
L.push('## 10 hooks', '', ...ctx.hooks.map((h) => h.id + '. [' + h.angle + '] ' + h.hook), '');
L.push('## 20 static ads', '');
for (const s of ctx.statics) {
  L.push('### Static ' + s.id + ' (' + s.aspect + ', ' + s.style + ')', '- Image: ' + (s.image_url || s.image_status), '- Overlay: ' + s.overlay_text, '- Headline: ' + s.headline, '- Primary text: ' + String(s.primary_text).replace(/\\n/g, ' / '), '- CTA: ' + s.cta, '');
}
L.push('## 5 video ads', '');
for (const v of ctx.videos) {
  L.push('### Video ' + v.id + ': ' + v.title + ' (' + v.format + ')', '- File: ' + (v.video_url || v.video_status), '- Script: ' + v.spoken_script, '- Captions: ' + (v.captions || []).join(' | '), '- CTA: ' + v.cta, '');
}
const pack = {
  business: b.business_name, url: ctx.url, brief: b, competitors: c, hooks: ctx.hooks,
  statics: ctx.statics, videos: ctx.videos, report_markdown: L.join('\\n'),
  stats: {
    statics_total: ctx.statics.length, statics_rendered: ctx.statics.filter((s) => s.image_url).length,
    videos_total: ctx.videos.length, videos_rendered: ctx.videos.filter((v) => v.video_url).length,
    started_at: ctx.started_at, finished_at: new Date().toISOString(), dry_run: ctx.dry_run,
  },
};
return [{ json: pack }];
`);

// ---------- Hand-off: save the report to Drive, then final output ----------
const makeReport = place({
  name: 'Make Report File', type: 'n8n-nodes-base.code', typeVersion: 2,
  parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: `
const slug = String($json.business || 'business').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'business';
const file_name = slug + '_ad-pack_' + new Date().toISOString().slice(0, 10) + '.md';
const bin = await this.helpers.prepareBinaryData(Buffer.from($json.report_markdown, 'utf8'), file_name, 'text/markdown');
return { json: { file_name }, binary: { data: bin } };
` },
});
links.push([prev, makeReport, 0]);
const uploadReport = place({
  name: 'Upload Report', type: 'n8n-nodes-base.googleDrive', typeVersion: 3, onError: 'continueRegularOutput',
  credentials: { googleDriveOAuth2Api: CRED.googleDriveOAuth2Api },
  parameters: {
    resource: 'file', operation: 'upload', inputDataFieldName: 'data', name: '={{ $json.file_name }}',
    driveId: { __rl: true, mode: 'list', value: 'My Drive' },
    folderId: { __rl: true, mode: 'id', value: "={{ ($('Attach Drive Folders').first().json.drive || {}).run_id || $('Config').first().json.drive_folder_id }}" },
    options: {},
  },
});
links.push([makeReport, uploadReport, 0]);
const finalName = place({
  name: 'Final Output', type: 'n8n-nodes-base.code', typeVersion: 2,
  parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: BASE + `
const pack = { ...$('Package and Deliver').first().json };
const up = $input.first().json || {};
pack.report_drive_url = up.id ? 'https://drive.google.com/file/d/' + up.id + '/view' : null;
pack.report_drive_status = up.id ? 'ok' : 'failed (see execution for the Drive error)';
const dr = $('Attach Drive Folders').first().json.drive || {};
pack.drive_folder_id = dr.run_id || null; // the run's folder: the app deletes it when the run is removed
pack.drive_folder_url = dr.run_url || null;
if (dr.error) pack.drive_folder_error = dr.error;
let callback = 'none';
if (input.callback_url) {
  try { await this.helpers.httpRequest({ method: 'POST', url: input.callback_url, body: pack, json: true }); callback = 'sent'; }
  catch (e) { callback = 'failed: ' + String(e.message || e).slice(0, 150); }
}
pack.callback = callback;
return [{ json: pack }];
` },
});
links.push([uploadReport, finalName, 0]);

// ---------- connections ----------
const connections = {};
for (const [from, to, out] of links) {
  connections[from] = connections[from] || { main: [] };
  while (connections[from].main.length <= out) connections[from].main.push([]);
  connections[from].main[out].push({ node: to, type: 'main', index: 0 });
}
// The IF's "false" output (index 1) feeds Collect Images directly:
connections['Any Images To Render'].main = [
  [{ node: 'Split Statics', type: 'main', index: 0 }],
  [{ node: 'Collect Images', type: 'main', index: 0 }],
];

const workflow = {
  name: 'AI Creative Engine: URL to Ad Pack',
  nodes, connections, settings: { executionOrder: 'v1', saveExecutionProgress: true, saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all' },
};
const outPath = path.join(root, 'workflow', 'creative-engine.n8n.json');
fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2));

let bad = 0;
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
for (const n of nodes.filter((n) => n.type === 'n8n-nodes-base.code')) {
  try { new AsyncFn('$', '$input', '$json', '$itemIndex', n.parameters.jsCode); }
  catch (e) { bad++; console.error('SYNTAX ERROR in "' + n.name + '":', e.message); }
}
console.log('Wrote', outPath, '(' + nodes.length + ' nodes), webhook path:', webhookPath);
if (bad) process.exit(1);
