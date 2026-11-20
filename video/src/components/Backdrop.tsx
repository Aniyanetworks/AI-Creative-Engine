// The background of every ad. Layers (back to front): base wash, three drifting colour orbs, a perspective floor grid,
// floating light particles with parallax, a light sweep, and a brand-colour flood that rises on the call-to-action.
// Everything is procedural and deterministic (same frame -> same picture), so renders are repeatable.
// Energy follows the storyboard: the hook is punchy, points are calm, proof glows, the call to action floods with brand colour.
import React, { useMemo } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { useTheme, withAlpha } from '../theme';

type Scene = { kind: string; startSec: number; endSec: number };

const W = 1080;
const H = 1920;
const KIND_ENERGY: Record<string, number> = { hook: 1, point: 0.7, proof: 0.9, cta: 1.15 };

// Small seeded random generator: the same particles in every frame and every render.
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Values that ease between the middle of each scene (so the mood changes smoothly, never with a cut).
function useMood(scenes: Scene[]): { energy: number; cta: number } {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mids: number[] = []; const en: number[] = []; const ct: number[] = [];
  for (const sc of scenes) {
    const mid = Math.round(((sc.startSec + sc.endSec) / 2) * fps);
    if (mids.length && mid <= mids[mids.length - 1]) continue;
    mids.push(mid); en.push(KIND_ENERGY[sc.kind] ?? 0.8); ct.push(sc.kind === 'cta' ? 1 : 0);
  }
  if (mids.length < 2) return { energy: en[0] ?? 0.8, cta: ct[0] ?? 0 };
  return {
    energy: interpolate(frame, mids, en, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    cta: interpolate(frame, mids, ct, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  };
}

const Particles: React.FC<{ energy: number }> = ({ energy }) => {
  const frame = useCurrentFrame();
  const t = useTheme();
  const items = useMemo(() => {
    const r = rng(7);
    return Array.from({ length: 64 }, (_, i) => {
      const depth = r(); // 0 = far (small, slow, dim), 1 = near (large, fast, bright, blurry)
      return { x: r() * W, y: r() * (H + 240), size: 6 + depth * depth * 36, speed: 0.22 + depth * 1.05, phase: r() * 6.28, alpha: 0.3 + depth * 0.5, kind: i % 5 === 0 ? 'accent' : i % 7 === 0 ? 'white' : 'primary', drift: (r() - 0.5) * 0.3 };
    });
  }, []);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {items.map((p, i) => {
        const y = ((p.y - frame * p.speed * (0.8 + energy * 0.5)) % (H + 240) + (H + 240)) % (H + 240) - 120;
        const x = p.x + Math.sin(frame / 90 + p.phase) * 26 + frame * p.drift;
        const tw = 0.65 + 0.35 * Math.sin(frame / 22 + p.phase);
        const col = p.kind === 'accent' ? t.colors.accent : p.kind === 'white' ? '#FFFFFF' : t.colors.primary;
        return <div key={i} style={{ position: 'absolute', left: x, top: y, width: p.size, height: p.size, borderRadius: '50%', opacity: p.alpha * tw * (0.7 + energy * 0.3), background: `radial-gradient(circle, ${withAlpha(col, 0.95)}, transparent 70%)`, filter: `blur(${(p.size / 7).toFixed(1)}px)` }} />;
      })}
    </AbsoluteFill>
  );
};

const FloorGrid: React.FC<{ energy: number }> = ({ energy }) => {
  const frame = useCurrentFrame();
  const t = useTheme();
  const cell = 120;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: -700, right: -700, bottom: 0, height: 1700, transform: 'perspective(900px) rotateX(63deg)', transformOrigin: '50% 100%', opacity: 0.95 * Math.min(1, energy), WebkitMaskImage: 'linear-gradient(to top, black 0%, black 30%, transparent 88%)', maskImage: 'linear-gradient(to top, black 0%, black 30%, transparent 88%)',
        backgroundImage: `linear-gradient(${withAlpha(t.colors.primary, 0.85)} 3px, transparent 3px), linear-gradient(90deg, ${withAlpha(t.colors.primary, 0.65)} 3px, transparent 3px)`, backgroundSize: `${cell}px ${cell}px`, backgroundPosition: `0px ${(frame * 2.4) % cell}px` }} />
    </AbsoluteFill>
  );
};

const Rings: React.FC<{ energy: number }> = ({ energy }) => {
  const frame = useCurrentFrame();
  const t = useTheme();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', alignItems: 'center', justifyContent: 'center' }}>
      {[0, 1, 2].map((i) => {
        const size = 820 + i * 380 + Math.sin(frame / (70 + i * 20) + i) * 40;
        return <div key={i} style={{ position: 'absolute', top: 760 - size / 2, width: size, height: size, borderRadius: '50%', border: `${3 - i * 0.6}px solid ${withAlpha(i === 1 ? t.colors.accent : t.colors.primary, (0.22 - i * 0.05) * (0.6 + energy * 0.5))}`, transform: `rotate(${frame * (0.08 + i * 0.03) * (i % 2 ? -1 : 1)}deg)` }} />;
      })}
    </AbsoluteFill>
  );
};

export const Backdrop: React.FC<{ scenes: Scene[] }> = ({ scenes }) => {
  const frame = useCurrentFrame();
  const t = useTheme();
  const { energy, cta } = useMood(scenes);
  const d1 = Math.sin(frame / 55) * 90;
  const d2 = Math.cos(frame / 70) * 70;
  const d3 = Math.sin(frame / 85 + 1.2) * 80;
  const sweep = interpolate(frame % 170, [0, 100], [-1500, 1700], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${t.colors.bgAlt} 0%, ${t.colors.bg} 55%, ${t.colors.bgAlt} 100%)`, overflow: 'hidden' }}>
      {/* drifting colour orbs */}
      <div style={{ position: 'absolute', width: 1600, height: 1600, borderRadius: '50%', top: -700 + d2, left: -480 + d1, filter: 'blur(70px)', background: `radial-gradient(circle, ${withAlpha(t.colors.primary, 0.30 + energy * 0.2)}, transparent 62%)` }} />
      <div style={{ position: 'absolute', width: 1400, height: 1400, borderRadius: '50%', bottom: -640 - d1, right: -520 + d2, filter: 'blur(90px)', background: `radial-gradient(circle, ${withAlpha(t.colors.accent, 0.16 + energy * 0.12)}, transparent 65%)` }} />
      <div style={{ position: 'absolute', width: 1000, height: 1000, borderRadius: '50%', top: 640 + d3, left: 260 - d2, filter: 'blur(110px)', background: `radial-gradient(circle, ${withAlpha(t.colors.primary, 0.14)}, transparent 68%)` }} />

      <Rings energy={energy} />
      <FloorGrid energy={energy} />
      <Particles energy={energy} />

      {/* a soft diagonal light sweep passes through every few seconds */}
      <AbsoluteFill style={{ pointerEvents: 'none', transform: `translateX(${sweep}px) skewX(-18deg)`, background: 'linear-gradient(90deg, transparent 42%, rgba(255,255,255,0.055) 50%, transparent 58%)', opacity: 0.9 }} />

      {/* the call to action floods the frame with the brand colour from below */}
      <AbsoluteFill style={{ pointerEvents: 'none', opacity: cta * 0.9, background: `radial-gradient(ellipse 90% 55% at 50% 100%, ${withAlpha(t.colors.primary, 0.5)}, transparent 70%)` }} />
      <AbsoluteFill style={{ pointerEvents: 'none', background: `linear-gradient(180deg, transparent 60%, ${withAlpha(t.colors.bgAlt, 0.7)} 100%)` }} />
    </AbsoluteFill>
  );
};
