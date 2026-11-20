// Every <Hint id="..."> in the app must have text in app/web/src/hints.js (and every tab needs one).   Run: node tools/check_hints.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app', 'web', 'src');
const { HINTS } = await import(pathToFileURL(path.join(root, 'hints.js')).href);
const files = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : /\.jsx$/.test(f) && files.push(p); } })(root);
let bad = 0; const used = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/<Hint id="([^"]+)"/g)) { used.add(m[1]); if (!HINTS[m[1]]) { console.log('FAIL missing hint text:', m[1], 'in', path.basename(f)); bad++; } }
}
const tabs = (fs.readFileSync(path.join(root, 'components', 'Results.jsx'), 'utf8').match(/const TABS = \[(.*?)\]/) || [])[1] || '';
for (const t of tabs.split(',').map((x) => x.trim().replace(/['"]/g, '')).filter(Boolean)) if (!HINTS['tab.' + t]) { console.log('FAIL no hint for tab', t); bad++; }
const unused = Object.keys(HINTS).filter((k) => !used.has(k) && !k.startsWith('tab.'));
console.log(bad ? 'SOME FAILED' : 'PASS every hint has text (' + used.size + ' placed, ' + Object.keys(HINTS).length + ' written)');
if (unused.length) console.log('note: written but not placed yet:', unused.join(', '));
process.exit(bad ? 1 : 0);
