import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Facebook, Instagram, Loader2, Megaphone, ShieldCheck, X } from 'lucide-react';
import { api } from '../api.js';

const DESTS = [
  { key: 'ads', Icon: Megaphone, title: 'Meta ads (paused)', safe: true, blurb: 'Creates a paused campaign, ad set and ads in your ad account. Nothing runs or spends money until you turn it on in Meta.' },
  { key: 'facebook', Icon: Facebook, title: 'Facebook Page post', safe: true, blurb: 'Posts the picture and text to one of your Pages. Saved as a draft by default; you can schedule it or publish it now.' },
  { key: 'instagram', Icon: Instagram, title: 'Instagram post', safe: false, blurb: 'Publishes to your linked Instagram business account right away (Instagram has no draft option).' },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const localInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function PostDialog({ jobId, pack, ads, defaultLink, onClose, onDone, goAccount }) {
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState('');
  const [dest, setDest] = useState('ads');
  const [pageId, setPageId] = useState('');
  const [link, setLink] = useState(defaultLink || '');
  const [mode, setMode] = useState('draft');
  const [when, setWhen] = useState(() => localInput(new Date(Date.now() + 3 * 3600e3)));
  const [asStory, setAsStory] = useState(false);
  const [acct, setAcct] = useState('');
  const [budget, setBudget] = useState('10');
  const [countries, setCountries] = useState('CA');
  const [ageMin, setAgeMin] = useState('18');
  const [ageMax, setAgeMax] = useState('65');
  const [again, setAgain] = useState(false);
  const [ack, setAck] = useState(false);
  const [phase, setPhase] = useState('form'); // form | running | done
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api.metaStatus().then((s) => {
      setMeta(s);
      if (s.pages && s.pages[0]) setPageId(s.pages[0].id);
      if (s.adAccounts && s.adAccounts[0]) setAcct(s.adAccounts[0].id);
    }).catch((e) => setErr(e.message));
  }, []);

  const withImage = ads.filter((a) => a.image_url);
  const skipped = ads.length - withImage.length;
  const pages = (meta && meta.pages) || [];
  const igPages = pages.filter((p) => p.ig);
  const pageList = dest === 'instagram' ? igPages : pages;
  useEffect(() => { if (pageList.length && !pageList.some((p) => p.id === pageId)) setPageId(pageList[0].id); }, [dest]); // eslint-disable-line react-hooks/exhaustive-deps
  const posted = (a, d) => ((pack.posts || {})[a.id] || []).some((p) => p.dest.startsWith(d));
  const anyPosted = withImage.some((a) => posted(a, dest === 'ads' ? 'meta-ad' : dest));
  const publicNow = dest === 'instagram' || (dest === 'facebook' && mode === 'now');
  const needsAck = publicNow;
  const anyTall = withImage.some((a) => a.aspect === '9:16');
  const confirmWord = publicNow ? 'publish' : 'create';
  const ready = meta && meta.connected && withImage.length > 0 && pageId && (dest !== 'ads' || acct) && (!needsAck || ack) && (dest === 'instagram' || /^https?:\/\//.test(link));

  const summary = useMemo(() => {
    const n = withImage.length;
    if (dest === 'ads') return n + ' ad' + (n === 1 ? '' : 's') + ' will be created PAUSED in one new campaign. Nothing runs until you switch it on in Meta Ads Manager.';
    if (dest === 'facebook') return mode === 'now' ? n + ' post' + (n === 1 ? '' : 's') + ' will be PUBLISHED on the Page right now and be visible to the public.' : mode === 'schedule' ? n + ' post' + (n === 1 ? '' : 's') + ' will be scheduled on the Page (not public until then).' : n + ' draft post' + (n === 1 ? '' : 's') + ' will be saved on the Page (not public).';
    return n + ' post' + (n === 1 ? '' : 's') + ' will be PUBLISHED on Instagram right now and be visible to the public.';
  }, [dest, mode, withImage.length]);

  const run = async () => {
    setPhase('running'); setErr('');
    const out = withImage.map((a) => ({ id: a.id, name: a.headline, state: 'waiting', note: '' }));
    setRows([...out]);
    const set = (i, patch) => { out[i] = { ...out[i], ...patch }; setRows([...out]); };
    let campaign = null;
    try {
      if (dest === 'ads') {
        const c = await api.adsSetup(jobId, { adAccountId: acct, dailyBudget: Number(budget), countries: countries.split(/[ ,]+/).filter(Boolean), ageMin: Number(ageMin), ageMax: Number(ageMax), confirm: 'create' });
        campaign = c;
      }
    } catch (e) { setErr(e.message); setPhase('form'); return; }
    for (let i = 0; i < withImage.length; i++) {
      const a = withImage[i];
      set(i, { state: 'working' });
      try {
        let r;
        if (dest === 'facebook') r = await api.postFacebook(jobId, { adId: a.id, pageId, mode, scheduleAt: mode === 'schedule' ? new Date(when).toISOString() : undefined, link, confirm: confirmWord, again });
        else if (dest === 'instagram') {
          r = await api.postInstagram(jobId, { adId: a.id, pageId, asStory: asStory && a.aspect === '9:16', confirm: 'publish', again });
          for (let t = 0; r.status === 'processing' && t < 5; t++) { await sleep(3000); r = await api.postInstagram(jobId, { adId: a.id, pageId, creationId: r.creationId, asStory: asStory && a.aspect === '9:16', confirm: 'publish', again }); }
          if (r.status === 'processing') throw new Error('Instagram is still processing the picture. Try this ad again in a minute.');
        } else r = await api.adsAd(jobId, { adAccountId: acct, pageId, adSetId: campaign.adSetId, adId: a.id, link, confirm: 'create', again });
        set(i, { state: 'ok', note: dest === 'facebook' ? (r.status === 'published' ? 'Published' : r.status === 'scheduled' ? 'Scheduled' : 'Draft saved') : dest === 'instagram' ? 'Published' : 'Created (paused)', link: dest === 'facebook' && r.id ? 'https://www.facebook.com/' + r.id : dest === 'ads' ? 'https://adsmanager.facebook.com/adsmanager/manage/ads?act=' + acct : null });
      } catch (e) { set(i, { state: e.code === 'already' ? 'skip' : 'fail', note: e.code === 'already' ? 'Already posted this way (tick "post again" to repeat)' : e.message }); }
    }
    setPhase('done');
    if (onDone) onDone();
  };

  const okN = rows.filter((r) => r.state === 'ok').length;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Post ads">
      <div className="modal-card">
        <div className="row between"><h2 style={{ margin: 0, fontSize: 18 }}>Post {ads.length} ad{ads.length === 1 ? '' : 's'}</h2><button className="ghost" onClick={onClose} aria-label="Close" disabled={phase === 'running'}><X size={14} /></button></div>

        {!meta && !err && <p className="muted"><Loader2 size={14} className="rot" /> Loading your accounts…</p>}
        {err && <div className="banner err"><AlertTriangle size={16} />{err}</div>}
        {meta && !meta.connected && (
          <div className="banner warn" style={{ display: 'block' }}>
            <b>Connect your Facebook account first.</b>
            <p className="small" style={{ margin: '6px 0 8px' }}>{meta.configured ? 'It takes a minute: you sign in at Facebook and choose the Pages and ad accounts to use.' : 'Posting is not switched on yet. Ask the app admin to turn it on.'}</p>
            {meta.configured && <button className="btn sm" onClick={() => { onClose(); goAccount && goAccount(); }}>Connect Facebook</button>}
          </div>
        )}

        {meta && meta.connected && phase === 'form' && (
          <>
            <div className="dests" role="radiogroup" aria-label="Where to post">
              {DESTS.map(({ key, Icon, title, safe, blurb }) => (
                <button key={key} type="button" role="radio" aria-checked={dest === key} className={'dest' + (dest === key ? ' on' : '')} onClick={() => { setDest(key); setAck(false); }}>
                  <Icon size={18} /><b>{title}</b><span>{blurb}</span>
                  <i className={safe ? 'safe' : 'live'}>{safe ? <><ShieldCheck size={12} /> Not public</> : <>Goes public</>}</i>
                </button>
              ))}
            </div>

            <div className="fgrid">
              {(
                <label>{dest === 'instagram' ? 'Page with Instagram' : 'Facebook Page'}
                  <select value={pageId} onChange={(e) => setPageId(e.target.value)}>
                    {pageList.length === 0 && <option value="">{dest === 'instagram' ? 'No Page has an Instagram account linked' : 'No Pages found'}</option>}
                    {pageList.map((p) => <option key={p.id} value={p.id}>{p.name}{p.ig ? ' · @' + p.ig.username : ''}</option>)}
                  </select>
                </label>
              )}
              {dest !== 'instagram' && <label>Website link<input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" /><small>Tracking tags (utm) are added automatically.</small></label>}
              {dest === 'facebook' && (
                <>
                  <label>When
                    <select value={mode} onChange={(e) => { setMode(e.target.value); setAck(false); }}>
                      <option value="draft">Save as a draft (recommended)</option>
                      <option value="schedule">Schedule it</option>
                      <option value="now">Publish now</option>
                    </select>
                  </label>
                  {mode === 'schedule' && <label>Publish at<input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>}
                </>
              )}
              {dest === 'instagram' && anyTall && <label className="check"><input type="checkbox" checked={asStory} onChange={(e) => setAsStory(e.target.checked)} /> Post the tall (9:16) ads as Stories</label>}
              {dest === 'ads' && (
                <>
                  <label>Ad account<select value={acct} onChange={(e) => setAcct(e.target.value)}>{(meta.adAccounts || []).length === 0 && <option value="">No ad accounts found</option>}{(meta.adAccounts || []).map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select></label>
                  <label>Daily budget<input type="number" min="1" max="500" step="1" value={budget} onChange={(e) => setBudget(e.target.value)} /><small>In the account's currency. Only used once you switch the campaign on.</small></label>
                  <label>Countries<input value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="CA, US" /><small>Two-letter codes.</small></label>
                  <label>Ages<span className="row gap"><input style={{ width: 70 }} type="number" min="13" max="65" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} /> to <input style={{ width: 70 }} type="number" min="13" max="65" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} /></span></label>
                </>
              )}
            </div>

            {skipped > 0 && <p className="note" style={{ color: 'var(--bad)' }}>{skipped} selected ad{skipped === 1 ? ' has' : 's have'} no image yet and will be skipped. Make the image first.</p>}
            {anyPosted && <label className="check"><input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} /> Some of these were already posted this way. Post them again too.</label>}

            <div className={'summarybox ' + (publicNow ? 'live' : 'safe')}>{publicNow ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />}<span>{summary}</span></div>
            {needsAck && <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I understand this will be public right away and I have checked the ad text and claims.</label>}

            <div className="row gap" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={onClose}>Cancel</button>
              <button className={publicNow ? 'btn danger' : 'btn'} disabled={!ready} onClick={run}>{publicNow ? 'Publish ' : dest === 'ads' ? 'Create paused ' : mode === 'schedule' ? 'Schedule ' : 'Save draft '}{withImage.length} ad{withImage.length === 1 ? '' : 's'}</button>
            </div>
          </>
        )}

        {(phase === 'running' || phase === 'done') && (
          <>
            <ul className="postrows">
              {rows.map((r) => (
                <li key={r.id} className={r.state}>
                  <span className="pr-i">{r.state === 'ok' ? <CheckCircle2 size={16} /> : r.state === 'fail' ? <AlertTriangle size={16} /> : r.state === 'working' ? <Loader2 size={16} className="rot" /> : <Clock size={16} />}</span>
                  <span className="pr-n"><b>#{r.id}</b> {r.name}{r.note && <small>{r.note}</small>}</span>
                  {r.link && <a className="ghost" href={r.link} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Open</a>}
                </li>
              ))}
            </ul>
            {phase === 'done' && (
              <div className="row between" style={{ marginTop: 12 }}>
                <span className={okN === rows.length ? 'muted' : 'note'}>{okN} of {rows.length} done.{dest === 'ads' && okN > 0 ? ' Everything is paused: review it in Meta Ads Manager, then switch it on.' : ''}</span>
                <button className="btn" onClick={onClose}>Close</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
