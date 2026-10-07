/**
 * Pixel-text canvas textures (spec §4.4, §12.4): signs, propaganda billboards, the diner menu board, and
 * the Sankofa's name. Text uses the 5×7 TEXT_FONT and is drawn glyph pixel by glyph pixel with fillRect
 * (no anti-aliasing) in palette colors only. Hand the canvases to `pixelTexture()` (materials.ts) so they
 * sample with nearest filtering.
 *
 * Canvas sizes are chosen so one canvas pixel lands on about one screen texel at the 55° camera pitch
 * (24 texels per meter across, about 13.8 per meter up a vertical face). In Node (tests, tools) the canvas
 * functions return null; `textBitmap()` and the layout helpers work everywhere.
 */
import { C } from '../render/palettes';
import { TEXT_FONT, glyphKey, measure, wrap } from '../ui/font';

export interface SignOpts {
  /** Text color (a palette color). */
  fg: number;
  /** Background color (a palette color). */
  bg: number;
  /** Padding around the text in canvas pixels (default 2). */
  pad?: number;
  /** Whole-number glyph scale (default 1). */
  scale?: number;
  /** Fixed canvas size; the text is centered in it. Defaults to the text's size plus padding. */
  width?: number;
  height?: number;
  /** Line pitch in unscaled pixels (default TEXT_FONT.lineHeight). */
  lineHeight?: number;
  /** Optional 1-pixel border color. */
  border?: number;
  /** Horizontal alignment of each line (default center). */
  align?: 'left' | 'center';
}

export interface TextBitmap {
  width: number;
  height: number;
  /** One byte per pixel, row-major: 0 background, 1 text, 2 border. */
  data: Uint8Array;
}

/** Lay out and rasterize lines of pixel text into a bitmap (pure; works in Node). */
export function textBitmap(lines: readonly string[], opts: Omit<SignOpts, 'fg' | 'bg'>): TextBitmap {
  const s = Math.max(1, Math.floor(opts.scale ?? 1));
  const pad = opts.pad ?? 2;
  const pitch = (opts.lineHeight ?? TEXT_FONT.lineHeight) * s;
  const glyphH = TEXT_FONT.height * s;
  const textW = lines.reduce((w, line) => Math.max(w, measure(TEXT_FONT, line) * s), 0);
  const textH = lines.length > 0 ? (lines.length - 1) * pitch + glyphH : 0;
  const width = Math.max(1, Math.round(opts.width ?? textW + pad * 2));
  const height = Math.max(1, Math.round(opts.height ?? textH + pad * 2));
  const data = new Uint8Array(width * height);
  if (opts.border !== undefined) {
    for (let x = 0; x < width; x++) {
      data[x] = 2;
      data[(height - 1) * width + x] = 2;
    }
    for (let y = 0; y < height; y++) {
      data[y * width] = 2;
      data[y * width + width - 1] = 2;
    }
  }
  const top = opts.height === undefined ? pad : Math.floor((height - textH) / 2);
  lines.forEach((line, li) => {
    const lineW = measure(TEXT_FONT, line) * s;
    let x = opts.align === 'left' ? pad : Math.floor((width - lineW) / 2);
    const y0 = top + li * pitch;
    for (const ch of line) {
      const glyph = TEXT_FONT.glyphs.get(glyphKey(TEXT_FONT, ch)) ?? TEXT_FONT.fallback;
      glyph.rows.forEach((row, r) => {
        for (let c = 0; c < row.length; c++) {
          if (row[c] !== '#') continue;
          for (let dy = 0; dy < s; dy++) {
            for (let dx = 0; dx < s; dx++) {
              const px = x + c * s + dx;
              const py = y0 + r * s + dy;
              if (px >= 0 && py >= 0 && px < width && py < height) data[py * width + px] = 1;
            }
          }
        }
      });
      x += (glyph.w + TEXT_FONT.spacing) * s;
    }
  });
  return { width, height, data };
}

function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

/** Paint a text bitmap onto a new canvas with fillRect runs (no smoothing). Null outside the browser. */
function paint(
  bmp: TextBitmap,
  fg: number,
  bg: number,
  border: number | undefined,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = hex(bg);
  ctx.fillRect(0, 0, bmp.width, bmp.height);
  const colors = [null, hex(fg), hex(border ?? fg)];
  for (let y = 0; y < bmp.height; y++) {
    let x = 0;
    while (x < bmp.width) {
      const v = bmp.data[y * bmp.width + x];
      let run = 1;
      while (x + run < bmp.width && bmp.data[y * bmp.width + x + run] === v) run++;
      const color = colors[v];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, run, 1);
      }
      x += run;
    }
  }
  return canvas;
}

/** A sign canvas: lines of pixel text in `fg` on `bg`. Returns null when there is no DOM (Node). */
export function signCanvas(lines: string[], opts: SignOpts): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  return paint(textBitmap(lines, opts), opts.fg, opts.bg, opts.border);
}

// ------------------------------------------------------------------------------------------------
// Billboards (§12.4)
// ------------------------------------------------------------------------------------------------

/** The four propaganda billboard lines. */
export const BILLBOARD_LINES = [
  "REPORT UNREGISTERED UNITS. IT'S THE LAW. IT'S ALSO KIND.",
  'ALDINE. STILL HERE FOR YOU.',
  "IF IT DOESN'T BLINK, CALL IT IN. 1-800-RECLAIM",
  'PROPERTY IS NOT A PERSON.',
] as const;

/** Billboard canvas size, matched to BILLBOARD_FACE (8 × 3.5 m) in props.ts. */
export const BILLBOARD_CANVAS = { width: 192, height: 48, pad: 6 } as const;

/** Split into sentences (". " boundaries), then word-wrap each to `maxWidth` font pixels. */
function sentenceWrap(text: string, maxWidth: number): string[] {
  const sentences = text.split(/(?<=\.)\s+/);
  return sentences.flatMap((sentence) => wrap(TEXT_FONT, sentence, maxWidth));
}

/**
 * Billboard layout: the largest whole-number scale (2 or 1) at which the text, broken at sentences, fits
 * the canvas. Exposed for tests and for scenes that want the line breaks.
 */
export function billboardLayout(text: string): { lines: string[]; scale: number } {
  const { width, height, pad } = BILLBOARD_CANVAS;
  for (const scale of [2, 1]) {
    const lines = sentenceWrap(text, Math.floor((width - pad * 2) / scale));
    const textH = (lines.length - 1) * TEXT_FONT.lineHeight * scale + TEXT_FONT.height * scale;
    const textW = Math.max(...lines.map((l) => measure(TEXT_FONT, l))) * scale;
    if (textH <= height - pad * 2 && textW <= width - pad * 2) return { lines, scale };
  }
  return { lines: sentenceWrap(text, width - pad * 2), scale: 1 };
}

/**
 * A propaganda billboard face: fog-white text on dark slate (Aldine's own ads in warm amber), with a slate
 * border. 192 × 48 px for the 8 × 3.5 m BILLBOARD_FACE.
 */
export function billboardCanvas(text: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const { lines, scale } = billboardLayout(text);
  const warm = text.trim().toUpperCase().startsWith('ALDINE');
  return signCanvas(lines, {
    fg: warm ? C.amber2 : C.fog2,
    bg: C.night2,
    border: C.slate1,
    scale,
    width: BILLBOARD_CANVAS.width,
    height: BILLBOARD_CANVAS.height,
  });
}

// ------------------------------------------------------------------------------------------------
// The ship's name and the diner menu
// ------------------------------------------------------------------------------------------------

export const SHIP_NAME = 'SANKOFA — TEMA';

/** "SANKOFA — TEMA" in white paint on the dark hull: 216 × 20 px for SANKOFA_NAME_ANCHOR (9 × 1.4 m). */
export function shipNameCanvas(): HTMLCanvasElement | null {
  return signCanvas([SHIP_NAME], { fg: C.fog2, bg: C.night2, scale: 2, width: 216, height: 20, pad: 0 });
}

/** The menu board's two lines (the board is small on screen; two lines are what reads). */
export const MENU_LINES = ['COFFEE 1.50', 'EGGS 4.25'] as const;

/** Diner menu board: amber text on a dark board, 72 × 16 px for MENU_BOARD_FACE (3 × 1.2 m). */
export function menuBoardCanvas(): HTMLCanvasElement | null {
  return signCanvas([...MENU_LINES], {
    fg: C.amber2,
    bg: C.night1,
    width: 72,
    height: 16,
    lineHeight: 8,
    pad: 0,
  });
}
