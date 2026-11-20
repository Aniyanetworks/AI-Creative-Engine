import React, { useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, MapPin, PenLine, RefreshCw, Search, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useWritePolling } from './WriteTools.jsx';
import Hint from './Hint.jsx';

const List = ({ items }) => (items && items.length ? <ul className="plain">{items.map((x, i) => <li key={i}>{typeof x === 'string' ? x : JSON.stringify(x)}</li>)}</ul> : <p className="muted small">None found.</p>);
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const when = (iso) => (iso ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '');
// "Cambridge, Ontario, Canada (serves Waterloo Region, Guelph, GTA, rest of Canada, and remotely the US)" -> short area suggestions
function areaSuggestions(location, done) {
  const text = String(location || '');
  if (!text) return [];
  const out = [];
  const main = text.replace(/\([^)]*\)/g, '').replace(/ +/g, ' ').trim();
  if (main) out.push(main);
  const inner = (text.match(/\(([^)]*)\)/) || [])[1] || '';
  for (const part of inner.replace(/^\s*(serves|serving|covers)\s+/i, '').split(/,| and /)) {
    const t = part.replace(/^(and|the)\s+/i, '').trim();
    if (t && t.length <= 40 && !/^rest of|remote|worldwide|global/i.test(t)) out.push(t);
  }
  return [...new Set(out)].filter((x) => !done.includes(x.toLowerCase())).slice(0, 6);
}
const CONF = { high: 'Well sourced', medium: 'Some sources', low: 'Thin evidence' };

function CompetitorCard({ c }) {
  return (
    <article className="comp">
      <div className="row between" style={{ gap: 8, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <b>{c.website ? <a href={c.website} target="_blank" rel="noreferrer">{c.name} <ExternalLink size={12} /></a> : c.name}</b>
          {c.website && <div className="muted small">{host(c.website)}</div>}
        </div>
        <span className={'confchip ' + c.confidence} title="How well the findings are backed by what the search found">{CONF[c.confidence] || c.confidence}</span>
      </div>
      {c.what_they_do && <p className="small" style={{ margin: '8px 0' }}>{c.what_they_do}</p>}
      {c.offers.length > 0 && <><span className="lbl">Offers</span><List items={c.offers} /></>}
      {c.claims_or_hooks_seen.length > 0 && <><span className="lbl">Seen saying</span><List items={c.claims_or_hooks_seen} /></>}
      {c.price_signals && <p className="small"><span className="lbl">Price signals</span> {c.price_signals}</p>}
      <div className="grid2" style={{ gap: 12 }}>
        <div><span className="lbl">Strengths</span><List items={c.strengths} /></div>
        <div><span className="lbl">Gaps</span><List items={c.gaps} /></div>
      </div>
      {c.channels.length > 0 && <div className="tags">{c.channels.map((x) => <span key={x} className="tagchip">{x}</span>)}</div>}
      {c.source_urls.length > 0 && <div className="srcs">{c.source_urls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer">{host(u)}</a>)}</div>}
    </article>
  );
}

function AreaSection({ a, jobId, onChanged, busy, onRefresh, onRemove }) {
  const [sent, setSent] = useState('');
  const [err, setErr] = useState('');
  const writeAds = async (text) => {
    setErr(''); setSent('');
    try { await api.writeMore(jobId, { kind: 'statics', op: 'more', count: 4, instruction: ('For ' + a.area + ': ' + text).slice(0, 400) }); setSent(text); await onChanged(); }
    catch (e) { setErr(e.message); }
  };
  return (
    <section className="area">
      <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><MapPin size={17} /> {a.area}</h3>
        <div className="row gap">
          <span className="muted small">{a.competitors.length} competitors · researched {when(a.researched_at)}{a.searches ? ' · ' + a.searches + ' searches' : ''}</span>
          {jobId && onChanged && <button className="ghost" disabled={busy} onClick={onRefresh}><RefreshCw size={13} /> Refresh</button>}
          {jobId && onChanged && <button className="ghost" disabled={busy} onClick={onRemove} aria-label={'Remove ' + a.area}><Trash2 size={13} /> Remove</button>}
        </div>
      </div>
      {a.summary && <p style={{ margin: '10px 0' }}>{a.summary}</p>}
      <div className="comps">{a.competitors.map((c) => <CompetitorCard key={c.name} c={c} />)}</div>

      {a.opportunities.length > 0 && (
        <div className="opps">
          <h4>Opportunities in {a.area}</h4>
          <ul className="plain">
            {a.opportunities.map((o, i) => (
              <li key={i}>
                <span>{o}</span>
                {jobId && onChanged && <button type="button" className="ghost sm" disabled={busy} onClick={() => writeAds(o)} title="Writes 4 new ads (concepts) built on this angle"><PenLine size={12} /> {sent === o ? 'Writing…' : 'Write ads'}</button>}
              </li>
            ))}
          </ul>
          {err && <div className="banner err"><AlertTriangle size={16} />{err}</div>}
        </div>
      )}
      {a.local_notes.length > 0 && <><h4>Local notes</h4><List items={a.local_notes} /></>}
      {a.caveats.length > 0 && <p className="note">{a.caveats.join(' ')}</p>}
    </section>
  );
}

// Competitors tab: the general market overview, plus real local competitors researched area by area.
export default function CompetitorsTab({ pack, jobId, onChanged }) {
  const c = pack.competitors || {};
  const areas = Object.values(pack.local_competitors || {}).sort((x, y) => (x.researched_at < y.researched_at ? 1 : -1));
  const [view, setView] = useState(areas.length ? 'area' : 'area');
  const [area, setArea] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const w = useWritePolling(pack, onChanged);
  const researching = !!w && !w.error && w.op === 'research';
  const pending = !!w && !w.error;
  const brief = pack.brief || {};
  const suggestions = areaSuggestions(brief.location, areas.map((a) => a.key));

  const research = async (name) => {
    const target = String(name || area).trim();
    if (!target) return;
    setBusy(true); setErr('');
    try { await api.researchArea(jobId, target); setArea(''); await onChanged(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const remove = async (key) => { try { await api.removeArea(jobId, key); await onChanged(); } catch (e) { setErr(e.message); } };
  const canResearch = !!(jobId && onChanged);

  return (
    <>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div className="seg" role="group" aria-label="Competitor view">
          <button className={view === 'area' ? 'on' : ''} onClick={() => setView('area')}><MapPin size={13} /> By area{areas.length ? ' · ' + areas.length : ''}</button>
          <button className={view === 'overview' ? 'on' : ''} onClick={() => setView('overview')}><Search size={13} /> Market overview</button>
        </div>
        <Hint id="comp.area" />
      </div>

      {view === 'overview' && (
        <>
          <div className={'banner ' + (c.source === 'inferred' ? 'warn' : 'ok')}><strong>Source: {c.source}.</strong> {c.caveat}</div>
          <div className="grid2">
            <div><h3>Angles competitors use</h3><List items={(c.top_angles || []).map((a) => a.angle + ': ' + a.how_competitors_use_it)} /><h3>Common offers</h3><List items={c.common_offers} /></div>
            <div><h3>Saturated</h3><List items={c.saturated} /><h3>White space (opportunity)</h3><List items={c.white_space} /></div>
          </div>
        </>
      )}

      {view === 'area' && (
        <>
          {canResearch && (
            <div className="areabar">
              <div className="row gap" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                <MapPin size={16} aria-hidden />
                <input list="areas" value={area} onChange={(e) => setArea(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') research(); }} placeholder="Add an area: a city or region, e.g. Waterloo Region" aria-label="Area to research" maxLength={80} style={{ flex: '1 1 260px', minWidth: 200 }} />
                <datalist id="areas">{suggestions.map((x) => <option key={x} value={x} />)}</datalist>
                <button className="btn sm" disabled={busy || pending || !area.trim()} onClick={() => research()}>{busy || researching ? <Loader2 size={13} className="rot" /> : <Search size={13} />} Find local competitors</button>
              </div>
              <p className="note" style={{ margin: '8px 0 0' }}>The app searches the web for real businesses competing there. It takes about a minute and costs roughly 10 to 20 cents per area.</p>
              {suggestions.length > 0 && !pending && (
                <div className="tags" style={{ marginTop: 8 }}>
                  <span className="note">From the brief:</span>
                  {suggestions.map((x) => <button key={x} type="button" className="tagchip" style={{ border: 0, cursor: 'pointer' }} onClick={() => setArea(x)} title="Put this area in the box">{x}</button>)}
                </div>
              )}
              {researching && <div className="banner" style={{ marginTop: 10 }}><Loader2 size={16} className="rot" /> Researching {w.area}… searching the web and reading pages. You can keep working.</div>}
              {w && w.error && w.op === 'research' && <div className="banner err" style={{ marginTop: 10 }}><AlertTriangle size={16} />{w.error}<button type="button" className="ghost" style={{ marginLeft: 'auto' }} onClick={async () => { try { await api.dismissWrite(jobId); await onChanged(); } catch { /* ignore */ } }}>Dismiss</button></div>}
              {err && <div className="banner err" style={{ marginTop: 10 }}><AlertTriangle size={16} />{err}</div>}
            </div>
          )}
          <div className="banner warn" style={{ marginBottom: 14 }}><strong>Found by web search.</strong> Every competitor comes with its source links. Open them and check the claims before you build ads around them; thin or old pages can be wrong.</div>
          {areas.length === 0 && !researching && <p className="muted" style={{ padding: '10px 0' }}>No areas researched yet. Add the city or region you sell in and the app will list the real local competitors, what they offer and say, and the gaps your ads can use. Add as many areas as you like (up to 8) to compare them.</p>}
          {areas.map((a) => <AreaSection key={a.key} a={a} jobId={jobId} onChanged={onChanged} busy={pending || busy} onRefresh={() => research(a.area)} onRemove={() => remove(a.key)} />)}
        </>
      )}
    </>
  );
}
