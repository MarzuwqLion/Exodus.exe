/**
 * Props, set pieces, and regional dressing (spec §5.3, §10, §11.5, §16), all built in code with the kit.
 *
 * Conventions (see kit.ts): meters, y up, origin at the bottom center of the footprint, facing south (+z,
 * toward the camera). Wall-mounted props (tag 'wall') have their origin on the floor at the wall's face and
 * are modeled at their mounting height, sticking out toward +z. Every color is a named palette constant:
 * `C.*` everywhere, `E.*` only for the epilogue set pieces (tag 'epilogue'). Alarm red never appears here;
 * scanner cyan appears only on the scanner kit (ID kiosk, scanner arch, scanner tower head), per §4.5.
 *
 * Variety comes from `variant` (deterministic; never Math.random). The camera looks north and down at ~55°,
 * so north faces and undersides are never seen: detail goes on south faces and tops.
 */
import type { Kit } from './kit';
import { C, E } from '../render/palettes';

/** A 2D point: [x, z] for footprints, [z, y] for side profiles, [x, y] for front profiles. */
export type P2 = readonly [number, number];

/** A flat rectangle facing +z (signs, screens, posters): center position, width, height. */
export interface FaceAnchor {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
}

// ------------------------------------------------------------------------------------------------
// Deterministic variety
// ------------------------------------------------------------------------------------------------

/** Deterministic hash of (variant, salt) to [0, 1). */
export function vrand(variant: number, salt: number): number {
  let h = Math.imul(Math.floor(Math.abs(variant)) + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** The variant wrapped into [0, n). */
export function vint(variant: number, n: number): number {
  return Math.floor(Math.abs(variant)) % n;
}

/** Pick from a list, decorrelated by `salt`. */
export function vpick<T>(list: readonly T[], variant: number, salt: number): T {
  return list[Math.min(list.length - 1, Math.floor(vrand(variant, salt) * list.length))];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ------------------------------------------------------------------------------------------------
// Shared building helpers (also used by vehicles.ts and ship.ts)
// ------------------------------------------------------------------------------------------------

/** A flat rectangle facing +z at depth z: windows, panels, stripes painted on a south face. */
export function decal(
  k: Kit,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  color: number,
): void {
  k.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], color);
}

/** A flat rectangle facing +x at x (east faces). */
export function decalE(
  k: Kit,
  z0: number,
  y0: number,
  z1: number,
  y1: number,
  x: number,
  color: number,
): void {
  k.quad([x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1], color);
}

/** A flat upward-facing rectangle at height y (rugs, paint, puddles). */
export function flat(k: Kit, x0: number, z0: number, x1: number, z1: number, y: number, color: number): void {
  k.ground(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), y, color);
}

function centroid(pts: readonly P2[]): P2 {
  let x = 0;
  let z = 0;
  for (const p of pts) {
    x += p[0];
    z += p[1];
  }
  return [x / pts.length, z / pts.length];
}

function ccw(pts: readonly P2[]): readonly P2[] {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area < 0 ? [...pts].reverse() : pts;
}

/** A flat upward-facing star-shaped polygon ([x, z] points), fanned from its centroid. */
export function flatPoly(k: Kit, input: readonly P2[], y: number, color: number): void {
  const pts = ccw(input);
  const c = centroid(pts);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    k.tri(c[0], y, c[1], b[0], y, b[1], a[0], y, a[1], color);
  }
}

/**
 * Irregular blob: a star-shaped outline ([x, z]) extruded from y0 to y1, its top shrunk by `taper`
 * toward the centroid (mounds, bushes, tree canopies, bags).
 */
export function blob(
  k: Kit,
  input: readonly P2[],
  y0: number,
  y1: number,
  color: number,
  top = color,
  taper = 1,
): void {
  const pts = ccw(input);
  const c = centroid(pts);
  const t = (p: P2): P2 => [c[0] + (p[0] - c[0]) * taper, c[1] + (p[1] - c[1]) * taper];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const at = t(a);
    const bt = t(b);
    k.quad([b[0], y0, b[1]], [a[0], y0, a[1]], [at[0], y1, at[1]], [bt[0], y1, bt[1]], color);
    k.tri(c[0], y1, c[1], bt[0], y1, bt[1], at[0], y1, at[1], top);
  }
}

/** An irregular outline of n points around the origin (radii rx, rz), deterministic per variant. */
export function blobPts(variant: number, salt: number, rx: number, rz: number, n = 8, jitter = 0.2): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + vrand(variant, salt) * 0.6;
    const r = 1 - jitter * vrand(variant, salt + i * 13 + 1);
    out.push([Math.cos(a) * rx * r, Math.sin(a) * rz * r]);
  }
  return out;
}

/** Truncated cone from radius r0 at y0 to r1 at y1 (r1 = 0 makes a cone), with an optional top cap. */
export function frustum(
  k: Kit,
  r0: number,
  r1: number,
  y0: number,
  y1: number,
  sides: number,
  color: number,
  top: number | null = color,
): void {
  const ring: P2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
    ring.push([Math.cos(a), Math.sin(a)]);
  }
  for (let i = 0; i < sides; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % sides];
    k.quad(
      [b[0] * r0, y0, b[1] * r0],
      [a[0] * r0, y0, a[1] * r0],
      [a[0] * r1, y1, a[1] * r1],
      [b[0] * r1, y1, b[1] * r1],
      color,
    );
  }
  if (top !== null && r1 > 0.001) {
    for (let i = 1; i < sides - 1; i++) {
      const a = ring[0];
      const b = ring[i];
      const c = ring[i + 1];
      k.tri(a[0] * r1, y1, a[1] * r1, c[0] * r1, y1, c[1] * r1, b[0] * r1, y1, b[1] * r1, top);
    }
  }
}

/**
 * Extrude a convex side profile ([z, y] points, any winding) along x across width w, closed on all sides.
 * `color` may be one color or one per profile edge (edge i runs from point i to point i + 1).
 */
export function extrudeX(
  k: Kit,
  profile: readonly P2[],
  w: number,
  color: number | readonly number[],
  cap?: number,
): void {
  const n = profile.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = profile[i];
    const b = profile[(i + 1) % n];
    area += a[1] * b[0] - b[1] * a[0];
  }
  const flip = area < 0;
  const pts = flip ? [...profile].reverse() : profile;
  const edgeColor = (j: number): number => {
    if (typeof color === 'number') return color;
    const i = flip ? (2 * n - 2 - j) % n : j;
    return color[i % color.length];
  };
  const capColor = cap ?? (typeof color === 'number' ? color : color[0]);
  const x0 = -w / 2;
  const x1 = w / 2;
  for (let j = 0; j < n; j++) {
    const a = pts[j];
    const b = pts[(j + 1) % n];
    k.quad([x0, a[1], a[0]], [x0, b[1], b[0]], [x1, b[1], b[0]], [x1, a[1], a[0]], edgeColor(j));
  }
  for (let i = 1; i < n - 1; i++) {
    const p0 = pts[0];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    k.tri(x1, p0[1], p0[0], x1, p1[1], p1[0], x1, p2[1], p2[0], capColor);
    k.tri(x0, p0[1], p0[0], x0, p2[1], p2[0], x0, p1[1], p1[0], capColor);
  }
}

/** Extrude a convex front profile ([x, y] points) along z across depth d. */
export function extrudeZ(
  k: Kit,
  profile: readonly P2[],
  d: number,
  color: number | readonly number[],
  cap?: number,
): void {
  k.at({ ry: Math.PI / 2 }, () => extrudeX(k, profile, d, color, cap));
}

/** A wheel centered at (x, r, z) with its axle along x; `side` is the direction its outer face points. */
export function wheel(
  k: Kit,
  x: number,
  z: number,
  r: number,
  w: number,
  side: 1 | -1,
  tire: number,
  hub: number,
  sides = 8,
): void {
  k.at({ x: x - (side * w) / 2, y: r, z, rz: side > 0 ? -Math.PI / 2 : Math.PI / 2 }, () => {
    k.cylinder(r, w, sides, tire);
    k.cylinder(r * 0.5, w + 0.03, 6, hub);
  });
}

/** Four square legs under a w × d top. */
export function legs4(k: Kit, w: number, d: number, h: number, t: number, color: number, y = 0): void {
  const x = w / 2 - t / 2;
  const z = d / 2 - t / 2;
  k.box(t, h, t, color, { x: -x, y, z: -z });
  k.box(t, h, t, color, { x, y, z: -z });
  k.box(t, h, t, color, { x: -x, y, z });
  k.box(t, h, t, color, { x, y, z });
}

/** Muted product colors for shelves, books, and boxes. */
const GOODS = [
  C.amber0,
  C.amber1,
  C.rust1,
  C.rust2,
  C.moss1,
  C.moss2,
  C.fog1,
  C.slate1,
  C.concrete2,
  C.skin3,
  C.fog0,
  C.skin2,
] as const;

// ================================================================================================
// Stops: depot, store, diner (§5.3, §10.2–10.4)
// ================================================================================================

/** Depot charging bay: concrete island, post with an amber or fog screen, hanging cable and plug. */
export function chargingBay(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  k.box(1.1, 0.15, 0.75, C.concrete1, {}, { top: C.concrete0 });
  decal(k, -0.55, 0, 0.55, 0.15, 0.376, C.amber0);
  k.cylinder(0.09, 0.85, 6, C.amber1, { x: -0.42, y: 0.15, z: 0.22 });
  // post and cap
  k.box(0.5, 1.55, 0.36, C.slate1, { y: 0.15, z: -0.12 }, { top: C.slate0 });
  k.box(0.62, 0.14, 0.48, C.night3, { y: 1.7, z: -0.12 });
  // screen
  k.box(0.38, 0.32, 0.08, C.night1, { y: 1.12, z: 0.08 });
  if (v === 2) {
    k.box(0.3, 0.22, 0.04, C.night0, { y: 1.17, z: 0.12 });
    decal(k, -0.25, 0.62, 0.25, 0.74, 0.061, C.amber1);
  } else {
    k.glow(() => {
      k.box(0.3, 0.22, 0.04, v === 0 ? C.amber2 : C.fog2, { y: 1.17, z: 0.12 });
      k.box(0.44, 0.08, 0.04, C.amber1, { y: 1.58, z: 0.08 });
    });
  }
  // holster, plug, and cable
  k.box(0.16, 0.26, 0.18, C.night2, { x: 0.33, y: 0.9, z: -0.08 });
  if (v === 2) {
    k.pipe([0.3, 0.55, 0], [0.48, 0.16, 0.28], 0.08, C.night0);
    k.pipe([0.48, 0.16, 0.28], [-0.12, 0.16, 0.33], 0.08, C.night0);
    k.box(0.18, 0.1, 0.12, C.night1, { x: -0.22, y: 0.15, z: 0.33 });
  } else {
    k.box(0.12, 0.2, 0.14, C.night1, { x: 0.33, y: 1.12, z: -0.08 });
    k.pipe([0.25, 0.62, 0.02], [0.46, 0.22, 0.22], 0.08, C.night0);
    k.pipe([0.46, 0.22, 0.22], [0.38, 1.1, 0.0], 0.08, C.night0);
  }
}

/** Gas-station EV charger: slim fog cabinet with a slanted cap, screen, and holstered connector. */
export function evCharger(k: Kit, variant = 0): void {
  const v = vint(variant, 2);
  const body = v === 0 ? C.fog0 : C.concrete2;
  k.box(0.85, 0.12, 0.6, C.concrete1, {}, { top: C.concrete0 });
  k.box(0.46, 1.62, 0.32, body, { y: 0.12 }, { top: C.slate1 });
  k.wedge(0.5, 0.18, 0.36, C.slate1, { y: 1.74 });
  decal(k, -0.23, 1.46, 0.23, 1.56, 0.161, C.amber1);
  decal(k, -0.17, 0.26, 0.17, 0.36, 0.161, C.slate0);
  k.box(0.32, 0.26, 0.05, C.night1, { y: 1.12, z: 0.18 });
  k.glow(() => k.box(0.26, 0.19, 0.03, v === 0 ? C.fog2 : C.amber2, { y: 1.155, z: 0.2 }));
  k.box(0.16, 0.24, 0.12, C.night2, { y: 0.7, z: 0.22 });
  k.box(0.11, 0.16, 0.1, C.night1, { y: 0.9, z: 0.25 });
  k.pipe([0.23, 0.42, 0.05], [0.42, 0.18, 0.22], 0.08, C.night0);
  k.pipe([0.42, 0.18, 0.22], [0.06, 0.78, 0.27], 0.08, C.night0);
  if (v === 1) decal(k, -0.12, 0.5, 0.06, 0.68, 0.161, C.fog1);
}

/** Depot ID kiosk: pedestal with a tilted cyan screen and a cyan card slot (scanner cyan is allowed here). */
export function idKiosk(k: Kit, variant = 0): void {
  k.box(0.8, 0.1, 0.6, C.concrete0, {}, { top: C.night3 });
  k.box(0.56, 1.25, 0.42, C.slate1, { y: 0.1 }, { top: C.slate0 });
  decal(k, -0.24, 0.2, 0.24, 0.3, 0.211, C.night3);
  k.box(0.36, 0.08, 0.2, C.night2, { y: 1.02, z: 0.28 });
  k.glow(() => {
    k.box(0.22, 0.04, 0.12, C.cyan0, { y: 1.1, z: 0.28 });
    k.box(0.22, 0.08, 0.03, C.cyan2, { y: 0.8, z: 0.225 });
  });
  k.at({ y: 1.35, rx: -0.35 }, () => {
    k.box(0.66, 0.62, 0.22, C.night3);
    k.box(0.72, 0.08, 0.3, C.night2, { y: 0.62, z: 0.03 });
    k.glow(() => k.box(0.5, 0.44, 0.04, C.cyan1, { y: 0.09, z: 0.12 }));
  });
  if (vint(variant, 2) === 1) {
    decal(k, 0.04, 0.5, 0.22, 0.72, 0.211, C.fog1);
    decal(k, -0.24, 0.38, -0.06, 0.46, 0.211, C.slate0);
  }
  k.light({ x: 0, y: 1.6, z: 0.5, color: C.cyan1, intensity: 2, range: 4 });
}

/**
 * Convenience-store gondola, 1 m long: four levels of goods on the south side
 * (variants: grocery, snacks, auto parts, picked over).
 */
export function shelf(k: Kit, variant = 0): void {
  const v = vint(variant, 4);
  const W = 1.0;
  k.box(W, 0.12, 0.9, C.night3);
  k.box(W - 0.04, 1.8, 0.1, C.slate0, { z: -0.05 });
  k.box(0.08, 1.8, 0.9, C.slate1, { x: -W / 2 + 0.04 }, { top: C.slate0 });
  k.box(0.08, 1.8, 0.9, C.slate1, { x: W / 2 - 0.04 }, { top: C.slate0 });
  const palette: readonly number[] =
    v === 1
      ? [C.amber0, C.amber1, C.rust2, C.skin3, C.rust1]
      : v === 2
        ? [C.slate1, C.concrete1, C.night3, C.amber1, C.amber0, C.rust1]
        : GOODS;
  const levels = [0.12, 0.55, 0.98, 1.41];
  levels.forEach((y, li) => {
    if (li > 0) k.box(W - 0.16, 0.08, 0.42, C.fog0, { y: y - 0.08, z: 0.22 }, { top: C.slate0 });
    let x = -0.42;
    for (let i = 0; i < 4 && x < 0.36; i++) {
      const w = Math.min(0.42 - x, 0.18 + 0.2 * vrand(variant, li * 31 + i * 7));
      const empty = v === 3 ? vrand(variant, li * 17 + i * 5 + 3) < 0.5 : vrand(variant, li * 19 + i) < 0.08;
      if (!empty && w > 0.08) {
        const h = (v === 2 ? 0.14 : 0.18) + 0.16 * vrand(variant, li * 23 + i * 11);
        const c = vpick(palette, variant, li * 41 + i * 13);
        k.box(w - 0.02, h, 0.32, c, { x: x + w / 2, y, z: 0.22 });
      }
      x += w;
    }
  });
  if (v === 3) k.box(0.3, 0.18, 0.22, C.amber0, { x: 0.1, y: 0, z: 0.62, ry: 0.5 });
}

/** Store register: counter section with the register, a customer display, a card reader, and a candy rack. */
export function register(k: Kit, variant = 0): void {
  const v = vint(variant, 2);
  k.box(1.0, 0.95, 0.6, C.slate0);
  decal(k, -0.46, 0.14, 0.46, 0.86, 0.301, C.slate1);
  decal(k, -0.5, 0, 0.5, 0.1, 0.301, C.night2);
  k.box(1.06, 0.08, 0.66, C.concrete1, { y: 0.95 }, { top: C.concrete0 });
  k.box(0.44, 0.1, 0.4, C.night2, { x: -0.18, y: 1.03, z: -0.05 });
  k.box(0.4, 0.16, 0.34, C.night3, { x: -0.18, y: 1.13, z: -0.07 }, { top: C.slate0 });
  k.box(0.08, 0.2, 0.08, C.night2, { x: -0.18, y: 1.29, z: -0.14 });
  k.box(0.36, 0.2, 0.08, C.night1, { x: -0.18, y: 1.45, z: -0.12 });
  k.glow(() => k.box(0.28, 0.12, 0.03, v === 1 ? C.fog2 : C.amber2, { x: -0.18, y: 1.49, z: -0.075 }));
  k.box(0.14, 0.12, 0.18, C.night1, { x: 0.24, y: 1.03, z: 0.12 });
  // candy rack on the customer side
  k.box(0.38, 0.44, 0.14, C.amber0, { x: 0.22, y: 0.4, z: 0.37 }, { top: C.amber1 });
  decal(k, 0.06, 0.7, 0.2, 0.8, 0.441, C.rust2);
  decal(k, 0.24, 0.7, 0.38, 0.8, 0.441, C.moss2);
  decal(k, 0.06, 0.52, 0.38, 0.62, 0.441, C.fog1);
  if (v === 1) k.cylinder(0.07, 0.16, 6, C.fog0, { x: 0.38, y: 1.03, z: 0.18 }, C.night2);
}

/** Diner counter section: paneled front, chrome band, fog countertop; variants add counter clutter. */
export function counter(k: Kit, variant = 0): void {
  const v = vint(variant, 4);
  k.box(1.0, 0.92, 0.6, C.rust1);
  decal(k, -0.5, 0, 0.5, 0.12, 0.301, C.night2);
  decal(k, -0.5, 0.76, 0.5, 0.86, 0.301, C.concrete2);
  decal(k, -0.04, 0.12, 0.04, 0.76, 0.301, C.rust0);
  k.box(1.02, 0.08, 0.72, C.concrete2, { y: 0.92, z: 0.04 }, { top: C.fog1 });
  const y = 1.0;
  if (v === 1) {
    k.box(0.14, 0.14, 0.09, C.concrete2, { x: -0.2, y, z: -0.1 });
    k.cylinder(0.05, 0.13, 6, C.fog2, { x: 0.05, y, z: -0.1 }, C.concrete2);
    k.box(0.08, 0.18, 0.08, C.amber1, { x: 0.2, y, z: -0.12 });
  } else if (v === 2) {
    k.cylinder(0.2, 0.06, 8, C.concrete2, { x: 0.1, y, z: -0.05 });
    k.at({ x: 0.1, z: -0.05 }, () => {
      k.cylinder(0.17, 0.06, 8, C.amber1, { y: y + 0.06 }, C.amber0);
      frustum(k, 0.21, 0.08, y + 0.12, y + 0.36, 8, C.fog0);
    });
  } else if (v === 3) {
    k.cylinder(0.13, 0.12, 8, C.fog2, { x: -0.22, y, z: -0.08 }, C.fog1);
    k.cylinder(0.05, 0.1, 6, C.fog2, { x: 0.18, y, z: 0.12 }, C.night1);
    k.box(0.08, 0.06, 0.06, C.fog2, { x: 0.25, y: y + 0.03, z: 0.12 });
  }
}

/** Diner booth bench, 1.2 m wide; the seat faces +z and the high back sits on the north edge. */
export function boothSeat(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  const vinyl = [C.rust1, C.moss1, C.amber0][v];
  const vinylTop = [C.rust2, C.moss2, C.amber1][v];
  const dark = [C.rust0, C.moss0, C.rust0][v];
  k.box(1.2, 0.3, 0.6, C.night3, { z: 0.02 });
  k.box(1.2, 0.15, 0.56, vinyl, { y: 0.3, z: 0.04 }, { top: vinylTop });
  k.box(1.2, 0.68, 0.2, vinyl, { y: 0.42, z: -0.2 }, { top: dark });
  k.box(1.26, 0.1, 0.26, C.night3, { y: 1.1, z: -0.2 });
  decal(k, -0.22, 0.5, -0.14, 1.04, -0.099, dark);
  decal(k, 0.14, 0.5, 0.22, 1.04, -0.099, dark);
  if (v === 1) flat(k, 0.12, 0.06, 0.38, 0.24, 0.452, C.amber1);
  if (v === 2) flat(k, -0.42, 0.08, -0.16, 0.28, 0.452, C.rust0);
}

/** Diner table, 0.8 × 1.2 m on a pedestal, condiments at the wall (north) end. */
export function dinerTable(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  k.box(0.5, 0.06, 0.5, C.night3);
  k.box(0.12, 0.64, 0.12, C.concrete1, { y: 0.06 });
  k.box(0.8, 0.08, 1.2, C.concrete2, { y: 0.7 }, { top: C.fog1 });
  const y = 0.78;
  k.box(0.14, 0.14, 0.09, C.concrete2, { y, z: -0.45 });
  k.box(0.08, 0.18, 0.08, C.amber1, { x: -0.16, y, z: -0.47 });
  k.cylinder(0.05, 0.12, 6, C.fog2, { x: 0.16, y, z: -0.47 }, C.concrete2);
  if (v === 1) {
    k.box(0.26, 0.03, 0.26, C.fog2, { x: -0.18, y, z: 0.2 });
    k.box(0.26, 0.03, 0.26, C.fog2, { x: 0.18, y, z: -0.05 });
    k.cylinder(0.05, 0.1, 6, C.fog2, { x: 0.2, y, z: 0.3 }, C.night1);
  } else if (v === 2) {
    k.box(0.22, 0.03, 0.32, C.amber0, { x: -0.15, y, z: 0.1, ry: 0.3 });
    k.cylinder(0.05, 0.1, 6, C.fog2, { x: 0.2, y, z: 0.05 }, C.night1);
    k.box(0.12, 0.04, 0.09, C.night2, { x: 0.18, y, z: 0.42 });
  }
}

/** A booth: table with benches on the east and west (backs never block the camera's view). */
export function boothSet(k: Kit, variant = 0): void {
  dinerTable(k, variant);
  k.at({ x: -0.74, ry: Math.PI / 2 }, () => boothSeat(k, variant));
  k.at({ x: 0.74, ry: -Math.PI / 2 }, () => boothSeat(k, variant));
}

/** Counter stool; variant 3 lies knocked over (Brick breaks the stools). */
export function stool(k: Kit, variant = 0): void {
  const v = vint(variant, 4);
  const seat = [C.rust1, C.moss1, C.amber0, C.rust1][v];
  const seatTop = [C.rust2, C.moss2, C.amber1, C.rust2][v];
  const build = (): void => {
    frustum(k, 0.2, 0.08, 0, 0.08, 6, C.concrete1);
    k.cylinder(0.05, 0.56, 6, C.concrete2, { y: 0.08 });
    k.cylinder(0.21, 0.12, 8, seat, { y: 0.62 }, seatTop);
  };
  if (v === 3) k.at({ x: 0.36, y: 0.21, rz: Math.PI / 2 }, build);
  else build();
}

/** Seat, four legs, and a back (shared by the chairs). */
function seatAndBack(k: Kit, frame: number, seat: number, seatTop: number, openBack: boolean): void {
  legs4(k, 0.42, 0.42, 0.44, 0.08, frame);
  k.box(0.46, 0.08, 0.46, seat, { y: 0.44 }, { top: seatTop });
  if (openBack) {
    k.box(0.08, 0.5, 0.08, frame, { x: -0.19, y: 0.52, z: -0.19 });
    k.box(0.08, 0.5, 0.08, frame, { x: 0.19, y: 0.52, z: -0.19 });
    k.box(0.46, 0.2, 0.08, seat, { y: 0.8, z: -0.19 }, { top: seatTop });
  } else {
    k.box(0.44, 0.56, 0.08, frame, { y: 0.52, z: -0.19 }, { top: seatTop });
  }
}

/** A plain chair (wood, diner chrome, or plastic); faces +z. */
export function chair(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  const frame = [C.amber0, C.concrete2, C.slate1][v];
  const seat = [C.amber0, C.rust1, C.slate1][v];
  const seatTop = [C.amber1, C.rust2, C.slate0][v];
  seatAndBack(k, frame, seat, seatTop, true);
}

/** Commercial coffee brewer with two carafes (black regular, amber decaf) and warmer lights. */
export function coffeeMachine(k: Kit, variant = 0): void {
  const body = vint(variant, 2) === 0 ? C.concrete2 : C.night3;
  k.box(0.52, 0.08, 0.4, C.night3);
  k.box(0.52, 0.58, 0.14, body, { z: -0.13 });
  k.box(0.52, 0.16, 0.4, body, { y: 0.48 }, { top: C.concrete1 });
  k.box(0.18, 0.08, 0.22, C.night2, { x: -0.12, y: 0.4, z: 0.04 });
  for (const [x, handle] of [
    [-0.12, C.night0],
    [0.12, C.amber1],
  ] as const) {
    k.cylinder(0.08, 0.2, 6, C.night1, { x, y: 0.08, z: 0.05 }, C.night2);
    k.box(0.08, 0.12, 0.06, handle, { x, y: 0.14, z: 0.16 });
  }
  k.glow(() => {
    k.box(0.08, 0.08, 0.03, C.amber2, { x: -0.12, y: 0.52, z: 0.205 });
    k.box(0.08, 0.08, 0.03, C.amber2, { x: 0.12, y: 0.52, z: 0.205 });
  });
}

/** The menu board's face, where the scene places `menuBoardCanvas()` (signs.ts). Wall-mounted. */
export const MENU_BOARD_FACE: FaceAnchor = { x: 0, y: 2.6, z: 0.105, w: 3.0, h: 1.2 };

/** Diner menu board (wall): dark board in an amber frame, two lamps over it. */
export function menuBoard(k: Kit, variant = 0): void {
  const v = vint(variant, 2);
  k.box(3.0, 1.2, 0.1, C.night1, { y: 2.0, z: 0.05 });
  k.frame(3.16, 1.36, 0.08, 0.14, C.amber0, { y: 1.92, z: 0.07 });
  for (const x of [-1.0, 1.0]) {
    k.pipe([x, 3.45, 0.02], [x, 3.45, 0.32], 0.08, C.night3);
    k.box(0.3, 0.14, 0.18, C.night3, { x, y: 3.34, z: 0.4 });
    const dead = v === 1 && x > 0;
    if (dead) k.box(0.22, 0.08, 0.03, C.amber0, { x, y: 3.37, z: 0.5 });
    else k.glow(() => k.box(0.22, 0.08, 0.03, C.amber2, { x, y: 3.37, z: 0.5 }));
  }
  k.light({ x: v === 1 ? -0.8 : 0, y: 3.2, z: 0.6, color: C.amber2, intensity: 2, range: 4 });
}

/** The wall TV's screen rectangle (for a news texture over the emissive screen). Wall-mounted. */
export const WALL_TV_SCREEN: FaceAnchor = { x: 0, y: 2.48, z: 0.275, w: 1.06, h: 0.6 };

/** Wall-mounted TV with a fog-white emissive screen; variant 1 shows an amber news lower-third. */
export function wallTv(k: Kit, variant = 0): void {
  const v = vint(variant, 2);
  k.box(0.32, 0.32, 0.1, C.night3, { y: 2.32, z: 0.05 });
  k.pipe([0, 2.48, 0.08], [0, 2.48, 0.16], 0.1, C.night3);
  k.box(1.18, 0.72, 0.1, C.night1, { y: 2.12, z: 0.2 });
  k.glow(() => {
    k.box(1.06, 0.6, 0.03, C.fog2, { y: 2.18, z: 0.255 });
    if (v === 1) {
      k.box(0.9, 0.1, 0.02, C.amber1, { y: 2.24, z: 0.276 });
      k.box(0.2, 0.1, 0.02, C.amber2, { x: -0.38, y: 2.36, z: 0.276 });
    }
  });
  k.light({ x: 0, y: 2.4, z: 0.8, color: C.fog1, intensity: 1.5, range: 4, flicker: 0.3, tag: 'tv' });
}

/**
 * Gas pump on its island with side nozzles, hoses, and amber bollards; variant 1 is out of order,
 * variant 2 a diesel pump.
 */
export function gasPump(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  const body = v === 2 ? C.concrete2 : C.fog1;
  const trim = v === 2 ? C.moss1 : C.slate1;
  k.box(1.7, 0.15, 0.9, C.concrete1, {}, { top: C.concrete2 });
  decal(k, -0.85, 0, 0.85, 0.15, 0.451, C.amber0);
  k.box(0.82, 1.5, 0.46, body, { y: 0.15 }, { top: C.fog0 });
  decal(k, -0.32, 0.26, 0.32, 0.86, 0.231, C.fog0);
  k.box(0.92, 0.36, 0.52, trim, { y: 1.65 }, { top: C.slate0 });
  k.box(0.38, 0.24, 0.05, C.night1, { y: 1.18, z: 0.25 });
  k.glow(() => {
    if (v !== 1) k.box(0.3, 0.15, 0.03, C.amber2, { y: 1.225, z: 0.27 });
    k.box(0.72, 0.16, 0.03, v === 1 ? C.fog1 : C.fog2, { y: 1.75, z: 0.27 });
  });
  for (const s of [-1, 1] as const) {
    k.box(0.12, 0.3, 0.22, C.night2, { x: s * 0.47, y: 0.85 });
    k.box(0.1, 0.24, 0.12, v === 2 ? C.moss1 : C.night1, { x: s * 0.5, y: 1.0, z: 0.05 });
    k.pipe([s * 0.43, 1.5, -0.1], [s * 0.62, 0.55, 0.05], 0.08, C.night0);
    k.pipe([s * 0.62, 0.55, 0.05], [s * 0.52, 1.0, 0.05], 0.08, C.night0);
    k.cylinder(0.09, 0.8, 6, C.amber1, { x: s * 0.72, y: 0.15, z: 0.24 });
  }
  if (v === 1) k.box(0.22, 0.32, 0.22, C.fog0, { x: 0.5, y: 0.94, z: 0.05 });
}

const CANOPY_POSTS: readonly P2[] = [
  [-2.5, -1.5],
  [2.5, -1.5],
  [-2.5, 1.5],
  [2.5, 1.5],
];

/** Gas-station canopy posts (separate so the scene can fade the roof when someone is under it). */
export function canopyPosts(k: Kit): void {
  for (const [x, z] of CANOPY_POSTS) {
    k.box(0.7, 0.15, 0.7, C.concrete1, { x, z }, { top: C.concrete0 });
    k.box(0.4, 4.6, 0.4, C.concrete2, { x, y: 0.15, z }, { top: C.concrete1 });
    decal(k, x - 0.2, 0.15, x + 0.2, 0.95, z + 0.201, C.amber1);
  }
}

/** Gas-station canopy roof, 8 × 6 m at 4.75 m, with fog-white light panels and lights underneath. */
export function canopyRoof(k: Kit, variant = 0): void {
  const y = 4.75;
  k.box(8, 0.55, 6, C.fog1, { y }, { top: C.concrete1 });
  decal(k, -4, y + 0.2, 4, y + 0.34, 3.001, vint(variant, 2) === 0 ? C.amber1 : C.slate1);
  k.glow(() => {
    for (const x of [-2, 2]) {
      for (const z of [-1.4, 1.4]) k.box(1.6, 0.12, 0.8, C.fog2, { x, y: y - 0.12, z });
    }
  });
  k.light({ x: -2, y: y - 0.3, z: 0, color: C.fog2, intensity: 5, range: 9 });
  k.light({ x: 2, y: y - 0.3, z: 0, color: C.fog2, intensity: 5, range: 9, flicker: vint(variant, 2) * 0.4 });
}

/** The whole canopy: posts and roof. */
export function canopy(k: Kit, variant = 0): void {
  canopyPosts(k);
  canopyRoof(k, variant);
}

/** A bank of three lockers, 1 m wide; variant 2 has a door hanging open. */
export function lockers(k: Kit, variant = 0): void {
  const v = vint(variant, 4);
  const body = [C.slate0, C.moss0, C.concrete0, C.rust0][v];
  const door = [C.slate1, C.moss1, C.concrete1, C.rust1][v];
  k.box(1.0, 1.9, 0.5, body, {}, { top: C.night3 });
  const zf = 0.251;
  for (let i = 0; i < 3; i++) {
    const x = -0.33 + i * 0.33;
    if (v === 2 && i === 1) {
      decal(k, x - 0.13, 0.08, x + 0.13, 1.82, zf, C.night1);
      decal(k, x - 0.13, 1.3, x + 0.13, 1.38, zf + 0.001, C.slate0);
      k.at({ x: x - 0.14, z: zf, ry: -1.1 }, () => k.box(0.27, 1.72, 0.06, door, { x: 0.135, y: 0.09 }));
    } else {
      decal(k, x - 0.13, 0.08, x + 0.13, 1.82, zf, door);
      decal(k, x - 0.08, 1.56, x + 0.08, 1.64, zf + 0.001, C.night2);
      decal(k, x - 0.08, 1.42, x + 0.08, 1.5, zf + 0.001, C.night2);
      k.box(0.08, 0.16, 0.06, C.concrete2, { x: x + 0.08, y: 0.92, z: zf + 0.03 });
    }
    decal(k, x - 0.05, 1.7, x + 0.05, 1.78, zf + 0.002, C.amber0);
  }
}

/** Parts rack: wire shelving with open bins of small parts (variant 2: a wooden crate of parts). */
export function partsBin(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  if (v === 2) {
    k.box(1.0, 0.7, 0.7, C.amber0, {}, { top: C.night2 });
    decal(k, -0.5, 0.12, 0.5, 0.2, 0.351, C.rust1);
    decal(k, -0.5, 0.5, 0.5, 0.58, 0.351, C.rust1);
    k.box(0.3, 0.16, 0.2, C.concrete2, { x: -0.2, y: 0.66, z: 0.05, ry: 0.4 });
    k.box(0.14, 0.22, 0.14, C.slate1, { x: 0.22, y: 0.62, z: -0.1 });
    k.at({ x: 0.15, y: 0.72, z: 0.15, rx: Math.PI / 2 }, () => k.cylinder(0.14, 0.08, 6, C.concrete1));
    return;
  }
  const bins = v === 0 ? [C.amber1, C.slate1, C.amber1] : [C.moss1, C.rust2, C.slate1];
  for (const x of [-0.48, 0.48]) k.box(0.08, 1.4, 0.5, C.night3, { x });
  [0.1, 0.55, 1.0].forEach((y, li) => {
    k.box(0.88, 0.06, 0.48, C.night3, { y });
    for (let i = 0; i < 3; i++) {
      const x = -0.29 + i * 0.29;
      k.box(0.26, 0.24, 0.42, bins[(i + li) % 3], { x, y: y + 0.06 }, { top: C.night2 });
      decal(k, x - 0.08, y + 0.13, x + 0.08, y + 0.21, 0.211, C.fog1);
    }
  });
  k.box(0.12, 0.12, 0.1, C.concrete2, { x: -0.3, y: 0.36, z: 0.02 });
  k.box(0.1, 0.14, 0.12, C.concrete2, { x: 0.28, y: 0.8, z: -0.04 });
  k.box(0.14, 0.1, 0.1, C.concrete1, { x: 0.02, y: 1.26, z: 0.04 });
}

/** Vending machine with a lit front (fog snacks or amber drinks); variant 2 is dead and dark. */
export function vendingMachine(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  k.box(1.0, 1.9, 0.8, C.slate0, {}, { top: C.night3 });
  const zf = 0.401;
  const lit = v === 0 ? C.fog2 : C.amber2;
  if (v === 2) {
    decal(k, -0.45, 0.45, 0.17, 1.75, zf, C.night1);
    k.quad(
      [-0.4, 1.1, zf + 0.001],
      [-0.32, 1.1, zf + 0.001],
      [0.1, 1.6, zf + 0.001],
      [0.02, 1.6, zf + 0.001],
      C.fog0,
    );
    decal(k, -0.3, 0.9, -0.02, 1.02, zf + 0.001, C.fog1);
    decal(k, 0.27, 1.2, 0.4, 1.42, zf + 0.001, C.amber0);
  } else {
    k.glow(() => {
      decal(k, -0.45, 0.45, 0.17, 1.75, zf, lit);
      k.box(0.9, 0.1, 0.03, lit, { y: 1.78, z: 0.415 });
      decal(k, 0.27, 1.2, 0.4, 1.42, zf + 0.001, C.amber1);
    });
    for (let r = 0; r < 4; r++) {
      const y = 0.52 + r * 0.31;
      decal(k, -0.45, y, 0.17, y + 0.08, zf + 0.001, C.slate0);
      for (let i = 0; i < 4; i++) {
        const x = -0.41 + i * 0.145;
        decal(k, x, y + 0.1, x + 0.1, y + 0.24, zf + 0.001, vpick(GOODS, variant, r * 7 + i));
      }
    }
    k.light({ x: -0.1, y: 1.2, z: 0.9, color: lit, intensity: 2.5, range: 4 });
  }
  decal(k, 0.22, 0.6, 0.45, 1.6, zf, C.slate1);
  decal(k, 0.3, 0.95, 0.37, 1.1, zf + 0.001, C.night0);
  k.box(0.62, 0.24, 0.06, C.night1, { x: -0.14, y: 0.12, z: 0.42 });
}

/** Where the camera head pivots on its wall mount (model space). */
export const SECURITY_CAMERA_PIVOT = { x: 0, y: 2.9, z: 0.42 } as const;

/** Security camera wall bracket, conduit, and junction box (wall-mounted). */
export function securityCameraMount(k: Kit): void {
  k.box(0.22, 0.3, 0.08, C.night3, { y: 2.74, z: 0.04 });
  k.pipe([0, 2.9, 0.06], [0, 2.9, 0.38], 0.1, C.night3);
  k.box(0.16, 0.14, 0.12, C.slate0, { y: 2.5, z: 0.06 });
  k.pipe([0, 2.5, 0.06], [0, 1.9, 0.06], 0.08, C.night2);
}

/**
 * Security camera head, origin at its pivot (the scene rotates it). The lens is dark, never cyan:
 * the view cone is drawn by the scene. A small amber status light marks it at night.
 */
export function securityCameraHead(k: Kit): void {
  k.at({ rx: 0.4 }, () => {
    k.box(0.08, 0.14, 0.08, C.night3, { y: -0.08 });
    k.box(0.24, 0.22, 0.5, C.fog1, { y: -0.24, z: 0.2 }, { top: C.fog0 });
    k.box(0.3, 0.08, 0.58, C.fog0, { y: -0.02, z: 0.22 });
    k.box(0.18, 0.18, 0.06, C.night1, { y: -0.22, z: 0.47 });
    k.box(0.1, 0.1, 0.04, C.night0, { y: -0.18, z: 0.51 });
    k.glow(() => k.box(0.08, 0.08, 0.03, C.amber1, { x: 0.07, y: -0.1, z: 0.5 }));
  });
}

/** Complete security camera: mount plus head at its pivot. */
export function securityCamera(k: Kit): void {
  securityCameraMount(k);
  k.at(SECURITY_CAMERA_PIVOT, () => securityCameraHead(k));
}

/** Mechanic's workbench: vise, tools, a part, pegboard, and a flickering fluorescent overhead. */
export function mechanicBench(k: Kit, variant = 0): void {
  const v = vint(variant, 2);
  legs4(k, 1.9, 0.72, 0.85, 0.1, C.night3);
  k.box(1.8, 0.08, 0.62, C.night3, { y: 0.2 });
  k.box(2.0, 0.1, 0.8, C.rust1, { y: 0.85 }, { top: C.amber0 });
  k.box(0.56, 0.34, 0.36, v === 0 ? C.amber1 : C.rust2, { x: 0.55, y: 0.28 }, { top: C.amber0 });
  decal(k, 0.3, 0.42, 0.8, 0.5, 0.181, C.amber0);
  k.box(0.22, 0.14, 0.26, C.slate1, { x: -0.72, y: 0.95, z: 0.22 });
  k.box(0.24, 0.12, 0.08, C.slate0, { x: -0.72, y: 1.09, z: 0.34 });
  k.box(0.42, 0.04, 0.1, C.concrete2, { x: -0.25, y: 0.95, z: 0.15, ry: 0.4 });
  k.box(0.08, 0.06, 0.3, C.amber0, { x: 0.05, y: 0.95, z: 0.18, ry: -0.3 });
  k.box(0.2, 0.08, 0.1, C.slate1, { x: 0.1, y: 0.95, z: 0.32, ry: -0.3 });
  k.cylinder(0.13, 0.18, 6, C.concrete2, { x: 0.5, y: 0.95, z: 0.08 }, C.concrete1);
  k.cylinder(0.07, 0.2, 6, C.amber1, { x: 0.85, y: 0.95, z: -0.15 }, C.night2);
  // pegboard with hanging tools
  k.box(2.0, 0.9, 0.08, C.rust2, { y: 1.05, z: -0.38 });
  for (let i = 0; i < 5; i++) {
    const x = -0.8 + i * 0.4;
    decal(k, x - 0.04, 1.2 + 0.25 * vrand(variant, i), x + 0.05, 1.78, -0.339, i % 2 ? C.slate0 : C.night2);
  }
  // fluorescent fixture on chains
  k.box(1.2, 0.1, 0.25, C.slate0, { y: 2.25, z: -0.05 });
  k.glow(() => k.box(1.1, 0.08, 0.2, C.fog2, { y: 2.17, z: -0.05 }));
  k.pipe([-0.5, 2.35, -0.05], [-0.5, 2.75, -0.05], 0.08, C.night2);
  k.pipe([0.5, 2.35, -0.05], [0.5, 2.75, -0.05], 0.08, C.night2);
  k.light({ x: 0, y: 2.1, z: 0.1, color: C.fog2, intensity: 4, range: 7, flicker: 0.5 });
}

/** Diner flat-top grill with backsplash, knobs, and food on the griddle. */
export function grill(k: Kit, variant = 0): void {
  const v = vint(variant, 2);
  k.box(1.2, 0.86, 0.75, C.concrete2, {}, { top: C.concrete1 });
  decal(k, -0.56, 0.08, -0.03, 0.6, 0.376, C.concrete1);
  decal(k, 0.03, 0.08, 0.56, 0.6, 0.376, C.concrete1);
  k.box(1.2, 0.06, 0.7, C.night1, { y: 0.86, z: -0.02 });
  k.box(1.2, 0.4, 0.08, C.concrete2, { y: 0.86, z: -0.335 });
  k.box(1.2, 0.1, 0.08, C.concrete1, { y: 0.86, z: 0.335 });
  for (let i = 0; i < 4; i++) k.box(0.08, 0.08, 0.06, C.night0, { x: -0.45 + i * 0.3, y: 0.7, z: 0.4 });
  k.cylinder(0.08, 0.04, 6, C.rust0, { x: -0.32, y: 0.92, z: -0.02 });
  k.cylinder(0.08, 0.04, 6, C.rust0, { x: -0.1, y: 0.92, z: 0.1 });
  if (v === 0) {
    k.box(0.18, 0.02, 0.15, C.fog2, { x: 0.25, y: 0.92, z: -0.02 });
    k.box(0.08, 0.03, 0.08, C.amber2, { x: 0.25, y: 0.93, z: -0.02 });
  } else {
    for (let i = 0; i < 3; i++) k.box(0.26, 0.03, 0.08, C.rust1, { x: 0.25, y: 0.92, z: -0.12 + i * 0.12 });
  }
  k.box(0.12, 0.02, 0.14, C.concrete2, { x: 0.05, y: 0.92, z: 0.18 });
  k.box(0.08, 0.04, 0.2, C.night2, { x: 0.05, y: 0.92, z: 0.34 });
}

/** Fridge: variant 0 a lived-in home fridge, 1 a steel reach-in, 2 a lit glass-door drink cooler. */
export function fridge(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  if (v === 0) {
    const zf = 0.361;
    k.box(0.8, 1.8, 0.72, C.fog1, {}, { top: C.fog0 });
    decal(k, -0.4, 1.22, 0.4, 1.3, zf, C.concrete2);
    k.box(0.08, 0.3, 0.08, C.concrete2, { x: 0.3, y: 1.38, z: 0.4 });
    k.box(0.08, 0.42, 0.08, C.concrete2, { x: 0.3, y: 0.72, z: 0.4 });
    decal(k, -0.3, 0.8, -0.05, 1.1, zf, C.fog2);
    decal(k, -0.25, 0.86, -0.1, 0.98, zf + 0.001, C.amber1);
    decal(k, 0.0, 0.95, 0.16, 1.12, zf, C.skin3);
    decal(k, -0.2, 1.45, -0.08, 1.57, zf, C.moss2);
    decal(k, 0.04, 1.5, 0.14, 1.6, zf, C.rust2);
    k.box(0.3, 0.3, 0.22, C.amber0, { x: -0.15, y: 1.8, z: 0.05 }, { top: C.amber1 });
  } else if (v === 1) {
    const zf = 0.401;
    k.box(0.8, 2.0, 0.8, C.concrete2, {}, { top: C.concrete1 });
    decal(k, -0.04, 0.2, 0.04, 1.95, zf, C.night3);
    decal(k, -0.38, 0.04, 0.38, 0.18, zf, C.night2);
    k.box(0.08, 0.6, 0.08, C.fog1, { x: -0.1, y: 0.9, z: 0.44 });
    k.box(0.08, 0.6, 0.08, C.fog1, { x: 0.1, y: 0.9, z: 0.44 });
    k.glow(() => k.box(0.14, 0.08, 0.03, C.amber2, { x: 0.25, y: 1.85, z: 0.415 }));
  } else {
    const zf = 0.376;
    k.box(0.9, 2.0, 0.75, C.slate0, {}, { top: C.night3 });
    k.glow(() => {
      decal(k, -0.38, 0.2, 0.38, 1.7, zf, C.fog2);
      k.box(0.8, 0.16, 0.03, C.amber2, { y: 1.78, z: 0.39 });
    });
    for (let r = 0; r < 4; r++) {
      const y = 0.25 + r * 0.37;
      decal(k, -0.38, y, 0.38, y + 0.08, zf + 0.001, C.slate0);
      for (let i = 0; i < 4; i++) {
        const x = -0.35 + i * 0.18;
        decal(k, x, y + 0.1, x + 0.12, y + 0.3, zf + 0.001, vpick(GOODS, variant, r * 9 + i));
      }
    }
    k.box(0.08, 0.5, 0.08, C.concrete2, { x: 0.33, y: 0.7, z: 0.42 });
    k.light({ x: 0, y: 1.2, z: 0.8, color: C.fog2, intensity: 2, range: 4 });
  }
}

/** Counter with a sink: variant 0 a home kitchen with a dish rack, 1 a steel diner sink. */
export function sinkCounter(k: Kit, variant = 0): void {
  const v = vint(variant, 2);
  const cab = v === 0 ? C.fog0 : C.concrete2;
  const door = v === 0 ? C.fog1 : C.concrete1;
  k.box(1.2, 0.86, 0.6, cab);
  decal(k, -0.56, 0.1, -0.03, 0.78, 0.301, door);
  decal(k, 0.03, 0.1, 0.56, 0.78, 0.301, door);
  k.box(0.08, 0.1, 0.05, C.night3, { x: -0.1, y: 0.6, z: 0.32 });
  k.box(0.08, 0.1, 0.05, C.night3, { x: 0.1, y: 0.6, z: 0.32 });
  k.box(1.24, 0.08, 0.64, C.concrete2, { y: 0.86 }, { top: v === 0 ? C.concrete1 : C.fog0 });
  flat(k, -0.32, -0.18, 0.22, 0.2, 0.945, C.night2);
  k.pipe([-0.05, 0.94, -0.26], [-0.05, 1.22, -0.26], 0.08, C.concrete2);
  k.pipe([-0.05, 1.22, -0.26], [-0.05, 1.22, -0.1], 0.08, C.concrete2);
  k.box(0.08, 0.08, 0.08, C.fog1, { x: -0.18, y: 0.94, z: -0.26 });
  k.box(0.08, 0.08, 0.08, C.fog1, { x: 0.08, y: 0.94, z: -0.26 });
  if (v === 0) {
    k.box(0.3, 0.06, 0.34, C.concrete1, { x: 0.42, y: 0.94, z: 0 });
    for (let i = 0; i < 3; i++)
      k.box(0.24, 0.22, 0.04, C.fog2, { x: 0.42, y: 1.0, z: -0.1 + i * 0.1, rx: 0.2 });
  } else {
    k.box(1.24, 0.5, 0.06, C.concrete2, { y: 0.94, z: -0.29 });
    k.box(0.08, 0.18, 0.08, C.moss2, { x: 0.42, y: 0.94, z: -0.18 });
    k.box(0.12, 0.05, 0.08, C.amber1, { x: 0.4, y: 0.94, z: 0.06 });
  }
}

/** Trash can: metal with a domed lid, plastic with the lid ajar, overflowing, or a banded public bin. */
export function trashCan(k: Kit, variant = 0): void {
  const v = vint(variant, 4);
  const body = [C.concrete1, C.slate1, C.moss1, C.night3][v];
  frustum(k, 0.24, 0.28, 0, 0.82, 8, body, C.night1);
  if (v === 0) frustum(k, 0.31, 0.2, 0.82, 0.94, 8, C.concrete0);
  if (v === 1) k.at({ x: -0.12, y: 0.84, rz: 0.5 }, () => k.cylinder(0.3, 0.06, 8, C.slate0));
  if (v === 2) {
    blob(k, blobPts(variant, 3, 0.25, 0.23), 0.82, 1.05, C.night2, C.night3, 0.6);
    k.cylinder(0.05, 0.12, 6, C.fog1, { x: 0.42, z: 0.22 }, C.night1);
  }
  if (v === 3) {
    frustum(k, 0.27, 0.272, 0.28, 0.36, 8, C.night2, null);
    frustum(k, 0.288, 0.29, 0.64, 0.72, 8, C.night2, null);
  }
}

/** A stack of cardboard boxes (1–4, one with open flaps). */
export function boxes(k: Kit, variant = 0): void {
  const n = 1 + vint(variant, 4);
  const spots: readonly (readonly [number, number, number, number, number])[] = [
    [-0.25, 0, 0, 0.6, 0.1],
    [0.38, 0, 0.12, 0.5, -0.2],
    [-0.22, 0.48, 0.02, 0.45, 0.25],
    [0.36, 0.4, 0.1, 0.38, -0.1],
  ];
  for (let i = 0; i < n; i++) {
    const [x, y, z, s, ry] = spots[i];
    const col = vpick([C.amber0, C.rust2, C.amber0, C.skin2], variant, i * 3);
    k.at({ x, y, z, ry: ry + (vrand(variant, i) - 0.5) * 0.3 }, () => {
      k.box(s, s * 0.8, s * 0.9, col, {}, { top: col === C.amber0 ? C.amber1 : C.skin3 });
      if (i === 3) {
        k.box(s * 0.9, 0.04, 0.2, col, { y: s * 0.8, z: s * 0.5, rx: -0.6 });
        k.box(s * 0.9, 0.04, 0.2, col, { y: s * 0.8, z: -s * 0.5, rx: 0.6 });
      } else {
        flat(k, -0.04, -s * 0.45, 0.04, s * 0.45, s * 0.8 + 0.002, C.fog0);
      }
    });
  }
}

/** Mop bucket with wringer and mop; variant 1 adds an amber wet-floor A-frame sign. */
export function mopBucket(k: Kit, variant = 0): void {
  for (const [x, z] of CASTERS) k.box(0.08, 0.08, 0.08, C.night0, { x, z });
  k.box(0.48, 0.4, 0.36, C.amber1, { y: 0.08 }, { top: C.slate0 });
  k.box(0.3, 0.22, 0.2, C.amber0, { x: 0.06, y: 0.48, z: -0.06 });
  k.pipe([0.18, 0.7, -0.06], [0.3, 0.98, -0.06], 0.08, C.night2);
  k.pipe([-0.12, 0.42, 0.04], [-0.24, 1.45, -0.12], 0.08, C.concrete2);
  k.box(0.2, 0.14, 0.18, C.fog1, { x: -0.11, y: 0.42, z: 0.05 });
  if (vint(variant, 2) === 1) {
    k.at({ x: 0.62, z: 0.22 }, () => {
      k.at({ z: 0.1, rx: -0.18 }, () => {
        k.box(0.38, 0.66, 0.05, C.amber1);
        decal(k, -0.08, 0.3, 0.08, 0.46, 0.026, C.night2);
      });
      k.at({ z: -0.1, rx: 0.18 }, () => k.box(0.38, 0.66, 0.05, C.amber1));
    });
  }
}
const CASTERS: readonly P2[] = [
  [-0.18, -0.13],
  [0.18, -0.13],
  [-0.18, 0.13],
  [0.18, 0.13],
];

/** Restroom sign plate (wall): man, woman, or both. */
export function restroomSign(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  const w = v === 2 ? 0.62 : 0.38;
  k.box(w, 0.42, 0.06, C.fog1, { y: 1.5, z: 0.03 });
  const zf = 0.061;
  const figure = (x: number, dress: boolean): void => {
    decal(k, x - 0.045, 1.78, x + 0.045, 1.87, zf, C.night2);
    if (dress) k.tri(x - 0.09, 1.56, zf, x + 0.09, 1.56, zf, x, 1.76, zf, C.night2);
    else decal(k, x - 0.06, 1.56, x + 0.06, 1.76, zf, C.night2);
  };
  if (v === 2) {
    figure(-0.15, false);
    figure(0.15, true);
    decal(k, -0.03, 1.54, 0.03, 1.88, zf, C.slate1);
  } else {
    figure(0, v === 1);
  }
}

/** Where posters (Wanted posters at Heat 2+) go on the corkboard. Wall-mounted. */
export const CORKBOARD_FACE: FaceAnchor = { x: 0, y: 1.6, z: 0.085, w: 1.2, h: 0.8 };

/** Corkboard (wall) with notes pinned around the edges; the middle stays free for posters. */
export function corkboard(k: Kit, variant = 0): void {
  k.box(1.2, 0.8, 0.08, C.amber0, { y: 1.2, z: 0.04 });
  k.frame(1.32, 0.92, 0.08, 0.1, C.rust1, { y: 1.14, z: 0.05 });
  const zf = 0.081;
  const papers = [C.fog2, C.skin4, C.fog1, C.amber1, C.fog2];
  const spots: readonly P2[] = [
    [-0.47, 1.72],
    [-0.46, 1.36],
    [0.46, 1.74],
    [0.45, 1.38],
    [0.0, 1.86],
  ];
  spots.forEach(([x, y], i) => {
    if (vrand(variant, i) < 0.2) return;
    const w = 0.12 + 0.06 * vrand(variant, i + 9);
    const h = 0.12 + 0.08 * vrand(variant, i + 19);
    const yy = Math.min(y, 1.98 - h / 2);
    decal(k, x - w / 2, yy - h / 2, x + w / 2, yy + h / 2, zf, papers[i]);
  });
}

// ================================================================================================
// Street (§5.3)
// ================================================================================================

/** Dumpster with a sloped front, one lid flipped open, fork sleeves, a dent, and a rust streak. */
export function dumpster(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  const body = [C.moss1, C.slate1, C.rust1][v];
  const dark = [C.moss0, C.slate0, C.rust0][v];
  extrudeX(
    k,
    [
      [0.62, 0.12],
      [0.62, 1.12],
      [-0.62, 1.26],
      [-0.62, 0.12],
    ],
    1.9,
    body,
  );
  const slope = Math.atan2(0.14, 1.24);
  k.box(0.92, 0.08, 1.3, C.night2, { x: -0.48, y: 1.19, rx: slope });
  k.at({ x: 0.48, y: 1.26, z: -0.62, rx: v === 1 ? slope : -1.75 }, () =>
    k.box(0.92, 0.08, 1.3, C.night2, { z: 0.65 }),
  );
  for (const s of [-1, 1]) k.box(0.12, 0.18, 1.0, dark, { x: s * 1.0, y: 0.62 });
  for (const [x, z] of CASTERS) k.box(0.12, 0.12, 0.12, C.night0, { x: x * 4.4, z: z * 3.4 });
  decal(k, 0.3, 0.4, 0.62, 0.7, 0.621, dark);
  decal(k, -0.62, 0.24, -0.52, 0.96, 0.621, C.rust0);
}

/** A heap of 2–4 tied trash bags. */
export function trashBags(k: Kit, variant = 0): void {
  const n = 2 + vint(variant, 3);
  const spots: readonly (readonly [number, number, number])[] = [
    [0, 0, 0.55],
    [0.45, 0.15, 0.45],
    [-0.42, 0.2, 0.42],
    [0.15, -0.35, 0.4],
  ];
  for (let i = 0; i < n; i++) {
    const [x, z, s] = spots[i];
    const col = vpick([C.night2, C.night3, C.night2, C.moss0], variant, i * 5);
    const top = col === C.moss0 ? C.moss1 : C.night3;
    k.at({ x, z }, () => {
      blob(k, blobPts(variant, i * 11, s * 0.5, s * 0.45, 7, 0.15), 0, s * 0.7, col, top, 0.7);
      k.box(0.12, 0.1, 0.12, col, { y: s * 0.7 });
    });
  }
}

/** Wooden pallet (variant 1 is missing a board; variant 2 is a stack of three). */
export function pallet(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  if (v === 2) {
    for (let i = 0; i < 3; i++) {
      k.at({ y: i * 0.15, ry: (vrand(variant, i) - 0.5) * 0.1 }, () => {
        k.box(1.2, 0.14, 1.0, C.amber0, {}, { top: C.amber0 });
        decal(k, -0.6, 0.03, 0.6, 0.1, 0.501, C.night2);
      });
    }
    for (let i = 0; i < 4; i++) {
      const z = -0.36 + i * 0.24;
      flat(k, -0.6, z, 0.6, z + 0.08, 0.452, C.rust1);
    }
    return;
  }
  for (const x of [-0.52, 0, 0.52]) k.box(0.12, 0.1, 1.0, C.rust1, { x });
  for (let i = 0; i < 5; i++) {
    if (v === 1 && i === 2) continue;
    k.box(1.2, 0.04, 0.14, C.amber0, { y: 0.1, z: -0.4 + i * 0.2 });
  }
}

const JERSEY: readonly P2[] = [
  [0.3, 0],
  [0.3, 0.08],
  [0.12, 0.3],
  [0.08, 0.81],
  [-0.08, 0.81],
  [-0.12, 0.3],
  [-0.3, 0.08],
  [-0.3, 0],
];

/** Jersey barrier, 2 m: plain, stained, chipped (exposed rebar), or a water-filled amber plastic one. */
export function jerseyBarrier(k: Kit, variant = 0): void {
  const v = vint(variant, 4);
  if (v === 3) {
    extrudeX(k, JERSEY, 1.9, C.amber1);
    flat(k, -0.95, -0.08, 0.95, 0.08, 0.812, C.fog2);
    k.box(0.5, 0.12, 0.03, C.fog2, { x: -0.45, y: 0.5, z: 0.105, rx: -0.08 });
    k.box(0.5, 0.12, 0.03, C.fog2, { x: 0.45, y: 0.5, z: 0.105, rx: -0.08 });
    return;
  }
  const col = v === 1 ? C.concrete2 : C.concrete1;
  if (v === 2) {
    k.at({ x: -0.15 }, () => extrudeX(k, JERSEY, 1.7, col));
    k.box(0.3, 0.32, 0.26, col, { x: 0.86, z: 0.12, ry: 0.5, rz: 0.25 });
    k.box(0.14, 0.1, 0.12, C.concrete0, { x: 1.05, z: 0.38, ry: 0.9 });
    k.pipe([0.7, 0.5, 0.0], [0.95, 0.75, 0.05], 0.08, C.rust0);
  } else {
    extrudeX(k, JERSEY, 2.0, col);
  }
  k.box(0.18, 0.1, 0.03, C.amber1, { x: -0.5, y: 0.55, z: 0.1, rx: -0.08 });
  decal(k, -0.3, 0, 0.3, 0.08, 0.301, C.night1);
  if (v === 1) decal(k, 0.2, 0.0, 0.9, 0.06, 0.302, C.moss0);
}

/** Amber traffic cone with a fog-white band; variant 1 lies knocked over, variant 2 has no band. */
export function trafficCone(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  const build = (): void => {
    k.box(0.42, 0.05, 0.42, C.night2);
    frustum(k, 0.17, 0.114, 0.05, 0.32, 8, C.amber1, null);
    frustum(k, 0.114, 0.076, 0.32, 0.5, 8, v === 2 ? C.amber1 : C.fog2, null);
    frustum(k, 0.076, 0.03, 0.5, 0.72, 8, C.amber1);
  };
  if (v === 1) k.at({ x: 0.3, y: 0.18, rz: Math.PI / 2 - 0.2 }, build);
  else build();
}

/** Sodium streetlamp: cobra head reaching toward +z (variants: steady, flickering, dead, double arm). */
export function streetlamp(k: Kit, variant = 0): void {
  const v = vint(variant, 4);
  k.box(0.4, 0.5, 0.4, C.concrete1, {}, { top: C.concrete0 });
  k.cylinder(0.1, 6.1, 6, C.slate0, { y: 0.5 });
  const heads: readonly number[] = v === 3 ? [Math.PI / 2, -Math.PI / 2] : [0];
  for (const ry of heads) {
    k.at({ ry }, () => {
      k.pipe([0, 6.3, 0], [0, 6.5, 0.6], 0.1, C.slate0);
      k.pipe([0, 6.5, 0.6], [0, 6.45, 1.35], 0.1, C.slate0);
      k.box(0.36, 0.18, 0.75, C.slate1, { y: 6.32, z: 1.55 }, { top: C.slate0 });
      if (v === 2) k.box(0.4, 0.16, 0.5, C.amber0, { y: 6.16, z: 1.6 });
      else k.glow(() => k.box(0.4, 0.16, 0.5, C.amber2, { y: 6.16, z: 1.6 }));
      if (v !== 2) {
        k.light({
          x: 0,
          y: 6.0,
          z: 1.6,
          color: C.amber2,
          intensity: 6,
          range: 9,
          flicker: v === 1 ? 0.6 : 0,
        });
      }
    });
  }
}

/** Where the scene strings power lines on a pole (model space, before any lean). */
export const POWER_POLE_WIRES: readonly (readonly [number, number, number])[] = [
  [-0.95, 8.5, 0],
  [0, 9.36, 0],
  [0.95, 8.5, 0],
];

/** Wooden power pole with crossarm and insulators; variant 1 carries a transformer, variant 2 leans. */
export function powerPole(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  k.at({ rz: v === 2 ? 0.05 : 0 }, () => {
    k.cylinder(0.15, 9.2, 6, C.rust1, {}, C.rust0);
    k.box(2.2, 0.14, 0.14, C.rust0, { y: 8.2 });
    k.pipe([-0.7, 8.22, 0], [0, 7.6, 0], 0.08, C.night3);
    k.pipe([0.7, 8.22, 0], [0, 7.6, 0], 0.08, C.night3);
    for (const x of [-0.95, 0.95]) k.box(0.1, 0.16, 0.1, C.fog0, { x, y: 8.34 });
    k.box(0.1, 0.16, 0.1, C.fog0, { y: 9.2 });
    k.box(0.22, 0.3, 0.04, C.fog1, { y: 1.5, z: 0.16 });
    if (v === 1) {
      k.cylinder(0.26, 0.75, 6, C.concrete1, { y: 6.6, z: 0.36 }, C.concrete0);
      k.box(0.08, 0.2, 0.08, C.fog0, { y: 7.35, z: 0.36 });
    }
  });
}

/**
 * The billboard face (8 × 3.5 m) where the scene places `billboardCanvas()` (signs.ts) as an emissive
 * quad. The 192 × 48 canvas maps about one canvas pixel to one screen texel at the 55° camera pitch.
 */
export const BILLBOARD_FACE: FaceAnchor = { x: 0, y: 6.85, z: 0.135, w: 8, h: 3.5 };

/** Billboard structure: posts, braces, backing, frame, catwalk, and lamps (variant 2 has a dead lamp). */
export function billboard(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  for (const x of [-2.6, 2.6]) {
    k.box(0.5, 0.3, 0.5, C.concrete1, { x, z: -0.15 }, { top: C.concrete0 });
    k.box(0.32, 5.0, 0.32, C.slate0, { x, y: 0.3, z: -0.15 });
  }
  k.pipe([-2.6, 1.2, -0.15], [2.6, 4.2, -0.15], 0.12, C.slate0);
  k.pipe([2.6, 1.2, -0.15], [-2.6, 4.2, -0.15], 0.12, C.slate0);
  k.box(8.3, 3.8, 0.25, C.night3, { y: 4.95 });
  k.frame(8.4, 3.9, 0.12, 0.3, C.slate1, { y: 4.9, z: 0.03 });
  k.box(8.0, 0.1, 0.8, C.night3, { y: 4.7, z: 0.45 });
  k.pipe([-4, 5.4, 0.82], [4, 5.4, 0.82], 0.08, C.slate0);
  const lamp = v === 1 ? C.fog2 : C.amber2;
  for (const x of [-2.6, 0, 2.6]) {
    k.pipe([x, 4.8, 0.5], [x, 5.25, 0.9], 0.08, C.night3);
    k.box(0.36, 0.2, 0.26, C.night3, { x, y: 5.22, z: 0.95 });
    if (v === 2 && x > 0) k.box(0.3, 0.12, 0.03, C.slate0, { x, y: 5.26, z: 1.09 });
    else k.glow(() => k.box(0.3, 0.12, 0.03, lamp, { x, y: 5.26, z: 1.09 }));
  }
  k.light({ x: 0, y: 5.6, z: 1.2, color: lamp, intensity: 4, range: 7, flicker: v === 2 ? 0.4 : 0 });
}

// ------------------------------------------------------------------------------------------------
// Cars (shared with vehicles.ts)
// ------------------------------------------------------------------------------------------------

/** Car proportions along z (front at +z). z values are measured from the car's center. */
export interface CarShape {
  len: number;
  wid: number;
  /** Bottom of the body. */
  ride: number;
  /** Top of the lower body (hood and trunk line). */
  belt: number;
  roof: number;
  /** Cabin profile: base of the windshield, top of the windshield, end of the roof, base of the rear glass. */
  hood: number;
  wind: number;
  rear: number;
  tail: number;
  wheelR: number;
  wheelbase: number;
  /** How far the cabin sits in from the body sides. */
  inset: number;
}

export interface CarPaint {
  body: number;
  roof: number;
  glass: number;
  trim: number;
  tire: number;
  hub: number;
  /** Rear window color (defaults to glass; an open hatch shows the dark interior). */
  rear?: number;
  /** Cabin side color (defaults to glass; cargo vans use the body color plus window decals). */
  side?: number;
}

/**
 * A car body along z (front at +z): lower body with a chamfered nose, a greenhouse with pillars, bumpers,
 * and wheels. `wheels` lists which wheels exist (front-left, front-right, rear-left, rear-right).
 */
export function carBody(
  k: Kit,
  s: CarShape,
  p: CarPaint,
  wheels: readonly boolean[] = [true, true, true, true],
): void {
  const L = s.len / 2;
  extrudeX(
    k,
    [
      [L, s.ride],
      [L, s.belt - 0.14],
      [L - 0.3, s.belt],
      [-L + 0.2, s.belt],
      [-L, s.belt - 0.1],
      [-L, s.ride],
    ],
    s.wid,
    p.body,
  );
  const cw = s.wid - s.inset * 2;
  extrudeX(
    k,
    [
      [s.hood, s.belt],
      [s.wind, s.roof],
      [s.rear, s.roof],
      [s.tail, s.belt],
    ],
    cw,
    [p.glass, p.roof, p.rear ?? p.glass, p.body],
    p.side ?? p.glass,
  );
  for (const sx of [-1, 1]) {
    const x = sx * (cw / 2);
    k.pipe([x, s.belt, s.hood], [x, s.roof, s.wind], 0.1, p.body);
    k.pipe([x, s.roof, s.rear], [x, s.belt, s.tail], 0.14, p.body);
    k.box(0.1, s.roof - s.belt, 0.14, p.body, { x, y: s.belt, z: (s.wind + s.rear) / 2 });
  }
  k.box(s.wid + 0.06, 0.18, 0.14, p.trim, { y: s.ride + 0.04, z: L + 0.02 });
  k.box(s.wid + 0.06, 0.18, 0.14, p.trim, { y: s.ride + 0.04, z: -L - 0.02 });
  const spots: readonly (readonly [number, 1 | -1])[] = [
    [s.wheelbase / 2, -1],
    [s.wheelbase / 2, 1],
    [-s.wheelbase / 2, -1],
    [-s.wheelbase / 2, 1],
  ];
  spots.forEach(([z, sx], i) => {
    if (wheels[i] ?? true) wheel(k, sx * (s.wid / 2 - 0.1), z, s.wheelR, 0.24, sx, p.tire, p.hub);
  });
}

/** A mid-size sedan. */
export const SEDAN: CarShape = {
  len: 4.5,
  wid: 1.8,
  ride: 0.3,
  belt: 0.95,
  roof: 1.42,
  hood: 0.95,
  wind: 0.25,
  rear: -0.95,
  tail: -1.45,
  wheelR: 0.33,
  wheelbase: 2.7,
  inset: 0.12,
};

/** Wrecked car: rusted and sagging on a missing wheel, a burnt-out shell, or stripped on cinder blocks. */
export function wreckedCar(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  if (v === 0) {
    k.at({ rz: 0.05 }, () => {
      carBody(
        k,
        SEDAN,
        { body: C.rust1, roof: C.rust0, glass: C.night1, trim: C.night3, tire: C.night0, hub: C.night2 },
        [false, true, true, true],
      );
      k.box(0.2, 0.3, 0.3, C.rust0, { x: -0.75, y: 0.1, z: 1.35 });
      flat(k, 0.1, -0.6, 0.6, 0.2, 1.421, C.rust0);
      k.at({ y: 0.97, z: 0.95, rx: -0.25 }, () =>
        k.box(1.6, 0.06, 1.1, C.rust1, { z: 0.55 }, { top: C.rust2 }),
      );
    });
  } else if (v === 1) {
    carBody(
      k,
      { ...SEDAN, ride: 0.18, belt: 0.85, roof: 1.25, wheelR: 0.26 },
      { body: C.night2, roof: C.night1, glass: C.night0, trim: C.night1, tire: C.night1, hub: C.night0 },
    );
    flat(k, -0.6, 1.0, 0.4, 1.8, 0.851, C.rust0);
    flat(k, -0.4, -0.7, 0.5, 0.0, 1.251, C.night3);
  } else {
    carBody(
      k,
      SEDAN,
      { body: C.slate1, roof: C.slate0, glass: C.night1, trim: C.night3, tire: C.night0, hub: C.night2 },
      [false, false, false, false],
    );
    for (const x of [-0.6, 0.6]) {
      for (const z of [-1.35, 1.35]) k.box(0.4, 0.3, 0.3, C.concrete1, { x, z }, { top: C.concrete0 });
    }
    flat(k, -0.7, 1.0, 0.7, 1.9, 0.952, C.night1);
    k.at({ y: 0.95, z: 0.95, rx: -1.1 }, () => k.box(1.6, 0.06, 1.0, C.slate1, { z: 0.5 }));
  }
}

/** Chain-link fence, 2 m: posts, top rail, and a dark mesh panel (variants: barbed wire, torn open). */
export function fenceSegment(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  for (const x of [-1, 1]) k.cylinder(0.05, 2.0, 6, C.concrete2, { x });
  k.pipe([-1, 1.94, 0], [1, 1.94, 0], 0.08, C.concrete2);
  if (v === 2) {
    k.box(0.85, 1.84, 0.04, C.slate0, { x: -0.52, y: 0.06 });
    k.box(1.05, 1.0, 0.04, C.slate0, { x: 0.43, y: 0.9 });
    k.box(0.9, 0.72, 0.04, C.slate0, { x: 0.45, y: 0.08, z: 0.22, rx: -0.6 });
  } else {
    k.box(1.9, 1.84, 0.04, C.slate0, { y: 0.06 });
  }
  k.pipe([-1, 0.1, 0.03], [1, 0.1, 0.03], 0.08, C.concrete1);
  if (v === 1) {
    for (const x of [-1, 1]) k.pipe([x, 1.98, 0], [x, 2.36, -0.28], 0.08, C.concrete2);
    k.pipe([-1, 2.14, -0.1], [1, 2.14, -0.1], 0.08, C.night3);
    k.pipe([-1, 2.32, -0.25], [1, 2.32, -0.25], 0.08, C.night3);
  }
}

/** Snowbank: 2–3 mounds of dirty snow, grayer at the base, cleaner on top. */
export function snowbank(k: Kit, variant = 0): void {
  const n = 2 + vint(variant, 2);
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 1.1 + (vrand(variant, i) - 0.5) * 0.4;
    const rx = 0.7 + 0.4 * vrand(variant, i + 5);
    const rz = 0.6 + 0.3 * vrand(variant, i + 9);
    const h = 0.5 + 0.5 * vrand(variant, i + 13);
    k.at({ x, z: (vrand(variant, i + 17) - 0.5) * 0.4 }, () => {
      blob(k, blobPts(variant, i * 7, rx, rz, 8), 0, h * 0.55, C.fog0, C.fog1, 0.75);
      blob(k, blobPts(variant, i * 7 + 3, rx * 0.7, rz * 0.65, 7), h * 0.55, h, C.fog1, C.fog2, 0.55);
      flat(k, -0.1, -0.05, 0.06, 0.05, h + 0.004, C.concrete1);
    });
  }
}

/** Park bench: cast-iron ends with wood slats (variant 1 is missing a slat; variant 2 is concrete). */
export function bench(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  if (v === 2) {
    k.box(1.8, 0.42, 0.5, C.concrete1, {}, { top: C.concrete2 });
    decal(k, -0.9, 0, -0.3, 0.12, 0.251, C.moss0);
    return;
  }
  for (const x of [-0.75, 0.75]) {
    k.box(0.08, 0.42, 0.5, C.night2, { x });
    k.box(0.08, 0.5, 0.08, C.night2, { x, y: 0.42, z: -0.22 });
    k.box(0.08, 0.08, 0.4, C.night2, { x, y: 0.62 });
  }
  for (let i = 0; i < 3; i++) {
    if (v === 1 && i === 1) continue;
    k.box(1.7, 0.06, 0.14, C.amber0, { y: 0.42, z: 0.16 - i * 0.17 }, { top: C.amber1 });
  }
  for (let i = 0; i < 2; i++)
    k.box(1.7, 0.14, 0.06, C.amber0, { y: 0.6 + i * 0.2, z: -0.25 }, { top: C.amber1 });
}

/** Newspaper vending box on a pedestal. */
export function newsBox(k: Kit, variant = 0): void {
  const paints = [C.slate1, C.moss1, C.amber1, C.concrete2, C.fog1, C.rust1] as const;
  const col = paints[vint(variant, paints.length)];
  k.box(0.36, 0.06, 0.32, C.night2);
  k.box(0.12, 0.26, 0.12, C.night2, { y: 0.06 });
  k.box(0.5, 0.74, 0.42, col, { y: 0.32 });
  k.wedge(0.5, 0.08, 0.42, col, { y: 1.06 });
  decal(k, -0.18, 0.66, 0.18, 0.96, 0.211, C.night1);
  decal(k, -0.14, 0.7, 0.14, 0.9, 0.212, C.fog1);
  k.box(0.26, 0.08, 0.05, C.night2, { y: 0.56, z: 0.23 });
  k.box(0.1, 0.12, 0.05, C.concrete2, { x: 0.16, y: 0.98, z: 0.23 });
}

/** Fire hydrant in amber or slate (never red); variant 2 is faded with peeling paint. */
export function hydrant(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  const col = [C.amber1, C.slate1, C.amber0][v];
  k.cylinder(0.17, 0.08, 8, C.concrete1);
  k.cylinder(0.12, 0.5, 8, col, { y: 0.08 });
  k.cylinder(0.15, 0.06, 8, col, { y: 0.56 });
  frustum(k, 0.14, 0.06, 0.62, 0.76, 8, col);
  k.box(0.08, 0.08, 0.08, C.night2, { y: 0.76 });
  k.box(0.34, 0.12, 0.12, col, { y: 0.4 });
  k.box(0.16, 0.16, 0.14, col, { y: 0.32, z: 0.13 });
  k.box(0.12, 0.12, 0.04, C.night2, { y: 0.34, z: 0.21 });
  if (v === 2) k.box(0.1, 0.12, 0.02, C.rust1, { x: -0.04, y: 0.16, z: 0.12 });
}

/** Mail collection box with a rounded top and a pull-down chute. */
export function mailbox(k: Kit, variant = 0): void {
  const col = vint(variant, 2) === 0 ? C.slate1 : C.moss1;
  for (const x of [-0.22, 0.22]) {
    for (const z of [-0.18, 0.18]) k.box(0.08, 0.3, 0.08, C.night2, { x, z });
  }
  extrudeZ(
    k,
    [
      [-0.27, 0.3],
      [0.27, 0.3],
      [0.27, 1.05],
      [0.18, 1.2],
      [0, 1.26],
      [-0.18, 1.2],
      [-0.27, 1.05],
    ],
    0.5,
    col,
  );
  k.box(0.32, 0.12, 0.06, C.night2, { y: 1.0, z: 0.26 });
  decal(k, -0.12, 0.62, 0.12, 0.8, 0.251, C.fog1);
  decal(k, -0.2, 0.38, 0.2, 0.46, 0.251, C.night3);
}

/** Bollard: concrete with an amber band, an amber steel pipe, or slate with a fog band. */
export function bollard(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  if (v === 0) {
    k.cylinder(0.15, 0.85, 8, C.concrete1, {}, C.concrete0);
    frustum(k, 0.15, 0.08, 0.85, 0.95, 8, C.concrete1);
    k.cylinder(0.16, 0.1, 8, C.amber1, { y: 0.65 });
  } else if (v === 1) {
    k.cylinder(0.1, 1.0, 6, C.amber1, {}, C.amber0);
    k.cylinder(0.11, 0.1, 6, C.night2, { y: 0.75 });
  } else {
    k.cylinder(0.12, 0.9, 8, C.slate1, {}, C.slate0);
    k.cylinder(0.13, 0.1, 8, C.fog2, { y: 0.72 });
  }
}

/** A flat puddle that catches the sky: slate with a fog-white streak. */
export function puddle(k: Kit, variant = 0): void {
  const rx = 0.8 + 0.8 * vrand(variant, 1);
  const rz = 0.5 + 0.5 * vrand(variant, 2);
  flatPoly(k, blobPts(variant, 3, rx, rz, 10, 0.3), 0.012, C.slate0);
  k.at({ x: rx * 0.12, z: -rz * 0.1 }, () =>
    flatPoly(k, blobPts(variant, 4, rx * 0.55, rz * 0.5, 8, 0.3), 0.016, C.slate1),
  );
  flat(k, -rx * 0.35, -0.05, rx * 0.15, 0.05, 0.02, C.fog0);
}

// ================================================================================================
// Surveillance (§5.3, §11)
// ================================================================================================

/**
 * Checkpoint guard booth. The south wall stops at counter height under an open window band, so the guard
 * and the console inside stay visible from the camera. Fluorescent inside, floodlight and beacon on top.
 */
export function checkpointBooth(k: Kit, variant = 0): void {
  const v = vint(variant, 2);
  k.box(2.5, 0.2, 2.3, C.concrete1, {}, { top: C.concrete0 });
  k.box(2.2, 2.2, 0.12, C.fog1, { y: 0.2, z: -0.94 });
  for (const s of [-1, 1]) k.box(0.12, 2.2, 2.0, C.fog1, { x: s * 1.04, y: 0.2 }, { top: C.fog0 });
  k.box(2.2, 1.0, 0.12, C.fog1, { y: 0.2, z: 0.94 }, { top: C.fog0 });
  decal(k, -1.1, 0.2, 1.1, 0.5, 1.001, C.slate1);
  k.box(0.1, 1.0, 0.12, C.slate0, { y: 1.2, z: 0.94 });
  k.box(2.2, 0.2, 0.12, C.fog1, { y: 2.2, z: 0.94 });
  decal(k, -0.8, 1.2, 0.8, 2.0, -0.879, C.night1);
  decalE(k, -0.4, 0.2, 0.4, 2.1, 1.101, C.slate1);
  k.box(2.8, 0.25, 2.6, C.slate1, { y: 2.4 }, { top: C.slate0 });
  if (v === 1) k.box(1.9, 0.4, 0.03, C.amber0, { y: 1.8, z: 0.9 });
  k.glow(() => {
    k.box(1.6, 0.14, 0.03, C.amber1, { y: 2.46, z: 1.31 });
    k.box(0.9, 0.08, 0.16, C.fog2, { y: 2.3, z: -0.3 });
  });
  k.light({ x: 0, y: 2.1, z: 0, color: C.fog2, intensity: 3, range: 6, flicker: v === 1 ? 0.6 : 0.3 });
  // rooftop floodlight aimed at the lane, and an amber beacon
  k.box(0.4, 0.3, 0.3, C.night3, { x: 0.8, y: 2.65, z: 0.9 });
  k.glow(() => {
    k.box(0.32, 0.22, 0.03, C.fog2, { x: 0.8, y: 2.69, z: 1.065 });
    k.cylinder(0.12, 0.2, 6, C.amber2, { x: -0.8, y: 2.65, z: 0.4 });
  });
  k.light({ x: 0.8, y: 2.7, z: 2.0, color: C.fog2, intensity: 5, range: 10 });
}

/** Scanner arch (pedestrian): slate pillars and lintel with cyan scan strips (scanner cyan is allowed). */
export function scannerArch(k: Kit, variant = 0): void {
  for (const s of [-1, 1]) {
    k.box(0.7, 0.08, 0.9, C.night3, { x: s * 1.3 });
    k.box(0.4, 2.6, 0.6, C.slate1, { x: s * 1.3, y: 0.08 }, { top: C.slate0 });
  }
  k.box(3.0, 0.42, 0.6, C.slate1, { y: 2.68 }, { top: C.slate0 });
  flat(k, -1.05, -0.3, 1.05, 0.3, 0.01, C.night3);
  k.glow(() => {
    for (const s of [-1, 1]) k.box(0.1, 2.2, 0.04, C.cyan1, { x: s * 1.15, y: 0.25, z: 0.31 });
    k.box(2.2, 0.1, 0.04, C.cyan1, { y: 2.84, z: 0.31 });
    k.box(0.2, 0.1, 0.03, vint(variant, 2) === 0 ? C.cyan2 : C.cyan0, { x: 1.3, y: 2.84, z: 0.315 });
  });
  k.light({ x: 0, y: 2.3, z: 0.3, color: C.cyan1, intensity: 3, range: 5, tag: 'scanner' });
}

/** A floodlight head tilted slightly down, its fog-white face toward +z. */
function floodHead(k: Kit, x: number, y: number, z: number): void {
  k.at({ x, y, z, rx: 0.2 }, () => {
    k.box(0.5, 0.42, 0.24, C.night3);
    k.glow(() => k.box(0.42, 0.34, 0.03, C.fog2, { y: 0.04, z: 0.125 }));
  });
}

/** Floodlight tower: a trailer-mounted light tower (variant 0) or a fixed three-lamp pole (variant 1). */
export function floodlightTower(k: Kit, variant = 0): void {
  if (vint(variant, 2) === 0) {
    k.box(1.5, 0.15, 3.0, C.night3, { y: 0.32 });
    k.box(1.3, 0.9, 2.4, C.amber1, { y: 0.47 }, { top: C.amber0 });
    decal(k, -0.5, 0.6, 0.5, 1.1, 1.201, C.night2);
    for (const s of [-1, 1] as const) wheel(k, s * 0.82, 0, 0.32, 0.2, s, C.night0, C.night2, 6);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        k.pipe([sx * 0.7, 0.42, sz * 1.2], [sx * 1.45, 0.06, sz * 1.55], 0.1, C.night3);
        k.box(0.3, 0.06, 0.3, C.night2, { x: sx * 1.45, z: sz * 1.55 });
      }
    }
    k.pipe([0, 0.4, 1.5], [0, 0.32, 2.3], 0.1, C.night3);
    k.box(0.2, 7.0, 0.2, C.concrete2, { y: 1.35, z: -0.7 });
    k.box(1.8, 0.12, 0.12, C.night3, { y: 8.2, z: -0.7 });
    for (const x of [-0.45, 0.45]) {
      floodHead(k, x, 8.3, -0.5);
      floodHead(k, x, 7.8, -0.5);
    }
    k.light({ x: 0, y: 8.0, z: 0.4, color: C.fog2, intensity: 8, range: 14 });
  } else {
    k.box(0.7, 0.4, 0.7, C.concrete1, {}, { top: C.concrete0 });
    k.cylinder(0.16, 10, 6, C.concrete2, { y: 0.4 });
    k.box(2.0, 0.14, 0.14, C.night3, { y: 10.2 });
    for (const x of [-0.7, 0, 0.7]) floodHead(k, x, 10.34, 0.1);
    k.light({ x: 0, y: 10.0, z: 0.8, color: C.fog2, intensity: 8, range: 16 });
  }
}

/** Height where `scannerTowerHead` mounts on `scannerTowerBase`. */
export const SCANNER_TOWER_TOP = 12.12;

/** Scanner tower lattice (tall, tapering, braced), with a platform, ladder, and an amber marker light. */
export function scannerTowerBase(k: Kit): void {
  const H = 12;
  const r0 = 1.1;
  const r1 = 0.55;
  const levels = 5;
  const corners: readonly P2[] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const at = (y: number, c: P2): [number, number, number] => {
    const r = lerp(r0, r1, y / H);
    return [c[0] * r, y, c[1] * r];
  };
  for (const c of corners) {
    k.box(0.5, 0.3, 0.5, C.concrete1, { x: c[0] * r0, z: c[1] * r0 }, { top: C.concrete0 });
    k.pipe(at(0, c), at(H, c), 0.16, C.night3);
  }
  for (let l = 1; l <= levels; l++) {
    const y0 = ((l - 1) / levels) * H;
    const y1 = (l / levels) * H;
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      k.pipe(at(y1, a), at(y1, b), 0.1, C.slate0);
      if (l % 2) k.pipe(at(y0, a), at(y1, b), 0.08, C.slate0);
      else k.pipe(at(y1, a), at(y0, b), 0.08, C.slate0);
    }
  }
  k.box(1.6, 0.12, 1.6, C.night3, { y: H }, { top: C.slate0 });
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    k.pipe([a[0] * 0.78, H + 0.95, a[1] * 0.78], [b[0] * 0.78, H + 0.95, b[1] * 0.78], 0.08, C.slate0);
  }
  for (const x of [-0.2, 0.2]) k.pipe([x, 0, r0 + 0.08], [x, H, r1 + 0.08], 0.08, C.slate1);
  k.box(0.6, 0.9, 0.4, C.slate1, {}, { top: C.slate0 });
  k.glow(() => k.box(0.14, 0.14, 0.14, C.amber2, { x: 0.7, y: H + 1.0, z: 0.7 }));
}

/**
 * Scanner tower head, origin at its pivot (mount it at SCANNER_TOWER_TOP; the scene rotates it). The
 * searchlight lens is scanner cyan; the beam itself is drawn by the scene.
 */
export function scannerTowerHead(k: Kit): void {
  k.cylinder(0.4, 0.25, 8, C.night3);
  k.box(0.9, 0.6, 0.9, C.slate1, { y: 0.25 }, { top: C.slate0 });
  k.pipe([0.3, 0.85, -0.3], [0.3, 1.6, -0.3], 0.08, C.night3);
  k.box(0.18, 0.12, 0.18, C.slate0, { x: 0.3, y: 1.6, z: -0.3 });
  k.box(0.2, 0.2, 0.12, C.night1, { x: -0.3, y: 0.62, z: 0.48 });
  k.at({ y: 0.55, z: 0.45, rx: Math.PI / 2 + 0.3 }, () => {
    k.cylinder(0.3, 0.5, 8, C.slate0);
    k.glow(() => k.cylinder(0.24, 0.52, 8, C.cyan1));
  });
  k.light({ x: 0, y: 0.5, z: 1.2, color: C.cyan1, intensity: 3, range: 6, tag: 'searchlight' });
}

/** Where the barrier arm pivots on its post (model space of `barrierPost`). */
export const BARRIER_PIVOT = { x: 0.3, y: 1.0, z: 0 } as const;
export const BARRIER_ARM_LENGTH = 4.5;

/** Barrier post with motor housing and hinge hub (pair it with `barrierArm` at BARRIER_PIVOT). */
export function barrierPost(k: Kit, variant = 0): void {
  k.box(0.6, 0.12, 0.6, C.concrete1, {}, { top: C.concrete0 });
  k.box(0.44, 0.95, 0.44, vint(variant, 2) === 0 ? C.fog1 : C.amber1, { y: 0.12 }, { top: C.slate1 });
  decal(k, -0.22, 0.3, 0.22, 0.42, 0.221, C.night2);
  decal(k, -0.22, 0.6, 0.22, 0.72, 0.221, C.night2);
  k.box(0.3, 0.2, 0.3, C.slate1, { y: 1.07 });
  k.at({ x: 0.22, y: 1.0, rz: -Math.PI / 2 }, () => k.cylinder(0.14, 0.12, 6, C.night3));
}

/**
 * Barrier arm, origin at its pivot, extending along +x (raise it by rotating about z, positive = up).
 * Amber and black stripes, a counterweight, and an amber tip lamp.
 */
export function barrierArm(k: Kit): void {
  const n = 6;
  const seg = BARRIER_ARM_LENGTH / n;
  for (let i = 0; i < n; i++) {
    k.box(seg, 0.14, 0.12, i % 2 ? C.night1 : C.amber1, { x: seg * (i + 0.5), y: -0.07 });
  }
  k.box(0.4, 0.26, 0.2, C.night2, { x: -0.25, y: -0.13 });
  k.glow(() => k.box(0.1, 0.1, 0.14, C.amber2, { x: BARRIER_ARM_LENGTH - 0.05, y: 0.07 }));
}

/** Guard console: desk with two screens (fog and amber), keyboard, mug, and a big lit amber gate button. */
export function boothConsole(k: Kit, variant = 0): void {
  const v = vint(variant, 2);
  k.box(1.4, 0.8, 0.6, C.slate0, {}, { top: C.night3 });
  decal(k, -0.66, 0.06, 0.66, 0.7, 0.301, C.slate1);
  k.box(1.3, 0.12, 0.3, C.night3, { y: 0.8, z: -0.14 });
  for (const x of [-0.35, 0.3]) {
    k.box(0.08, 0.14, 0.08, C.night2, { x, y: 0.92, z: -0.16 });
    k.box(0.5, 0.38, 0.12, C.night2, { x, y: 1.04, z: -0.16 });
    k.glow(() => k.box(0.42, 0.3, 0.02, x < 0 ? C.fog1 : C.amber1, { x, y: 1.08, z: -0.09 }));
  }
  k.box(0.5, 0.04, 0.18, C.night1, { x: -0.25, y: 0.8, z: 0.15 });
  k.cylinder(0.05, 0.1, 6, C.fog2, { x: 0.15, y: 0.8, z: 0.18 }, C.night1);
  k.box(0.2, 0.06, 0.2, C.night2, { x: 0.5, y: 0.8, z: 0.12 });
  k.glow(() => k.box(0.12, 0.08, 0.12, C.amber2, { x: 0.5, y: 0.86, z: 0.12 }));
  if (v === 1) {
    k.box(0.18, 0.08, 0.14, C.night1, { x: 0.56, y: 0.92, z: -0.16 });
    flat(k, -0.62, 0.04, -0.42, 0.26, 0.802, C.fog1);
  }
  k.light({ x: 0, y: 1.3, z: 0.4, color: C.fog1, intensity: 1.2, range: 3 });
}

// ================================================================================================
// Regional dressing (§4.7)
// ================================================================================================

/** New England brick mill: rows of tall windows (a few lit or boarded), stair tower with a ghost sign,
 *  smokestack, and a lit loading door. Variant 1 is a smaller three-story mill without the stack. */
export function millBuilding(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  const floors = v === 1 ? 3 : 4;
  const W = 22;
  const D = 12;
  const FH = 3.2;
  const H = floors * FH + 0.4;
  const zf = D / 2 + 0.01;
  k.box(W, H, D, C.rust1, {}, { top: C.night3 });
  k.box(W + 0.4, 0.5, D + 0.4, C.rust0, { y: H });
  decal(k, -W / 2, 0, W / 2, 0.8, zf, C.concrete0);
  const cols = 9;
  const doorX = -W / 2 + 1.4 + 6 * ((W - 2.8) / (cols - 1));
  for (let f = 0; f < floors; f++) {
    const y0 = 1.1 + f * FH;
    decal(k, -W / 2, y0 - 0.26, W / 2, y0 - 0.12, zf, C.rust0);
    for (let c = 0; c < cols; c++) {
      const x = -W / 2 + 1.4 + c * ((W - 2.8) / (cols - 1));
      if (f === 0 && c === 6) continue;
      if (c === 1 || c === 2) continue;
      const r = vrand(variant, f * 17 + c);
      if (r < 0.12)
        k.glow(() => decal(k, x - 0.65, y0, x + 0.65, y0 + 2.0, zf, r < 0.06 ? C.amber2 : C.amber1));
      else decal(k, x - 0.65, y0, x + 0.65, y0 + 2.0, zf, r > 0.86 ? C.amber0 : C.night1);
    }
  }
  // loading door with a caged lamp
  decal(k, doorX - 1.4, 0, doorX + 1.4, 2.9, zf, C.night2);
  k.box(0.4, 0.16, 0.4, C.night3, { x: doorX, y: 3.26, z: zf + 0.22 });
  k.glow(() => k.box(0.24, 0.24, 0.24, C.amber2, { x: doorX, y: 3.02, z: zf + 0.22 }));
  k.light({ x: doorX, y: 2.9, z: zf + 0.8, color: C.amber2, intensity: 5, range: 8 });
  // stair tower with slit windows and a faded ghost sign
  const tx = -W / 2 + 1.4 + 1.5 * ((W - 2.8) / (cols - 1));
  const tz = D / 2 + 1.5;
  k.box(4, H + 2.5, 3, C.rust1, { x: tx, z: tz }, { top: C.night3 });
  k.cone(2.9, 2.2, 4, C.slate0, { x: tx, y: H + 2.5, z: tz, ry: Math.PI / 4 });
  for (let f = 0; f < floors - 1; f++)
    decal(k, tx - 0.3, 1.6 + f * FH, tx + 0.3, 3.2 + f * FH, tz + 1.51, C.night1);
  decal(k, tx - 1.7, H - 1.0, tx + 1.7, H + 1.8, tz + 1.51, C.rust2);
  decal(k, tx - 1.4, H + 0.9, tx + 1.4, H + 1.3, tz + 1.512, C.fog0);
  decal(k, tx - 1.4, H - 0.4, tx + 0.8, H + 0.0, tz + 1.512, C.fog0);
  if (v !== 1) {
    k.cylinder(1.0, H + 9, 8, C.rust1, { x: 8.5, z: -2 }, C.night0);
    k.cylinder(1.08, 0.6, 8, C.rust0, { x: 8.5, y: H + 7.8, z: -2 });
  }
}

/** New England triple-decker: stacked front porches, a front gable, lit and dark windows. */
export function tripleDecker(k: Kit, variant = 0): void {
  const siding = vpick([C.fog0, C.slate1, C.moss2, C.amber0, C.concrete1], variant, 1);
  const W = 7.4;
  const D = 10;
  const FH = 3.0;
  const H = 3 * FH + 0.3;
  const front = D / 2;
  const zf = front + 0.01;
  k.box(W, H, D, siding, {}, { top: C.night3 });
  k.gable(D + 0.6, 2.6, W + 0.6, C.night3, { y: H, ry: Math.PI / 2 }, siding);
  decal(k, -0.5, H + 0.3, 0.5, H + 1.3, front + 0.31, C.night1);
  decal(k, -W / 2, 0, W / 2, 0.6, zf, C.concrete0);
  k.box(0.6, 2.8, 0.6, C.rust1, { x: 2.0, y: H, z: -2 });
  for (let f = 0; f < 3; f++) {
    const y = 0.6 + f * FH;
    k.box(W, 0.2, 2.2, C.fog0, { y: y - 0.2, z: front + 1.1 }, { top: C.amber0 });
    k.box(W, 0.8, 0.1, C.fog1, { y, z: front + 2.15 });
    for (let b = 0; b < 4; b++) {
      const x = -2.7 + b * 1.8;
      decal(k, x - 0.5, y + 0.12, x + 0.5, y + 0.66, front + 2.201, C.slate0);
    }
    for (const x of [-W / 2 + 0.1, 0, W / 2 - 0.1])
      k.box(0.18, FH - 0.2, 0.18, C.fog1, { x, y, z: front + 2.1 });
    for (const [x0, x1] of [
      [-2.6, -1.4],
      [1.4, 2.6],
    ] as const) {
      const lit = vrand(variant, f * 5 + (x0 < 0 ? 1 : 2)) < 0.35;
      if (lit) k.glow(() => decal(k, x0, y + 0.9, x1, y + 2.4, zf, C.amber1));
      else decal(k, x0, y + 0.9, x1, y + 2.4, zf, C.night1);
    }
    decal(k, -0.5, y, 0.5, y + 2.1, zf, C.rust0);
  }
  k.box(W + 0.3, 0.2, 2.5, C.night3, { y: 0.6 + 3 * FH - 0.2, z: front + 1.2 });
  k.stairs(1.4, 0.6, 1.0, 3, C.fog0, { z: front + 2.7 });
}

/** A plowed lot edge: dirty snow mounds pushed into piles, a buried sign, and scrape marks. */
export function snowPlowedLot(k: Kit, variant = 0): void {
  const mounds: readonly (readonly [number, number, number, number, number])[] = [
    [-3.4, -1.6, 1.6, 1.1, 1.5],
    [0.2, -2.0, 2.2, 1.2, 1.9],
    [3.6, -1.2, 1.4, 1.0, 1.2],
    [-1.6, 1.4, 1.0, 0.7, 0.7],
  ];
  mounds.forEach(([x, z, rx, rz, h], i) => {
    k.at({ x, z }, () => {
      blob(k, blobPts(variant, i * 9, rx, rz, 9), 0, h * 0.5, C.fog0, C.fog1, 0.8);
      blob(k, blobPts(variant, i * 9 + 4, rx * 0.75, rz * 0.7, 8), h * 0.5, h * 0.85, C.fog1, C.fog1, 0.7);
      blob(k, blobPts(variant, i * 9 + 6, rx * 0.4, rz * 0.4, 6), h * 0.85, h, C.fog2, C.fog2, 0.6);
      flat(k, -rx * 0.2, -0.06, rx * 0.05, 0.06, h + 0.003, C.concrete1);
    });
  });
  for (let i = 0; i < 3; i++) flat(k, -4.5 + i * 3.2, 2.4, -2.5 + i * 3.2, 2.6, 0.01, C.night3);
  k.pipe([0.9, 0, -1.4], [0.9, 2.5, -1.4], 0.08, C.concrete2);
  k.box(0.45, 0.6, 0.05, C.fog1, { x: 0.9, y: 2.0, z: -1.36 });
  decal(k, 0.75, 2.15, 1.05, 2.45, -1.334, C.slate1);
}

/** Highway overpass section, 10 m along x: deck with lanes and parapets on a two-column pier. */
export function overpass(k: Kit, variant = 0): void {
  const v = vint(variant, 2);
  const L = 10;
  const D = 9;
  const y0 = 5.4;
  const T = 1.0;
  for (const z of [-2.6, 2.6]) k.bevelBox(1.0, 4.6, 1.0, 0.25, C.concrete1, { z }, C.concrete0);
  k.box(1.4, 0.8, 7.6, C.concrete1, { y: 4.6 }, { top: C.concrete0 });
  k.box(L, T, D, C.concrete1, { y: y0 }, { top: C.night3 });
  k.box(L, 0.9, 0.4, C.concrete0, { y: y0 - 0.9, z: D / 2 - 0.2 });
  const top = y0 + T + 0.005;
  for (let i = 0; i < 3; i++)
    flat(k, -L / 2 + 0.6 + i * 3.4, -0.06, -L / 2 + 2.2 + i * 3.4, 0.06, top, C.amber1);
  flat(k, -L / 2, D / 2 - 1.3, L / 2, D / 2 - 1.2, top, C.fog1);
  flat(k, -L / 2, -D / 2 + 1.2, L / 2, -D / 2 + 1.3, top, C.fog1);
  for (const z of [D / 2 - 0.35, -D / 2 + 0.35])
    k.at({ y: y0 + T, z }, () => extrudeX(k, JERSEY, L, C.concrete2));
  decal(k, -3.2, y0 + 0.1, -2.6, y0 + T - 0.05, D / 2 + 0.01, C.moss0);
  decal(k, 1.0, y0 - 0.85, 1.4, y0 - 0.05, D / 2 + 0.01, C.moss0);
  decal(k, -0.25, 1.0, 0.25, 1.6, 3.11, C.amber0);
  if (v === 1) {
    k.box(0.36, 0.3, 0.3, C.night3, { y: 3.7, z: 3.25 });
    k.glow(() => k.box(0.26, 0.2, 0.26, C.amber2, { y: 3.5, z: 3.25 }));
    k.light({ x: 0, y: 3.4, z: 3.6, color: C.amber2, intensity: 3, range: 6, flicker: 0.3 });
  }
}

/** Highway sound wall panel, 4 m, with ribs and grime (variants: graffiti, water stains). */
export function soundWall(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  k.box(4.0, 4.5, 0.25, C.concrete1, {}, { top: C.concrete0 });
  k.box(0.35, 4.7, 0.4, C.concrete0, { x: 2.0 });
  const zf = 0.126;
  for (let i = 0; i < 5; i++) decal(k, -1.82, 0.5 + i * 0.85, 1.82, 0.62 + i * 0.85, zf, C.concrete0);
  decal(k, -2, 0, 1.82, 0.35, zf, C.moss0);
  if (v === 1) {
    decal(k, -1.4, 0.8, 0.2, 1.6, zf + 0.001, C.amber0);
    decal(k, -1.2, 1.0, -0.1, 1.35, zf + 0.002, C.fog0);
  } else if (v === 2) {
    decal(k, 0.6, 1.4, 0.9, 4.4, zf + 0.001, C.moss1);
    decal(k, -0.8, 2.2, -0.6, 4.4, zf + 0.001, C.concrete0);
  }
}

/** Toll booth on a striped island, with a lane gantry signal and a raised toll arm. */
export function tollBooth(k: Kit, variant = 0): void {
  const v = vint(variant, 2);
  k.box(1.8, 0.25, 6.0, C.concrete1, {}, { top: C.concrete0 });
  for (let i = 0; i < 4; i++) decal(k, -0.9 + i * 0.45, 0, -0.68 + i * 0.45, 0.25, 3.001, C.amber1);
  k.box(1.4, 2.3, 2.2, C.fog1, { y: 0.25, z: -0.4 }, { top: C.fog0 });
  k.glow(() => decal(k, -0.55, 1.2, 0.55, 2.2, 0.701, C.fog0));
  decal(k, -0.62, 0.25, 0.62, 0.9, 0.701, C.slate1);
  k.box(1.8, 0.2, 2.6, C.slate1, { y: 2.55, z: -0.4 }, { top: C.slate0 });
  k.light({ x: 0, y: 2.2, z: 0.6, color: C.fog2, intensity: 3, range: 6, flicker: 0.3 });
  k.cylinder(0.15, 5.6, 6, C.concrete2, { y: 0.25, z: 2.6 });
  k.box(4.6, 0.5, 0.4, C.concrete2, { x: 2.2, y: 5.6, z: 2.6 });
  k.box(1.4, 0.7, 0.12, C.night2, { x: 2.6, y: 4.85, z: 2.6 });
  k.glow(() => k.box(0.5, 0.4, 0.03, v === 0 ? C.amber2 : C.fog2, { x: 2.6, y: 5.0, z: 2.675 }));
  k.box(0.3, 0.9, 0.3, C.fog1, { x: 0.7, y: 0.25, z: 1.6 });
  k.at({ x: 0.85, y: 1.05, z: 1.6, rz: 1.3 }, () => {
    for (let i = 0; i < 4; i++)
      k.box(0.6, 0.1, 0.1, i % 2 ? C.night1 : C.amber1, { x: 0.3 + i * 0.6, y: -0.05 });
  });
}

/** Piedmont pine: a tall loblolly, a young conical pine, a lopsided pine, or a dead gray snag. */
export function pineTree(k: Kit, variant = 0): void {
  const v = vint(variant, 4);
  const s = 0.85 + 0.3 * vrand(variant, 1);
  k.at({ s, ry: vrand(variant, 2) * Math.PI }, () => {
    if (v === 0) {
      k.cylinder(0.18, 9, 6, C.rust0);
      k.pipe([0, 5.5, 0], [0.9, 6.2, 0.2], 0.1, C.rust0);
      k.cone(1.7, 2.4, 6, C.moss0, { y: 6.6 });
      k.cone(1.35, 2.2, 6, C.moss1, { y: 7.9, ry: 0.5 });
      k.cone(0.9, 1.9, 6, C.moss0, { y: 9.2 });
    } else if (v === 1) {
      k.cylinder(0.15, 1.2, 6, C.rust0);
      k.cone(1.9, 2.4, 8, C.moss0, { y: 0.8 });
      k.cone(1.5, 2.2, 8, C.moss1, { y: 2.1, ry: 0.3 });
      k.cone(1.1, 2.0, 8, C.moss0, { y: 3.3 });
      k.cone(0.65, 1.8, 8, C.moss1, { y: 4.4, ry: 0.3 });
    } else if (v === 2) {
      k.cylinder(0.16, 8, 6, C.rust0);
      blob(k, blobPts(variant, 3, 1.3, 1.1, 7), 5.6, 7.0, C.moss0, C.moss1, 0.6);
      k.at({ x: 0.5, z: 0.2 }, () =>
        blob(k, blobPts(variant, 5, 1.0, 0.9, 7), 6.9, 8.1, C.moss1, C.moss2, 0.5),
      );
      k.cone(0.7, 1.6, 6, C.moss0, { x: -0.3, y: 8.0 });
    } else {
      k.cylinder(0.17, 6.5, 6, C.concrete1, {}, C.concrete0);
      k.pipe([0, 4.0, 0], [0.9, 4.8, 0.1], 0.1, C.concrete1);
      k.pipe([0, 5.2, 0], [-0.7, 5.9, -0.1], 0.1, C.concrete1);
    }
  });
}

/** A stand of pines on a red clay shoulder, with low undergrowth. */
export function pineStand(k: Kit, variant = 0): void {
  flatPoly(k, blobPts(variant, 1, 4.6, 3.3, 10, 0.25), 0.01, C.rust1);
  k.at({ x: 0.6, z: -0.4 }, () => flatPoly(k, blobPts(variant, 2, 2.6, 1.6, 8, 0.3), 0.014, C.rust0));
  const n = 5 + vint(variant, 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + vrand(variant, i) * 0.8;
    const r = 0.8 + 2.2 * vrand(variant, i + 20);
    const kind = Math.floor(vrand(variant, i + 40) * 3);
    k.at({ x: Math.cos(a) * r * 1.2, z: Math.sin(a) * r * 0.75 }, () => pineTree(k, kind + 4 * (i + 1)));
  }
  for (let i = 0; i < 3; i++) {
    k.cone(0.5, 0.7, 6, C.moss1, { x: -3 + i * 2.6, z: 2.2 - vrand(variant, i + 60) * 0.8 });
  }
}

/** Rural feed store: false-front facade with a lit sign, porch with posts and a shed roof, feed sacks. */
export function feedStore(k: Kit, variant = 0): void {
  const v = vint(variant, 2);
  const wall = v === 0 ? C.fog0 : C.rust1;
  const W = 8;
  const D = 10;
  const H = 4.5;
  k.box(W, H, D, wall, {}, { top: C.night3 });
  k.gable(D + 0.6, 2.6, W + 0.6, C.concrete2, { y: H, ry: Math.PI / 2 }, wall);
  k.box(W + 0.4, 7.2, 0.3, wall, { z: D / 2 + 0.15 }, { top: C.night3 });
  const zf = D / 2 + 0.31;
  decal(k, -3.4, 5.2, 3.4, 6.6, zf, C.amber0);
  decal(k, -2.8, 5.75, 2.8, 6.05, zf + 0.001, C.fog1);
  k.pipe([0, 7.0, zf], [0, 7.3, zf + 0.5], 0.08, C.night3);
  k.box(0.4, 0.16, 0.3, C.night3, { y: 7.1, z: zf + 0.55 });
  k.glow(() => k.box(0.3, 0.1, 0.03, C.amber2, { y: 7.12, z: zf + 0.71 }));
  k.light({ x: 0, y: 6.8, z: zf + 0.9, color: C.amber2, intensity: 4, range: 7 });
  if (v === 0) {
    k.glow(() => {
      decal(k, -3.4, 1.4, -1.2, 3.1, zf, C.amber1);
      decal(k, 1.2, 1.4, 3.4, 3.1, zf, C.amber1);
    });
  } else {
    decal(k, -3.4, 1.4, -1.2, 3.1, zf, C.night1);
    decal(k, 1.2, 1.4, 3.4, 3.1, zf, C.night1);
  }
  decal(k, -0.6, 0.6, 0.6, 3.1, zf, C.rust0);
  k.box(W, 0.6, 2.4, C.amber0, { z: D / 2 + 1.5 });
  k.stairs(1.6, 0.6, 0.9, 3, C.amber0, { z: D / 2 + 3.15 });
  for (const x of [-3.8, 0, 3.8]) k.box(0.18, 2.9, 0.18, C.fog1, { x, y: 0.6, z: D / 2 + 2.55 });
  k.box(W + 0.4, 0.15, 2.8, C.concrete2, { y: 3.5, z: D / 2 + 1.55, rx: 0.12 });
  k.at({ x: 2.4, y: 0.6, z: D / 2 + 1.1 }, () => feedSacks(k, variant));
}

/** Tobacco barn: tall plank barn under a rusted tin gable, missing boards, and an open lean-to shed. */
export function tobaccoBarn(k: Kit, variant = 0): void {
  const v = vint(variant, 2);
  const wall = v === 0 ? C.rust0 : C.night3;
  const W = 6;
  const D = 6;
  const H = 7;
  const zf = D / 2 + 0.01;
  k.box(W, H, D, wall, {}, { top: C.night3 });
  k.gable(W + 0.6, 2.8, D + 0.8, v === 0 ? C.rust1 : C.concrete1, { y: H }, wall);
  for (let i = 0; i < 9; i++) {
    const x = -W / 2 + 0.33 + i * 0.67;
    const gap = vrand(variant, i) < 0.3;
    if (gap) decal(k, x - 0.15, 1.5 + 3 * vrand(variant, i + 9), x + 0.15, H - 0.4, zf, C.night0);
    else decal(k, x - 0.05, 0.3, x + 0.05, H - 0.2, zf, v === 0 ? C.night3 : C.night1);
  }
  decal(k, -0.8, 0, 0.8, 2.6, zf + 0.002, C.night2);
  decal(k, -0.5, H - 1.6, 0.5, H - 0.8, zf + 0.002, C.night1);
  k.box(3.0, 0.12, D, v === 0 ? C.rust1 : C.concrete1, { x: W / 2 + 1.5, y: 3.2, rz: -0.25 });
  for (const z of [-D / 2 + 0.3, D / 2 - 0.3]) k.box(0.16, 2.6, 0.16, wall, { x: W / 2 + 2.8, z });
  flat(k, W / 2, -D / 2, W / 2 + 3.0, D / 2, 0.01, C.night2);
}

/** Small-town water tower: four splayed legs with bracing, a bowl-bottomed tank, cone roof, ladder. */
export function waterTower(k: Kit, variant = 0): void {
  const tank = vint(variant, 2) === 0 ? C.fog0 : C.concrete2;
  const H = 11;
  const r0 = 2.6;
  const r1 = 1.9;
  const legs: readonly P2[] = [
    [0.7071, 0.7071],
    [0.7071, -0.7071],
    [-0.7071, -0.7071],
    [-0.7071, 0.7071],
  ];
  const at = (y: number, c: P2): [number, number, number] => {
    const r = lerp(r0, r1, y / H);
    return [c[0] * r, y, c[1] * r];
  };
  for (const c of legs) {
    k.box(0.7, 0.4, 0.7, C.concrete1, { x: c[0] * r0, z: c[1] * r0 }, { top: C.concrete0 });
    k.pipe(at(0.4, c), at(H, c), 0.3, C.slate1);
  }
  for (let i = 0; i < 4; i++) {
    const a = legs[i];
    const b = legs[(i + 1) % 4];
    k.pipe(at(3.8, a), at(3.8, b), 0.12, C.slate0);
    k.pipe(at(7.6, a), at(7.6, b), 0.12, C.slate0);
    k.pipe(at(0.4, a), at(3.8, b), 0.1, C.slate0);
    k.pipe(at(3.8, a), at(7.6, b), 0.1, C.slate0);
  }
  frustum(k, 1.6, 3.2, H - 1.0, H, 8, tank, null);
  k.cylinder(3.2, 4.5, 8, tank, { y: H }, C.slate1);
  k.cylinder(3.24, 0.9, 8, C.slate1, { y: H + 1.8 });
  k.cone(3.4, 1.6, 8, C.slate1, { y: H + 4.5 });
  k.box(0.2, 0.3, 0.2, C.slate0, { y: H + 6.1 });
  frustum(k, 3.6, 3.6, H + 0.2, H + 0.3, 8, C.night3);
  for (const x of [-0.25, 0.25]) k.pipe([x, 0, 3.0], [x, H + 0.3, 3.4], 0.08, C.night3);
}

/** Sabal palmetto with a fan crown and dead fronds (variant 3: a low saw-palmetto clump). */
export function palmetto(k: Kit, variant = 0): void {
  const v = vint(variant, 4);
  const frond = vpick([C.moss1, C.moss2], variant, 2);
  if (v === 3) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + vrand(variant, i);
      k.at({ ry: a, rx: -0.5 - 0.3 * vrand(variant, i + 5) }, () =>
        k.box(0.5, 0.08, 1.1, i % 2 ? C.moss1 : C.moss2, { z: 0.55 }),
      );
    }
    return;
  }
  const H = 4.0 + 2.5 * vrand(variant, 1) + (v === 1 ? 1.5 : 0);
  const lean = (vrand(variant, 3) - 0.5) * 0.25;
  k.at({ rz: lean, ry: vrand(variant, 4) * Math.PI }, () => {
    k.cylinder(0.2, H * 0.55, 6, C.rust0);
    k.cylinder(0.18, H * 0.45, 6, C.amber0, { y: H * 0.55 });
    k.at({ y: H }, () => {
      k.cone(0.35, 0.6, 6, frond);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + vrand(variant, i + 7) * 0.5;
        const tilt = -0.35 + 0.5 * vrand(variant, i + 21);
        k.at({ ry: a, rx: tilt }, () => k.box(0.55, 0.08, 1.7, i % 3 === 0 ? C.moss2 : frond, { z: 0.85 }));
      }
      for (let i = 0; i < (v === 2 ? 3 : 2); i++) {
        k.at({ ry: vrand(variant, i + 33) * Math.PI * 2, rx: 1.2 }, () =>
          k.box(0.4, 0.08, 1.2, C.amber0, { z: 0.6 }),
        );
      }
    });
  });
}

/** Lowcountry live oak: thick trunk, low spreading limbs, broad canopy lobes, hanging Spanish moss. */
export function liveOak(k: Kit, variant = 0): void {
  const s = 0.9 + 0.25 * vrand(variant, 1);
  k.at({ s }, () => {
    k.bevelBox(1.2, 2.6, 1.1, 0.3, C.night3);
    k.pipe([0, 2.2, 0], [-3.2, 3.4, 0.4], 0.45, C.night3);
    k.pipe([0, 2.4, 0], [3.4, 3.2, -0.3], 0.45, C.night3);
    k.pipe([0, 2.5, 0], [0.4, 3.6, -2.4], 0.4, C.night3);
    const lobes: readonly (readonly [number, number, number, number, number, number])[] = [
      [-3.0, 0.3, 2.6, 2.2, 3.2, 4.8],
      [3.0, -0.2, 2.8, 2.3, 3.0, 4.6],
      [0, -1.4, 3.0, 2.4, 3.8, 5.6],
      [0.2, 1.0, 2.2, 1.8, 3.6, 5.2],
    ];
    lobes.forEach(([x, z, rx, rz, y0, y1], i) => {
      k.at({ x, z }, () =>
        blob(k, blobPts(variant, i * 5, rx, rz, 8), y0, y1, C.moss0, i % 2 ? C.moss1 : C.moss0, 0.75),
      );
    });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + vrand(variant, i);
      const r = 2.2 + 2.0 * vrand(variant, i + 10);
      const len = 1.0 + 1.0 * vrand(variant, i + 20);
      k.box(0.14, len, 0.12, i % 2 ? C.fog0 : C.concrete1, {
        x: Math.cos(a) * r * 1.2,
        y: 3.4 - len,
        z: Math.sin(a) * r * 0.8,
      });
    }
  });
}

/** Swamp water: dark water with a sky reflection, duckweed, cypress knees, a stump, a log, and reeds. */
export function swampWater(k: Kit, variant = 0): void {
  flatPoly(k, blobPts(variant, 1, 5.0, 3.5, 12, 0.25), 0.01, C.night2);
  k.at({ x: -1.0, z: -0.6 }, () => flatPoly(k, blobPts(variant, 2, 2.2, 1.2, 8, 0.3), 0.014, C.slate0));
  k.at({ x: 2.2, z: 1.0 }, () => flatPoly(k, blobPts(variant, 3, 1.4, 0.9, 7, 0.35), 0.016, C.moss0));
  k.at({ x: -2.6, z: 1.6 }, () => flatPoly(k, blobPts(variant, 4, 0.9, 0.6, 6, 0.35), 0.016, C.moss1));
  for (let i = 0; i < 6; i++) {
    const a = vrand(variant, i + 70) * Math.PI * 2;
    const r = 1.5 + 2.0 * vrand(variant, i + 80);
    k.cone(
      0.14 + 0.1 * vrand(variant, i + 90),
      0.3 + 0.3 * vrand(variant, i + 95),
      5,
      i % 2 ? C.rust0 : C.amber0,
      {
        x: Math.cos(a) * r,
        z: Math.sin(a) * r * 0.6,
      },
    );
  }
  k.at({ x: 3.0, z: -1.5 }, () => frustum(k, 0.55, 0.35, 0, 1.1, 7, C.rust0, C.rust1));
  k.box(2.4, 0.3, 0.36, C.rust0, { x: -1.6, y: -0.05, z: 0.6, ry: 0.4 }, { top: C.rust1 });
  for (let c = 0; c < 2; c++) {
    const cx = c === 0 ? 3.8 : -4.0;
    const cz = c === 0 ? 1.8 : -1.0;
    for (let i = 0; i < 3; i++) {
      const tilt = (i - 1) * 0.12;
      const x = cx + (i - 1) * 0.2;
      const z = cz + vrand(variant, c * 9 + i) * 0.3;
      const h = 0.8 + 0.5 * vrand(variant, c * 9 + i + 3);
      k.box(0.08, h, 0.08, C.moss1, { x, z, rz: tilt });
      if (i !== 1) k.box(0.1, 0.24, 0.1, C.rust0, { x: x - Math.sin(tilt) * h, y: h - 0.12, z, rz: tilt });
    }
  }
}

/** Strip mall: four storefronts (open and lit, closed, or boarded), sign band, walkway, rooftop units. */
export function stripMall(k: Kit, variant = 0): void {
  const W = 24;
  const D = 10;
  const H = 4.5;
  const n = 4;
  const zf = D / 2 + 0.01;
  const shopW = W / n;
  k.box(W, H, D, C.concrete1, {}, { top: C.night3 });
  k.box(W + 0.4, 1.2, 0.4, C.fog0, { y: H - 0.2, z: D / 2 + 0.2 }, { top: C.concrete2 });
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + shopW * (i + 0.5);
    const state = vrand(variant, i);
    const boarded = state < 0.22;
    const open = state >= 0.5 || i === vint(variant, n);
    const sign = { x, y: H + 0.1, z: D / 2 + 0.42 };
    if (open)
      k.glow(() => k.box(shopW - 2.0, 0.6, 0.04, vrand(variant, i + 9) < 0.5 ? C.amber2 : C.fog2, sign));
    else k.box(shopW - 2.0, 0.6, 0.04, C.slate0, sign);
    if (open) {
      k.glow(() => decal(k, x - 2.5, 0.3, x + 2.5, 3.0, zf, C.fog0));
      decal(k, x + 0.9, 0.3, x + 2.0, 2.6, zf + 0.001, C.night1);
    } else if (boarded) {
      decal(k, x - 2.5, 0.3, x + 2.5, 3.0, zf, C.amber0);
      decal(k, x - 0.8, 1.2, x + 0.8, 1.8, zf + 0.001, C.fog1);
    } else {
      decal(k, x - 2.5, 0.3, x + 2.5, 3.0, zf, C.night1);
    }
    if (i > 0) decal(k, x - shopW / 2 - 0.2, 0, x - shopW / 2 + 0.2, H - 0.2, zf + 0.002, C.concrete2);
  }
  k.box(W, 0.25, 2.6, C.concrete2, { y: 3.3, z: D / 2 + 1.3 }, { top: C.concrete1 });
  for (let i = 0; i <= n; i++)
    k.box(0.25, 3.3, 0.25, C.concrete2, { x: -W / 2 + 0.3 + i * ((W - 0.6) / n), z: D / 2 + 2.45 });
  k.glow(() => {
    k.box(0.8, 0.1, 0.3, C.fog2, { x: -6, y: 3.2, z: D / 2 + 2.3 });
    k.box(0.8, 0.1, 0.3, C.fog2, { x: 6, y: 3.2, z: D / 2 + 2.3 });
  });
  k.light({ x: -6, y: 3.0, z: D / 2 + 1.4, color: C.fog2, intensity: 4, range: 7, flicker: 0.4 });
  k.light({ x: 6, y: 3.0, z: D / 2 + 1.4, color: C.fog2, intensity: 4, range: 7 });
  for (const x of [-6, 5]) {
    k.box(1.6, 1.0, 1.4, C.concrete2, { x, y: H, z: -1 }, { top: C.concrete1 });
    flat(k, x - 0.5, -1.5, x + 0.5, -0.5, H + 1.002, C.night2);
  }
}

/** Lowcountry stilt house: pilings, raised porch with stairs, tin roof, a lit window. */
export function stiltHouse(k: Kit, variant = 0): void {
  const siding = [C.fog0, C.moss2, C.amber0, C.slate1][vint(variant, 4)];
  const W = 8;
  const D = 7;
  const Y = 3.0;
  const H = 3.2;
  const zf = D / 2 + 0.01;
  for (const x of [-3.6, 0, 3.6]) {
    for (const z of [-3.0, 3.0]) k.box(0.3, Y, 0.3, C.rust1, { x, z });
  }
  k.box(W, H, D, siding, { y: Y }, { top: C.night3 });
  k.gable(W + 0.8, 2.2, D + 0.8, C.rust1, { y: Y + H }, siding);
  k.box(W, 0.2, 2.2, C.amber0, { y: Y - 0.2, z: D / 2 + 1.1 });
  for (const x of [-3.8, 0, 3.8]) k.box(0.3, Y - 0.2, 0.3, C.rust1, { x, z: D / 2 + 2.0 });
  k.box(6.5, 0.9, 0.1, C.fog1, { x: -0.75, y: Y, z: D / 2 + 2.15 });
  for (const x of [-3.8, 0, 3.8]) k.box(0.16, 2.4, 0.16, C.fog1, { x, y: Y, z: D / 2 + 2.1 });
  k.box(W + 0.4, 0.15, 2.6, C.concrete1, { y: Y + 2.45, z: D / 2 + 1.2, rx: 0.15 });
  k.stairs(1.1, Y, 3.2, 7, C.amber0, { x: 3.2, z: D / 2 + 3.8 });
  const lit = vrand(variant, 5) < 0.6;
  if (lit) {
    k.glow(() => decal(k, -3.2, Y + 1.0, -1.8, Y + 2.4, zf, C.amber1));
    k.light({ x: -2.5, y: Y + 1.8, z: D / 2 + 1.0, color: C.amber2, intensity: 3, range: 5 });
  } else {
    decal(k, -3.2, Y + 1.0, -1.8, Y + 2.4, zf, C.night1);
  }
  decal(k, 1.6, Y + 1.0, 3.0, Y + 2.4, zf, C.night1);
  decal(k, -0.5, Y, 0.5, Y + 2.2, zf, C.rust0);
}

// ================================================================================================
// Stations: a house kitchen, a feed store back room, a church fellowship hall (§10.5)
// ================================================================================================

/** Kitchen table: a checked cloth with mugs and a bowl, papers and keys, or a pie with plates. */
export function kitchenTable(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  legs4(k, 1.3, 0.8, 0.7, 0.1, C.rust1);
  k.box(1.4, 0.08, 0.9, C.rust1, { y: 0.7 }, { top: C.amber0 });
  const y = 0.78;
  if (v === 0) {
    flat(k, -0.72, -0.46, 0.72, 0.46, y + 0.003, C.fog1);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) {
        if ((i + j) % 2) continue;
        const x0 = -0.72 + i * 0.36;
        const z0 = -0.46 + j * 0.307;
        flat(k, x0, z0, x0 + 0.36, z0 + 0.307, y + 0.006, C.fog0);
      }
    }
    decal(k, -0.72, 0.6, 0.72, 0.78, 0.461, C.fog1);
    k.cylinder(0.06, 0.1, 6, C.fog2, { x: -0.35, y, z: 0.12 }, C.night1);
    k.cylinder(0.06, 0.1, 6, C.amber1, { x: 0.3, y, z: -0.1 }, C.night1);
    k.at({ x: 0.0, z: 0.0 }, () => frustum(k, 0.08, 0.15, y, y + 0.09, 6, C.moss2, C.amber1));
  } else if (v === 1) {
    k.at({ x: -0.25, y: y + 0.003, ry: 0.25 }, () => flat(k, -0.2, -0.15, 0.2, 0.15, 0, C.fog2));
    k.at({ x: 0.15, y: y + 0.006, ry: -0.2 }, () => flat(k, -0.25, -0.18, 0.25, 0.18, 0, C.amber1));
    k.box(0.12, 0.03, 0.08, C.concrete2, { x: 0.45, y, z: 0.25 });
    k.cylinder(0.06, 0.1, 6, C.fog2, { x: -0.5, y, z: -0.2 }, C.night1);
  } else {
    k.cylinder(0.2, 0.03, 8, C.fog2, { y });
    k.cylinder(0.16, 0.06, 8, C.amber1, { y: y + 0.03 }, C.amber0);
    for (const x of [-0.5, 0.5]) k.box(0.24, 0.03, 0.24, C.fog2, { x, y, z: 0.12 });
    k.cylinder(0.08, 0.24, 6, C.amber0, { x: 0.3, y, z: -0.25 }, C.fog1);
  }
}

/** Wooden chairs around a 1.4 × 0.9 m kitchen table: two (east and west), three, or three plus one
 *  pulled out askew on the south side. Place it centered on the table. */
export function kitchenChairs(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  const frame = vpick([C.rust1, C.amber0, C.moss1], variant, 3);
  const top = frame === C.moss1 ? C.moss2 : C.amber1;
  const woodChair = (): void => seatAndBack(k, frame, frame, top, false);
  k.at({ x: -0.95, ry: Math.PI / 2 }, woodChair);
  k.at({ x: 0.95, ry: -Math.PI / 2 }, woodChair);
  if (v >= 1) k.at({ z: -0.75 }, woodChair);
  if (v === 2) k.at({ x: 0.3, z: 0.95, ry: Math.PI + 0.35 }, woodChair);
}

/** Home stove with a pot, an enamel kettle, a lit clock on the backguard, and a towel on the handle. */
export function stove(k: Kit, variant = 0): void {
  const v = vint(variant, 2);
  k.box(0.76, 0.9, 0.65, C.fog1, {}, { top: C.night2 });
  k.box(0.76, 0.24, 0.1, C.fog1, { y: 0.9, z: -0.275 }, { top: C.fog0 });
  k.glow(() => k.box(0.16, 0.08, 0.02, C.amber1, { y: 1.0, z: -0.215 }));
  for (const [x, z] of BURNERS) flat(k, x - 0.1, z - 0.1, x + 0.1, z + 0.1, 0.902, C.night0);
  for (let i = 0; i < 4; i++) k.box(0.08, 0.08, 0.05, C.night1, { x: -0.27 + i * 0.18, y: 0.8, z: 0.345 });
  decal(k, -0.28, 0.2, 0.28, 0.6, 0.326, C.night1);
  k.box(0.56, 0.08, 0.06, C.concrete2, { y: 0.66, z: 0.36 });
  k.box(0.18, 0.28, 0.03, v === 0 ? C.fog2 : C.moss2, { x: 0.14, y: 0.42, z: 0.395 });
  k.cylinder(0.13, 0.16, 6, C.concrete2, { x: -0.19, y: 0.9, z: -0.1 }, C.night2);
  k.cylinder(0.1, 0.16, 6, C.amber1, { x: 0.19, y: 0.9, z: 0.16 }, C.amber0);
  k.box(0.08, 0.06, 0.12, C.amber1, { x: 0.19, y: 1.0, z: 0.3 });
}
const BURNERS: readonly P2[] = [
  [-0.19, -0.1],
  [0.19, -0.1],
  [-0.19, 0.16],
  [0.19, 0.16],
];

/** Kitchen counter with wall cabinets, a bread box, jars, and a cutting board. */
export function kitchenCounter(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  const cab = [C.amber0, C.moss2, C.fog1][v];
  const door = [C.rust1, C.moss1, C.fog0][v];
  k.box(1.2, 0.86, 0.6, cab);
  decal(k, -0.56, 0.1, -0.03, 0.72, 0.301, door);
  decal(k, 0.03, 0.1, 0.56, 0.72, 0.301, door);
  k.box(0.08, 0.08, 0.05, C.concrete2, { x: -0.1, y: 0.6, z: 0.32 });
  k.box(0.08, 0.08, 0.05, C.concrete2, { x: 0.1, y: 0.6, z: 0.32 });
  k.box(1.24, 0.08, 0.64, C.concrete2, { y: 0.86 }, { top: C.fog0 });
  k.box(1.2, 0.7, 0.34, cab, { y: 1.5, z: -0.13 });
  decal(k, -0.56, 1.56, -0.03, 2.14, 0.041, door);
  decal(k, 0.03, 1.56, 0.56, 2.14, 0.041, door);
  const y = 0.94;
  k.box(0.36, 0.2, 0.24, C.amber1, { x: -0.36, y, z: -0.12 }, { top: C.amber0 });
  const jars = [C.fog0, C.amber1, C.moss2] as const;
  jars.forEach((c, i) =>
    k.cylinder(0.06, 0.14 + 0.05 * i, 6, c, { x: 0.1 + i * 0.14, y, z: -0.18 }, C.rust1),
  );
  k.box(0.34, 0.03, 0.22, C.amber1, { x: 0.25, y, z: 0.1, ry: 0.2 });
}

/**
 * Station window (wall) with the infrared beacon on the sill: a small amber lamp that only androids see.
 * Its light is tagged 'beacon' so the scene can pulse it and show it only near androids.
 */
export function beaconWindow(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  const curtain = [C.amber0, C.rust1, C.moss1][v];
  k.frame(1.3, 1.5, 0.1, 0.16, C.fog1, { y: 0.9, z: 0.05 });
  decal(k, -0.55, 1.0, 0.55, 2.3, 0.02, C.night1);
  k.box(0.08, 1.3, 0.1, C.fog1, { y: 1.0, z: 0.05 });
  k.box(1.1, 0.08, 0.1, C.fog1, { y: 1.62, z: 0.05 });
  k.box(1.5, 0.08, 0.28, C.fog1, { y: 0.84, z: 0.12 }, { top: C.fog0 });
  k.box(0.3, 1.5, 0.08, curtain, { x: -0.72, y: 0.85, z: 0.2 });
  k.box(0.3, 1.5, 0.08, curtain, { x: 0.72, y: 0.85, z: 0.2 });
  k.pipe([-0.95, 2.45, 0.2], [0.95, 2.45, 0.2], 0.08, C.amber0);
  k.box(0.2, 0.14, 0.14, C.night3, { x: 0.3, y: 0.92, z: 0.12 });
  k.glow(() => k.box(0.12, 0.1, 0.03, C.amber1, { x: 0.3, y: 0.94, z: 0.2 }));
  k.light({ x: 0.3, y: 1.0, z: 0.35, color: C.amber1, intensity: 2.5, range: 4, tag: 'beacon' });
  if (v === 1) {
    k.at({ x: -0.3, y: 0.92, z: 0.12 }, () => {
      frustum(k, 0.08, 0.1, 0, 0.14, 6, C.rust2, C.rust0);
      k.cone(0.16, 0.3, 6, C.moss1, { y: 0.12 });
    });
  }
}

/** Floor lamp with a glowing shade (variant 1 fog white, variant 2 switched off). */
export function floorLamp(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  k.cylinder(0.18, 0.05, 8, C.night3);
  k.pipe([0, 0.05, 0], [0, 1.38, 0], 0.08, C.night2);
  if (v === 2) {
    frustum(k, 0.28, 0.18, 1.32, 1.7, 8, C.amber0, C.rust0);
  } else {
    k.glow(() =>
      frustum(k, 0.28, 0.18, 1.32, 1.7, 8, v === 1 ? C.fog1 : C.amber2, v === 1 ? C.fog0 : C.amber1),
    );
    k.light({ x: 0, y: 1.45, z: 0, color: v === 1 ? C.fog2 : C.amber2, intensity: 3, range: 5 });
  }
}

/** Table lamp (sits on a table or desk) with a glowing amber shade. */
export function tableLamp(k: Kit, variant = 0): void {
  k.cylinder(0.1, 0.22, 6, vint(variant, 2) === 0 ? C.amber0 : C.rust1, {}, C.night3);
  k.pipe([0, 0.22, 0], [0, 0.36, 0], 0.08, C.concrete2);
  k.glow(() => frustum(k, 0.2, 0.13, 0.32, 0.6, 8, C.amber2, C.amber1));
  k.light({ x: 0, y: 0.45, z: 0, color: C.amber2, intensity: 3, range: 5 });
}

/** Feed sacks stacked crosswise on a pallet, 2–3 layers. */
export function feedSacks(k: Kit, variant = 0): void {
  k.box(1.2, 0.14, 1.0, C.amber0, {}, { top: C.amber0 });
  decal(k, -0.6, 0.03, 0.6, 0.1, 0.501, C.night2);
  const layers = 2 + vint(variant, 2);
  for (let l = 0; l < layers; l++) {
    const y = 0.14 + l * 0.22;
    for (let i = 0; i < 2; i++) {
      const col = vpick([C.fog0, C.skin4, C.amber1, C.fog1], variant, l * 7 + i);
      const print = vpick([C.moss1, C.rust1, C.slate1], variant, l * 3 + i + 40);
      const xf = l % 2 === 0 ? { y, z: (i - 0.5) * 0.5 } : { x: (i - 0.5) * 0.56, y, ry: Math.PI / 2 };
      k.at(xf, () => {
        k.bevelBox(0.85, 0.22, 0.48, 0.08, col);
        flat(k, -0.1, -0.24, 0.1, 0.24, 0.222, print);
      });
    }
  }
}

/** Feed store shelving: sacks, buckets, a coil of rope, tins, and an unlit lantern. */
export function feedShelf(k: Kit, variant = 0): void {
  for (const x of [-0.96, 0, 0.96]) k.box(0.08, 2.0, 0.6, C.amber0, { x }, { top: C.rust1 });
  k.box(2.0, 2.0, 0.08, C.rust0, { z: -0.27 });
  for (const y of [0.1, 0.8, 1.45]) k.box(1.84, 0.06, 0.56, C.amber0, { y }, { top: C.amber1 });
  k.box(0.8, 0.3, 0.48, vpick([C.skin4, C.fog0], variant, 1), { x: -0.5, y: 0.16 }, { top: C.fog1 });
  k.box(0.8, 0.26, 0.48, vpick([C.amber1, C.fog1], variant, 2), { x: 0.5, y: 0.16 }, { top: C.skin4 });
  const buckets = [C.moss1, C.slate1, C.amber1] as const;
  buckets.forEach((c, i) =>
    k.at({ x: -0.7 + i * 0.34, z: 0.05 }, () => frustum(k, 0.13, 0.16, 0.86, 1.16, 6, c, C.night2)),
  );
  k.cylinder(0.18, 0.12, 6, C.amber1, { x: 0.55, y: 0.86 }, C.amber0);
  [C.concrete2, C.fog0, C.rust2].forEach((c, i) =>
    k.cylinder(0.1, 0.22, 6, c, { x: -0.7 + i * 0.26, y: 1.51 }, C.slate0),
  );
  k.box(0.18, 0.26, 0.18, C.night3, { x: 0.55, y: 1.51 });
  k.box(0.12, 0.12, 0.03, C.amber0, { x: 0.55, y: 1.58, z: 0.1 });
}

/** Office desk: church office (wood), feed store (adding machine, ledgers), or depot office (computer). */
export function officeDesk(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  const body = [C.rust1, C.slate1, C.slate0][v];
  const top = [C.amber0, C.slate0, C.night3][v];
  k.box(1.5, 0.75, 0.75, body, {}, { top });
  decal(k, -0.3, 0, 0.3, 0.62, 0.376, C.night1);
  for (const yy of [0.1, 0.32, 0.54]) {
    decal(k, 0.38, yy, 0.7, yy + 0.16, 0.376, top);
    k.box(0.12, 0.08, 0.04, C.concrete2, { x: 0.54, y: yy + 0.04, z: 0.39 });
  }
  const y = 0.75;
  k.box(0.18, 0.04, 0.18, C.night3, { x: -0.55, y, z: -0.2 });
  k.pipe([-0.55, y, -0.2], [-0.5, y + 0.42, -0.1], 0.08, C.night3);
  k.box(0.26, 0.14, 0.2, C.amber0, { x: -0.48, y: y + 0.36, z: -0.02 });
  k.glow(() => k.box(0.2, 0.08, 0.03, C.amber2, { x: -0.48, y: y + 0.37, z: 0.09 }));
  k.light({ x: -0.45, y: y + 0.3, z: 0.15, color: C.amber2, intensity: 3, range: 5 });
  k.at({ x: -0.1, y: y + 0.003, ry: 0.15 }, () => flat(k, -0.18, -0.13, 0.18, 0.13, 0, C.fog2));
  k.cylinder(0.05, 0.1, 6, C.fog2, { x: 0.25, y, z: 0.22 }, C.night1);
  k.box(0.2, 0.08, 0.16, C.night1, { x: 0.5, y, z: -0.2 });
  if (v === 2) {
    k.box(0.44, 0.34, 0.36, C.night3, { x: 0.05, y, z: -0.17 });
    k.glow(() => k.box(0.34, 0.24, 0.02, C.fog0, { x: 0.05, y: y + 0.06, z: 0.02 }));
    k.box(0.44, 0.03, 0.16, C.night2, { x: 0.05, y, z: 0.18 });
  } else if (v === 1) {
    k.box(0.24, 0.1, 0.28, C.concrete2, { x: 0.15, y, z: -0.12 });
    k.cylinder(0.05, 0.12, 6, C.fog2, { x: 0.15, y: y + 0.1, z: -0.22 });
    k.box(0.34, 0.08, 0.26, C.moss1, { x: 0.5, y: y + 0.08, z: 0.1 }, { top: C.fog1 });
  } else {
    k.box(0.22, 0.06, 0.3, C.night3, { x: 0.2, y, z: -0.1 });
    k.box(0.2, 0.05, 0.28, C.rust0, { x: 0.2, y: y + 0.06, z: -0.1, ry: 0.2 });
  }
}

/** Fellowship-hall folding table: bare, set with a paper cloth and a casserole, or a sign-up sheet and
 *  a box of donuts. */
export function foldingTable(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  for (const x of [-0.75, 0.75]) {
    k.pipe([x, 0, -0.3], [x, 0.7, 0], 0.08, C.night3);
    k.pipe([x, 0, 0.3], [x, 0.7, 0], 0.08, C.night3);
  }
  k.box(1.8, 0.06, 0.75, C.fog0, { y: 0.7 }, { top: C.fog1 });
  const y = 0.76;
  if (v === 1) {
    flat(k, -0.9, -0.375, 0.9, 0.375, y + 0.003, C.fog2);
    decal(k, -0.9, 0.6, 0.9, 0.76, 0.376, C.fog2);
    k.box(0.36, 0.08, 0.26, C.fog1, { x: -0.3, y }, { top: C.rust2 });
    for (const x of [0.2, 0.5]) k.box(0.24, 0.03, 0.24, C.fog1, { x, y, z: 0.1 });
    k.cylinder(0.05, 0.1, 6, C.fog1, { x: 0.7, y, z: -0.2 }, C.night1);
  } else if (v === 2) {
    k.at({ x: -0.4, y: y + 0.003, ry: -0.1 }, () => flat(k, -0.15, -0.2, 0.15, 0.2, 0, C.fog2));
    k.box(0.08, 0.02, 0.16, C.night1, { x: -0.18, y, z: 0.05 });
    k.box(0.4, 0.1, 0.4, C.amber0, { x: 0.35, y }, { top: C.skin4 });
  }
}

/** One metal folding chair. */
function foldingChair(k: Kit, color: number): void {
  for (const s of [-1, 1]) {
    k.pipe([s * 0.19, 0, 0.2], [s * 0.19, 0.45, 0.0], 0.08, C.night3);
    k.pipe([s * 0.19, 0, -0.2], [s * 0.19, 0.92, -0.22], 0.08, C.night3);
  }
  k.box(0.44, 0.06, 0.4, color, { y: 0.45 }, { top: color === C.slate0 ? C.slate1 : C.concrete2 });
  k.box(0.44, 0.24, 0.06, color, { y: 0.68, z: -0.21 });
}

/** Folding chairs: a row of three, two set loose, or a stack of folded chairs leaning on the wall. */
export function foldingChairs(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  const color = vpick([C.slate0, C.concrete1], variant, 1);
  if (v === 0) {
    for (const x of [-0.5, 0, 0.5]) k.at({ x }, () => foldingChair(k, color));
  } else if (v === 1) {
    k.at({ x: -0.3 }, () => foldingChair(k, color));
    k.at({ x: 0.4, z: 0.2, ry: 0.5 }, () => foldingChair(k, color));
  } else {
    for (let i = 0; i < 4; i++) {
      k.at({ x: (i - 1.5) * 0.06, z: 0.12 + i * 0.1, rx: -0.12 }, () => {
        k.box(0.44, 0.92, 0.06, color, { y: 0.04 });
        k.pipe([-0.19, 0, 0.05], [-0.19, 0.85, 0.05], 0.08, C.night3);
        k.pipe([0.19, 0, 0.05], [0.19, 0.85, 0.05], 0.08, C.night3);
      });
    }
  }
}

/** Big steel coffee urn (sits on a table) with stacked cups, creamer, and a lit ready light. */
export function coffeeUrn(k: Kit, variant = 0): void {
  frustum(k, 0.2, 0.15, 0, 0.08, 8, C.night3);
  k.cylinder(0.17, 0.5, 8, C.concrete2, { y: 0.08 }, C.concrete1);
  k.box(0.08, 0.08, 0.08, C.night2, { y: 0.58 });
  for (const s of [-1, 1]) k.box(0.08, 0.14, 0.08, C.night2, { x: s * 0.2, y: 0.4 });
  k.box(0.08, 0.1, 0.12, C.night2, { y: 0.12, z: 0.2 });
  k.glow(() => k.box(0.08, 0.08, 0.03, C.amber2, { y: 0.3, z: 0.17 }));
  k.cylinder(0.05, 0.26, 6, C.fog2, { x: 0.36, z: 0.05 });
  k.box(0.1, 0.12, 0.08, C.fog1, { x: 0.36, z: -0.15 });
  if (vint(variant, 2) === 1) k.cylinder(0.07, 0.08, 6, C.amber1, { x: -0.34, z: 0.05 }, C.fog2);
}

/** Upright piano with sheet music, a framed photo on top, and its bench. */
export function piano(k: Kit, variant = 0): void {
  const wood = vint(variant, 2) === 0 ? C.rust0 : C.night3;
  k.box(1.5, 1.25, 0.6, wood, {}, { top: C.night3 });
  k.box(1.46, 0.12, 0.32, wood, { y: 0.68, z: 0.44 });
  k.box(1.3, 0.04, 0.22, C.fog2, { y: 0.8, z: 0.47 });
  for (let i = 0; i < 7; i++) flat(k, -0.58 + i * 0.18, 0.36, -0.5 + i * 0.18, 0.47, 0.842, C.night0);
  k.box(0.5, 0.3, 0.03, C.fog1, { y: 0.98, z: 0.33, rx: -0.2 });
  for (const x of [-0.66, 0.66]) k.box(0.1, 0.68, 0.1, wood, { x, z: 0.54 });
  for (const x of [-0.08, 0.08]) k.box(0.08, 0.04, 0.12, C.amber1, { x, y: 0.05, z: 0.36 });
  flat(k, -0.5, -0.15, 0.1, 0.15, 1.252, C.fog2);
  k.box(0.26, 0.32, 0.05, C.amber0, { x: -0.25, y: 1.25, z: -0.05 });
  decal(k, -0.35, 1.3, -0.15, 1.52, -0.024, C.skin2);
  k.at({ z: 0.98 }, () => {
    legs4(k, 0.84, 0.32, 0.48, 0.08, wood);
    k.box(0.9, 0.08, 0.38, wood, { y: 0.48 }, { top: C.night3 });
  });
}

/** Small framed photo (wall): Dolores's route-6 bus, a portrait, a landscape, or a group. */
export function framedPhoto(k: Kit, variant = 0): void {
  const v = vint(variant, 4);
  const y0 = 1.5;
  k.box(0.6, 0.46, 0.06, v === 1 ? C.night2 : C.amber0, { y: y0, z: 0.03 });
  const zf = 0.061;
  const z2 = zf + 0.001;
  decal(k, -0.25, y0 + 0.05, 0.25, y0 + 0.41, zf, C.fog1);
  if (v === 0) {
    decal(k, -0.25, y0 + 0.3, 0.25, y0 + 0.41, z2, C.fog0);
    decal(k, -0.22, y0 + 0.07, 0.22, y0 + 0.13, z2, C.concrete1);
    decal(k, -0.18, y0 + 0.13, 0.18, y0 + 0.3, z2, C.amber1);
    decal(k, -0.15, y0 + 0.21, 0.1, y0 + 0.27, z2 + 0.001, C.night1);
    decal(k, 0.12, y0 + 0.2, 0.17, y0 + 0.28, z2 + 0.001, C.fog2);
  } else if (v === 1) {
    decal(k, -0.14, y0 + 0.05, 0.14, y0 + 0.14, z2, C.slate1);
    decal(k, -0.08, y0 + 0.14, 0.08, y0 + 0.3, z2, C.skin2);
    decal(k, -0.1, y0 + 0.27, 0.1, y0 + 0.35, z2 + 0.001, C.night1);
  } else if (v === 2) {
    decal(k, -0.25, y0 + 0.05, 0.25, y0 + 0.2, z2, C.moss1);
    decal(k, -0.25, y0 + 0.2, 0.25, y0 + 0.41, z2, C.fog2);
  } else {
    decal(k, -0.22, y0 + 0.07, 0.22, y0 + 0.18, z2, C.slate0);
    const faces = [C.skin1, C.skin3, C.skin2] as const;
    faces.forEach((c, i) => decal(k, -0.17 + i * 0.12, y0 + 0.18, -0.09 + i * 0.12, y0 + 0.27, z2, c));
  }
}

/** Floor rug: a bordered rectangle with a medallion, an oval rag rug, or a striped runner. */
export function rug(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  if (v === 1) {
    const rings = [C.rust1, C.fog0, C.moss1, C.amber0] as const;
    rings.forEach((c, i) => {
      const s = 1 - i * 0.24;
      flatPoly(k, blobPts(variant, 1, 1.0 * s, 0.7 * s, 10, 0), 0.01 + i * 0.004, c);
    });
    return;
  }
  const w = v === 0 ? 2.4 : 3.0;
  const d = v === 0 ? 1.6 : 0.8;
  flat(k, -w / 2, -d / 2, w / 2, d / 2, 0.01, v === 0 ? C.rust1 : C.slate1);
  flat(k, -w / 2 + 0.12, -d / 2 + 0.12, w / 2 - 0.12, d / 2 - 0.12, 0.014, C.amber0);
  flat(k, -w / 2 + 0.24, -d / 2 + 0.24, w / 2 - 0.24, d / 2 - 0.24, 0.018, v === 0 ? C.rust0 : C.slate0);
  if (v === 0) {
    flatPoly(
      k,
      [
        [-0.5, 0],
        [0, -0.3],
        [0.5, 0],
        [0, 0.3],
      ],
      0.022,
      C.amber1,
    );
  } else {
    for (let i = 0; i < 4; i++) flat(k, -1.1 + i * 0.6, -0.16, -0.98 + i * 0.6, 0.16, 0.022, C.amber1);
  }
}

/** Bookshelf with runs of books in muted colors, a gap, and one book leaning. */
export function bookshelf(k: Kit, variant = 0): void {
  const wood = vint(variant, 2) === 0 ? C.rust1 : C.amber0;
  k.box(1.0, 1.9, 0.08, C.rust0, { z: -0.135 });
  for (const x of [-0.46, 0.46]) k.box(0.08, 1.9, 0.35, wood, { x }, { top: C.rust0 });
  k.box(1.04, 0.08, 0.38, wood, { y: 1.9 }, { top: C.rust0 });
  const levels = [0.06, 0.52, 0.98, 1.44];
  levels.forEach((y, li) => {
    k.box(0.84, 0.06, 0.33, wood, { y: y - 0.06 });
    let x = -0.4;
    for (let i = 0; i < 3 && x < 0.3; i++) {
      const w = Math.min(0.14 + 0.22 * vrand(variant, li * 13 + i), 0.4 - x);
      if (vrand(variant, li * 7 + i + 50) >= 0.15 && w > 0.08) {
        const h = 0.26 + 0.12 * vrand(variant, li * 5 + i + 3);
        k.box(w - 0.02, h, 0.26, vpick(GOODS, variant, li * 11 + i), { x: x + w / 2, y, z: 0.02 });
      }
      x += w;
    }
    if (li === 1 && x < 0.32) k.box(0.08, 0.3, 0.24, C.rust2, { x: x + 0.08, y, z: 0.02, rz: -0.35 });
  });
}

/** Tabletop radio with a glowing amber dial. */
export function radio(k: Kit, variant = 0): void {
  const body = vint(variant, 2) === 0 ? C.amber0 : C.rust1;
  k.box(0.44, 0.26, 0.2, body, {}, { top: C.rust0 });
  decal(k, -0.19, 0.04, -0.01, 0.22, 0.101, C.night2);
  k.glow(() => k.box(0.16, 0.08, 0.02, C.amber2, { x: 0.1, y: 0.15, z: 0.105 }));
  k.box(0.08, 0.08, 0.04, C.fog1, { x: 0.05, y: 0.03, z: 0.11 });
  k.box(0.08, 0.08, 0.04, C.fog1, { x: 0.16, y: 0.03, z: 0.11 });
  k.box(0.3, 0.08, 0.06, C.night2, { y: 0.26 });
  k.pipe([0.16, 0.26, -0.06], [0.3, 0.62, -0.08], 0.08, C.concrete2);
}

/** Wall clock (wall), exaggerated for readability; the variant sets the time. */
export function wallClock(k: Kit, variant = 0): void {
  const y = 2.1;
  k.at({ y, rx: Math.PI / 2 }, () => {
    k.cylinder(0.28, 0.05, 8, vint(variant, 2) === 0 ? C.amber0 : C.night2);
    k.cylinder(0.24, 0.07, 8, C.fog2);
  });
  const hour = vrand(variant, 1) * Math.PI * 2;
  const minute = vrand(variant, 2) * Math.PI * 2;
  k.at({ y, z: 0.072, rz: -hour }, () => decal(k, -0.04, -0.02, 0.04, 0.13, 0, C.night1));
  k.at({ y, z: 0.074, rz: -minute }, () => decal(k, -0.04, -0.02, 0.04, 0.2, 0, C.night1));
}

// ================================================================================================
// The Port (§11.5)
// ================================================================================================

/** Shipping container size: 6.1 m long (x), 2.6 m tall, 2.4 m wide (z). Doors on the +x end. */
export const CONTAINER_SIZE = { len: 6.1, h: 2.6, w: 2.4 } as const;

/** Muted container paints only: rust, slate, moss, concrete, amber0. */
const CONTAINER_PAINT: readonly (readonly [number, number])[] = [
  [C.rust1, C.rust0],
  [C.rust2, C.rust1],
  [C.slate1, C.slate0],
  [C.moss1, C.moss0],
  [C.concrete1, C.concrete0],
  [C.amber0, C.rust0],
];

/** Shipping container: corrugated long sides, rails and corner posts, door rods, a faded logo, rust. */
export function container(k: Kit, variant = 0): void {
  const [col, dark] = CONTAINER_PAINT[vint(variant, CONTAINER_PAINT.length)];
  const L = CONTAINER_SIZE.len;
  const H = CONTAINER_SIZE.h;
  const W = CONTAINER_SIZE.w;
  const zs = W / 2;
  k.box(L, H, W, col, {}, { top: dark });
  for (let i = 0; i < 10; i++) {
    const x = -L / 2 + 0.45 + i * 0.58;
    decal(k, x - 0.09, 0.2, x + 0.09, H - 0.2, zs + 0.005, dark);
    k.quad(
      [x + 0.09, 0.2, -zs - 0.005],
      [x - 0.09, 0.2, -zs - 0.005],
      [x - 0.09, H - 0.2, -zs - 0.005],
      [x + 0.09, H - 0.2, -zs - 0.005],
      dark,
    );
  }
  decal(k, -L / 2, 0, L / 2, 0.18, zs + 0.006, C.night3);
  decal(k, -L / 2, H - 0.16, L / 2, H, zs + 0.006, dark);
  decal(k, -L / 2, 0, -L / 2 + 0.18, H, zs + 0.007, dark);
  decal(k, L / 2 - 0.18, 0, L / 2, H, zs + 0.007, dark);
  for (let i = 0; i < 4; i++)
    k.box(0.08, H - 0.3, 0.08, C.night3, { x: L / 2 + 0.04, y: 0.15, z: -0.9 + i * 0.6 });
  decalE(k, -0.04, 0.1, 0.04, H - 0.1, L / 2 + 0.002, C.night3);
  if (vrand(variant, 3) < 0.5) decal(k, -1.6, 0.9, 0.6, 1.7, zs + 0.008, C.fog0);
  if (vrand(variant, 4) < 0.6) decal(k, 1.2, 0.3, 1.5, 2.3, zs + 0.009, C.rust0);
}

/** Containers stacked 2–3 high, slightly out of line. */
export function containerStack(k: Kit, variant = 0): void {
  const n = 2 + vint(variant, 2);
  for (let i = 0; i < n; i++) {
    const dx = (vrand(variant, i * 3) - 0.5) * 0.24;
    const dz = (vrand(variant, i * 3 + 1) - 0.5) * 0.16;
    const paint = Math.floor(vrand(variant, i * 3 + 2) * CONTAINER_PAINT.length);
    k.at({ x: dx, y: i * CONTAINER_SIZE.h, z: dz }, () =>
      container(k, paint + CONTAINER_PAINT.length * (i + 1)),
    );
  }
}

/**
 * Rubber-tyred gantry crane spanning 18 m (x): bogies, sill beams, legs with tie beams, twin girders, a
 * trolley with its operator cab, hoist ropes and spreader (variant 1 carries a container), floodlights
 * under the girders, and an amber beacon.
 */
export function gantryCrane(k: Kit, variant = 0): void {
  const v = vint(variant, 2);
  const paint = C.amber1;
  const shade = C.amber0;
  const S = 9;
  const Z = 3.5;
  const H = 15;
  for (const sx of [-1, 1]) {
    const x = sx * S;
    for (const sz of [-1, 1]) {
      const z = sz * Z;
      k.box(1.4, 0.9, 1.6, C.night3, { x, z }, { top: C.night2 });
      decal(k, x - 0.6, 0.1, x - 0.1, 0.8, z + 0.801, C.night0);
      decal(k, x + 0.1, 0.1, x + 0.6, 0.8, z + 0.801, C.night0);
      k.box(0.9, H - 1.9, 0.9, paint, { x, y: 1.9, z }, { top: shade });
    }
    k.box(1.2, 1.0, 2 * Z + 1.4, paint, { x, y: 0.9 }, { top: shade });
    decal(k, x - 0.6, 1.1, x - 0.2, 1.7, Z + 0.701, C.night1);
    decal(k, x + 0.2, 1.1, x + 0.6, 1.7, Z + 0.701, C.night1);
    k.box(0.6, 0.6, 2 * Z, paint, { x, y: 8.4 });
    k.box(1.2, 1.6, 2 * Z + 1.0, paint, { x, y: H }, { top: shade });
  }
  for (const sz of [-1, 1]) k.box(2 * S + 1.6, 1.6, 0.9, paint, { y: H, z: sz * Z }, { top: shade });
  k.box(2.8, 2.4, 2.2, C.fog1, { x: -S, y: 1.9 }, { top: C.fog0 });
  decal(k, -S - 0.4, 1.9, -S + 0.4, 3.7, 1.101, C.slate0);
  // trolley, cab, ropes, spreader
  const tx = v === 0 ? -2.5 : 3.0;
  k.box(3.6, 1.4, 2 * Z + 1.2, C.fog1, { x: tx, y: H + 1.6 }, { top: C.fog0 });
  k.box(1.6, 1.8, 1.6, C.fog1, { x: tx + 1.0, y: H - 1.9, z: Z - 0.9 }, { top: C.fog0 });
  k.glow(() => decal(k, tx + 0.35, H - 1.2, tx + 1.65, H - 0.4, Z - 0.09, C.fog0));
  const sy = v === 0 ? 7.0 : 4.6;
  for (const ox of [-1.2, 1.2]) {
    for (const oz of [-0.9, 0.9]) k.pipe([tx + ox, H + 1.6, oz], [tx + ox, sy + 0.4, oz], 0.08, C.night2);
  }
  k.box(6.3, 0.4, 2.5, C.night3, { x: tx, y: sy }, { top: shade });
  if (v === 1) k.at({ x: tx, y: sy - CONTAINER_SIZE.h }, () => container(k, 3));
  // floodlights and beacon
  for (const x of [-4, 4]) {
    k.box(0.5, 0.3, 0.4, C.night3, { x, y: H - 0.3, z: Z + 0.65 });
    k.glow(() => k.box(0.4, 0.2, 0.03, C.fog2, { x, y: H - 0.25, z: Z + 0.865 }));
    k.light({ x, y: H - 1, z: Z + 1.5, color: C.fog2, intensity: 6, range: 12 });
  }
  k.glow(() => k.cylinder(0.2, 0.3, 6, C.amber2, { y: H + 1.6, z: Z }));
  for (const x of [-S + 0.6, -S + 0.95]) k.pipe([x, 1.9, Z + 0.55], [x, H, Z + 0.55], 0.08, C.night3);
}

/** Port terminal gate: gatehouse on a striped island, a gantry over two lanes with amber lane signals and
 *  floodlights, and a lowered barrier on each lane. The scanner arch is placed separately. */
export function terminalGate(k: Kit, variant = 0): void {
  k.box(1.8, 0.25, 7.0, C.concrete1, {}, { top: C.concrete0 });
  for (let i = 0; i < 4; i++) decal(k, -0.9 + i * 0.45, 0, -0.68 + i * 0.45, 0.25, 3.501, C.amber1);
  k.box(1.5, 2.4, 2.4, C.fog1, { y: 0.25, z: -1.0 }, { top: C.fog0 });
  k.glow(() => decal(k, -0.6, 1.2, 0.6, 2.3, 0.201, C.fog0));
  decal(k, -0.7, 0.25, 0.7, 0.9, 0.201, C.slate1);
  k.box(1.9, 0.2, 2.8, C.slate1, { y: 2.65, z: -1.0 }, { top: C.slate0 });
  k.light({ x: 0, y: 2.3, z: 0.4, color: C.fog2, intensity: 3, range: 6, flicker: 0.3 });
  for (const x of [-7.2, 7.2]) k.box(0.5, 6.2, 0.5, C.concrete2, { x, z: 2.0 }, { top: C.concrete1 });
  k.box(15, 0.9, 0.6, C.concrete2, { y: 6.2, z: 2.0 }, { top: C.concrete1 });
  for (const x of [-3.6, 3.6]) {
    k.box(1.6, 0.8, 0.12, C.night2, { x, y: 5.3, z: 2.36 });
    k.glow(() => k.box(0.6, 0.5, 0.03, C.amber2, { x, y: 5.45, z: 2.435 }));
    floodHead(k, x + 1.6, 5.6, 2.4);
  }
  k.light({ x: -2, y: 5.5, z: 3.5, color: C.fog2, intensity: 6, range: 12 });
  k.light({ x: 2, y: 5.5, z: 3.5, color: C.fog2, intensity: 6, range: 12, flicker: vint(variant, 2) * 0.3 });
  for (const s of [-1, 1]) {
    k.at({ x: s * 0.6, z: 3.0, ry: s > 0 ? 0 : Math.PI }, () => {
      barrierPost(k, 1);
      k.at(BARRIER_PIVOT, () => barrierArm(k));
    });
  }
}

/** Mooring bollard: twin iron bitts with amber-painted caps; variant 1 has a line made fast to it. */
export function bollardMooring(k: Kit, variant = 0): void {
  k.box(0.9, 0.12, 0.6, C.night3, {}, { top: C.night2 });
  for (const x of [-0.25, 0.25]) {
    k.cylinder(0.16, 0.5, 8, C.night2, { x, y: 0.12 });
    k.cylinder(0.2, 0.08, 6, C.amber1, { x, y: 0.62 }, C.amber0);
  }
  if (vint(variant, 2) === 1) {
    k.pipe([0.25, 0.4, 0.2], [0.05, 0.42, -0.25], 0.12, C.amber0);
    k.pipe([0.05, 0.42, -0.25], [0.45, 0.4, -0.2], 0.12, C.amber0);
    k.pipe([0.45, 0.4, -0.2], [0.6, 1.4, -2.5], 0.12, C.amber0);
  }
}

/** Top of the gangway (where it meets the ship's deck), in the gangway's model space. */
export const GANGWAY_TOP = { y: 4.5, z: -4.6 } as const;

/**
 * Ship's gangway rising from the quay (low end at +z) to the deck (high end at -z), with handrails,
 * cleats, a landing, rollers, and the amber beacon the crew flashes (light tag 'gangway').
 */
export function gangway(k: Kit): void {
  const rise = GANGWAY_TOP.y;
  const run = 8.0;
  const len = Math.hypot(rise, run);
  k.at({ y: rise / 2 + 0.03, rx: Math.atan2(rise, run) }, () => {
    k.box(1.2, 0.15, len, C.fog0, { y: -0.15 }, { top: C.concrete2 });
    for (let i = 0; i < 9; i++) flat(k, -0.55, -len / 2 + 0.5 + i, 0.55, -len / 2 + 0.6 + i, 0.002, C.night3);
    for (const s of [-1, 1]) {
      k.pipe([s * 0.6, 1.0, -len / 2], [s * 0.6, 1.0, len / 2], 0.08, C.fog1);
      for (let i = 0; i < 3; i++) {
        const z = -len / 2 + 1.0 + i * ((len - 2) / 2);
        k.pipe([s * 0.6, 0, z], [s * 0.6, 1.0, z], 0.08, C.fog1);
      }
    }
  });
  k.box(1.6, 0.15, 1.2, C.fog0, { y: rise - 0.15, z: GANGWAY_TOP.z }, { top: C.concrete2 });
  for (const s of [-1, 1] as const) wheel(k, s * 0.5, run / 2 - 0.1, 0.12, 0.1, s, C.night1, C.night2, 6);
  k.pipe([0.7, rise, GANGWAY_TOP.z], [0.7, rise + 1.4, GANGWAY_TOP.z], 0.1, C.night3);
  k.box(0.26, 0.2, 0.26, C.night3, { x: 0.7, y: rise + 1.4, z: GANGWAY_TOP.z });
  k.glow(() => k.box(0.2, 0.2, 0.2, C.amber2, { x: 0.7, y: rise + 1.6, z: GANGWAY_TOP.z }));
  k.light({
    x: 0.7,
    y: rise + 1.7,
    z: GANGWAY_TOP.z + 0.2,
    color: C.amber2,
    intensity: 4,
    range: 8,
    tag: 'gangway',
  });
}

// ================================================================================================
// Epilogue: the voyage and Ghana (§16). Epilogue palette only.
// ================================================================================================

/** Ship's deck rail, 4 m along x (variant 1 carries a sun-orange life ring). */
export function shipDeckRail(k: Kit, variant = 0): void {
  k.box(4.0, 0.15, 0.1, E.sky4);
  for (let i = 0; i < 4; i++) k.box(0.1, 1.1, 0.1, E.sky5, { x: -1.95 + i * 1.3 });
  k.box(4.0, 0.1, 0.12, E.sky5, { y: 1.05 });
  k.box(4.0, 0.08, 0.08, E.sky5, { y: 0.7 });
  k.box(4.0, 0.08, 0.08, E.sky5, { y: 0.38 });
  if (vint(variant, 2) === 1) {
    k.at({ y: 0.62, z: 0.08, rx: Math.PI / 2 }, () => {
      k.cylinder(0.32, 0.1, 8, E.sun0);
      k.cylinder(0.16, 0.12, 8, E.sky0);
    });
  }
}

/** A row of solar panels on frames, tilted toward the sun and the camera (variants: brush, junction box). */
export function solarPanelRow(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  const n = v === 2 ? 2 : 3;
  const x0 = -((n - 1) * 2.0) / 2;
  for (let i = 0; i <= n; i++) {
    const x = x0 - 1.0 + i * 2.0;
    k.box(0.1, 0.82, 0.1, E.sky4, { x, z: 0.45 });
    k.box(0.1, 1.16, 0.1, E.sky4, { x, z: -0.45 });
  }
  for (let i = 0; i < n; i++) {
    k.at({ x: x0 + i * 2.0, y: 1.0, rx: 0.35 }, () => {
      k.box(1.95, 0.08, 1.2, E.sky4, {}, { top: E.sky1 });
      flat(k, -0.04, -0.6, 0.04, 0.6, 0.082, E.sky2);
      flat(k, -0.975, -0.04, 0.975, 0.04, 0.083, E.sky2);
    });
  }
  if (v === 1) {
    k.pipe([x0 + 1.0, 0, 0.9], [x0 + 1.2, 1.4, 0.55], 0.08, E.sun1);
    k.box(0.36, 0.12, 0.14, E.sky5, { x: x0 + 1.22, y: 1.36, z: 0.55 });
  } else if (v === 2) {
    k.box(0.3, 0.4, 0.15, E.sky5, { x: x0 + 1.0, y: 0.3, z: -0.4 });
  }
}

/** Cooperative building: plaster walls with a laterite splash band, green door and shutters, a deep
 *  veranda under a corrugated roof, a bench, a water tank, and a solar panel. */
export function coopBuilding(k: Kit, variant = 0): void {
  const v = vint(variant, 2);
  const W = 8;
  const D = 5;
  const H = 3.0;
  const zf = D / 2 + 0.01;
  k.box(W, H, D, E.sun2, {}, { top: E.earth0 });
  decal(k, -W / 2, 0, W / 2, 0.6, zf, E.earth2);
  k.at({ y: H + 0.2, z: 1.2, rx: 0.08 }, () => {
    k.box(W + 0.6, 0.15, D + 3.0, E.sky4, {}, { top: E.sky4 });
    for (let i = 0; i < 7; i++) {
      const x = -W / 2 + 0.6 + i * 1.2;
      flat(k, x - 0.05, -(D + 3.0) / 2, x + 0.05, (D + 3.0) / 2, 0.152, E.sky5);
    }
  });
  for (const x of [-3.7, -1.2, 1.2, 3.7]) k.box(0.16, 2.8, 0.16, E.earth0, { x, z: D / 2 + 2.5 });
  k.box(2.0, 0.45, 0.45, E.earth1, { x: -2.2, z: D / 2 + 0.4 }, { top: E.earth2 });
  decal(k, -0.55, 0, 0.55, 2.2, zf, E.green1);
  for (const x of [-2.2, 2.2]) {
    decal(k, x - 0.5, 1.1, x + 0.5, 2.1, zf, E.sky0);
    decal(k, x - 0.8, 1.1, x - 0.5, 2.1, zf + 0.001, E.green0);
    decal(k, x + 0.5, 1.1, x + 0.8, 2.1, zf + 0.001, E.green0);
  }
  decal(k, -1.2, 2.35, 1.2, 2.85, zf, E.sky5);
  decal(k, -1.0, 2.5, 1.0, 2.7, zf + 0.001, E.green1);
  k.box(1.4, 1.6, 1.4, E.earth1, { x: W / 2 + 1.2, z: -0.8 }, { top: E.earth0 });
  k.cylinder(0.7, 1.4, 8, v === 0 ? E.sky0 : E.sky5, { x: W / 2 + 1.2, y: 1.6, z: -0.8 }, E.sky1);
  k.at({ x: 1.8, y: H + 0.65, z: -0.6, rx: 0.3 }, () => k.box(2.0, 0.08, 1.2, E.sky4, {}, { top: E.sky1 }));
}

/** A broad shade tree on its own patch of shade (variant 1 is in fruit). */
export function shadeTree(k: Kit, variant = 0): void {
  const v = vint(variant, 2);
  const s = 0.9 + 0.3 * vrand(variant, 1);
  flatPoly(k, blobPts(variant, 2, 3.4 * s, 2.4 * s, 10, 0.2), 0.008, E.earth0);
  k.at({ s }, () => {
    k.bevelBox(0.7, 2.6, 0.6, 0.18, E.earth0);
    k.pipe([0, 2.2, 0], [-1.6, 3.4, 0.2], 0.3, E.earth0);
    k.pipe([0, 2.3, 0], [1.4, 3.6, -0.3], 0.3, E.earth0);
    blob(k, blobPts(variant, 3, 3.2, 2.5, 9), 3.0, 4.4, E.green0, E.green1, 0.85);
    k.at({ x: 0.3, z: -0.2 }, () =>
      blob(k, blobPts(variant, 4, 2.4, 1.9, 8), 4.4, 5.5, E.green1, E.green2, 0.7),
    );
    k.at({ x: -0.4, z: 0.3 }, () =>
      blob(k, blobPts(variant, 5, 1.3, 1.0, 7), 5.5, 6.1, E.green2, E.green3, 0.6),
    );
    if (v === 1) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        k.box(0.18, 0.18, 0.18, i % 2 ? E.sun0 : E.sun1, {
          x: Math.cos(a) * 2.6,
          y: 3.2,
          z: Math.sin(a) * 1.9,
        });
      }
    }
  });
}

/** Red laterite road, 8 m along z and 4 m wide, with ruts and grass tufts (variant 1 has a puddle). */
export function lateriteRoad(k: Kit, variant = 0): void {
  const L = 8;
  const W = 4;
  flat(k, -W / 2 - 0.6, -L / 2, W / 2 + 0.6, L / 2, 0.006, E.earth1);
  flat(k, -W / 2, -L / 2, W / 2, L / 2, 0.01, E.earth2);
  for (const x of [-0.9, 0.9]) flat(k, x - 0.25, -L / 2, x + 0.25, L / 2, 0.014, E.earth1);
  if (vint(variant, 2) === 1)
    k.at({ x: 0.6, z: 1.2 }, () => flatPoly(k, blobPts(variant, 1, 0.6, 0.35, 7, 0.3), 0.018, E.sky4));
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1;
    const z = -L / 2 + 0.7 + i * 1.25 + vrand(variant, i) * 0.4;
    k.box(0.3, 0.16, 0.24, i % 3 ? E.green1 : E.green2, {
      x: side * (W / 2 + 0.3 + vrand(variant, i + 9) * 0.3),
      z,
    });
  }
}

/** Ship-to-shore quay crane at Tema in warm haze: portal legs, A-frame, a boom reaching north over the
 *  water, machinery house, trolley and cab, spreader, and a sun-colored beacon. */
export function quayCrane(k: Kit, variant = 0): void {
  const paint = vint(variant, 2) === 0 ? E.sky3 : E.sun0;
  const X = 6;
  const Z = 7;
  const PH = 10;
  const BY = 18;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      k.box(1.4, 1.0, 2.0, E.sky1, { x: sx * X, z: sz * Z }, { top: E.sky0 });
      k.box(0.9, BY - 1.0, 0.9, paint, { x: sx * X, y: 1.0, z: sz * Z });
    }
    k.box(1.0, 1.4, 2 * Z + 0.9, paint, { x: sx * X, y: PH });
    k.pipe([sx * X, 2.0, -Z], [sx * X, PH, Z], 0.4, paint);
    k.pipe([sx * X, BY, -Z + 2], [sx * (X - 1.5), BY + 7, 0.5], 0.5, paint);
    k.pipe([sx * X, BY, Z], [sx * (X - 1.5), BY + 7, 0.5], 0.5, paint);
  }
  for (const sz of [-1, 1]) {
    k.box(2 * X + 0.9, 1.4, 1.0, paint, { y: PH, z: sz * Z });
    k.box(2 * X + 0.9, 1.4, 1.0, paint, { y: BY - 1.4, z: sz * Z });
  }
  k.box(2 * (X - 1.5) + 0.6, 0.8, 0.8, paint, { y: BY + 7, z: 0.5 });
  for (const sx of [-1, 1]) {
    k.box(0.8, 1.8, 40, paint, { x: sx * 1.4, y: BY, z: -7 }, { top: E.sky2 });
    k.pipe([sx * (X - 1.5), BY + 7, 0.5], [sx * 1.4, BY + 1.8, -26], 0.2, paint);
    k.pipe([sx * (X - 1.5), BY + 7, 0.5], [sx * 1.4, BY + 1.8, 12], 0.2, paint);
  }
  k.box(5, 3.4, 6, E.sky5, { y: BY + 1.8, z: 8 }, { top: E.sky4 });
  k.box(3.6, 1.4, 4, E.sky5, { y: BY - 1.4, z: -12 });
  k.box(2.0, 2.0, 2.4, E.sky5, { x: 1.0, y: BY - 3.4, z: -11 });
  decal(k, 0.1, BY - 2.6, 1.9, BY - 1.8, -9.79, E.sky0);
  for (const ox of [-1.2, 1.2]) k.pipe([ox, BY - 1.4, -12], [ox, 6.0, -12], 0.1, E.sky0);
  k.box(6.2, 0.4, 2.5, E.sky1, { y: 5.6, z: -12 });
  k.glow(() => k.cylinder(0.25, 0.4, 6, E.sun1, { y: BY + 7.8, z: 0.5 }));
}

// ================================================================================================
// Registry
// ================================================================================================

/** Triangle budget tiers. 'building' also covers structure-scale set pieces (canopies, towers, stands). */
export type PropCategory = 'small' | 'furniture' | 'vehicle' | 'building' | 'crane';

export const PROP_BUDGET: Readonly<Record<PropCategory, number>> = {
  small: 150,
  furniture: 250,
  vehicle: 600,
  building: 800,
  crane: 1200,
};

export interface PropDef {
  build: (k: Kit, variant: number) => void;
  /** Footprint [x, z] in meters (approximate, for placement and collision). */
  footprint: [number, number];
  /** Height in meters (for wall-mounted props: the top above the floor). */
  height: number;
  /** Number of distinct variants (pass 0..variants-1; larger values wrap). */
  variants: number;
  /**
   * Tags: one budget category ('small' | 'furniture' | 'vehicle' | 'building' | 'crane'), where it is used
   * ('stop', 'depot', 'diner', 'gas', 'street', 'surveillance', 'checkpoint', 'region', 'newEngland',
   * 'corridor', 'piedmont', 'lowcountry', 'station', 'port', 'epilogue'), and traits ('wall' for
   * wall-mounted, 'loot' for searchable containers, 'light', 'beacon', 'scanner', 'tree', 'cover').
   */
  tags: string[];
}

function def(
  build: (k: Kit, variant: number) => void,
  footprint: [number, number],
  height: number,
  variants: number,
  tags: string[],
): PropDef {
  return { build, footprint, height, variants, tags };
}

const DEFS = {
  // Stops
  chargingBay: def(chargingBay, [1.1, 0.75], 1.84, 3, ['stop', 'depot', 'furniture']),
  evCharger: def(evCharger, [0.85, 0.6], 1.92, 2, ['stop', 'gas', 'furniture']),
  idKiosk: def(idKiosk, [0.8, 0.6], 2.0, 2, ['stop', 'depot', 'scanner', 'furniture']),
  shelf: def(shelf, [1.0, 0.9], 1.8, 4, ['stop', 'depot', 'gas', 'loot', 'furniture']),
  register: def(register, [1.06, 0.66], 1.65, 2, ['stop', 'depot', 'gas', 'loot', 'furniture']),
  counter: def(counter, [1.02, 0.72], 1.36, 4, ['stop', 'diner', 'furniture']),
  boothSeat: def(boothSeat, [1.26, 0.6], 1.2, 3, ['stop', 'diner', 'furniture']),
  dinerTable: def(dinerTable, [0.8, 1.2], 0.98, 3, ['stop', 'diner', 'loot', 'furniture']),
  boothSet: def(boothSet, [2.1, 1.26], 1.2, 3, ['stop', 'diner', 'loot', 'furniture']),
  stool: def(stool, [0.42, 0.42], 0.74, 4, ['stop', 'diner', 'small']),
  chair: def(chair, [0.46, 0.46], 0.98, 3, ['stop', 'small']),
  coffeeMachine: def(coffeeMachine, [0.52, 0.4], 0.64, 2, ['stop', 'diner', 'small']),
  menuBoard: def(menuBoard, [3.16, 0.5], 3.6, 2, ['stop', 'diner', 'wall', 'furniture']),
  wallTv: def(wallTv, [1.18, 0.3], 2.84, 2, ['stop', 'diner', 'wall', 'small']),
  gasPump: def(gasPump, [1.7, 0.9], 2.01, 3, ['stop', 'gas', 'furniture']),
  canopy: def(canopy, [8, 6], 5.3, 2, ['stop', 'gas', 'light', 'building']),
  canopyPosts: def(canopyPosts, [5.7, 3.7], 4.75, 1, ['stop', 'gas', 'furniture']),
  canopyRoof: def(canopyRoof, [8, 6], 5.3, 2, ['stop', 'gas', 'light', 'furniture']),
  lockers: def(lockers, [1.0, 0.5], 1.9, 4, ['stop', 'depot', 'loot', 'furniture']),
  partsBin: def(partsBin, [1.0, 0.5], 1.4, 3, ['stop', 'depot', 'gas', 'loot', 'furniture']),
  vendingMachine: def(vendingMachine, [1.0, 0.8], 1.9, 3, ['stop', 'depot', 'gas', 'light', 'furniture']),
  securityCamera: def(securityCamera, [0.3, 0.7], 3.05, 1, ['stop', 'surveillance', 'wall', 'small']),
  securityCameraMount: def(securityCameraMount, [0.22, 0.4], 3.04, 1, [
    'stop',
    'surveillance',
    'wall',
    'small',
  ]),
  securityCameraHead: def(securityCameraHead, [0.3, 0.7], 0.3, 1, ['stop', 'surveillance', 'small']),
  mechanicBench: def(mechanicBench, [2.0, 0.8], 2.75, 2, [
    'stop',
    'depot',
    'gas',
    'loot',
    'light',
    'furniture',
  ]),
  grill: def(grill, [1.2, 0.75], 1.26, 2, ['stop', 'diner', 'furniture']),
  fridge: def(fridge, [0.9, 0.8], 2.1, 3, ['stop', 'station', 'loot', 'furniture']),
  sinkCounter: def(sinkCounter, [1.24, 0.64], 1.44, 2, ['stop', 'station', 'furniture']),
  trashCan: def(trashCan, [0.62, 0.62], 1.05, 4, ['stop', 'street', 'small']),
  boxes: def(boxes, [1.4, 1.0], 1.0, 4, ['stop', 'street', 'loot', 'small']),
  mopBucket: def(mopBucket, [1.0, 0.5], 1.45, 2, ['stop', 'small']),
  restroomSign: def(restroomSign, [0.62, 0.08], 1.92, 3, ['stop', 'wall', 'small']),
  corkboard: def(corkboard, [1.32, 0.12], 2.06, 3, ['stop', 'diner', 'gas', 'wall', 'small']),
  // Street
  dumpster: def(dumpster, [2.1, 1.3], 2.4, 3, ['street', 'cover', 'furniture']),
  trashBags: def(trashBags, [1.4, 1.1], 0.5, 3, ['street', 'small']),
  pallet: def(pallet, [1.2, 1.0], 0.45, 3, ['street', 'small']),
  jerseyBarrier: def(jerseyBarrier, [2.0, 0.6], 0.81, 4, ['street', 'surveillance', 'cover', 'small']),
  trafficCone: def(trafficCone, [0.42, 0.42], 0.72, 3, ['street', 'small']),
  streetlamp: def(streetlamp, [0.4, 1.9], 6.5, 4, ['street', 'light', 'furniture']),
  powerPole: def(powerPole, [2.2, 0.4], 9.4, 3, ['street', 'furniture']),
  billboard: def(billboard, [8.4, 1.2], 8.85, 3, ['street', 'light', 'building']),
  wreckedCar: def(wreckedCar, [1.9, 4.6], 1.42, 3, ['street', 'cover', 'vehicle']),
  fenceSegment: def(fenceSegment, [2.0, 0.3], 2.4, 3, ['street', 'small']),
  snowbank: def(snowbank, [3.2, 1.6], 1.0, 2, ['street', 'newEngland', 'small']),
  bench: def(bench, [1.8, 0.5], 0.95, 3, ['street', 'small']),
  newsBox: def(newsBox, [0.5, 0.45], 1.14, 6, ['street', 'small']),
  hydrant: def(hydrant, [0.4, 0.4], 0.84, 3, ['street', 'small']),
  mailbox: def(mailbox, [0.54, 0.5], 1.26, 2, ['street', 'small']),
  bollard: def(bollard, [0.32, 0.32], 1.0, 3, ['street', 'small']),
  puddle: def(puddle, [3.2, 2.0], 0.02, 4, ['street', 'port', 'small']),
  // Surveillance
  checkpointBooth: def(checkpointBooth, [2.8, 2.6], 2.9, 2, [
    'surveillance',
    'checkpoint',
    'light',
    'building',
  ]),
  scannerArch: def(scannerArch, [3.0, 0.9], 3.1, 2, [
    'surveillance',
    'checkpoint',
    'port',
    'scanner',
    'furniture',
  ]),
  floodlightTower: def(floodlightTower, [3.2, 4.6], 10.8, 2, [
    'surveillance',
    'checkpoint',
    'light',
    'building',
  ]),
  scannerTowerBase: def(scannerTowerBase, [2.7, 2.7], 13.1, 1, ['surveillance', 'building']),
  scannerTowerHead: def(scannerTowerHead, [0.9, 1.4], 1.7, 1, ['surveillance', 'scanner', 'small']),
  barrierPost: def(barrierPost, [0.6, 0.6], 1.27, 2, ['surveillance', 'checkpoint', 'small']),
  barrierArm: def(barrierArm, [4.95, 0.14], 0.14, 1, ['surveillance', 'checkpoint', 'small']),
  boothConsole: def(boothConsole, [1.4, 0.6], 1.42, 2, ['surveillance', 'checkpoint', 'furniture']),
  // Regional dressing
  millBuilding: def(millBuilding, [22.4, 15], 22.6, 3, ['region', 'newEngland', 'light', 'building']),
  tripleDecker: def(tripleDecker, [8, 13], 11.9, 5, ['region', 'newEngland', 'building']),
  snowPlowedLot: def(snowPlowedLot, [10, 6], 2.5, 2, ['region', 'newEngland', 'building']),
  overpass: def(overpass, [10, 9], 7.2, 2, ['region', 'corridor', 'building']),
  soundWall: def(soundWall, [4.35, 0.4], 4.7, 3, ['region', 'corridor', 'furniture']),
  tollBooth: def(tollBooth, [5, 6], 6.1, 2, ['region', 'corridor', 'light', 'building']),
  pineTree: def(pineTree, [3.8, 3.8], 11, 4, ['region', 'piedmont', 'tree', 'small']),
  pineStand: def(pineStand, [9.2, 6.6], 12, 3, ['region', 'piedmont', 'tree', 'building']),
  feedStore: def(feedStore, [8.4, 13.4], 7.4, 2, ['region', 'piedmont', 'light', 'building']),
  tobaccoBarn: def(tobaccoBarn, [9, 6.8], 9.8, 2, ['region', 'piedmont', 'building']),
  waterTower: def(waterTower, [6, 6], 17.5, 2, ['region', 'piedmont', 'building']),
  palmetto: def(palmetto, [3.6, 3.6], 7.5, 4, ['region', 'lowcountry', 'tree', 'small']),
  liveOak: def(liveOak, [14, 8], 6.2, 3, ['region', 'lowcountry', 'tree', 'building']),
  swampWater: def(swampWater, [10, 7], 1.3, 2, ['region', 'lowcountry', 'building']),
  stripMall: def(stripMall, [24.4, 13], 5.7, 3, ['region', 'lowcountry', 'light', 'building']),
  stiltHouse: def(stiltHouse, [8.8, 12], 8.4, 4, ['region', 'lowcountry', 'building']),
  // Stations
  kitchenTable: def(kitchenTable, [1.4, 0.9], 1.02, 3, ['station', 'loot', 'furniture']),
  kitchenChairs: def(kitchenChairs, [2.4, 2.4], 1.08, 3, ['station', 'furniture']),
  stove: def(stove, [0.76, 0.7], 1.14, 2, ['station', 'furniture']),
  kitchenCounter: def(kitchenCounter, [1.24, 0.64], 2.2, 3, ['station', 'loot', 'furniture']),
  beaconWindow: def(beaconWindow, [1.9, 0.3], 2.5, 3, ['station', 'wall', 'beacon', 'furniture']),
  floorLamp: def(floorLamp, [0.56, 0.56], 1.7, 3, ['station', 'light', 'small']),
  tableLamp: def(tableLamp, [0.4, 0.4], 0.6, 2, ['station', 'light', 'small']),
  feedSacks: def(feedSacks, [1.2, 1.0], 0.8, 2, ['station', 'piedmont', 'furniture']),
  feedShelf: def(feedShelf, [2.0, 0.6], 2.0, 2, ['station', 'loot', 'furniture']),
  officeDesk: def(officeDesk, [1.5, 0.75], 1.3, 3, ['station', 'stop', 'loot', 'light', 'furniture']),
  foldingTable: def(foldingTable, [1.8, 0.75], 0.9, 3, ['station', 'furniture']),
  foldingChairs: def(foldingChairs, [1.5, 0.6], 0.98, 3, ['station', 'furniture']),
  coffeeUrn: def(coffeeUrn, [0.8, 0.4], 0.66, 2, ['station', 'small']),
  piano: def(piano, [1.5, 1.2], 1.6, 2, ['station', 'furniture']),
  framedPhoto: def(framedPhoto, [0.6, 0.08], 1.96, 4, ['station', 'wall', 'small']),
  rug: def(rug, [3.0, 1.6], 0.03, 3, ['station', 'small']),
  bookshelf: def(bookshelf, [1.04, 0.38], 1.98, 2, ['station', 'furniture']),
  radio: def(radio, [0.44, 0.2], 0.62, 2, ['station', 'small']),
  wallClock: def(wallClock, [0.56, 0.08], 2.38, 4, ['station', 'wall', 'small']),
  // The Port
  container: def(container, [6.1, 2.4], 2.6, 6, ['port', 'cover', 'furniture']),
  containerStack: def(containerStack, [6.3, 2.6], 7.8, 4, ['port', 'cover', 'building']),
  gantryCrane: def(gantryCrane, [20, 8.8], 18, 2, ['port', 'cover', 'light', 'crane']),
  terminalGate: def(terminalGate, [15, 7], 7.1, 1, ['port', 'light', 'building']),
  bollardMooring: def(bollardMooring, [0.9, 0.6], 0.7, 2, ['port', 'small']),
  gangway: def(gangway, [1.6, 9.2], 6.1, 1, ['port', 'light', 'furniture']),
  // Epilogue (epilogue palette)
  shipDeckRail: def(shipDeckRail, [4.0, 0.2], 1.15, 2, ['epilogue', 'small']),
  solarPanelRow: def(solarPanelRow, [6.1, 1.2], 1.25, 3, ['epilogue', 'furniture']),
  coopBuilding: def(coopBuilding, [10.6, 8], 3.8, 2, ['epilogue', 'building']),
  shadeTree: def(shadeTree, [7, 5], 6.2, 2, ['epilogue', 'tree', 'furniture']),
  lateriteRoad: def(lateriteRoad, [5.2, 8], 0.02, 2, ['epilogue', 'small']),
  quayCrane: def(quayCrane, [13, 40], 26, 2, ['epilogue', 'crane']),
} satisfies Record<string, PropDef>;

/** Every prop id. */
export type PropId = keyof typeof DEFS;

export const PROPS: Record<PropId, PropDef> = DEFS;

export const PROP_IDS = Object.keys(PROPS) as PropId[];

/** The budget category of a prop (from its tags). */
export function propCategory(d: PropDef): PropCategory {
  for (const t of d.tags) {
    if (t === 'small' || t === 'furniture' || t === 'vehicle' || t === 'building' || t === 'crane') return t;
  }
  return 'small';
}

/** Build a prop by id into a kit (at the kit's current transform). */
export function buildProp(k: Kit, id: PropId, variant = 0): void {
  PROPS[id].build(k, variant);
}
