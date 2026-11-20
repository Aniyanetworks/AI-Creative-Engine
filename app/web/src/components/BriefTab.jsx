import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { AlertTriangle, Check, CheckCircle2, Copy, ExternalLink, Globe, MapPin, MessageSquareQuote, Megaphone, Palette, Search, ShieldCheck, Sparkles, Tag, Target, ThumbsUp, Users } from 'lucide-react';

const hexOk = (c) => /^#[0-9a-f]{6}$/i.test(c || '');
const arr = (x) => (Array.isArray(x) ? x.filter(Boolean) : x ? [x] : []);
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

function useCopy() {
  const [done, setDone] = useState('');
  const copy = (t) => { if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => { setDone(t); setTimeout(() => setDone(''), 1300); }, () => {}); };
  return [done, copy];
}

function Card({ Icon, title, count, children, wide }) {
  return (
    <section className={'bcard' + (wide ? ' wide' : '')}>
      <h3><Icon size={15} aria-hidden /> {title}{count !== undefined && <span className="n">{count}</span>}</h3>
      {children}
    </section>
  );
}
const Items = ({ items }) => (items.length ? <ul className="blist">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="muted small">Nothing found on the site.</p>);

// The Brief tab: who the business is and what it can say, plus a checklist of claims to confirm with the client before ads run.
export default function BriefTab({ pack, jobId, onChanged }) {
  const b = pack.brief || {};
  const [copied, copy] = useCopy();
  const detected = arr(b.brand_colors).filter(hexOk);
  const custom = arr(pack.brand_colors_override).filter(hexOk);
  const colors = custom.length ? custom : detected;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [busy, setBusy] = useState(false);
  const [cerr, setCerr] = useState('');
  const startEdit = () => { setDraft(colors.length ? colors : ['#4338ca']); setCerr(''); setEditing(true); };
  const saveColors = async (value) => {
    setBusy(true); setCerr('');
    try { await api.setBrandColors(jobId, value); setEditing(false); if (onChanged) await onChanged(); }
    catch (e) { setCerr(e.message); }
    finally { setBusy(false); }
  };
  const setAt = (i, v) => setDraft(draft.map((x, j) => (j === i ? v : x)));
  const claims = arr(b.claims_to_verify);
  const key = 'ace-verified-' + (jobId || 'local');
  const [ticked, setTicked] = useState(() => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } });
  useEffect(() => { try { setTicked(JSON.parse(localStorage.getItem(key) || '[]')); } catch { setTicked([]); } }, [key]);
  const toggle = (i) => setTicked((p) => { const n = p.includes(i) ? p.filter((x) => x !== i) : [...p, i]; try { localStorage.setItem(key, JSON.stringify(n)); } catch { /* private mode */ } return n; });
  const [logoBad, setLogoBad] = useState(false);
  const url = pack.url;
  const briefText = [
    b.business_name, b.one_liner, '', 'Offer: ' + (b.offer || 'n/a'), 'Pricing: ' + (b.pricing || 'n/a'), 'Location: ' + (b.location || 'n/a'), 'Tone: ' + (b.tone || ''), 'Call to action: ' + (b.cta || ''),
    '', 'Audience:', ...arr(b.audience).map((x) => '- ' + x), '', 'Pain points:', ...arr(b.pain_points).map((x) => '- ' + x), '', 'Benefits:', ...arr(b.benefits).map((x) => '- ' + x),
    '', 'Proof on site:', ...arr(b.proof).map((x) => '- ' + x), '', 'Differentiators:', ...arr(b.differentiators).map((x) => '- ' + x), '', 'Verify with the client:', ...claims.map((x) => '- ' + x),
  ].join('\n');

  return (
    <div className="brief">
      <section className="bhero">
        <div className="bhead">
          {b.logo_url && !logoBad ? <img className="blogo" src={b.logo_url} alt="" referrerPolicy="no-referrer" onError={() => setLogoBad(true)} /> : <span className="blogo ph" aria-hidden>{(b.business_name || '?').charAt(0)}</span>}
          <div style={{ minWidth: 0 }}>
            <h2>{b.business_name || pack.business}</h2>
            <p className="bline">{b.one_liner}</p>
            <div className="bmeta">
              {url && <a href={url} target="_blank" rel="noreferrer"><Globe size={13} /> {host(url)} <ExternalLink size={11} /></a>}
              {b.location && <span><MapPin size={13} /> {b.location}</span>}
              {b.tone && <span><MessageSquareQuote size={13} /> {b.tone}</span>}
            </div>
          </div>
          <button type="button" className="ghost" onClick={() => copy(briefText)}>{copied === briefText ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy brief</>}</button>
        </div>
        <div className="bfacts">
          <div><span>Main offer</span><b>{b.offer || 'Not stated'}</b></div>
          <div><span>Call to action</span><b>{b.cta || 'Not stated'}</b></div>
          <div><span>Pricing</span><b>{b.pricing || 'Not stated'}</b></div>
          <div>
            <span>Brand colours {custom.length > 0 && <em className="custom">customised</em>}</span>
            {editing ? (
              <div className="coledit">
                <div className="bsw">
                  {draft.map((c, i) => (
                    <span key={i} className="cpick">
                      <input type="color" value={hexOk(c) ? c : '#000000'} onChange={(e) => setAt(i, e.target.value)} aria-label={'Colour ' + (i + 1)} />
                      <input className="hexin" value={c} maxLength={7} onChange={(e) => setAt(i, e.target.value)} aria-label={'Hex code ' + (i + 1)} />
                      {draft.length > 1 && <button type="button" className="cx" onClick={() => setDraft(draft.filter((_, j) => j !== i))} aria-label="Remove this colour">×</button>}
                    </span>
                  ))}
                  {draft.length < 4 && <button type="button" className="ghost sm" onClick={() => setDraft([...draft, '#ffb547'])}>+ Add</button>}
                </div>
                <p className="muted small">The first colour is the main one. Used for concept previews, new images and the next videos. Pictures and videos already made keep their colours.</p>
                {cerr && <div className="banner err"><AlertTriangle size={16} />{cerr}</div>}
                <div className="row gap">
                  <button type="button" className="btn sm" disabled={busy || !draft.every(hexOk)} onClick={() => saveColors(draft)}>Save colours</button>
                  <button type="button" className="ghost sm" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                {colors.length ? <div className="bsw">{colors.map((c) => <button key={c} type="button" className="swb" style={{ background: c }} onClick={() => copy(c)} title={'Copy ' + c} aria-label={'Copy colour ' + c}>{copied === c ? <Check size={14} /> : null}<i>{c}</i></button>)}</div> : <b>None detected</b>}
                {jobId && (
                  <div className="row gap" style={{ marginTop: 6 }}>
                    <button type="button" className="ghost sm" onClick={startEdit}><Palette size={13} /> Change colours</button>
                    {custom.length > 0 && <button type="button" className="ghost sm" disabled={busy} onClick={() => saveColors(null)} title={detected.length ? 'Back to ' + detected.join(', ') : 'Back to the detected colours'}>Reset to default</button>}
                  </div>
                )}
                {cerr && <div className="banner err"><AlertTriangle size={16} />{cerr}</div>}
              </>
            )}
          </div>
        </div>
      </section>

      {claims.length > 0 && (
        <section className="bverify">
          <h3><ShieldCheck size={16} /> Confirm with the client before running ads <span className="n">{ticked.filter((i) => i < claims.length).length} of {claims.length} confirmed</span></h3>
          <p className="muted small">Tick each claim once the client has confirmed it or given permission. Ticks are kept in this browser.</p>
          <ul>
            {claims.map((c, i) => (
              <li key={i} className={ticked.includes(i) ? 'done' : ''}>
                <label><input type="checkbox" checked={ticked.includes(i)} onChange={() => toggle(i)} /> <span>{c}</span></label>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="bgrid">
        <Card Icon={Users} title="Audience" count={arr(b.audience).length}><Items items={arr(b.audience)} /></Card>
        <Card Icon={AlertTriangle} title="Pain points we wrote to" count={arr(b.pain_points).length}><Items items={arr(b.pain_points)} /></Card>
        <Card Icon={ThumbsUp} title="Benefits" count={arr(b.benefits).length}><Items items={arr(b.benefits)} /></Card>
        <Card Icon={CheckCircle2} title="Proof on the site" count={arr(b.proof).length}><Items items={arr(b.proof)} /></Card>
        <Card Icon={Sparkles} title="What makes them different" count={arr(b.differentiators).length}><Items items={arr(b.differentiators)} /></Card>
        <Card Icon={Search} title="Keywords people (and competitors) use" count={arr(b.competitor_search_keywords).length}>
          {arr(b.competitor_search_keywords).length ? <div className="chiplist">{arr(b.competitor_search_keywords).map((k) => <button key={k} type="button" className="chip" onClick={() => copy(k)} title="Copy">{copied === k ? 'Copied' : k}</button>)}</div> : <p className="muted small">None.</p>}
        </Card>
      </div>
    </div>
  );
}
