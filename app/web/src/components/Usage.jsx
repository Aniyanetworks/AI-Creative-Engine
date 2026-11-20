import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Image as ImageIcon, Clapperboard, Sparkles, Wallet } from 'lucide-react';
import { api } from '../api.js';
import { Bone } from './Skeletons.jsx';

const usd = (n) => '$' + (Number(n) || 0).toFixed((Number(n) || 0) >= 100 ? 0 : 2);
const num = (n) => (Number(n) || 0).toLocaleString('en-US');
const day = (iso) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
const RANGES = [['month', 'This month'], ['30d', 'Last 30 days'], ['all', 'All time']];

function csv(report) {
  const rows = [['Account', 'Runs', 'Images', 'Videos', 'Claude $', 'Images $', 'Videos $', 'Total $']];
  for (const u of report.byUser || []) rows.push([u.email, u.runs, u.images, u.videos, u.claude, u.image, u.video, u.cost]);
  rows.push([]);
  rows.push(['Run', 'Claude $', 'Images $', 'Videos $', 'Total $', 'Last activity']);
  for (const r of report.byRun || []) rows.push([r.label, r.claude, r.image, r.video, r.cost, r.at]);
  return rows.map((r) => r.map((c) => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
}

export default function Usage({ me }) {
  const [range, setRange] = useState('month');
  const [user, setUser] = useState('all');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setData(await api.getUsage(range, user)); setErr(''); } catch (e) { setErr(e.message); }
  }, [range, user]);
  useEffect(() => { setData(null); load(); }, [load]);

  const maxDay = useMemo(() => Math.max(0.0001, ...((data && data.byDay) || []).map((d) => d.cost)), [data]);
  const download = () => {
    const url = URL.createObjectURL(new Blob([csv(data)], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'usage-' + range + '.csv'; a.click(); URL.revokeObjectURL(url);
  };

  if (err) return <div className="card"><div className="banner err"><AlertTriangle size={16} />{err}</div></div>;
  if (!data) return <div className="card"><Bone h={28} w={220} /><div style={{ height: 14 }} /><Bone h={90} /><div style={{ height: 14 }} /><Bone h={160} /></div>;
  if (!data.enabled) return <div className="card"><div className="banner warn"><AlertTriangle size={16} />Usage tracking needs the Supabase tables. Run the last section of supabase/schema.sql in the Supabase SQL Editor, then reload.</div></div>;

  const t = data.totals;
  const p = data.prices;
  return (
    <div className="card usage">
      <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>Usage and cost</h2>
          <span className="muted small">{data.isAdmin ? (data.scope === 'all' ? 'All accounts' : 'One account') : 'Your account'} · estimates at list prices, not a bill</span>
        </div>
        <div className="row gap">
          <div className="seg" role="group" aria-label="Period">
            {RANGES.map(([k, l]) => <button key={k} className={range === k ? 'on' : ''} onClick={() => setRange(k)}>{l}</button>)}
          </div>
          <button className="ghost" onClick={download}><Download size={13} /> Export CSV</button>
        </div>
      </div>

      <div className="summary" style={{ marginTop: 16 }}>
        <div className="stat"><span className="tile solid"><Wallet size={18} /></span><div><b>{usd(t.cost)}</b><span>estimated total</span></div></div>
        <div className="stat"><span className="tile"><Sparkles size={18} /></span><div><b>{usd(t.claude.cost)}</b><span>{num(t.claude.runs)} runs · {num(Math.round(t.claude.tokens / 1000))}k tokens (Claude)</span></div></div>
        <div className="stat"><span className="tile"><ImageIcon size={18} /></span><div><b>{usd(t.image.cost)}</b><span>{num(t.image.count)} images (OpenAI)</span></div></div>
        <div className="stat"><span className="tile"><Clapperboard size={18} /></span><div><b>{usd(t.video.cost)}</b><span>{num(t.video.count)} videos · {num(t.video.credits)} credits (ElevenLabs)</span></div></div>
      </div>

      {data.byDay.length > 0 && (
        <>
          <h3>By day</h3>
          <div className="bars" role="img" aria-label="Estimated cost per day">
            {data.byDay.map((d) => (
              <div key={d.day} className="bar" title={day(d.day) + ': ' + usd(d.cost)}>
                <i style={{ height: Math.max(4, Math.round((d.cost / maxDay) * 100)) + '%' }} />
                <span>{day(d.day)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {data.isAdmin && data.byUser && (
        <>
          <h3>By account</h3>
          {data.byUser.length === 0 ? <p className="muted">No usage in this period.</p> : (
            <div className="table-wrap">
              <table className="utable">
                <thead><tr><th>Account</th><th>Runs</th><th>Images</th><th>Videos</th><th>Claude</th><th>Images $</th><th>Videos $</th><th>Total</th></tr></thead>
                <tbody>
                  {data.byUser.map((u) => (
                    <tr key={u.userId || 'none'} className={u.userId && u.userId === me.id ? 'me' : ''}>
                      <td><button type="button" className="linkbtn" onClick={() => setUser(u.userId || 'all')} title="Show only this account">{u.email}</button></td>
                      <td>{num(u.runs)}</td><td>{num(u.images)}</td><td>{num(u.videos)}</td><td>{usd(u.claude)}</td><td>{usd(u.image)}</td><td>{usd(u.video)}</td><td><b>{usd(u.cost)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {data.isAdmin && data.scope !== 'all' && <button className="ghost" style={{ marginTop: 10 }} onClick={() => setUser('all')}>Show all accounts</button>}

      <h3>By run</h3>
      {data.byRun.length === 0 ? <p className="muted">No usage in this period.</p> : (
        <div className="table-wrap">
          <table className="utable">
            <thead><tr><th>Run</th><th>Claude</th><th>Images</th><th>Videos</th><th>Total</th><th>Last activity</th></tr></thead>
            <tbody>
              {data.byRun.map((r) => (
                <tr key={r.runId} className={r.removed ? 'gone' : ''}>
                  <td>{r.label}</td><td>{usd(r.claude)}</td><td>{usd(r.image)}</td><td>{usd(r.video)}</td><td><b>{usd(r.cost)}</b></td><td>{day(r.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="note" style={{ marginTop: 16 }}>
        Assumed prices: Claude ${p.claudeInPerMTok} in / ${p.claudeOutPerMTok} out per million tokens; images {usd(p.image.low)} / {usd(p.image.medium)} / {usd(p.image.high)} (draft / standard / high);
        voiceover {num(p.videoCredits)} credits per video at ${p.creditsPer1k} per 1,000 credits. Change them with the PRICE_* environment variables. Usage is recorded from the day tracking was switched on.
      </p>
    </div>
  );
}
