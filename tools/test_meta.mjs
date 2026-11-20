// Offline test of "connect Facebook and post an ad": secrets, the Graph API client and the real server routes, against a
// stand-in for Meta's Graph API and for the n8n picture-link service. Nothing here talks to Meta.   Run: node tools/test_meta.mjs
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createSecrets } from '../app/server/secrets.js';
import { createMeta, captionFor, withUtm } from '../app/server/meta.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = true;
const check = (label, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + label + (cond ? '' : '  -> ' + String(extra).slice(0, 260))); if (!cond) ok = false; };

// ---------- stand-in Graph API ----------
const calls = []; // { method, path, params }
const graph = http.createServer((req, res) => {
  const chunks = []; req.on('data', (d) => chunks.push(d));
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    const params = Object.fromEntries(req.method === 'GET' ? u.searchParams : new URLSearchParams(Buffer.concat(chunks).toString()));
    const p = u.pathname.replace(/^\/v21\.0/, '');
    calls.push({ method: req.method, path: p, params });
    const send = (code, o) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (p === '/oauth/access_token') return params.grant_type === 'fb_exchange_token' ? send(200, { access_token: 'LONG_USER_TOKEN', expires_in: 5184000 }) : params.code === 'GOODCODE' ? send(200, { access_token: 'SHORT_TOKEN' }) : send(400, { error: { message: 'Invalid verification code', code: 100 } });
    if (p === '/me') return send(200, { id: '111', name: 'Ann Tester' });
    if (p === '/me/accounts') return send(200, { data: [{ id: 'P1', name: 'Acme Page', access_token: 'PAGE_TOKEN_1', instagram_business_account: { id: 'IG1', username: 'acme_ig' } }, { id: 'P2', name: 'No IG Page', access_token: 'PAGE_TOKEN_2' }] });
    if (p === '/me/adaccounts') return send(200, { data: [{ id: 'act_999', account_id: '999', name: 'Acme Ads', currency: 'CAD', account_status: 1 }] });
    if (p === '/P1/photos') return params.url ? send(200, { id: 'PHOTO1', post_id: 'P1_POST1' }) : send(400, { error: { message: 'url missing' } });
    if (p === '/IG1/media') return send(200, { id: 'CONTAINER1' });
    if (p === '/CONTAINER1') return send(200, { status_code: 'FINISHED' });
    if (p === '/IG1/media_publish') return send(200, { id: 'IGPOST1' });
    if (p === '/act_999/campaigns') return send(200, { id: 'CAMP1' });
    if (p === '/act_999/adsets') return send(200, { id: 'ADSET1' });
    if (p === '/act_999/adcreatives') return send(200, { id: 'CREA' + calls.length });
    if (p === '/act_999/ads') return send(200, { id: 'AD' + calls.length });
    send(404, { error: { message: 'unmocked ' + p } });
  });
});
await new Promise((r) => graph.listen(0, '127.0.0.1', r));
const GRAPH = 'http://127.0.0.1:' + graph.address().port;

// ---------- stand-in n8n picture-link service ----------
const previewCalls = [];
const prev = http.createServer((req, res) => {
  const c = []; req.on('data', (d) => c.push(d));
  req.on('end', () => { previewCalls.push(JSON.parse(Buffer.concat(c).toString() || '{}')); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, ready: true, url: 'https://lh3.example/FULLIMAGE=s0' })); });
});
await new Promise((r) => prev.listen(0, '127.0.0.1', r));
const PREVIEW = 'http://127.0.0.1:' + prev.address().port + '/webhook/preview';

// ---------- secrets ----------
const key = Buffer.alloc(32, 7).toString('base64');
const sec = createSecrets(key);
const enc = sec.encrypt({ userToken: 'abc', pages: [1] });
check('secrets: encrypted text hides the token and decrypts back', !enc.includes('abc') && sec.decrypt(enc).userToken === 'abc');
check('secrets: tampered ciphertext is rejected', (() => { try { const b = Buffer.from(enc, 'base64'); b[b.length - 1] ^= 1; sec.decrypt(b.toString('base64')); return false; } catch { return true; } })());
check('secrets: a different key cannot read it', (() => { try { createSecrets(Buffer.alloc(32, 9).toString('base64')).decrypt(enc); return false; } catch { return true; } })());
const st = sec.sign({ u: 'user1' });
check('secrets: signed state verifies, and fails when changed or expired', sec.verify(st).u === 'user1' && sec.verify(st + 'x') === null && sec.verify(sec.sign({ u: 'a' }, -5)) === null && sec.verify('garbage') === null);
check('secrets: without a key nothing is stored', createSecrets('').configured === false && (() => { try { createSecrets('').encrypt({}); return false; } catch { return true; } })());

// ---------- Graph client ----------
const meta = createMeta({ appId: 'APPID', appSecret: 'APPSECRET', graphBase: GRAPH, dialogBase: 'https://fb.example' });
const url = new URL(meta.authUrl('STATE1', 'https://app.example/api/meta/callback'));
check('client: the login link asks for the right permissions and carries the state', url.searchParams.get('client_id') === 'APPID' && url.searchParams.get('state') === 'STATE1' && url.searchParams.get('scope').includes('pages_manage_posts') && url.searchParams.get('scope').includes('ads_management') && url.searchParams.get('scope').includes('instagram_content_publish') && url.searchParams.get('redirect_uri') === 'https://app.example/api/meta/callback');
const ex = await meta.exchange('GOODCODE', 'https://app.example/api/meta/callback');
check('client: a login code becomes a long-lived token with an expiry', ex.token === 'LONG_USER_TOKEN' && !!ex.expiresAt && calls.some((c) => c.params.grant_type === 'fb_exchange_token' && c.params.client_secret === 'APPSECRET'));
let bad = null; try { await meta.exchange('BADCODE', 'x'); } catch (e) { bad = e; }
check('client: a Meta error is shown in plain words', !!bad && /Invalid verification code/.test(bad.message) && bad.status === 400, bad && bad.message);
const as = await meta.assets('LONG_USER_TOKEN');
check('client: pages (with page tokens and Instagram) and ad accounts are listed', as.me.name === 'Ann Tester' && as.pages.length === 2 && as.pages[0].token === 'PAGE_TOKEN_1' && as.pages[0].ig.username === 'acme_ig' && as.pages[1].ig === null && as.adAccounts[0].id === '999' && as.adAccounts[0].active === true);
check('client: captions carry the text, link and hashtags; UTM tags are added', captionFor({ primary_text: 'Hello', hashtags: ['#A', '#B'] }, { link: 'https://x.test', withLink: true }) === 'Hello\n\nhttps://x.test\n\n#A #B' && captionFor({ primary_text: 'x'.repeat(3000) }).length === 2200 && /utm_source=meta/.test(withUtm('https://x.test/p', { campaign: 'c', content: 'ad-1' })));

// ---------- the real server, local single-user mode ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-test-'));
const job = { id: 'metajob00001', url: 'https://acme.example', businessName: 'Acme', createdAt: '2026-11-20T10:00:00Z', status: 'success', options: {}, userId: null, result: {
  brief: { business_name: 'Acme Co' }, hooks: [], videos: [],
  statics: [
    { id: 1, aspect: '1:1', headline: 'Fast Fix', description: 'Same day', cta: 'Book Now', primary_text: 'We fix it fast.', hashtags: ['#Fix', '#Fast'], image_url: 'https://drive.google.com/file/d/FILE1/view' },
    { id: 2, aspect: '9:16', headline: 'Tall', cta: 'Learn More', primary_text: 'Tall one', hashtags: [], image_url: 'https://drive.google.com/file/d/FILE2/view' },
    { id: 3, aspect: '1:1', headline: 'No image', cta: 'Learn More', primary_text: 'x', image_url: null },
  ] } };
fs.writeFileSync(path.join(tmp, 'jobs.json'), JSON.stringify([job]));
const PORT = 8802;
const srv = spawn(process.execPath, ['app/server/index.js'], { cwd: root, env: { ...process.env, ACE_IGNORE_DOTENV: '1', PORT: String(PORT), DATA_DIR: tmp, AUTH_REQUIRED: 'false', N8N_API: 'x', TOKEN_ENC_KEY: key, META_APP_ID: 'APPID', META_APP_SECRET: 'APPSECRET', META_GRAPH_URL: GRAPH, META_DIALOG_URL: 'https://fb.example', PUBLIC_URL: 'http://localhost:' + PORT, N8N_PREVIEW_WEBHOOK_URL: PREVIEW, GH_DISPATCH_TOKEN: '' } });
let log = ''; srv.stdout.on('data', (x) => (log += x)); srv.stderr.on('data', (x) => (log += x));
for (let i = 0; i < 50 && !log.includes('API on'); i++) await new Promise((r) => setTimeout(r, 200));
const B = 'http://127.0.0.1:' + PORT;
const api = async (method, p, body) => { const x = await fetch(B + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' }); let j = null; try { j = await x.json(); } catch { /* none */ } return { status: x.status, json: j, loc: x.headers.get('location') }; };
const J = '/api/jobs/metajob00001';

let x = await api('GET', '/api/meta/status');
check('route: before connecting, status says configured and not connected', x.json.configured === true && x.json.connected === false, JSON.stringify(x));
x = await api('POST', J + '/post/facebook', { adId: 1, pageId: 'P1', confirm: 'create' });
check('route: posting without a connected account is refused', x.status === 409 && /Connect your Facebook/.test(x.json.error), JSON.stringify(x));

x = await api('POST', '/api/meta/connect', { origin: 'http://localhost:' + PORT });
const login = new URL(x.json.url);
check('route: connect returns a Facebook login link with a signed state', x.status === 200 && login.hostname === 'fb.example' && !!login.searchParams.get('state') && login.searchParams.get('redirect_uri') === 'http://localhost:' + PORT + '/api/meta/callback', JSON.stringify(x));
const state = login.searchParams.get('state');
x = await api('GET', '/api/meta/callback?code=GOODCODE&state=' + encodeURIComponent(state));
check('route: Facebook sends the person back, the account is stored, and they land on the app', x.status === 302 && /meta=connected/.test(x.loc) && x.loc.startsWith('http://localhost:' + PORT), JSON.stringify(x));
x = await api('GET', '/api/meta/callback?code=GOODCODE&state=forged.state');
check('route: a forged or expired state is refused', x.status === 400);
x = await api('GET', '/api/meta/callback?error=access_denied&error_description=No&state=' + encodeURIComponent(state));
check('route: cancelling at Facebook returns to the app with a message', x.status === 302 && /meta=error/.test(x.loc));

x = await api('GET', '/api/meta/status');
check('route: connected status lists pages and ad accounts but never a token', x.json.connected === true && x.json.name === 'Ann Tester' && x.json.pages.length === 2 && x.json.adAccounts[0].name === 'Acme Ads' && !/TOKEN/.test(JSON.stringify(x.json)), JSON.stringify(x.json).slice(0, 300));
check('route: the stored account is encrypted on disk-side (no plain token in the process output)', !/LONG_USER_TOKEN|PAGE_TOKEN/.test(log));

// Facebook Page
const nCalls = () => calls.length;
let before = nCalls();
x = await api('POST', J + '/post/facebook', { adId: 1, pageId: 'P1', mode: 'draft' });
check('facebook: nothing is posted without confirmation', x.status === 400 && nCalls() === before, JSON.stringify(x));
x = await api('POST', J + '/post/facebook', { adId: 1, pageId: 'P1', mode: 'now', confirm: 'create' });
check('facebook: publishing now needs the stronger "publish" confirmation', x.status === 400 && nCalls() === before, JSON.stringify(x));
x = await api('POST', J + '/post/facebook', { adId: 1, pageId: 'P1', mode: 'draft', confirm: 'create' });
let fb = calls.find((c) => c.path === '/P1/photos');
check('facebook: a draft is an UNPUBLISHED photo post using the Page token, the full-size picture, the text, hashtags and a tracked link', x.status === 200 && x.json.status === 'draft' && fb.params.published === 'false' && fb.params.access_token === 'PAGE_TOKEN_1' && fb.params.url === 'https://lh3.example/FULLIMAGE=s0' && /We fix it fast/.test(fb.params.caption) && /#Fix #Fast/.test(fb.params.caption) && /utm_source=facebook/.test(fb.params.caption) && previewCalls[0].size === 'full', JSON.stringify([x.json, fb]));
x = await api('POST', J + '/post/facebook', { adId: 1, pageId: 'P1', mode: 'draft', confirm: 'create' });
check('facebook: posting the same ad the same way twice is refused unless asked again', x.status === 409 && x.json.code === 'already');
x = await api('POST', J + '/post/facebook', { adId: 1, pageId: 'P1', mode: 'draft', confirm: 'create', again: true });
check('facebook: "post again" is allowed on request', x.status === 200);
x = await api('POST', J + '/post/facebook', { adId: 2, pageId: 'P1', mode: 'schedule', scheduleAt: new Date(Date.now() + 2 * 3600e3).toISOString(), confirm: 'create' });
fb = calls.filter((c) => c.path === '/P1/photos').pop();
check('facebook: a scheduled post is unpublished with a publish time', x.status === 200 && x.json.status === 'scheduled' && fb.params.published === 'false' && Number(fb.params.scheduled_publish_time) > Date.now() / 1000, JSON.stringify(x));
x = await api('POST', J + '/post/facebook', { adId: 2, pageId: 'P1', mode: 'schedule', scheduleAt: new Date(Date.now() + 60e3).toISOString(), confirm: 'create', again: true });
check('facebook: a time that is too soon is refused', x.status === 400 && /10 minutes/.test(x.json.error), JSON.stringify(x));
x = await api('POST', J + '/post/facebook', { adId: 3, pageId: 'P1', mode: 'draft', confirm: 'create' });
check('facebook: an ad with no image yet is refused', x.status === 409 && /image first/.test(x.json.error));
x = await api('POST', J + '/post/facebook', { adId: 1, pageId: 'NOTMINE', mode: 'draft', confirm: 'create' });
check('facebook: a Page that is not on this account is refused', x.status === 400);
x = await api('POST', J + '/post/facebook', { adId: 1, pageId: 'P1', mode: 'now', confirm: 'publish', again: true });
fb = calls.filter((c) => c.path === '/P1/photos').pop();
check('facebook: publish now sets published=true only with the strong confirmation', x.status === 200 && x.json.status === 'published' && fb.params.published === 'true');

// Instagram
before = nCalls();
x = await api('POST', J + '/post/instagram', { adId: 1, pageId: 'P1' });
check('instagram: nothing is posted without confirmation', x.status === 400 && nCalls() === before);
x = await api('POST', J + '/post/instagram', { adId: 1, pageId: 'P2', confirm: 'publish' });
check('instagram: a Page without a linked Instagram account is refused', x.status === 409 && /no Instagram/.test(x.json.error));
x = await api('POST', J + '/post/instagram', { adId: 1, pageId: 'P1', confirm: 'publish' });
const ig = calls.find((c) => c.path === '/IG1/media');
check('instagram: a container is made with the picture and caption, then published, using the Page token', x.status === 200 && x.json.status === 'published' && ig.params.image_url === 'https://lh3.example/FULLIMAGE=s0' && /#Fix/.test(ig.params.caption) && !/utm_/.test(ig.params.caption) && ig.params.access_token === 'PAGE_TOKEN_1' && calls.some((c) => c.path === '/IG1/media_publish' && c.params.creation_id === 'CONTAINER1'), JSON.stringify(x));
x = await api('POST', J + '/post/instagram', { adId: 2, pageId: 'P1', confirm: 'publish', asStory: true });
const igs = calls.filter((c) => c.path === '/IG1/media').pop();
check('instagram: a tall ad can be posted as a Story', x.status === 200 && igs.params.media_type === 'STORIES' && !igs.params.caption);

// Paid ads, paused
before = nCalls();
x = await api('POST', J + '/post/ads/setup', { adAccountId: '999', dailyBudget: 10 });
check('ads: nothing is created without confirmation', x.status === 400 && nCalls() === before);
x = await api('POST', J + '/post/ads/setup', { adAccountId: '999', dailyBudget: 99999, confirm: 'create' });
check('ads: the daily budget is limited to a sane range', x.status === 400 && /budget/.test(x.json.error));
x = await api('POST', J + '/post/ads/setup', { adAccountId: '123', dailyBudget: 10, confirm: 'create' });
check('ads: an ad account that is not on this account is refused', x.status === 400);
x = await api('POST', J + '/post/ads/setup', { adAccountId: '999', dailyBudget: 12.5, countries: ['ca', 'us', 'XX1'], ageMin: 25, ageMax: 60, confirm: 'create' });
const camp = calls.find((c) => c.path === '/act_999/campaigns'); const adset = calls.find((c) => c.path === '/act_999/adsets');
check('ads: the campaign and ad set are created PAUSED with the budget in cents and the chosen audience, using the user token', x.status === 200 && x.json.campaignId === 'CAMP1' && x.json.adSetId === 'ADSET1' && camp.params.status === 'PAUSED' && adset.params.status === 'PAUSED' && adset.params.daily_budget === '1250' && JSON.parse(adset.params.targeting).geo_locations.countries.join() === 'CA,US' && JSON.parse(adset.params.targeting).age_min === 25 && camp.params.access_token === 'LONG_USER_TOKEN' && /Acme Co/.test(camp.params.name), JSON.stringify([x.json, camp.params, adset.params]));
x = await api('POST', J + '/post/ads/ad', { adAccountId: '999', pageId: 'P1', adSetId: 'ADSET1', adId: 1, confirm: 'create' });
check('ads: an ad set id that is not numeric is refused', x.status === 400);
x = await api('POST', J + '/post/ads/ad', { adAccountId: '999', pageId: 'P1', adSetId: '555', adId: 1, confirm: 'create' });
const cr = calls.find((c) => c.path === '/act_999/adcreatives'); const ad = calls.find((c) => c.path === '/act_999/ads');
const spec = JSON.parse(cr.params.object_story_spec).link_data;
check('ads: each ad gets a creative (page, text, headline, button, tracked link, picture) and is created PAUSED', x.status === 200 && x.json.status === 'PAUSED' && JSON.parse(cr.params.object_story_spec).page_id === 'P1' && spec.name === 'Fast Fix' && spec.picture === 'https://lh3.example/FULLIMAGE=s0' && spec.call_to_action.type === 'LEARN_MORE' && /utm_source=meta/.test(spec.link) && /ad-1/.test(spec.link) && ad.params.status === 'PAUSED' && ad.params.adset_id === '555', JSON.stringify([x.json, spec, ad.params]));
x = await api('POST', J + '/post/ads/ad', { adAccountId: '999', pageId: 'P1', adSetId: '555', adId: 1, confirm: 'create' });
check('ads: the same ad twice is refused unless asked again', x.status === 409 && x.json.code === 'already');

check('record: every successful post is remembered on the run for the badges', (() => { const r = JSON.parse(fs.readFileSync(path.join(tmp, 'jobs.json'), 'utf8'))[0].result.posts; return r['1'].some((p) => p.dest === 'facebook-draft') && r['1'].some((p) => p.dest === 'instagram-post') && r['1'].some((p) => p.dest === 'meta-ad-paused') && r['2'].some((p) => p.dest === 'instagram-story'); })());

x = await api('POST', '/api/meta/disconnect');
x = await api('GET', '/api/meta/status');
check('route: disconnecting forgets the account', x.json.connected === false);
x = await api('POST', J + '/post/facebook', { adId: 1, pageId: 'P1', mode: 'draft', confirm: 'create' });
check('route: after disconnecting, posting is refused again', x.status === 409);

srv.kill(); graph.close(); prev.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);
