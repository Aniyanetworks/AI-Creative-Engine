import React, { useEffect, useState } from 'react';
import { AlertTriangle, Hash, Loader2, PenLine, Plus, X } from 'lucide-react';
import { api } from '../api.js';
import Hint from './Hint.jsx';
import { useModels, loadChoice, saveChoice } from '../models.js';

const NAMES = { hooks: ['hook', 'hooks'], statics: ['ad', 'ads'], videos: ['video script', 'video scripts'] };
const COUNTS = { hooks: [3, 5, 10], statics: [2, 4, 6, 10], videos: [1, 2, 3, 5] };
const COST = { hooks: 0.02, statics: 0.015, videos: 0.04 }; // rough Claude cost per new item, in dollars

// Polls the run while a request is being written, so the result shows up by itself.
export function useWritePolling(pack, onChanged) {
  const w = pack.write;
  const pending = !!w && !w.error;
  useEffect(() => {
    if (!pending || !onChanged) return undefined;
    const t = setInterval(onChanged, 4000);
    return () => clearInterval(t);
  }, [pending, onChanged]);
  return w;
}

// "Generate more ..." with a small form, and the progress / error banner for any request on this run.
export function MoreBar({ kind, pack, jobId, onChanged }) {
  const w = useWritePolling(pack, onChanged);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(COUNTS[kind][1] || COUNTS[kind][0]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const models = useModels();
  const [model, setModel] = useState(() => loadChoice('ace-text-model'));
  const [one, many] = NAMES[kind];
  const pending = !!w && !w.error;
  if (!jobId || !onChanged) return null;

  const go = async () => {
    setBusy(true); setErr('');
    try { await api.writeMore(jobId, { kind, op: 'more', count, instruction: note, model: model || undefined }); saveChoice('ace-text-model', model); setOpen(false); setNote(''); await onChanged(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const dismiss = async () => { try { await api.dismissWrite(jobId); await onChanged(); } catch { /* ignore */ } };
  const wNames = w ? NAMES[w.kind] : null;

  return (
    <div className="morebar" style={{ display: 'contents' }}>
      {pending && (
        <div className="banner" style={{ display: 'flex', gap: 8, alignItems: 'center' }} role="status">
          <Loader2 size={16} className="rot" />
          {w.op === 'tags' ? 'Writing hashtags…' : w.op === 'update' ? 'Rewriting one ' + wNames[0] + '…' : 'Writing ' + w.count + ' new ' + (w.count === 1 ? wNames[0] : wNames[1]) + '…'} This takes about half a minute; you can keep working.
        </div>
      )}
      {w && w.error && (
        <div className="banner err" role="alert"><AlertTriangle size={16} />{w.error}<button type="button" className="ghost" style={{ marginLeft: 'auto' }} onClick={dismiss}>Dismiss</button></div>
      )}
      {!open ? (
        <><button type="button" className="ghost" disabled={pending} onClick={() => setOpen(true)}><Plus size={13} /> Generate more {many}</button><Hint id="write.more" /></>
      ) : (
        <div className="onebox">
          <div className="row between"><b className="small">Generate more {many}</b><button type="button" className="ghost" onClick={() => setOpen(false)} aria-label="Close"><X size={14} /></button></div>
          <div className="row gap" style={{ marginTop: 8, alignItems: 'center' }}>
            <label className="small muted" htmlFor={'cnt' + kind}>How many</label>
            <select id={'cnt' + kind} value={count} onChange={(e) => setCount(parseInt(e.target.value, 10))}>{COUNTS[kind].map((n) => <option key={n} value={n}>{n}</option>)}</select>
            <span className="note">about ${(count * COST[kind]).toFixed(2)} of Claude</span>
          </div>
          {models && models.claude.length > 1 && (
            <div className="row gap" style={{ marginTop: 8, alignItems: 'center' }}>
              <label className="small muted" htmlFor={'mdl' + kind}>Model</label>
              <select id={'mdl' + kind} value={model || models.defaults.claude} onChange={(e) => setModel(e.target.value === models.defaults.claude ? '' : e.target.value)}>{models.claude.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
            </div>
          )}
          <input style={{ width: '100%', marginTop: 8 }} maxLength={400} placeholder="Optional: what should they focus on? e.g. speed of setup, local businesses, a different tone" value={note} onChange={(e) => setNote(e.target.value)} />
          {err && <div className="banner err" style={{ marginTop: 8 }}><AlertTriangle size={16} />{err}</div>}
          <div className="row gap" style={{ marginTop: 10 }}>
            <button type="button" className="btn sm" disabled={busy} onClick={go}>{busy ? <Loader2 size={13} className="rot" /> : <Plus size={13} />} Write {count} new {count === 1 ? one : many}</button>
            <button type="button" className="ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// "Add hashtags": for runs made before tags existed (or ads whose tags are missing). One click tags every post that has none,
// or just one post when ids is given.
export function TagButton({ kind, pack, jobId, onChanged, ids, label, compact }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const list = pack[kind] || [];
  const missing = list.filter((x) => (!ids || ids.includes(x.id)) && !(Array.isArray(x.hashtags) && x.hashtags.length)).length;
  const pending = !!pack.write && !pack.write.error;
  if (!jobId || !onChanged || !missing) return null;
  const go = async () => {
    setBusy(true); setErr('');
    try { await api.writeMore(jobId, { kind, op: 'tags', ids }); await onChanged(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const mine = pending && pack.write.op === 'tags' && pack.write.kind === kind;
  return (
    <>
      <button type="button" className={compact ? 'ghost' : 'btn sm'} disabled={busy || pending} onClick={go} title="Claude writes 6 to 8 hashtags for each post (about a cent)">
        {busy || mine ? <><Loader2 size={13} className="rot" /> Tagging…</> : <><Hash size={13} /> {label || 'Add hashtags'}{!ids || ids.length > 1 ? ' (' + missing + ')' : ''}</>}
      </button>
      {err && <span className="note" style={{ color: 'var(--bad)' }}>{err}</span>}
    </>
  );
}

// "Rewrite" for one item: ask Claude to improve it, optionally with an instruction. The id stays the same.
export function RewriteBox({ kind, item, pack, jobId, onChanged, compact }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pending = !!pack.write && !pack.write.error;
  const mine = pending && pack.write.op === 'update' && pack.write.kind === kind && pack.write.id === item.id;
  if (!jobId || !onChanged) return null;
  const go = async () => {
    setBusy(true); setErr('');
    try { await api.writeMore(jobId, { kind, op: 'update', id: item.id, instruction: note }); setOpen(false); setNote(''); await onChanged(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" className="ghost" disabled={pending} onClick={() => setOpen(!open)} title="Ask Claude to rewrite this one">
        {mine ? <><Loader2 size={13} className="rot" /> Rewriting…</> : <><PenLine size={13} /> {compact ? 'Rewrite' : 'Rewrite with AI'}</>}
      </button>
      {open && (
        <div className="refine" style={{ flexBasis: '100%', padding: 0 }}>
          <label className="small muted" htmlFor={'rw' + kind + item.id}>What should change? (optional)</label>
          <textarea id={'rw' + kind + item.id} rows={2} maxLength={400} placeholder="e.g. shorter, mention the free consultation, less salesy, different angle" value={note} onChange={(e) => setNote(e.target.value)} />
          {err && <div className="banner err"><AlertTriangle size={16} />{err}</div>}
          <div className="row gap">
            <button type="button" className="btn sm" disabled={busy} onClick={go}>{busy ? <Loader2 size={13} className="rot" /> : <PenLine size={13} />} Rewrite</button>
            <button type="button" className="ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
