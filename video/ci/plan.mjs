// Step 1 of the render workflow: read the run, decide which videos to render, mark the render as started.
// Outputs a matrix ({"n":[1,2,3,4,5]}) so every video renders in its own parallel job.
import fs from 'fs';
import { getJson, putJson, runLink, supabaseKey, supabaseUrl } from './storage.mjs';
import { videosFolder } from './drivefolder.mjs';

// Failures are thrown and handled once at the bottom, so the process ends through exitCode instead of
// process.exit() (which can crash on Windows while sockets are still closing).
class Stop extends Error {}

const runId = String(process.env.RUN_ID || '').trim();
const only = String(process.env.ONLY || '').split(',').map((x) => parseInt(x, 10)).filter(Number.isFinite);

const fail = async (message) => {
  const cur = (await getJson(runId + '/status.json').catch(() => null)) || {};
  await putJson(runId + '/status.json', { ...cur, status: 'failed', message, runUrl: runLink(), finishedAt: new Date().toISOString() }).catch(() => {});
  throw new Stop(message);
};

try {
  if (!/^[a-z0-9]{6,32}$/i.test(runId)) throw new Stop('RUN_ID is missing or malformed.');

  const r = await fetch(`${supabaseUrl}/rest/v1/ace_runs?id=eq.${encodeURIComponent(runId)}&select=result,status`, { headers: { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey } });
  if (!r.ok) await fail('Could not load the run from Supabase (HTTP ' + r.status + ').');
  const rows = await r.json();
  if (!rows[0] || !rows[0].result) await fail('Run ' + runId + ' was not found or has no result yet.');

  // A selection that did not parse must never turn into "render everything".
  if (String(process.env.ONLY || '').trim() && !only.length) await fail('The selected video number was not understood, so nothing was rendered.');

  const videos = (rows[0].result.videos || []).map((v, i) => ({ n: v.id || i + 1, ok: Array.isArray(v.scenes) && v.scenes.length > 0 }));
  const numbers = videos.filter((v) => v.ok && (!only.length || only.includes(v.n))).map((v) => v.n);
  if (!numbers.length) await fail('This run has no video storyboards to render.');

  const cur = (await getJson(runId + '/status.json').catch(() => null)) || {};
  await putJson(runId + '/status.json', { ...cur, status: 'rendering', total: numbers.length, runUrl: runLink(), startedAt: new Date().toISOString(), message: undefined });

  console.log('Rendering videos', numbers.join(', '), 'for run', runId);
  // Google Drive: make the run's "Videos" folder once here, so the parallel render jobs do not each create one.
  let folder = '';
  if (process.env.N8N_DRIVE_WEBHOOK_URL) {
    try {
      const f = await videosFolder(runId, process.env.N8N_DRIVE_WEBHOOK_URL);
      folder = f.videos;
      if (f.run) await putJson(runId + '/drive-folder.json', { id: f.run }); // so deleting the run in the app finds this exact folder
      console.log('Drive folder ready.');
    }
    catch (e) { console.error('Drive folder could not be prepared (videos will not be copied to Drive):', e.message); }
  }
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify({ n: numbers })}\nfolder=${folder}\n`);
  else console.log(JSON.stringify({ n: numbers }));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
