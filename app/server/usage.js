// Usage and cost report per account. Every billable action is logged as an event with an estimated dollar cost:
//   claude  tokens used by a run (read from the n8n execution), priced per million tokens
//   image   images made (by a run or by the "Generate image" button), priced by quality
//   video   videos rendered (ElevenLabs voice credits), priced per 1,000 credits
// The prices are list-price ESTIMATES you can change with environment variables; this is not a bill. Anthropic, OpenAI and
// ElevenLabs remain the source of truth for what you were charged.

export function pricesFrom(pick) {
  const n = (name, dflt) => { const v = parseFloat(pick(name)); return Number.isFinite(v) && v >= 0 ? v : dflt; };
  return {
    claudeInPerMTok: n('PRICE_CLAUDE_INPUT_PER_MTOK', 3),
    claudeOutPerMTok: n('PRICE_CLAUDE_OUTPUT_PER_MTOK', 15),
    image: { low: n('PRICE_IMAGE_LOW', 0.01), medium: n('PRICE_IMAGE_MEDIUM', 0.04), high: n('PRICE_IMAGE_HIGH', 0.17) },
    // Per-model rates [input, output] per million tokens. Families are matched by name; the numbers are ASSUMPTIONS, override
    // exact ids with PRICE_CLAUDE_BY_MODEL='{"claude-opus-5-5":[15,75]}'.
    claudeFamilies: { haiku: [1, 5], sonnet: [3, 15], opus: [15, 75] },
    claudeByModel: (() => { try { return JSON.parse(pick('PRICE_CLAUDE_BY_MODEL') || '{}'); } catch { return {}; } })(),
    imageMini: n('PRICE_IMAGE_MINI_MULTIPLIER', 0.35), // gpt-image-*-mini costs about a third of the full model
    videoCredits: n('ELEVENLABS_CREDITS_PER_VIDEO', 500),
    creditsPer1k: n('PRICE_ELEVENLABS_PER_1K_CREDITS', 0.2),
  };
}

const round = (x) => Math.round(x * 10000) / 10000;

export function createUsage({ store, prices, profiles }) {
  const enabled = !!(store && store.usage);
  const rateFor = (model) => {
    const m = String(model || '').toLowerCase();
    const exact = prices.claudeByModel && prices.claudeByModel[model];
    if (Array.isArray(exact) && exact.length === 2) return exact;
    for (const [fam, rate] of Object.entries(prices.claudeFamilies || {})) if (m.includes(fam)) return rate;
    return [prices.claudeInPerMTok, prices.claudeOutPerMTok];
  };
  const costOf = {
    claude: (inTok, outTok, model) => { const [i, o] = rateFor(model); return round((inTok / 1e6) * i + (outTok / 1e6) * o); },
    image: (count, quality, model) => round(count * (prices.image[quality] ?? prices.image.medium) * (/mini/i.test(String(model || '')) ? prices.imageMini : 1)),
    video: (count) => round(count * (prices.videoCredits / 1000) * prices.creditsPer1k),
  };
  // Logging must never break the action it describes.
  async function add(ev) { if (!enabled) return false; try { await store.usage.add(ev); return true; } catch (e) { console.error('Usage not recorded: ' + e.message); return false; } }

  return {
    enabled, prices, costOf,

    // A finished run: Claude tokens (from the execution's Claude nodes) and the images the workflow made. Once per run.
    async recordRun(job, { inTok = 0, outTok = 0, calls = 0, images = 0, imageQuality = 'medium', model = '', imageModel = '' }) {
      if (!enabled) return;
      try { if (await store.usage.has(job.id, 'claude')) return; } catch { return; }
      await add({ userId: job.userId, runId: job.id, kind: 'claude', units: inTok + outTok, unitLabel: 'tokens', cost: costOf.claude(inTok, outTok, model), meta: { in: inTok, out: outTok, calls, model } });
      if (images > 0) await add({ userId: job.userId, runId: job.id, kind: 'image', units: images, unitLabel: 'images', quality: imageQuality, cost: costOf.image(images, imageQuality, imageModel), meta: { source: 'run', model: imageModel } });
    },
    // userId = the person who clicked (falls back to the run's owner)
    // "Generate more" / "Rewrite": more Claude tokens on an existing run (charged to whoever clicked)
    async recordWrite(job, { inTok = 0, outTok = 0, kind, op, count, model = '' }, userId) {
      return add({ userId: userId || job.userId, runId: job.id, kind: 'claude', units: inTok + outTok, unitLabel: 'tokens', cost: costOf.claude(inTok, outTok, model), meta: { in: inTok, out: outTok, calls: 1, source: 'write', what: kind, op, count, model } });
    },
    async recordImage(job, quality, userId, model) { return add({ userId: userId || job.userId, runId: job.id, kind: 'image', units: 1, unitLabel: 'images', quality, cost: costOf.image(1, quality, model), meta: { source: 'button', model } }); },
    async recordVideos(job, count, by, userId) { return add({ userId: userId || job.userId, runId: job.id, kind: 'video', units: count, unitLabel: 'videos', cost: costOf.video(count), meta: { credits: Math.round(count * prices.videoCredits), by: by || 'user' } }); },

    // What one run cost so far: Claude tokens, images by quality, videos, and each event. Anyone who may open the run may see it.
    async runReport(runId) {
      if (!enabled) return { enabled: false };
      const events = (await store.usage.list({ runId })).sort((a, b) => (a.at < b.at ? -1 : 1));
      const of = (k) => events.filter((e) => e.kind === k);
      const sum = (arr) => round(arr.reduce((a, e) => a + (e.cost || 0), 0));
      const claude = of('claude')[0];
      const imgQ = {};
      for (const e of of('image')) imgQ[e.quality || 'medium'] = (imgQ[e.quality || 'medium'] || 0) + e.units;
      return {
        enabled: true, runId, cost: sum(events), tracked: events.length > 0,
        claude: { cost: sum(of('claude')), inTokens: (claude && claude.meta && claude.meta.in) || 0, outTokens: (claude && claude.meta && claude.meta.out) || 0, calls: (claude && claude.meta && claude.meta.calls) || 0 },
        images: { cost: sum(of('image')), count: of('image').reduce((a, e) => a + e.units, 0), byQuality: imgQ },
        videos: { cost: sum(of('video')), count: of('video').reduce((a, e) => a + e.units, 0), credits: of('video').reduce((a, e) => a + ((e.meta && e.meta.credits) || 0), 0) },
        events: events.map((e) => ({ kind: e.kind, units: e.units, unitLabel: e.unitLabel, quality: e.quality, cost: e.cost, at: e.at, source: e.meta && e.meta.source, what: e.meta && e.meta.what, op: e.meta && e.meta.op, count: e.meta && e.meta.count, credits: e.meta && e.meta.credits, model: e.meta && e.meta.model })),
        prices,
      };
    },

    // The report. `viewer` is { id, isAdmin }. Non-admins only ever see their own events.
    async report({ viewer, range = 'month', userId, jobs = [] }) {
      if (!enabled) return { enabled: false };
      const now = new Date();
      const since = range === 'all' ? null : range === '30d' ? new Date(now.getTime() - 30 * 864e5).toISOString() : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const scope = viewer.isAdmin ? (userId && userId !== 'all' ? userId : null) : viewer.id;
      const events = await store.usage.list({ userId: scope || undefined, since: since || undefined });
      const sum = (arr) => round(arr.reduce((a, e) => a + (e.cost || 0), 0));
      const by = (kind) => events.filter((e) => e.kind === kind);
      const totals = {
        cost: sum(events),
        claude: { cost: sum(by('claude')), tokens: by('claude').reduce((a, e) => a + e.units, 0), runs: new Set(by('claude').map((e) => e.runId)).size },
        image: { cost: sum(by('image')), count: by('image').reduce((a, e) => a + e.units, 0) },
        video: { cost: sum(by('video')), count: by('video').reduce((a, e) => a + e.units, 0), credits: by('video').reduce((a, e) => a + ((e.meta && e.meta.credits) || 0), 0) },
      };
      // per day (UTC)
      const days = {};
      for (const e of events) { const d = String(e.at).slice(0, 10); days[d] = round((days[d] || 0) + e.cost); }
      const byDay = Object.entries(days).sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, cost]) => ({ day, cost }));
      // per run
      const jobById = new Map(jobs.map((j) => [j.id, j]));
      const runs = {};
      for (const e of events) {
        if (!e.runId) continue;
        const r = (runs[e.runId] = runs[e.runId] || { runId: e.runId, claude: 0, image: 0, video: 0, cost: 0, at: e.at, userId: e.userId });
        r[e.kind] = round(r[e.kind] + e.cost); r.cost = round(r.cost + e.cost); if (e.at > r.at) r.at = e.at;
      }
      const byRun = Object.values(runs).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 100).map((r) => {
        const j = jobById.get(r.runId);
        return { ...r, removed: !j, label: j ? (j.businessName || safeHost(j.url)) : '(removed run)', url: j ? j.url : null };
      });
      let byUser = null;
      if (viewer.isAdmin && !(userId && userId !== 'all')) {
        let people = [];
        try { people = profiles ? await profiles.list() : []; } catch { /* accounts unavailable */ }
        const email = new Map(people.map((p) => [p.id, p.email]));
        const u = {};
        for (const e of events) {
          const k = e.userId || 'none';
          const x = (u[k] = u[k] || { userId: e.userId, email: e.userId ? email.get(e.userId) || '(deleted account)' : 'Local / no account', cost: 0, claude: 0, image: 0, video: 0, images: 0, videos: 0, runs: new Set() });
          x[e.kind] = round(x[e.kind] + e.cost); x.cost = round(x.cost + e.cost);
          if (e.kind === 'image') x.images += e.units; if (e.kind === 'video') x.videos += e.units; if (e.kind === 'claude') x.runs.add(e.runId);
        }
        byUser = Object.values(u).map((x) => ({ ...x, runs: x.runs.size })).sort((a, b) => b.cost - a.cost);
      }
      return { enabled: true, range, since, scope: scope || 'all', isAdmin: !!viewer.isAdmin, totals, byDay, byRun, byUser, prices };
    },
  };
}

function safeHost(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'run'; } }

// Sums Claude usage out of an n8n execution: every "<step> (Claude)" node output carries usage.input_tokens / output_tokens.
export function claudeUsageFromRunData(runData) {
  let inTok = 0, outTok = 0, calls = 0, model = '';
  for (const [name, runs] of Object.entries(runData || {})) {
    if (!/ \(Claude\)$/.test(name)) continue;
    for (const run of runs || []) {
      const j = run && run.data && run.data.main && run.data.main[0] && run.data.main[0][0] && run.data.main[0][0].json;
      if (j && j.usage) { inTok += Number(j.usage.input_tokens) || 0; outTok += Number(j.usage.output_tokens) || 0; calls += 1; model = j.model || model; }
    }
  }
  return { inTok, outTok, calls, model };
}
