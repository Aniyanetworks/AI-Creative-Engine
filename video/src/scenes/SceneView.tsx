// One scene of the storyboard. Layer stack inside a scene: shockwave ring -> icon tile -> headline/stat -> sub line / CTA button.
// (Background mesh, grade, grain and vignette are global layers in AdVideo.)
import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Entrance, useBreathe, useExit } from '../components/Motion';
import { Headline, headlineSize } from '../components/Headline';
import { Icon } from '../components/Icon';
import { useTheme, withAlpha } from '../theme';

export type SceneData = { kind: string; headline: string; highlight: string; sub: string; icon: string; startSec: number; endSec: number };

const IconTile: React.FC<{ name: string }> = ({ name }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useTheme();
  const p = spring({ frame, fps, config: t.spring.bouncy });
  const breathe = useBreathe(0.03, 20);
  const ring = interpolate(frame, [0, 26], [0.55, 2.4], { easing: t.ease.out, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ringO = interpolate(frame, [0, 26], [0.28, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'relative', width: 168, height: 168, marginBottom: 44 }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 52, border: `3px solid ${t.colors.text}`, opacity: ringO, transform: `scale(${ring})` }} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: 52, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 30px 60px -20px rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', opacity: Math.min(1, p), transform: `scale(${interpolate(p, [0, 1], [0.5, 1]) * breathe}) rotate(${interpolate(p, [0, 1], [-14, 0])}deg)` }}>
        <Icon name={name} size={84} color={t.colors.text} />
      </div>
    </div>
  );
};

// "100+ workflows built" -> big animated 100+ with the rest as the label.
const parseStat = (headline: string) => {
  const m = headline.match(/(\d[\d,]*\.?\d*)\s*(\+|%|x|k|K|m|M)?/);
  if (!m) return null;
  const value = parseFloat(m[1].replace(/,/g, ''));
  if (!isFinite(value)) return null;
  const decimals = (m[1].split('.')[1] || '').length;
  const label = headline.replace(m[0], '').replace(/\s+/g, ' ').trim();
  return { value, decimals, suffix: m[2] || '', label };
};

const Stat: React.FC<{ headline: string; delay: number }> = ({ headline, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useTheme();
  const s = parseStat(headline);
  if (!s) return <Headline text={headline} delay={delay} />;
  const p = spring({ frame: frame - delay, fps, config: { damping: 30, stiffness: 60, mass: 1 } });
  const shown = interpolate(p, [0, 1], [0, s.value]);
  const pop = spring({ frame: frame - delay, fps, config: t.spring.smooth });
  return (
    <>
      <div style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: 232, lineHeight: 1, letterSpacing: '-0.04em', color: t.colors.primary, textShadow: `0 0 90px ${t.colors.glow}`, fontVariantNumeric: 'tabular-nums', opacity: Math.min(1, pop), transform: `scale(${interpolate(pop, [0, 1], [0.9, 1])})` }}>
        {shown.toLocaleString('en-US', { minimumFractionDigits: s.decimals, maximumFractionDigits: s.decimals })}{s.suffix}
      </div>
      {s.label ? <div style={{ marginTop: 18 }}><Headline text={s.label} delay={delay + 10} size={76} /></div> : null}
    </>
  );
};

const CtaButton: React.FC<{ label: string; delay: number }> = ({ label, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useTheme();
  const p = spring({ frame: frame - delay, fps, config: t.spring.bouncy });
  const pulse = 1 + Math.sin(frame / 9) * 0.02;
  return (
    <div style={{ marginTop: 56, opacity: Math.min(1, p), transform: `translateY(${interpolate(p, [0, 1], [50, 0])}px) scale(${interpolate(p, [0, 1], [0.8, 1]) * pulse})` }}>
      <div style={{ padding: '30px 64px', borderRadius: 999, background: t.colors.primary, color: t.colors.onPrimary, fontFamily: t.fonts.display, fontWeight: 800, fontSize: 52, letterSpacing: '-0.01em', boxShadow: `0 0 70px ${t.colors.glow}, 0 0 140px ${withAlpha(t.colors.primary, 0.22)}, 0 24px 50px -16px rgba(0,0,0,0.6)` }}>{label}</div>
    </div>
  );
};

export const SceneView: React.FC<{ scene: SceneData; dur: number; cta: string; brandName: string }> = ({ scene, dur, cta, brandName }) => {
  const t = useTheme();
  const exit = useExit(dur);
  const isCta = scene.kind === 'cta';
  const isProof = scene.kind === 'proof';
  const base = 6; // frames before the first element lands: something moves almost immediately
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 300, height: 880, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', ...exit }}>
      {!isProof && <IconTile name={scene.icon} />}
      {isProof ? <Stat headline={scene.headline} delay={base} />
        : <Headline text={scene.headline} highlight={scene.highlight} delay={base} mode={isCta ? 'underline' : 'hero'} size={scene.kind === 'hook' ? Math.min(headlineSize(scene.headline) + 8, 146) : undefined} />}
      {scene.sub && !isCta ? (
        <Entrance delay={base + 16} rise={26} style={{ marginTop: 34 }}>
          <div style={{ fontFamily: t.fonts.body, fontWeight: 600, fontSize: 46, color: t.colors.textDim, textAlign: 'center', maxWidth: 860, lineHeight: 1.25 }}>{scene.sub}</div>
        </Entrance>
      ) : null}
      {isCta ? <CtaButton label={(cta || scene.sub || 'Learn more').slice(0, 34)} delay={base + 18} /> : null}
      {isCta ? (
        <Entrance delay={base + 30} rise={20} style={{ marginTop: 40 }}>
          <div style={{ fontFamily: t.fonts.body, fontWeight: 600, fontSize: 38, color: t.colors.textDim, letterSpacing: '0.04em' }}>{brandName}</div>
        </Entrance>
      ) : null}
    </div>
  );
};
