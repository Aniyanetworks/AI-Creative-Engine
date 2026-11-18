import React, { useState } from 'react';
import { RotateCw, Loader2, FileText, X } from 'lucide-react';
import { api } from '../api.js';

// Starts a new run with the same website and settings. A dry run restarts at once; a run that rendered
// images asks first, because it costs money, and offers a cheap dry run as the alternative.
export default function RerunButton({ job, onStarted, primary = false }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const o = job.options || {};
  const label = o.dryRun ? 'dry run' : o.maxImages > 1 ? 'full run' : 'image test';

  const go = async (body) => {
    setBusy(true); setErr('');
    try { const { id } = await api.rerunJob(job.id, body); setOpen(false); await onStarted(id); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <span className="rerun">
      <button className={primary ? 'btn' : 'ghost'} disabled={busy} onClick={() => (o.dryRun ? go() : setOpen(!open))}>
        {busy ? <Loader2 size={14} className="rot" /> : <RotateCw size={14} />} {primary ? 'Retry' : 'Run again'}
      </button>
      {open && (
        <div className="rerun-pop" role="menu">
          <button role="menuitem" onClick={() => go()} disabled={busy}><RotateCw size={14} /> <span><b>Same settings</b><em>Repeat as a {label}</em></span></button>
          <button role="menuitem" onClick={() => go({ dryRun: true, maxImages: 0, maxVideos: 0 })} disabled={busy}><FileText size={14} /> <span><b>As a dry run</b><em>Copy only, costs cents</em></span></button>
          <button role="menuitem" className="rerun-x" onClick={() => setOpen(false)}><X size={14} /> Cancel</button>
        </div>
      )}
      {err && <span className="rerun-err" role="alert">{err}</span>}
    </span>
  );
}
