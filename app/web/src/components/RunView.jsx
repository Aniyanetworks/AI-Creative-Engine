import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Globe, FileText, ScanSearch, Lightbulb, Image as ImageIcon, Clapperboard, Video, Package, Check, Loader2, AlertTriangle, Minus, Clock } from 'lucide-react';
import { api } from '../api.js';
import RunCost from './RunCost.jsx';
import Hint from './Hint.jsx';
import Results from './Results.jsx';
import RerunButton from './RerunButton.jsx';
import { RunSkeleton } from './Skeletons.jsx';

const ICONS = { site: Globe, brief: FileText, competitors: ScanSearch, hooks: Lightbulb, statics: ImageIcon, images: ImageIcon, scripts: Clapperboard, videos: Video, pack: Package };
const PHASES = [
  { title: 'Research', keys: ['site', 'brief', 'competitors'] },
  { title: 'Create', keys: ['hooks', 'statics', 'images', 'scripts'] },
  { title: 'Deliver', keys: ['videos', 'pack'] },
];
const DOING = {
  site: 'Reading the website and detecting brand colors…',
  brief: 'Writing the brand brief…',
  competitors: 'Studying the competition…',
  hooks: 'Writing 10 hooks and angles…',
  statics: 'Designing 20 static ad concepts (the longest writing step)…',
  images: 'Rendering images and saving them to Drive…',
  scripts: 'Writing 5 video scripts…',
  videos: 'Rendering videos…',
  pack: 'Packaging everything and saving the report to Drive…',
};
const mmss = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

function Dot({ state, Icon }) {
  if (state === 'done') return <span className="sdot done"><Check size={13} strokeWidth={3} /></span>;
  if (state === 'active') return <span className="sdot active"><Loader2 size={13} className="rot" /></span>;
  if (state === 'failed') return <span className="sdot failed"><AlertTriangle size={12} /></span>;
  if (state === 'skipped') return <span className="sdot skipped"><Minus size={13} /></span>;
  return <span className="sdot"><Icon size={12} /></span>;
}

export default function RunView({ id, onFinished, onRerun, onGoAccount }) {
  const [job, setJob] = useState(null);
  const [err, setErr] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    let timer;
    const tick = async () => {
      try {
        const j = await api.getJob(id);
        if (stopped.current) return;
        setJob(j); setErr('');
        if (j.status === 'success' || j.status === 'error') { onFinished && onFinished(); return; }
      } catch (e) { if (!stopped.current) setErr(e.message); }
      timer = setTimeout(tick, 3000);
    };
    tick();
    return () => { stopped.current = true; clearTimeout(timer); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const reloadJob = useCallback(async () => { try { setJob(await api.getJob(id)); } catch { /* shown on the next poll */ } }, [id]);
  const running = !!job && (job.status === 'queued' || job.status === 'running');
  useEffect(() => {
    if (!running) return undefined;
    const t0 = new Date(job.createdAt).getTime();
    const tickClock = () => setElapsed(Math.max(0, Math.floor((Date.now() - t0) / 1000)));
    tickClock();
    const i = setInterval(tickClock, 1000);
    return () => clearInterval(i);
  }, [running, job && job.createdAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!job) return err ? <div className="card"><div className="banner err"><AlertTriangle size={16} />{err}</div></div> : <RunSkeleton />;

  const byKey = Object.fromEntries(job.stages.map((s) => [s.key, s]));
  const finished = job.stages.filter((s) => s.state === 'done' || s.state === 'skipped').length;
  const pct = job.status === 'success' ? 100 : Math.round((finished / job.stages.length) * 100);
  const active = job.stages.find((s) => s.state === 'active');
  const failed = job.stages.find((s) => s.state === 'failed');
  const title = (job.result && job.result.brief && job.result.brief.business_name) || job.businessName || hostOf(job.url);

  return (
    <>
      <section className="card">
        <div className="runhead">
          <div>
            <h2>{title}</h2>
            <p className="url">{hostOf(job.url)}{job.options && job.options.dryRun ? ' · dry run' : ''}</p>
          </div>
          <div className="row gap" style={{ alignItems: 'center' }}>
            <span className={'pill ' + (job.status === 'success' ? 'ok' : job.status === 'error' ? 'bad' : 'accent')}>
            {job.status === 'success' ? <Check size={13} strokeWidth={3} /> : job.status === 'error' ? <AlertTriangle size={13} /> : <Clock size={13} />}
            {job.status === 'success' ? 'Finished' : job.status === 'error' ? 'Failed' : 'Running · ' + mmss(elapsed)}
          </span>
            <RunCost jobId={job.id} status={job.status} stamp={JSON.stringify((job.result && job.result.stats) || {}) + (job.result && (job.result.statics || []).map((x) => x.image_url || '').join('').length)} />
            {job.status !== 'running' && job.status !== 'queued' && onRerun ? <><RerunButton job={job} onStarted={onRerun} primary={job.status === 'error'} /></> : null}
          </div>
        </div>

        <div className={'bar' + (job.status === 'success' ? ' done' : job.status === 'error' ? ' fail' : '')} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: pct + '%' }} /></div>
        <div className="barmeta"><span>{finished} of {job.stages.length} steps</span><span>{pct}%</span></div>

        {running && <div className="now"><Loader2 size={16} className="rot" /> {active ? DOING[active.key] : 'Starting up…'}</div>}
        {job.status === 'error' && (
          <div className="banner err" role="alert" style={{ marginTop: 16, marginBottom: 0 }}>
            <AlertTriangle size={16} />
            <span><strong>{job.failedNode ? 'Stopped at "' + job.failedNode + '".' : failed ? 'Stopped at "' + failed.label + '".' : 'The run failed.'}</strong> {job.error}</span>
          </div>
        )}
        {err && <div className="banner warn" style={{ marginTop: 14, marginBottom: 0 }}><AlertTriangle size={16} />Lost contact with the server ({err}). Retrying…</div>}

        <div className="phases">
          {PHASES.map((p) => (
            <div className="phase" key={p.title}>
              <h4>{p.title}</h4>
              <ol>
                {p.keys.map((k) => {
                  const s = byKey[k];
                  if (!s) return null;
                  return (
                    <li key={k} className={'step ' + s.state}>
                      <Dot state={s.state} Icon={ICONS[k]} />
                      <span>{s.label}{s.state === 'skipped' ? ' (skipped)' : ''}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
        {running && <p className="note" style={{ marginTop: 16 }}>A dry run takes about 3–4 minutes. You can leave this page; the run continues in n8n and stays in the list on the left.</p>}
      </section>

      {job.status === 'success' && job.result && <Results pack={job.result} jobId={job.id} onChanged={reloadJob} goAccount={onGoAccount} defaultLink={job.url} />}
    </>
  );
}
