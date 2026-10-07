/**
 * The intro (spec §13.4): about 50 s, skippable. Seven lines fade in one at a time over slow pans of Boston at
 * night in the snow. Hold A to hurry a line along; B (or Start) skips to the end. Then night one or the map.
 */
import * as THREE from 'three';
import { INTRO_LINES } from '../content/conversations';
import type { Game } from '../game';
import { Kit } from '../models/kit';
import { CameraRig } from '../render/camera';
import { LightPool } from '../render/lights';
import { materials } from '../render/materials';
import { C } from '../render/palettes';
import { Particles } from '../render/particles';
import type { UiSurface } from '../ui/surface';
import { centered, fadeColor } from './finale';
import type { GameScene, WorldView } from './scene';
import { buildBlock } from './street';

/** A palette-locked fade: the line steps up through darker fog tones to its own. */
const FADE = [C.slate0, C.slate1, C.fog0, C.fog1, C.fog2];
/** Seconds per line (the last one holds longer), and the slow pan each line rides. */
const LINE_SECONDS = 6.6;
const LAST_HOLD = 4;
const PANS: readonly { from: [number, number, number]; to: [number, number, number] }[] = [
  { from: [-18, 1, 1.0], to: [-11, 1, 0.95] },
  { from: [-14, -2, 0.9], to: [-6, -1, 0.85] },
  { from: [-4, 2, 1.0], to: [4, 2, 0.95] },
  { from: [6, -1, 0.85], to: [14, 0, 0.8] },
  { from: [12, 3, 1.0], to: [18, 2, 0.95] },
  { from: [18, -3, 0.9], to: [11, -2, 0.85] },
  { from: [6, 5, 0.75], to: [2, 5.5, 0.7] },
];

export class IntroScene implements GameScene {
  readonly id = 'intro';
  private scene = new THREE.Scene();
  private rig = new CameraRig();
  private lights: LightPool;
  private particles = new Particles();
  private time = 0;
  private done = false;
  private readonly next: string;

  constructor(
    private readonly game: Game,
    params?: Record<string, unknown>,
  ) {
    this.next = typeof params?.next === 'string' ? params.next : 'map';
    this.scene.fog = new THREE.FogExp2(C.slate0, 0.04);
    const k = new Kit();
    buildBlock(k);
    const out = k.build();
    const m = materials();
    if (out.solid) this.scene.add(new THREE.Mesh(out.solid, m.toon));
    if (out.glow) this.scene.add(new THREE.Mesh(out.glow, m.glow));
    this.lights = new LightPool(this.scene);
    this.lights.addAll(out.lights);
    this.particles.setWeather('snow');
    this.scene.add(this.particles.group);
    this.rig.snap = game.config.snap;
    const [x, z, zoom] = PANS[0].from;
    this.rig.teleport(x, z, zoom);
  }

  enter(): void {
    this.game.audio.setMusic('scene');
  }

  exit(): void {}

  dispose(): void {
    this.particles.dispose();
  }

  allowJoin(): boolean {
    return true;
  }

  pausable(): boolean {
    return false;
  }

  private get total(): number {
    return INTRO_LINES.length * LINE_SECONDS + LAST_HOLD;
  }

  tick(dt: number): void {
    const its = [this.game.intents[0], this.game.intents[1]];
    // Holding A hurries the lines along; B or Start skips the intro.
    const hurry = its.some((it) => it?.interactHeld || it?.confirm);
    this.time += dt * (hurry ? 3 : 1);
    if (its.some((it) => it?.cancel || it?.pause) && this.time > 0.5) this.time = this.total;
    if (this.time >= this.total && !this.done) {
      this.done = true;
      this.game.goto(this.next, undefined, 'wipe');
    }
  }

  frame(_alpha: number, dt: number): void {
    const i = Math.min(PANS.length - 1, Math.floor(this.time / LINE_SECONDS));
    const u = Math.min(1, (this.time - i * LINE_SECONDS) / LINE_SECONDS);
    const p = PANS[i];
    const x = p.from[0] + (p.to[0] - p.from[0]) * u;
    const z = p.from[1] + (p.to[1] - p.from[1]) * u;
    const zoom = p.from[2] + (p.to[2] - p.from[2]) * u;
    // Each line cuts to its own slow pan (the scene change is between lines, behind the fade).
    if (u < 0.02) this.rig.teleport(x, z, zoom);
    else this.rig.follow(x, z, dt > 0 ? dt : 1 / 60, zoom);
    this.lights.update(this.rig.focus.x, this.rig.focus.z, this.time);
    this.particles.update(dt, this.rig.camera, this.rig.focus.x, this.rig.focus.z, this.rig.zoom);
  }

  /** F3: skip the intro. */
  debugSkip(): void {
    this.time = this.total;
  }

  world(): WorldView {
    return { scene: this.scene, rig: this.rig };
  }

  drawUi(ui: UiSurface): void {
    const i = Math.min(INTRO_LINES.length - 1, Math.floor(this.time / LINE_SECONDS));
    const t = this.time - i * LINE_SECONDS;
    const last = i === INTRO_LINES.length - 1;
    // Fade in over 1.2 s; fade out over the last 0.8 s (the last line stays).
    let a = Math.min(1, t / 1.2);
    if (!last) a = Math.min(a, Math.max(0, (LINE_SECONDS - t) / 0.8));
    const w = Math.min(520, ui.width - 40);
    const col = fadeColor(a, FADE);
    if (col !== null)
      centered(ui, INTRO_LINES[i], Math.floor(ui.width / 2), ui.height - 74, w, col, C.night0);
    if (this.time > 1.5 && this.time < this.total - 1) {
      const dev = this.game.input.glyphDevice(0, this.game.save.settings.glyphStyle);
      ui.prompt('B', dev, 'Skip', ui.width - 12, ui.height - 14, C.slate1, 'right');
    }
  }
}
