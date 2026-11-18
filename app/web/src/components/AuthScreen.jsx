import React, { useState } from 'react';
import { Sparkles, Mail, Lock, Eye, EyeOff, Loader2, AlertTriangle, MailCheck } from 'lucide-react';
import { auth } from '../api.js';

export default function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (mode === 'signin') { await auth.signIn(email, password); await onAuthed(); }
      else {
        const out = await auth.signUp(email, password);
        if (out.needsConfirmation) setConfirmSent(true); else await onAuthed();
      }
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };

  if (confirmSent) {
    return (
      <div className="authwrap"><div className="authcard center">
        <span className="tile solid big"><MailCheck size={22} /></span>
        <h2>Check your email</h2>
        <p className="muted">We sent a confirmation link to <b>{email}</b>. Open it, then come back and sign in. After that, an admin needs to approve your account before you can run anything.</p>
        <button className="go full" onClick={() => { setConfirmSent(false); setMode('signin'); setPassword(''); }}>Back to sign in</button>
      </div></div>
    );
  }

  return (
    <div className="authwrap">
      <form className="authcard" onSubmit={submit}>
        <div className="brand" style={{ padding: 0, marginBottom: 6 }}><span className="logo" aria-hidden><Sparkles size={15} /></span> Creative Engine</div>
        <h2>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h2>
        <p className="muted small" style={{ marginBottom: 18 }}>
          {mode === 'signin' ? 'Sign in to generate ads from any website.' : 'New accounts are approved by an admin before they can run jobs.'}
        </p>

        <label className="fld"><span>Email</span>
          <span className="inp"><Mail size={16} /><input type="email" autoComplete="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></span>
        </label>
        <label className="fld"><span>Password</span>
          <span className="inp"><Lock size={16} />
            <input type={show ? 'text' : 'password'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={mode === 'signup' ? 8 : undefined} placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'} value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="eye" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </span>
        </label>

        {err && <div className="banner err" role="alert" style={{ marginTop: 14, marginBottom: 0 }}><AlertTriangle size={16} />{err}</div>}
        <button className="go full" disabled={busy || !email || !password}>{busy ? <><Loader2 size={16} className="rot" /> Please wait…</> : mode === 'signin' ? 'Sign in' : 'Create account'}</button>

        <p className="switch muted small">
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button type="button" className="linkbtn" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setErr(''); }}>{mode === 'signin' ? 'Create one' : 'Sign in'}</button>
        </p>
      </form>
    </div>
  );
}
