const fs = require('fs'); let p, s, crlf;
const open = (f) => { p = f; s = fs.readFileSync(f, 'utf8'); crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n'); };
const save = () => fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
const rep = (a, b) => { if (!s.includes(a)) throw new Error('nf ' + a.slice(0, 70)); s = s.replace(a, () => b); };

open('app/web/src/components/ConnectedAccounts.jsx');
rep("export default function ConnectedAccounts({ notice }) {", "export default function ConnectedAccounts({ notice, isAdmin }) {");
rep("          <span className=\"muted small\">Connect your own Facebook account to post ads from here: Meta ads (always created paused), Facebook Page posts, and Instagram. Other people who use this app connect their own.</span>", "          <span className=\"muted small\">Connect Facebook to post your ads straight from here. Nothing is posted without your OK, and ads are always created paused.</span>");
const a = s.indexOf("      ) : !st.configured ? (");
const b = s.indexOf("      ) : !st.connected ? (");
if (a < 0 || b < 0) throw new Error('block');
s = s.slice(0, a) + `      ) : !st.configured ? (
        isAdmin ? (
          <div className="banner warn" style={{ marginTop: 14, display: 'block' }}>
            <b>Facebook posting needs a one-time setup.</b>
            <p className="small" style={{ margin: '6px 0 0' }}>It takes about ten minutes and only has to be done once for everyone.</p>
            <details style={{ marginTop: 8 }}>
              <summary className="small">Show the setup details</summary>
              <ol className="small" style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.6 }}>
                <li>Create an app at developers.facebook.com (type Business) and add Facebook Login and Marketing API.</li>
                <li>Add this as a Valid OAuth Redirect URI: <code>{st.redirectUri}</code></li>
                <li>Put the app's ID and secret into the server settings{st.missing.length ? ': still missing ' + st.missing.join(', ') : ''}.</li>
              </ol>
              <p className="note" style={{ margin: '8px 0 0' }}>The full steps are in SETUP.md under "Posting to Meta".</p>
            </details>
          </div>
        ) : (
          <div className="banner warn" style={{ marginTop: 14 }}><AlertTriangle size={16} />Posting to Facebook and Instagram is not switched on yet. Ask the app admin to turn it on.</div>
        )
` + s.slice(b);
rep("<p className=\"note\" style={{ marginTop: 8 }}>You will sign in at Facebook and choose which Pages and ad accounts to share. This app can only post when you confirm each post.</p>", "<p className=\"note\" style={{ marginTop: 8 }}>You sign in at Facebook and choose which Pages and ad accounts to use. Only you can post with your account.</p>");
save();

open('app/web/src/components/Account.jsx');
rep("<ConnectedAccounts notice={notice} />", "<ConnectedAccounts notice={notice} isAdmin={!!me.isAdmin} />");
save();

open('app/web/src/components/PostDialog.jsx');
rep("<p className=\"small\" style={{ margin: '6px 0 8px' }}>{meta.configured ? 'It takes a minute: you sign in at Facebook and choose the Pages and ad accounts to use.' : 'Facebook is not set up on this server yet (see Account > Connected accounts).'}</p>\n            <button className=\"btn sm\" onClick={() => { onClose(); goAccount && goAccount(); }}>Go to Connected accounts</button>", "<p className=\"small\" style={{ margin: '6px 0 8px' }}>{meta.configured ? 'It takes a minute: you sign in at Facebook and choose the Pages and ad accounts to use.' : 'Posting is not switched on yet. Ask the app admin to turn it on.'}</p>\n            {meta.configured && <button className=\"btn sm\" onClick={() => { onClose(); goAccount && goAccount(); }}>Connect Facebook</button>}");
save();
