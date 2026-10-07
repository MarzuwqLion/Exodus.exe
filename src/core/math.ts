/** Small math helpers shared by every layer. Headless and allocation-free where it matters. */
import type { Vec2 } from './types';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function invLerp(a: number, b: number, v: number): number {
  return a === b ? 0 : (v - a) / (b - a);
}

export function smoothstep(a: number, b: number, v: number): number {
  const t = clamp01(invLerp(a, b, v));
  return t * t * (3 - 2 * t);
}

/** Move `v` toward `target` by at most `step`. */
export function approach(v: number, target: number, step: number): number {
  if (v < target) return Math.min(target, v + step);
  return Math.max(target, v - step);
}

/** Wrap an angle into (-π, π]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a <= 0) a += TAU;
  return a - Math.PI;
}

/** Signed smallest difference b - a, in (-π, π]. */
export function angleDiff(a: number, b: number): number {
  return wrapAngle(b - a);
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + angleDiff(a, b) * t;
}

/** Rotate angle `a` toward `b` by at most `step` radians. */
export function approachAngle(a: number, b: number, step: number): number {
  const d = angleDiff(a, b);
  if (Math.abs(d) <= step) return b;
  return wrapAngle(a + Math.sign(d) * step);
}

/**
 * Angle convention for the whole game: 0 = east (+x), π/2 = south (+y, down the grid),
 * so `angle = atan2(dy, dx)` in grid space.
 */
export function angleOf(x: number, y: number): number {
  return Math.atan2(y, x);
}

/** Snap an angle to one of 8 directions; returns the index 0..7 (0 = east, 2 = south, 4 = west, 6 = north). */
export function dir8(angle: number): number {
  const idx = Math.round(angle / (Math.PI / 4));
  return ((idx % 8) + 8) % 8;
}

export function dir8Angle(index: number): number {
  return index * (Math.PI / 4);
}

export function vlen(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function dist2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function v2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function copyV(out: Vec2, a: Vec2): Vec2 {
  out.x = a.x;
  out.y = a.y;
  return out;
}

/**
 * Critically damped spring step (no overshoot). Moves `value` toward `target` with angular frequency
 * `omega`, integrating `velocity` in place. Returns the new value.
 */
export function springStep(
  value: number,
  target: number,
  vel: { v: number },
  omega: number,
  dt: number,
): number {
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = value - target;
  const temp = (vel.v + omega * change) * dt;
  vel.v = (vel.v - omega * temp) * exp;
  return target + (change + temp) * exp;
}

/** Radial dead zone with rescaling: below `dz` → 0; above, magnitude remapped to 0..1. */
export function radialDeadZone(x: number, y: number, dz: number, out: Vec2): Vec2 {
  const m = Math.sqrt(x * x + y * y);
  if (m < dz) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const scaled = Math.min(1, (m - dz) / (1 - dz));
  out.x = (x / m) * scaled;
  out.y = (y / m) * scaled;
  return out;
}

export function formatInt(n: number): string {
  return Math.round(n).toString();
}

/** Mean and standard deviation of a ring buffer slice. */
export function meanStd(values: ArrayLike<number>, count: number): { mean: number; std: number } {
  if (count <= 0) return { mean: 0, std: 0 };
  let s = 0;
  for (let i = 0; i < count; i++) s += values[i];
  const mean = s / count;
  let v = 0;
  for (let i = 0; i < count; i++) v += (values[i] - mean) * (values[i] - mean);
  return { mean, std: Math.sqrt(v / count) };
}
