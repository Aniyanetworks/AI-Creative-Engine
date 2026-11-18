// The always-on layers: moving background mesh underneath; colour grade, film grain and vignette on top.
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { useTheme, withAlpha } from '../theme';

export const BgMesh: React.FC = () => {
  const frame = useCurrentFrame();
  const t = useTheme();
  const d1 = Math.sin(frame / 55) * 70;
  const d2 = Math.cos(frame / 70) * 55;
  return (
    <AbsoluteFill style={{ background: t.colors.bg }}>
      <div style={{ position: 'absolute', width: 1500, height: 1500, borderRadius: '50%', top: -620 + d2, left: -420 + d1, filter: 'blur(60px)', background: `radial-gradient(circle, ${withAlpha(t.colors.primary, 0.36)}, transparent 62%)` }} />
      <div style={{ position: 'absolute', width: 1300, height: 1300, borderRadius: '50%', bottom: -560 - d1, right: -460 + d2, filter: 'blur(80px)', background: `radial-gradient(circle, ${withAlpha(t.colors.accent, 0.2)}, transparent 65%)` }} />
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, transparent 55%, ${withAlpha(t.colors.bgAlt, 0.9)} 100%)` }} />
    </AbsoluteFill>
  );
};

// Unifies everything under one tint (renders above content, below grain).
export const Grade: React.FC = () => {
  const t = useTheme();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ backgroundColor: t.colors.primary, mixBlendMode: 'soft-light', opacity: 0.2 }} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.14), transparent 28%, transparent 72%, rgba(0,0,0,0.26))' }} />
    </AbsoluteFill>
  );
};

// Procedural grain: no asset file needed. The offset shifts each frame for a subtle film flicker.
const NOISE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`;
export const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', backgroundImage: NOISE, backgroundSize: '220px', backgroundPosition: `${(frame * 7) % 220}px ${(frame * 13) % 220}px`, opacity: 0.07, mixBlendMode: 'overlay' }} />
  );
};

export const Vignette: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: 'none', background: 'radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,0.34) 100%)' }} />
);
