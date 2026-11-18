// Word-synced captions (3 words per page, active word in the hero colour), placed at ~65% height inside the 9:16 safe zone.
import React, { useMemo } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { useTheme } from '../theme';

export type Word = { text: string; startSec: number; endSec: number };
const PER_PAGE = 3;
const MAX_CHARS = 20; // roughly one line of 70px uppercase display text inside the safe width

export const Captions: React.FC<{ words: Word[] }> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useTheme();
  const pages = useMemo(() => {
    const out: Word[][] = [];
    let cur: Word[] = [];
    const width = (ws: Word[]) => ws.map((x) => x.text).join(' ').length;
    for (const w of words) {
      // Start a new page first if this word would not fit on the current line (avoids a lonely wrapped word).
      if (cur.length && width([...cur, w]) > MAX_CHARS) { out.push(cur); cur = []; }
      cur.push(w);
      if (cur.length >= PER_PAGE || /[.!?]$/.test(w.text)) { out.push(cur); cur = []; }
    }
    if (cur.length) out.push(cur);
    return out;
  }, [words]);

  const now = frame / fps;
  let idx = -1;
  for (let i = 0; i < pages.length; i++) if (now >= pages[i][0].startSec - 0.04) idx = i;
  if (idx < 0) return null;
  const page = pages[idx];
  const next = pages[idx + 1];
  const pageEnd = page[page.length - 1].endSec + 0.25;
  if (!next && now > pageEnd) return null;

  const local = frame - Math.round((page[0].startSec - 0.04) * fps);
  const pop = spring({ frame: local, fps, config: t.spring.snappy });
  const fade = !next ? interpolate(now, [pageEnd - 0.2, pageEnd], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;

  return (
    <div style={{ position: 'absolute', left: 70, right: 70, top: 1230, display: 'flex', justifyContent: 'center', opacity: Math.min(1, pop) * fade, transform: `translateY(${interpolate(pop, [0, 1], [18, 0])}px) scale(${interpolate(pop, [0, 1], [0.95, 1])})` }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: 30, rowGap: 4, fontFamily: t.fonts.display, fontWeight: 800, fontSize: 70, lineHeight: 1.1, letterSpacing: '-0.01em', textTransform: 'uppercase', textAlign: 'center', textShadow: '0 6px 28px rgba(0,0,0,0.65)' }}>
        {page.map((w, i) => {
          const active = now >= w.startSec - 0.02 && now < w.endSec + 0.04;
          return <span key={i} style={{ color: active ? t.colors.accent : t.colors.text, display: 'inline-block', transform: active ? 'scale(1.05)' : 'scale(1)' }}>{w.text}</span>;
        })}
      </div>
    </div>
  );
};
