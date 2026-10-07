/**
 * Pooled dynamic lights (spec §4.6): at most ~8 active point lights in view. Scenes register emitters
 * (streetlamps, fluorescents, headlights, beacons); each frame the pool lights the nearest ones to the camera
 * focus and leaves the rest dark (their emissive bulbs still glow).
 */
import * as THREE from 'three';
import { TUNING } from '../content/tuning';
import type { LightSpec } from '../models/kit';
import { C } from './palettes';

/**
 * Light colors are multipliers, not output colors (the output is quantized), so sodium lamps use a saturated
 * orange that makes lit concrete land on the amber ramp instead of drifting toward olive.
 */
function lightTint(hex: number): number {
  if (hex === C.amber2 || hex === C.amber1 || hex === C.amber0) return 0xffa04a;
  if (hex === C.fog2 || hex === C.fog1) return 0xd8e4ff;
  return hex;
}

/** Three's lights are physically based (diffuse is divided by π); specs use intuitive units, scaled here. */
export const LIGHT_SCALE = Math.PI;

export interface Emitter extends LightSpec {
  enabled: boolean;
  /** Multiplies intensity (scene logic: flicker during ALERT, pulsing beacons). */
  gain: number;
  phase: number;
}

export class LightPool {
  readonly lights: THREE.PointLight[] = [];
  readonly emitters: Emitter[] = [];
  readonly ambient: THREE.HemisphereLight;
  readonly moon: THREE.DirectionalLight;
  active = 0;
  private order: Emitter[] = [];
  private slots: (Emitter | null)[] = [];
  private chosen = new Set<Emitter>();

  constructor(scene: THREE.Scene, count: number = TUNING.render.maxLights) {
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 1.4);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
      this.slots.push(null);
    }
    this.ambient = new THREE.HemisphereLight(0x4b525b, 0x0e1013, TUNING.render.ambient * LIGHT_SCALE);
    scene.add(this.ambient);
    this.moon = new THREE.DirectionalLight(0x8c9499, TUNING.render.moon * LIGHT_SCALE);
    this.moon.position.set(-0.4, 1, 0.6);
    scene.add(this.moon);
    scene.add(this.moon.target);
  }

  add(spec: LightSpec): Emitter {
    const e: Emitter = {
      ...spec,
      enabled: true,
      gain: 1,
      phase: (this.emitters.length * 2.399) % (Math.PI * 2),
    };
    this.emitters.push(e);
    return e;
  }

  addAll(specs: readonly LightSpec[]): void {
    for (const s of specs) this.add(s);
  }

  clear(): void {
    this.emitters.length = 0;
    this.slots.fill(null);
  }

  /** Assign pool lights to the nearest enabled emitters around (x, z). `time` drives flicker. */
  update(x: number, z: number, time: number): void {
    const cull = TUNING.render.lightCullDistance;
    const cull2 = cull * cull;
    const order = this.order;
    order.length = 0;
    for (const e of this.emitters) {
      if (!e.enabled || e.gain <= 0) continue;
      const dx = e.x - x;
      const dz = e.z - z;
      if (dx * dx + dz * dz > cull2) continue;
      order.push(e);
    }
    order.sort((a, b) => (a.x - x) ** 2 + (a.z - z) ** 2 - ((b.x - x) ** 2 + (b.z - z) ** 2));
    const n = Math.min(order.length, this.lights.length);
    // Stable slots: an emitter keeps its pool light while it stays among the nearest, so the shader's light
    // order (and its floating-point sums) doesn't change as the camera moves. Lights are never hidden
    // (that would change the light count and force shader recompiles); unused ones get intensity 0.
    const chosen = this.chosen;
    chosen.clear();
    for (let i = 0; i < n; i++) chosen.add(order[i]);
    for (let i = 0; i < this.slots.length; i++) {
      const e = this.slots[i];
      if (e && !chosen.has(e)) this.slots[i] = null;
    }
    for (let i = 0; i < n; i++) {
      const e = order[i];
      if (this.slots.includes(e)) continue;
      const free = this.slots.indexOf(null);
      if (free >= 0) this.slots[free] = e;
    }
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const e = this.slots[i];
      if (!e) {
        l.intensity = 0;
        continue;
      }
      let k = e.gain;
      if (e.flicker && e.flicker > 0) {
        // Mostly steady, with occasional sharp dips (fluorescent tubes).
        const s = Math.sin(time * 13.7 + e.phase) * Math.sin(time * 3.1 + e.phase * 2.3);
        if (s > 0.93) k *= 1 - e.flicker;
      }
      l.color.setHex(lightTint(e.color));
      l.intensity = e.intensity * k * LIGHT_SCALE;
      l.distance = e.range;
      l.position.set(e.x, e.y, e.z);
    }
    this.active = n;
  }
}
