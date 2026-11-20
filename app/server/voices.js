// Voices the user can pick for the voiceover. Lists the account's ElevenLabs voices when the key allows it
// (it needs the "Voices: Read" permission); otherwise falls back to ElevenLabs' stock voices.
export const DEFAULT_VOICE_ID = 'BhPt5zyH4oeDFv1tYZ0N'; // used when no voice is chosen (also the fallback in video/render.mjs)
export const STOCK_VOICES = [
  { id: DEFAULT_VOICE_ID, name: 'Default voice', note: 'used when you do not choose' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', note: 'calm, warm woman' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', note: 'soft, friendly woman' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', note: 'young, upbeat woman' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', note: 'confident, energetic woman' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', note: 'deep, narrator man' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', note: 'deep, young man' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', note: 'warm, well-rounded man' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', note: 'strong, crisp man' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', note: 'raspy, casual man' },
];

export const isVoiceId = (v) => typeof v === 'string' && /^[A-Za-z0-9]{12,40}$/.test(v);

const cache = new Map(); // key -> { at, ttl, value }
export async function listVoices({ apiKey, base = 'https://api.elevenlabs.io', fetchImpl = fetch } = {}) {
  const fallback = { source: 'stock', voices: STOCK_VOICES.map((v) => ({ ...v, previewUrl: null })) };
  if (!apiKey) return fallback;
  const hit = cache.get(apiKey);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value;
  // Remember a refusal (typically a key without "Voices: Read") for a while too, so every page load does not wait on it.
  const remember = (value, ttl) => { cache.set(apiKey, { at: Date.now(), ttl, value }); return value; };
  try {
    const r = await fetchImpl(base.replace(/\/+$/, '') + '/v1/voices', { headers: { 'xi-api-key': apiKey }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return remember(fallback, 5 * 60 * 1000); // typically 401: the key has no "Voices: Read" permission
    const j = await r.json();
    const voices = (j.voices || []).filter((v) => isVoiceId(v.voice_id)).map((v) => ({
      id: v.voice_id, name: v.name,
      note: [v.labels && v.labels.gender, v.labels && v.labels.accent, v.labels && (v.labels.description || v.labels.use_case)].filter(Boolean).join(', '),
      previewUrl: v.preview_url || null,
    }));
    if (!voices.length) return remember(fallback, 5 * 60 * 1000);
    return remember({ source: 'account', voices }, 10 * 60 * 1000);
  } catch { return fallback; }
}
