// Supabase Auth (email + password) through the backend, so the browser never needs a Supabase key.
import crypto from 'crypto';

export function createAuth({ supabaseUrl, apiKey }) {
  const base = supabaseUrl.replace(/\/+$/, '') + '/auth/v1';
  const headers = { apikey: apiKey, 'content-type': 'application/json' };

  async function gotrue(pathAndQuery, { method = 'POST', body, token } = {}) {
    const r = await fetch(base + pathAndQuery, {
      method,
      headers: { ...headers, ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const text = await r.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = { msg: text.slice(0, 200) }; }
    if (!r.ok) {
      const code = json.error_code || json.code || '';
      const raw = json.msg || json.error_description || json.message || json.error || 'Authentication failed';
      throw Object.assign(new Error(friendly(code, raw)), { status: r.status >= 500 ? 502 : r.status === 429 ? 429 : 400, code });
    }
    return json;
  }

  const friendly = (code, raw) => ({
    invalid_credentials: 'Wrong email or password.',
    email_not_confirmed: 'Confirm your email first: open the link we emailed you, then sign in.',
    user_already_exists: 'An account with this email already exists. Sign in instead.',
    weak_password: 'That password is too weak. Use at least 8 characters.',
    over_email_send_rate_limit: 'Too many emails were sent just now. Wait a few minutes and try again.',
    signup_disabled: 'Sign-up is turned off for this app.',
    validation_failed: 'Enter a valid email address and password.',
  }[code] || raw);

  const session = (j) => ({
    accessToken: j.access_token, refreshToken: j.refresh_token,
    expiresAt: j.expires_at || (j.expires_in ? Math.floor(Date.now() / 1000) + j.expires_in : null),
    user: j.user ? { id: j.user.id, email: j.user.email } : null,
  });

  // Tokens are verified against Supabase and cached briefly to avoid a round trip on every request.
  const cache = new Map();
  const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');

  return {
    async signIn(email, password) {
      return session(await gotrue('/token?grant_type=password', { body: { email, password } }));
    },
    async signUp(email, password) {
      const j = await gotrue('/signup', { body: { email, password } });
      // With "Confirm email" on, Supabase returns the user without a session.
      if (j.access_token) return { needsConfirmation: false, session: session(j) };
      return { needsConfirmation: true, session: null };
    },
    // Verifies the current password by signing in with it, then sets the new one with that fresh session.
    async changePassword(email, currentPassword, newPassword) {
      let s;
      try { s = session(await gotrue('/token?grant_type=password', { body: { email, password: currentPassword } })); }
      catch (e) { if (e.code === 'invalid_credentials') throw Object.assign(new Error('Your current password is incorrect.'), { status: 400 }); throw e; }
      await gotrue('/user', { method: 'PUT', token: s.accessToken, body: { password: newPassword } });
    },
    async refresh(refreshToken) {
      return session(await gotrue('/token?grant_type=refresh_token', { body: { refresh_token: refreshToken } }));
    },
    async verify(token) {
      if (!token) return null;
      const k = hash(token);
      const hit = cache.get(k);
      if (hit && hit.exp > Date.now()) return hit.user;
      let u;
      try { u = await gotrue('/user', { method: 'GET', token }); } catch (e) { if (e.status === 400) return null; throw e; }
      const user = u && u.id ? { id: u.id, email: (u.email || '').toLowerCase() } : null;
      if (user) cache.set(k, { user, exp: Date.now() + 60000 });
      if (cache.size > 500) cache.clear();
      return user;
    },
  };
}

// Small in-memory limiter for the public sign-in/up endpoints.
export function rateLimiter({ max, windowMs }) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip || 'x';
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Too many attempts. Wait a minute and try again.' });
    arr.push(now); hits.set(key, arr);
    if (hits.size > 1000) hits.clear();
    next();
  };
}
