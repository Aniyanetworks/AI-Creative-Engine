import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Lightbulb, Image as ImageIcon, Video, FileText, Swords, ClipboardList, Copy, Check, ExternalLink, Download, FolderOpen, AlertTriangle, LayoutGrid, Smartphone, Square, Clapperboard, Loader2, CheckCircle2, CloudUpload } from 'lucide-react';

const TABS = ['Hooks', 'Static ads', 'Videos', 'Brief', 'Competitors', 'Report'];
const TAB_ICON = { Hooks: Lightbulb, 'Static ads': ImageIcon, Videos: Video, Brief: FileText, Competitors: Swords, Report: ClipboardList };

function CopyBtn({ text, label = 'Copy' }) {
  const [ok, setOk] = useState(false);
  const click = () => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1400); }, () => {});
  };
  return <button type="button" className="ghost" onClick={click}>{ok ? <><Check size={13} /> Copied</> : <><Copy size={13} /> {label}</>}</button>;
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

const hexOk = (c) => /^#[0-9a-f]{6}$/i.test(c || '');
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const List = ({ items }) => (items && items.length ? <ul className="plain">{items.map((x, i) => <li key={i}>{typeof x === 'string' ? x : JSON.stringify(x)}</li>)}</ul> : <p className="muted small">None</p>);

function Hooks({ pack }) {
  const all = (pack.hooks || []).map((h) => h.id + '. ' + h.hook).join('\n');
  return (
    <>
      <div className="toolbar"><span className="muted small">{(pack.hooks || []).length} hooks across different angles</span><CopyBtn text={all} label="Copy all hooks" /></div>
      <div className="hooklist">
        {(pack.hooks || []).map((h) => (
          <article key={h.id} className="hook">
            <span className="num">{h.id}</span>
            <div><span className="tag">{h.angle}</span><q>{h.hook}</q><p className="why">{h.why_it_works}</p></div>
            <div className="acts"><CopyBtn text={h.hook} /></div>
          </article>
        ))}
      </div>
    </>
  );
}

function Statics({ pack }) {
  const [fmt, setFmt] = useState('all');
  const colors = ((pack.brief && pack.brief.brand_colors) || []).filter(hexOk);
  const base = colors[0] || '#4338ca';
  const accent = colors[1] || null;
  const list = (pack.statics || []).filter((s) => fmt === 'all' || s.aspect === fmt);
  const fg = luminance(base) > 0.5 ? '#14110f' : '#ffffff';
  const count = (a) => (pack.statics || []).filter((s) => s.aspect === a).length;
  return (
    <>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Filter by format">
          {[['all', 'All ' + (pack.statics || []).length, LayoutGrid], ['1:1', 'Feed · ' + count('1:1'), Square], ['9:16', 'Stories · ' + count('9:16'), Smartphone]].map(([k, l, Ic]) => (
            <button key={k} className={fmt === k ? 'on' : ''} onClick={() => setFmt(k)}><Ic size={13} /> {l}</button>
          ))}
        </div>
        <span className="note">Previews show the overlay text in your brand color. Rendered images open in Google Drive.</span>
      </div>
      <div className="cards">
        {list.map((s) => {
          const text = [s.headline, '', s.primary_text, '', 'CTA: ' + s.cta].join('\n');
          return (
            <article key={s.id} className="ad">
              <div className="meta"><span>#{s.id} · {s.aspect} · {s.style}</span>
                <span className={'pill small ' + (s.image_url ? 'ok' : '')}>{s.image_url ? 'Rendered' : /dry_run|max_images/.test(s.image_status || '') ? 'Concept only' : (s.image_status || 'Concept')}</span></div>
              <div className={'frame a' + String(s.aspect).replace(':', 'x')} style={{ background: accent ? 'linear-gradient(135deg,' + base + ',' + accent + ')' : base, color: fg }}>
                <span>{s.overlay_text}</span>
              </div>
              <div className="body">
                <p className="head">{s.headline}</p>
                <p className="copy pre">{s.primary_text}</p>
                <div className="foot">
                  <span className="cta-tag">{s.cta}</span>
                  <CopyBtn text={text} label="Copy ad copy" />
                  {s.image_url && <a className="ghost" href={s.image_url} target="_blank" rel="noreferrer">Open image <ExternalLink size={13} /></a>}
                </div>
                <details><summary>Image prompt</summary><p className="small pre muted" style={{ marginTop: 6 }}>{s.image_prompt}</p></details>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

const KIND = { hook: 'Hook', point: 'Point', proof: 'Proof', cta: 'Call to action' };

// Render state for this run's videos (GitHub Actions renders them and uploads the MP4s).
function useRender(jobId) {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    if (!jobId) return;
    try { setSt(await api.getVideos(jobId)); setErr(''); } catch (e) { setErr(e.message); }
  }, [jobId]);
  useEffect(() => { load(); }, [load]);
  const active = st && (st.status === 'queued' || st.status === 'rendering');
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [active, load]);
  return { st, err, reload: load };
}

// Voice choice for the voiceover: the account's ElevenLabs voices (or stock ones), a preview, and a custom id.
const VOICE_KEY = 'ace-voice';
function VoicePicker({ value, onChange }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.getVoices().then(setData).catch(() => setData({ voices: [], source: 'none' })); }, []);
  const voices = (data && data.voices) || [];
  const known = !value || voices.some((v) => v.id === value);
  const cur = voices.find((v) => v.id === value);
  return (
    <div className="voicepick">
      <label className="small muted" htmlFor="voice">Voiceover voice</label>
      <div className="row gap">
        <select id="voice" value={known ? value : '__custom'} onChange={(e) => onChange(e.target.value === '__custom' ? '' : e.target.value)}>
          <option value="">Default voice</option>
          {voices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.note ? ' · ' + v.note : ''}</option>)}
          <option value="__custom">Other (paste a voice id)…</option>
        </select>
        {cur && cur.previewUrl && <audio controls preload="none" src={cur.previewUrl} style={{ height: 32 }} />}
      </div>
      {!known && <input placeholder="ElevenLabs voice id" value={value} onChange={(e) => onChange(e.target.value.trim())} />}
      {data && data.source === 'stock' && <span className="note">Showing stock voices. To list your own voices, give the ElevenLabs key the Voices: Read permission.</span>}
    </div>
  );
}

function RenderPanel({ jobId, render }) {
  const { st, err, reload } = render;
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [startErr, setStartErr] = useState('');
  const [voice, setVoice] = useState(() => { try { return localStorage.getItem(VOICE_KEY) || ''; } catch { return ''; } });
  const pickVoice = (v) => { setVoice(v); try { localStorage.setItem(VOICE_KEY, v); } catch { /* private mode */ } };
  const [driveBusy, setDriveBusy] = useState(false);
  const cmd = 'cd video\nnode render.mjs ' + (jobId || '<run id>');

  const start = async () => {
    setBusy(true); setStartErr(''); setConfirm(false);
    try { await api.renderVideos(jobId, voice); await reload(); } catch (e) { setStartErr(e.message); }
    finally { setBusy(false); }
  };

  const toDrive = async () => {
    setDriveBusy(true); setStartErr('');
    try { await api.saveToDrive(jobId); await reload(); } catch (e) { setStartErr(e.message); }
    finally { setDriveBusy(false); }
  };

  const Local = () => (
    <details style={{ marginTop: 10 }}>
      <summary>Or render on your computer instead</summary>
      <pre className="cmd">{cmd}</pre>
      <div className="row gap"><CopyBtn text={cmd} label="Copy command" /><span className="note">Saved in video/out/{jobId || '<run id>'}/. Needs ELEVENLABS_API_KEY in .env.</span></div>
    </details>
  );

  if (!st && !err) return <div className="renderbox"><span className="muted small"><Loader2 size={14} className="rot" /> Checking video status…</span></div>;
  if (err) return <div className="banner err"><AlertTriangle size={16} />{err}</div>;

  if (!st.configured) {
    return (
      <div className="renderbox">
        <div className="row gap" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          <span className="tile solid"><Clapperboard size={18} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: 'block' }}>Render these 5 videos on your computer</b>
            <span className="muted small">Claude wrote the storyboard below. Run this in the project folder to turn it into MP4s with animated text, brand colors, captions and an ElevenLabs voiceover. Online rendering isn't set up yet (see SETUP.md).</span>
            <pre className="cmd">{cmd}</pre>
            <div className="row gap"><CopyBtn text={cmd} label="Copy command" /><span className="note">Saved in video/out/{jobId || '<run id>'}/</span></div>
          </div>
        </div>
      </div>
    );
  }

  const working = st.status === 'queued' || st.status === 'rendering';
  return (
    <div className={'renderbox' + (st.status === 'failed' ? ' bad' : st.status === 'done' ? ' good' : '')}>
      <div className="row gap" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <span className={'tile ' + (st.status === 'done' ? 'okt' : st.status === 'failed' ? 'badt' : 'solid')}>
          {working ? <Loader2 size={18} className="rot" /> : st.status === 'done' ? <CheckCircle2 size={18} /> : st.status === 'failed' ? <AlertTriangle size={18} /> : <CloudUpload size={18} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {st.status === 'idle' && (<>
            <b style={{ display: 'block' }}>Render these videos online</b>
            <span className="muted small">GitHub renders all 5 videos with an ElevenLabs voiceover and brand-colored captions, in about 5 to 8 minutes. It uses roughly 2,500 ElevenLabs credits. Nothing runs on your computer.</span>
            <VoicePicker value={voice} onChange={pickVoice} />
          </>)}
          {working && (<>
            <b style={{ display: 'block' }}>{st.task === 'drive' ? 'Saving the videos to Google Drive…' : st.status === 'queued' ? 'Starting the render…' : 'Rendering your videos…'}</b>
            <span className="muted small">{st.task === 'drive' ? 'This takes a minute or two.' : 'This takes about 5 to 8 minutes.'} You can leave this page; the videos will be here when it finishes.{st.runUrl ? ' ' : ''}{st.runUrl && <a href={st.runUrl} target="_blank" rel="noreferrer">Watch progress on GitHub <ExternalLink size={12} /></a>}</span>
          </>)}
          {st.status === 'done' && (<>
            <b style={{ display: 'block' }}>{st.videos.length} video{st.videos.length === 1 ? '' : 's'} ready</b>
            <span className="muted small">Play them below or download the MP4s. The links stay valid for an hour, so reload the page for fresh ones.</span>
          </>)}
          {st.status === 'failed' && (<>
            <b style={{ display: 'block' }}>The render didn't finish</b>
            <span className="small">{st.message || 'Something went wrong.'}{st.runUrl && <> <a href={st.runUrl} target="_blank" rel="noreferrer">Open the log <ExternalLink size={12} /></a></>}</span>
          </>)}
          {startErr && <div className="banner err" style={{ marginTop: 10, marginBottom: 0 }}><AlertTriangle size={16} />{startErr}</div>}
          {!working && st.status !== 'idle' && confirm && <VoicePicker value={voice} onChange={pickVoice} />}
          {!working && (
            <div className="row gap" style={{ marginTop: 12 }}>
              {confirm ? (<>
                <button className="btn" onClick={start} disabled={busy}>{busy ? <Loader2 size={14} className="rot" /> : null} Yes, render again (uses credits)</button>
                <button className="ghost" onClick={() => setConfirm(false)}>Cancel</button>
              </>) : (
                <button className={st.status === 'idle' ? 'btn' : 'ghost'} onClick={() => (st.status === 'idle' ? start() : setConfirm(true))} disabled={busy}>
                  {busy ? <Loader2 size={14} className="rot" /> : <Clapperboard size={14} />} {st.status === 'idle' ? 'Render videos online' : st.status === 'failed' ? 'Try again' : 'Render again'}
                </button>
              )}
            </div>
          )}
          {!working && st.videos.length > 0 && st.videos.some((v) => !v.driveUrl) && (
            <div className="row gap" style={{ marginTop: 8 }}>
              <button className="ghost" onClick={toDrive} disabled={driveBusy}>{driveBusy ? <Loader2 size={14} className="rot" /> : <CloudUpload size={14} />} Save to Google Drive</button>
              <span className="note">Copies the finished videos to Drive. No credits used.</span>
            </div>
          )}
          {!working && <Local />}
        </div>
      </div>
    </div>
  );
}

function Videos({ pack, jobId }) {
  const videos = pack.videos || [];
  const hasBoards = videos.some((v) => (v.scenes || []).length);
  const render = useRender(hasBoards ? jobId : null);
  const files = (render.st && render.st.videos) || [];
  return (
    <>
      {hasBoards && <RenderPanel jobId={jobId} render={render} />}
      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
        {videos.map((v, i) => {
          const file = files.find((f) => f.n === (v.id || i + 1));
          return (
            <article key={v.id} className="vid">
              <div className="row between"><span className="tag" style={{ margin: 0 }}>{v.format}</span>
                <span className={'pill small ' + (file || v.video_url ? 'ok' : '')}>{file || v.video_url ? 'Rendered' : /failed|timed out/.test(v.video_status || '') ? v.video_status : (v.scenes || []).length ? 'Storyboard ready' : v.video_status}</span></div>
              <h2 style={{ fontSize: 16 }}>{v.title}</h2>
              {file && (
                <div className="player">
                  <video src={file.url} controls playsInline preload="metadata" />
                  <div className="row gap">
                    <a className="ghost" href={file.downloadUrl}><Download size={13} /> Download MP4</a>
                    {file.driveUrl && <a className="ghost" href={file.driveUrl} target="_blank" rel="noreferrer"><FolderOpen size={13} /> Open in Drive</a>}
                  </div>
                  {file.driveError && !file.driveUrl && <span className="note" title={file.driveError}>Drive copy failed</span>}
                </div>
              )}
              {(v.scenes || []).length ? (
                <ol className="storyboard">
                  {v.scenes.map((s, k) => (
                    <li key={k}>
                      <span className="sb-n">{k + 1}</span>
                      <div><b>{s.headline}</b><span className="sb-kind">{KIND[s.kind] || s.kind}{s.sub ? ' · ' + s.sub : ''}</span><em>{s.vo}</em></div>
                    </li>
                  ))}
                </ol>
              ) : <div className="script">{v.spoken_script}</div>}
              <div className="row gap"><CopyBtn text={v.spoken_script} label="Copy voiceover script" />{v.primary_text && <CopyBtn text={v.primary_text} label="Copy ad caption" />}{v.video_url && <a className="ghost" href={v.video_url} target="_blank" rel="noreferrer">Open video <ExternalLink size={13} /></a>}</div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function Brief({ pack }) {
  const b = pack.brief || {};
  return (
    <div className="grid2">
      <div>
        <h3>Brand brief</h3>
        <dl className="kv">
          <dt>What they do</dt><dd>{b.one_liner}</dd>
          <dt>Offer</dt><dd>{b.offer || 'Not stated'}</dd>
          <dt>Audience</dt><dd>{(b.audience || []).join('; ')}</dd>
          <dt>Proof on site</dt><dd>{(b.proof || []).join('; ') || 'None found'}</dd>
          <dt>Tone</dt><dd>{b.tone}</dd>
          <dt>Colors</dt><dd>{(b.brand_colors || []).length ? <span className="swatches">{b.brand_colors.map((c) => <span key={c} className="sw" style={{ background: c }}><i>{c}</i></span>)}</span> : 'None detected'}</dd>
        </dl>
      </div>
      <div>
        <h3>Verify with the client before running ads</h3>
        <List items={b.claims_to_verify} />
        <h3>Pain points we wrote to</h3>
        <List items={b.pain_points} />
      </div>
    </div>
  );
}

function Competitors({ pack }) {
  const c = pack.competitors || {};
  return (
    <>
      <div className={'banner ' + (c.source === 'inferred' ? 'warn' : 'ok')}><strong>Source: {c.source}.</strong> {c.caveat}</div>
      <div className="grid2">
        <div><h3>Angles competitors use</h3><List items={(c.top_angles || []).map((a) => a.angle + ': ' + a.how_competitors_use_it)} /><h3>Common offers</h3><List items={c.common_offers} /></div>
        <div><h3>Saturated</h3><List items={c.saturated} /><h3>White space (opportunity)</h3><List items={c.white_space} /></div>
      </div>
    </>
  );
}

function Report({ pack }) {
  return (
    <>
      <div className="row gap">
        <CopyBtn text={pack.report_markdown} label="Copy report" />
        <button type="button" className="ghost" onClick={() => download((pack.business || 'ad-pack').replace(/\W+/g, '-').toLowerCase() + '.md', pack.report_markdown, 'text/markdown')}>Download .md</button>
        <button type="button" className="ghost" onClick={() => download('ad-pack.json', JSON.stringify(pack, null, 2), 'application/json')}><Download size={13} /> Download .json</button>
      </div>
      <pre className="report">{pack.report_markdown}</pre>
    </>
  );
}

export default function Results({ pack, jobId }) {
  const [tab, setTab] = useState('Hooks');
  const st = pack.stats || {};
  const Body = { Hooks, 'Static ads': Statics, Videos, Brief, Competitors, Report }[tab];
  const counts = useMemo(() => ({ Hooks: (pack.hooks || []).length, 'Static ads': (pack.statics || []).length, Videos: (pack.videos || []).length }), [pack]);
  return (
    <>
      <div className="summary">
        <div className="stat"><span className="tile"><Lightbulb size={18} /></span><div><b>{counts.Hooks}</b><span>hooks</span></div></div>
        <div className="stat"><span className="tile"><ImageIcon size={18} /></span><div><b>{st.statics_rendered || 0}<small style={{ fontSize: 15, color: 'var(--muted)' }}> / {st.statics_total || 0}</small></b><span>static ads rendered</span></div></div>
        <div className="stat"><span className="tile"><Video size={18} /></span><div><b>{st.videos_rendered || 0}<small style={{ fontSize: 15, color: 'var(--muted)' }}> / {st.videos_total || 0}</small></b><span>videos rendered</span></div></div>
      </div>

      {pack.report_drive_url && (
        <div className="cta-card">
          <div className="row gap" style={{ flexWrap: "nowrap" }}><span className="tile solid"><FolderOpen size={18} /></span><div><b>Ad pack saved to Google Drive</b><span>Send this link to Rehan for live testing.</span></div></div>
          <div className="row gap"><a className="btn" href={pack.report_drive_url} target="_blank" rel="noreferrer">Open report <ExternalLink size={15} /></a><CopyBtn text={pack.report_drive_url} label="Copy link" /></div>
        </div>
      )}
      {pack.report_drive_status && pack.report_drive_status !== 'ok' && <div className="banner warn"><AlertTriangle size={16} />Report was not saved to Drive: {pack.report_drive_status}</div>}

      <section className="card">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={'tab' + (tab === t ? ' on' : '')} onClick={() => setTab(t)}>
              {React.createElement(TAB_ICON[t], { size: 15 })}{t}{counts[t] !== undefined && <span className="n">{counts[t]}</span>}
            </button>
          ))}
        </div>
        <Body pack={pack} jobId={jobId} />
      </section>
    </>
  );
}
