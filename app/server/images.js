// "Generate image" for a single static ad, through the n8n workflow "ACE - Render one image" (tools/deploy_image_n8n.js).
// The workflow makes the image with the OpenAI credential kept in n8n and saves it to the run's "Static ads" folder in Drive.
// Image generation takes a minute, longer than a web request may last on Netlify, so it works in two steps:
//   start()   sends the request; n8n answers at once with its execution id, and the static is marked "rendering:<execution id>"
//   resolve() later checks whether the image file has appeared in the Drive folder (the workflow keeps no execution data for
//             successful runs, because it would hold the whole image), and reads the execution's status for failures
import { cleanName, runFolderName } from './drive.js';

const TIMEOUT_MS = 8 * 60 * 1000;
const errorStates = ['error', 'crashed', 'canceled'];

export function createImages({ hookUrl, driveHookUrl, n8nApi, workflowName = 'ACE - Render one image', fetchImpl = fetch, quality = 'medium', now = () => Date.now(), onDone = null }) {
  const configured = !!hookUrl;
  const businessOf = (result) => cleanName(result.business || (result.brief && result.brief.business_name)) || 'Unnamed business';
  // The run's "Static ads" folder: inside the run folder the main workflow recorded, else found by name.
  const folderFor = (job, result) => (result.drive_folder_id
    ? { parentId: result.drive_folder_id, names: ['Static ads'] }
    : { names: [businessOf(result), runFolderName(job.id, job.createdAt), 'Static ads'] });
  const postJson = async (url, body, ms) => {
    const r = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  };

  return {
    configured,
    isRendering: (s) => /^rendering:/.test((s && s.image_status) || ''),

    // Starts one image. Returns the changed result (the caller saves it).
    // opts: { quality: 'low'|'medium'|'high', note: what to change when making it again }
    async start(job, id, opts = {}) { // opts.model = an allowed image model id (the caller validates it) // opts.by = the account that clicked (kept for the usage report)
      if (!configured) throw Object.assign(new Error('Single-image rendering is not set up yet (run tools/deploy_image_n8n.js).'), { status: 409 });
      const result = job.result;
      const s = result && Array.isArray(result.statics) && result.statics.find((x) => x.id === id);
      if (!s) throw Object.assign(new Error('Unknown static ad.'), { status: 404 });
      if (!String(s.image_prompt || '').trim()) throw Object.assign(new Error('This ad has no image prompt.'), { status: 409 });
      if (this.isRendering(s) && now() - new Date(s.image_started || 0).getTime() < TIMEOUT_MS) throw Object.assign(new Error('This image is already being made.'), { status: 409 });

      const q = ['low', 'medium', 'high'].includes(opts.quality) ? opts.quality : quality;
      const note = String(opts.note || '').replace(/ +/g, ' ').trim().slice(0, 300);
      const prompt = String(s.image_prompt).trim() + (note ? ' IMPORTANT adjustments requested by the user, apply these: ' + note : '');
      const slug = businessOf(result).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'business';
      const fileName = slug + '_static_' + s.id + '.png';
      let started;
      try {
        started = await postJson(hookUrl, {
          request_id: Math.random().toString(36).slice(2, 10) + now().toString(36), image_prompt: prompt, aspect: s.aspect, quality: q, model: opts.model || undefined,
          file_name: fileName, folder_request: { action: 'ensure', ...folderFor(job, result) },
        }, 20000);
      } catch (e) { throw Object.assign(new Error('n8n did not accept the request (' + e.message + '). Is the "' + workflowName + '" workflow active?'), { status: 502 }); }
      if (!started || !started.execution_id) throw Object.assign(new Error('n8n did not report the execution. Re-run tools/deploy_image_n8n.js.'), { status: 502 });
      s.image_status = 'rendering:' + started.execution_id;
      s.image_file = fileName;
      s.image_quality = q;
      s.image_model = opts.model || null;
      s.image_by = opts.by || null;
      s.image_started = new Date(now()).toISOString();
      return result;
    },

    // Looks at rendering images. Returns the updated result if anything changed, else null.
    async resolve(job) {
      const result = job.result;
      const pending = result && Array.isArray(result.statics) ? result.statics.filter((s) => this.isRendering(s)) : [];
      if (!pending.length || !configured) return null;
      let changed = false;
      for (const s of pending) {
        const execId = s.image_status.slice('rendering:'.length);
        const finish = (patch) => { Object.assign(s, patch); delete s.image_started; changed = true; };

        // 1. Is the new image in the Drive folder? (only files created after the request count, so "make again" works)
        if (driveHookUrl && s.image_file) {
          try {
            const after = new Date(new Date(s.image_started || 0).getTime() - 15000).toISOString();
            const f = await postJson(driveHookUrl, { action: 'find', create: false, ...folderFor(job, result), fileName: s.image_file, after }, 25000);
            if (f && f.found && f.url) { finish({ image_url: f.url, image_status: 'ok' }); if (onDone) await Promise.resolve(onDone(job, s)).catch(() => {}); continue; }
          } catch { /* Drive or n8n briefly unavailable: look again on the next poll */ }
        }
        // 2. Did the workflow fail? Failed executions are kept and are small.
        try {
          const e = await n8nApi('/executions/' + encodeURIComponent(execId) + '?includeData=false');
          if (e && errorStates.includes(e.status)) {
            const full = await n8nApi('/executions/' + encodeURIComponent(execId) + '?includeData=true').catch(() => null);
            const err = full && full.data && full.data.resultData && full.data.resultData.error;
            finish({ image_status: 'failed: ' + String((err && (err.description || err.message)) || 'the workflow stopped with an error').slice(0, 160) });
            continue;
          }
        } catch { /* a finished successful run is not kept (404): the Drive check above finds its image */ }
        // 3. Give up after a while.
        if (now() - new Date(s.image_started || 0).getTime() > TIMEOUT_MS) finish({ image_status: 'failed: timed out waiting for the image' });
      }
      if (changed) {
        result.stats = { ...(result.stats || {}), statics_rendered: result.statics.filter((s) => s.image_url).length };
        return result;
      }
      return null;
    },
  };
}
