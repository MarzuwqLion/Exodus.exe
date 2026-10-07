/**
 * Movement: velocity integration with circle-vs-tile collision (sliding along walls), soft separation
 * between actors, path following with natural curves and speed variation, and the two-player leash
 * (spec §4.3: soft resistance near the screen edge, then a hard stop).
 */
import { TUNING } from '../content/tuning';
import { DEG, angleOf, dir8 } from '../core/math';
import type { Grid, Point } from './grid';

export interface Mover {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  facing: number;
  dir: number;
  radius: number;
  speed01: number;
  gait: number;
}

/** Accelerate toward a target velocity. */
export function steer(
  m: Mover,
  tvx: number,
  tvy: number,
  dt: number,
  accel: number = TUNING.movement.accel,
): void {
  const k = Math.min(1, accel * dt);
  m.vx += (tvx - m.vx) * k;
  m.vy += (tvy - m.vy) * k;
}

/** Integrate position with collision against the grid. Returns true if blocked on either axis. */
export function integrate(m: Mover, grid: Grid, dt: number): boolean {
  m.px = m.x;
  m.py = m.y;
  let blocked = false;
  const nx = m.x + m.vx * dt;
  if (grid.circleFree(nx, m.y, m.radius)) m.x = nx;
  else {
    blocked = true;
    m.vx = 0;
  }
  const ny = m.y + m.vy * dt;
  if (grid.circleFree(m.x, ny, m.radius)) m.y = ny;
  else {
    blocked = true;
    m.vy = 0;
  }
  const sp = Math.hypot(m.vx, m.vy);
  if (sp > 0.15) {
    m.facing = angleOf(m.vx, m.vy);
    m.dir = dir8(m.facing);
  }
  // Gait phase advances with distance traveled (one stride cycle ≈ 1.3 m).
  m.gait = (m.gait + (sp * dt * Math.PI * 2) / 1.3) % (Math.PI * 2 * 64);
  return blocked;
}

/** Push overlapping actors apart (cheap O(n²); stops hold a few dozen actors at most). */
export function separate(movers: readonly Mover[], grid: Grid): void {
  for (let i = 0; i < movers.length; i++) {
    const a = movers[i];
    for (let j = i + 1; j < movers.length; j++) {
      const b = movers[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) * 0.5;
      const ux = dx / d;
      const uy = dy / d;
      if (grid.circleFree(a.x - ux * push, a.y - uy * push, a.radius)) {
        a.x -= ux * push;
        a.y -= uy * push;
      }
      if (grid.circleFree(b.x + ux * push, b.y + uy * push, b.radius)) {
        b.x += ux * push;
        b.y += uy * push;
      }
    }
  }
}

export interface PathFollower extends Mover {
  path: Point[];
  pathI: number;
}

/**
 * Steer along a path at `speed`. `wobble` (0..1) bends the heading and varies the pace a little so AI never
 * walks a perfectly straight constant-speed line (the robotic-movement check). Returns true on arrival.
 */
export function followPath(
  m: PathFollower,
  speed: number,
  dt: number,
  time: number,
  wobble = 0,
  seed = 0,
): boolean {
  while (m.pathI < m.path.length) {
    const p = m.path[m.pathI];
    const dx = p.x - m.x;
    const dy = p.y - m.y;
    const d = Math.hypot(dx, dy);
    const last = m.pathI === m.path.length - 1;
    if (d < (last ? 0.12 : 0.35)) {
      m.pathI++;
      continue;
    }
    let ang = Math.atan2(dy, dx);
    let sp = speed;
    if (wobble > 0) {
      ang +=
        Math.sin(time * 1.3 + seed * 17) * 0.22 * wobble + Math.sin(time * 0.53 + seed * 5) * 0.12 * wobble;
      sp *= 1 + Math.sin(time * 0.9 + seed * 11) * 0.12 * wobble;
    }
    if (last) sp = Math.min(sp, Math.max(0.6, d * 2.2));
    steer(m, Math.cos(ang) * sp, Math.sin(ang) * sp, dt, 10);
    return false;
  }
  steer(m, 0, 0, dt, 12);
  return true;
}

/** Leash limits: how far apart two players may be before the camera can't frame them. */
export function leashLimits(): { softX: number; hardX: number; softY: number; hardY: number } {
  const t = TUNING.render.worldPerTexel * TUNING.render.maxZoomOut;
  const p = TUNING.render.pitchDeg * DEG;
  const width = TUNING.render.width * t;
  const depth = (TUNING.render.height * t) / Math.sin(p);
  // Margins keep both characters (and their heads) inside the frame with room for the HUD.
  const hardX = width - 4;
  const hardY = depth - 6;
  return { softX: hardX * 0.82, hardX, softY: hardY * 0.82, hardY };
}

/**
 * Apply the leash to a player's desired velocity given the partner's position: movement that increases the
 * separation is scaled down past the soft limit and stopped at the hard limit.
 */
export function leash(
  m: Mover,
  partner: Point,
  vx: number,
  vy: number,
  out: { x: number; y: number },
): { x: number; y: number } {
  const L = leashLimits();
  out.x = vx;
  out.y = vy;
  const dx = m.x - partner.x;
  const dy = m.y - partner.y;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > L.softX && Math.sign(vx) === Math.sign(dx)) {
    const k = Math.max(0, 1 - (ax - L.softX) / (L.hardX - L.softX));
    out.x = vx * k;
  }
  if (ay > L.softY && Math.sign(vy) === Math.sign(dy)) {
    const k = Math.max(0, 1 - (ay - L.softY) / (L.hardY - L.softY));
    out.y = vy * k;
  }
  return out;
}
