/**
 * The 3D view of a running stop: syncs characters (with render interpolation, 12 fps poses, 8-direction facing,
 * glitch slices), the party car, the Recycler van, drones and their searchlights, heaved vending machines, and
 * view-cone fans clipped by line of sight. Reads the simulation; never writes it.
 */
import * as THREE from 'three';
import { newPose, samplePose, type AnimName, type Pose } from '../anim/poses';
import { TUNING } from '../content/tuning';
import { dir8, dir8Angle } from '../core/math';
import { Kit } from '../models/kit';
import { PARTY_LOOKS, npcLook } from '../models/looks';
import { buildRig, type Look, type RigDef } from '../models/rig';
import type { StopSim } from '../sim/stop';
import type { Activity, MemberActor, NpcActor } from '../sim/types';
import { CharacterRenderer, type CharInstance } from './characters';
import { MASK, materials, withMask } from './materials';
import { C } from './palettes';

interface Animated {
  inst: CharInstance;
  poseT: number;
  lastDir: number;
  tweenFrames: number;
}

function animFor(a: Activity): AnimName {
  return a as AnimName;
}

const RAYS = 14;

/** A fan on the ground: observer cones and drone searchlights. */
export class ConeFan {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private mat: THREE.MeshBasicMaterial;

  constructor(color: number, opacity: number) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array((RAYS + 1) * 3 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      fog: false,
    });
    // Keep whatever post-processing tag lies underneath (characters stay outlined; no bloom).
    this.mat.blending = THREE.CustomBlending;
    this.mat.blendSrc = THREE.SrcAlphaFactor;
    this.mat.blendDst = THREE.OneMinusSrcAlphaFactor;
    this.mat.blendSrcAlpha = THREE.ZeroFactor;
    this.mat.blendDstAlpha = THREE.OneFactor;
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  setColor(color: number, opacity: number): void {
    this.mat.color.setHex(color);
    this.mat.opacity = opacity;
  }

  /** Rebuild the fan from (x, y) facing `facing`, clipped by sight (needs the stop's grid to clip). */
  update(
    sim: StopSim | null,
    x: number,
    y: number,
    facing: number,
    coneDeg: number,
    range: number,
    clip: boolean,
  ): void {
    const half = (coneDeg * Math.PI) / 360;
    const ends: [number, number][] = [];
    for (let i = 0; i <= RAYS; i++) {
      const a = facing - half + (i / RAYS) * half * 2;
      let r = range;
      if (clip && sim) {
        // March the ray until the first opaque tile.
        for (let d = 0.5; d <= range; d += 0.35) {
          if (sim.grid.opaque(Math.floor(x + Math.cos(a) * d), Math.floor(y + Math.sin(a) * d))) {
            r = d;
            break;
          }
        }
      }
      ends.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    let o = 0;
    for (let i = 0; i < RAYS; i++) {
      const [ax, ay] = ends[i];
      const [bx, by] = ends[i + 1];
      this.pos[o++] = x;
      this.pos[o++] = 0.03;
      this.pos[o++] = y;
      this.pos[o++] = bx;
      this.pos[o++] = 0.03;
      this.pos[o++] = by;
      this.pos[o++] = ax;
      this.pos[o++] = 0.03;
      this.pos[o++] = ay;
    }
    for (; o < this.pos.length; o++) this.pos[o] = 0;
    (this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.mesh.geometry.computeBoundingSphere();
    this.mesh.visible = true;
  }
}

function buildMesh(build: (k: Kit) => void): THREE.Group {
  const k = new Kit();
  build(k);
  const out = k.build();
  const g = new THREE.Group();
  const m = materials();
  if (out.solid) g.add(new THREE.Mesh(out.solid, m.toon));
  if (out.glow) g.add(new THREE.Mesh(out.glow, m.glow));
  return g;
}

/** Placeholder-free station wagon (until the full vehicle models land, this is the party car). */
export function wagonMesh(): THREE.Group {
  return buildMesh((k) => {
    k.box(4.4, 0.75, 1.8, C.slate0, { y: 0.3 }, { top: C.slate1 });
    k.box(3.2, 0.62, 1.7, C.slate1, { x: -0.35, y: 1.05 }, { top: C.slate0 });
    k.box(0.5, 0.5, 1.84, C.rust1, { x: 0.35, y: 0.42 });
    k.box(2.6, 0.12, 1.5, C.night3, { x: -0.45, y: 1.7 });
    k.box(1.8, 0.28, 1.25, C.moss0, { x: -0.6, y: 1.82 }, { top: C.moss1 });
    k.box(3.0, 0.42, 0.04, C.night1, { x: -0.35, y: 1.15, z: 0.86 });
    for (const sx of [-1.4, 1.4]) {
      k.cylinder(0.33, 0.24, 8, C.night0, { x: sx, y: 0.33, z: 0.84, rx: Math.PI / 2 });
      k.cylinder(0.33, 0.24, 8, C.night0, { x: sx, y: 0.33, z: -0.84 - 0.24, rx: Math.PI / 2 });
    }
    k.glow(() => {
      k.box(0.06, 0.16, 0.3, C.fog2, { x: 2.21, y: 0.62, z: 0.55 });
      k.box(0.06, 0.16, 0.3, C.fog2, { x: 2.21, y: 0.62, z: -0.55 });
      k.box(0.06, 0.14, 0.24, C.amber0, { x: -2.21, y: 0.68, z: 0.6 });
      k.box(0.06, 0.14, 0.24, C.amber0, { x: -2.21, y: 0.68, z: -0.6 });
    });
  });
}

export function vanMesh(): { body: THREE.Group; bar: THREE.Group; barOn: THREE.Group } {
  const body = buildMesh((k) => {
    k.box(5.2, 1.0, 2.1, C.fog1, { y: 0.35 }, { top: C.fog2 });
    k.box(3.9, 1.25, 2.05, C.fog1, { x: -0.6, y: 1.35 }, { top: C.fog2 });
    k.box(1.3, 0.75, 2.0, C.fog0, { x: 1.95, y: 1.35 });
    k.box(0.05, 0.5, 1.6, C.night1, { x: 2.61, y: 1.45 });
    k.box(3.6, 0.14, 0.03, C.slate1, { x: -0.6, y: 1.25, z: 1.04 });
    for (const sx of [-1.7, 1.6]) {
      k.cylinder(0.36, 0.26, 8, C.night0, { x: sx, y: 0.36, z: 0.98, rx: Math.PI / 2 });
      k.cylinder(0.36, 0.26, 8, C.night0, { x: sx, y: 0.36, z: -0.98 - 0.26, rx: Math.PI / 2 });
    }
    k.glow(() => {
      k.box(0.05, 0.16, 0.36, C.fog2, { x: 2.61, y: 0.7, z: 0.65 });
      k.box(0.05, 0.16, 0.36, C.fog2, { x: 2.61, y: 0.7, z: -0.65 });
    });
  });
  const bar = buildMesh((k) => k.box(0.4, 0.14, 1.4, C.slate1, { x: 0.9, y: 2.0 }));
  const barOn = buildMesh((k) => k.glow(() => k.box(0.4, 0.14, 1.4, C.red1, { x: 0.9, y: 2.0 })));
  return { body, bar, barOn };
}

export function droneMesh(): THREE.Group {
  return buildMesh((k) => {
    k.box(0.5, 0.18, 0.5, C.slate0, undefined, { top: C.slate1 });
    for (const [dx, dz] of [
      [0.42, 0.42],
      [-0.42, 0.42],
      [0.42, -0.42],
      [-0.42, -0.42],
    ]) {
      k.box(0.36, 0.06, 0.08, C.night3, { x: dx * 0.6, y: 0.1, z: dz * 0.6, ry: Math.PI / 4 });
      k.cylinder(0.2, 0.04, 6, C.night2, { x: dx, y: 0.16, z: dz });
    }
    k.glow(() => k.box(0.18, 0.08, 0.18, C.cyan1, { y: -0.06 }));
  });
}

export class StopView {
  readonly group = new THREE.Group();
  readonly chars = new CharacterRenderer();
  private members: Animated[] = [];
  private npcs: Animated[] = [];
  private rigCache = new Map<string, RigDef>();
  private car: THREE.Group;
  private van: { body: THREE.Group; bar: THREE.Group; barOn: THREE.Group } | null = null;
  private vanAt: { x: number; y: number } | null = null;
  private drones: { mesh: THREE.Group; fan: ConeFan }[] = [];
  private heavies: THREE.Group[] = [];
  private cones: ConeFan[] = [];
  private time = 0;
  /** Show observer cones (Vesper's sense, or the debug overlay). */
  showCones: 'none' | 'vesper' | 'all' = 'none';
  /** Ground height under an actor (the Port's gangway climbs to the deck). */
  heightAt: ((x: number, z: number) => number) | null = null;
  private list: CharInstance[] = [];

  constructor(
    private readonly sim: StopSim,
    vending: () => THREE.Group,
  ) {
    this.group.add(this.chars.group);
    this.car = wagonMesh();
    const car = sim.cfg.layout.car;
    this.car.position.set(car.x + 0.5, 0, car.y + 0.5);
    const yaw = { east: 0, west: Math.PI, north: Math.PI / 2, south: -Math.PI / 2 }[car.facing];
    this.car.rotation.y = yaw;
    this.group.add(this.car);
    for (const h of sim.heavies) {
      const g = vending();
      g.position.set(h.tx + 0.5, 0, h.ty + 0.5);
      this.heavies.push(g);
      this.group.add(g);
    }
  }

  private rig(key: string, look: Look): RigDef {
    let r = this.rigCache.get(key);
    if (!r) {
      r = buildRig(look);
      this.rigCache.set(key, r);
    }
    return r;
  }

  private ensure(): void {
    const sim = this.sim;
    while (this.members.length < sim.members.length) {
      const m = sim.members[this.members.length];
      const look = PARTY_LOOKS[m.id];
      this.members.push(this.newAnimated(this.rig(`m:${m.id}`, look), look));
    }
    while (this.npcs.length < sim.npcs.length) {
      const n = sim.npcs[this.npcs.length];
      const look = npcLook(n.role, n.lookSeed);
      this.npcs.push(this.newAnimated(this.rig(`n:${n.idx}:${n.lookSeed}`, look), look));
    }
    while (this.drones.length < sim.drones.length) {
      const mesh = droneMesh();
      const fan = new ConeFan(C.cyan1, 0.22);
      this.group.add(mesh, fan.mesh);
      this.drones.push({ mesh, fan });
    }
  }

  private newAnimated(rig: RigDef, look: Look): Animated {
    const inst: CharInstance = {
      rig,
      look,
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pose: newPose(),
      skin01: 1,
      visible: true,
      slice: 0,
      sliceY: 1.1,
      seamFlicker: false,
      flash: false,
    };
    return { inst, poseT: -1, lastDir: 2, tweenFrames: 0 };
  }

  /** Van arrived (sweep or ALERT). */
  showVan(x: number, y: number): void {
    if (!this.van) {
      this.van = vanMesh();
      this.group.add(this.van.body, this.van.bar, this.van.barOn);
    }
    this.vanAt = { x, y };
    for (const g of [this.van.body, this.van.bar, this.van.barOn]) {
      g.position.set(x - 0.5, 0, y);
      g.rotation.y = x > this.sim.grid.w / 2 ? Math.PI : 0;
    }
  }

  update(alpha: number, dt: number): void {
    const sim = this.sim;
    this.time += dt;
    this.ensure();
    this.list.length = 0;
    const step = 1 / TUNING.render.poseFps;
    for (let i = 0; i < sim.members.length; i++) {
      const m = sim.members[i];
      const a = this.members[i];
      const show = m.mode !== 'gone' && m.mode !== 'inCar' && m.mode !== 'aboard';
      a.inst.visible = show;
      if (!show) continue;
      this.syncMember(m, a, alpha, step);
      this.list.push(a.inst);
    }
    for (let i = 0; i < sim.npcs.length; i++) {
      const n = sim.npcs[i];
      const a = this.npcs[i];
      a.inst.visible = n.mode !== 'gone';
      if (!a.inst.visible) continue;
      this.syncNpc(n, a, alpha, step);
      this.list.push(a.inst);
    }
    this.chars.render(this.list, dt);
    // Drones and their searchlights.
    for (let i = 0; i < sim.drones.length; i++) {
      const d = sim.drones[i];
      const v = this.drones[i];
      const x = d.px + (d.x - d.px) * alpha;
      const y = d.py + (d.y - d.py) * alpha;
      v.mesh.position.set(x, d.z + Math.sin(this.time * 2 + i) * 0.08, y);
      v.mesh.rotation.y = -d.heading;
      v.fan.setColor(C.cyan1, sim.alert.on ? 0.3 : 0.2);
      v.fan.update(
        sim,
        x,
        y,
        d.beam,
        TUNING.observers.drone.coneDeg,
        TUNING.observers.drone.range * sim.currentRangeMult(),
        false,
      );
    }
    // Heaved vending machines.
    for (let i = 0; i < sim.heavies.length; i++) {
      const h = sim.heavies[i];
      const g = this.heavies[i];
      g.position.x += (h.tx + 0.5 - g.position.x) * Math.min(1, dt * 10);
      g.position.z += (h.ty + 0.5 - g.position.z) * Math.min(1, dt * 10);
    }
    // Van light bar flashes red only during ALERT.
    if (this.van) {
      const flash = sim.alert.on && Math.sin(this.time * 14) > 0;
      this.van.barOn.visible = flash;
      this.van.bar.visible = !flash;
    }
    this.updateCones();
  }

  private syncMember(m: MemberActor, a: Animated, alpha: number, step: number): void {
    const inst = a.inst;
    inst.x = m.px + (m.x - m.px) * alpha;
    inst.z = m.py + (m.y - m.py) * alpha;
    inst.y = this.heightAt ? this.heightAt(inst.x, inst.z) : 0;
    inst.skin01 = this.sim.skin01(m);
    inst.seamFlicker = m.mode === 'shutdown';
    inst.flash = m.hitFlash > 0.06;
    inst.noShadow = m.mode === 'carried';
    // Glitch: freeze, slice the upper body sideways, jitter.
    if (m.mode === 'glitch') {
      inst.slice = Math.sin(this.time * 97) > 0 ? 0.12 : -0.08;
      inst.x += Math.sin(this.time * 131) * 0.03;
    } else inst.slice = 0;
    if (m.mode === 'carried') inst.y += 0.15;
    this.face(a, m.dir, m.headSnapT > 0 ? m.facing : null);
    this.pose(a, m.activity, m.activityT, m.gait, m.speed01, m.idx * 0.37, step, m.mode === 'glitch');
  }

  private syncNpc(n: NpcActor, a: Animated, alpha: number, step: number): void {
    const inst = a.inst;
    inst.x = n.px + (n.x - n.px) * alpha;
    inst.z = n.py + (n.y - n.py) * alpha;
    inst.y = this.heightAt ? this.heightAt(inst.x, inst.z) : 0;
    inst.flash = n.hitFlash > 0.06;
    let dir = n.dir;
    if (n.mode !== 'ko' && Math.hypot(n.vx, n.vy) < 0.15) {
      // Standing NPCs show their gaze direction (glances included).
      const f = n.lookT > 0 && n.lookAt ? Math.atan2(n.lookAt.y - n.y, n.lookAt.x - n.x) : n.facing;
      dir = dir8(f);
    }
    this.face(a, dir, null);
    this.pose(a, n.activity, n.activityT, n.gait, n.speed01, (n.lookSeed % 100) / 100, step, false);
    // Recyclers: the baton tip flashes red during the wind-up (telegraph).
    inst.seamFlicker = false;
  }

  private face(a: Animated, dir: number, exact: number | null): void {
    const inst = a.inst;
    if (exact !== null) {
      inst.yaw = Math.PI / 2 - exact;
      return;
    }
    // Facing snaps to 8 directions with at most a one-frame tween.
    if (dir !== a.lastDir) {
      const from = Math.PI / 2 - dir8Angle(a.lastDir);
      const to = Math.PI / 2 - dir8Angle(dir);
      let d = to - from;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      inst.yaw = from + d / 2;
      a.lastDir = dir;
      a.tweenFrames = 1;
      return;
    }
    if (a.tweenFrames > 0) a.tweenFrames--;
    inst.yaw = Math.PI / 2 - dir8Angle(dir);
  }

  private pose(
    a: Animated,
    act: Activity,
    actT: number,
    gait: number,
    speed: number,
    seed: number,
    step: number,
    frozen: boolean,
  ): void {
    if (frozen) return;
    // Poses update at 12 fps ("on twos"); positions still move at 60.
    if (a.poseT >= 0 && this.time - a.poseT < step) return;
    a.poseT = this.time;
    const pose: Pose = a.inst.pose;
    samplePose(pose, animFor(act), { phase: gait, speed, t: Math.floor(actT / step) * step, seed });
  }

  private updateCones(): void {
    const sim = this.sim;
    let used = 0;
    if (this.showCones !== 'none') {
      let vx = 0;
      let vy = 0;
      if (this.showCones === 'vesper') {
        const v = sim.member('vesper');
        if (!v || v.controller === null || !sim.available(v)) {
          for (const c of this.cones) c.mesh.visible = false;
          return;
        }
        vx = v.x;
        vy = v.y;
      }
      const near = (x: number, y: number): boolean =>
        this.showCones === 'all' || Math.hypot(x - vx, y - vy) <= 8;
      for (const n of sim.npcs) {
        if (!sim.isActiveNpc(n) || n.role === 'keeper' || n.role === 'crew' || n.role === 'mensah') continue;
        if (!near(n.x, n.y)) continue;
        const cone = this.cone(used++);
        const s = n.obs.state;
        const red = s === 'suspicious' || s === 'alarmed';
        cone.setColor(red ? C.red1 : C.fog1, n.blindT > 0 ? 0.04 : red ? 0.16 : 0.1);
        const f = n.lookT > 0 && n.lookAt ? Math.atan2(n.lookAt.y - n.y, n.lookAt.x - n.x) : n.facing;
        cone.update(sim, n.x, n.y, f, n.obs.coneDeg, n.obs.range * sim.currentRangeMult(), true);
      }
      for (const c of sim.cameras) {
        if (!near(c.x, c.y)) continue;
        const cone = this.cone(used++);
        cone.setColor(C.fog1, 0.1);
        cone.update(sim, c.x, c.y, c.facing, c.obs.coneDeg, c.obs.range * sim.currentRangeMult(), true);
      }
    }
    for (let i = used; i < this.cones.length; i++) this.cones[i].mesh.visible = false;
  }

  private cone(i: number): ConeFan {
    while (this.cones.length <= i) {
      const c = new ConeFan(C.fog1, 0.1);
      this.cones.push(c);
      this.group.add(c.mesh);
    }
    return this.cones[i];
  }

  /** World position above an actor's head (for UI icons). */
  headOf(isMember: boolean, idx: number): THREE.Vector3 | null {
    const a = isMember ? this.members[idx] : this.npcs[idx];
    if (!a || !a.inst.visible) return null;
    const h = a.inst.rig.top + (a.inst.pose.bob < -0.5 ? a.inst.pose.bob : 0);
    return new THREE.Vector3(a.inst.x, a.inst.y + h + 0.15, a.inst.z);
  }

  carPosition(): THREE.Vector3 {
    return this.car.position;
  }

  vanPosition(): { x: number; y: number } | null {
    return this.vanAt;
  }
}

export { MASK, withMask };
