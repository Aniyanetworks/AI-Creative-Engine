// The AI models people may pick in the app. Only ids listed here are ever sent to Claude / OpenAI, so a request cannot ask
// for an arbitrary (or very expensive) model. Override the lists with CLAUDE_MODELS / IMAGE_MODELS (comma separated ids,
// optionally "id:Label") and the defaults with CLAUDE_MODEL / IMAGE_MODEL.
const CLAUDE = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (balanced)' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (best writing, slower, costs more)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fastest, cheapest)' },
  { id: 'claude-fable-5-2', label: 'Claude Fable 5.2' },
];
const IMAGE = [
  { id: 'gpt-image-2', label: 'GPT Image 2 (best quality)' },
  { id: 'gpt-image-1.5', label: 'GPT Image 1.5' },
  { id: 'gpt-image-1-mini', label: 'GPT Image 1 mini (cheapest)' },
];
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,59}$/;

const parse = (text, fallback) => {
  const out = String(text || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => { const i = s.indexOf(':'); const id = (i > 0 ? s.slice(0, i) : s).trim(); return { id, label: (i > 0 ? s.slice(i + 1) : id).trim() }; }).filter((m) => ID.test(m.id));
  return out.length ? out : fallback;
};

export function createModels(pick) {
  const claude = parse(pick('CLAUDE_MODELS'), CLAUDE);
  const image = parse(pick('IMAGE_MODELS'), IMAGE);
  const first = (list, want) => (list.some((m) => m.id === want) ? want : list[0].id);
  const defaults = { claude: first(claude, pick('CLAUDE_MODEL') || 'claude-sonnet-5-5'), image: first(image, pick('IMAGE_MODEL') || 'gpt-image-2') };
  return {
    claude, image, defaults,
    // Returns the id if it is an allowed model of that kind, '' if nothing was asked for, and throws for anything else.
    pick(kind, id) {
      const want = String(id || '').trim();
      if (!want) return '';
      if (!(kind === 'claude' ? claude : image).some((m) => m.id === want)) throw Object.assign(new Error('That model is not available: ' + want.slice(0, 60)), { status: 400 });
      return want;
    },
  };
}
