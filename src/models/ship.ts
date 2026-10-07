/**
 * The Sankofa (spec §5.4, §11.5, §16.1): a mid-size cargo ship with a dark hull, a fog-white superstructure
 * aft, warm amber deck lights, containers forward, two deck cranes, and a lifeboat. The bow points east
 * (+x) and the stern west (-x); the origin is at the waterline amidships, and the hull reaches 1.5 m below
 * it so a bobbing ship never shows a gap.
 *
 * The camera looks north at the ship's south side, so the name board sits on the south hull at the stern
 * quarter (the transom faces west and would be edge-on). SANKOFA_NAME_ANCHOR gives that flat rectangle
 * for a `shipNameCanvas()` quad (signs.ts); nothing else is painted there.
 *
 * `shipDeck()` is a section of deck for the voyage scene, in the epilogue palette: the sunrise is where
 * warm color returns.
 */
import type { Kit } from './kit';
import { C, E } from '../render/palettes';
import { decal, flat, type FaceAnchor, type P2 } from './props';

export const SANKOFA_LENGTH = 64;
export const SANKOFA_BEAM = 12;
/** Height of the main deck above the waterline (where the gangway lands). */
export const SANKOFA_DECK_Y = 6.5;

/**
 * Flat rectangle on the south hull at the stern quarter for the "SANKOFA — TEMA" texture (model space,
 * facing +z). `shipNameCanvas()` is 216 × 20 px, about one pixel per screen texel on this 9 × 1.4 m face.
 */
export const SANKOFA_NAME_ANCHOR: FaceAnchor & { normal: readonly [number, number, number] } = {
  x: -23.5,
  y: 4.3,
  z: 6.03,
  w: 9,
  h: 1.4,
  normal: [0, 0, 1],
};

/** Hull outline seen from above ([x, z]): square stern, parallel sides, a pointed bow. */
const HULL: readonly P2[] = [
  [-32, -5.2],
  [-31, -6],
  [20, -6],
  [27, -4],
  [32, 0],
  [27, 4],
  [20, 6],
  [-31, 6],
  [-32, 5.2],
];

const FORECASTLE: readonly P2[] = [
  [22, -5.43],
  [27, -4],
  [32, 0],
  [27, 4],
  [22, 5.43],
];

/** Muted container paints (side, top). */
const CARGO: readonly (readonly [number, number])[] = [
  [C.rust1, C.rust0],
  [C.slate1, C.slate0],
  [C.moss1, C.moss0],
  [C.concrete1, C.concrete0],
  [C.amber0, C.rust0],
  [C.rust2, C.rust1],
];

/** A quad on the hull face between outline points a and b (from t0 to t1 along it), pushed out by 0.02. */
function hullDecal(
  k: Kit,
  a: P2,
  b: P2,
  t0: number,
  t1: number,
  y0: number,
  y1: number,
  color: number,
): void {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const nx = (-dz / len) * 0.02;
  const nz = (dx / len) * 0.02;
  const p0: [number, number] = [a[0] + dx * t0 + nx, a[1] + dz * t0 + nz];
  const p1: [number, number] = [a[0] + dx * t1 + nx, a[1] + dz * t1 + nz];
  k.quad([p0[0], y0, p0[1]], [p1[0], y0, p1[1]], [p1[0], y1, p1[1]], [p0[0], y1, p0[1]], color);
}

/** The Sankofa, bow east. About 64 m long; see the module comment for its anchors. */
export function sankofa(k: Kit): void {
  const D = SANKOFA_DECK_Y;
  // hull: antifouling, dark topsides, a slate sheer strake; the deck is painted moss
  k.prism(HULL, -1.5, 0.6, C.rust0);
  k.prism(HULL, 0.6, D - 0.6, C.night2);
  k.prism(HULL, D - 0.6, D, C.slate0, undefined, C.moss0);
  k.prism(FORECASTLE, D, D + 1.7, C.night2, undefined, C.moss0);
  // draft marks at bow and stern, anchor and hawse on the bow's south flare
  for (const x of [17, -30.4]) {
    for (let i = 0; i < 3; i++) decal(k, x, 0.9 + i, x + 0.3, 1.1 + i, 6.012, C.fog1);
  }
  hullDecal(k, [27, 4], [20, 6], 0.25, 0.42, 4.6, 5.6, C.night0);
  k.box(0.6, 0.9, 0.2, C.night1, { x: 24.4, y: 3.9, z: 5.0, ry: 0.279 });
  // superstructure aft: three accommodation decks, the bridge with wings, funnel, mast, lifeboat
  const sx = -26;
  k.box(10, 8.1, 10.4, C.fog1, { x: sx, y: D }, { top: C.fog0 });
  k.box(8, 2.6, 13.2, C.fog2, { x: sx + 1, y: D + 8.1 }, { top: C.fog0 });
  k.box(8.4, 0.3, 13.6, C.fog1, { x: sx + 1, y: D + 10.7 }, { top: C.slate1 });
  const zs = 5.2 + 0.01;
  const lit = [2, 6, 7, 11, 13];
  for (let d = 0; d < 3; d++) {
    const y0 = D + 1.0 + d * 2.7;
    decal(k, sx - 5, y0 - 0.45, sx + 5, y0 - 0.33, zs, C.slate1);
    for (let i = 0; i < 5; i++) {
      const x = sx - 3.6 + i * 1.8;
      const n = d * 5 + i;
      if (lit.includes(n))
        k.glow(() => decal(k, x - 0.45, y0, x + 0.45, y0 + 0.9, zs, n % 2 ? C.amber1 : C.amber2));
      else decal(k, x - 0.45, y0, x + 0.45, y0 + 0.9, zs, C.night1);
    }
  }
  decal(k, sx - 2.6, D + 8.9, sx + 4.6, D + 10.0, 6.6 + 0.01, C.night0);
  k.glow(() => decal(k, sx + 1.2, D + 9.1, sx + 2.2, D + 9.6, 6.6 + 0.012, C.amber0));
  k.quad(
    [sx + 5.01, D + 8.9, 6.4],
    [sx + 5.01, D + 8.9, -6.4],
    [sx + 5.01, D + 10.0, -6.4],
    [sx + 5.01, D + 10.0, 6.4],
    C.night0,
  );
  k.bevelBox(3.2, 6.5, 2.8, 0.7, C.slate1, { x: sx - 3.2, y: D + 10.7 }, C.night0);
  k.bevelBox(3.3, 0.9, 2.9, 0.72, C.amber0, { x: sx - 3.2, y: D + 14.9 }, C.amber0);
  const mx = sx + 2;
  k.pipe([mx, D + 11, 0], [mx, D + 17, 0], 0.2, C.fog2);
  k.box(3, 0.15, 0.15, C.fog2, { x: mx, y: D + 15.5 });
  k.box(2.4, 0.15, 0.3, C.night3, { x: mx, y: D + 12.6, ry: 0.4 });
  k.glow(() => {
    k.box(0.24, 0.24, 0.24, C.amber2, { x: mx, y: D + 17 });
    k.box(0.16, 0.16, 0.16, C.fog2, { x: mx + 1.4, y: D + 15.65 });
  });
  k.light({ x: mx, y: D + 17, z: 0.5, color: C.amber2, intensity: 3, range: 8 });
  k.bevelBox(6, 1.5, 2.0, 0.7, C.amber1, { x: sx, y: D + 5.3, z: 6.4 }, C.amber0);
  for (const x of [sx - 2.4, sx + 2.4]) {
    k.pipe([x, D + 4.0, 5.2], [x, D + 7.4, 5.9], 0.16, C.fog1);
    k.pipe([x, D + 7.4, 5.9], [x, D + 6.9, 6.6], 0.16, C.fog1);
  }
  // warm floodlights on the superstructure front, lighting the cargo deck
  for (const z of [-4.4, 4.4]) {
    k.box(0.4, 0.3, 0.4, C.night3, { x: sx + 5.2, y: D + 7.6, z });
    k.glow(() => k.box(0.08, 0.22, 0.3, C.amber2, { x: sx + 5.44, y: D + 7.64, z }));
  }
  k.light({ x: sx + 7, y: D + 7, z: 0, color: C.amber2, intensity: 6, range: 14 });
  // cargo: five container bays with two deck cranes between them
  const bays: readonly (readonly [number, number])[] = [
    [-15.95, 3],
    [-9.6, 2],
    [-0.9, 2],
    [5.45, 2],
    [14.15, 3],
  ];
  bays.forEach(([bx, tiers], b) => {
    for (let t = 0; t < tiers; t++) {
      const y = D + t * 2.6;
      if (t === tiers - 1) {
        for (const [i, z] of [
          [0, -2.4],
          [1, 2.4],
        ] as const) {
          const [col, top] = CARGO[(b * 3 + t + i * 2) % CARGO.length];
          k.box(6.1, 2.6, 4.8, col, { x: bx, y, z }, { top });
        }
      } else {
        const [col, top] = CARGO[(b * 3 + t) % CARGO.length];
        k.box(6.1, 2.6, 9.6, col, { x: bx, y }, { top });
      }
      const [, rib] = CARGO[(b * 3 + t + 2) % CARGO.length];
      for (let r = 0; r < 3; r++)
        decal(k, bx - 2.2 + r * 2.0, y + 0.3, bx - 2.0 + r * 2.0, y + 2.3, 4.81, rib);
    }
    flat(k, bx - 3.05, -0.04, bx + 3.05, 0.04, D + tiers * 2.6 + 0.004, C.night3);
  });
  for (const [cx, dir] of [
    [-5.25, 1],
    [9.8, -1],
  ] as const) {
    k.cylinder(0.9, 4.5, 8, C.amber1, { x: cx, y: D }, C.amber0);
    k.box(2.0, 2.0, 2.2, C.amber1, { x: cx, y: D + 4.5 }, { top: C.amber0 });
    decal(k, cx - 0.7, D + 5.4, cx + 0.7, D + 6.2, 1.111, C.night1);
    const tip = cx + dir * 9;
    k.pipe([cx + dir * 0.6, D + 6.0, 0.6], [tip, D + 15, 0.6], 0.5, C.amber1);
    k.pipe([tip, D + 15, 0.6], [tip, D + 11.5, 0.6], 0.08, C.night2);
    k.box(0.3, 0.3, 0.3, C.night3, { x: tip, y: D + 11.2, z: 0.6 });
  }
  // deck lights along the south rail, the rail itself, and the bow mast
  for (const x of [-15, -5, 5, 15]) {
    k.pipe([x, D, 5.6], [x, D + 2.5, 5.6], 0.12, C.slate1);
    k.glow(() => k.box(0.3, 0.3, 0.3, C.amber2, { x, y: D + 2.4, z: 5.6 }));
    k.light({ x, y: D + 2.3, z: 6.2, color: C.amber2, intensity: 5, range: 10 });
  }
  k.pipe([-31, D + 1.1, 5.85], [20, D + 1.1, 5.85], 0.08, C.fog1);
  for (let x = -30; x <= 18; x += 6) k.pipe([x, D, 5.85], [x, D + 1.1, 5.85], 0.08, C.fog1);
  k.pipe([29, D + 1.7, 0], [29, D + 8, 0], 0.2, C.fog2);
  k.glow(() => k.box(0.24, 0.24, 0.24, C.amber2, { x: 29, y: D + 8 }));
  k.box(1.6, 0.8, 1.2, C.night3, { x: 25.5, y: D + 1.7 }, { top: C.night2 });
  for (const z of [-2.2, 2.2]) k.cylinder(0.25, 0.5, 6, C.night3, { x: 27, y: D + 1.7, z }, C.amber0);
  // mooring winches on the stern deck
  for (const z of [-3, 3]) k.box(1.4, 0.8, 1.0, C.night3, { x: -30, y: D, z }, { top: C.slate0 });
}

// ------------------------------------------------------------------------------------------------
// Voyage deck (epilogue palette)
// ------------------------------------------------------------------------------------------------

/** A 16 m rail along x at depth z: posts every 2 m, three rails, and a kick plate. */
function deckRail(k: Kit, z: number): void {
  k.box(16, 0.15, 0.1, E.sky4, { z });
  for (let i = 0; i <= 8; i++) k.box(0.1, 1.1, 0.1, E.sky5, { x: -8 + i * 2, z });
  k.box(16, 0.1, 0.12, E.sky5, { y: 1.05, z });
  k.box(16, 0.08, 0.08, E.sky5, { y: 0.7, z });
  k.box(16, 0.08, 0.08, E.sky5, { y: 0.38, z });
}

/**
 * A 16 × 10 m section of the Sankofa's deck for the voyage (§16.1), origin at the deck surface. The north
 * rail is where the party stands looking out to sea; the south edge drops away as the ship's side. Hatch
 * covers, a mast with a warm light (tag 'mast'), bollards, vents, a coil of line, and a life ring.
 */
export function shipDeck(k: Kit): void {
  const L = 16;
  const W = 10;
  k.box(L, 0.4, W, E.sky1, { y: -0.4 }, { top: E.green0 });
  k.box(L, 2.2, 0.4, E.sky0, { y: -2.6, z: W / 2 + 0.2 }, { top: E.sky1 });
  for (let i = 1; i < 4; i++)
    flat(k, -L / 2, -W / 2 + i * 2.5 - 0.04, L / 2, -W / 2 + i * 2.5 + 0.04, 0.003, E.sky1);
  deckRail(k, -W / 2 + 0.1);
  deckRail(k, W / 2 - 0.1);
  for (const x of [-4.2, 3.4]) {
    k.box(5.0, 0.7, 4.4, E.sky2, { x, z: 0.6 }, { top: E.sky1 });
    for (let i = 0; i < 4; i++) {
      const z = -1.0 + i * 0.9;
      flat(k, x - 2.5, z - 0.05, x + 2.5, z + 0.05, 0.703, E.sky2);
    }
  }
  // mast with a warm light
  k.pipe([7.2, 0, -2.6], [7.2, 8.5, -2.6], 0.22, E.sky5);
  k.box(2.4, 0.14, 0.14, E.sky5, { x: 7.2, y: 7.2, z: -2.6 });
  k.glow(() => k.box(0.3, 0.3, 0.3, E.sun1, { x: 7.2, y: 8.5, z: -2.6 }));
  k.light({ x: 7.2, y: 8.4, z: -2.2, color: E.sun1, intensity: 4, range: 10, tag: 'mast' });
  // bollards, vents, a coil of line
  for (const x of [-6.6, 6.0]) {
    k.cylinder(0.18, 0.45, 6, E.sky0, { x: x - 0.3, z: -3.6 }, E.sky1);
    k.cylinder(0.18, 0.45, 6, E.sky0, { x: x + 0.3, z: -3.6 }, E.sky1);
  }
  for (const x of [-7.2, 0.0]) {
    k.cylinder(0.12, 0.6, 6, E.sky5, { x, z: 3.9 });
    k.cylinder(0.3, 0.18, 6, E.sky5, { x, y: 0.6, z: 3.9 }, E.sky4);
  }
  k.cylinder(0.45, 0.16, 8, E.earth1, { x: 5.0, z: 3.6 }, E.earth2);
  // life ring on the south rail, facing the camera
  k.at({ x: -2.0, y: 0.62, z: W / 2 - 0.02, rx: Math.PI / 2 }, () => {
    k.cylinder(0.32, 0.1, 8, E.sun0);
    k.cylinder(0.16, 0.12, 8, E.sky0);
  });
}
