// Code shared by the main workflow (tools/build_workflow.js) and the "write more" workflow (tools/deploy_write_n8n.js).
// These strings are JavaScript for n8n Code nodes, written exactly as they appear inside a template literal.
module.exports = {
  CLEAN_TAGS: `const cleanTags = (t) => [...new Set((Array.isArray(t) ? t : String(t || '').split(' ')).map((x) => '#' + String(x).replace(/[^A-Za-z0-9_]/g, '')).filter((x) => x.length > 1 && x.length <= 40))].slice(0, 8);`,
  VIDEO_NORMALIZER: `const ICONS = ['bolt', 'clock', 'phone', 'shield', 'chart', 'check', 'wrench', 'star', 'mail', 'calendar', 'target', 'dollar'];
const KINDS = ['hook', 'point', 'proof', 'cta'];
const str = (v, n) => String(v == null ? '' : v).replace(/\\s+/g, ' ').trim().slice(0, n);

// Fallback storyboard when the model returns only a plain script: one scene per sentence.
const scenesFromScript = (script, cta) => {
  const sentences = String(script || '').match(/[^.!?]+[.!?]*/g) || [];
  const parts = sentences.map((x) => x.trim()).filter(Boolean).slice(0, 6);
  return parts.map((vo, i) => ({
    kind: i === 0 ? 'hook' : i === parts.length - 1 ? 'cta' : 'point',
    vo, headline: vo.split(' ').slice(0, 5).join(' ').replace(/[.,!?]+$/, ''), highlight: '', sub: i === parts.length - 1 ? str(cta, 40) : '', icon: 'star',
  }));
};

const normalizeVideo = (v, i) => {
  let scenes = Array.isArray(v.scenes) ? v.scenes : [];
  if (scenes.length < 3) scenes = scenesFromScript(v.spoken_script, v.cta);
  scenes = scenes.slice(0, 7).map((sc, k, all) => {
    const headline = str(sc.headline, 40);
    const words = headline.split(' ');
    const hl = words.find((w) => w.toLowerCase().replace(/[^a-z0-9%+$]/g, '') === String(sc.highlight || '').toLowerCase().replace(/[^a-z0-9%+$]/g, '')) || '';
    return {
      kind: KINDS.includes(sc.kind) ? sc.kind : k === 0 ? 'hook' : k === all.length - 1 ? 'cta' : 'point',
      vo: str(sc.vo, 220), headline, highlight: hl, sub: str(sc.sub, 60), icon: ICONS.includes(sc.icon) ? sc.icon : 'star',
    };
  }).filter((sc) => sc.vo);
  if (scenes.length < 2) throw new Error('Video ' + (i + 1) + ' has no usable storyboard');
  const spoken = scenes.map((sc) => sc.vo).join(' '); // the voiceover is exactly the scene lines
  return { ...v, id: v.id || i + 1, hashtags: cleanTags(v.hashtags), scenes, spoken_script: spoken, captions: scenes.map((sc) => sc.headline) };
};
`,
};
