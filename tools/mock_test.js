// Offline test: walks the real node graph in workflow/creative-engine.n8n.json with mocked services.
// Usage: node tools/mock_test.js
const path = require('path');
const wf = require(path.join(__dirname, '..', 'workflow', 'creative-engine.n8n.json'));
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));

const hooks = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, angle: 'a' + i, hook: 'hook ' + i }));
const statics = Array.from({ length: 20 }, (_, i) => ({ aspect: i % 2 ? '9:16' : '1:1', style: 's', overlay_text: 'o', headline: 'h', primary_text: 'p\nq', cta: 'Learn More', image_prompt: 'img' }));
const videos = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, title: 't', format: 'f', spoken_script: 'words', captions: ['c'], cta: 'x' }));

let briefUserMsg = '';
function claudeMock(req) {
  const s = req.system;
  if (s.includes('Extract a brand brief')) briefUserMsg = req.messages[0].content;
  let j;
  if (s.includes('Extract a brand brief')) j = { business_name: 'Test Co', one_liner: 'x', offer: 'free', audience: ['a'], proof: ['p'], claims_to_verify: ['c'], competitor_search_keywords: ['k'] };
  else if (s.includes('analysing competitor ads')) j = { source: 'inferred', caveat: 'c', white_space: ['w'], saturated: ['s'] };
  else if (s.includes('EXACTLY 20')) j = { statics };
  else if (s.includes('EXACTLY 5')) j = { videos };
  else j = { hooks };
  return { stop_reason: 'end_turn', content: [{ text: 'Here you go:\n' + JSON.stringify(j) }] };
}

async function run(body, maxImages, failImageIds = []) {
  const outputs = {}; // node name -> array of items (all outputs merged per run)
  const config = {};
  for (const a of byName['Config'].parameters.assignments.assignments) config[a.name] = a.value;
  config.max_images = String(maxImages);
  const log = [];
  const mockHttp = async (o) => {
    if (o.url.startsWith('https://r.jina.ai')) return 'site text '.repeat(100);
    if (o.url === 'https://example.com') return '<html><title>Test Co | Home</title><meta property="og:image" content="/share.png"><img class="site-logo" src="/logo.svg"><style>a{color:#1a73e8} b{color:#1a73e8} i{color:#1A73E8} u{color:#ff6600} p{color:#333333} q{color:#ffffff}</style></html>';
    throw new Error('unmocked ' + o.url);
  };

  const exec = async (name, inputItems) => {
    const node = byName[name];
    let outs; // array of arrays (per output)
    const ref = (n) => ({
      first: () => (n === 'Config' ? { json: config } : n === 'Webhook' ? { json: { body } } : (outputs[n] || [])[0]),
      all: () => outputs[n] || [],
      item: undefined,
    });
    switch (node.type) {
      case 'n8n-nodes-base.webhook': outs = [[{ json: { body } }]]; break;
      case 'n8n-nodes-base.set': outs = [inputItems.map((i) => ({ json: { ...i.json, ...config } }))]; break;
      case 'n8n-nodes-base.code': {
        const fn = new AsyncFn('$', '$input', '$json', '$itemIndex', node.parameters.jsCode);
        const self = { helpers: { httpRequest: mockHttp, prepareBinaryData: async (buf, fileName, mime) => ({ fileName, mimeType: mime, size: buf.length }) } };
        if (node.parameters.mode === 'runOnceForEachItem') {
          const res = [];
          for (let i = 0; i < inputItems.length; i++) {
            const $ = (n) => ({ ...ref(n), item: (outputs[n] || [])[i] });
            res.push(await fn.call(self, $, { first: () => inputItems[i], all: () => inputItems }, inputItems[i].json, i));
          }
          outs = [res];
        } else {
          const $ = (n) => ref(n);
          outs = [await fn.call(self, $, { first: () => inputItems[0], all: () => inputItems }, undefined, 0)];
        }
        break;
      }
      case 'n8n-nodes-base.if': {
        const t = [], f = [];
        for (const i of inputItems) (i.json.render_count > 0 ? t : f).push(i);
        outs = [t, f];
        break;
      }
      case 'n8n-nodes-base.httpRequest': {
        if (node.parameters.url.includes('anthropic')) {
          if (node.parameters.nodeCredentialType !== 'anthropicApi') throw new Error('Claude node missing credential type');
          outs = [inputItems.map((i) => ({ json: claudeMock(JSON.parse(JSON.stringify(i.json._req))) }))];
        } else if (node.parameters.url.includes('openai')) {
          if (node.parameters.nodeCredentialType !== 'openAiApi') throw new Error('OpenAI node missing credential type');
          outs = [inputItems.map((i) => (failImageIds.includes(i.json.static.id)
            ? { json: { error: { message: 'content policy' } } }
            : { json: { data: [{ b64_json: Buffer.from('png').toString('base64') }] } }))];
        } else throw new Error('unmocked http ' + node.parameters.url);
        break;
      }
      case 'n8n-nodes-base.googleDrive': {
        outs = [inputItems.map((i, k) => (i.binary ? { json: { id: 'drv' + k + i.json.file_name, name: i.json.file_name } } : { json: { error: 'no binary' } }))];
        break;
      }
      default: throw new Error('unsupported node type ' + node.type);
    }
    outputs[name] = outs.flat();
    log.push(name + ' (' + outputs[name].length + ')');
    const conn = wf.connections[name];
    if (!conn) return;
    for (let o = 0; o < conn.main.length; o++) {
      for (const c of conn.main[o]) {
        if (outs[o] && outs[o].length) await exec(c.node, outs[o]);
      }
    }
  };
  await exec('Webhook', []);
  return { final: outputs['Final Output'] && outputs['Final Output'][0].json, log };
}

(async () => {
  let ok = true;
  const check = (label, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + label); if (!cond) ok = false; };

  const dry = await run({ url: 'https://example.com', dry_run: true }, 20);
  check('dry run reaches Final Output', !!dry.final);
  check('brand signals: top colour #1a73e8 and #ff6600, greys/white excluded', briefUserMsg.includes('#1a73e8') && briefUserMsg.includes('#ff6600') && !briefUserMsg.includes('#333333') && !briefUserMsg.includes('#ffffff'));
  check('brand signals: logo and og:image resolved to absolute URLs', briefUserMsg.includes('https://example.com/logo.svg') && briefUserMsg.includes('https://example.com/share.png'));
  check('report saved to Drive', String(dry.final.report_drive_url || '').startsWith('https://drive.google.com/file/d/'));
  check('dry run: no render nodes ran', !dry.log.some((l) => l.startsWith('OpenAI') || l.startsWith('Upload To Drive')));
  check('dry run: 10 hooks / 20 statics / 5 videos', dry.final.hooks.length === 10 && dry.final.statics.length === 20 && dry.final.videos.length === 5);
  check('dry run: statics marked skipped', dry.final.statics.every((s) => /dry_run/.test(s.image_status)));

  const real = await run({ url: 'https://example.com', dry_run: false }, 5, [3]);
  check('render run reaches Final Output', !!real.final);
  check('render run: 4 of 5 rendered (one forced failure)', real.final.stats.statics_rendered === 4);
  check('render run: failed one is flagged', /failed/.test(real.final.statics[2].image_status));
  check('render run: beyond max_images marked skipped', /max_images/.test(real.final.statics[10].image_status));
  check('render run: Drive link format', /^https:\/\/drive\.google\.com\/file\/d\//.test(real.final.statics[0].image_url));
  check('report has business name', real.final.report_markdown.includes('# Ad Pack: Test Co'));
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
