import React, { useCallback, useEffect, useState } from 'react';
import { Check, X, ShieldCheck, RefreshCw, AlertTriangle } from 'lucide-react';
import { api } from '../api.js';
import Hint from './Hint.jsx';
import { Bone } from './Skeletons.jsx';

const when = (iso) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

export default function Users({ myEmail }) {
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    try { setUsers(await api.listUsers()); setErr(''); } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (u, approve) => {
    setBusyId(u.id);
    try { await (approve ? api.approveUser(u.id) : api.revokeUser(u.id)); await load(); }
    catch (e) { setErr(e.message); }
    finally { setBusyId(''); }
  };

  const pending = (users || []).filter((u) => !u.approved);
  const rest = (users || []).filter((u) => u.approved);

  const Row = ({ u }) => (
    <li className="urow">
      <span className="tile soft"><ShieldCheck size={16} /></span>
      <div className="uinfo"><b>{u.email}</b><span>Joined {when(u.createdAt)}{u.isAdmin ? ' · Admin' : ''}{u.email === myEmail ? ' · You' : ''}</span></div>
      <span className={'pill small ' + (u.approved ? 'ok' : 'warn')}>{u.approved ? 'Approved' : 'Pending'}</span>
      {!u.isAdmin && u.email !== myEmail && (u.approved
        ? <button className="ghost" disabled={busyId === u.id} onClick={() => act(u, false)}><X size={13} /> Revoke</button>
        : <button className="btn small" disabled={busyId === u.id} onClick={() => act(u, true)}><Check size={14} /> Approve</button>)}
    </li>
  );

  return (
    <div>
      <div className="row between" style={{ marginBottom: 18 }}>
        <div><h2>Users <Hint id="users.page" /></h2><p className="muted small">Approve people before they can run jobs. Every run spends your API credits.</p></div>
        <button className="ghost" onClick={load}><RefreshCw size={13} /> Refresh</button>
      </div>
      {err && <div className="banner err" role="alert"><AlertTriangle size={16} />{err}</div>}
      {users === null && !err && <section className="card">{[0, 1, 2].map((i) => <div key={i} className="urow"><Bone w={36} h={36} r={10} /><div style={{ flex: 1, display: 'grid', gap: 6 }}><Bone w="40%" h={12} /><Bone w="25%" h={10} /></div></div>)}</section>}
      {users && (
        <>
          <section className="card">
            <h3 style={{ marginTop: 0 }}>Waiting for approval · {pending.length}</h3>
            {pending.length ? <ul className="ulist">{pending.map((u) => <Row key={u.id} u={u} />)}</ul> : <p className="muted small">Nobody is waiting.</p>}
          </section>
          <section className="card">
            <h3 style={{ marginTop: 0 }}>Approved · {rest.length}</h3>
            {rest.length ? <ul className="ulist">{rest.map((u) => <Row key={u.id} u={u} />)}</ul> : <p className="muted small">No approved users yet.</p>}
          </section>
        </>
      )}
    </div>
  );
}
