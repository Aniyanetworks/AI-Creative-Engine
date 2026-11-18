// Word-by-word headline reveal. Exactly one word may be highlighted.
import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { useTheme, withAlpha } from '../theme';

// Splits words into rows of similar width (minimises the longest row), so a headline never ends with one stranded word.
const MAX_W = 940;
const CHAR_W = 0.47; // average glyph width / font size for the display face (measured from renders)

const splitRows = (words: string[], rows: number): string[][] => {
  if (rows <= 1 || words.length <= 1) return [words];
  let best: string[][] = [words];
  let bestScore = Infinity;
  const go = (start: number, left: number, acc: string[][]) => {
    if (left === 1) {
      const cand = [...acc, words.slice(start)];
      const lens = cand.map((r) => r.join(' ').length);
      const score = Math.max(...lens) * 1000 + (Math.max(...lens) - Math.min(...lens));
      if (score < bestScore) { bestScore = score; best = cand; }
      return;
    }
    for (let i = start + 1; i <= words.length - (left - 1); i++) go(i, left - 1, [...acc, words.slice(start, i)]);
  };
  go(0, Math.min(rows, words.length), []);
  return best;
};

export const layoutRows = (text: string, fontSize: number): string[][] => {
  const words = text.split(' ').filter(Boolean);
  const estWidth = text.length * fontSize * CHAR_W;
  return splitRows(words, Math.max(1, Math.min(3, Math.ceil(estWidth / MAX_W))));
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%+$]/g, '');

// Size by length so short hooks hit hard and longer lines still fit inside the safe zone.
export const headlineSize = (text: string) => (text.length <= 12 ? 138 : text.length <= 20 ? 116 : text.length <= 28 ? 98 : 86);

export const Headline: React.FC<{
  text: string; highlight?: string; delay?: number; size?: number; per?: number;
  mode?: 'hero' | 'underline'; // 'underline' keeps the hero colour free for another element (the CTA button)
}> = ({ text, highlight = '', delay = 0, size, per = 3, mode = 'hero' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useTheme();
  const fontSize = size ?? headlineSize(text);
  const rows = layoutRows(text, fontSize);
  let wordIndex = -1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', rowGap: 6, maxWidth: 980, fontFamily: t.fonts.display, fontWeight: 800, fontSize, lineHeight: 1.05, letterSpacing: '-0.03em', color: t.colors.text, textAlign: 'center' }}>
      {rows.map((row, r) => (
        <div key={r} style={{ display: 'flex', justifyContent: 'center', columnGap: 24 }}>
          {row.map((w) => {
            wordIndex += 1;
            const i = wordIndex;
            const start = delay + i * per;
            const p = spring({ frame: frame - start, fps, config: t.spring.snappy });
            const isHl = !!highlight && norm(w) === norm(highlight);
            // The highlight pill lands 5 frames after its word.
            const pill = spring({ frame: frame - start - 5, fps, config: t.spring.bouncy });
            const line = interpolate(frame - start - 6, [0, 14], [0, 1], { easing: t.ease.out, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            return (
              <span key={i} style={{ position: 'relative', display: 'inline-block', opacity: Math.min(1, p), transform: `translateY(${interpolate(p, [0, 1], [34, 0])}px)` }}>
                {isHl && mode === 'hero' && (
                  <span style={{ position: 'absolute', inset: '-6px -14px', borderRadius: 26, background: withAlpha(t.colors.primary, 0.2), transform: `scale(${interpolate(pill, [0, 1], [0.6, 1])})`, opacity: Math.min(1, pill) }} />
                )}
                <span style={{ position: 'relative', color: isHl && mode === 'hero' ? t.colors.primary : t.colors.text, textShadow: isHl && mode === 'hero' ? `0 0 60px ${t.colors.glow}` : 'none' }}>{w}</span>
                {isHl && mode === 'underline' && (
                  <span style={{ position: 'absolute', left: 0, right: 0, bottom: -6, height: 8, borderRadius: 8, background: t.colors.text, transformOrigin: '0 50%', transform: `scaleX(${line})` }} />
                )}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};
