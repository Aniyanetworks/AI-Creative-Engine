import React, { useCallback, useEffect, useState } from 'react';
import { Wallet, X } from 'lucide-react';
import { api } from '../api.js';

const usd = (n) => '$' + (Number(n) || 0).toFixed(2);
const num = (n) => (Number(n) || 0).toLocaleString('en-US');
const QUALITY = { low: 'draft', medium: 'standard', high: 'high quality' };

// "Est. cost $0.42" next to the run's status; click for what it is made of (Claude, images, videos).
// `stamp` changes whenever the run's images or videos change, so the figure follows along.
export default function RunCost({ jobId, status, stamp }) {
  const [r, setR] = useState(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    try { setR(await api.getRunUsage(jobId)); } catch { /* the chip just stays hidden */ }
  }, [jobId]);
  useEffect(() => { setR(null); setOpen(false); load(); }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (status === 'success' || status === 'error') load(); }, [status, stamp, load]);
  // Video renders are logged when they start, images when they finish: keep the figure fresh while the panel is open.
  useEffect(() => {
    if (!open) return undefined;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [open, load]);

  if (!r || !r.enabled) return null; // usage tracking is off (see SETUP.md)
  const q = Object.entries(r.images.byQuality || {}).map(([k, v]) => v + ' ' + (QUALITY[k] || k)).join(', ');
  return (
    <>
      <button type="button" className="costchip" onClick={() => setOpen(!open)} aria-expanded={open} title="Estimated cost of this run so far">
        <Wallet size={13} /> {r.tracked ? 'Est. ' + usd(r.cost) : 'Cost not tracked'}
      </button>
      {open && (
        <div className="costpop" style={{ position: 'absolute', right: 20, top: 74, zIndex: 5, width: 'min(380px, calc(100vw - 40px))', boxShadow: 'var(--shadow)' }} role="dialog" aria-label="Cost of this run">
          <div className="row between"><b>Cost of this run (estimate)</b><button type="button" className="ghost" onClick={() => setOpen(false)} aria-label="Close"><X size={14} /></button></div>
          {!r.tracked ? <p className="muted small">Nothing was recorded for this run. Usage is tracked from the day tracking was switched on.</p> : (
            <>
              <div className="crow"><span>Claude (brief, hooks, ads, scripts)<small>{num(r.claude.inTokens)} in / {num(r.claude.outTokens)} out tokens · {r.claude.calls} calls</small></span><b>{usd(r.claude.cost)}</b></div>
              <div className="crow"><span>Images (OpenAI)<small>{r.images.count ? num(r.images.count) + ' made' + (q ? ' · ' + q : '') : 'none yet'}</small></span><b>{usd(r.images.cost)}</b></div>
              <div className="crow"><span>Videos (ElevenLabs voice)<small>{r.videos.count ? num(r.videos.count) + ' rendered · ' + num(r.videos.credits) + ' credits' : 'none yet'}</small></span><b>{usd(r.videos.cost)}</b></div>
              <div className="crow"><span><b>Total</b></span><b>{usd(r.cost)}</b></div>
            </>
          )}
          <p className="note" style={{ margin: '8px 0 0' }}>List-price estimates, not a bill. See Usage and cost in the sidebar for all runs.</p>
        </div>
      )}
    </>
  );
}
