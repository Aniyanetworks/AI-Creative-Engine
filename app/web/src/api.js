// API client with session handling. The session (access + refresh token) lives in this browser's
// localStorage; the browser never holds a Supabase key.
const KEY = 'ace-session';

function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
function persist(s) { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* storage blocked: stays signed in for this tab only */ } }

let session = load();
const listeners = new Set();
const emit = () => listeners.forEach((f) => f(session));
function setSession(s) { session = s; persist(s); emit(); }

async function send(path, opts = {}) {
  const r = await fetch('/api' + path, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(session ? { Authorization: 'Bearer ' + session.accessToken } : {}), ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await r.json(); } catch { /* empty body */ }
  return { r, data };
}

let refreshing = null;
function refreshSession() {
  if (!session || !session.refreshToken) return Promise.resolve(false);
  if (!refreshing) {
    refreshing = send('/auth/refresh', { method: 'POST', body: { refreshToken: session.refreshToken }, headers: { Authorization: '' } })
      .then(({ r, data }) => { if (r.ok && data.accessToken) { setSession(data); return true; } setSession(null); return false; })
      .catch(() => false)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function call(path, opts = {}) {
  let { r, data } = await send(path, opts);
  if (r.status === 401 && session && !path.startsWith('/auth/')) {
    if (await refreshSession()) ({ r, data } = await send(path, opts));
    else throw Object.assign(new Error('Your session expired. Please sign in again.'), { code: 'unauthenticated' });
  }
  if (!r.ok) throw Object.assign(new Error(data.error || 'Request failed (' + r.status + ')'), { code: data.code, status: r.status });
  return data;
}

export const auth = {
  config: () => call('/auth/config'),
  hasSession: () => !!session,
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  async signIn(email, password) { setSession(await call('/auth/signin', { method: 'POST', body: { email, password } })); },
  async signUp(email, password) {
    const out = await call('/auth/signup', { method: 'POST', body: { email, password } });
    if (out.session) setSession(out.session);
    return out;
  },
  signOut() { setSession(null); },
  me: () => call('/me'),
  changePassword: (currentPassword, newPassword) => call('/account/password', { method: 'POST', body: { currentPassword, newPassword } }),
};

export const api = {
  status: () => call('/status'),
  activate: () => call('/workflow/activate', { method: 'POST' }),
  deactivate: () => call('/workflow/deactivate', { method: 'POST' }),
  startJob: (body) => call('/jobs', { method: 'POST', body }),
  listJobs: () => call('/jobs'),
  getJob: (id) => call('/jobs/' + id),
  removeJob: (id) => call('/jobs/' + id, { method: 'DELETE' }),
  getVideos: (id) => call('/jobs/' + id + '/videos'),
  renderVideos: (id, voiceId, only) => call('/jobs/' + id + '/render-videos', { method: 'POST', body: { voiceId: voiceId || '', only: only || [] } }),
  getPreview: (id, n) => call('/jobs/' + id + '/statics/' + n + '/preview'),
  renderStatic: (id, n, opts) => call('/jobs/' + id + '/statics/' + n + '/image', { method: 'POST', body: opts || {} }),
  saveToDrive: (id) => call('/jobs/' + id + '/save-to-drive', { method: 'POST' }),
  getUsage: (range, user) => call('/usage?range=' + encodeURIComponent(range || 'month') + (user && user !== 'all' ? '&user=' + encodeURIComponent(user) : '')),
  getVoices: () => call('/voices'),
  rerunJob: (id, body) => call('/jobs/' + id + '/rerun', { method: 'POST', body: body || {} }),
  listUsers: () => call('/admin/users'),
  approveUser: (id) => call('/admin/users/' + id + '/approve', { method: 'POST' }),
  revokeUser: (id) => call('/admin/users/' + id + '/revoke', { method: 'POST' }),
};
