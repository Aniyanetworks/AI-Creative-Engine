import React, { useState } from 'react';
import { Globe, ArrowRight, Loader2, FileText, Image as ImageIcon, Layers, ChevronRight, ScanSearch, Wand2, FolderOpen, AlertTriangle } from 'lucide-react';
import { api } from '../api.js';
import { useModels, loadChoice, saveChoice } from '../models.js';

const TEST_SITES = ['aniyanetworks.net', 'answerandbook.ca', 'buildpartner.cc'];

const MODES = {
  dry: { label: 'Dry run', icon: FileText, cost: 'Cents', blurb: 'Brief, hooks, ad copy and video scripts. No images or videos rendered.', dryRun: true, maxImages: 0, maxVideos: 0 },
  test: { label: 'Image test', icon: ImageIcon, cost: 'About a dollar', blurb: 'Everything above plus 1 rendered image, to check quality before spending more.', dryRun: false, maxImages: 1, maxVideos: 0 },
  full: { label: 'Full run', icon: Layers, cost: 'Highest', blurb: 'All 20 images, plus videos if HeyGen is set up. Use once the test looks right.', dryRun: false, maxImages: 20, maxVideos: 5 },
};

const HOW = [
  { icon: ScanSearch, title: 'Research', text: 'Reads the site, finds brand colors, studies competitors' },
  { icon: Wand2, title: 'Create', text: '10 hooks, 20 static ads, 5 video scripts' },
  { icon: FolderOpen, title: 'Deliver', text: 'Report saved to your Google Drive, ready to hand off' },
];

export default function RunForm({ disabled, onStarted }) {
  const [url, setUrl] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState('dry');
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const models = useModels();
  const [claudeModel, setClaudeModel] = useState(() => loadChoice('ace-run-claude'));
  const [imageModel, setImageModel] = useState(() => loadChoice('ace-run-image'));

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setSending(true);
    const m = MODES[mode];
    const clean = /^https?:\/\//i.test(url.trim()) ? url.trim() : 'https://' + url.trim();
    try {
      const { id } = await api.startJob({ url: clean, businessName, competitorNotes: notes, dryRun: m.dryRun, maxImages: m.maxImages, maxVideos: m.maxVideos, models: { claude: claudeModel || undefined, image: imageModel || undefined } });
      await onStarted(id);
    } catch (e2) { setErr(e2.message); }
    finally { setSending(false); }
  };

  return (
    <form className="hero" onSubmit={submit}>
      <span className="eyebrow"><Wand2 size={13} /> AI ad generator</span>
      <h1>Give us a website.<br /><span className="grad">Get ready-to-run ads.</span></h1>
      <p className="lede">We read the site, study the competition, then write 10 hooks, 20 static ads and 5 short video scripts, ready for Meta and TikTok.</p>

      <div className="urlbar">
        <Globe size={20} className="urlico" aria-hidden />
        <input aria-label="Business website" placeholder="example.com" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus required />
        <button className="go" disabled={disabled || sending || !url.trim()}>
          {sending ? <><Loader2 size={17} className="rot" /> Starting…</> : <>Generate ads <ArrowRight size={17} /></>}
        </button>
      </div>
      <div className="chips">
        <span>Try:</span>
        {TEST_SITES.map((s) => <button type="button" key={s} className="chip" onClick={() => setUrl(s)}>{s}</button>)}
      </div>
      {disabled && <p className="muted small" style={{ marginTop: 10 }}>Activate the workflow (top right) to enable runs.</p>}
      {err && <div className="banner err" role="alert" style={{ marginTop: 14 }}><AlertTriangle size={16} />{err}</div>}
      {models && (
        <details className="aimodels">
          <summary>AI models <span className="muted">· {(models.claude.find((x) => x.id === (claudeModel || models.defaults.claude)) || {}).label || claudeModel}</span></summary>
          <div className="aimodels-grid">
            <label>Writing (brief, hooks, ads, scripts)
              <select value={claudeModel || models.defaults.claude} onChange={(e) => { const v = e.target.value === models.defaults.claude ? '' : e.target.value; setClaudeModel(v); saveChoice('ace-run-claude', v); }}>
                {models.claude.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label>Images
              <select value={imageModel || models.defaults.image} onChange={(e) => { const v = e.target.value === models.defaults.image ? '' : e.target.value; setImageModel(v); saveChoice('ace-run-image', v); }}>
                {models.image.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
          </div>
          <p className="note">A bigger writing model gives sharper copy but costs more and takes longer. You can change the image model and quality later, per image.</p>
        </details>
      )}

      <div className="modes" role="radiogroup" aria-label="How much to generate">
        {Object.entries(MODES).map(([k, m]) => {
          const Icon = m.icon;
          return (
            <button type="button" key={k} role="radio" aria-checked={mode === k} className={'mode' + (mode === k ? ' on' : '')} onClick={() => setMode(k)}>
              <span className="mode-top"><span className="tile"><Icon size={18} /></span><span className="cost">{m.cost}</span></span>
              <b>{m.label}</b>
              <span>{m.blurb}</span>
            </button>
          );
        })}
      </div>

      <details className="adv">
        <summary><ChevronRight size={15} className="chev" /> Optional details</summary>
        <div className="fields">
          <div>
            <label htmlFor="bn">Business name</label>
            <input id="bn" placeholder="Only if you want to override what we find" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="cn">Competitor ads or notes</label>
            <textarea id="cn" rows={4} placeholder="Paste ads you found in the Meta Ad Library (advertiser, hook, offer). Without this, the competitor analysis is marked as inferred." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </details>

      <div className="how">
        {HOW.map((h, i) => {
          const Icon = h.icon;
          return (
            <div key={h.title} className="how-item">
              <span className="tile soft"><Icon size={18} /></span>
              <div><b>{i + 1}. {h.title}</b><span>{h.text}</span></div>
            </div>
          );
        })}
      </div>
    </form>
  );
}
