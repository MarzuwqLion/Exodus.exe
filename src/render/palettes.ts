/**
 * Locked palettes (spec §4.5) and the OKLab nearest-color lookup tables used for quantization.
 * Pure TypeScript (no Three.js) so tests and tools can use it too.
 */

/** Main palette, 32 colors, used everywhere except the epilogue. */
export const MAIN_PALETTE = [
  // Night / asphalt
  '#0E1013',
  '#16191E',
  '#1E2228',
  '#2A2F36',
  // Slate
  '#3A4048',
  '#4B525B',
  // Concrete
  '#5C605F',
  '#6B6F6E',
  '#858987',
  // Fog
  '#8C9499',
  '#A7AEB1',
  '#D8DCDA',
  // Rust / red clay
  '#4A3129',
  '#6E4A3A',
  '#8E6450',
  // Moss / pine
  '#3E4030',
  '#5B5E45',
  '#767A5A',
  // Sodium amber
  '#7A5F36',
  '#B08A4E',
  '#D9B26F',
  // Skin tones
  '#3B2A22',
  '#5E4033',
  '#8A6049',
  '#B48A6A',
  '#D4B394',
  // Alarm red
  '#8F1F31',
  '#E8364F',
  '#FF8A98',
  // Scanner cyan
  '#1F7F7A',
  '#3FE0D0',
  '#B8FFF6',
] as const;

/** Epilogue palette, 21 colors: the voyage sunrise and Ghana only. */
export const EPILOGUE_PALETTE = [
  // Dawn sky
  '#1B1A2E',
  '#3B3458',
  '#6A4E6B',
  '#B5655A',
  '#6FA3B8',
  '#D8ECF2',
  // Sun
  '#E39B5B',
  '#F5C77E',
  '#FFF0C9',
  // Green
  '#2F4A3A',
  '#4E7A4F',
  '#8DB36B',
  '#C9D98F',
  // Laterite earth
  '#3A2F28',
  '#7A4E34',
  '#A86F4C',
  // Skin tones (same 5 as main)
  '#3B2A22',
  '#5E4033',
  '#8A6049',
  '#B48A6A',
  '#D4B394',
] as const;

/** Named main-palette colors for content code. */
export const C = {
  night0: 0x0e1013,
  night1: 0x16191e,
  night2: 0x1e2228,
  night3: 0x2a2f36,
  slate0: 0x3a4048,
  slate1: 0x4b525b,
  concrete0: 0x5c605f,
  concrete1: 0x6b6f6e,
  concrete2: 0x858987,
  fog0: 0x8c9499,
  fog1: 0xa7aeb1,
  fog2: 0xd8dcda,
  rust0: 0x4a3129,
  rust1: 0x6e4a3a,
  rust2: 0x8e6450,
  moss0: 0x3e4030,
  moss1: 0x5b5e45,
  moss2: 0x767a5a,
  amber0: 0x7a5f36,
  amber1: 0xb08a4e,
  amber2: 0xd9b26f,
  skin0: 0x3b2a22,
  skin1: 0x5e4033,
  skin2: 0x8a6049,
  skin3: 0xb48a6a,
  skin4: 0xd4b394,
  red0: 0x8f1f31,
  red1: 0xe8364f,
  red2: 0xff8a98,
  cyan0: 0x1f7f7a,
  cyan1: 0x3fe0d0,
  cyan2: 0xb8fff6,
} as const;
export type MainColorName = keyof typeof C;

/** Named epilogue colors. */
export const E = {
  sky0: 0x1b1a2e,
  sky1: 0x3b3458,
  sky2: 0x6a4e6b,
  sky3: 0xb5655a,
  sky4: 0x6fa3b8,
  sky5: 0xd8ecf2,
  sun0: 0xe39b5b,
  sun1: 0xf5c77e,
  sun2: 0xfff0c9,
  green0: 0x2f4a3a,
  green1: 0x4e7a4f,
  green2: 0x8db36b,
  green3: 0xc9d98f,
  earth0: 0x3a2f28,
  earth1: 0x7a4e34,
  earth2: 0xa86f4c,
  skin0: 0x3b2a22,
  skin1: 0x5e4033,
  skin2: 0x8a6049,
  skin3: 0xb48a6a,
  skin4: 0xd4b394,
} as const;

export const SKIN_TONES = [C.skin0, C.skin1, C.skin2, C.skin3, C.skin4] as const;

export function hexToRgb(hex: string | number): [number, number, number] {
  const n = typeof hex === 'number' ? hex : parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToInt(r: number, g: number, b: number): number {
  return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** sRGB (0..255) to OKLab. */
export function toOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export interface PaletteData {
  hex: readonly string[];
  rgb: [number, number, number][];
  lab: [number, number, number][];
  /** Integer RGB set for exact membership tests. */
  set: Set<number>;
}

export function paletteData(hex: readonly string[]): PaletteData {
  const rgb = hex.map((h) => hexToRgb(h));
  return {
    hex,
    rgb,
    lab: rgb.map(([r, g, b]) => toOklab(r, g, b)),
    set: new Set(rgb.map(([r, g, b]) => rgbToInt(r, g, b))),
  };
}

export const MAIN = paletteData(MAIN_PALETTE);
export const EPILOGUE = paletteData(EPILOGUE_PALETTE);

/**
 * Reserved colors (spec §4.5 color rules). Lookups never map ordinary scene colors to these: a color only
 * lands on alarm red or scanner cyan if it is already close to that hue and nearly as saturated as the
 * reserved color itself (so red and cyan stay meaningful).
 */
const RESERVED_CHROMA_FRACTION = 0.6;
const RESERVED_HUE_COS = 0.85;

function isReservedIndex(p: PaletteData, i: number): 'red' | 'cyan' | null {
  const n = rgbToInt(...p.rgb[i]);
  if (n === C.red0 || n === C.red1 || n === C.red2) return 'red';
  if (n === C.cyan0 || n === C.cyan1 || n === C.cyan2) return 'cyan';
  return null;
}

/** Index of the nearest palette color in OKLab, honoring the reserved-hue gate. */
export function nearestIndex(p: PaletteData, r: number, g: number, b: number): number {
  const [L, A, B] = toOklab(r, g, b);
  const chroma = Math.sqrt(A * A + B * B);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < p.lab.length; i++) {
    const reserved = isReservedIndex(p, i);
    if (reserved) {
      // Only strongly red/cyan-hued inputs may quantize to reserved colors.
      const [, pa, pb] = p.lab[i];
      const pc = Math.sqrt(pa * pa + pb * pb);
      if (chroma < pc * RESERVED_CHROMA_FRACTION) continue;
      const cos = (A * pa + B * pb) / (chroma * pc + 1e-9);
      if (cos < RESERVED_HUE_COS) continue;
    }
    const [l2, a2, b2] = p.lab[i];
    const d = (L - l2) * (L - l2) + (A - a2) * (A - a2) + (B - b2) * (B - b2);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function nearestColor(p: PaletteData, r: number, g: number, b: number): [number, number, number] {
  return p.rgb[nearestIndex(p, r, g, b)];
}

/**
 * Build a size³ RGBA lookup table: entry (r, g, b) holds the nearest palette color for the bin center.
 * Index = (b * size + g) * size + r, matching a 3D texture with r along x.
 */
export function buildLut(p: PaletteData, size = 64): Uint8Array {
  const out = new Uint8Array(size * size * size * 4);
  const step = 255 / (size - 1);
  const cache = new Map<number, number>();
  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        const r = Math.round(ri * step);
        const g = Math.round(gi * step);
        const b = Math.round(bi * step);
        const key = rgbToInt(r, g, b);
        let idx = cache.get(key);
        if (idx === undefined) {
          idx = nearestIndex(p, r, g, b);
          cache.set(key, idx);
        }
        const o = ((bi * size + gi) * size + ri) * 4;
        const c = p.rgb[idx];
        out[o] = c[0];
        out[o + 1] = c[1];
        out[o + 2] = c[2];
        out[o + 3] = 255;
      }
    }
  }
  return out;
}

/** True if every RGBA pixel's RGB is in the palette. Returns the count of off-palette pixels. */
export function countOffPalette(pixels: Uint8Array | Uint8ClampedArray, palettes: PaletteData[]): number {
  let bad = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const n = rgbToInt(pixels[i], pixels[i + 1], pixels[i + 2]);
    let ok = false;
    for (const p of palettes) {
      if (p.set.has(n)) {
        ok = true;
        break;
      }
    }
    if (!ok) bad++;
  }
  return bad;
}
