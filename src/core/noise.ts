/** Seeded 2D gradient noise (Perlin-style) and fractal sums. Headless; used by sim and render alike. */
import { Rng } from './rng';

export type Noise2D = (x: number, y: number) => number;

const GRAD: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.7071, 0.7071],
  [-0.7071, 0.7071],
  [0.7071, -0.7071],
  [-0.7071, -0.7071],
];

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Returns a noise function with output roughly in [-1, 1]. */
export function makeNoise2D(seed: number): Noise2D {
  const rng = new Rng(seed);
  const perm = new Uint8Array(512);
  const p: number[] = [];
  for (let i = 0; i < 256; i++) p.push(i);
  rng.shuffle(p);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const dot = (h: number, x: number, y: number): number => {
    const g = GRAD[h & 7];
    return g[0] * x + g[1] * y;
  };

  return (x: number, y: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const aa = perm[perm[X] + Y];
    const ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y];
    const bb = perm[perm[X + 1] + Y + 1];
    const u = fade(xf);
    const v = fade(yf);
    const x1 = dot(aa, xf, yf) + u * (dot(ba, xf - 1, yf) - dot(aa, xf, yf));
    const x2 = dot(ab, xf, yf - 1) + u * (dot(bb, xf - 1, yf - 1) - dot(ab, xf, yf - 1));
    return (x1 + v * (x2 - x1)) * 1.41;
  };
}

/** Fractal Brownian motion over a base noise. */
export function fbm(noise: Noise2D, x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}
