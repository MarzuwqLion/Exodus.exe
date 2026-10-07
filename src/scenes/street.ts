/**
 * M1 test street block: a Boston street at night in the snow, with procedural props, pooled sodium lights,
 * fog, snow particles, and one character walking with gamepad or keyboard. Kept as a QA scene
 * (`?scene=street`) for the palette and shimmer tests.
 */
import * as THREE from 'three';
import { newPose, samplePose, type AnimName } from '../anim/poses';
import { TUNING } from '../content/tuning';
import { angleOf, dir8, dir8Angle } from '../core/math';
import type { PlayerIntent } from '../core/types';
import type { Game } from '../game';
import { emptyIntent } from '../input/intents';
import { Kit } from '../models/kit';
import { buildRig, defaultLook, type Look } from '../models/rig';
import { CameraRig } from '../render/camera';
import { CharacterRenderer, type CharInstance } from '../render/characters';
import { LightPool } from '../render/lights';
import { materials } from '../render/materials';
import { C } from '../render/palettes';
import { Particles } from '../render/particles';
import type { UiSurface } from '../ui/surface';
import type { GameScene, WorldView } from './scene';

function buildBlock(k: Kit): void {
  // Ground: road, curb, sidewalk, plowed snow edges.
  k.ground(-40, -30, 40, 30, 0, C.night2);
  k.ground(-40, -2, 40, 9, 0.002, C.night3);
  for (let x = -40; x < 40; x += 4) k.box(2, 0.01, 0.15, C.amber0, { x: x + 1, y: 0.004, z: 3.5 });
  k.box(80, 0.15, 3, C.concrete0, { z: -3.5 }, { top: C.concrete1 });
  k.box(80, 0.15, 3, C.concrete0, { z: 10.5 }, { top: C.concrete1 });
  // Snowbanks along the curbs.
  for (let x = -38; x < 38; x += 3.1) {
    const h = 0.35 + ((((x * 7.3) % 1) + 1) % 1) * 0.3;
    k.box(2.6, h, 0.9, C.fog1, { x, z: -1.6 }, { top: C.fog2 });
    k.box(2.2, h * 0.8, 0.8, C.fog1, { x: x + 1.3, z: 8.8 }, { top: C.fog2 });
  }
  // Brick mill row to the north.
  const bricks = [C.rust0, C.rust1, C.night3];
  for (let i = 0; i < 6; i++) {
    const x = -30 + i * 12;
    const h = 7 + (i % 3) * 2.5;
    k.at({ x, z: -10 }, () => {
      k.box(11.4, h, 9, bricks[i % 3], undefined, { top: C.night1 });
      // Windows: a few lit with warm sodium light, most dark.
      for (let row = 0; row < Math.floor(h / 2.6); row++) {
        for (let col = 0; col < 4; col++) {
          const lit = (i * 7 + row * 3 + col * 5) % 9 === 0;
          const wx = -4.2 + col * 2.8;
          const wy = 1.3 + row * 2.6;
          if (lit) k.glow(() => k.box(1.2, 1.3, 0.05, C.amber1, { x: wx, y: wy, z: 4.52 }));
          else k.box(1.2, 1.3, 0.05, C.night0, { x: wx, y: wy, z: 4.52 });
        }
      }
      k.box(1.6, 2.2, 0.1, C.night1, { x: 3.5, z: 4.5 });
    });
  }
  // Streetlamps along the south sidewalk, facing the street.
  for (let x = -30; x <= 30; x += 12) {
    k.at({ x, z: -2.6 }, () => {
      k.cylinder(0.09, 5.2, 6, C.slate0);
      k.box(0.14, 0.14, 1.4, C.slate0, { y: 5.1, z: 0.65 });
      k.box(0.5, 0.18, 0.4, C.slate1, { y: 4.95, z: 1.3 });
      k.glow(() => k.box(0.36, 0.08, 0.28, C.amber2, { y: 4.88, z: 1.3 }));
      k.light({ x: 0, y: 4.6, z: 1.3, color: C.amber2, intensity: 7, range: 10 });
    });
  }
  // Dumpster, pallets, a power pole, a parked wagon shape.
  k.at({ x: -6, z: -4.5 }, () => {
    k.box(2, 1.3, 1.1, C.moss0, undefined, { top: C.moss1 });
    k.box(2.1, 0.12, 1.15, C.night3, { y: 1.3 });
  });
  k.at({ x: 9, z: -4.2 }, () => {
    k.box(1.2, 0.15, 1, C.amber0);
    k.box(1.2, 0.15, 1, C.amber0, { y: 0.2 });
  });
  k.at({ x: 15, z: 9.8 }, () => {
    k.cylinder(0.12, 8, 6, C.rust0);
    k.box(2.4, 0.15, 0.15, C.rust0, { y: 7.4 });
  });
  k.at({ x: 2, z: 6.4, ry: 0 }, () => {
    k.box(4.4, 0.75, 1.8, C.slate0, { y: 0.3 });
    k.box(3.1, 0.6, 1.7, C.slate1, { x: -0.4, y: 1.05 }, { top: C.slate0 });
    k.box(0.4, 0.45, 1.85, C.rust1, { x: 0.3, y: 0.45 });
    k.box(2.4, 0.15, 1.5, C.night3, { x: -0.5, y: 1.7 });
    k.box(1.6, 0.25, 1.2, C.moss0, { x: -0.6, y: 1.85 });
    k.cylinder(0.32, 0.25, 8, C.night0, { x: -1.4, y: 0.32, z: 0.9, rx: Math.PI / 2 });
    k.cylinder(0.32, 0.25, 8, C.night0, { x: 1.4, y: 0.32, z: 0.9, rx: Math.PI / 2 });
    k.glow(() => {
      k.box(0.08, 0.16, 0.3, C.fog2, { x: 2.21, y: 0.65, z: 0.55 });
      k.box(0.08, 0.16, 0.3, C.fog2, { x: 2.21, y: 0.65, z: -0.55 });
      k.box(0.08, 0.14, 0.24, C.amber0, { x: -2.21, y: 0.7, z: 0.6 });
      k.box(0.08, 0.14, 0.24, C.amber0, { x: -2.21, y: 0.7, z: -0.6 });
    });
  });
}

export class StreetScene implements GameScene {
  readonly id = 'street';
  readonly scene = new THREE.Scene();
  readonly rig = new CameraRig();
  private lights: LightPool;
  private particles = new Particles();
  private chars = new CharacterRenderer();
  private walker: CharInstance;
  private pos = { x: 0, z: 2 };
  private vel = { x: 0, z: 0 };
  private facing = 2;
  private phase = 0;
  private animT = 0;
  private anim: AnimName = 'idle';
  private intent: PlayerIntent = emptyIntent();
  private time = 0;
  /** QA: fixed camera, no walker motion. */
  freeze = false;
  /** QA: freeze time (particles, flicker) for pixel comparisons. */
  qaStatic = false;

  constructor(private readonly game: Game) {
    this.scene.fog = new THREE.FogExp2(C.slate0, 0.03);
    const k = new Kit();
    buildBlock(k);
    const out = k.build();
    const m = materials();
    if (out.solid) this.scene.add(new THREE.Mesh(out.solid, m.toon));
    if (out.glow) this.scene.add(new THREE.Mesh(out.glow, m.glow));
    this.lights = new LightPool(this.scene);
    this.lights.addAll(out.lights);
    this.particles.setWeather(game.config.weather ?? 'snow');
    this.scene.add(this.particles.group);
    this.scene.add(this.chars.group);
    const look: Look = {
      ...defaultLook(),
      jacket: C.slate1,
      pants: C.night3,
      coat: true,
      hairStyle: 2,
      hair: C.night1,
      skin: C.skin3,
    };
    this.walker = {
      rig: buildRig(look),
      look,
      x: 0,
      y: 0,
      z: 2,
      yaw: 0,
      pose: newPose(),
      skin01: 1,
      visible: true,
      slice: 0,
      sliceY: 1,
      seamFlicker: false,
      flash: false,
    };
    this.rig.snap = game.config.snap;
    this.rig.teleport(0, 2);
  }

  enter(): void {
    if (this.game.input.playerCount === 0) this.game.input.join('kb1');
  }

  exit(): void {
    this.dispose();
  }

  dispose(): void {
    this.particles.dispose();
  }

  tick(dt: number): void {
    this.time += dt;
    const it = this.game.intents[0] ?? this.intent;
    if (this.freeze) return;
    const max = it.sprint ? TUNING.movement.sprintSpeed : TUNING.movement.briskSpeed;
    const tx = it.move.x * max;
    const tz = it.move.y * max;
    const a = Math.min(1, TUNING.movement.accel * dt);
    this.vel.x += (tx - this.vel.x) * a;
    this.vel.z += (tz - this.vel.z) * a;
    this.pos.x = Math.max(-36, Math.min(36, this.pos.x + this.vel.x * dt));
    this.pos.z = Math.max(-1, Math.min(8.5, this.pos.z + this.vel.z * dt));
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed > 0.2) this.facing = dir8(angleOf(this.vel.x, this.vel.z));
    this.phase += (speed / 1.3) * Math.PI * dt;
    const next: AnimName = speed < 0.15 ? 'idle' : it.sprint ? 'sprint' : speed > 2.2 ? 'brisk' : 'walk';
    if (next !== this.anim) {
      this.anim = next;
      this.animT = 0;
    }
    this.animT += dt;
  }

  frame(_alpha: number, rawDt: number): void {
    const frameDt = this.qaStatic ? 0 : rawDt;
    const w = this.walker;
    w.x = this.pos.x;
    w.z = this.pos.z;
    w.yaw = Math.PI / 2 - dir8Angle(this.facing);
    // Poses update at 12 fps (stepped), positions at 60 fps.
    const step = 1 / TUNING.render.poseFps;
    const tq = Math.floor(this.time / step) * step;
    const phaseQ = Math.floor(this.phase / (Math.PI / 4)) * (Math.PI / 4);
    samplePose(w.pose, this.anim, {
      phase: phaseQ,
      speed: Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 2.6),
      t: tq,
      seed: 0.3,
    });
    this.chars.render([w], frameDt);
    if (!this.freeze) {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      this.rig.follow(
        this.pos.x,
        this.pos.z,
        frameDt,
        1,
        sp > 0.3 ? this.vel.x / sp : 0,
        sp > 0.3 ? this.vel.z / sp : 0,
      );
    } else {
      this.rig.apply();
    }
    this.lights.update(this.rig.focus.x, this.rig.focus.z, this.time);
    this.particles.update(frameDt, this.rig.camera, this.rig.focus.x, this.rig.focus.z, this.rig.zoom);
  }

  world(): WorldView {
    return { scene: this.scene, rig: this.rig };
  }

  drawUi(ui: UiSurface): void {
    if (this.game.config.nohud) return;
    ui.text('Boston. Night one.', 8, 8, C.fog1);
    ui.prompt(
      'LS',
      this.game.input.glyphDevice(0, this.game.save.settings.glyphStyle),
      'Walk',
      8,
      ui.height - 16,
      C.fog1,
    );
  }

  allowJoin(): boolean {
    return true;
  }

  pausable(): boolean {
    return false;
  }

  debugInfo(): Record<string, string | number> {
    return {
      lights: this.lights.active,
      particles: this.particles.instanceTotal,
      snap: this.rig.snap ? 'on' : 'off',
    };
  }
}
