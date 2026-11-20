// The full ad: global layers + one Sequence per storyboard scene + word-synced captions + voiceover + SFX.
import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from 'remotion';
import { Brand, ThemeProvider, makeTheme } from './theme';
import { Grade, Grain, Vignette } from './components/Layers';
import { Backdrop } from './components/Backdrop';
import { Captions, Word } from './components/Captions';
import { SceneView, SceneData } from './scenes/SceneView';

export type VideoProps = {
  brand: Brand;
  title: string;
  cta: string;
  scenes: SceneData[];
  words: Word[];
  audioFile: string | null; // path inside video/public, e.g. "audio/run-1.mp3"
  audioStartSec: number;
  durationSec: number;
};

export const AdVideo: React.FC<VideoProps> = ({ brand, cta, scenes, words, audioFile, audioStartSec }) => {
  const { fps } = useVideoConfig();
  const theme = useMemo(() => makeTheme(brand), [brand]);
  const frames = (sec: number) => Math.max(0, Math.round(sec * fps));

  return (
    <ThemeProvider value={theme}>
      <AbsoluteFill style={{ background: theme.colors.bg, fontFamily: theme.fonts.body, overflow: 'hidden' }}>
        <Backdrop scenes={scenes} />

        {scenes.map((sc, i) => {
          const from = frames(sc.startSec);
          const dur = Math.max(20, frames(sc.endSec) - from);
          return (
            <Sequence key={i} from={from} durationInFrames={dur}>
              <SceneView scene={sc} dur={dur} cta={cta} brandName={brand.name} />
            </Sequence>
          );
        })}

        <Captions words={words} />
        <Grade />
        <Grain />
        <Vignette />

        {audioFile ? <Sequence from={frames(audioStartSec)}><Audio src={staticFile(audioFile)} volume={1} /></Sequence> : null}

        {/* SFX start 2 frames BEFORE the visual lands (early feels synced, late feels broken). */}
        {scenes.map((sc, i) => (
          <Sequence key={'w' + i} from={Math.max(0, frames(sc.startSec) - 2)} durationInFrames={30}>
            <Audio src={staticFile('sfx/whoosh.wav')} volume={0.32} />
          </Sequence>
        ))}
        {scenes.map((sc, i) => {
          const idx = sc.highlight ? sc.headline.split(' ').findIndex((w) => w.toLowerCase().replace(/[^a-z0-9%+$]/g, '') === sc.highlight.toLowerCase().replace(/[^a-z0-9%+$]/g, '')) : -1;
          if (sc.kind === 'cta') return <Sequence key={'h' + i} from={frames(sc.startSec) + 22} durationInFrames={30}><Audio src={staticFile('sfx/hit.wav')} volume={0.55} /></Sequence>;
          if (idx < 0) return null;
          return <Sequence key={'p' + i} from={frames(sc.startSec) + 6 + idx * 3 + 3} durationInFrames={20}><Audio src={staticFile('sfx/pop.wav')} volume={0.4} /></Sequence>;
        })}
      </AbsoluteFill>
    </ThemeProvider>
  );
};
