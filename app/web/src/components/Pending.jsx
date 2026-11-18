import React, { useState } from 'react';
import { Hourglass, RefreshCw, LogOut, Loader2 } from 'lucide-react';

export default function Pending({ email, onCheck, onSignOut }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const check = async () => {
    setBusy(true); setMsg('');
    const ok = await onCheck();
    if (!ok) setMsg('Still waiting for approval.');
    setBusy(false);
  };
  return (
    <div className="authwrap"><div className="authcard center">
      <span className="tile big"><Hourglass size={22} /></span>
      <h2>Waiting for approval</h2>
      <p className="muted">You're signed in as <b>{email}</b>. An admin needs to approve your account before you can generate ads. You'll be able to use the app as soon as that happens.</p>
      {msg && <p className="small" style={{ color: 'var(--warn)' }}>{msg}</p>}
      <div className="row gap" style={{ justifyContent: 'center', marginTop: 14 }}>
        <button className="go" onClick={check} disabled={busy}>{busy ? <Loader2 size={16} className="rot" /> : <RefreshCw size={16} />} Check again</button>
        <button className="ghost" onClick={onSignOut}><LogOut size={14} /> Sign out</button>
      </div>
    </div></div>
  );
}
