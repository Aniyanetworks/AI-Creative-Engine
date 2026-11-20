const fs = require('fs'); let p = 'app/server/index.js', s = fs.readFileSync(p, 'utf8');
const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('nf ' + a.slice(0, 70)); s = s.replace(a, () => b); };
rep("async function postCtx(req, res, { needPage = true } = {}) {", "async function postCtx(req, res, { needPage = true, needAd = true } = {}) {");
rep("  if (!s || !s.image_url) { res.status(409).json({ error: 'Make this ad\'s image first.' }); return null; }", "  if (needAd && (!s || !s.image_url)) { res.status(409).json({ error: 'Make this ad\'s image first.' }); return null; }");
rep("const c = await postCtx(req, res, { needPage: false }); if (!c) return;", "const c = await postCtx(req, res, { needPage: false, needAd: false }); if (!c) return;");
fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
