import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Facebook, Instagram, Loader2, X } from 'lucide-react';
import { api } from '../api.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const localInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

// Post one rendered video: a Facebook Page video (draft, scheduled or published) or an Instagram Reel (publishes at once).
export default function VideoPostDialog({ jobId, video, defaultLink, onClose, onDone, goAccount }) {
  const [meta, setMeta] = useState(null);
  const [dest, setDest] = useState('facebook');
  const [pageId, setPageId] = useState('');
  const [mode, setMode] = useState('draft');
  const [when, setWhen] = useState(() => localInput(new Date(Date.now() + 3 * 3600e3)));
  const [link, setLink] = useState(defaultLink || '');
  const [ack, setAck] = useState(false);
  const [phase, setPhase] = useState('form'); // form | running | done
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => { api.metaStatus().then((s) => { setMeta(s); if (s.pages && s.pages[0]) setPageId(s.pages[0].id); }).catch((e) => setErr(e.message)); }, []);
  const pages = (meta && meta.pages) || [];
  const list = dest === 'instagram' ? pages.filter((p) => p.ig) : pages;
  useEffect(() => { if (list.length && !list.some((p) => p.id === pageId)) setPageId(list[0].id); }, [dest]); // eslint-disable-line react-hooks/exhaustive-deps
  const publicNow = dest === 'instagram' || (dest === 'facebook' && mode === 'now');
  const ready = meta && meta.connected && pageId && (!publicNow || ack) && (dest === 'instagram' || /^https?:\/\//.test(link));

  const run = async () => {
    setPhase('running'); setErr(''); setMsg('Sending the video to ' + (dest === 'instagram' ? 'Instagram' : 'Facebook') + '…');
    try {
      const base = { videoId: video, pageId, dest, link, confirm: publicNow ? 'publish' : 'create' };
      let r = await api.postVideo(jobId, dest === 'facebook' ? { ...base, mode, scheduleAt: mode === 'schedule' ? new Date(when).toISOString() : undefined } : base);
      for (let i = 0; dest === 'instagram' && r.status === 'processing' && i < 20; i++) { // Instagram is still processing the video
        setMsg('Instagram is processing the video… (' + (i + 1) + ')');
        await sleep(4000);
        r = await api.postVideo(jobId, { ...base, creationId: r.creationId });
      }
      if (r.status === 'processing') throw new Error('Instagram is still processing the video. Wait a minute and post again.');
      setMsg(dest === 'instagram' ? 'Published on Instagram as a Reel.' : mode === 'now' ? 'Published on ' + r.page + '. Facebook may take a few minutes to finish processing the video.' : mode === 'schedule' ? 'Scheduled on ' + r.page + '.' : 'Saved as a draft on ' + r.page + ' (Publishing tools on Facebook).');
      setPhase('done'); if (onDone) await onDone();
    } catch (e) { setErr(e.message); setPhase('form'); }
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Post this video" onClick={(e) => { if (e.target === e.currentTarget && phase !== 'running') onClose(); }}>
      <div className="modal-card">
        <div className="row between"><h3 style={{ margin: 0 }}>Post video {video}</h3><button type="button" className="ghost" onClick={onClose} disabled={phase === 'running'} aria-label="Close"><X size={15} /></button></div>
        {meta && !meta.connected ? (
          <p className="note">Connect your Facebook account first. {goAccount && <button type="button" className="linkbtn" onClick={goAccount}>Open Connected accounts</button>}</p>
        ) : (
          <>
            <div className="seg" role="group" aria-label="Where to post">
              <button className={dest === 'facebook' ? 'on' : ''} onClick={() => setDest('facebook')} disabled={phase === 'running'}><Facebook size={13} /> Facebook Page</button>
              <button className={dest === 'instagram' ? 'on' : ''} onClick={() => setDest('instagram')} disabled={phase === 'running'}><Instagram size={13} /> Instagram Reel</button>
            </div>
            <label className="small muted" htmlFor="vp-page">{dest === 'instagram' ? 'Instagram account (through its Page)' : 'Page'}</label>
            <select id="vp-page" value={pageId} onChange={(e) => setPageId(e.target.value)} disabled={phase === 'running'}>
              {list.map((p) => <option key={p.id} value={p.id}>{dest === 'instagram' ? '@' + p.ig.username + ' · ' + p.name : p.name}</option>)}
            </select>
            {!list.length && <p className="note">{dest === 'instagram' ? 'None of your Pages has an Instagram business account linked.' : 'No Pages found on this account.'}</p>}
            {dest === 'facebook' && (
              <>
                <div className="seg" role="group" aria-label="When">
                  {[['draft', 'Save as draft'], ['schedule', 'Schedule'], ['now', 'Publish now']].map(([k, l]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)} disabled={phase === 'running'}>{l}</button>)}
                </div>
                {mode === 'schedule' && <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />}
                <label className="small muted" htmlFor="vp-link">Link added to the post</label>
                <input id="vp-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
              </>
            )}
            <p className="note">{dest === 'instagram' ? 'The Reel is published on Instagram right away (Instagram has no draft option).' : mode === 'now' ? 'The video is published on the Page right now and visible to the public.' : mode === 'schedule' ? 'The video is scheduled on the Page.' : 'The video is saved as an unpublished draft on the Page.'}</p>
            {publicNow && <label className="small"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I understand this goes public.</label>}
          </>
        )}
        {err && <div className="banner err"><AlertTriangle size={16} />{err}</div>}
        {phase === 'running' && <p className="small"><Loader2 size={14} className="rot" /> {msg}</p>}
        {phase === 'done' && <p className="small" style={{ color: 'var(--ok)' }}><CheckCircle2 size={14} /> {msg}</p>}
        <div className="row gap">
          {phase !== 'done' && <button type="button" className="btn" disabled={!ready || phase === 'running'} onClick={run}>{publicNow ? 'Publish' : 'Post'}</button>}
          <button type="button" className="ghost" onClick={onClose} disabled={phase === 'running'}>{phase === 'done' ? 'Close' : 'Cancel'}</button>
        </div>
      </div>
    </div>
  );
}
