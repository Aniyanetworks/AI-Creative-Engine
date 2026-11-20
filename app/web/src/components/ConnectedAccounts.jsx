import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Facebook, Instagram, Link2, Loader2, RefreshCw, Unlink } from 'lucide-react';
import { api } from '../api.js';

const when = (iso) => (iso ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '');

// Account page section: connect YOUR Facebook account (Pages, Instagram, ad accounts) so ads can be posted from the app.
export default function ConnectedAccounts({ notice }) {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => { try { setSt(await api.metaStatus()); setErr(''); } catch (e) { setErr(e.message); } }, []);
  useEffect(() => { load(); }, [load]);

  const connect = async () => {
    setBusy('connect'); setErr('');
    try { const { url } = await api.metaConnect(window.location.origin); window.location.href = url; }
    catch (e) { setErr(e.message); setBusy(''); }
  };
  const refresh = async () => { setBusy('refresh'); try { await api.metaRefresh(); await load(); } catch (e) { setErr(e.message); } finally { setBusy(''); } };
  const disconnect = async () => {
    if (!window.confirm('Disconnect Facebook? Posting from this app stops until you connect again. Nothing already posted is removed.')) return;
    setBusy('disconnect'); try { await api.metaDisconnect(); await load(); } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };

  return (
    <section className="card" style={{ marginTop: 18 }}>
      <div className="row gap" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <span className="tile"><Link2 size={18} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ display: 'block' }}>Connected accounts</b>
          <span className="muted small">Connect your own Facebook account to post ads from here: Meta ads (always created paused), Facebook Page posts, and Instagram. Other people who use this app connect their own.</span>
        </div>
      </div>
      {notice && <div className={'banner ' + (notice.ok ? 'ok' : 'err')} style={{ marginTop: 14 }}>{notice.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{notice.text}</div>}
      {err && <div className="banner err" style={{ marginTop: 14 }}><AlertTriangle size={16} />{err}</div>}
      {!st ? <p className="muted small" style={{ marginTop: 14 }}><Loader2 size={14} className="rot" /> Checking…</p> : !st.configured ? (
        <div className="banner warn" style={{ marginTop: 14, display: 'block' }}>
          <b>Facebook connection is not set up on this server yet.</b>
          <p className="small" style={{ margin: '6px 0 0' }}>The server needs {st.missing.join(', ')}. In your Meta developer app add this redirect address: <code>{st.redirectUri}</code>. Setup steps are in SETUP.md (Posting to Meta).</p>
        </div>
      ) : !st.connected ? (
        <div style={{ marginTop: 14 }}>
          <button className="btn" onClick={connect} disabled={busy === 'connect'}>{busy === 'connect' ? <Loader2 size={14} className="rot" /> : <Facebook size={14} />} Connect Facebook</button>
          <p className="note" style={{ marginTop: 8 }}>You will sign in at Facebook and choose which Pages and ad accounts to share. This app can only post when you confirm each post.</p>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div><b>{st.name}</b> <span className="pill ok small"><CheckCircle2 size={12} /> Connected</span>{st.expiresAt && <div className="muted small">Access renews by {when(st.expiresAt)}; reconnect if posting stops working.</div>}</div>
            <div className="row gap">
              <button className="ghost" onClick={refresh} disabled={!!busy}>{busy === 'refresh' ? <Loader2 size={13} className="rot" /> : <RefreshCw size={13} />} Refresh list</button>
              <button className="ghost" onClick={connect} disabled={!!busy}><Facebook size={13} /> Reconnect</button>
              <button className="ghost" onClick={disconnect} disabled={!!busy}><Unlink size={13} /> Disconnect</button>
            </div>
          </div>
          <h4 style={{ margin: '16px 0 6px', fontSize: 14 }}>Pages</h4>
          {st.pages.length === 0 ? <p className="muted small">No Pages found. You need to be an admin of a Facebook Page to post to it or run ads from it.</p> : (
            <ul className="plain">{st.pages.map((p) => <li key={p.id}><Facebook size={13} style={{ verticalAlign: '-2px' }} /> {p.name}{p.ig ? <> · <Instagram size={13} style={{ verticalAlign: '-2px' }} /> @{p.ig.username}</> : <span className="muted"> · no Instagram linked</span>}</li>)}</ul>
          )}
          <h4 style={{ margin: '14px 0 6px', fontSize: 14 }}>Ad accounts</h4>
          {st.adAccounts.length === 0 ? <p className="muted small">No ad accounts found.</p> : (
            <ul className="plain">{st.adAccounts.map((a) => <li key={a.id}>{a.name} <span className="muted">· {a.currency}{a.active ? '' : ' · not active'}</span></li>)}</ul>
          )}
        </div>
      )}
    </section>
  );
}
