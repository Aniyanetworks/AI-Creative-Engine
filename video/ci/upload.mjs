// Uploads every rendered MP4 in a folder to the storage bucket under "<runId>/".  Usage: node ci/upload.mjs <runId> <dir>
import fs from 'fs';
import path from 'path';
import { putFile } from './storage.mjs';

const [runId, dir] = process.argv.slice(2);
if (!runId || !dir) { console.error('Usage: node ci/upload.mjs <runId> <dir>'); process.exit(1); }
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.mp4$/i.test(f)) : [];
if (!files.length) { console.error('No .mp4 files found in ' + dir); process.exit(1); }

for (const f of files) {
  const size = fs.statSync(path.join(dir, f)).size;
  if (size < 10_000) throw new Error(f + ' is only ' + size + ' bytes: the render looks broken.');
  if (size > 50 * 1024 * 1024) throw new Error(f + ' is ' + (size / 1048576).toFixed(1) + ' MB, over the 50 MB storage limit (lower the quality with --crf).');
  await putFile(runId + '/' + f, path.join(dir, f), 'video/mp4');
  console.log('Uploaded', f, (size / 1048576).toFixed(1) + ' MB');
}
