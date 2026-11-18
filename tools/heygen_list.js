// Lists your HeyGen avatars and voices so you can pick the IDs for .env.
// Needs HEYGEN_API_KEY in .env.  Usage: node tools/heygen_list.js [language-filter e.g. English]
const fs = require('fs'), path = require('path');
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
if (!env.HEYGEN_API_KEY) { console.error('Add HEYGEN_API_KEY=... to .env first.'); process.exit(1); }
const H = { 'X-Api-Key': env.HEYGEN_API_KEY, accept: 'application/json' };
const lang = (process.argv[2] || '').toLowerCase();
(async () => {
  const get = async (p) => { const r = await fetch('https://api.heygen.com' + p, { headers: H }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(p + ' -> HTTP ' + r.status + ' ' + JSON.stringify(j).slice(0, 200)); return j; };
  const av = await get('/v2/avatars');
  const avatars = (av.data && av.data.avatars) || [];
  console.log('AVATARS (' + avatars.length + ') - pick one for HEYGEN_AVATAR_ID');
  avatars.slice(0, 40).forEach((a) => console.log('  ' + a.avatar_id + '  |  ' + a.avatar_name + '  |  ' + (a.gender || '')));
  const vo = await get('/v2/voices');
  let voices = (vo.data && vo.data.voices) || [];
  if (lang) voices = voices.filter((v) => String(v.language || '').toLowerCase().includes(lang));
  console.log('\nVOICES (' + voices.length + (lang ? ', filtered by "' + lang + '"' : '') + ') - pick one for HEYGEN_VOICE_ID');
  voices.slice(0, 40).forEach((v) => console.log('  ' + v.voice_id + '  |  ' + v.name + '  |  ' + (v.language || '') + '  |  ' + (v.gender || '')));
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
