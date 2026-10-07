/**
 * Shared pieces for the end of a run (spec §16): kit meshes, standing figures, dialogue lines from the
 * content banks, gradient backdrops whose colors can blend from night to dawn, and typed lines of text.
 */
import * as THREE from 'three';
import { newPose } from '../anim/poses';
import { MEMBERS } from '../content/characters';
import type { Line } from '../content/schema';
import type { Kit } from '../models/kit';
import { buildRig, type Look } from '../models/rig';
import type { CharInstance } from '../render/characters';
import { MASK, materials, withMask } from '../render/materials';
import type { DialogueLine } from '../ui/dialogue';
import type { UiSurface } from '../ui/surface';

/** Add a built kit's solid and emissive meshes to a scene; returns its point lights. */
export function addKit(parent: THREE.Object3D, k: Kit): ReturnType<Kit['build']>['lights'] {
  const out = k.build();
  const m = materials();
  if (out.solid) parent.add(new THREE.Mesh(out.solid, m.toon));
  if (out.glow) parent.add(new THREE.Mesh(out.glow, m.glow));
  return out.lights;
}

/** A figure standing (or walking) in a cinematic. */
export function figure(look: Look, x: number, z: number, yaw: number, skin01 = 1): CharInstance {
  return {
    rig: buildRig(look),
    look,
    x,
    y: 0,
    z,
    yaw,
    pose: newPose(),
    skin01,
    visible: true,
    slice: 0,
    sliceY: 1.1,
    seamFlicker: false,
    flash: false,
  };
}

/** Content lines for the dialogue box: stage directions have no speaker. */
export function dialogueLines(
  lines: readonly Line[],
  nameColor: number,
  directionColor: number,
): DialogueLine[] {
  return lines.map((l) => {
    if (l.speaker === 'direction') return { speaker: '', text: l.text, color: directionColor };
    if (l.speaker === 'mensah') return { speaker: 'Captain Mensah', text: l.text, color: nameColor };
    if (l.speaker === 'lantern' || l.speaker === 'keeper')
      return { speaker: '', text: l.text, color: nameColor };
    return { speaker: MEMBERS[l.speaker].name, text: l.text, color: nameColor };
  });
}

/**
 * A palette-locked fade: text steps through darker palette colors to its own (0 = invisible). `steps` runs
 * from the first visible color to the final one.
 */
export function fadeColor(f: number, steps: readonly number[]): number | null {
  if (f <= 0) return null;
  return steps[Math.min(steps.length - 1, Math.floor(f * steps.length))];
}

/** Centered, wrapped lines of text; returns the height used. */
export function centered(
  ui: UiSurface,
  text: string,
  cx: number,
  y: number,
  maxW: number,
  color: number,
  shadow: number | null,
): number {
  const lines = ui.wrap(text, maxW);
  lines.forEach((l, i) => ui.text(l, cx, y + i * ui.lineHeight, color, { align: 'center', shadow }));
  return lines.length * ui.lineHeight;
}

/** 0 before `start`, 1 after `start + dur`, linear between. */
export function ramp(t: number, start: number, dur: number): number {
  return Math.max(0, Math.min(1, (t - start) / dur));
}

/** A palette color as sRGB floats (color management is off: vertex colors are the palette values). */
export function rgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/** Blend two sRGB colors. */
export function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  f: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** A color ramp: stops at 0..1, linear between (in sRGB, before the palette lookup). */
export type Stops = readonly (readonly [number, number])[];

export function sampleStops(stops: Stops, v: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, v));
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      return mixRgb(rgb(c0), rgb(c1), t1 > t0 ? (t - t0) / (t1 - t0) : 0);
    }
  }
  return rgb(stops[stops.length - 1][1]);
}

/**
 * A grid of unlit quads with two color sets (night and dawn) blended on the CPU. Used for the sky backdrop
 * and the sea: the palette lookup turns the smooth blend into dithered bands.
 */
export class Backdrop {
  readonly mesh: THREE.Mesh;
  private readonly night: Float32Array;
  private readonly dawn: Float32Array;
  private readonly colors: THREE.BufferAttribute;
  private mix = -1;

  /**
   * `corner(u, v)` maps grid coordinates (0..1 each) to a world point; `color(u, v, dawn)` gives each vertex's
   * color. Quads repeat their vertices, so each quad can be flat or blended.
   */
  constructor(
    cols: number,
    rows: number,
    corner: (u: number, v: number) => [number, number, number],
    color: (u: number, v: number, dawn: boolean) => [number, number, number],
  ) {
    const pos: number[] = [];
    const night: number[] = [];
    const dawn: number[] = [];
    const push = (u: number, v: number): void => {
      pos.push(...corner(u, v));
      night.push(...color(u, v, false));
      dawn.push(...color(u, v, true));
    };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const u0 = c / cols;
        const u1 = (c + 1) / cols;
        const v0 = r / rows;
        const v1 = (r + 1) / rows;
        push(u0, v0);
        push(u1, v0);
        push(u1, v1);
        push(u0, v0);
        push(u1, v1);
        push(u0, v1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.night = new Float32Array(night);
    this.dawn = new Float32Array(dawn);
    this.colors = new THREE.BufferAttribute(new Float32Array(night), 3);
    geo.setAttribute('color', this.colors);
    const mat = withMask(
      new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }),
      MASK.surface,
    );
    this.mesh = new THREE.Mesh(geo, mat);
    this.setMix(0);
  }

  /** 0 = night colors, 1 = dawn colors. */
  setMix(m: number): void {
    const v = Math.max(0, Math.min(1, m));
    if (v === this.mix) return;
    this.mix = v;
    const out = this.colors.array as Float32Array;
    for (let i = 0; i < out.length; i++) out[i] = this.night[i] + (this.dawn[i] - this.night[i]) * v;
    this.colors.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
