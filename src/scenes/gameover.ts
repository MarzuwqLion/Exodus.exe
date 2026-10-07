/**
 * Game over (spec §16.3). Every android lost: "No one made it." over the empty station wagon at a checkpoint,
 * under floodlights in the rain. The ship sailed: "The Sankofa sailed without you." over the car on I-95 at
 * dawn, with a ship's horn far off. Then the memory cores, then the title. The screens say plainly what
 * happened and never apologize.
 */
import * as THREE from 'three';
import type { LoopHandle } from '../audio/engine';
import { GAME_OVER_TEXT } from '../content/conversations';
import type { Region } from '../core/types';
import type { Game } from '../game';
import { Kit } from '../models/kit';
import { buildProp, type PropId } from '../models/props';
import { stationWagon } from '../models/vehicles';
import { CameraRig } from '../render/camera';
import { LIGHT_SCALE, LightPool } from '../render/lights';
import { MASK, withMask } from '../render/materials';
import { C } from '../render/palettes';
import { Particles } from '../render/particles';
import { currentNode } from '../run/map';
import { CoreScreen, MAIN_THEME } from '../ui/cores';
import { TYPE_CPS } from '../ui/dialogue';
import type { UiSurface } from '../ui/surface';
import { Backdrop, addKit, ramp, sampleStops } from './finale';
import type { RunEnding, RunFlow } from './runflow';
import type { GameScene, WorldView } from './scene';

export type GameOverKind = Exclude<RunEnding, 'ghana'>;

/** When the title and the body start typing, and when the prompt shows. */
const TITLE_AT = 1.4;
const BODY_AT = 3.0;
const PROMPT_AT = 5.0;
/** Where each diorama is framed from. */
const CAM = {
  lost: { x: 0.4, z: 4.2, zoom: 0.8 },
  sailed: { x: 1.0, z: 4.0, zoom: 1.1 },
};
/** The dawn sky over the highway: its base sits just beyond the far roadside. */
const HORIZON_Z = -4.6;

export class GameOverScene implements GameScene {
  readonly id = 'gameover';
  readonly scene = new THREE.Scene();
  readonly rig = new CameraRig();
  private readonly lights: LightPool;
  private readonly particles = new Particles();
  private readonly loops: LoopHandle[] = [];
  private readonly title: string;
  private readonly body: string;
  private readonly lost: boolean;
  private readonly cam: { x: number; z: number; zoom: number };
  private readonly hazards: THREE.Mesh | null = null;
  private readonly sky: Backdrop | null = null;
  private readonly paleSky = new THREE.Color(0xa7aeb1);
  private time = 0;
  private hornsPlayed = 0;
  private cores: CoreScreen | null = null;

  constructor(
    private readonly game: Game,
    private readonly flow: RunFlow,
    kind: GameOverKind,
  ) {
    this.lost = kind === 'lost';
    const text = this.lost ? GAME_OVER_TEXT.allLost : GAME_OVER_TEXT.shipSailed;
    this.title = text.title;
    this.body = text.body;
    this.cam = this.lost ? CAM.lost : CAM.sailed;
    const k = new Kit();
    if (this.lost) {
      buildCheckpoint(k);
      this.scene.fog = new THREE.FogExp2(C.night1, 0.02);
      this.particles.setWeather('heavyrain');
      this.scene.add(this.particles.group);
    } else {
      buildHighway(k, currentNode(flow.run.map).region);
      this.scene.fog = new THREE.FogExp2(C.slate0, 0.014);
      this.sky = new Backdrop(
        20,
        8,
        (u, v) => [-40 + u * 80, v * 9, HORIZON_Z],
        (_u, v, dawn) =>
          dawn
            ? sampleStops(
                [
                  [0, C.fog2],
                  [0.12, C.fog1],
                  [0.3, C.fog0],
                  [0.6, C.concrete0],
                  [1, C.slate0],
                ],
                v,
              )
            : sampleStops(
                [
                  [0, C.slate0],
                  [0.3, C.night3],
                  [1, C.night1],
                ],
                v,
              ),
      );
      this.scene.add(this.sky.mesh);
      this.hazards = hazardLights();
      this.scene.add(this.hazards);
    }
    this.lights = new LightPool(this.scene);
    this.lights.addAll(addKit(this.scene, k));
    this.rig.snap = game.config.snap;
    this.rig.teleport(this.cam.x, this.cam.z, this.cam.zoom);
  }

  enter(): void {
    const a = this.game.audio;
    a.setMusic('gameover');
    if (this.lost) {
      this.loops.push(a.loop('rain_heavy', { gain: 0.7 }));
      this.loops.push(a.loop('lamp_hum', { gain: 0.3 }));
    } else this.loops.push(a.loop('lamp_hum', { gain: 0.15 }));
  }

  exit(): void {
    for (const l of this.loops) l.stop(1.2);
  }

  dispose(): void {
    this.particles.dispose();
    this.sky?.dispose();
  }

  allowJoin(): boolean {
    return false;
  }

  pausable(): boolean {
    return true;
  }

  tick(dt: number): void {
    this.time += dt;
    const t = this.time;
    // A ship's horn, far off, twice.
    if (!this.lost && this.hornsPlayed < 2 && t >= (this.hornsPlayed === 0 ? 2.4 : 7.0)) {
      this.game.audio.play('ship_horn', { gain: this.hornsPlayed === 0 ? 0.32 : 0.2, pan: 0.5 });
      this.hornsPlayed++;
    }
    this.rig.follow(this.cam.x, this.cam.z, dt, this.cam.zoom);
    const its = [this.game.intents[0], this.game.intents[1]];
    if (this.cores) {
      this.cores.update(dt, its);
      return;
    }
    if (t >= PROMPT_AT && its.some((it) => it?.confirm)) {
      const g = this.game;
      this.cores = new CoreScreen(g.save.meta, this.flow.award, MAIN_THEME, {
        sfx: (cue) => g.audio.play(cue),
        bought: () => g.persist(),
        done: () => this.flow.leave(),
      });
    }
  }

  frame(_alpha: number, dt: number): void {
    const t = this.time;
    if (!this.lost) {
      // The sky over the far roadside goes pale while the car sits on the shoulder.
      const dawn = ramp(t, 0, 10);
      this.sky?.setMix(dawn);
      const amb = this.lights.ambient;
      amb.color.setHex(0x4b525b).lerp(this.paleSky, dawn);
      amb.intensity = (0.75 + dawn * 0.35) * LIGHT_SCALE;
      if (this.hazards) this.hazards.visible = Math.floor(t * 1.6) % 2 === 0;
    }
    this.lights.update(this.rig.focus.x, this.rig.focus.z, t);
    this.particles.update(dt, this.rig.camera, this.rig.focus.x, this.rig.focus.z, this.rig.zoom);
  }

  world(): WorldView {
    return { scene: this.scene, rig: this.rig };
  }

  drawUi(ui: UiSurface): void {
    const dev = this.game.input.glyphDevice(0, this.game.save.settings.glyphStyle);
    if (this.cores) {
      this.cores.draw(ui, dev);
      return;
    }
    // The words sit low, over empty road, typed in.
    const maxW = Math.min(480, ui.width - 24);
    const titleLines = ui.wrap(this.title, maxW);
    const bodyLines = ui.wrap(this.body, maxW);
    const y =
      Math.floor(ui.height * 0.7) - Math.floor(((titleLines.length + bodyLines.length) * ui.lineHeight) / 2);
    typed(ui, titleLines, (this.time - TITLE_AT) * TYPE_CPS * 0.6, y, C.fog2);
    typed(ui, bodyLines, (this.time - BODY_AT) * TYPE_CPS, y + titleLines.length * ui.lineHeight + 6, C.fog1);
    if (this.time >= PROMPT_AT)
      ui.prompt('A', dev, 'Continue', ui.width - 10, ui.height - 16, C.fog2, 'right');
  }
}

/** Centered lines, typed in up to `chars` characters. */
function typed(ui: UiSurface, lines: readonly string[], chars: number, y: number, color: number): void {
  let left = chars;
  lines.forEach((l, i) => {
    const n = Math.max(0, Math.min(l.length, Math.floor(left)));
    left -= l.length + 1;
    if (n > 0) ui.text(l.slice(0, n), ui.width / 2 - ui.measure(l) / 2, y + i * ui.lineHeight, color);
  });
}

function at(k: Kit, id: PropId, x: number, z: number, ry = 0, variant = 0): void {
  k.at({ x, z, ry }, () => buildProp(k, id, variant));
}

/** A checkpoint lane at night: the barrier down, the booth, floodlights, and the car, empty, its hatch up. */
function buildCheckpoint(k: Kit): void {
  k.ground(-40, -30, 40, 30, 0, C.night2);
  k.box(8, 0.02, 60, C.night3, { y: 0.005 });
  for (const x of [-3.9, 3.9]) k.box(0.12, 0.03, 60, C.amber0, { x, y: 0.01 });
  for (let z = -28; z < 30; z += 6) k.box(0.1, 0.03, 2.6, C.fog0, { y: 0.012, z });
  // The barrier across the lane, the booth beside it, floodlight towers behind.
  k.at({ x: -3.2, z: -1.6 }, () => {
    buildProp(k, 'barrierPost', 1);
    k.at({ x: 0.3, y: 1.0 }, () => buildProp(k, 'barrierArm'));
  });
  at(k, 'checkpointBooth', 5.8, -2.6, 0, 0);
  at(k, 'floodlightTower', -8.5, -6.5, 0, 0);
  at(k, 'floodlightTower', 9.5, -7.5, 0, 1);
  for (let z = 4; z < 18; z += 2.1) {
    at(k, 'jerseyBarrier', -4.6, z, Math.PI / 2, (z * 3) % 4);
    at(k, 'jerseyBarrier', 4.6, z, Math.PI / 2, (z * 5) % 4);
  }
  for (const [x, z] of [
    [-2.2, -3.4],
    [2.4, -3.6],
    [1.6, 12.5],
  ] as const)
    at(k, 'trafficCone', x, z);
  for (const [x, z, v] of [
    [-1.6, 6.2, 0],
    [2.4, 9.8, 1],
    [-6.5, -2.0, 2],
  ] as const)
    at(k, 'puddle', x, z, 0, v);
  // The wagon, stopped short of the barrier, lights off, the tailgate still up.
  k.at({ x: 0, z: 2.4, ry: Math.PI }, () => stationWagon(k, { lights: false, hatchOpen: true }));
  // The floodlights' pool on the lane.
  k.light({ x: -1.5, y: 7, z: -0.5, color: C.fog2, intensity: 4.5, range: 12 });
}

const ROADSIDE: Record<Region, PropId> = {
  newengland: 'pineTree',
  corridor: 'soundWall',
  piedmont: 'pineTree',
  lowcountry: 'palmetto',
};

/**
 * I-95 at dawn, running east–west across the frame: the far roadside against a pale sky, both carriageways
 * empty, the median barrier, lamps still on, and the car stopped on the far shoulder.
 */
function buildHighway(k: Kit, region: Region): void {
  k.ground(-60, HORIZON_Z, 60, 40, 0, C.night2);
  k.box(120, 0.02, 15, C.night3, { y: 0.005, z: 7 });
  for (const z of [-0.4, 14.4]) k.box(120, 0.03, 0.12, C.amber0, { y: 0.01, z });
  for (let x = -60; x < 60; x += 9)
    for (const z of [3.2, 10.8]) k.box(3, 0.03, 0.1, C.fog0, { x, y: 0.012, z });
  for (let x = -60; x < 60; x += 4) at(k, 'jerseyBarrier', x + 2, 7, 0, (x / 4) % 4);
  // Lamps on the far side; on the near side only toward the edges, clear of the words.
  for (let x = -40; x < 40; x += 18) at(k, 'streetlamp', x + 9, -1.4, 0, 1);
  for (const x of [-34, -16, 18, 36]) at(k, 'streetlamp', x, 15.6, Math.PI, 0);
  const side = ROADSIDE[region];
  const wall = side === 'soundWall';
  for (let x = -50; x < 50; x += wall ? 4.4 : 6.5)
    at(k, side, x, wall ? -3.2 : -3.0 - (Math.abs(x * 7) % 1.2), 0, 0);
  // The car on the far shoulder.
  k.at({ x: 1.0, z: 0.9, ry: Math.PI / 2 }, () => stationWagon(k, { lights: false }));
}

/** The car's hazard lights (blinking amber at its four corners). */
function hazardLights(): THREE.Mesh {
  const k = new Kit();
  for (const x of [-2.44, 2.4]) {
    for (const z of [-0.74, 0.74]) k.box(0.12, 0.12, 0.2, C.amber2, { x, y: 0.72, z });
  }
  const out = k.build();
  const mat = withMask(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }), MASK.emissive);
  const m = new THREE.Mesh(out.solid!, mat);
  m.position.set(1.0, 0, 0.9);
  return m;
}
