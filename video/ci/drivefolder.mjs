// Where a run's files live in Google Drive:  <root folder>/<business name>/<date> · <run id>/Videos
// The root folder is set in n8n (DRIVE_FOLDER_ID). The n8n workflow "ACE - Save video to Drive" finds or creates each level.
import { supabaseKey, supabaseUrl } from './storage.mjs';

export const cleanName = (s) => String(s || '').replace(/[\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
export const runFolderName = (runId, createdAt) => String(createdAt || new Date().toISOString()).slice(0, 10) + ' · ' + String(runId).slice(0, 6);

// Returns the id of the run's "Videos" folder, creating it if needed (one call, so parallel jobs never create duplicates).
export async function videosFolder(runId, hook) {
  const r = await fetch(`${supabaseUrl}/rest/v1/ace_runs?id=eq.${encodeURIComponent(runId)}&select=result,created_at,url`, { headers: { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey } });
  if (!r.ok) throw new Error('Could not load the run (HTTP ' + r.status + ').');
  const row = (await r.json())[0];
  if (!row) throw new Error('Run ' + runId + ' not found.');
  const res = row.result || {};
  let host = '';
  try { host = new URL(row.url).hostname.replace(/^www\./, ''); } catch { /* no url */ }
  const business = cleanName(res.business || (res.brief && res.brief.business_name)) || host || 'Unnamed business';
  // If the main workflow already made this run's folder, put "Videos" inside it; otherwise build the whole path.
  const body = res.drive_folder_id
    ? { action: 'ensure', parentId: res.drive_folder_id, names: ['Videos'] }
    : { action: 'ensure', names: [business, runFolderName(runId, row.created_at), 'Videos'] };
  const e = await fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const j = await e.json().catch(() => null);
  if (!e.ok || !j || !j.id) throw new Error('n8n could not prepare the Drive folder (HTTP ' + e.status + ').');
  return j.id;
}
