// Encrypts stored access tokens (AES-256-GCM) and signs short-lived OAuth "state" values, with one server key.
// TOKEN_ENC_KEY: 32 random bytes, base64 (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))").
import crypto from 'crypto';

export function createSecrets(keyB64) {
  let key = null;
  try { const k = Buffer.from(String(keyB64 || ''), 'base64'); if (k.length === 32) key = k; } catch { /* no key */ }
  const need = () => { if (!key) throw Object.assign(new Error('TOKEN_ENC_KEY is not set (32 random bytes, base64). Needed to store connected accounts safely.'), { status: 500 }); return key; };
  return {
    configured: !!key,
    encrypt(obj) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', need(), iv);
      const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
    },
    decrypt(text) {
      const b = Buffer.from(String(text || ''), 'base64');
      const d = crypto.createDecipheriv('aes-256-gcm', need(), b.subarray(0, 12));
      d.setAuthTag(b.subarray(12, 28));
      return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
    },
    // A value that proves "this user started this connection a moment ago" (used as OAuth state).
    sign(payload, ttlSec = 600) {
      const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec })).toString('base64url');
      return body + '.' + crypto.createHmac('sha256', need()).update(body).digest('base64url');
    },
    verify(token) {
      const [body, sig] = String(token || '').split('.');
      if (!body || !sig) return null;
      const want = crypto.createHmac('sha256', need()).update(body).digest('base64url');
      if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
      try { const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); return p.exp > Date.now() / 1000 ? p : null; } catch { return null; }
    },
  };
}
