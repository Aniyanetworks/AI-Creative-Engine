const fs = require('fs'); let p, s, crlf;
const open = (f) => { p = f; s = fs.readFileSync(f, 'utf8'); crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n'); };
const save = () => fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
const rep = (a, b) => { if (!s.includes(a)) throw new Error('nf ' + a.slice(0, 70)); s = s.replace(a, () => b); };

open('app/server/meta.js');
rep("export function createMeta({ appId, appSecret, version = 'v21.0',", "export function createMeta({ appId, appSecret, configId = '', version = 'v21.0',");
rep("    authUrl(state, redirectUri) {\n      const u = new URL(dialogBase.replace(/\/+$/, '') + '/' + version + '/dialog/oauth');\n      u.searchParams.set('client_id', appId); u.searchParams.set('redirect_uri', redirectUri); u.searchParams.set('state', state);\n      u.searchParams.set('scope', SCOPES.join(',')); u.searchParams.set('response_type', 'code');\n      return u.toString();\n    },", "    // Apps that use \"Facebook Login for Business\" log in with a Configuration (its permissions are chosen in the Meta dashboard);\n    // classic apps pass the permissions as a scope.\n    authUrl(state, redirectUri) {\n      const u = new URL(dialogBase.replace(/\/+$/, '') + '/' + version + '/dialog/oauth');\n      u.searchParams.set('client_id', appId); u.searchParams.set('redirect_uri', redirectUri); u.searchParams.set('state', state);\n      u.searchParams.set('response_type', 'code');\n      if (configId) { u.searchParams.set('config_id', configId); u.searchParams.set('override_default_response_type', 'true'); }\n      else u.searchParams.set('scope', SCOPES.join(','));\n      return u.toString();\n    },");
save();

open('app/server/index.js');
rep("const meta = createMeta({ appId: pick('META_APP_ID'), appSecret: pick('META_APP_SECRET'),", "const meta = createMeta({ appId: pick('META_APP_ID'), appSecret: pick('META_APP_SECRET'), configId: pick('META_CONFIG_ID'),");
save();

open('tools/test_meta.mjs');
rep("const ex = await meta.exchange('GOODCODE'", "const metaBiz = createMeta({ appId: 'APPID', appSecret: 'APPSECRET', configId: 'CFG123', graphBase: GRAPH, dialogBase: 'https://fb.example' });\nconst bizUrl = new URL(metaBiz.authUrl('S', 'https://app.example/cb'));\ncheck('client: with a Facebook Login for Business configuration the login link uses config_id (and no scope)', bizUrl.searchParams.get('config_id') === 'CFG123' && bizUrl.searchParams.get('override_default_response_type') === 'true' && bizUrl.searchParams.get('response_type') === 'code' && !bizUrl.searchParams.get('scope'));\nconst ex = await meta.exchange('GOODCODE'");
save();
