// Last step of the render workflow (runs even if earlier steps failed): record the outcome the app reads.
import { getJson, list, putJson, runLink } from './storage.mjs';

const runId = String(process.env.RUN_ID || '').trim();
const prepare = process.env.PREPARE_RESULT || 'unknown';
const render = process.env.RENDER_RESULT || 'unknown';
const cur = (await getJson(runId + '/status.json').catch(() => null)) || {};
const mp4s = (await list(runId).catch(() => [])).filter((n) => /\.mp4$/i.test(n));

let status = 'done';
let message;
if (prepare !== 'success') { status = 'failed'; message = 'The render could not start (' + prepare + '). Open the GitHub Actions log for details.'; }
else if (render !== 'success') { status = 'failed'; message = mp4s.length ? 'Some videos failed to render (' + mp4s.length + ' finished). Open the GitHub Actions log for details.' : 'Rendering failed (' + render + '). Open the GitHub Actions log for details.'; }
else if (!mp4s.length) { status = 'failed'; message = 'The render finished but no video files were uploaded.'; }

await putJson(runId + '/status.json', { ...cur, status, message, runUrl: runLink() || cur.runUrl, finishedAt: new Date().toISOString(), videos: mp4s });
console.log('Render status for', runId + ':', status, message || '', '| files:', mp4s.join(', ') || 'none');
