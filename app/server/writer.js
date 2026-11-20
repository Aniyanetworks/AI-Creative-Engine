// "Generate more" and "Rewrite" for hooks, static ads and video scripts, through the n8n workflow "ACE - Write more"
// (tools/deploy_write_n8n.js). Claude runs inside n8n with its credential; the app never holds the Anthropic key.
// Writing takes tens of seconds, longer than a web request may last on Netlify, so it works in two steps:
//   start()   sends the request; n8n answers at once with its execution id, kept as result.write
//   resolve() later reads that execution (text only, small) and merges the new or rewritten items into the run's result
const TIMEOUT_MS = 6 * 60 * 1000;
const MAX_AREAS = 8;
const LIMITS = { hooks: { per: 10, total: 40 }, statics: { per: 10, total: 60 }, videos: { per: 5, total: 15 } };
const NOUN = { hooks: 'hooks', statics: 'ad concepts', videos: 'video scripts' };
const IMAGE_FIELDS = ['image_url', 'image_status', 'image_file', 'image_started', 'image_quality', 'image_by'];

const firstJson = (runData, node) => {
  const items = runData && runData[node] && runData[node][0] && runData[node][0].data && runData[node][0].data.main && runData[node][0].data.main[0];
  return items && items[0] && items[0].json;
};

export function createWriter({ hookUrl, n8nApi, fetchImpl = fetch, now = () => Date.now(), onDone = null }) {
  const configured = !!hookUrl;
  const pending = (w) => !!w && !w.error && now() - new Date(w.startedAt || 0).getTime() < TIMEOUT_MS;

  return {
    configured, limits: LIMITS,
    isPending: pending,

    // opts: { kind, op: 'more'|'update', count, instruction, id, by }. Returns the changed result (the caller saves it).
    async start(job, opts) {
      if (!configured) throw Object.assign(new Error('Writing more is not set up yet (run tools/deploy_write_n8n.js).'), { status: 409 });
      const result = job.result;
      if (!result) throw Object.assign(new Error('Wait until the run has finished.'), { status: 409 });
      // Area-by-area competitor research (Claude's web search finds real local businesses, with source links)
      if (opts.op === 'research') {
        const area = String(opts.area || '').replace(/[^\p{L}\p{N} .,'&/-]/gu, ' ').replace(/ +/g, ' ').trim().slice(0, 80);
        if (!area) throw Object.assign(new Error('Name an area, for example a city or region.'), { status: 400 });
        if (pending(result.write)) throw Object.assign(new Error('Something is already being written for this run. Wait for it to finish.'), { status: 409 });
        const key = area.toLowerCase();
        const have = Object.keys(result.local_competitors || {});
        if (!have.includes(key) && have.length >= MAX_AREAS) throw Object.assign(new Error('That is already ' + MAX_AREAS + ' areas. Remove one first.'), { status: 409 });
        const b = result.brief || {};
        const brief = { business_name: b.business_name, one_liner: b.one_liner, offer: b.offer, pricing: b.pricing, audience: b.audience, differentiators: b.differentiators, proof: b.proof, location: b.location };
        const keywords = [...(Array.isArray(opts.keywords) ? opts.keywords : []), ...(Array.isArray(b.competitor_search_keywords) ? b.competitor_search_keywords : [])].map((x) => String(x).trim()).filter(Boolean).slice(0, 8);
        let started;
        try {
          const r = await fetchImpl(hookUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000), body: JSON.stringify({ op: 'research', area, keywords, brief, model: opts.model || undefined }) });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          started = await r.json();
        } catch (e) { throw Object.assign(new Error('n8n did not accept the request (' + e.message + '). Is the "ACE - Write more" workflow active?'), { status: 502 }); }
        if (!started || !started.execution_id) throw Object.assign(new Error('n8n did not report the execution. Re-run tools/deploy_write_n8n.js.'), { status: 502 });
        result.write = { kind: 'competitors', op: 'research', area, key, model: opts.model || null, execId: String(started.execution_id), startedAt: new Date(now()).toISOString(), by: opts.by || null };
        return result;
      }
      const kind = opts.kind;
      const lim = LIMITS[kind];
      if (!lim) throw Object.assign(new Error('Unknown kind.'), { status: 400 });
      if (pending(result.write)) throw Object.assign(new Error('Something is already being written for this run. Wait for it to finish.'), { status: 409 });
      const list = Array.isArray(result[kind]) ? result[kind] : [];
      const op = opts.op === 'update' ? 'update' : opts.op === 'tags' ? 'tags' : 'more';
      if (op === 'tags' && kind === 'hooks') throw Object.assign(new Error('Hooks do not get hashtags.'), { status: 400 });
      const instruction = String(opts.instruction || '').replace(/ +/g, ' ').trim().slice(0, 400);
      let count = 1; let item = null; let tagItems;
      if (op === 'tags') {
        // Posts that have no hashtags yet (all of them, or just the ids asked for)
        const want = Array.isArray(opts.ids) && opts.ids.length ? new Set(opts.ids) : null;
        const pick = list.filter((x) => (!want || want.has(x.id)) && !(Array.isArray(x.hashtags) && x.hashtags.length)).slice(0, 20);
        if (!pick.length) throw Object.assign(new Error('Every post already has hashtags.'), { status: 409 });
        count = pick.length;
        tagItems = pick.map((x) => (kind === 'statics'
          ? { id: x.id, headline: x.headline, primary_text: x.primary_text, overlay_text: x.overlay_text, aspect: x.aspect, angle: x.angle }
          : { id: x.id, title: x.title, primary_text: x.primary_text, script: String(x.spoken_script || '').slice(0, 400) }));
      } else if (op === 'more') {
        count = Math.max(1, Math.min(lim.per, parseInt(opts.count, 10) || 1));
        if (list.length + count > lim.total) throw Object.assign(new Error('That would be more than ' + lim.total + ' ' + NOUN[kind] + ' for one run. Ask for fewer, or start a new run.'), { status: 409 });
      } else {
        item = list.find((x) => x.id === opts.id);
        if (!item) throw Object.assign(new Error('Unknown item.'), { status: 404 });
        item = Object.fromEntries(Object.entries(item).filter(([k]) => !IMAGE_FIELDS.includes(k) && !/^(video_|scenes_)/.test(k) && !/_stale$/.test(k)));
      }
      const summary = {
        hooks: (x) => ({ id: x.id, angle: x.angle, hook: x.hook }),
        statics: (x) => ({ id: x.id, hook_id: x.hook_id, style: x.style, aspect: x.aspect, headline: x.headline, overlay_text: x.overlay_text }),
        videos: (x) => ({ id: x.id, title: x.title, format: x.format }),
      }[kind];
      const nextId = list.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
      let started;
      try {
        const r = await fetchImpl(hookUrl, {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000),
          body: JSON.stringify({ op, kind, count, instruction, nextId, model: opts.model || undefined, items: tagItems, brief: result.brief || {}, hooks: kind === 'hooks' ? undefined : (result.hooks || []).map((h) => ({ id: h.id, angle: h.angle, hook: h.hook })), existing: list.map(summary), item }),
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        started = await r.json();
      } catch (e) { throw Object.assign(new Error('n8n did not accept the request (' + e.message + '). Is the "ACE - Write more" workflow active?'), { status: 502 }); }
      if (!started || !started.execution_id) throw Object.assign(new Error('n8n did not report the execution. Re-run tools/deploy_write_n8n.js.'), { status: 502 });
      result.write = { kind, op, count, id: op === 'update' ? opts.id : null, instruction, model: opts.model || null, execId: String(started.execution_id), startedAt: new Date(now()).toISOString(), by: opts.by || null };
      return result;
    },

    // Forgets one researched area.
    removeArea(job, key) {
      const lc = job.result && job.result.local_competitors;
      if (!lc || !lc[key]) return null;
      delete lc[key];
      return job.result;
    },

    dismiss(job) {
      if (job.result && job.result.write && job.result.write.error) { delete job.result.write; return job.result; }
      return null;
    },

    // Checks a pending request. Returns the updated result if anything changed, else null.
    async resolve(job) {
      const result = job.result;
      const w = result && result.write;
      if (!w || w.error || !configured) return null;
      let exec = null;
      try { exec = await n8nApi('/executions/' + encodeURIComponent(w.execId) + '?includeData=true'); } catch { /* n8n busy: ask again next time */ }
      const rd = exec && exec.data && exec.data.resultData;
      if (exec && exec.status === 'success') {
        const out = firstJson(rd && rd.runData, 'Parse');
        if (out && w.op === 'research' && out.item && Array.isArray(out.item.competitors)) {
          result.local_competitors = { ...(result.local_competitors || {}), [w.key]: { ...out.item, key: w.key, researched_at: new Date(now()).toISOString(), searches: out.searches || 0 } };
          delete result.write;
          if (onDone) await Promise.resolve(onDone(job, { kind: 'competitors', op: 'research', count: out.item.competitors.length, usage: out.usage, searches: out.searches || 0, area: w.area, by: w.by, model: w.model })).catch(() => {});
          return result;
        }
        if (out && w.op === 'tags' && Array.isArray(out.items) && out.items.length) {
          const list = Array.isArray(result[w.kind]) ? result[w.kind] : [];
          for (const t of out.items) { const it = list.find((x) => x.id === t.id); if (it) it.hashtags = t.hashtags; }
          delete result.write;
          if (onDone) await Promise.resolve(onDone(job, { kind: w.kind, op: 'tags', count: out.items.length, usage: out.usage, by: w.by, model: w.model })).catch(() => {});
          return result;
        }
        if (!out || !Array.isArray(out.items) || !out.items.length) { result.write = { ...w, error: 'Nothing usable came back. Try again.' }; return result; }
        const list = Array.isArray(result[w.kind]) ? result[w.kind] : (result[w.kind] = []);
        if (w.op === 'update') {
          const i = list.findIndex((x) => x.id === w.id);
          if (i >= 0) {
            const old = list[i]; const neu = out.items[0];
            const merged = { ...neu, id: old.id };
            if (w.kind === 'statics') { merged.hook_id = neu.hook_id || old.hook_id; for (const f of IMAGE_FIELDS) if (old[f] !== undefined) merged[f] = old[f]; if (old.image_url) merged.image_stale = true; else merged.image_status = old.image_status || 'concept'; }
            if (w.kind === 'videos') { for (const f of Object.keys(old)) if (/^video_/.test(f)) merged[f] = old[f]; if (old.video_url) merged.video_stale = true; }
            merged.rewritten = true;
            list[i] = merged;
          }
        } else {
          for (const it of out.items) {
            if (w.kind === 'statics') list.push({ ...it, image_url: null, image_status: 'concept only (added later)' });
            else if (w.kind === 'videos') list.push({ ...it, video_url: null, video_status: 'storyboard ready' });
            else list.push(it);
          }
        }
        result.stats = { ...(result.stats || {}), [w.kind + '_total']: list.length };
        delete result.write;
        if (onDone) await Promise.resolve(onDone(job, { kind: w.kind, op: w.op, count: out.items.length, usage: out.usage, by: w.by, model: w.model })).catch(() => {});
        return result;
      }
      if (exec && ['error', 'crashed', 'canceled'].includes(exec.status)) {
        const err = rd && rd.error;
        result.write = { ...w, error: String((err && (err.description || err.message)) || 'The workflow stopped with an error.').slice(0, 220) };
        return result;
      }
      if (now() - new Date(w.startedAt || 0).getTime() > TIMEOUT_MS) { result.write = { ...w, error: 'Timed out waiting for Claude. Try again.' }; return result; }
      return null;
    },
  };
}
