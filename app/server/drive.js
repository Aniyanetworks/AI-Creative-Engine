// Google Drive housekeeping through the n8n workflow "ACE - Save video to Drive" (tools/deploy_drive_n8n.js).
// Layout in Drive:  <root folder>/<business name>/<date> · <run id>/{Static ads, Videos, report}
// Used when a run is removed from the app, so its Drive folder goes to the Drive bin as well.
export const cleanName = (s) => String(s || '').replace(/[\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
export const runFolderName = (runId, createdAt) => String(createdAt || '').slice(0, 10) + ' · ' + String(runId).slice(0, 6);

export function createDrive({ hookUrl, fetchImpl = fetch }) {
  const configured = !!hookUrl;
  const post = async (body) => {
    const r = await fetchImpl(hookUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) throw new Error('n8n answered HTTP ' + r.status);
    return j;
  };
  return {
    configured,
    // Moves the run's Drive folder to the Drive bin. Returns 'deleted' | 'none' (nothing in Drive for this run) | 'skipped' (not set up).
    // Throws if n8n or Google could not do it, so the caller can tell the user.
    async removeRun(job) {
      if (!configured) return 'skipped';
      const res = job.result || {};
      let body;
      if (res.drive_folder_id) body = { action: 'delete', id: res.drive_folder_id };
      else {
        const business = cleanName(res.business || (res.brief && res.brief.business_name));
        if (!business || !job.createdAt) return 'none'; // no result yet: nothing was filed under a business name
        body = { action: 'delete', names: [business, runFolderName(job.id, job.createdAt)] };
      }
      const j = await post(body);
      return j.deleted ? 'deleted' : 'none';
    },
  };
}
