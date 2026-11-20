const fs = require('fs'); const p = 'app/web/src/components/Results.jsx'; let s = fs.readFileSync(p, 'utf8');
const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
const a = "                    <label className=\"pickvid\"><input type=\"checkbox\" checked={selected.includes(v.id || i + 1)} disabled={busyNow} onChange={() => toggle(v.id || i + 1)} /> Render</label>{i === 0 && <Hint id=\"video.pick\" />}";
if (!s.includes(a)) throw new Error('nf');
s = s.replace(a, () => "                    <><label className=\"pickvid\"><input type=\"checkbox\" checked={selected.includes(v.id || i + 1)} disabled={busyNow} onChange={() => toggle(v.id || i + 1)} /> Render</label>{i === 0 && <Hint id=\"video.pick\" />}</>");
fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
