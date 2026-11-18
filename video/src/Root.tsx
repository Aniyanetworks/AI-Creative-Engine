import React from 'react';
import { Composition } from 'remotion';
import { AdVideo, VideoProps } from './AdVideo';
import demo from '../demo.json';
// @ts-ignore: plain JS helper shared with render.mjs
import { buildTimeline, estimateAlignment } from '../timing.mjs';

export const FPS = 30;

// Default props so the composition also previews in Remotion Studio (npm run studio).
const text = demo.scenes.map((s) => s.vo).join(' ');
const tl = buildTimeline({ scenes: demo.scenes, alignment: estimateAlignment(text) });
export const demoProps: VideoProps = {
  brand: demo.brand, title: demo.title, cta: demo.cta,
  scenes: tl.scenes, words: tl.words, audioFile: null, audioStartSec: tl.leadSec, durationSec: tl.durationSec,
};

export const Root: React.FC = () => (
  <Composition
    id="AdVideo"
    component={AdVideo}
    width={1080}
    height={1920}
    fps={FPS}
    durationInFrames={Math.ceil(demoProps.durationSec * FPS)}
    defaultProps={demoProps}
    // Duration follows the voiceover, so every video is exactly as long as its script.
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(60, Math.ceil(props.durationSec * FPS)) })}
  />
);
