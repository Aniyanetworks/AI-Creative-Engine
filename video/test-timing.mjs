// Unit tests for timing.mjs: run with `node test-timing.mjs`.
import { buildTimeline, charsToWords, estimateAlignment } from './timing.mjs';

let ok = true;
const check = (label, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + label + (cond ? '' : '  -> ' + extra)); if (!cond) ok = false; };

// A fake ElevenLabs alignment: every character takes 0.05s.
const fake = (text, per = 0.05) => ({
  characters: [...text],
  character_start_times_seconds: [...text].map((_, i) => i * per),
  character_end_times_seconds: [...text].map((_, i) => (i + 1) * per),
});
const scenes = [{ vo: 'Stop wasting hours.' }, { vo: 'We automate it for you.' }, { vo: 'Book a free call.' }];
const text = scenes.map((s) => s.vo).join(' ');
const tl = buildTimeline({ scenes, alignment: fake(text), leadSec: 0.4, tailSec: 1, anticipationSec: 0.14 });

check('first scene starts at 0 so something moves immediately', tl.scenes[0].startSec === 0);
const secondStart = 0.4 + text.indexOf('We automate') * 0.05 - 0.14;
check('scene 2 starts at its first spoken character (minus anticipation)', Math.abs(tl.scenes[1].startSec - secondStart) < 1e-9, tl.scenes[1].startSec + ' vs ' + secondStart);
check('scenes are contiguous (no gaps or overlaps)', tl.scenes.every((s, i) => i === 0 || s.startSec === tl.scenes[i - 1].endSec));
check('last scene runs to the end of the video', tl.scenes[2].endSec === tl.durationSec);
check('duration = lead + speech + tail', Math.abs(tl.durationSec - (0.4 + text.length * 0.05 + 1)) < 1e-9, String(tl.durationSec));

const words = charsToWords(fake('Stop wasting hours.'), 0.4);
check('words split on spaces', words.map((w) => w.text).join('|') === 'Stop|wasting|hours.');
check('word timing shifted by the lead-in', Math.abs(words[0].startSec - 0.4) < 1e-9 && Math.abs(words[1].startSec - (0.4 + 5 * 0.05)) < 1e-9);
check('word end is the last character end', Math.abs(words[0].endSec - (0.4 + 4 * 0.05)) < 1e-9);

// ElevenLabs may normalise the text (different character count): timing must still be sane.
const shorter = fake(text.replace(/\./g, ''));
const tl2 = buildTimeline({ scenes, alignment: shorter, leadSec: 0.4 });
check('tolerates normalised text with a different length', tl2.scenes.every((s) => Number.isFinite(s.startSec) && s.endSec > s.startSec));

const est = estimateAlignment('One two three four five six', 2);
check('estimated alignment paces words (6 words at 2/s = 3s)', Math.abs(est.character_end_times_seconds.at(-1) - 3) < 1e-9);

console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);
