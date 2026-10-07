/**
 * The shared humanoid rig (spec §5.2): hierarchical parts (head, neck, torso, pelvis, upper and lower arms,
 * hands, upper and lower legs, feet), each a box, plus accessories (hair, hats, hoods, coats, collars,
 * backpacks, vests, batons, scanner wands). Humans and androids use the same rig.
 *
 * Rendering-side data only (no Three.js objects here): the character renderer turns rigs + poses into
 * instanced boxes. Model space: y up, the character faces +z.
 */
import { C } from '../render/palettes';

export const PART = {
  pelvis: 0,
  torso: 1,
  neck: 2,
  head: 3,
  uArmL: 4,
  lArmL: 5,
  handL: 6,
  uArmR: 7,
  lArmR: 8,
  handR: 9,
  uLegL: 10,
  lLegL: 11,
  footL: 12,
  uLegR: 13,
  lLegR: 14,
  footR: 15,
} as const;
export type PartIndex = (typeof PART)[keyof typeof PART];
export const PART_COUNT = 16;

/** Parent of each part (-1 = root). */
export const PARENT: readonly number[] = [-1, 0, 1, 2, 1, 4, 5, 1, 7, 8, 0, 10, 11, 0, 13, 14];

export type HatKind = 'none' | 'cap' | 'workcap' | 'beanie' | 'hood' | 'officer';

export interface Look {
  /** Overall height scale (1 ≈ 1.8 m to the top of the head). */
  height: number;
  /** Shoulder width scale. */
  shoulders: number;
  /** Girth scale. */
  build: number;
  skin: number;
  hair: number;
  /** 0..7 hair shapes; 0 = bald/shaved. */
  hairStyle: number;
  jacket: number;
  shirt: number;
  pants: number;
  shoes: number;
  hat: HatKind;
  hatColor: number;
  /** Long coat panels (Wren). */
  coat: boolean;
  /** Tall collar (Vesper). */
  collar: boolean;
  /** Backpack (June). */
  backpack: boolean;
  /** Reflective vest stripes (Recyclers). */
  vest: boolean;
  /** Red-lit baton in the right hand (Recyclers). */
  baton: boolean;
  /** Cyan scanner wand in the left hand (Recyclers). */
  wand: boolean;
  /** EMP rifle (Recycler gunners). */
  rifle: boolean;
  /** Apron (diner staff, cooks). */
  apron: boolean;
  /** Android: chassis can show through as Skin drops. */
  android: boolean;
}

export interface BoxDef {
  part: number;
  /** Box size in meters (before the look's scale). */
  size: [number, number, number];
  /** Box center relative to the part's joint. */
  offset: [number, number, number];
  color: number;
  glow?: boolean;
  /** Chassis exposure: this box turns to metal when Skin/100 drops below this threshold. */
  chassisAt?: number;
  /** Seam direction for exposed boxes. */
  seam?: 'v' | 'h';
  /** Tag for special handling (face plate, eye line). */
  tag?: 'face' | 'batonTip' | 'wandTip' | 'rifleTip';
}

export interface RigDef {
  /** Joint offsets from the parent joint, scaled for this look. */
  joints: [number, number, number][];
  boxes: BoxDef[];
  /** Hip height above ground at rest. */
  hip: number;
  /** Total height (top of head). */
  top: number;
}

const BASE_JOINTS: [number, number, number][] = [
  [0, 0.92, 0], // pelvis (root, hip height)
  [0, 0.08, 0], // torso
  [0, 0.5, 0], // neck
  [0, 0.07, 0], // head
  [0.25, 0.45, 0], // uArmL (character's left = +x when facing +z? left is -x when facing +z; mirrored below)
  [0, -0.29, 0], // lArmL
  [0, -0.27, 0], // handL
  [-0.25, 0.45, 0], // uArmR
  [0, -0.29, 0], // lArmR
  [0, -0.27, 0], // handR
  [0.1, 0, 0], // uLegL
  [0, -0.44, 0], // lLegL
  [0, -0.42, 0], // footL
  [-0.1, 0, 0], // uLegR
  [0, -0.44, 0], // lLegR
  [0, -0.42, 0], // footR
];

/** Build the boxes for a look. Deterministic for a given look. */
export function buildRig(look: Look): RigDef {
  const h = look.height;
  const sh = look.shoulders;
  const b = look.build;
  const joints = BASE_JOINTS.map((j, i): [number, number, number] => {
    const sx = i === PART.uArmL || i === PART.uArmR ? sh : i === PART.uLegL || i === PART.uLegR ? b : 1;
    return [j[0] * sx, j[1] * h, j[2]];
  });
  const boxes: BoxDef[] = [];
  const add = (
    part: number,
    size: [number, number, number],
    offset: [number, number, number],
    color: number,
    extra: Partial<BoxDef> = {},
  ): void => {
    boxes.push({ part, size, offset, color, ...extra });
  };
  const top = look.jacket;
  const sleeve = look.jacket;
  // Pelvis and torso
  add(PART.pelvis, [0.34 * b, 0.18, 0.21 * b], [0, 0.03, 0], look.pants, { chassisAt: 0.25, seam: 'h' });
  add(PART.torso, [0.4 * sh * b, 0.5 * h, 0.24 * b], [0, 0.25 * h, 0], top, { chassisAt: 0.55, seam: 'v' });
  // Shirt front stripe (reads as an open jacket) unless vest
  if (!look.vest && look.shirt !== look.jacket) {
    add(PART.torso, [0.12 * sh, 0.36 * h, 0.02], [0, 0.3 * h, 0.125 * b], look.shirt);
  }
  if (look.apron) add(PART.torso, [0.3 * sh, 0.55 * h, 0.03], [0, 0.18 * h, 0.13 * b], C.fog1);
  if (look.vest) {
    // Reflective vest: fog-white stripes on slate, front and back.
    add(PART.torso, [0.42 * sh * b, 0.06, 0.26 * b], [0, 0.16 * h, 0], C.fog2);
    add(PART.torso, [0.42 * sh * b, 0.06, 0.26 * b], [0, 0.32 * h, 0], C.fog2);
    add(PART.torso, [0.08, 0.5 * h, 0.265 * b], [0.12 * sh, 0.25 * h, 0], C.fog1);
    add(PART.torso, [0.08, 0.5 * h, 0.265 * b], [-0.12 * sh, 0.25 * h, 0], C.fog1);
  }
  add(PART.neck, [0.1, 0.09, 0.1], [0, 0.04, 0], look.skin, { chassisAt: 0.4 });
  // Head (oversized for readability) with a face side
  add(PART.head, [0.27, 0.28, 0.27], [0, 0.14, 0], look.skin, { chassisAt: 0.05, tag: 'face' });
  addHair(look, add);
  addHat(look, add);
  if (look.collar) {
    add(PART.torso, [0.3 * sh, 0.14, 0.04], [0, 0.52 * h, -0.1], look.jacket);
    add(PART.torso, [0.04, 0.14, 0.22], [0.15 * sh, 0.52 * h, 0], look.jacket);
    add(PART.torso, [0.04, 0.14, 0.22], [-0.15 * sh, 0.52 * h, 0], look.jacket);
  }
  if (look.backpack) add(PART.torso, [0.3, 0.36 * h, 0.14], [0, 0.26 * h, -0.19 * b], C.moss1);
  // Arms
  for (const [u, l, hand] of [
    [PART.uArmL, PART.lArmL, PART.handL],
    [PART.uArmR, PART.lArmR, PART.handR],
  ] as const) {
    add(u, [0.12 * b, 0.3 * h, 0.13 * b], [0, -0.14 * h, 0], sleeve, { chassisAt: 0.7, seam: 'v' });
    add(l, [0.11 * b, 0.28 * h, 0.12 * b], [0, -0.13 * h, 0], sleeve, { chassisAt: 0.85, seam: 'h' });
    add(hand, [0.12, 0.12, 0.12], [0, -0.05, 0], look.skin, { chassisAt: 0.95 });
  }
  // Legs
  const coatLen = look.coat ? 0.36 : 0;
  for (const [u, l, foot] of [
    [PART.uLegL, PART.lLegL, PART.footL],
    [PART.uLegR, PART.lLegR, PART.footR],
  ] as const) {
    add(u, [0.15 * b, 0.45 * h, 0.16 * b], [0, -0.22 * h, 0], look.pants, { chassisAt: 0.45, seam: 'v' });
    add(l, [0.13 * b, 0.42 * h, 0.14 * b], [0, -0.21 * h, 0], look.pants, { chassisAt: 0.65, seam: 'h' });
    add(foot, [0.13, 0.08, 0.25], [0, -0.025, 0.05], look.shoes);
    if (look.coat) {
      // Long coat panels hang from the hips and swing with the legs.
      add(u, [0.2 * b, coatLen * h + 0.3, 0.2 * b], [0, -0.2 * h, 0], look.jacket);
    }
  }
  if (look.baton) {
    add(PART.handR, [0.06, 0.06, 0.48], [0, -0.06, 0.22], C.night2);
    add(PART.handR, [0.08, 0.08, 0.1], [0, -0.06, 0.48], C.red1, { glow: true, tag: 'batonTip' });
  }
  if (look.wand) {
    add(PART.handL, [0.07, 0.07, 0.3], [0, -0.06, 0.14], C.slate1);
    add(PART.handL, [0.09, 0.09, 0.08], [0, -0.06, 0.32], C.cyan1, { glow: true, tag: 'wandTip' });
  }
  if (look.rifle) {
    add(PART.handR, [0.09, 0.12, 0.7], [0, -0.02, 0.3], C.night3);
    add(PART.handR, [0.08, 0.08, 0.08], [0, -0.02, 0.68], C.cyan1, { glow: true, tag: 'rifleTip' });
  }
  const hip = joints[PART.pelvis][1];
  return { joints, boxes, hip, top: hip + 0.08 + 0.5 * h + 0.07 + 0.35 };
}

type AddFn = (
  part: number,
  size: [number, number, number],
  offset: [number, number, number],
  color: number,
  extra?: Partial<BoxDef>,
) => void;

/** About 8 hair shapes. Hair sits on the back and top of the head so the face side stays readable. */
function addHair(look: Look, add: AddFn): void {
  const c = look.hair;
  const H = PART.head;
  switch (look.hairStyle) {
    case 1: // short crop
      add(H, [0.29, 0.07, 0.29], [0, 0.27, -0.01], c);
      add(H, [0.29, 0.16, 0.06], [0, 0.2, -0.12], c);
      break;
    case 2: // long, past the shoulders
      add(H, [0.3, 0.08, 0.3], [0, 0.28, -0.01], c);
      add(H, [0.31, 0.36, 0.08], [0, 0.1, -0.13], c);
      add(H, [0.05, 0.26, 0.24], [0.15, 0.12, -0.02], c);
      add(H, [0.05, 0.26, 0.24], [-0.15, 0.12, -0.02], c);
      break;
    case 3: // bun
      add(H, [0.29, 0.07, 0.29], [0, 0.27, -0.01], c);
      add(H, [0.14, 0.12, 0.12], [0, 0.31, -0.13], c);
      break;
    case 4: // big rounded volume
      add(H, [0.38, 0.16, 0.36], [0, 0.28, -0.02], c);
      add(H, [0.38, 0.18, 0.12], [0, 0.17, -0.12], c);
      add(H, [0.06, 0.18, 0.28], [0.18, 0.18, -0.02], c);
      add(H, [0.06, 0.18, 0.28], [-0.18, 0.18, -0.02], c);
      break;
    case 5: // ponytail
      add(H, [0.29, 0.07, 0.29], [0, 0.27, -0.01], c);
      add(H, [0.08, 0.24, 0.08], [0, 0.12, -0.18], c);
      break;
    case 6: // side part, swept
      add(H, [0.3, 0.09, 0.29], [0.01, 0.27, -0.01], c);
      add(H, [0.06, 0.12, 0.2], [0.14, 0.22, 0.03], c);
      add(H, [0.29, 0.14, 0.06], [0, 0.2, -0.12], c);
      break;
    case 7: // close-cropped with a fade (top only)
      add(H, [0.28, 0.05, 0.27], [0, 0.28, -0.01], c);
      break;
    default:
      break;
  }
}

function addHat(look: Look, add: AddFn): void {
  const c = look.hatColor;
  const H = PART.head;
  switch (look.hat) {
    case 'cap':
      add(H, [0.3, 0.09, 0.3], [0, 0.3, -0.01], c);
      add(H, [0.26, 0.03, 0.14], [0, 0.27, 0.19], c);
      break;
    case 'workcap':
      add(H, [0.31, 0.1, 0.31], [0, 0.3, 0], c);
      add(H, [0.3, 0.03, 0.16], [0, 0.27, 0.2], c);
      break;
    case 'beanie':
      add(H, [0.3, 0.13, 0.3], [0, 0.3, -0.01], c);
      break;
    case 'officer':
      add(H, [0.32, 0.1, 0.32], [0, 0.31, 0], c);
      add(H, [0.3, 0.03, 0.12], [0, 0.27, 0.19], C.night1);
      break;
    case 'hood':
      // A hood frames the face: top, back, and both sides.
      add(H, [0.34, 0.08, 0.34], [0, 0.3, -0.01], c);
      add(H, [0.34, 0.34, 0.07], [0, 0.13, -0.16], c);
      add(H, [0.06, 0.3, 0.3], [0.17, 0.14, -0.01], c);
      add(H, [0.06, 0.3, 0.3], [-0.17, 0.14, -0.01], c);
      break;
    default:
      break;
  }
}

/** A plain default look (tests, the M1 walker). */
export function defaultLook(): Look {
  return {
    height: 1,
    shoulders: 1,
    build: 1,
    skin: C.skin2,
    hair: C.night1,
    hairStyle: 1,
    jacket: C.slate1,
    shirt: C.fog0,
    pants: C.night3,
    shoes: C.night1,
    hat: 'none',
    hatColor: C.night2,
    coat: false,
    collar: false,
    backpack: false,
    vest: false,
    baton: false,
    wand: false,
    rifle: false,
    apron: false,
    android: false,
  };
}
