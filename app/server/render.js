// Online video rendering through GitHub Actions. The backend only dispatches the workflow and reports its
// progress; the workflow (.github/workflows/render-videos.yml) renders on GitHub's runners and uploads the MP4s
// to the Supabase Storage bucket, keeping "<runId>/status.json" up to date.
const STALE_MS = 45 * 60 * 1000; // a render that has not finished after this long is reported as failed

export function createRenderer({ storage, token, repo, ref = 'main', workflow = 'render-videos.yml', apiBase = 'https://api.github.com' }) {
  const configured = !!(storage && token && repo);
  const statusPath = (runId) => runId + '/status.json';

  async function readStatus(runId) {
    const s = await storage.getJson(statusPath(runId));
    if (!s) return null;
    if ((s.status === 'queued' || s.status === 'rendering') && Date.now() - new Date(s.requestedAt).getTime() > STALE_MS) {
      return { ...s, status: 'failed', message: 'The render did not finish within 45 minutes. Check the GitHub Actions log, then try again.' };
    }
    return s;
  }

  return {
    configured,
    repo,
    actionsUrl: repo ? 'https://github.com/' + repo + '/actions/workflows/' + workflow : null,

    // Current state plus signed links for any finished videos.
    async status(runId) {
      if (!configured) return { configured: false };
      const s = await readStatus(runId);
      const files = await storage.list(runId).catch(() => []);
      // Sign every link in parallel (two per video): sequential calls would eat into Netlify's 10 s function limit.
      const mp4s = files.filter((x) => /.mp4$/i.test(x.name));
      const videos = await Promise.all(mp4s.map(async (f) => {
        const n = parseInt(f.name, 10); // files are named "<n>-<slug>.mp4"
        const hasDrive = files.some((x) => x.name === f.name + '.drive.json'); // written by the workflow after a Google Drive upload
        const [url, downloadUrl, drive] = await Promise.all([
          storage.sign(runId + '/' + f.name, 3600), storage.sign(runId + '/' + f.name, 3600, f.name),
          hasDrive ? storage.getJson(runId + '/' + f.name + '.drive.json').catch(() => null) : null,
        ]);
        return { n: Number.isFinite(n) ? n : null, name: f.name, size: f.size, url, downloadUrl, driveUrl: (drive && drive.url) || null, driveError: (drive && drive.error) || null };
      }));
      videos.sort((a, b) => (a.n || 0) - (b.n || 0));
      return { configured: true, status: s ? s.status : videos.length ? 'done' : 'idle', message: s && s.message, runUrl: s && s.runUrl, task: s && s.task, voiceId: s && s.voiceId, requestedAt: s && s.requestedAt, finishedAt: s && s.finishedAt, videos, actionsUrl: this.actionsUrl };
    },

    // Starts a render. Returns { started: true } or { started: false, reason } (already in progress etc.).
    async dispatch(runId, { by = 'user', force = false, voiceId = '', task = 'render' } = {}) {
      if (!configured) return { started: false, reason: 'not-configured' };
      const record = { status: 'queued', task, voiceId: voiceId || undefined, requestedAt: new Date().toISOString(), requestedBy: by };
      // The first writer wins: with upsert off, a second automatic trigger sees the file and backs off.
      let won = await storage.putJson(statusPath(runId), record, { upsert: false });
      if (!won) {
        const cur = await readStatus(runId);
        const busy = cur && (cur.status === 'queued' || cur.status === 'rendering');
        if (busy) return { started: false, reason: 'in-progress' };
        if (!force) return { started: false, reason: 'already-attempted', status: cur && cur.status };
        await storage.putJson(statusPath(runId), record, { upsert: true }); // explicit re-render of a finished or failed one
      }
      const r = await fetch(apiBase + '/repos/' + repo + '/actions/workflows/' + workflow + '/dispatches', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'content-type': 'application/json', 'User-Agent': 'ai-creative-engine' },
        body: JSON.stringify({ ref, inputs: { run_id: runId, voice: 'true', voice_id: voiceId || '', drive_only: task === 'drive' ? 'true' : 'false' } }),
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) {
        const detail = (await r.text()).slice(0, 200);
        const hint = r.status === 401 || r.status === 403 ? ' (check the GitHub token: it needs Actions read and write on the repository)' : r.status === 404 ? ' (workflow or repository not found: is render-videos.yml pushed to ' + ref + '?)' : '';
        await storage.putJson(statusPath(runId), { ...record, status: 'failed', message: 'GitHub refused to start the render: HTTP ' + r.status + hint, finishedAt: new Date().toISOString() }, { upsert: true });
        throw Object.assign(new Error('GitHub returned HTTP ' + r.status + hint + ': ' + detail), { status: 502 });
      }
      return { started: true };
    },

    // Full runs render by themselves; dry runs and image tests wait for the button (every render uses voice credits).
    shouldAuto(job, result) {
      const o = (job && job.options) || {};
      return configured && !o.dryRun && o.maxVideos > 0 && !!result && Array.isArray(result.videos) && result.videos.some((v) => (v.scenes || []).length);
    },
  };
}
