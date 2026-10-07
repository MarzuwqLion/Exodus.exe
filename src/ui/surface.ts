/**
 * The UI surface: a palette-locked Canvas2D in the same 640×360 pixel space as the world (spec §13.1).
 * Drawing happens on a logical canvas (640×360, or 320×180 with the large-text option) and is blitted with
 * nearest-neighbor scaling into the pipeline's UI canvas. Every color is a palette color; pixels are opaque or
 * fully transparent, so the composite stays on-palette.
 */
import { C } from '../render/palettes';
import { glyphLabel, type Glyph as ButtonGlyph, type GlyphDevice } from '../input/glyphs';
import { NUM_FONT, TEXT_FONT, glyphKey, measure, wrap, type BitmapFont } from './font';
import { ICONS, iconSize, type IconName } from './icons';

export type Align = 'left' | 'center' | 'right';

/** Colors for a button glyph: the key cap, its lower edge, and the label (default slate, night, fog). */
export interface KeyColors {
  key: number;
  edge: number;
  label: number;
}

const MAIN_KEY: KeyColors = { key: C.slate1, edge: C.night3, label: C.fog2 };

export interface TextOpts {
  font?: 'text' | 'num';
  align?: Align;
  /** Draw a 1px drop shadow in this color (default night0). Pass null for none. */
  shadow?: number | null;
  /** Whole-number pixel scale (the title logo). */
  scale?: number;
}

function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

interface Atlas {
  canvas: HTMLCanvasElement;
  x: Map<string, number>;
}

export class UiSurface {
  private logical: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private outCtx: CanvasRenderingContext2D;
  private atlases = new Map<string, Atlas>();
  private iconCache = new Map<string, HTMLCanvasElement>();
  scale = 1;

  constructor(private readonly out: HTMLCanvasElement) {
    this.logical = document.createElement('canvas');
    this.logical.width = out.width;
    this.logical.height = out.height;
    this.ctx = this.logical.getContext('2d', { willReadFrequently: false })!;
    this.ctx.imageSmoothingEnabled = false;
    this.outCtx = out.getContext('2d')!;
    this.outCtx.imageSmoothingEnabled = false;
  }

  /** Logical drawing size (halved with large text). */
  get width(): number {
    return Math.floor(this.out.width / this.scale);
  }

  get height(): number {
    return Math.floor(this.out.height / this.scale);
  }

  setLargeText(on: boolean): void {
    this.scale = on ? 2 : 1;
  }

  begin(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.logical.width, this.logical.height);
    this.ctx.imageSmoothingEnabled = false;
  }

  end(): void {
    const o = this.outCtx;
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.imageSmoothingEnabled = false;
    o.clearRect(0, 0, this.out.width, this.out.height);
    o.drawImage(
      this.logical,
      0,
      0,
      this.width,
      this.height,
      0,
      0,
      this.width * this.scale,
      this.height * this.scale,
    );
  }

  rect(x: number, y: number, w: number, h: number, color: number): void {
    if (w <= 0 || h <= 0) return;
    this.ctx.fillStyle = hex(color);
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  /** 1px outline rectangle. */
  frame(x: number, y: number, w: number, h: number, color: number): void {
    this.rect(x, y, w, 1, color);
    this.rect(x, y + h - 1, w, 1, color);
    this.rect(x, y, 1, h, color);
    this.rect(x + w - 1, y, 1, h, color);
  }

  /** A panel: dark fill with a slate border (the standard box). */
  panel(
    x: number,
    y: number,
    w: number,
    h: number,
    fill: number = C.night0,
    border: number = C.slate0,
  ): void {
    this.rect(x, y, w, h, fill);
    this.frame(x, y, w, h, border);
  }

  pixel(x: number, y: number, color: number): void {
    this.rect(x, y, 1, 1, color);
  }

  private fontOf(o?: TextOpts): BitmapFont {
    return o?.font === 'num' ? NUM_FONT : TEXT_FONT;
  }

  measure(text: string, font: 'text' | 'num' = 'text'): number {
    return measure(font === 'num' ? NUM_FONT : TEXT_FONT, text);
  }

  wrap(text: string, maxWidth: number): string[] {
    return wrap(TEXT_FONT, text, maxWidth);
  }

  get lineHeight(): number {
    return TEXT_FONT.lineHeight;
  }

  private atlas(font: BitmapFont, color: number): Atlas {
    const key = font.name + color;
    let a = this.atlases.get(key);
    if (a) return a;
    const chars = [...font.glyphs.keys()];
    const total = chars.reduce((s, c) => s + font.glyphs.get(c)!.w + 1, 0);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, total);
    canvas.height = font.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = hex(color);
    const xs = new Map<string, number>();
    let x = 0;
    for (const c of chars) {
      const g = font.glyphs.get(c)!;
      xs.set(c, x);
      g.rows.forEach((row, y) => {
        for (let i = 0; i < row.length; i++) if (row[i] === '#') ctx.fillRect(x + i, y, 1, 1);
      });
      x += g.w + 1;
    }
    a = { canvas, x: xs };
    this.atlases.set(key, a);
    return a;
  }

  /** Draw one line of text; returns its width. `y` is the top of the glyph cell. */
  text(str: string, x: number, y: number, color: number, opts?: TextOpts): number {
    const font = this.fontOf(opts);
    const k = Math.max(1, Math.round(opts?.scale ?? 1));
    const w = measure(font, str) * k;
    let cx = Math.round(x);
    const align = opts?.align ?? 'left';
    if (align === 'center') cx = Math.round(x - w / 2);
    else if (align === 'right') cx = Math.round(x - w);
    const cy = Math.round(y);
    const shadow = opts?.shadow === undefined ? C.night0 : opts.shadow;
    if (shadow !== null) this.drawRun(font, str, cx + k, cy + k, shadow, k);
    this.drawRun(font, str, cx, cy, color, k);
    return w;
  }

  private drawRun(font: BitmapFont, str: string, x: number, y: number, color: number, k = 1): void {
    const a = this.atlas(font, color);
    let cx = x;
    for (const ch of str) {
      const key = glyphKey(font, ch);
      const g = font.glyphs.get(key) ?? font.fallback;
      const sx = a.x.get(key);
      if (sx !== undefined && g.w > 0 && key !== ' ') {
        this.ctx.drawImage(a.canvas, sx, 0, g.w, font.height, cx, y, g.w * k, font.height * k);
      }
      cx += (g.w + font.spacing) * k;
    }
  }

  /** Word-wrapped paragraph; returns the height used. `visibleChars` supports the typewriter effect. */
  paragraph(
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    color: number,
    visibleChars = Infinity,
    opts?: TextOpts,
  ): number {
    const lines = wrap(TEXT_FONT, text, maxWidth);
    let remaining = visibleChars;
    let cy = y;
    for (const line of lines) {
      if (remaining <= 0) break;
      const shown = remaining >= line.length ? line : line.slice(0, Math.max(0, Math.floor(remaining)));
      this.text(shown, x, cy, color, opts);
      remaining -= line.length + 1;
      cy += TEXT_FONT.lineHeight;
    }
    return lines.length * TEXT_FONT.lineHeight;
  }

  /** Draw an icon; '#' uses `color`, '+' uses `color2`. */
  icon(
    name: IconName,
    x: number,
    y: number,
    color: number,
    color2: number = color,
  ): { w: number; h: number } {
    const key = `${name}:${color}:${color2}`;
    let c = this.iconCache.get(key);
    const size = iconSize(name);
    if (!c) {
      c = document.createElement('canvas');
      c.width = size.w;
      c.height = size.h;
      const ctx = c.getContext('2d')!;
      ICONS[name].forEach((row, yy) => {
        for (let i = 0; i < row.length; i++) {
          if (row[i] === '#') {
            ctx.fillStyle = hex(color);
            ctx.fillRect(i, yy, 1, 1);
          } else if (row[i] === '+') {
            ctx.fillStyle = hex(color2);
            ctx.fillRect(i, yy, 1, 1);
          }
        }
      });
      this.iconCache.set(key, c);
    }
    this.ctx.drawImage(c, Math.round(x), Math.round(y));
    return size;
  }

  /**
   * A button glyph: a small dark key with the button's label. Face buttons on PlayStation pads use shapes.
   * Returns the width drawn.
   */
  button(g: ButtonGlyph, device: GlyphDevice, x: number, y: number, colors: KeyColors = MAIN_KEY): number {
    const label = glyphLabel(g, device);
    const ix = Math.round(x);
    const iy = Math.round(y);
    const key = colors.key;
    if (device === 'playstation' && (g === 'A' || g === 'B' || g === 'X' || g === 'Y')) {
      this.rect(ix + 1, iy, 7, 9, key);
      this.rect(ix, iy + 1, 9, 7, key);
      const c = colors.label;
      if (g === 'A') {
        for (let i = 0; i < 5; i++) {
          this.pixel(ix + 2 + i, iy + 2 + i, c);
          this.pixel(ix + 6 - i, iy + 2 + i, c);
        }
      } else if (g === 'B') {
        this.frame(ix + 2, iy + 2, 5, 5, c);
      } else if (g === 'X') {
        this.frame(ix + 2, iy + 2, 5, 5, c);
        this.rect(ix + 3, iy + 3, 3, 3, key);
      } else {
        this.pixel(ix + 4, iy + 2, c);
        this.rect(ix + 3, iy + 4, 3, 1, c);
        this.pixel(ix + 3, iy + 3, c);
        this.pixel(ix + 5, iy + 3, c);
        this.rect(ix + 2, iy + 5, 5, 1, c);
        this.pixel(ix + 2, iy + 4, c);
        this.pixel(ix + 6, iy + 4, c);
      }
      // Circle glyph is drawn as a ring: soften corners.
      if (g === 'B') {
        this.pixel(ix + 2, iy + 2, key);
        this.pixel(ix + 6, iy + 2, key);
        this.pixel(ix + 2, iy + 6, key);
        this.pixel(ix + 6, iy + 6, key);
      }
      return 9;
    }
    const tw = measure(TEXT_FONT, label);
    const w = Math.max(9, tw + 4);
    const round = device === 'xbox' && label.length === 1;
    if (round) {
      this.rect(ix + 1, iy, w - 2, 9, key);
      this.rect(ix, iy + 1, w, 7, key);
    } else {
      this.rect(ix, iy, w, 9, key);
      this.rect(ix, iy + 8, w, 1, colors.edge);
    }
    this.text(label, ix + Math.floor((w - tw) / 2), iy + 1, colors.label, { shadow: null });
    return w;
  }

  /** "[A] Search": a button glyph followed by a verb. Returns total width. */
  prompt(
    g: ButtonGlyph,
    device: GlyphDevice,
    verb: string,
    x: number,
    y: number,
    color: number = C.fog2,
    align: Align = 'left',
    theme?: { keys: KeyColors; shadow: number | null },
  ): number {
    const bw = this.measureButton(g, device);
    const total = bw + 4 + measure(TEXT_FONT, verb);
    let sx = x;
    if (align === 'center') sx = x - total / 2;
    else if (align === 'right') sx = x - total;
    this.button(g, device, sx, y, theme?.keys);
    this.text(verb, sx + bw + 4, y + 1, color, theme ? { shadow: theme.shadow } : undefined);
    return total;
  }

  measureButton(g: ButtonGlyph, device: GlyphDevice): number {
    if (device === 'playstation' && (g === 'A' || g === 'B' || g === 'X' || g === 'Y')) return 9;
    return Math.max(9, measure(TEXT_FONT, glyphLabel(g, device)) + 4);
  }

  /** Segmented bar (HUD): `segs` segments of `segW` px, filled by value/max. */
  segBar(
    x: number,
    y: number,
    segs: number,
    segW: number,
    h: number,
    value: number,
    max: number,
    fill: number,
    empty: number = C.night3,
  ): void {
    const filled = Math.ceil((Math.max(0, value) / max) * segs - 1e-6);
    for (let i = 0; i < segs; i++) this.rect(x + i * (segW + 1), y, segW, h, i < filled ? fill : empty);
  }

  /** Draw an arbitrary canvas (portraits). */
  image(src: CanvasImageSource, x: number, y: number, w?: number, h?: number): void {
    if (w !== undefined && h !== undefined) this.ctx.drawImage(src, Math.round(x), Math.round(y), w, h);
    else this.ctx.drawImage(src, Math.round(x), Math.round(y));
  }
}
