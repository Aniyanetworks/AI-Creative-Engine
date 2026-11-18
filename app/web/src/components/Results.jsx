import React, { useMemo, useState } from 'react';
import { Lightbulb, Image as ImageIcon, Video, FileText, Swords, ClipboardList, Copy, Check, ExternalLink, Download, FolderOpen, AlertTriangle, LayoutGrid, Smartphone, Square, Clapperboard } from 'lucide-react';

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

function Videos({ pack, jobId }) {
  const videos = pack.videos || [];
  const hasBoards = videos.some((v) => (v.scenes || []).length);
  const cmd = 'cd video\nnode render.mjs ' + (jobId || '<run id>');
  return (
    <>
      {hasBoards && (
        <div className="renderbox">
          <div className="row gap" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <span className="tile solid"><Clapperboard size={18} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: 'block' }}>Render these 5 videos on your computer</b>
              <span className="muted small">Claude wrote the storyboard below. Run this in the project folder to turn it into MP4s with animated text, brand colors, captions and an ElevenLabs voiceover. Needs <code>ELEVENLABS_API_KEY</code> in <code>.env</code> (without it you get silent videos with captions).</span>
              <pre className="cmd">{cmd}</pre>
              <div className="row gap"><CopyBtn text={cmd} label="Copy command" /><span className="note">Videos are saved in video/out/{jobId || '<run id>'}/</span></div>
            </div>
          </div>
        </div>
      )}
      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
        {videos.map((v) => (
          <article key={v.id} className="vid">
            <div className="row between"><span className="tag" style={{ margin: 0 }}>{v.format}</span>
              <span className={'pill small ' + (v.video_url ? 'ok' : '')}>{v.video_url ? 'Rendered' : /storyboard|script only/.test(v.video_status || '') ? 'Storyboard ready' : v.video_status}</span></div>
            <h2 style={{ fontSize: 16 }}>{v.title}</h2>
            {(v.scenes || []).length ? (
              <ol className="storyboard">
                {v.scenes.map((s, i) => (
                  <li key={i}>
                    <span className="sb-n">{i + 1}</span>
                    <div><b>{s.headline}</b><span className="sb-kind">{KIND[s.kind] || s.kind}{s.sub ? ' · ' + s.sub : ''}</span><em>{s.vo}</em></div>
                  </li>
                ))}
              </ol>
            ) : <div className="script">{v.spoken_script}</div>}
            <div className="row gap"><CopyBtn text={v.spoken_script} label="Copy voiceover script" />{v.primary_text && <CopyBtn text={v.primary_text} label="Copy ad caption" />}{v.video_url && <a className="ghost" href={v.video_url} target="_blank" rel="noreferrer">Open video <ExternalLink size={13} /></a>}</div>
          </article>
        ))}
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
