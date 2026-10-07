/**
 * Wanted posters (spec §10.3, §11.6): at Heat 2 and above, diner and gas station corkboards carry posters
 * with low-res faces of the party. Each poster is a few texels across in the world, so a face is just its
 * colors: hair, skin, and jacket under a red header. Pure bitmap layout (works in Node); the canvas is for
 * the renderer.
 */
import { C } from '../render/palettes';
import type { Look } from './rig';

/** Poster size in canvas pixels (about one screen texel each on the corkboard). */
export const POSTER_W = 7;
export const POSTER_H = 8;

/**
 * Row by row: R red header, P paper, H hair, S skin, J jacket, T a line of text.
 * A face framed by hair, shoulders below, two lines of print.
 */
const ROWS = ['RRRRRRR', 'PPHHHPP', 'PHHSHHP', 'PHSSSHP', 'PPSSSPP', 'PJJJJJP', 'PPPPPPP', 'PTTTTTP'];

/** The poster's pixels as palette colors, row-major. */
export function wantedPosterPixels(look: Look): number[] {
  const out: number[] = [];
  for (const row of ROWS) {
    for (const ch of row) {
      switch (ch) {
        case 'R':
          out.push(C.red0);
          break;
        case 'H':
          out.push(look.hat !== 'none' ? look.hatColor : look.hair);
          break;
        case 'S':
          out.push(look.skin);
          break;
        case 'J':
          out.push(look.jacket);
          break;
        case 'T':
          out.push(C.slate1);
          break;
        default:
          out.push(C.fog1);
      }
    }
  }
  return out;
}

/** A canvas for the renderer, or null without a DOM. */
export function wantedPosterCanvas(look: Look): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = POSTER_W;
  c.height = POSTER_H;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const px = wantedPosterPixels(look);
  for (let i = 0; i < px.length; i++) {
    ctx.fillStyle = '#' + px[i].toString(16).padStart(6, '0');
    ctx.fillRect(i % POSTER_W, Math.floor(i / POSTER_W), 1, 1);
  }
  return c;
}
