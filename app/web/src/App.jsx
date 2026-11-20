import React, { useCallback, useEffect, useState } from 'react';
import { Sparkles, Plus, AlertTriangle, Power, Moon, Sun, Users as UsersIcon, Settings, LogOut, RefreshCw, Wallet } from 'lucide-react';
import { api, auth } from './api.js';
import RunForm from './components/RunForm.jsx';
import RunView from './components/RunView.jsx';
import History from './components/History.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import Pending from './components/Pending.jsx';
import Users from './components/Users.jsx';
import Account from './components/Account.jsx';
import Usage from './components/Usage.jsx';
import { Bone } from './components/Skeletons.jsx';

const USERS = '__users';
const ACCOUNT = '__account';
const USAGE = '__usage';

function useTheme() {
  // Light is the default; dark is only used if the user switched it on (remembered in this browser).
  const [theme, setTheme] = useState(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (next === 'dark') document.documentElement.dataset.theme = 'dark'; else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('ace-theme', next); } catch { /* storage blocked: the choice just won't persist */ }
  };
  return [theme, toggle];
}

function Main({ me, onSignOut }) {
  const [status, setStatus] = useState(null);
  const [statusErr, setStatusErr] = useState('');
  // Facebook sends people back with ?meta=connected or ?meta=error&msg=...: show the Account page with the result.
  const [metaNotice, setMetaNotice] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [activeId, setActiveId] = useState(null); // null = new run
  const [busy, setBusy] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [theme, toggleTheme] = useTheme();

  const refreshStatus = useCallback(async () => {
    try { setStatus(await api.status()); setStatusErr(''); }
    catch (e) { if (e.code !== 'unauthenticated') { setStatus(null); setStatusErr(e.status ? e.message : 'Cannot reach the local server. Start it with "npm run dev" in the app folder.'); } }
  }, []);
  const refreshJobs = useCallback(async () => { try { setJobs(await api.listJobs()); } catch { /* shown via status */ } finally { setJobsLoading(false); } }, []);
  useEffect(() => { refreshStatus(); refreshJobs(); }, [refreshStatus, refreshJobs]);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const m = q.get('meta');
    if (!m) return;
    setMetaNotice(m === 'connected' ? { ok: true, text: 'Facebook connected. You can now post ads from the Static ads tab.' } : { ok: false, text: 'Facebook was not connected: ' + (q.get('msg') || 'cancelled') });
    setActiveId(ACCOUNT);
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const toggleWorkflow = async () => {
    setBusy(true);
    try { status.workflow.active ? await api.deactivate() : await api.activate(); await refreshStatus(); }
    catch (e) { setStatusErr(e.message); }
    finally { setBusy(false); }
  };

  const removeRun = async (job) => {
    try {
      const r = await api.removeJob(job.id);
      if (activeId === job.id) setActiveId(null);
      if (r && r.drive === 'failed') setStatusErr('The run was removed, but its Google Drive folder could not be deleted (' + (r.driveError || 'unknown error') + '). Delete it by hand in Drive if you want it gone.');
      await refreshJobs();
    } catch (e) { setStatusErr(e.message); }
  };

  // Quick re-run from the sidebar: dry runs restart straight away; paid runs open the run page so the cost choice is explicit.
  const rerunFromList = async (job) => {
    if (!(job.options && job.options.dryRun)) { setActiveId(job.id); return; }
    try { const { id } = await api.rerunJob(job.id); await refreshJobs(); setActiveId(id); }
    catch (e) { setStatusErr(e.message); }
  };
  const afterRerun = async (id) => { await refreshJobs(); setActiveId(id); };

  const wf = status && status.workflow;
  const ready = !!(status && status.n8n && wf && wf.active);
  const special = activeId === USERS || activeId === ACCOUNT || activeId === USAGE;
  const runId = special ? null : activeId;

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><span className="logo" aria-hidden><Sparkles size={15} /></span> Creative Engine</div>
        <button className={'newbtn' + (activeId === null ? ' off' : '')} onClick={() => setActiveId(null)}><Plus size={16} /> New run</button>
        <History jobs={jobs} loading={jobsLoading} activeId={runId} onPick={setActiveId} onRemove={removeRun} onRerun={rerunFromList} />
        <div className="side-foot">
          {me.isAdmin && me.authEnabled && (
            <button className={'themebtn' + (activeId === USERS ? ' on' : '')} onClick={() => setActiveId(USERS)}>
              <span className="tile soft"><UsersIcon size={15} /></span> Users
            </button>
          )}
          <button className={'themebtn' + (activeId === USAGE ? ' on' : '')} onClick={() => setActiveId(USAGE)}>
            <span className="tile soft"><Wallet size={15} /></span> Usage and cost
          </button>
          <button className="themebtn" onClick={toggleTheme} aria-pressed={theme === 'dark'}>
            <span className="tile soft">{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}</span>
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          {me.authEnabled && (
            <div className="userbox">
              <button className={'userbtn' + (activeId === ACCOUNT ? ' on' : '')} onClick={() => setActiveId(ACCOUNT)} title="Account and password">
                <span className="avatar" aria-hidden>{(me.email || '?')[0].toUpperCase()}</span>
                <span className="uname">{me.email}</span>
                <Settings size={15} />
              </button>
              <button className="signout" onClick={onSignOut} aria-label="Sign out" title="Sign out"><LogOut size={15} /></button>
            </div>
          )}
        </div>
      </aside>

      <main className="main">
        {wf && !wf.active && me.isAdmin && (
          <header className="top">
            <span className="crumb" />
            <button className="pill warn" onClick={toggleWorkflow} disabled={busy} title="Click to activate so runs can start">
              <Power size={13} /> {busy ? 'Activating…' : 'Workflow inactive: click to activate'}
            </button>
          </header>
        )}

        {statusErr && <div className="banner err" role="alert"><AlertTriangle size={16} />{statusErr}</div>}
        {status && !status.n8n && <div className="banner err" role="alert"><AlertTriangle size={16} />n8n is not reachable: {status.error || 'check N8N_API and N8N_BASE_URL in .env'}</div>}
        {status && status.storage && !status.storage.ok && <div className="banner err" role="alert"><AlertTriangle size={16} />Run storage ({status.storage.kind}) is not working: {status.storage.error}</div>}
        {wf && !wf.active && <div className="banner warn"><AlertTriangle size={16} />{me.isAdmin ? "The workflow is inactive, so new runs can't start. Activating exposes a private webhook link; anyone who had it could spend your API credits." : "The workflow is switched off, so new runs can't start right now. Ask an admin to turn it on."}</div>}

        {activeId === USERS ? <Users myEmail={me.email} />
          : activeId === USAGE ? <Usage me={me} />
          : activeId === ACCOUNT ? <Account me={me} onSignOut={onSignOut} notice={metaNotice} />
          : activeId === null ? <RunForm disabled={!ready} onStarted={async (id) => { await refreshJobs(); setActiveId(id); }} />
          : <RunView key={activeId} id={activeId} onFinished={refreshJobs} onRerun={afterRerun} onGoAccount={() => setActiveId(ACCOUNT)} />}
      </main>
    </div>
  );
}

function Centered({ children }) {
  return <div className="authwrap"><div className="authcard center">{children}</div></div>;
}

export default function App() {
  const [gate, setGate] = useState('loading'); // loading | signedout | pending | ready | error
  const [me, setMe] = useState(null);

  const resolve = useCallback(async () => {
    try {
      const cfg = await auth.config();
      if (!cfg.enabled) { setMe({ email: '', isAdmin: true, approved: true, authEnabled: false }); setGate('ready'); return true; }
      if (!auth.hasSession()) { setGate('signedout'); return false; }
      try {
        const m = await auth.me();
        setMe(m); setGate(m.approved ? 'ready' : 'pending');
        return m.approved;
      } catch (e) {
        if (e.code === 'unauthenticated' || e.status === 401) { auth.signOut(); setGate('signedout'); return false; }
        throw e;
      }
    } catch { setGate('error'); return false; }
  }, []);

  useEffect(() => { resolve(); }, [resolve]);
  // If the session is lost anywhere (expired refresh token, sign-out), go back to the sign-in screen.
  useEffect(() => auth.onChange((s) => { if (!s) { setMe(null); setGate((g) => (g === 'loading' || g === 'error' ? g : 'signedout')); } }), []);

  if (gate === 'loading') {
    return <Centered><Bone w={48} h={48} r={14} style={{ margin: '0 auto' }} /><Bone w="60%" h={16} style={{ margin: '14px auto 0' }} /></Centered>;
  }
  if (gate === 'error') {
    return (
      <Centered>
        <span className="tile big" style={{ color: 'var(--bad)', background: 'var(--bad-soft)' }}><AlertTriangle size={22} /></span>
        <h2>Can't reach the server</h2>
        <p className="muted">Start it with <code>npm run dev</code> in the app folder, then try again.</p>
        <button className="go" onClick={resolve}><RefreshCw size={16} /> Try again</button>
      </Centered>
    );
  }
  if (gate === 'signedout') return <AuthScreen onAuthed={resolve} />;
  if (gate === 'pending') return <Pending email={me && me.email} onCheck={resolve} onSignOut={() => auth.signOut()} />;
  return <Main me={me} onSignOut={() => auth.signOut()} />;
}
