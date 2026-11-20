const fs = require('fs'); let p = 'app/web/src/components/PostDialog.jsx', s = fs.readFileSync(p, 'utf8');
const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('nf ' + a.slice(0, 70)); s = s.replace(a, () => b); };
rep("              {dest !== 'ads' || true ? (\n                <label>", "              {(\n                <label>");
rep("                </label>\n              ) : null}\n", "                </label>\n              )}\n");
rep(" && /^https?:\/\//.test(link || 'https://x') ;", " && (dest === 'instagram' || /^https?:\/\//.test(link));");
fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
