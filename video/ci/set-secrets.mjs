#!/usr/bin/env node
// Copies the three secrets the render workflow needs from your local .env into the GitHub repository's secrets,
// using the GitHub CLI (gh). YOU run this, on your machine; the values go straight from .env to GitHub over gh's
// encrypted channel and are never printed.
//
//   node video/ci/set-secrets.mjs            (uses GITHUB_REPO from .env, or the git remote "origin")
//   node video/ci/set-secrets.mjs owner/repo
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = {};
try {
  for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0 && !line.trim().startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
} catch { console.error('No .env found in ' + root); process.exit(1); }

let repo = process.argv[2] || env.GITHUB_REPO;
if (!repo) {
  const g = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' });
  const m = /github\.com[:/]([^/]+\/[^/.\s]+)/.exec(g.stdout || '');
  repo = m && m[1];
}
if (!repo) { console.error('Could not work out the repository. Pass it: node video/ci/set-secrets.mjs owner/repo'); process.exit(1); }

const gh = (args, input) => spawnSync('gh', args, { cwd: root, input, encoding: 'utf8' });
const who = gh(['auth', 'status']);
if (who.error || who.status !== 0) { console.error('The GitHub CLI (gh) is not installed or not signed in. Install it from https://cli.github.com and run: gh auth login'); process.exit(1); }

console.log('Repository:', repo, '\n');
let missing = 0;
for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'ELEVENLABS_API_KEY']) {
  const value = env[name];
  if (!value) { console.log(`  skipped  ${name} (not in .env yet)`); missing++; continue; }
  const r = gh(['secret', 'set', name, '--repo', repo], value);
  console.log(r.status === 0 ? `  set      ${name}` : `  FAILED   ${name}: ${(r.stderr || '').trim().split('\n')[0]}`);
}
// Google Drive copies: the private n8n webhook URL (built from workflow/.drive-webhook-path after tools/deploy_drive_n8n.js)
let driveUrl = env.N8N_DRIVE_WEBHOOK_URL;
if (!driveUrl) {
  try { driveUrl = (env.N8N_BASE_URL || '').replace(/\/+$/, '') + '/webhook/' + fs.readFileSync(path.join(root, 'workflow', '.drive-webhook-path'), 'utf8').trim(); } catch { /* not deployed yet */ }
}
if (driveUrl && /^https?:\/\//.test(driveUrl)) {
  const r = gh(['secret', 'set', 'N8N_DRIVE_WEBHOOK_URL', '--repo', repo], driveUrl);
  console.log(r.status === 0 ? '  set      N8N_DRIVE_WEBHOOK_URL' : '  FAILED   N8N_DRIVE_WEBHOOK_URL: ' + (r.stderr || '').trim().split('\n')[0]);
} else console.log('  skipped  N8N_DRIVE_WEBHOOK_URL (run node tools/deploy_drive_n8n.js first; optional)');
if (env.ELEVENLABS_VOICE_ID) {
  const r = gh(['variable', 'set', 'ELEVENLABS_VOICE_ID', '--repo', repo, '--body', env.ELEVENLABS_VOICE_ID]);
  console.log(r.status === 0 ? '  set      ELEVENLABS_VOICE_ID (repository variable)' : `  FAILED   ELEVENLABS_VOICE_ID: ${(r.stderr || '').trim().split('\n')[0]}`);
}
console.log(missing ? '\nAdd the missing values to .env and run this again.' : '\nDone. The render workflow can now run.');
