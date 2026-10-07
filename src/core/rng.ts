/**
 * Seeded RNG (mulberry32). Every random roll in the simulation goes through this (spec §3.2),
 * so the same seed plus the same inputs gives the same run. The state is a single uint32,
 * which makes it trivially serializable into saves.
 */
export class Rng {
  state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Random sign: -1 or 1. */
  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on an empty list');
    return items[Math.floor(this.next() * items.length)];
  }

  /** Weighted pick. Items with weight ≤ 0 are never chosen. Returns undefined if nothing has weight. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T | undefined {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (const it of items) {
      const w = Math.max(0, weight(it));
      if (w <= 0) continue;
      if (r < w) return it;
      r -= w;
    }
    // Floating-point leftovers: return the last item with weight.
    for (let i = items.length - 1; i >= 0; i--) if (weight(items[i]) > 0) return items[i];
    return undefined;
  }

  /** Fisher–Yates shuffle, in place. Returns the same array. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
    return items;
  }

  /** Approximately normal (mean 0, sd 1) via the sum of uniforms. */
  gauss(): number {
    return this.next() + this.next() + this.next() + this.next() - 2;
  }

  /** A child RNG with an independent stream derived from this one. */
  fork(salt: number | string = 0): Rng {
    return new Rng(hashSeed(this.next() * 4294967296, salt));
  }
}

/** FNV-1a over the string forms of the parts, finished with a murmur-style avalanche. */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = typeof part === 'number' ? (part >>> 0).toString(16) + ':' + part.toString() : part;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x2f;
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A fresh seed for a new run when none is given (the only place wall-clock entropy enters). */
export function freshSeed(): number {
  return hashSeed(Date.now(), typeof performance !== 'undefined' ? performance.now() : 0) % 1_000_000_000;
}
