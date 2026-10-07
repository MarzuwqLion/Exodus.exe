/**
 * Particles are world-anchored: the box only decides where they wrap, so camera motion never drags them.
 *
 * Always-present particles (spec §4.6): snow, sleet, rain (with 1-texel ground splashes), fog wisps, smog
 * motes, interior dust, and insects around lamps. Each set is one InstancedBufferGeometry whose motion is
 * computed entirely in the vertex shader from time, a per-instance seed, and a global wind vector, so there is
 * no per-frame CPU work. Sparks are a small CPU-driven emissive burst system.
 */
import * as THREE from 'three';
import type { Weather } from '../core/types';
import { TUNING } from '../content/tuning';
import { C } from './palettes';
import { MASK } from './materials';

export type ParticleKind = 'snow' | 'rain' | 'splash' | 'wisp' | 'mote' | 'insect' | 'dust';

const VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
uniform vec3 uWind;
uniform float uFall;
uniform vec2 uSize;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uKind;
uniform vec3 uLamps[8];
uniform float uLampCount;
void main() {
  vec3 p;
  float t = uTime;
  vec2 corner = position.xy;
  vec2 size = uSize;
  if (uKind < 0.5) {
    // snow / sleet: slow fall, sideways drift with wind and a little wobble
    p = aSeed.xyz * uBoxSize + vec3(uWind.x * t + sin(t * (0.6 + aSeed.w) + aSeed.w * 30.0) * 0.35,
                                    -uFall * (0.75 + aSeed.w * 0.5) * t,
                                    uWind.z * t + cos(t * 0.7 + aSeed.w * 20.0) * 0.25);
    p = mod(p - uBoxMin, uBoxSize) + uBoxMin;
  } else if (uKind < 1.5) {
    // rain streaks: fast, slanted by wind
    p = aSeed.xyz * uBoxSize + vec3(uWind.x * t * 0.6, -uFall * (0.85 + aSeed.w * 0.3) * t, uWind.z * t * 0.6);
    p = mod(p - uBoxMin, uBoxSize) + uBoxMin;
  } else if (uKind < 2.5) {
    // ground splashes: each one appears briefly at a random spot, then moves elsewhere
    float cycle = 0.45 + aSeed.w * 0.4;
    float k = floor((t + aSeed.w * 7.0) / cycle);
    float f = fract((t + aSeed.w * 7.0) / cycle);
    vec2 r = fract(vec2(sin(k * 12.9898 + aSeed.x * 78.233), sin(k * 39.346 + aSeed.y * 11.135)) * 43758.5453);
    p = vec3(r.x * uBoxSize.x, 0.03, r.y * uBoxSize.z);
    p.xz = mod(p.xz - uBoxMin.xz, uBoxSize.xz) + uBoxMin.xz;
    if (f > 0.22) size = vec2(0.0);
  } else if (uKind < 3.5) {
    // fog wisps: long horizontal dashes drifting low
    p = aSeed.xyz * uBoxSize + vec3(uWind.x * t * 0.5 + t * 0.3, 0.0, uWind.z * t * 0.3);
    p = mod(p - uBoxMin, uBoxSize) + uBoxMin;
    p.y = 0.15 + aSeed.y * 1.6;
  } else if (uKind < 4.5) {
    // motes (smog, dust): very slow drift
    p = aSeed.xyz * uBoxSize + vec3(sin(t * 0.21 + aSeed.w * 10.0) * 0.6 + uWind.x * t * 0.1,
                                    sin(t * 0.17 + aSeed.w * 6.0) * 0.4,
                                    cos(t * 0.19 + aSeed.w * 8.0) * 0.6);
    p = mod(p - uBoxMin, uBoxSize) + uBoxMin;
  } else {
    // insects: erratic orbits around lamps
    int li = int(mod(floor(aSeed.w * 97.0), max(uLampCount, 1.0)));
    vec3 c = uLamps[li];
    float a = t * (2.0 + aSeed.x * 3.0) + aSeed.y * 40.0;
    float rad = 0.35 + aSeed.z * 0.6;
    p = c + vec3(cos(a) * rad + sin(t * 7.1 + aSeed.x * 9.0) * 0.12,
                 sin(a * 1.3) * 0.35 - 0.3,
                 sin(a) * rad * 0.7);
    if (uLampCount < 0.5) size = vec2(0.0);
  }
  vec3 world = p + uRight * corner.x * size.x + uUp * corner.y * size.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uMask;
void main() {
  gl_FragColor = vec4(uColor, uMask);
}`;

interface Layer {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  kind: ParticleKind;
}

const KIND_ID: Record<ParticleKind, number> = {
  snow: 0,
  rain: 1,
  splash: 2,
  wisp: 3,
  mote: 4,
  dust: 4,
  insect: 5,
};

function color(hex: number): THREE.Color {
  return new THREE.Color(hex);
}

export interface WeatherLook {
  layers: { kind: ParticleKind; count: number; color: number; fall: number; size: [number, number] }[];
}

/** Particle recipe per weather (sizes in texels: 1–2 texel quads). */
export function weatherLook(w: Weather, interior: boolean): WeatherLook {
  if (interior) return { layers: [{ kind: 'dust', count: 120, color: C.fog0, fall: 0, size: [1, 1] }] };
  switch (w) {
    case 'snow':
      return {
        layers: [
          { kind: 'snow', count: 1500, color: C.fog1, fall: 1.1, size: [1.5, 1.5] },
          { kind: 'snow', count: 500, color: C.fog2, fall: 1.4, size: [2, 2] },
        ],
      };
    case 'sleet':
      return {
        layers: [
          { kind: 'snow', count: 900, color: C.fog1, fall: 3.2, size: [1, 1.5] },
          { kind: 'rain', count: 600, color: C.fog0, fall: 9, size: [1, 2] },
          { kind: 'splash', count: 120, color: C.fog0, fall: 0, size: [1, 1] },
        ],
      };
    case 'clearcold':
      return { layers: [{ kind: 'snow', count: 260, color: C.fog0, fall: 0.5, size: [1, 1] }] };
    case 'rain':
      return {
        layers: [
          { kind: 'rain', count: 1700, color: C.fog0, fall: 13, size: [1, 2.2] },
          { kind: 'splash', count: 320, color: C.fog1, fall: 0, size: [1.2, 1] },
        ],
      };
    case 'drizzle':
      return {
        layers: [
          { kind: 'rain', count: 800, color: C.concrete2, fall: 8, size: [1, 1.6] },
          { kind: 'splash', count: 110, color: C.fog0, fall: 0, size: [1, 1] },
        ],
      };
    case 'heavyrain':
    case 'storm':
      return {
        layers: [
          { kind: 'rain', count: 2800, color: C.fog0, fall: 16, size: [1, 2.6] },
          { kind: 'splash', count: 600, color: C.fog1, fall: 0, size: [1.2, 1] },
        ],
      };
    case 'fog':
      return {
        layers: [
          { kind: 'wisp', count: 260, color: C.fog0, fall: 0, size: [5, 1] },
          { kind: 'mote', count: 160, color: C.concrete2, fall: 0, size: [1, 1] },
        ],
      };
    case 'smog':
      return {
        layers: [
          { kind: 'mote', count: 420, color: C.amber0, fall: 0, size: [1, 1] },
          { kind: 'wisp', count: 120, color: C.slate1, fall: 0, size: [6, 1] },
        ],
      };
    case 'humid':
      return {
        layers: [
          { kind: 'insect', count: 90, color: C.fog1, fall: 0, size: [1, 1] },
          { kind: 'mote', count: 200, color: C.moss1, fall: 0, size: [1, 1] },
        ],
      };
    default:
      return {
        layers: [
          { kind: 'mote', count: 220, color: C.concrete1, fall: 0, size: [1, 1] },
          { kind: 'insect', count: 40, color: C.fog1, fall: 0, size: [1, 1] },
        ],
      };
  }
}

export class Particles {
  readonly group = new THREE.Group();
  private layers: Layer[] = [];
  readonly wind = new THREE.Vector3(0.6, 0, 0.15);
  private lamps: THREE.Vector3[] = Array.from({ length: 8 }, () => new THREE.Vector3());
  private lampCount = 0;
  private time = 0;

  constructor() {
    this.group.frustumCulled = false;
  }

  /** Rebuild layers for a weather (or interior dust). */
  setWeather(w: Weather, interior = false): void {
    this.dispose();
    const look = weatherLook(w, interior);
    for (const l of look.layers) this.addLayer(l.kind, l.count, l.color, l.fall, l.size);
    // Insects in humid Florida air also orbit lamps even in rain.
    if ((w === 'heavyrain' || w === 'storm' || w === 'rain') && !interior) {
      // none: rain keeps them down
    }
  }

  /** Lamp positions for insects (up to 8). */
  setLamps(points: readonly { x: number; y: number; z: number }[]): void {
    this.lampCount = Math.min(8, points.length);
    for (let i = 0; i < this.lampCount; i++) this.lamps[i].set(points[i].x, points[i].y, points[i].z);
  }

  private addLayer(
    kind: ParticleKind,
    count: number,
    hex: number,
    fall: number,
    size: [number, number],
  ): void {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    const seeds = new Float32Array(count * 4);
    // Deterministic seeds (rendering only; independent of the simulation RNG).
    let s = 0x9e3779b9 ^ (count * 2654435761);
    const rnd = (): number => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) % 100000) / 100000;
    };
    for (let i = 0; i < count * 4; i++) seeds[i] = rnd();
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = count;
    const tex = TUNING.render.worldPerTexel;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uBoxMin: { value: new THREE.Vector3() },
        uBoxSize: { value: new THREE.Vector3(40, 14, 34) },
        uWind: { value: this.wind },
        uFall: { value: fall },
        uSize: { value: new THREE.Vector2(size[0] * tex, size[1] * tex * 1.6) },
        uRight: { value: new THREE.Vector3(1, 0, 0) },
        uUp: { value: new THREE.Vector3(0, 1, 0) },
        uKind: { value: KIND_ID[kind] },
        uColor: { value: color(hex) },
        uMask: { value: MASK.surface },
        uLamps: { value: this.lamps },
        uLampCount: { value: 0 },
      },
      depthWrite: true,
      depthTest: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.group.add(mesh);
    this.layers.push({ mesh, mat, kind });
  }

  /** Follow the camera: the particle box is centered on the focus. */
  private right = new THREE.Vector3();
  private up = new THREE.Vector3();

  update(dt: number, camera: THREE.Camera, focusX: number, focusZ: number, zoom: number): void {
    this.time += dt;
    const right = this.right.setFromMatrixColumn(camera.matrixWorld, 0);
    const up = this.up.setFromMatrixColumn(camera.matrixWorld, 1);
    const w = 30 * zoom + 8;
    const d = 30 * zoom + 8;
    for (const l of this.layers) {
      const u = l.mat.uniforms;
      u.uTime.value = this.time;
      u.uRight.value.copy(right);
      u.uUp.value.copy(up);
      u.uLampCount.value = this.lampCount;
      const h = l.kind === 'splash' ? 0.1 : l.kind === 'dust' ? 3 : 12;
      u.uBoxSize.value.set(w, h, d);
      // Whole-meter box origin: particles stay exactly world-anchored between camera moves (no float jitter).
      // The box reaches further south than north because high particles show up north of where they are.
      u.uBoxMin.value.set(
        Math.floor(focusX - w / 2),
        l.kind === 'dust' ? 0.2 : 0,
        Math.floor(focusZ - d * 0.37),
      );
    }
  }

  get instanceTotal(): number {
    let n = 0;
    for (const l of this.layers) n += (l.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount;
    return n;
  }

  dispose(): void {
    for (const l of this.layers) {
      this.group.remove(l.mesh);
      l.mesh.geometry.dispose();
      l.mat.dispose();
    }
    this.layers = [];
  }
}

/** CPU-driven emissive sparks (damage, hits, shorting units). */
export class Sparks {
  readonly mesh: THREE.InstancedMesh;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private next = 0;
  private readonly max: number;
  private m = new THREE.Matrix4();

  constructor(max = 96) {
    this.max = max;
    const g = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: C.amber2, fog: false });
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\n\tgl_FragColor.a = 1.0;',
      );
    };
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(C.amber2));
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    for (let i = 0; i < max; i++) {
      this.m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, new THREE.Color(C.amber2));
    }
  }

  /** Emit a burst at a point. `hex` is amber for sparks, red for exposed seams, cyan for EMP. */
  burst(x: number, y: number, z: number, n: number, hex: number = C.amber2, speed = 3): void {
    const col = new THREE.Color(hex);
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const a = (k / n) * Math.PI * 2 + Math.sin(k * 12.9898 + x) * 0.8;
      const up = 1.5 + Math.abs(Math.sin(k * 78.233 + z)) * 2.5;
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = Math.cos(a) * speed * (0.4 + Math.abs(Math.sin(k * 3.7)));
      this.vel[i * 3 + 1] = up;
      this.vel[i * 3 + 2] = Math.sin(a) * speed * 0.6;
      this.life[i] = 0.25 + Math.abs(Math.sin(k * 5.1 + y)) * 0.35;
      this.mesh.setColorAt(i, col);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    const s = TUNING.render.worldPerTexel * 1.3;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 9.8 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(0.02, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.life[i] <= 0) this.m.makeScale(0, 0, 0);
      else this.m.makeScale(s, s, s).setPosition(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
