import React, { useMemo, useState } from 'react';
import { Check, Copy, Download, FileText, Printer, Code2 } from 'lucide-react';

const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const download = (name, text, type) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
};

// The saved report plus what was added after the run (local competitor research), as one document.
export function buildReport(pack) {
  let md = String(pack.report_markdown || '');
  const areas = Object.values(pack.local_competitors || {});
  if (areas.length) {
    md += '\n\n## Local competitors by area\n';
    for (const a of areas) {
      md += '\n### ' + a.area + '\n\n' + (a.summary ? a.summary + '\n\n' : '');
      for (const c of a.competitors) {
        md += '- **' + c.name + '**' + (c.website ? ' (' + c.website + ')' : '') + ': ' + (c.what_they_do || '') + '\n';
        if (c.offers.length) md += '  - Offers: ' + c.offers.join('; ') + '\n';
        if (c.gaps.length) md += '  - Gaps: ' + c.gaps.join('; ') + '\n';
        if (c.source_urls.length) md += '  - Sources: ' + c.source_urls.join(', ') + '\n';
      }
      if (a.opportunities.length) md += '\n**Opportunities in ' + a.area + ':**\n' + a.opportunities.map((o) => '- ' + o).join('\n') + '\n';
    }
  }
  return md;
}

// Inline formatting: **bold**, `code`, [text](https://...) and bare https:// links. Built as React elements, never as raw HTML.
function inline(text, key) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s)<]+)/g;
  let last = 0; let m; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<strong key={key + '-' + i}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={key + '-' + i}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('[')) { const mm = /^\[([^\]]+)\]\((.+)\)$/.exec(t); out.push(<a key={key + '-' + i} href={mm[2]} target="_blank" rel="noreferrer">{mm[1]}</a>); }
    else out.push(<a key={key + '-' + i} href={t} target="_blank" rel="noreferrer">{t.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}</a>);
    last = m.index + t.length; i += 1;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function parse(md) {
  const blocks = []; const toc = [];
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i += 1; continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(l);
    if (h) { const id = slug(h[2]) + '-' + blocks.length; blocks.push({ t: 'h', level: h[1].length, text: h[2], id }); if (h[1].length === 2) toc.push({ id, text: h[2] }); i += 1; continue; }
    if (/^>\s?/.test(l)) { const q = []; while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i += 1; } blocks.push({ t: 'q', text: q.join(' ') }); continue; }
    if (/^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l)) {
      const ordered = /^\s*\d+\.\s+/.test(l); const items = [];
      while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]))) {
        const depth = /^\s{2,}/.test(lines[i]) ? 1 : 0;
        items.push({ depth, text: lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '') }); i += 1;
      }
      blocks.push({ t: 'l', ordered, items }); continue;
    }
    const p = []; while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>\s?|\s*[-*]\s+|\s*\d+\.\s+)/.test(lines[i])) { p.push(lines[i]); i += 1; }
    blocks.push({ t: 'p', text: p.join(' ') });
  }
  return { blocks, toc };
}

function Doc({ blocks }) {
  return (
    <div className="reportdoc md">
      {blocks.map((b, k) => {
        if (b.t === 'h') { const H = 'h' + (b.level + 1); return React.createElement(H, { key: k, id: b.id }, inline(b.text, k)); }
        if (b.t === 'q') return <blockquote key={k}>{inline(b.text, k)}</blockquote>;
        if (b.t === 'p') return <p key={k}>{inline(b.text, k)}</p>;
        const Tag = b.ordered ? 'ol' : 'ul';
        return <Tag key={k}>{b.items.map((it, j) => <li key={j} className={it.depth ? 'sub' : ''}>{inline(it.text, k + '-' + j)}</li>)}</Tag>;
      })}
    </div>
  );
}

export default function ReportTab({ pack }) {
  const md = useMemo(() => buildReport(pack), [pack]);
  const { blocks, toc } = useMemo(() => parse(md), [md]);
  const [raw, setRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const name = (pack.business || 'ad-pack').replace(/\W+/g, '-').toLowerCase();
  const copy = () => { if (navigator.clipboard) navigator.clipboard.writeText(md).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }, () => {}); };
  const words = md.split(/\s+/).filter(Boolean).length;
  return (
    <>
      <div className="row between reportbar" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="ghost" onClick={copy}>{copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy report</>}</button>
          <button type="button" className="ghost" onClick={() => download(name + '.md', md, 'text/markdown')}><Download size={13} /> Download .md</button>
          <button type="button" className="ghost" onClick={() => download('ad-pack.json', JSON.stringify(pack, null, 2), 'application/json')}><Download size={13} /> Download .json</button>
          <button type="button" className="ghost" onClick={() => window.print()} title="Opens the print dialog: choose Save as PDF"><Printer size={13} /> Print / PDF</button>
        </div>
        <div className="row gap">
          <span className="muted small">{pack.report_drive_url ? <a href={pack.report_drive_url} target="_blank" rel="noreferrer">Open the Drive copy</a> : null}{' '}~{Math.max(1, Math.round(words / 200))} min read</span>
          <div className="seg" role="group" aria-label="Report view">
            <button className={!raw ? 'on' : ''} onClick={() => setRaw(false)}><FileText size={13} /> Formatted</button>
            <button className={raw ? 'on' : ''} onClick={() => setRaw(true)}><Code2 size={13} /> Markdown</button>
          </div>
        </div>
      </div>
      {raw ? <pre className="report">{md}</pre> : (
        <div className="reportwrap">
          {toc.length > 1 && (
            <nav className="toc" aria-label="Report sections">
              <b>On this page</b>
              {toc.map((t) => <a key={t.id} href={'#' + t.id} onClick={(e) => { e.preventDefault(); const el = document.getElementById(t.id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{t.text}</a>)}
            </nav>
          )}
          <Doc blocks={blocks} />
        </div>
      )}
    </>
  );
}
