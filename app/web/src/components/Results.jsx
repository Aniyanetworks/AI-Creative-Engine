import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { MoreBar, RewriteBox, TagButton } from './WriteTools.jsx';
import ImageSettings, { QUALITIES } from './ImageSettings.jsx';
import RunUsageTab from './RunUsageTab.jsx';
import PostDialog from './PostDialog.jsx';
import VideoPostDialog from './VideoPostDialog.jsx';
import Hint from './Hint.jsx';
import CompetitorsTab from './CompetitorsTab.jsx';
import ReportTab from './ReportTab.jsx';
import BriefTab from './BriefTab.jsx';
import { useModels, loadChoice, saveChoice } from '../models.js';
import { Send, Wallet, Facebook, Instagram, Youtube, Music2, Lightbulb, Image as ImageIcon, Video, FileText, Swords, ClipboardList, Copy, Check, ExternalLink, Download, FolderOpen, AlertTriangle, LayoutGrid, Smartphone, Square, Clapperboard, Loader2, CheckCircle2, CloudUpload } from 'lucide-react';

const TABS = ['Hooks', 'Static ads', 'Videos', 'Brief', 'Competitors', 'Report', 'Usage'];
const TAB_ICON = { Hooks: Lightbulb, 'Static ads': ImageIcon, Videos: Video, Brief: FileText, Competitors: Swords, Report: ClipboardList, Usage: Wallet };

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

// "Authority (white space: engineer-led credibility)" -> the angle ("Authority") and its detail
const angleOf = (h) => {
  const t = String(h.angle || 'Other').trim();
  const m = /^([^(:]+?)\s*[(:]\s*(.*?)\)?$/.exec(t);
  const main = (m ? m[1] : t).trim();
  return { main: main.charAt(0).toUpperCase() + main.slice(1), detail: m ? m[2].replace(/\)$/, '').trim() : '' };
};

function Hooks({ pack, jobId, onChanged }) {
  const hooks = pack.hooks || [];
  const [angle, setAngle] = useState('all');
  const counts = {};
  for (const h of hooks) { const k = angleOf(h).main; counts[k] = (counts[k] || 0) + 1; }
  const angles = Object.keys(counts);
  const shown = hooks.filter((h) => angle === 'all' || angleOf(h).main === angle);
  const all = shown.map((h) => h.id + '. ' + h.hook).join('\n');
  return (
    <>
      <div className="hookbar">
        <div className="hookinfo">
          <b>{hooks.length} hooks</b><span className="muted small">across {angles.length} angle{angles.length === 1 ? '' : 's'}</span>
        </div>
        <div className="hookacts">
          <MoreBar kind="hooks" pack={pack} jobId={jobId} onChanged={onChanged} />
          <CopyBtn text={all} label={angle === 'all' ? 'Copy all hooks' : 'Copy these ' + shown.length} />
        </div>
        {angles.length > 1 && (
          <div className="angles-filter" role="group" aria-label="Filter by angle">
            <button type="button" className={'achip' + (angle === 'all' ? ' on' : '')} onClick={() => setAngle('all')}>All <i>{hooks.length}</i></button>
            {angles.map((k) => <button key={k} type="button" className={'achip' + (angle === k ? ' on' : '')} onClick={() => setAngle(k)}>{k} <i>{counts[k]}</i></button>)}
          </div>
        )}
      </div>
      <div className="hooklist">
        {shown.map((h) => {
          const an = angleOf(h);
          return (
            <article key={h.id} className="hook">
              <span className="num">{h.id}</span>
              <div className="hookbody">
                <div className="hookmeta"><span className="tag">{an.main}</span>{an.detail && <span className="muted small">{an.detail}</span>}{h.rewritten && <span className="tag alt">rewritten</span>}</div>
                <q>{h.hook}</q>
                {h.why_it_works && <p className="why"><b>Why it works</b> {h.why_it_works}</p>}
                {h.offer_framing && <p className="why"><b>Then</b> {h.offer_framing}</p>}
              </div>
              <div className="acts"><CopyBtn text={h.hook} /><RewriteBox kind="hooks" item={h} pack={pack} jobId={jobId} onChanged={onChanged} compact /></div>
            </article>
          );
        })}
      </div>
    </>
  );
}

const driveId = (u) => { const m = /\/d\/([A-Za-z0-9_-]+)/.exec(u || ''); return m ? m[1] : null; };
const isRendering = (s) => /^rendering:/.test((s && s.image_status) || '');
const isFailed = (s) => /^failed/.test((s && s.image_status) || '');

// One ad, laid out like the real thing: page header, caption, picture, headline and button.
function StaticCard({ s, brand, pack, onChanged, jobId, busy, onMake, canMake, imgSettings, selected, onSelect, first }) {
  const [more, setMore] = useState(false);
  const [refine, setRefine] = useState(false);
  const [note, setNote] = useState('');
  const [thumbBad, setThumbBad] = useState(false);
  const id = driveId(s.image_url);
  // Drive files are private: ask the app (through n8n) for a picture link the browser can show. A just-made image can need a few
  // seconds before Drive has a thumbnail, so ask again a few times.
  const [src, setSrc] = useState(null);
  const [noHook, setNoHook] = useState(false);
  useEffect(() => {
    setSrc(null); setThumbBad(false); setNoHook(false);
    if (!id || !jobId) return undefined;
    let stop = false; let tries = 0; let timer;
    const ask = async () => {
      try {
        const r = await api.getPreview(jobId, s.id);
        if (stop) return;
        if (r.ready && r.url) { setSrc(r.url); return; }
        if (r.reason === 'not-configured') { setNoHook(true); setSrc('https://drive.google.com/thumbnail?id=' + id + '&sz=w800'); return; }
      } catch { /* try the fallback below */ }
      tries += 1;
      if (tries < 6 && !stop) timer = setTimeout(ask, 3500);
      else if (!stop) setSrc('https://drive.google.com/thumbnail?id=' + id + '&sz=w800'); // last resort: works if this browser is signed in to Drive
    };
    ask();
    return () => { stop = true; clearTimeout(timer); };
  }, [id, jobId, s.id]);
  const showImg = !!id && !!src && !thumbBad;
  const tall = s.aspect === '9:16';
  const text = [s.headline, '', s.primary_text, '', 'CTA: ' + s.cta, ...((s.hashtags || []).length ? ['', s.hashtags.join(' ')] : [])].join('\n');
  const state = busy ? 'making' : s.image_url ? 'done' : isFailed(s) ? 'failed' : 'concept';
  return (
    <article className={'ad' + (selected ? ' picked' : '')}>
      <div className="ad-top">
        <span className="ad-av" style={{ background: brand.base, color: brand.fg }}>{(brand.name || '?').trim().charAt(0).toUpperCase()}</span>
        <div className="ad-who"><b>{brand.name}</b><span>Sponsored · #{s.id} · {s.aspect} · {s.style}</span></div>
        
        {onSelect && <label className="pick" title="Select this ad to post it"><input type="checkbox" checked={!!selected} onChange={() => onSelect(s.id)} aria-label={'Select ad ' + s.id} /></label>}
      </div>
      <PlatformBadges aspect={s.aspect} hint={first} />
      <PostedChips posts={(pack.posts || {})[s.id]} />
      <div className="ad-cap">
        <p className={'pre' + (more ? '' : ' clamp3')}>{s.primary_text}</p>
        {String(s.primary_text || '').length > 130 && <button type="button" className="linkbtn" onClick={() => setMore(!more)}>{more ? 'Show less' : 'Show more'}</button>}
      </div>
      <div className={'ad-media ' + (tall ? 'tall' : 'sq')}>
        {id && !src && !thumbBad ? (
          <div className="ad-concept" style={{ background: 'var(--soft)', color: 'var(--muted)' }}><span className="row gap" style={{ fontSize: 14, fontWeight: 600 }}><Loader2 size={16} className="rot" /> Loading preview…</span></div>
        ) : showImg ? (
          <img key={src} className={busy ? 'stale' : ''} src={src} alt={s.overlay_text} loading="lazy" referrerPolicy="no-referrer" onError={() => setThumbBad(true)} />
        ) : (
          <div className="ad-concept" style={{ background: brand.accent ? 'linear-gradient(135deg,' + brand.base + ',' + brand.accent + ')' : brand.base, color: brand.fg }}>
            <span>{s.overlay_text}</span>
          </div>
        )}
        {busy && s.image_url && <div className="ad-making"><Loader2 size={18} className="rot" /><span>Making a new image… the old one is shown until it is ready</span></div>}
        <span className={'ad-badge ' + state}>
          {state === 'making' ? <><Loader2 size={12} className="rot" /> Making image…</> : state === 'done' ? 'Image ready' : state === 'failed' ? 'Failed' : 'Concept preview'}
        </span>
      </div>
      {s.image_stale && <p className="note" style={{ padding: '6px 14px 0', margin: 0 }}>The concept was rewritten: this picture shows the old version. Use Make again to match.</p>}
      <div className="ad-cta">
        <div><b>{s.headline}</b>{s.description ? <span>{s.description}</span> : null}</div>
        <span className="cta-tag">{s.cta}</span>
      </div>
      {noHook && thumbBad && <p className="note" style={{ padding: '6px 14px 0', margin: 0 }}>Preview is not set up on this server (N8N_PREVIEW_WEBHOOK_URL). The image is in Drive: use Open in Drive.</p>}
      {isFailed(s) && !busy && <p className="note bad" style={{ padding: '0 14px' }}>{s.image_status}</p>}
      <Tags list={s.hashtags} />
      {!(s.hashtags || []).length && jobId && onChanged && <div className="tagrow"><TagButton kind="statics" pack={pack} jobId={jobId} onChanged={onChanged} ids={[s.id]} label="Add hashtags" compact /></div>}
      <div className="ad-actions">
        {canMake && (
          <button type="button" className={'wide ' + (s.image_url ? 'ghost' : 'btn')} disabled={busy} onClick={() => (s.image_url ? setRefine(true) : onMake(s))} title="Makes this one image with OpenAI (about 4 cents at medium quality) and saves it to Drive">
            {busy ? <><Loader2 size={13} className="rot" /> Making…</> : <><ImageIcon size={13} /> {s.image_url ? 'Make again' : 'Generate image'}</>}
          </button>
        )}
        <div className="ad-tools">
          <CopyBtn text={text} label="Copy ad" />
          <RewriteBox kind="statics" item={s} pack={pack} jobId={jobId} onChanged={onChanged} compact />
          {canMake && imgSettings && <ImageSettings inline {...imgSettings} />}
          {s.image_url && <a className="ghost" href={s.image_url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open in Drive</a>}
        </div>
      </div>
      {refine && (
        <div className="refine">
          <label className="small muted" htmlFor={'note' + s.id}>What should be different? (optional)</label>
          <textarea id={'note' + s.id} rows={2} maxLength={300} placeholder="e.g. less crowded, a real photo of a technician, bigger headline, darker background" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="row gap">
            <button type="button" className="btn sm" disabled={busy} onClick={() => { onMake(s, note); setRefine(false); setNote(''); }}><ImageIcon size={13} /> Make again</button>
            <button type="button" className="ghost" onClick={() => setRefine(false)}>Cancel</button>
          </div>
        </div>
      )}
      <details className="ad-more"><summary>Image prompt</summary><p className="small pre muted">{s.image_prompt}</p></details>
    </article>
  );
}

function Statics({ pack, jobId, onChanged, goAccount, defaultLink }) {
  const [fmt, setFmt] = useState('all');
  const [sel, setSel] = useState(() => new Set());
  const [posting, setPosting] = useState(false);
  const toggleSel = (id) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
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

  const [quality, setQuality] = useState(() => { try { return localStorage.getItem('ace-img-quality') || 'high'; } catch { return 'high'; } });
  const pickQuality = (q) => { setQuality(q); try { localStorage.setItem('ace-img-quality', q); } catch { /* private mode */ } };
  const models = useModels();
  const [imgModel, setImgModel] = useState(() => loadChoice('ace-img-model'));
  const pickModel = (m) => { setImgModel(m); saveChoice('ace-img-model', m === (models && models.defaults.image) ? '' : m); };
  const each = (QUALITIES.find((x) => x.id === quality) || QUALITIES[1]).cost * (/mini/i.test(imgModel) ? 0.35 : 1); // rough OpenAI cost per image
  const startOne = async (s, note) => {
    setStarting((p) => new Set(p).add(s.id));
    try { await api.renderStatic(jobId, s.id, { quality, model: imgModel || undefined, note: note || '' }); } finally { setStarting((p) => { const n = new Set(p); n.delete(s.id); return n; }); }
  };
  const makeImage = async (s, note) => {
    setStartErr('');
    try { await startOne(s, note); if (onChanged) await onChanged(); } catch (e) { setStartErr(e.message); }
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

  const colors = (pack.brand_colors_override && pack.brand_colors_override.length ? pack.brand_colors_override : ((pack.brief && pack.brief.brand_colors) || [])).filter(hexOk);
  const base = colors[0] || '#4338ca';
  const brand = { base, accent: colors[1] || null, fg: luminance(base) > 0.5 ? '#14110f' : '#ffffff', name: (pack.brief && pack.brief.business_name) || pack.business || 'Your brand' };
  const kind = (s) => (s.image_url ? 'done' : isFailed(s) ? 'failed' : 'concept');
  const list = all.filter((s) => (fmt === 'all' || s.aspect === fmt) && (view === 'all' || kind(s) === view));
  const count = (a) => all.filter((s) => s.aspect === a).length;
  const doneN = all.filter((s) => s.image_url).length;
  const canMake = !!(jobId && onChanged);
  const withImg = all.filter((x) => x.image_url);
  const chosen = all.filter((x) => sel.has(x.id));
  return (
    <>
      <div className="stoolbar">
        <div className="filters">
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
        </div>
        <div className="makepanel">
          <div className="mp-progress" title="Concept previews show the overlay text in your brand color; made images are saved in your Google Drive folder.">
            <div className="mp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={all.length} aria-valuenow={doneN}><i style={{ width: (all.length ? Math.round((doneN / all.length) * 100) : 0) + '%' }} /></div>
            <span><b>{doneN}</b> of {all.length} images made</span>          </div>
          {canMake && (
            <div className="mp-actions">
              <ImageSettings quality={quality} onQuality={pickQuality} model={imgModel} onModel={pickModel} models={models} />
              {missing.length > 0 && (confirmBulk ? (
                <>
                  <button className="btn sm" onClick={makeAllMissing} disabled={bulk}>Make {missing.length} images · about ${(missing.length * each).toFixed(2)}</button>
                  <button className="ghost" onClick={() => setConfirmBulk(false)}>Cancel</button>
                </>
              ) : (
                <button className="btn sm" onClick={() => setConfirmBulk(true)} disabled={bulk || rendering}>
                  {bulk ? <><Loader2 size={13} className="rot" /> Starting…</> : <><ImageIcon size={13} /> Generate {missing.length} missing</>}
                </button>
              ))}
              
              
              {withImg.length > 0 && <button type="button" className="ghost" onClick={() => setSel(sel.size ? new Set() : new Set(withImg.map((x) => x.id)))}>{sel.size ? 'Clear selection' : 'Select ' + withImg.length + ' with images'}</button>}
              {canMake && withImg.length > 0 && <button type="button" className="ghost" onClick={() => { if (!sel.size) setSel(new Set(withImg.map((x) => x.id))); setPosting(true); }} title="Post to Facebook, Instagram or Meta ads"><Send size={13} /> Post…</button>}
              <TagButton kind="statics" pack={pack} jobId={jobId} onChanged={onChanged} compact />
              
              <MoreBar kind="statics" pack={pack} jobId={jobId} onChanged={onChanged} />
            </div>
          )}
        </div>
      </div>
      {startErr && <div className="banner err"><AlertTriangle size={16} />{startErr}</div>}
      {list.length === 0 && <p className="muted" style={{ padding: '24px 0' }}>No ads match these filters.</p>}
      <div className="cards ads">
        {list.map((s, i) => (
          <StaticCard first={i === 0} key={s.id} s={s} selected={sel.has(s.id)} onSelect={canMake ? toggleSel : null} brand={brand} imgSettings={{ quality, onQuality: pickQuality, model: imgModel, onModel: pickModel, models }} pack={pack} onChanged={onChanged} jobId={jobId} canMake={canMake} onMake={makeImage} busy={isRendering(s) || starting.has(s.id)} />
        ))}
      </div>
      {sel.size > 0 && (
        <div className="selbar" role="region" aria-label="Selected ads">
          <b>{sel.size} selected</b>
          <span className="muted small">{chosen.filter((x) => !x.image_url).length ? chosen.filter((x) => !x.image_url).length + ' without an image' : 'all have images'}</span>
          <span style={{ flex: 1 }} />
          <button className="ghost" onClick={() => setSel(new Set())}>Clear</button>
          <button className="btn" onClick={() => setPosting(true)}><Send size={14} /> Post…</button>
        </div>
      )}
      {posting && <PostDialog jobId={jobId} pack={pack} ads={chosen} defaultLink={defaultLink} goAccount={goAccount} onClose={() => setPosting(false)} onDone={onChanged} />}
    </>
  );
}

// Post tags: chips plus one button that copies them all.
function Tags({ list }) {
  const [all, setAll] = useState(false);
  if (!list || !list.length) return null;
  const shown = all ? list : list.slice(0, 4);
  return (
    <div className="tags">
      {shown.map((t) => <span key={t} className="tagchip">{t}</span>)}
      {list.length > 4 && <button type="button" className="linkbtn" onClick={() => setAll(!all)}>{all ? 'Show fewer' : '+' + (list.length - 4) + ' more'}</button>}
      <CopyBtn text={list.join(' ')} label="Copy tags" />
    </div>
  );
}

// What has already been sent from this app, as small chips on the ad.
const POST_LABEL = { 'facebook-draft': 'Facebook draft', 'facebook-scheduled': 'Facebook scheduled', 'facebook-published': 'On Facebook', 'instagram-post': 'On Instagram', 'instagram-story': 'Instagram story', 'meta-ad-paused': 'Paused ad in Meta' };
function PostedChips({ posts }) {
  const list = [...new Map((posts || []).map((x) => [x.dest, x])).values()];
  if (!list.length) return null;
  return (
    <div className="platforms" style={{ paddingTop: 0 }} aria-label="Already posted">
      {list.map((x) => <span key={x.dest} className="postedchip" title={(x.page || '') + ' · ' + new Date(x.at).toLocaleString()}><CheckCircle2 size={12} aria-hidden /> {POST_LABEL[x.dest] || x.dest}</span>)}
    </div>
  );
}

// Where each shape can run. Square images fit the Facebook and Instagram feeds; tall 9:16 pictures and videos fit Stories,
// Reels and the vertical video feeds. (Meta's placements: feed 1:1 or 4:5; Stories and Reels 9:16.)
const PLATFORMS = {
  '1:1': [
    { key: 'fb', name: 'Facebook', where: 'Feed', Icon: Facebook, tip: 'Facebook Feed, Marketplace and Search results' },
    { key: 'ig', name: 'Instagram', where: 'Feed', Icon: Instagram, tip: 'Instagram Feed and Explore' },
  ],
  '9:16': [
    { key: 'ig', name: 'Instagram', where: 'Stories · Reels', Icon: Instagram, tip: 'Instagram Stories and Reels' },
    { key: 'fb', name: 'Facebook', where: 'Stories · Reels', Icon: Facebook, tip: 'Facebook Stories and Reels' },
    { key: 'tt', name: 'TikTok', where: 'In-feed', Icon: Music2, tip: 'TikTok In-Feed ads (vertical)' },
  ],
  video: [
    { key: 'ig', name: 'Instagram', where: 'Reels · Stories', Icon: Instagram, tip: 'Instagram Reels and Stories' },
    { key: 'fb', name: 'Facebook', where: 'Reels · Stories', Icon: Facebook, tip: 'Facebook Reels and Stories' },
    { key: 'tt', name: 'TikTok', where: 'In-feed', Icon: Music2, tip: 'TikTok In-Feed ads' },
    { key: 'yt', name: 'YouTube', where: 'Shorts', Icon: Youtube, tip: 'YouTube Shorts (vertical, up to 60 seconds)' },
  ],
};

// Small badges that say which platforms and placements an ad can be used on.
function PlatformBadges({ aspect, video, hint }) {
  const list = PLATFORMS[video ? 'video' : aspect] || [];
  if (!list.length) return null;
  return (
    <div className="platforms" aria-label="Ad type and where it can run">
      <span className="typechip" title={video ? 'Vertical video ad, 9:16' : aspect === '9:16' ? 'Story and Reel image ad, 9:16 (1080 x 1920)' : 'Feed image ad, 1:1 (1080 x 1080)'}>
        {video ? <Clapperboard size={13} aria-hidden /> : aspect === '9:16' ? <Smartphone size={13} aria-hidden /> : <Square size={13} aria-hidden />}
        {video ? 'Vertical video' : aspect === '9:16' ? 'Story image' : 'Feed image'}
      </span>
      {list.map(({ key, name, where, Icon, tip }) => (
        <span key={key} className={'plat ' + key} title={tip} role="img" aria-label={name + ' ' + where}><Icon size={15} aria-hidden /></span>
      ))}
      
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
            <b style={{ display: 'block' }}>Render these videos online <Hint id="video.render" /></b>
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

function Videos({ pack, jobId, onChanged, goAccount, defaultLink }) {
  const [postVid, setPostVid] = useState(null);
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
      <div className="row gap" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
        <TagButton kind="videos" pack={pack} jobId={jobId} onChanged={onChanged} compact />
        <MoreBar kind="videos" pack={pack} jobId={jobId} onChanged={onChanged} />
      </div>
      {hasBoards && <RenderPanel jobId={jobId} render={render} ids={ids} selected={selected} />}
      {oneErr && <div className="banner err"><AlertTriangle size={16} />{oneErr}</div>}
      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
        {videos.map((v, i) => {
          const file = files.find((f) => f.n === (v.id || i + 1));
          return (
            <article key={v.id} className="vid">
              <PlatformBadges video />
              <div className="row between"><span className="tag" style={{ margin: 0 }}>{v.format}</span>
                {hasBoards && ids.includes(v.id || i + 1) && ids.length > 1 && render.st && render.st.configured && (
                  <><label className="pickvid"><input type="checkbox" checked={selected.includes(v.id || i + 1)} disabled={busyNow} onChange={() => toggle(v.id || i + 1)} /> Render</label></>
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
              {v.video_stale && <p className="note" style={{ margin: 0 }}>The script was rewritten: the rendered video shows the old version. Render this video again to match.</p>}
              <Tags list={v.hashtags} />
              {!(v.hashtags || []).length && jobId && onChanged && <div><TagButton kind="videos" pack={pack} jobId={jobId} onChanged={onChanged} ids={[v.id]} label="Add hashtags" compact /></div>}
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
              )}{file && file.url && jobId && <button type="button" className="ghost" onClick={() => setPostVid(v.id || i + 1)} title="Post to a Facebook Page or Instagram Reels"><Send size={13} /> Post…</button>}<RewriteBox kind="videos" item={v} pack={pack} jobId={jobId} onChanged={onChanged} compact /><CopyBtn text={v.spoken_script} label="Copy voiceover script" />{v.primary_text && <CopyBtn text={[v.primary_text, ...((v.hashtags || []).length ? ['', v.hashtags.join(' ')] : [])].join(String.fromCharCode(10))} label="Copy ad caption" />}{v.video_url && <a className="ghost" href={v.video_url} target="_blank" rel="noreferrer">Open video <ExternalLink size={13} /></a>}</div>
            </article>
          );
        })}
      </div>
      {postVid !== null && <VideoPostDialog jobId={jobId} video={postVid} defaultLink={defaultLink} goAccount={goAccount} onClose={() => setPostVid(null)} onDone={onChanged} />}
    </>
  );
}

function Brief({ pack, jobId, onChanged }) {
  return <BriefTab pack={pack} jobId={jobId} onChanged={onChanged} />;
}

function Competitors({ pack, jobId, onChanged }) {
  return <CompetitorsTab pack={pack} jobId={jobId} onChanged={onChanged} />;
}

function Report({ pack }) {
  return <ReportTab pack={pack} />;
}

export default function Results({ pack, jobId, onChanged, goAccount, defaultLink }) {
  const [tab, setTab] = useState('Hooks');
  const st = pack.stats || {};
  const Body = { Hooks, 'Static ads': Statics, Videos, Brief, Competitors, Report, Usage: RunUsageTab }[tab];
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
          <span className="tabhint"><Hint id={'tab.' + tab} /></span>
        </div>
        <Body pack={pack} jobId={jobId} onChanged={onChanged} goAccount={goAccount} defaultLink={defaultLink} />
      </section>
    </>
  );
}
