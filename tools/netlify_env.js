// Prints, or copies to the clipboard, the private n8n webhook URLs the deployed (Netlify) app needs, as KEY=value lines.
// Paste them into Netlify > Site configuration > Environment variables > Add a variable > "Import from a .env file",
// and tick "Contains secret values". The values are secrets: do not paste them anywhere else.
//
//   node tools/netlify_env.js           copies the lines to your clipboard (Windows) and prints only the names
//   node tools/netlify_env.js --show    prints the full lines instead
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const root = path.join(__dirname, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const base = (env.N8N_BASE_URL || '').replace(/\/+$/, '').replace(/\/home.*$/, '');
if (!base) { console.error('N8N_BASE_URL is missing from .env'); process.exit(1); }

const FILES = {
  N8N_DRIVE_WEBHOOK_URL: ['.drive-webhook-path', 'tools/deploy_drive_n8n.js'],
  N8N_IMAGE_WEBHOOK_URL: ['.image-webhook-path', 'tools/deploy_image_n8n.js'],
  N8N_PREVIEW_WEBHOOK_URL: ['.preview-webhook-path', 'tools/deploy_preview_n8n.js'],
  N8N_WRITE_WEBHOOK_URL: ['.write-webhook-path', 'tools/deploy_write_n8n.js'],
};
const lines = []; const missing = [];
for (const [name, [file, script]] of Object.entries(FILES)) {
  try { lines.push(name + '=' + base + '/webhook/' + fs.readFileSync(path.join(root, 'workflow', file), 'utf8').trim()); }
  catch { missing.push(name + ' (run node ' + script + ')'); }
}
if (!lines.length) { console.error('No webhook path files found. Deploy the n8n workflows first.'); process.exit(1); }
const text = lines.join('\r\n') + '\r\n';

if (process.argv.includes('--show')) console.log(text);
else {
  const r = spawnSync('clip', { input: text, shell: true });
  if (r.status === 0) console.log('Copied to your clipboard (paste into Netlify):\n  ' + lines.map((l) => l.split('=')[0]).join('\n  '));
  else { console.log('Could not use the clipboard here; showing the lines instead:\n'); console.log(text); }
}
if (missing.length) console.log('\nNot found: ' + missing.join(', '));
