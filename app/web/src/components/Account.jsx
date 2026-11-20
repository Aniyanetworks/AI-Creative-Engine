import React, { useState } from 'react';
import { KeyRound, Lock, Eye, EyeOff, Loader2, AlertTriangle, CheckCircle2, LogOut, UserRound } from 'lucide-react';
import { auth } from '../api.js';
import ConnectedAccounts from './ConnectedAccounts.jsx';

export default function Account({ me, onSignOut, notice }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const mismatch = again && next !== again;
  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setDone(false);
    if (next !== again) return setErr('The new passwords do not match.');
    setBusy(true);
    try {
      await auth.changePassword(current, next);
      setDone(true); setCurrent(''); setNext(''); setAgain('');
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ marginBottom: 4 }}>Account</h2>
      <p className="muted small" style={{ marginBottom: 18 }}>Manage how you sign in.</p>

      <ConnectedAccounts notice={notice} />

      <section className="card" style={{ marginTop: 18 }}>
        <div className="row gap" style={{ flexWrap: 'nowrap' }}>
          <span className="tile"><UserRound size={18} /></span>
          <div style={{ minWidth: 0, flex: 1 }}><b style={{ display: 'block', wordBreak: 'break-all' }}>{me.email}</b>
            <span className="muted small">{me.isAdmin ? 'Admin' : 'Member'}</span></div>
          <button className="ghost" onClick={onSignOut}><LogOut size={13} /> Sign out</button>
        </div>
      </section>

      <form className="card" onSubmit={submit}>
        <div className="row gap" style={{ flexWrap: 'nowrap', marginBottom: 14 }}>
          <span className="tile"><KeyRound size={18} /></span>
          <div><b style={{ display: 'block' }}>Change password</b><span className="muted small">You'll stay signed in on this device.</span></div>
        </div>

        <label className="fld"><span>Current password</span>
          <span className="inp"><Lock size={16} /><input type={show ? 'text' : 'password'} autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></span>
        </label>
        <label className="fld"><span>New password</span>
          <span className="inp"><Lock size={16} />
            <input type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={8} placeholder="At least 8 characters" value={next} onChange={(e) => setNext(e.target.value)} />
            <button type="button" className="eye" onClick={() => setShow(!show)} aria-label={show ? 'Hide passwords' : 'Show passwords'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </span>
        </label>
        <label className="fld"><span>Confirm new password</span>
          <span className={'inp' + (mismatch ? ' bad' : '')}><Lock size={16} /><input type={show ? 'text' : 'password'} autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} /></span>
          {mismatch && <em className="hint bad">Doesn't match the new password.</em>}
        </label>

        {err && <div className="banner err" role="alert" style={{ marginTop: 14, marginBottom: 0 }}><AlertTriangle size={16} />{err}</div>}
        {done && <div className="banner ok" role="status" style={{ marginTop: 14, marginBottom: 0 }}><CheckCircle2 size={16} />Password updated. Use the new one next time you sign in.</div>}
        <button className="go" style={{ marginTop: 16, padding: '10px 20px' }} disabled={busy || !current || next.length < 8 || next !== again}>
          {busy ? <><Loader2 size={16} className="rot" /> Updating…</> : 'Update password'}
        </button>
      </form>
    </div>
  );
}
