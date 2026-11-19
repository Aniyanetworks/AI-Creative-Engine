// Copies rendered MP4s to Google Drive through the n8n "ACE - Save video to Drive" workflow.
//   node ci/drive.mjs <runId> <dir>               upload the MP4s in a local folder (used right after rendering)
//   node ci/drive.mjs <runId> --from-storage      download them from the storage bucket first (the "Save to Drive" button)
// For every file a small "<file>.drive.json" ({url} or {error}) is written next to it in storage; the app reads those.
// Add --strict to fail the job when nothing could be uploaded.
import fs from 'fs';
import path from 'path';
import { getBuffer, list, putJson } from './storage.mjs';
import { videosFolder } from './drivefolder.mjs';

const args = process.argv.slice(2);
const runId = args[0];
const fromStorage = args.includes('--from-storage');
const strict = args.includes('--strict');
const dir = args.find((a, i) => i > 0 && !a.startsWith('--'));
const hook = String(process.env.N8N_DRIVE_WEBHOOK_URL || '').trim();

if (!runId || (!fromStorage && !dir)) {
  console.error('Usage: node ci/drive.mjs <runId> <dir>|--from-storage [--strict]');
  process.exitCode = 1;
} else if (!hook) {
  console.error('N8N_DRIVE_WEBHOOK_URL is not set (GitHub repository secret).');
  process.exitCode = strict ? 1 : 0;
} else {
  const names = fromStorage
    ? (await list(runId)).filter((n) => /\.mp4$/i.test(n))
    : (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.mp4$/i.test(f)) : []);
  let ok = 0;
  // The folder was prepared once by the plan step (DRIVE_VIDEOS_FOLDER_ID); the Drive-only job prepares it itself.
  let folderId = String(process.env.DRIVE_VIDEOS_FOLDER_ID || '').trim();
  if (!folderId && names.length) {
    try { folderId = await videosFolder(runId, hook); } catch (e) { console.error('Drive folder could not be prepared:', e.message); }
  }
  if (!folderId && names.length) { console.error('Skipping Drive: no folder.'); process.exitCode = strict ? 1 : 0; names.length = 0; }
  for (const name of names) {
    const note = { name, at: new Date().toISOString() };
    try {
      const data = fromStorage ? await getBuffer(runId + '/' + name) : fs.readFileSync(path.join(dir, name));
      const form = new FormData();
      form.append('name', name);
      form.append('folderId', folderId);
      form.append('file', new Blob([data], { type: 'video/mp4' }), name);
      const r = await fetch(hook, { method: 'POST', body: form, signal: AbortSignal.timeout(240000) });
      const text = await r.text();
      let j = null;
      try { j = JSON.parse(text); } catch { /* not JSON */ }
      if (!r.ok || !j || !(j.url || j.id)) throw new Error('n8n answered HTTP ' + r.status + ': ' + text.slice(0, 160));
      note.url = j.url || 'https://drive.google.com/file/d/' + j.id + '/view';
      ok++;
      console.log('Drive:', name, '->', note.url);
    } catch (e) {
      note.error = String(e.message || e).slice(0, 220);
      console.error('Drive upload failed for ' + name + ':', note.error);
    }
    await putJson(runId + '/' + name + '.drive.json', note).catch(() => {});
  }
  console.log('Drive: ' + ok + ' of ' + names.length + ' uploaded.');
  if (strict && (!names.length || !ok)) process.exitCode = 1;
}
