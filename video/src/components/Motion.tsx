// Motion primitives. Every entrance moves 2-3 properties together, uses a spring, and is staggered by the caller.
import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { useTheme } from '../theme';

export const Entrance: React.FC<{ delay?: number; rise?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ delay = 0, rise = 44, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useTheme();
  const p = spring({ frame: frame - delay, fps, config: t.spring.smooth });
  return (
    <div style={{ opacity: Math.min(1, p), transform: `translateY(${interpolate(p, [0, 1], [rise, 0])}px) scale(${interpolate(p, [0, 1], [0.94, 1])})`, ...style }}>
      {children}
    </div>
  );
};

// Exits are faster than entrances (about 10 frames vs 20): returns style for a scene wrapper.
export const useExit = (dur: number, frames = 10) => {
  const frame = useCurrentFrame();
  const t = useTheme();
  const range = [dur - frames, dur - 1];
  const progress = interpolate(frame, range, [0, 1], { easing: t.ease.in, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return { opacity: 1 - progress, transform: `translateY(${-46 * progress}px) scale(${1 - 0.03 * progress})` } as React.CSSProperties;
};

// Idle elements breathe so nothing on screen is ever perfectly static.
export const useBreathe = (amount = 0.015, speed = 22) => {
  const frame = useCurrentFrame();
  return 1 + Math.sin(frame / speed) * amount;
};
