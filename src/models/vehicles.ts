/**
 * Vehicles (spec §5.4): the party's station wagon, the Recycler van (its light bar is a separate model),
 * parked cars, the port's yard truck, and the patrol drone.
 *
 * Built along z with the front at +z (south, toward the camera) and the origin at the bottom center; the
 * scene rotates them for other headings. Color rules (§4.5): headlights are fog-white glow and taillights
 * dim amber, never red. Alarm red appears only on the Recycler light bar while it is on (ALERT); scanner
 * cyan only on the drone's lens.
 */
import type { Kit } from './kit';
import { C } from '../render/palettes';
import { SEDAN, carBody, container, decal, flat, vint, vrand, wheel, type CarShape } from './props';

/** A rectangle painted on a vehicle's flanks (x = ±halfW): side 1 = east only, -1 = west only, 0 = both. */
function flank(
  k: Kit,
  halfW: number,
  z0: number,
  z1: number,
  y0: number,
  y1: number,
  color: number,
  side: -1 | 0 | 1 = 0,
): void {
  if (side >= 0) k.quad([halfW, y0, z1], [halfW, y0, z0], [halfW, y1, z0], [halfW, y1, z1], color);
  if (side <= 0) k.quad([-halfW, y0, z0], [-halfW, y0, z1], [-halfW, y1, z1], [-halfW, y1, z0], color);
}

/** A rectangle on a vehicle's rear (facing -z) at depth z. */
function rearDecal(k: Kit, x0: number, y0: number, x1: number, y1: number, z: number, color: number): void {
  k.quad([x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z], color);
}

/** Head- and taillights on the lower body: fog-white heads, dim amber tails (glowing when `lit`). */
function carLamps(k: Kit, s: CarShape, lit: boolean, headX: number, tailX: number): void {
  const L = s.len / 2;
  const y = s.belt - 0.36;
  const lamps = (): void => {
    for (const sx of [-1, 1]) {
      k.box(0.32, 0.16, 0.04, lit ? C.fog2 : C.fog0, { x: sx * headX, y, z: L + 0.01 });
      k.box(0.24, 0.18, 0.04, C.amber0, { x: sx * tailX, y, z: -L - 0.01 });
    }
  };
  if (lit) k.glow(lamps);
  else lamps();
  decal(k, -headX + 0.22, y - 0.04, headX - 0.22, y + 0.2, L + 0.005, C.night2);
}

// ------------------------------------------------------------------------------------------------
// The party car
// ------------------------------------------------------------------------------------------------

export interface WagonOpts {
  /** The mismatched rusty rear door on the passenger (east) side. Default true. */
  doorRust?: boolean;
  /** Tailgate swung up (camp scene). */
  hatchOpen?: boolean;
  /** Headlights and taillights on (default true): glow plus a 'headlight' light. */
  lights?: boolean;
}

/** The party's station wagon proportions: long roof, near-vertical tailgate. */
export const WAGON: CarShape = {
  len: 4.9,
  wid: 1.86,
  ride: 0.32,
  belt: 0.98,
  roof: 1.5,
  hood: 1.05,
  wind: 0.32,
  rear: -2.12,
  tail: -2.25,
  wheelR: 0.34,
  wheelbase: 2.9,
  inset: 0.1,
};

/**
 * The party car (§5.4): a beat-up, boxy station wagon in faded olive with faux-wood sides, a roof rack
 * loaded with a tarp bundle and a suitcase, one mismatched rusty door, a primer patch, a missing hubcap,
 * fog-white headlights, and dim amber taillights.
 */
export function stationWagon(k: Kit, opts: WagonOpts = {}): void {
  const s = WAGON;
  const doorRust = opts.doorRust ?? true;
  const lit = opts.lights ?? true;
  const L = s.len / 2;
  const hw = s.wid / 2 + 0.005;
  carBody(k, s, {
    body: C.moss2,
    roof: C.moss1,
    glass: C.night1,
    trim: C.night3,
    tire: C.night0,
    hub: C.concrete2,
    rear: opts.hatchOpen ? C.night0 : C.night1,
  });
  // faux-wood sides, door seam, and the mismatched rusty rear door
  flank(k, hw, -2.1, 1.9, 0.48, 0.84, C.amber0);
  flank(k, hw + 0.002, 0.15, 0.23, 0.36, 0.97, C.moss0);
  if (doorRust) {
    flank(k, hw + 0.003, -0.95, 0.15, 0.36, 0.97, C.rust1, 1);
    flank(k, hw + 0.006, -0.7, -0.35, 0.55, 0.75, C.rust2, 1);
    flank(k, hw + 0.006, -0.2, 0.05, 0.4, 0.6, C.rust0, 1);
  }
  // a dent and a primer patch on the hood
  flat(k, 0.15, 1.35, 0.6, 1.75, s.belt + 0.003, C.moss1);
  flat(k, -0.75, 1.9, -0.4, 2.15, s.belt + 0.003, C.concrete1);
  // roof rack with a tarp bundle and a suitcase
  const y = s.roof;
  for (const x of [-0.78, 0.78]) k.box(0.08, 0.1, 2.3, C.night3, { x, y, z: -0.95 });
  for (const z of [-0.2, -1.7]) k.box(1.7, 0.08, 0.08, C.night3, { y: y + 0.1, z });
  k.bevelBox(1.3, 0.4, 1.5, 0.16, C.amber0, { y: y + 0.18, z: -1.0, ry: 0.06 }, C.amber1);
  for (const z of [-0.6, -1.4]) flat(k, -0.62, z - 0.05, 0.62, z + 0.05, y + 0.585, C.night3);
  k.box(0.55, 0.28, 0.42, C.rust1, { x: 0.35, y: y + 0.18, z: 0.18, ry: -0.2 }, { top: C.rust2 });
  // the missing hubcap (front left)
  k.at({ x: -(s.wid / 2 - 0.1) + 0.12, y: s.wheelR, z: s.wheelbase / 2, rz: Math.PI / 2 }, () =>
    k.cylinder(s.wheelR * 0.52, 0.29, 6, C.night2),
  );
  carLamps(k, s, lit, 0.62, 0.7);
  if (lit) k.light({ x: 0, y: 0.7, z: L + 1.2, color: C.fog2, intensity: 4, range: 9, tag: 'headlight' });
  if (opts.hatchOpen) {
    const cw = s.wid - 2 * s.inset;
    k.at({ y: s.roof, z: s.rear, rx: 1.875 }, () => {
      k.box(cw, 0.9, 0.08, C.moss2, { y: -0.9 });
      k.box(cw - 0.3, 0.45, 0.04, C.night1, { y: -0.6, z: -0.05 });
    });
  }
}

// ------------------------------------------------------------------------------------------------
// Recyclers
// ------------------------------------------------------------------------------------------------

/** The Recycler van's proportions: a tall, boxy cargo van. */
export const VAN: CarShape = {
  len: 5.6,
  wid: 2.0,
  ride: 0.36,
  belt: 1.12,
  roof: 2.45,
  hood: 2.15,
  wind: 1.55,
  rear: -2.72,
  tail: -2.78,
  wheelR: 0.38,
  wheelbase: 3.5,
  inset: 0.04,
};

/** Where `vanLightBar` mounts on the van's roof (van model space). */
export const VAN_LIGHT_BAR_MOUNT = { x: 0, y: 2.53, z: 1.0 } as const;

/**
 * The Recycler van (§5.4): fog white, boxy, a slate band, a push bar, an A-pillar spotlight, and mounts
 * for its light bar (built separately with `vanLightBar` so the scene can switch it during ALERT).
 */
export function recyclerVan(k: Kit): void {
  const s = VAN;
  const L = s.len / 2;
  const hw = s.wid / 2 + 0.005;
  const cw = s.wid / 2 - s.inset + 0.005;
  carBody(k, s, {
    body: C.fog1,
    roof: C.fog2,
    glass: C.night1,
    trim: C.night3,
    tire: C.night0,
    hub: C.slate1,
    rear: C.fog1,
    side: C.fog1,
  });
  flank(k, cw, 0.85, 1.45, 1.3, 2.0, C.night1);
  flank(k, hw, -2.75, 2.5, 0.72, 0.94, C.slate1);
  flank(k, cw + 0.002, -0.32, -0.24, 1.12, 2.3, C.fog0);
  // rear doors: windows and center seam
  const zr = s.tail - 0.01;
  rearDecal(k, -0.85, 1.55, -0.12, 2.1, zr, C.night1);
  rearDecal(k, 0.12, 1.55, 0.85, 2.1, zr, C.night1);
  rearDecal(k, -0.04, 1.15, 0.04, 2.35, zr - 0.001, C.fog0);
  // push bar
  for (const x of [-0.45, 0.45]) k.box(0.1, 0.7, 0.1, C.night2, { x, y: 0.4, z: L + 0.22 });
  k.box(1.3, 0.1, 0.1, C.night2, { y: 1.05, z: L + 0.22 });
  k.box(1.3, 0.1, 0.1, C.night2, { y: 0.55, z: L + 0.22 });
  // light bar mounts, spotlight, antenna
  for (const x of [-0.6, 0.6]) k.box(0.1, 0.08, 0.3, C.night3, { x, y: s.roof, z: VAN_LIGHT_BAR_MOUNT.z });
  k.box(0.18, 0.16, 0.24, C.night3, { x: -0.98, y: 1.6, z: 1.6 });
  k.box(0.14, 0.12, 0.03, C.fog1, { x: -0.98, y: 1.62, z: 1.73 });
  k.pipe([0.6, s.roof, -2.2], [0.7, s.roof + 0.9, -2.3], 0.08, C.night3);
  carLamps(k, s, true, 0.7, 0.85);
  k.light({ x: 0, y: 0.8, z: L + 1.4, color: C.fog2, intensity: 4, range: 10, tag: 'headlight' });
}

/**
 * The van's roof light bar, origin at its bottom center (mount it at VAN_LIGHT_BAR_MOUNT). Alarm red only
 * when `on` (ALERT), with a light tagged 'alarm' the scene can flash; dark slate lenses when off.
 */
export function vanLightBar(k: Kit, on: boolean): void {
  k.box(1.5, 0.12, 0.32, C.night2, {}, { top: C.night3 });
  const reds = [C.red1, C.red0, C.red0, C.red1] as const;
  [-0.54, -0.18, 0.18, 0.54].forEach((x, i) => {
    const lens = (): void => {
      k.box(0.32, 0.16, 0.28, on ? reds[i] : C.slate1, { x, y: 0.12 }, { top: on ? C.red2 : C.slate0 });
    };
    if (on) k.glow(lens);
    else lens();
  });
  if (on) k.light({ x: 0, y: 0.3, z: 0, color: C.red1, intensity: 4, range: 8, tag: 'alarm' });
}

// ------------------------------------------------------------------------------------------------
// Parked cars
// ------------------------------------------------------------------------------------------------

const HATCH: CarShape = {
  len: 4.0,
  wid: 1.76,
  ride: 0.3,
  belt: 0.92,
  roof: 1.45,
  hood: 0.85,
  wind: 0.15,
  rear: -1.25,
  tail: -1.8,
  wheelR: 0.31,
  wheelbase: 2.5,
  inset: 0.12,
};

const SUV: CarShape = {
  len: 4.7,
  wid: 1.9,
  ride: 0.42,
  belt: 1.12,
  roof: 1.82,
  hood: 1.15,
  wind: 0.45,
  rear: -2.0,
  tail: -2.12,
  wheelR: 0.38,
  wheelbase: 2.85,
  inset: 0.1,
};

const COMPACT: CarShape = {
  len: 3.7,
  wid: 1.7,
  ride: 0.28,
  belt: 0.88,
  roof: 1.4,
  hood: 0.75,
  wind: 0.15,
  rear: -0.95,
  tail: -1.5,
  wheelR: 0.29,
  wheelbase: 2.35,
  inset: 0.12,
};

const PICKUP: CarShape = {
  len: 5.2,
  wid: 1.9,
  ride: 0.42,
  belt: 1.05,
  roof: 1.78,
  hood: 1.35,
  wind: 0.75,
  rear: -0.45,
  tail: -0.55,
  wheelR: 0.38,
  wheelbase: 3.2,
  inset: 0.08,
};

const PARKED_STYLES: readonly CarShape[] = [SEDAN, HATCH, SUV, COMPACT, PICKUP];

/** Muted paints with a darker roof shade for each. */
const PARKED_PAINT: readonly (readonly [number, number])[] = [
  [C.slate1, C.slate0],
  [C.concrete1, C.concrete0],
  [C.fog0, C.concrete2],
  [C.night3, C.night2],
  [C.rust1, C.rust0],
  [C.moss1, C.moss0],
  [C.amber0, C.rust0],
  [C.fog1, C.fog0],
  [C.slate0, C.night3],
];

/** Distinct parked-car variants (style × paint); larger variants wrap. */
export const PARKED_CAR_VARIANTS = 10;

/** A car: sedan, hatchback, SUV, compact, or pickup, in a muted paint; lights off when parked. */
export function parkedCar(k: Kit, variant = 0, lit = false): void {
  const n = Math.floor(Math.abs(variant));
  const style = vint(variant, PARKED_STYLES.length);
  const s = PARKED_STYLES[style];
  const [body, roof] = PARKED_PAINT[(n * 2 + 1) % PARKED_PAINT.length];
  carBody(k, s, { body, roof, glass: C.night1, trim: C.night3, tire: C.night0, hub: C.concrete1 });
  carLamps(k, s, lit, s.wid / 2 - 0.3, s.wid / 2 - 0.25);
  if (s === PICKUP) {
    const hw = s.wid / 2 - 0.05;
    for (const sx of [-1, 1]) k.box(0.1, 0.42, 2.0, body, { x: sx * hw, y: s.belt, z: -1.6 });
    k.box(s.wid, 0.42, 0.1, body, { y: s.belt, z: -2.55 });
    k.box(s.wid, 0.42, 0.1, body, { y: s.belt, z: -0.62 });
    flat(k, -hw + 0.05, -2.5, hw - 0.05, -0.67, s.belt + 0.005, C.night2);
  }
  if (vrand(variant, 9) < 0.4) flat(k, -0.4, s.hood + 0.15, 0.1, s.hood + 0.5, s.belt + 0.003, roof);
}

// ------------------------------------------------------------------------------------------------
// The Port
// ------------------------------------------------------------------------------------------------

/** Where a container sits on the yard truck's chassis (the container's bottom center). */
export const YARD_TRUCK_DECK = { x: 0, y: 1.3, z: -1.2 } as const;

/**
 * Port yard truck: a terminal tractor with an offset cab, an amber beacon, and a skeletal container
 * chassis behind it. Variant 1 is painted fog white; variant 2 carries a container.
 */
export function yardTruck(k: Kit, variant = 0): void {
  const v = vint(variant, 3);
  const paint = v === 1 ? C.fog1 : C.amber1;
  const shade = v === 1 ? C.fog0 : C.amber0;
  // tractor
  k.box(2.1, 0.5, 3.6, C.night3, { y: 0.55, z: 3.9 });
  k.box(1.3, 1.9, 1.6, paint, { x: -0.4, y: 1.05, z: 4.85 }, { top: shade });
  decal(k, -0.95, 1.9, 0.15, 2.7, 5.651, C.night1);
  k.quad([0.251, 1.9, 5.4], [0.251, 1.9, 4.3], [0.251, 2.7, 4.3], [0.251, 2.7, 5.4], C.night1);
  k.box(0.9, 0.9, 1.5, paint, { x: 0.65, y: 1.05, z: 4.9 }, { top: shade });
  decal(k, 0.3, 1.15, 1.0, 1.75, 5.651, C.night2);
  k.pipe([0.95, 1.95, 4.3], [0.95, 3.0, 4.3], 0.12, C.night2);
  k.box(1.3, 0.2, 1.3, C.night2, { y: 1.05, z: 3.0 });
  k.box(2.1, 0.3, 0.3, C.night2, { y: 0.55, z: 5.85 });
  for (const sx of [-1, 1] as const) {
    wheel(k, sx * 0.88, 5.0, 0.5, 0.35, sx, C.night0, C.slate1, 6);
    wheel(k, sx * 0.88, 2.9, 0.5, 0.35, sx, C.night0, C.slate1, 6);
  }
  k.glow(() => {
    k.box(0.24, 0.16, 0.04, C.fog2, { x: -0.75, y: 1.25, z: 5.66 });
    k.box(0.24, 0.16, 0.04, C.fog2, { x: 0.75, y: 1.25, z: 5.66 });
    k.cylinder(0.12, 0.18, 6, C.amber2, { x: -0.4, y: 2.95, z: 4.85 });
  });
  k.light({ x: 0, y: 1.1, z: 7.0, color: C.fog2, intensity: 4, range: 9, tag: 'headlight' });
  k.light({
    x: -0.4,
    y: 3.3,
    z: 4.85,
    color: C.amber2,
    intensity: 3,
    range: 7,
    flicker: 0.3,
    tag: 'yardBeacon',
  });
  // container chassis
  for (const x of [-0.5, 0.5]) k.box(0.22, 0.3, 7.6, C.night3, { x, y: 1.0, z: -0.6 });
  for (const z of [-4.2, -1.2, 1.8]) k.box(2.3, 0.2, 0.25, C.night3, { y: 1.1, z });
  for (const x of [-1.1, 1.1]) {
    for (const z of [-4.2, 1.8]) flat(k, x - 0.08, z - 0.08, x + 0.08, z + 0.08, 1.305, C.amber0);
  }
  for (const sx of [-1, 1] as const) {
    wheel(k, sx * 0.88, -3.2, 0.5, 0.35, sx, C.night0, C.slate1, 6);
    wheel(k, sx * 0.88, -4.0, 0.5, 0.35, sx, C.night0, C.slate1, 6);
  }
  k.glow(() => {
    k.box(0.2, 0.14, 0.04, C.amber0, { x: -0.95, y: 1.0, z: -4.42 });
    k.box(0.2, 0.14, 0.04, C.amber0, { x: 0.95, y: 1.0, z: -4.42 });
  });
  for (const x of [-0.9, 0.9]) k.box(0.5, 0.5, 0.05, C.night1, { x, y: 0.3, z: -4.47 });
  // The container rides lengthwise on the chassis.
  if (v === 2) k.at({ ...YARD_TRUCK_DECK, ry: Math.PI / 2 }, () => container(k, 0));
}

// ------------------------------------------------------------------------------------------------
// Drone
// ------------------------------------------------------------------------------------------------

/**
 * Patrol drone (§10.6): a small body, four rotors, nav lights, and a scanner-cyan lens under the nose
 * (cyan is allowed on drones). Origin at the bottom of the lens; the searchlight cone is drawn by the scene.
 */
export function drone(k: Kit): void {
  k.box(0.18, 0.1, 0.18, C.night2, { y: 0.12, z: 0.18 });
  k.glow(() => k.box(0.16, 0.14, 0.16, C.cyan1, { z: 0.22 }));
  k.bevelBox(0.52, 0.18, 0.56, 0.14, C.slate0, { y: 0.16 }, C.slate1);
  for (const a of [Math.PI / 4, -Math.PI / 4]) k.box(1.2, 0.08, 0.1, C.night3, { y: 0.26, ry: a });
  for (const [x, z] of ROTORS) k.cylinder(0.22, 0.04, 6, C.night3, { x, y: 0.34, z }, C.slate1);
  k.glow(() => {
    k.box(0.08, 0.08, 0.08, C.fog2, { x: 0.42, y: 0.26, z: 0.42 });
    k.box(0.08, 0.08, 0.08, C.amber2, { x: -0.42, y: 0.26, z: 0.42 });
  });
  k.light({ x: 0, y: 0.05, z: 0.35, color: C.cyan1, intensity: 2, range: 5, tag: 'drone' });
}

const ROTORS: readonly (readonly [number, number])[] = [
  [0.42, 0.42],
  [-0.42, 0.42],
  [0.42, -0.42],
  [-0.42, -0.42],
];
