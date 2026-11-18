// Single source of truth for look and motion. Nothing else in the project inlines a colour, easing or spring.
// The palette is derived from the client's brand colours, so every client's videos look like their own.
import React, { createContext, useContext } from 'react';
import { Easing } from 'remotion';
import { body, display } from './fonts';

export type Brand = { name: string; colors: string[] };

const HEX = /^#[0-9a-f]{6}$/i;
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
export const luminance = (h: string) => { const [r, g, b] = rgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const mixToWhite = (h: string, a: number) => '#' + rgb(h).map((v) => toHex(v + (255 - v) * a)).join('');
export const withAlpha = (h: string, a: number) => { const [r, g, b] = rgb(h); return `rgba(${r}, ${g}, ${b}, ${a})`; };
// The base is dark, so a very dark brand colour would vanish: lighten it until it reads.
const readable = (h: string, min = 0.2) => { let c = h; for (let i = 0; i < 14 && luminance(c) < min; i++) c = mixToWhite(c, 0.1); return c; };

const hue = (h: string) => {
  const [r, g, b] = rgb(h).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  const x = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (x * 60 + 360) % 360;
};
const hueGap = (a: string, b: string) => { const d = Math.abs(hue(a) - hue(b)); return Math.min(d, 360 - d); };

export const makeTheme = (brand: Brand) => {
  const valid = (brand.colors || []).filter((c) => HEX.test(c));
  const primary = readable(valid[0] || '#7C5CFF');
  // The accent must contrast with the hero in hue, otherwise the two highlights blend together:
  // use the first other brand colour that is clearly different, else a warm default.
  const distinct = valid.slice(1).find((c) => hueGap(c, primary) >= 40 && Math.max(...rgb(c)) - Math.min(...rgb(c)) > 40);
  const accent = readable(distinct || '#FFB547');
  return {
    colors: {
      bg: '#0B0B12',
      bgAlt: '#13131C',
      primary, // THE hero colour: at most one element per frame
      accent,
      text: '#F5F5F7',
      textDim: '#A9A9B6',
      glow: withAlpha(primary, 0.4),
      onPrimary: luminance(primary) > 0.45 ? '#0B0B12' : '#FFFFFF',
    },
    fonts: { display, body },
    // The only easing curves. Linear is not used anywhere.
    ease: {
      out: Easing.bezier(0.16, 1, 0.3, 1), // entrances
      inOut: Easing.bezier(0.83, 0, 0.17, 1), // moves
      in: Easing.bezier(0.7, 0, 0.84, 0), // exits only
    },
    spring: {
      snappy: { damping: 14, stiffness: 160, mass: 0.6 },
      smooth: { damping: 20, stiffness: 90, mass: 1 },
      bouncy: { damping: 11, stiffness: 170, mass: 0.7 },
    },
  } as const;
};

export type Theme = ReturnType<typeof makeTheme>;
const Ctx = createContext<Theme | null>(null);
export const ThemeProvider: React.FC<{ value: Theme; children: React.ReactNode }> = ({ value, children }) => <Ctx.Provider value={value}>{children}</Ctx.Provider>;
export const useTheme = () => {
  const t = useContext(Ctx);
  if (!t) throw new Error('useTheme must be used inside <ThemeProvider>');
  return t;
};
