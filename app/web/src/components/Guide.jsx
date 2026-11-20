import React from 'react';
import { BookOpen, CheckCircle2, Clapperboard, Facebook, Image as ImageIcon, Lightbulb, PenLine, Rocket, ShieldCheck, Wallet } from 'lucide-react';
import { useHints } from './Hint.jsx';

const SECTIONS = [
  { Icon: Rocket, title: '1. Start a run', items: [
    'Paste a website address and press Generate ads. The app reads the site, studies competitors, then writes 10 hooks, 20 static ads and 5 video scripts.',
    'Choose how much to make: Dry run (a few cents, no pictures), Image test (one picture) or Full run (every image and the videos).',
    'AI models lets you pick the writing and image models for the run. You can leave the defaults.',
  ] },
  { Icon: Lightbulb, title: '2. Read the results', items: [
    'Hooks, Static ads and Videos are the creative. Brief and Competitors explain what the app understood. Report is everything in one document, saved to your Drive.',
    'The Est. cost chip next to Finished shows what the run has cost so far. The Usage tab lists every charge.',
    'You can leave the page while a run works: it keeps going and is saved.',
  ] },
  { Icon: ImageIcon, title: '3. Make the pictures', items: [
    'Static ads start as concept previews. Press Generate image on an ad, or Generate missing for all of them.',
    'Model & quality sets the look and the price: Draft is cheap, High has the sharpest text. Make again lets you say what to change.',
    'Finished pictures are saved in your Drive folder and shown on the card.',
  ] },
  { Icon: Clapperboard, title: '4. Make the videos', items: [
    'On the Videos tab, choose a voice, then Render videos online (about 5 to 8 minutes). Tick videos to render only some, or use Render this video on one card.',
    'Videos use voiceover credits, so the app asks for the voice every time.',
    'Save to Google Drive copies finished videos to Drive without rendering again.',
  ] },
  { Icon: PenLine, title: '5. Improve and extend', items: [
    'Generate more writes new hooks, ads or video scripts that differ from the ones you have.',
    'Rewrite improves one item, with an optional instruction. Add hashtags fills in tags for posts that have none.',
    'A rewritten ad or script marks its old picture or video as out of date until you make it again.',
  ] },
  { Icon: Facebook, title: '6. Post your ads', items: [
    'First connect your own Facebook account in Account > Connected accounts.',
    'Tick ads on the Static ads tab and press Post. Meta ads are created paused, Facebook Page posts are drafts by default, and Instagram publishes straight away.',
    'Every post shows what will happen and needs your confirmation. Green chips on an ad show where it was already sent.',
  ] },
  { Icon: Wallet, title: '7. Watch the cost', items: [
    'Usage and cost (sidebar) shows estimated spend by account, day and run. The numbers are list-price estimates, not a bill.',
    'Cheapest way to work: dry run first, generate only the images you like, render only the videos you need.',
  ] },
  { Icon: ShieldCheck, title: '8. Accounts and safety', items: [
    'New people must be approved by an admin before they can run anything, because every run spends API credits.',
    'Deleting a run removes it from the app and moves its Drive folder to the Drive bin.',
    'Check every claim in the ads with the client before spending money. The Brief tab lists the claims to verify.',
  ] },
];

export default function Guide() {
  const { enabled, setEnabled } = useHints();
  return (
    <div className="guide">
      <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><BookOpen size={20} /> Guide</h2>
          <p className="muted small" style={{ margin: '4px 0 0' }}>How everything works, in order. Small ? buttons around the app explain each feature in place.</p>
        </div>
        <label className="switch" title="Show or hide the small ? hints around the app">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>Show hints</span>
        </label>
      </div>
      <div className="guide-grid">
        {SECTIONS.map(({ Icon, title, items }) => (
          <section key={title} className="card guide-card">
            <h3><span className="tile"><Icon size={16} /></span> {title}</h3>
            <ul>{items.map((t) => <li key={t}><CheckCircle2 size={13} aria-hidden /> <span>{t}</span></li>)}</ul>
          </section>
        ))}
      </div>
    </div>
  );
}
