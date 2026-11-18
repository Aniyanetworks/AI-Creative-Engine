// Pure timing helpers shared by render.mjs (Node) and the Remotion project (webpack). No dependencies.
// An "alignment" is ElevenLabs' character timing: { characters[], character_start_times_seconds[], character_end_times_seconds[] }.

// Evenly paced stand-in alignment, used for the demo and for silent (no voiceover) videos.
export function estimateAlignment(text, wordsPerSecond = 2.6) {
  const chars = [...text];
  const words = text.split(/\s+/).filter(Boolean).length || 1;
  const total = words / wordsPerSecond;
  const per = total / Math.max(1, chars.length);
  return {
    characters: chars,
    character_start_times_seconds: chars.map((_, i) => i * per),
    character_end_times_seconds: chars.map((_, i) => (i + 1) * per),
  };
}

// Groups characters into words with start/end seconds (shifted by offsetSec).
export function charsToWords(alignment, offsetSec = 0) {
  const { characters: ch, character_start_times_seconds: st, character_end_times_seconds: en } = alignment;
  const words = [];
  let cur = '';
  let start = 0;
  let end = 0;
  for (let i = 0; i < ch.length; i++) {
    if (/\s/.test(ch[i])) {
      if (cur) { words.push({ text: cur, startSec: start + offsetSec, endSec: end + offsetSec }); cur = ''; }
    } else {
      if (!cur) start = st[i];
      cur += ch[i];
      end = en[i];
    }
  }
  if (cur) words.push({ text: cur, startSec: start + offsetSec, endSec: end + offsetSec });
  return words;
}

// Turns a storyboard + character timing into absolute scene times, caption words and total duration.
// scenes[i].vo is spoken in order; the voiceover text is exactly the vo fields joined by one space.
export function buildTimeline({ scenes, alignment, leadSec = 0.4, tailSec = 1.0, anticipationSec = 0.14 }) {
  const text = scenes.map((s) => s.vo).join(' ');
  const n = alignment.characters.length;
  const map = (idx) => Math.min(n - 1, Math.round(idx * (n / Math.max(1, text.length)))); // tolerate normalised text
  const starts = [];
  let offset = 0;
  for (const s of scenes) { starts.push(offset); offset += s.vo.length + 1; }
  const speechEnd = alignment.character_end_times_seconds[n - 1] || 0;
  const durationSec = leadSec + speechEnd + tailSec;

  const timed = scenes.map((s, i) => {
    const startSec = i === 0 ? 0 : Math.max(0, alignment.character_start_times_seconds[map(starts[i])] + leadSec - anticipationSec);
    return { ...s, startSec };
  });
  timed.forEach((s, i) => { s.endSec = i === timed.length - 1 ? durationSec : timed[i + 1].startSec; });
  return { scenes: timed, words: charsToWords(alignment, leadSec), durationSec, leadSec };
}
