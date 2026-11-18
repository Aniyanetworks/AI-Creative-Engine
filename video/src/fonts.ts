// Display + body fonts loaded through Remotion (rendering waits until they are ready).
import { loadFont as loadSora } from '@remotion/google-fonts/Sora';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';

export const display = loadSora('normal', { weights: ['700', '800'], subsets: ['latin'] }).fontFamily;
export const body = loadInter('normal', { weights: ['500', '600'], subsets: ['latin'] }).fontFamily;
