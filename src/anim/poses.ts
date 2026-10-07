/**
 * Procedural animation (spec §6). Poses are joint rotations per rig part plus root offsets. Every pose is a
 * pure function of (animation, time or gait phase, parameters); the renderer samples poses at 12 fps
 * ("on twos") while positions move at 60 fps.
 *
 * Conventions: rotation about x swings a hanging limb backward for positive angles; a lower leg bends back
 * (knee) with positive rx; a lower arm bends forward (elbow) with negative rx.
 */
import { PART, PART_COUNT } from '../models/rig';

export interface Pose {
  rx: Float32Array;
  ry: Float32Array;
  rz: Float32Array;
  /** Vertical root offset (bob, sinking into a seat, collapse). */
  bob: number;
  /** Forward lean of the whole body (radians). */
  lean: number;
  /** Sideways tilt (radians). */
  tilt: number;
  /** Forward root shift in meters (lunges, takedowns). */
  shift: number;
}

export function newPose(): Pose {
  return {
    rx: new Float32Array(PART_COUNT),
    ry: new Float32Array(PART_COUNT),
    rz: new Float32Array(PART_COUNT),
    bob: 0,
    lean: 0,
    tilt: 0,
    shift: 0,
  };
}

export function resetPose(p: Pose): void {
  p.rx.fill(0);
  p.ry.fill(0);
  p.rz.fill(0);
  p.bob = 0;
  p.lean = 0;
  p.tilt = 0;
  p.shift = 0;
}

export type AnimName =
  | 'idle'
  | 'still'
  | 'paradeRest'
  | 'walk'
  | 'brisk'
  | 'sprint'
  | 'dash'
  | 'carry'
  | 'sit'
  | 'stand'
  | 'stretch'
  | 'scratch'
  | 'shift'
  | 'watch'
  | 'phone'
  | 'coffee'
  | 'search'
  | 'talk'
  | 'browse'
  | 'pump'
  | 'order'
  | 'tv'
  | 'shelter'
  | 'hug'
  | 'light'
  | 'heavy'
  | 'charge'
  | 'flinch'
  | 'down'
  | 'getup'
  | 'takedown'
  | 'shutdown'
  | 'carried'
  | 'kneel'
  | 'wave'
  | 'point'
  | 'scan'
  | 'aim'
  | 'smoke'
  | 'lean'
  | 'hack'
  | 'plugged'
  | 'heave'
  | 'patch'
  | 'cower'
  | 'sweep';

export interface AnimParams {
  /** Gait phase in radians (walk cycles), advanced by distance traveled. */
  phase: number;
  /** 0..1 movement intensity within the gait. */
  speed: number;
  /** Seconds since the animation started (quantized to the pose rate by the caller). */
  t: number;
  /** Per-character variety seed 0..1. */
  seed: number;
}

const s = Math.sin;
const c = Math.cos;

function arms(p: Pose, l: number, r: number, elbow = -0.25): void {
  p.rx[PART.uArmL] = l;
  p.rx[PART.uArmR] = r;
  p.rx[PART.lArmL] = elbow;
  p.rx[PART.lArmR] = elbow;
}

function gait(
  p: Pose,
  phase: number,
  legAmp: number,
  armAmp: number,
  knee: number,
  elbow: number,
  bob: number,
): void {
  const sp = s(phase);
  p.rx[PART.uLegL] = -legAmp * sp;
  p.rx[PART.uLegR] = legAmp * sp;
  p.rx[PART.lLegL] = knee * Math.max(0, -c(phase - 0.6));
  p.rx[PART.lLegR] = knee * Math.max(0, c(phase - 0.6));
  p.rx[PART.footL] = -0.15 * sp;
  p.rx[PART.footR] = 0.15 * sp;
  arms(p, armAmp * sp, -armAmp * sp, elbow);
  p.ry[PART.torso] = 0.08 * sp * (armAmp / 0.5);
  p.bob = bob * Math.abs(s(phase)) - bob * 0.5;
}

/** Sample an animation into `out`. */
export function samplePose(out: Pose, anim: AnimName, a: AnimParams): void {
  resetPose(out);
  const t = a.t;
  const v = a.seed;
  switch (anim) {
    case 'idle': {
      // Gentle sway and breathing; a human never stands perfectly still.
      const sw = s(t * 0.9 + v * 6) * 0.03;
      out.tilt = sw;
      out.rz[PART.head] = -sw * 0.8;
      out.rx[PART.head] = s(t * 0.5 + v * 3) * 0.05;
      arms(out, 0.04 + s(t * 1.1) * 0.02, 0.04 - s(t * 1.1) * 0.02, -0.15);
      out.rz[PART.uArmL] = 0.05;
      out.rz[PART.uArmR] = -0.05;
      out.bob = s(t * 2.2) * 0.008;
      break;
    }
    case 'still':
      // Perfect stillness (an android tell).
      arms(out, 0, 0, 0);
      break;
    case 'paradeRest':
      // Feet apart, hands clasped behind the back.
      out.rz[PART.uLegL] = 0.08;
      out.rz[PART.uLegR] = -0.08;
      arms(out, 0.45, 0.45, -0.4);
      out.rz[PART.uArmL] = -0.15;
      out.rz[PART.uArmR] = 0.15;
      break;
    case 'walk':
      gait(out, a.phase, 0.42 * (0.6 + a.speed * 0.4), 0.32, 0.55, -0.25, 0.035);
      out.lean = 0.03;
      break;
    case 'brisk':
      gait(out, a.phase, 0.55, 0.45, 0.7, -0.35, 0.045);
      out.lean = 0.07;
      break;
    case 'sprint':
      gait(out, a.phase, 0.85, 0.95, 1.25, -1.25, 0.07);
      out.lean = 0.24;
      out.rx[PART.head] = -0.15;
      break;
    case 'dash':
      out.lean = 0.42;
      arms(out, 0.9, 0.9, -0.2);
      out.rx[PART.uLegL] = -0.6;
      out.rx[PART.uLegR] = 0.5;
      out.rx[PART.lLegR] = 0.9;
      out.rx[PART.head] = -0.3;
      break;
    case 'carry':
      gait(out, a.phase, 0.38, 0, 0.5, 0, 0.03);
      arms(out, -1.15, -1.15, -0.5);
      out.lean = -0.06;
      break;
    case 'sit': {
      out.bob = -0.44;
      out.rx[PART.uLegL] = -1.45;
      out.rx[PART.uLegR] = -1.45;
      out.rx[PART.lLegL] = 1.45;
      out.rx[PART.lLegR] = 1.45;
      arms(out, -0.35, -0.35, -0.9);
      out.rx[PART.head] = s(t * 0.4 + v * 4) * 0.06;
      break;
    }
    case 'stand': {
      const k = Math.min(1, t / 0.5);
      out.bob = -0.44 * (1 - k);
      out.rx[PART.uLegL] = -1.45 * (1 - k);
      out.rx[PART.uLegR] = -1.45 * (1 - k);
      out.rx[PART.lLegL] = 1.45 * (1 - k);
      out.rx[PART.lLegR] = 1.45 * (1 - k);
      out.lean = 0.3 * (1 - k);
      break;
    }
    case 'stretch': {
      const k = Math.min(1, t / 0.8) * (t < 2.3 ? 1 : Math.max(0, 1 - (t - 2.3) / 0.6));
      arms(out, -2.9 * k, -2.9 * k, -0.2 * k);
      out.rz[PART.uArmL] = 0.25 * k;
      out.rz[PART.uArmR] = -0.25 * k;
      out.rx[PART.head] = -0.25 * k;
      out.lean = -0.08 * k;
      out.tilt = s(t * 1.5) * 0.08 * k;
      break;
    }
    case 'scratch':
      arms(out, 0.05, -2.3, -2.2);
      out.rz[PART.uArmR] = -0.4;
      out.rx[PART.head] = 0.15;
      out.rz[PART.lArmR] = s(t * 18) * 0.15;
      break;
    case 'shift':
      out.tilt = 0.06 * s(t * 1.4);
      out.rz[PART.uLegL] = 0.05;
      out.rx[PART.lLegR] = 0.2;
      arms(out, 0.05, 0.05, -0.2);
      break;
    case 'watch':
      arms(out, 0.05, -0.9, -1.6);
      out.ry[PART.uArmR] = 0.6;
      out.rx[PART.head] = 0.35;
      out.ry[PART.head] = -0.25;
      break;
    case 'phone': {
      // Phone held low in both hands, head bowed, thumb scrolling.
      arms(out, -0.55, -0.55, -1.2);
      out.ry[PART.uArmL] = -0.3;
      out.ry[PART.uArmR] = 0.3;
      out.rx[PART.head] = 0.42;
      out.rx[PART.handR] = s(t * 6) * 0.15;
      break;
    }
    case 'coffee': {
      const sip = (t % 3) / 3 < 0.35;
      arms(out, 0.05, sip ? -1.0 : -0.4, sip ? -1.9 : -1.3);
      out.ry[PART.uArmR] = 0.4;
      out.rx[PART.head] = sip ? -0.15 : 0.1;
      break;
    }
    case 'search': {
      // Looping rummage.
      out.lean = 0.35;
      arms(out, -1.0 + s(t * 7) * 0.25, -1.1 + s(t * 7 + 2) * 0.25, -0.6);
      out.rx[PART.head] = 0.3;
      out.rx[PART.uLegL] = -0.15;
      out.rx[PART.lLegL] = 0.3;
      break;
    }
    case 'talk': {
      const g = s(t * 3.1 + v * 5);
      arms(out, -0.3 - Math.max(0, g) * 0.6, 0.05, -1.0 - Math.max(0, g) * 0.4);
      out.ry[PART.uArmL] = -0.3;
      out.rx[PART.head] = s(t * 2.3) * 0.08;
      out.ry[PART.head] = s(t * 0.9) * 0.15;
      break;
    }
    case 'browse': {
      out.rx[PART.head] = 0.15;
      out.ry[PART.head] = s(t * 0.8) * 0.4;
      arms(out, -0.5, 0.05, -0.9);
      out.rx[PART.handL] = s(t * 2) * 0.2;
      break;
    }
    case 'pump':
      arms(out, -1.2, 0.05, -0.4);
      out.ry[PART.uArmL] = -0.2;
      out.rx[PART.head] = 0.2;
      out.ry[PART.head] = s(t * 0.5) * 0.3;
      break;
    case 'order':
      out.lean = 0.12;
      arms(out, -0.7, 0.05, -0.8);
      out.rx[PART.head] = s(t * 2) * 0.05;
      break;
    case 'tv':
      out.rx[PART.head] = -0.25;
      arms(out, 0.05, 0.05, -0.3);
      out.tilt = s(t * 0.6) * 0.02;
      break;
    case 'shelter':
      arms(out, -0.2, -0.2, -1.5);
      out.rz[PART.uArmL] = -0.3;
      out.rz[PART.uArmR] = 0.3;
      out.rx[PART.head] = 0.2;
      break;
    case 'hug':
      arms(out, -1.3, -1.3, -0.8);
      out.rz[PART.uArmL] = -0.5;
      out.rz[PART.uArmR] = 0.5;
      out.lean = 0.1;
      break;
    case 'light': {
      // Quick swing: wind-up then strike (0.0–0.4 s).
      const k = Math.min(1, t / 0.12);
      const strike = t > 0.12 ? Math.min(1, (t - 0.12) / 0.1) : 0;
      arms(out, -0.2, 0.6 * k - 2.0 * strike, -0.6);
      out.ry[PART.torso] = 0.4 * k - 0.8 * strike;
      out.lean = 0.1 * strike;
      break;
    }
    case 'charge':
      arms(out, 0.2, 1.4, -0.8);
      out.ry[PART.torso] = 0.5;
      out.lean = -0.05;
      out.bob = -0.04;
      break;
    case 'heavy': {
      const strike = Math.min(1, t / 0.12);
      arms(out, -1.4 * strike, -1.6 * strike, -0.2);
      out.ry[PART.torso] = -0.6 * strike;
      out.lean = 0.25 * strike;
      out.shift = 0.15 * strike;
      break;
    }
    case 'flinch':
      out.lean = -0.2;
      out.rx[PART.head] = -0.3;
      arms(out, -0.4, -0.4, -1.2);
      break;
    case 'down':
      // Knocked down / slumped: lying on the back.
      out.bob = -0.78;
      out.lean = -1.45;
      arms(out, 0.3, -0.2, -0.3);
      out.rz[PART.uArmL] = 0.6;
      out.rz[PART.uArmR] = -0.4;
      out.rx[PART.uLegL] = -0.2;
      out.rx[PART.lLegR] = 0.4;
      break;
    case 'getup': {
      const k = Math.min(1, t / 0.8);
      out.bob = -0.78 * (1 - k);
      out.lean = -1.45 * (1 - k);
      break;
    }
    case 'takedown': {
      const k = Math.min(1, t / 0.25);
      arms(out, -1.4 * k, -1.2 * k, -0.6);
      out.lean = 0.3 * k;
      out.shift = 0.25 * k;
      break;
    }
    case 'shutdown': {
      // Collapse with a servo stutter: steps down in jerks, then slumps.
      const steps = Math.min(1, Math.floor((t / 0.9) * 5) / 5);
      out.bob = -0.55 * steps;
      out.rx[PART.uLegL] = -1.2 * steps;
      out.rx[PART.uLegR] = -1.1 * steps;
      out.rx[PART.lLegL] = 1.9 * steps;
      out.rx[PART.lLegR] = 1.8 * steps;
      out.lean = 0.5 * steps;
      out.rx[PART.head] = 0.7 * steps;
      arms(out, 0.1, 0.1, -0.1);
      out.rz[PART.uArmL] = 0.15 * steps;
      out.rz[PART.uArmR] = -0.15 * steps;
      break;
    }
    case 'carried':
      out.bob = 0.55;
      out.lean = -1.4;
      arms(out, 0.6, 0.6, 0);
      out.rx[PART.head] = 0.5;
      break;
    case 'kneel':
      out.bob = -0.42;
      out.rx[PART.uLegL] = -1.5;
      out.rx[PART.lLegL] = 1.5;
      out.rx[PART.uLegR] = 0.1;
      out.rx[PART.lLegR] = 1.6;
      arms(out, -0.6, -0.4, -0.6);
      out.rx[PART.head] = 0.3;
      break;
    case 'wave':
      arms(out, 0.05, -2.6 + s(t * 9) * 0.2, -0.4);
      out.rz[PART.uArmR] = -0.4 + s(t * 9) * 0.3;
      break;
    case 'point':
      arms(out, 0.05, -1.5, 0);
      out.ry[PART.uArmR] = 0.2;
      break;
    case 'scan':
      // Scanner wand held out and swept.
      arms(out, -1.2 + s(t * 4) * 0.3, 0.05, -0.2);
      out.ry[PART.uArmL] = s(t * 4) * 0.5;
      out.rx[PART.head] = 0.15;
      break;
    case 'aim':
      arms(out, -1.4, -1.45, -0.1);
      out.ry[PART.uArmL] = -0.3;
      out.ry[PART.torso] = 0.2;
      out.rx[PART.head] = 0.05;
      break;
    case 'smoke': {
      const puff = (t % 4) / 4 < 0.3;
      arms(out, 0.05, puff ? -1.1 : -0.5, puff ? -2.0 : -1.4);
      out.rx[PART.head] = puff ? -0.1 : 0.05;
      out.tilt = 0.03;
      break;
    }
    case 'lean':
      out.lean = 0.25;
      arms(out, -0.9, -0.9, -0.6);
      out.rx[PART.head] = -0.1;
      break;
    case 'hack':
      arms(out, -1.0, -1.0, -0.9);
      out.rx[PART.handL] = s(t * 14) * 0.25;
      out.rx[PART.handR] = s(t * 13 + 1) * 0.25;
      out.rx[PART.head] = 0.25;
      break;
    case 'plugged':
      // Standing at a bay with the cable to the wrist port.
      arms(out, 0.05, -0.5, -1.2);
      out.ry[PART.uArmR] = 0.5;
      break;
    case 'heave':
      out.lean = 0.45;
      arms(out, -1.5, -1.5, -0.1);
      out.rx[PART.uLegR] = 0.6;
      out.rx[PART.uLegL] = -0.4;
      out.rx[PART.lLegL] = 0.5;
      break;
    case 'patch':
      out.bob = -0.3;
      out.lean = 0.4;
      out.rx[PART.uLegL] = -1.0;
      out.rx[PART.lLegL] = 1.4;
      arms(out, -1.1, -1.0 + s(t * 5) * 0.2, -0.7);
      break;
    case 'cower':
      out.bob = -0.35;
      out.lean = 0.5;
      out.rx[PART.uLegL] = -1.1;
      out.rx[PART.uLegR] = -1.1;
      out.rx[PART.lLegL] = 1.8;
      out.rx[PART.lLegR] = 1.8;
      arms(out, -2.4, -2.4, -1.8);
      break;
    case 'sweep':
      arms(out, -0.9 + s(t * 2.5) * 0.4, -0.8 + s(t * 2.5) * 0.4, -0.4);
      out.lean = 0.2;
      break;
  }
}
