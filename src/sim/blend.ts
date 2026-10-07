/**
 * Blend actions (spec §8.3): short human performances that lower observers' awareness while watched.
 * Tap X for the best action in context; hold X for a radial of every available action.
 */
import { TUNING } from '../content/tuning';
import { F, type Grid } from './grid';
import type { LayoutKind } from './layout';
import type { Activity, BlendKind } from './types';

export interface BlendContext {
  grid: Grid;
  kind: LayoutKind;
  raining: boolean;
  x: number;
  y: number;
  ordered: boolean;
  hasCoffee: boolean;
  /** Near the party car or a gas pump. */
  nearPump: boolean;
  /** Near a register with someone in line (or the register itself). */
  nearQueue: boolean;
}

export const BLEND_LABEL: Record<BlendKind, string> = {
  phone: 'Check phone',
  stretch: 'Stretch',
  fidget: 'Fidget',
  browse: 'Browse shelf',
  queue: 'Wait in line',
  order: 'Order coffee',
  coffee: 'Drink coffee',
  sit: 'Sit',
  menu: 'Read menu',
  tv: 'Watch TV',
  pump: 'Pump gas',
  shelter: 'Shelter',
};

export const BLEND_ACTIVITY: Record<BlendKind, Activity> = {
  phone: 'phone',
  stretch: 'stretch',
  fidget: 'scratch',
  browse: 'browse',
  queue: 'shift',
  order: 'order',
  coffee: 'coffee',
  sit: 'sit',
  menu: 'watch',
  tv: 'tv',
  pump: 'pump',
  shelter: 'shelter',
};

/** Sitting and pumping gas loop until the player moves. */
export const LOOPING: ReadonlySet<BlendKind> = new Set(['sit', 'pump', 'shelter']);

export function blendDuration(kind: BlendKind): number {
  return TUNING.blend.durations[kind];
}

function near(grid: Grid, x: number, y: number, glyphs: string, r: number): boolean {
  const x0 = Math.floor(x - r);
  const x1 = Math.floor(x + r);
  const y0 = Math.floor(y - r);
  const y1 = Math.floor(y + r);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!glyphs.includes(grid.charAt(tx, ty))) continue;
      const cx = Math.max(tx, Math.min(x, tx + 1));
      const cy = Math.max(ty, Math.min(y, ty + 1));
      if ((cx - x) ** 2 + (cy - y) ** 2 <= r * r) return true;
    }
  }
  return false;
}

/** Nearest seat tile (booth, chair, bench) within reach, if any. */
export function nearestSeat(
  grid: Grid,
  x: number,
  y: number,
  r = 1.3,
): { x: number; y: number; glyph: string } | null {
  let best: { x: number; y: number; glyph: string } | null = null;
  let bestD = Infinity;
  for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) {
    for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      if (!grid.has(tx, ty, F.SEAT)) continue;
      const d = (tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2;
      if (d < bestD && d <= (r + 0.5) ** 2) {
        bestD = d;
        best = { x: tx + 0.5, y: ty + 0.5, glyph: grid.charAt(tx, ty) };
      }
    }
  }
  return best;
}

/** Every Blend available here, best first. */
export function availableBlends(c: BlendContext): BlendKind[] {
  const r = TUNING.blend.contextRadius;
  const out: BlendKind[] = [];
  const g = c.grid;
  const diner = c.kind === 'diner';
  const seat = nearestSeat(g, c.x, c.y);
  if (diner) {
    if (!c.ordered && near(g, c.x, c.y, 'C', r)) out.push('order');
    if (seat && (c.hasCoffee || seat.glyph !== 'c')) out.push('sit');
    if (c.hasCoffee) out.push('coffee');
    if (near(g, c.x, c.y, 'U', 4.5)) out.push('tv');
    if (near(g, c.x, c.y, 'M', 2.2)) out.push('menu');
    if (seat && !out.includes('sit')) out.push('sit');
  } else if (seat) {
    out.push('sit');
  }
  if (c.nearPump) out.push('pump');
  if (near(g, c.x, c.y, 'SJH', r)) out.push('browse');
  if (c.nearQueue) out.push('queue');
  if (c.raining && g.flagAt(c.x, c.y, F.COVER)) out.push('shelter');
  if (!diner && near(g, c.x, c.y, 'U', 4.5)) out.push('tv');
  out.push('phone', 'stretch', 'fidget');
  return out;
}
