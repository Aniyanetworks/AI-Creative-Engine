import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Clapperboard, Image as ImageIcon, Sparkles, Wallet } from 'lucide-react';
import { api } from '../api.js';
import { Bone } from './Skeletons.jsx';

const usd = (n) => '$' + (Number(n) || 0).toFixed(2);
const usd4 = (n) => (Number(n) < 0.01 && Number(n) > 0 ? '<$0.01' : usd(n));
const num = (n) => (Number(n) || 0).toLocaleString('en-US');
const QUALITY = { low: 'draft', medium: 'standard', high: 'high quality' };
const NOUN = { hooks: 'hooks', statics: 'ads', videos: 'video scripts' };
const when = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// What one event was, in words.
function describe(e) {
  if (e.kind === 'claude') {
    if (e.source === 'write') {
      const what = NOUN[e.what] || 'items';
      if (e.op === 'research') return 'Local competitor research' + (e.area ? ': ' + e.area : '') + (e.searches ? ' (' + e.searches + ' web searches)' : '');
      return e.op === 'tags' ? 'Hashtags for ' + what : e.op === 'update' ? 'Rewrote one of the ' + what : 'Wrote ' + (e.count || 'more') + ' more ' + what;
    }
    return 'The run: brief, competitors, hooks, ads and scripts';
  }
  if (e.kind === 'image') return (e.source === 'button' ? 'Image made with the button' : 'Images made during the run') + (e.quality ? ' · ' + (QUALITY[e.quality] || e.quality) : '');
  return 'Video render';
}
const amount = (e) => (e.kind === 'claude' ? num(e.units) + ' tokens' : e.kind === 'image' ? num(e.units) + (e.units === 1 ? ' image' : ' images') : num(e.units) + (e.units === 1 ? ' video' : ' videos') + (e.credits ? ' · ' + num(e.credits) + ' credits' : ''));

// The "Usage" tab of a run: what this run has cost so far and every charge that made it up.
export default function RunUsageTab({ jobId, stamp }) {
  const [r, setR] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try { setR(await api.getRunUsage(jobId)); setErr(''); } catch (e) { setErr(e.message); }
  }, [jobId]);
  useEffect(() => { load(); }, [load, stamp]);
  useEffect(() => { const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

  if (err) return <div className="banner err"><AlertTriangle size={16} />{err}</div>;
  if (!r) return <div style={{ padding: '18px 0' }}><Bone h={80} /><div style={{ height: 12 }} /><Bone h={140} /></div>;
  if (!r.enabled) return <div className="banner warn"><AlertTriangle size={16} />Usage tracking needs the Supabase table: run the last section of supabase/schema.sql in the Supabase SQL Editor, then reload.</div>;
  if (!r.tracked) return <p className="muted" style={{ padding: '18px 0' }}>Nothing was recorded for this run. Usage is tracked from the day tracking was switched on, so older runs have no figures.</p>;

  const q = Object.entries(r.images.byQuality || {}).map(([k, v]) => v + ' ' + (QUALITY[k] || k)).join(', ');
  const p = r.prices;
  return (
    <div className="runusage">
      <div className="summary" style={{ marginTop: 16 }}>
        <div className="stat"><span className="tile solid"><Wallet size={18} /></span><div><b>{usd(r.cost)}</b><span>estimated total</span></div></div>
        <div className="stat"><span className="tile"><Sparkles size={18} /></span><div><b>{usd(r.claude.cost)}</b><span>Claude · {num(r.claude.inTokens + r.claude.outTokens)} tokens</span></div></div>
        <div className="stat"><span className="tile"><ImageIcon size={18} /></span><div><b>{usd(r.images.cost)}</b><span>{num(r.images.count)} images{q ? ' · ' + q : ''}</span></div></div>
        <div className="stat"><span className="tile"><Clapperboard size={18} /></span><div><b>{usd(r.videos.cost)}</b><span>{num(r.videos.count)} videos · {num(r.videos.credits)} credits</span></div></div>
      </div>

      <h3 style={{ margin: '22px 0 8px', fontSize: 15 }}>Charges</h3>
      <div className="table-wrap">
        <table className="utable">
          <thead><tr><th>When</th><th>What</th><th>Amount</th><th>Model</th><th>Est. cost</th></tr></thead>
          <tbody>
            {[...r.events].reverse().map((e, i) => (
              <tr key={i}>
                <td>{when(e.at)}</td>
                <td style={{ whiteSpace: 'normal', minWidth: 220 }}>{describe(e)}</td>
                <td>{amount(e)}</td>
                <td className="muted">{e.model || '—'}</td>
                <td><b>{usd4(e.cost)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note" style={{ marginTop: 14 }}>
        List-price estimates, not a bill. Claude ${p.claudeInPerMTok} in / ${p.claudeOutPerMTok} out per million tokens (varies by model), images {usd(p.image.low)} / {usd(p.image.medium)} / {usd(p.image.high)} (draft / standard / high),
        voiceover {num(p.videoCredits)} credits per video. See <b>Usage and cost</b> in the sidebar for all runs and accounts.
      </p>
    </div>
  );
}
