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

const driveId = (u) => { const m = /\/d\/([A-Za-z0-9_-]+)/.exec(u || ''); return m ? m[1] : null; };
const isRendering = (s) => /^rendering:/.test((s && s.image_status) || '');
const isFailed = (s) => /^failed/.test((s && s.image_status) || '');

// One ad, laid out like the real thing: page header, caption, picture, headline and button.
function StaticCard({ s, brand, busy, onMake, canMake }) {
  const [more, setMore] = useState(false);
  const [thumbBad, setThumbBad] = useState(false);
  const id = driveId(s.image_url);
  const showImg = !!id && !thumbBad;
  const tall = s.aspect === '9:16';
  const text = [s.headline, '', s.primary_text, '', 'CTA: ' + s.cta, ...((s.hashtags || []).length ? ['', s.hashtags.join(' ')] : [])].join('\n');
  const state = busy ? 'making' : s.image_url ? 'done' : isFailed(s) ? 'failed' : 'concept';
  return (
    <article className="ad">
      <div className="ad-top">
        <span className="ad-av" style={{ background: brand.base, color: brand.fg }}>{(brand.name || '?').trim().charAt(0).toUpperCase()}</span>
        <div className="ad-who"><b>{brand.name}</b><span>Sponsored · #{s.id} · {s.aspect} · {s.style}</span></div>
      </div>
      <div className="ad-cap">
        <p className={'pre' + (more ? '' : ' clamp3')}>{s.primary_text}</p>
        {String(s.primary_text || '').length > 130 && <button type="button" className="linkbtn" onClick={() => setMore(!more)}>{more ? 'Show less' : 'Show more'}</button>}
      </div>
      <div className={'ad-media ' + (tall ? 'tall' : 'sq')}>
        {showImg ? (
          <img src={'https://drive.google.com/thumbnail?id=' + id + '&sz=w800'} alt={s.overlay_text} loading="lazy" referrerPolicy="no-referrer" onError={() => setThumbBad(true)} />
        ) : (
          <div className="ad-concept" style={{ background: brand.accent ? 'linear-gradient(135deg,' + brand.base + ',' + brand.accent + ')' : brand.base, color: brand.fg }}>
            <span>{s.overlay_text}</span>
          </div>
        )}
        <span className={'ad-badge ' + state}>
          {state === 'making' ? <><Loader2 size={12} className="rot" /> Making image…</> : state === 'done' ? 'Image ready' : state === 'failed' ? 'Failed' : 'Concept preview'}
        </span>
      </div>
      <div className="ad-cta">
        <div><b>{s.headline}</b>{s.description ? <span>{s.description}</span> : null}</div>
        <span className="cta-tag">{s.cta}</span>
      </div>
      {isFailed(s) && !busy && <p className="note bad" style={{ padding: '0 14px' }}>{s.image_status}</p>}
      <Tags list={s.hashtags} />
      <div className="ad-actions">
        {canMake && (
          <button type="button" className={s.image_url ? 'ghost' : 'btn sm'} disabled={busy} onClick={() => onMake(s)} title="Makes this one image with OpenAI (about 4 cents at medium quality) and saves it to Drive">
            {busy ? <><Loader2 size={13} className="rot" /> Making…</> : <><ImageIcon size={13} /> {s.image_url ? 'Make again' : 'Generate image'}</>}
          </button>
        )}
        {s.image_url && <a className="ghost" href={s.image_url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open in Drive</a>}
        <CopyBtn text={text} label="Copy ad" />
      </div>
      <details className="ad-more"><summary>Image prompt</summary><p className="small pre muted">{s.image_prompt}</p></details>
    </article>
  );
}

function Statics({ pack, jobId, onChanged }) {
  const [fmt, setFmt] = useState('all');
  const [view, setView] = useState('all'); // all | done | concept | failed
  const [startErr, setStartErr] = useState('');
  const [starting, setStarting] = useState(() => new Set());
  const [bulk, setBulk] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const all = pack.statics || [];
  const rendering = all.some(isRendering);
  // While images are being made, ask for the run again every few seconds so finished ones appear.
  useEffect(() => {
    if (!rendering || !onChanged) return undefined;
    const t = setInterval(onChanged, 5000);
    return () => clearInterval(t);
  }, [rendering, onChanged]);

  const startOne = async (s) => {
    setStarting((p) => new Set(p).add(s.id));
    try { await api.renderStatic(jobId, s.id); } finally { setStarting((p) => { const n = new Set(p); n.delete(s.id); return n; }); }
  };
  const makeImage = async (s) => {
    setStartErr('');
    try { await startOne(s); if (onChanged) await onChanged(); } catch (e) { setStartErr(e.message); }
  };
  const missing = all.filter((s) => !s.image_url && !isRendering(s) && String(s.image_prompt || '').trim());
  const makeAllMissing = async () => {
    setBulk(true); setConfirmBulk(false); setStartErr('');
    let failed = 0; let lastErr = '';
    for (const s of missing) {
      try { await startOne(s); } catch (e) { failed += 1; lastErr = e.message; if (/not set up/.test(e.message)) break; }
      await new Promise((r) => setTimeout(r, 1500)); // stagger the requests so OpenAI's rate limit is not hit
    }
    if (failed) setStartErr(failed + ' image' + (failed === 1 ? '' : 's') + ' could not be started: ' + lastErr);
    if (onChanged) await onChanged();
    setBulk(false);
  };

  const colors = ((pack.brief && pack.brief.brand_colors) || []).filter(hexOk);
  const base = colors[0] || '#4338ca';
  const brand = { base, accent: colors[1] || null, fg: luminance(base) > 0.5 ? '#14110f' : '#ffffff', name: (pack.brief && pack.brief.business_name) || pack.business || 'Your brand' };
  const kind = (s) => (s.image_url ? 'done' : isFailed(s) ? 'failed' : 'concept');
  const list = all.filter((s) => (fmt === 'all' || s.aspect === fmt) && (view === 'all' || kind(s) === view));
  const count = (a) => all.filter((s) => s.aspect === a).length;
  const doneN = all.filter((s) => s.image_url).length;
  const canMake = !!(jobId && onChanged);
  return (
    <>
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="seg" role="group" aria-label="Filter by format">
          {[['all', 'All ' + all.length, LayoutGrid], ['1:1', 'Feed · ' + count('1:1'), Square], ['9:16', 'Stories · ' + count('9:16'), Smartphone]].map(([k, l, Ic]) => (
            <button key={k} className={fmt === k ? 'on' : ''} onClick={() => setFmt(k)}><Ic size={13} /> {l}</button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Filter by image status">
          {[['all', 'Any status'], ['done', 'Images · ' + doneN], ['concept', 'Concepts · ' + all.filter((s) => kind(s) === 'concept').length], ['failed', 'Failed · ' + all.filter((s) => kind(s) === 'failed').length]].map(([k, l]) => (
            <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        {canMake && missing.length > 0 && (confirmBulk ? (
          <span className="row gap">
            <button className="btn sm" onClick={makeAllMissing} disabled={bulk}>Yes, make {missing.length} images (about ${(missing.length * 0.04).toFixed(2)})</button>
            <button className="ghost" onClick={() => setConfirmBulk(false)}>Cancel</button>
          </span>
        ) : (
          <button className="ghost" onClick={() => setConfirmBulk(true)} disabled={bulk || rendering}>
            {bulk ? <><Loader2 size={13} className="rot" /> Starting…</> : <><ImageIcon size={13} /> Generate {missing.length} missing image{missing.length === 1 ? '' : 's'}</>}
          </button>
        ))}
      </div>
      <p className="note" style={{ margin: '0 0 12px' }}>{doneN} of {all.length} images made. Concept previews show the overlay text in your brand color; made images are saved in your Google Drive folder.</p>
      {startErr && <div className="banner err"><AlertTriangle size={16} />{startErr}</div>}
      {list.length === 0 && <p className="muted" style={{ padding: '24px 0' }}>No ads match these filters.</p>}
      <div className="cards ads">
        {list.map((s) => (
          <StaticCard key={s.id} s={s} brand={brand} canMake={canMake} onMake={makeImage} busy={isRendering(s) || starting.has(s.id)} />
        ))}
      </div>
    </>
  );
}

// Post tags: chips plus one button that copies them all.
function Tags({ list }) {
  if (!list || !list.length) return null;
  return (
    <div className="tags">
      {list.map((t) => <span key={t} className="tagchip">{t}</span>)}
      <CopyBtn text={list.join(' ')} label="Copy tags" />
    </div>
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
  const [custom, setCustom] = useState(false); // "Other" chosen (or a saved id that is not in the list)
  const known = !custom && (!value || voices.some((v) => v.id === value) || !data);
  const cur = voices.find((v) => v.id === value);
  return (
    <div className="voicepick">
      <label className="small muted" htmlFor="voice">Voiceover voice</label>
      <div className="row gap">
        <select id="voice" value={known ? value : '__custom'} onChange={(e) => { const c = e.target.value === '__custom'; setCustom(c); onChange(c ? '' : e.target.value); }}>
          <option value="">Default voice</option>
          {voices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.note ? ' · ' + v.note : ''}</option>)}
          <option value="__custom">Other (paste a voice id)…</option>
        </select>
        {cur && cur.previewUrl && <audio controls preload="none" src={cur.previewUrl} style={{ height: 32 }} />}
      </div>
      {!known && <input autoFocus placeholder="Paste the ElevenLabs voice id" value={value} onChange={(e) => onChange(e.target.value.trim())} />}
      {!known && value && !/^[A-Za-z0-9]{12,40}$/.test(value) && <span className="note">That doesn't look like a voice id (letters and digits only, about 20 characters).</span>}
      {data && data.source === 'stock' && <span className="note">Showing stock voices. To list your own voices, give the ElevenLabs key the Voices: Read permission.</span>}
    </div>
  );
}

function RenderPanel({ jobId, render, ids, selected }) {
  const n = selected.length;
  const all = n === ids.length;
  const what = all ? 'all ' + ids.length + ' videos' : n + ' of ' + ids.length + ' videos';
  const credits = (n * 500).toLocaleString('en-US');
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
    try { await api.renderVideos(jobId, voice, all ? [] : selected); await reload(); } catch (e) { setStartErr(e.message); }
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
            <span className="muted small">GitHub renders {what} with an ElevenLabs voiceover and brand-colored captions, in about 5 to 8 minutes. It uses roughly {credits} ElevenLabs credits. Nothing runs on your computer. {ids.length > 1 ? 'Tick the videos you want on the cards below.' : ''}</span>
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
                <button className="btn" onClick={start} disabled={busy || n === 0}>{busy ? <Loader2 size={14} className="rot" /> : null} Yes, render {what} again (about {credits} credits)</button>
                <button className="ghost" onClick={() => setConfirm(false)}>Cancel</button>
              </>) : (
                <button className={st.status === 'idle' ? 'btn' : 'ghost'} onClick={() => (st.status === 'idle' ? start() : setConfirm(true))} disabled={busy || n === 0}>
                  {busy ? <Loader2 size={14} className="rot" /> : <Clapperboard size={14} />} {st.status === 'idle' ? (all ? 'Render videos online' : 'Render ' + n + ' selected') : st.status === 'failed' ? 'Try again' : (all ? 'Render again' : 'Render ' + n + ' selected again')}
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
  const ids = videos.map((v, i) => ({ id: v.id || i + 1, ok: (v.scenes || []).length > 0 })).filter((x) => x.ok).map((x) => x.id);
  const [sel, setSel] = useState(null); // null = every video
  const selected = sel ? ids.filter((i) => sel.includes(i)) : ids;
  const toggle = (id) => setSel(selected.includes(id) ? selected.filter((i) => i !== id) : [...selected, id]);
  const busyNow = !!(render.st && (render.st.status === 'queued' || render.st.status === 'rendering'));
  const [oneBusy, setOneBusy] = useState(null);
  const [oneErr, setOneErr] = useState('');
  // Render just one video (about 500 ElevenLabs credits), with the voice chosen in the panel above.
  // The card asks for the voice every time (prefilled with the last one used), then renders after an explicit confirm.
  const [oneOpen, setOneOpen] = useState(null);
  const [oneVoice, setOneVoice] = useState('');
  const openOne = (n) => {
    let v = '';
    try { v = localStorage.getItem(VOICE_KEY) || ''; } catch { /* private mode */ }
    setOneVoice(v); setOneOpen(n);
  };
  const renderOne = async (n) => {
    setOneBusy(n); setOneErr('');
    try { localStorage.setItem(VOICE_KEY, oneVoice); } catch { /* private mode */ }
    try { await api.renderVideos(jobId, oneVoice, [n]); setOneOpen(null); await render.reload(); } catch (e) { setOneErr(e.message); }
    finally { setOneBusy(null); }
  };
  const files = (render.st && render.st.videos) || [];
  return (
    <>
      {hasBoards && <RenderPanel jobId={jobId} render={render} ids={ids} selected={selected} />}
      {oneErr && <div className="banner err"><AlertTriangle size={16} />{oneErr}</div>}
      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
        {videos.map((v, i) => {
          const file = files.find((f) => f.n === (v.id || i + 1));
          return (
            <article key={v.id} className="vid">
              <div className="row between"><span className="tag" style={{ margin: 0 }}>{v.format}</span>
                {hasBoards && ids.includes(v.id || i + 1) && ids.length > 1 && render.st && render.st.configured && (
                  <label className="pickvid"><input type="checkbox" checked={selected.includes(v.id || i + 1)} disabled={busyNow} onChange={() => toggle(v.id || i + 1)} /> Render</label>
                )}
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
              <Tags list={v.hashtags} />
              {oneOpen === (v.id || i + 1) && (
                <div className="onebox">
                  <b className="small">Render video {v.id || i + 1} only</b>
                  <VoicePicker value={oneVoice} onChange={setOneVoice} />
                  <div className="row gap" style={{ marginTop: 10 }}>
                    <button type="button" className="btn" onClick={() => renderOne(v.id || i + 1)} disabled={oneBusy !== null}>
                      {oneBusy !== null ? <Loader2 size={14} className="rot" /> : <Clapperboard size={14} />} Render now (about 500 credits)
                    </button>
                    <button type="button" className="ghost" onClick={() => setOneOpen(null)} disabled={oneBusy !== null}>Cancel</button>
                  </div>
                </div>
              )}
              <div className="row gap">{hasBoards && ids.includes(v.id || i + 1) && render.st && render.st.configured && (
                <button type="button" className="ghost" disabled={busyNow || oneBusy !== null} onClick={() => openOne(v.id || i + 1)} title="Renders only this video (about 500 ElevenLabs credits); you choose the voice first">
                  {busyNow && (render.st.only || []).includes(v.id || i + 1) ? <><Loader2 size={13} className="rot" /> Rendering…</> : <><Clapperboard size={13} /> {file ? 'Render this video again' : 'Render this video'}</>}
                </button>
              )}<CopyBtn text={v.spoken_script} label="Copy voiceover script" />{v.primary_text && <CopyBtn text={[v.primary_text, ...((v.hashtags || []).length ? ['', v.hashtags.join(' ')] : [])].join(String.fromCharCode(10))} label="Copy ad caption" />}{v.video_url && <a className="ghost" href={v.video_url} target="_blank" rel="noreferrer">Open video <ExternalLink size={13} /></a>}</div>
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

export default function Results({ pack, jobId, onChanged }) {
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
        <Body pack={pack} jobId={jobId} onChanged={onChanged} />
      </section>
    </>
  );
}
