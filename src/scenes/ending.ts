/**
 * Ghana (spec §16.2), in the epilogue palette. First Tema's quay in morning light: the Sankofa alongside,
 * quay cranes in a warm haze, the party coming ashore. Then the solar cooperative in the north: rows of
 * panels on frames, a red laterite road, a shade tree, people and units working side by side, and the party
 * walking up the road to join them. The Ghana lines fade in; then one epilogue line per party member, the
 * stats screen, and the memory cores.
 */
import * as THREE from 'three';
import { samplePose, type AnimName } from '../anim/poses';
import type { LoopHandle } from '../audio/engine';
import { GHANA_LINES } from '../content/conversations';
import { TUNING } from '../content/tuning';
import { Rng, hashSeed } from '../core/rng';
import type { MemberId } from '../core/types';
import type { Game } from '../game';
import { Kit } from '../models/kit';
import { PARTY_LOOKS, npcLook } from '../models/looks';
import { buildProp, type PropId } from '../models/props';
import { defaultLook, type Look } from '../models/rig';
import { SANKOFA_NAME_ANCHOR, sankofa } from '../models/ship';
import { shipNameCanvas } from '../models/signs';
import { yardTruck } from '../models/vehicles';
import { CameraRig } from '../render/camera';
import { CharacterRenderer, type CharInstance } from '../render/characters';
import { LIGHT_SCALE, LightPool } from '../render/lights';
import { pixelTexture, signMaterial } from '../render/materials';
import { E } from '../render/palettes';
import { epilogueLines, sailedMembers, statRows } from '../run/ending';
import { CoreScreen, EPILOGUE_THEME } from '../ui/cores';
import { TYPE_CPS } from '../ui/dialogue';
import type { UiSurface } from '../ui/surface';
import { addKit, centered, fadeColor, figure, ramp } from './finale';
import type { RunFlow } from './runflow';
import type { GameScene, WorldView } from './scene';

export type GhanaShot = 'quay' | 'coop';

const TH = EPILOGUE_THEME;
/** The text fades in through these palette steps. */
const FADE_STEPS = [E.sky2, E.sky4, E.sky5, E.sun2] as const;
/** How long the quay shot holds before the cut to the cooperative. */
const QUAY_SECONDS = 9;
/** Where the ship lies along the quay (its name board is on the stern quarter, toward the camera). */
const SHIP_AT = { x: 15, y: -2, z: -12.6 };

type Phase = 'lines' | 'epilogue' | 'stats' | 'cores';

interface Walker {
  inst: CharInstance;
  seed: number;
  /** Start and end of the walk (world x, z); equal for someone standing still. */
  from: [number, number];
  to: [number, number];
  anim: AnimName;
  /** Waves once the party is close. */
  greet?: boolean;
}

interface WorkerDef {
  x: number;
  z: number;
  yaw: number;
  anim: AnimName;
  unit: boolean;
  greet?: boolean;
}

export class GhanaScene implements GameScene {
  readonly id = 'ending';
  readonly scene = new THREE.Scene();
  readonly rig = new CameraRig();
  private readonly lights: LightPool;
  private readonly chars = new CharacterRenderer();
  private readonly walkers: Walker[] = [];
  private readonly loops: LoopHandle[] = [];
  private readonly epilogue: string[];
  /** Camera: where it starts and where it settles (the cooperative shot eases up the road). */
  private readonly cam: { x: number; z0: number; z1: number; zoom: number };
  private time = 0;
  private phase: Phase = 'lines';
  private line = 0;
  private shown = 0;
  private phaseT = 0;
  private cores: CoreScreen | null = null;
  private leaving = false;

  constructor(
    private readonly game: Game,
    private readonly flow: RunFlow,
    private readonly shot: GhanaShot,
  ) {
    const run = flow.run;
    const rng = new Rng(hashSeed('ghana', run.seed, shot === 'quay' ? 0 : 1));
    this.epilogue = epilogueLines(run);
    this.scene.fog = new THREE.FogExp2(E.sun2, shot === 'quay' ? 0.02 : 0.014);
    const k = new Kit();
    if (shot === 'quay') buildQuay(k);
    else buildCooperative(k, rng);
    // Daylight: the props' lamps and beacons stay unlit (their glow still shows).
    this.lights = new LightPool(this.scene);
    addKit(this.scene, k);
    if (shot === 'quay') this.scene.add(shipAlongside());
    // Morning: a warm sky light and a sun from the south-east, kept low enough that pale ground holds its color.
    // (The quay's pale concrete takes a cooler sky light, so its shading stays in the sky blues instead of
    // sliding into green.)
    const amb = this.lights.ambient;
    amb.color.setHex(shot === 'quay' ? 0xeef3f2 : 0xfff0c9);
    amb.groundColor.setHex(0x7a4e34);
    amb.intensity = 0.62 * LIGHT_SCALE;
    const sun = this.lights.moon;
    sun.color.setHex(0xffe0b0);
    sun.intensity = 0.58 * LIGHT_SCALE;
    sun.position.set(0.7, 1, 0.8);
    // Everyone who sailed comes ashore.
    const aboard = flow.aboard.length > 0 ? flow.aboard : sailedMembers(run);
    const party = (['wren', 'brick', 'vesper', 'june'] as const).filter((id) => aboard.includes(id));
    const skin = (id: MemberId): number => {
      const m = run.party.find((p) => p.id === id);
      return m && m.kind === 'android' ? m.skin / 100 : 1;
    };
    if (shot === 'quay') {
      // Down the gangway and along the quay toward the camera.
      party.forEach((id, i) => {
        const x = -2.2 + i * 0.95;
        this.walk(PARTY_LOOKS[id], skin(id), [x, 2.6 + i * 0.5], [x + 1.4, 10.2 + i * 0.3], i);
      });
      this.workers(QUAY_WORKERS, rng);
      this.cam = { x: 0, z0: 4.2, z1: 4.2, zoom: 1.3 };
    } else {
      // Up the laterite road to the co-op building.
      party.forEach((id, i) => {
        const x = (i - (party.length - 1) / 2) * 1.05;
        const lag = (i % 2) * 0.8;
        this.walk(PARTY_LOOKS[id], skin(id), [x * 1.2, 19 + lag], [x, 1.2 + lag * 0.5], i);
      });
      this.workers(COOP_WORKERS, rng);
      this.cam = { x: 0, z0: 10, z1: 1.5, zoom: 1.1 };
    }
    this.scene.add(this.chars.group);
    this.rig.snap = game.config.snap;
    this.rig.teleport(this.cam.x, this.cam.z0, this.cam.zoom);
    this.place();
  }

  private walk(look: Look, skin01: number, from: [number, number], to: [number, number], i: number): void {
    const yaw = Math.atan2(to[0] - from[0], to[1] - from[1]);
    const inst = figure(look, from[0], from[1], yaw, skin01);
    this.walkers.push({ inst, seed: i * 0.23, from, to, anim: 'walk' });
  }

  private workers(list: readonly WorkerDef[], rng: Rng): void {
    list.forEach((w, i) => {
      const look = w.unit ? unitLook(rng) : workerLook(rng, i);
      const inst = figure(look, w.x, w.z, w.yaw, w.unit ? rng.range(0.45, 0.7) : 1);
      this.walkers.push({
        inst,
        seed: 0.4 + i * 0.17,
        from: [w.x, w.z],
        to: [w.x, w.z],
        anim: w.anim,
        greet: w.greet,
      });
    });
  }

  enter(): void {
    const a = this.game.audio;
    a.setMusic('epilogue');
    if (this.shot === 'quay') this.loops.push(a.loop('sea', { gain: 0.5 }));
    this.loops.push(a.loop('crowd', { gain: this.shot === 'quay' ? 0.15 : 0.22 }));
  }

  exit(): void {
    for (const l of this.loops) l.stop(1.2);
  }

  allowJoin(): boolean {
    return false;
  }

  pausable(): boolean {
    return true;
  }

  /** Walk progress for the party (0..1). */
  private walkT(): number {
    const dur = this.shot === 'quay' ? QUAY_SECONDS - 1 : TUNING.epilogue.walkInSeconds;
    return ramp(this.time, 0.6, dur);
  }

  /** Put the walkers where the clock says, and ease the camera after them. */
  private place(dt = 0): void {
    const w = this.walkT();
    for (const wk of this.walkers) {
      wk.inst.x = wk.from[0] + (wk.to[0] - wk.from[0]) * w;
      wk.inst.z = wk.from[1] + (wk.to[1] - wk.from[1]) * w;
    }
    const ease = w * w * (3 - 2 * w);
    const z = this.cam.z0 + (this.cam.z1 - this.cam.z0) * ease;
    if (dt > 0) this.rig.follow(this.cam.x, z, dt, this.cam.zoom);
  }

  tick(dt: number): void {
    this.time += dt;
    this.phaseT += dt;
    this.place(dt);
    const its = [this.game.intents[0], this.game.intents[1]];
    const pressed = its.some((it) => it?.confirm);
    if (this.shot === 'quay') {
      if (!this.leaving && (this.time >= QUAY_SECONDS || (this.time > 2.5 && pressed))) {
        this.leaving = true;
        this.game.goto('ending', { shot: 'coop' });
      }
      return;
    }
    switch (this.phase) {
      case 'lines': {
        const linesDone = this.time > TUNING.epilogue.walkInSeconds + 1.5;
        if (linesDone || (this.time > 3 && pressed)) this.setPhase('epilogue');
        break;
      }
      case 'epilogue': {
        const text = this.epilogue[this.line] ?? '';
        this.shown = Math.min(text.length, this.shown + dt * TYPE_CPS);
        if (pressed && this.phaseT > 0.3) {
          if (this.shown < text.length) this.shown = text.length;
          else {
            this.line++;
            this.shown = 0;
            this.phaseT = 0;
            if (this.line >= this.epilogue.length) this.setPhase('stats');
          }
        }
        break;
      }
      case 'stats':
        if (pressed && this.phaseT > 0.5) this.openCores();
        break;
      case 'cores':
        this.cores?.update(dt, its);
        break;
    }
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
  }

  private openCores(): void {
    this.setPhase('cores');
    const g = this.game;
    this.cores = new CoreScreen(g.save.meta, this.flow.award, TH, {
      sfx: (cue) => g.audio.play(cue),
      bought: () => g.persist(),
      done: () => this.flow.leave(),
    });
  }

  frame(_alpha: number, dt: number): void {
    const step = 1 / TUNING.render.poseFps;
    const pt = Math.floor(this.time / step) * step;
    const w = this.walkT();
    for (const wk of this.walkers) {
      const moving = wk.from[0] !== wk.to[0] || wk.from[1] !== wk.to[1];
      if (moving) {
        const dist = Math.hypot(wk.to[0] - wk.from[0], wk.to[1] - wk.from[1]) * w;
        const anim: AnimName = w < 1 ? wk.anim : 'idle';
        samplePose(wk.inst.pose, anim, {
          phase: (dist * Math.PI * 2) / 1.3,
          speed: 0.6,
          t: pt,
          seed: wk.seed,
        });
      } else {
        const anim: AnimName = wk.greet && w > 0.8 && w < 1 ? 'wave' : wk.anim;
        samplePose(wk.inst.pose, anim, { phase: 0, speed: 0, t: pt + wk.seed * 5, seed: wk.seed });
      }
    }
    this.chars.render(
      this.walkers.map((x) => x.inst),
      dt,
    );
    this.lights.update(this.rig.focus.x, this.rig.focus.z, this.time);
  }

  world(): WorldView {
    return { scene: this.scene, rig: this.rig, palette: 'epilogue' };
  }

  drawUi(ui: UiSurface): void {
    const fade = TUNING.epilogue.lineFadeSeconds;
    const maxW = Math.min(520, ui.width - 24);
    if (this.shot === 'quay') {
      // Low on the screen: the ship's name stays readable at the top.
      const c = fadeColor(ramp(this.time, 1.2, fade), FADE_STEPS);
      if (c !== null) centered(ui, GHANA_LINES[0], ui.width / 2, ui.height - 30, maxW, c, TH.shadow);
      return;
    }
    if (this.phase === 'lines') {
      let y = 18;
      for (const [i, at] of [
        [1, 1.0],
        [2, 4.6],
      ] as const) {
        const c = fadeColor(ramp(this.time, at, fade), FADE_STEPS);
        if (c !== null) y += centered(ui, GHANA_LINES[i], ui.width / 2, y, maxW, c, TH.shadow) + 6;
      }
      return;
    }
    const dev = this.game.input.glyphDevice(0, this.game.save.settings.glyphStyle);
    if (this.phase === 'epilogue') {
      const text = this.epilogue[this.line] ?? '';
      const w = Math.min(440, ui.width - 24);
      const lines = ui.wrap(text, w - 20);
      const h = 18 + lines.length * ui.lineHeight;
      const x = Math.floor((ui.width - w) / 2);
      const y = ui.height - h - 14;
      ui.panel(x, y, w, h, TH.fill, TH.border);
      ui.paragraph(text, x + 10, y + 9, w - 20, TH.text, this.shown, { shadow: null });
      if (this.shown >= text.length && Math.floor(this.phaseT * 2.5) % 2 === 0)
        ui.button('A', dev, x + w - 16, y + h - 12, TH.keys);
      return;
    }
    if (this.phase === 'stats') {
      this.drawStats(ui);
      if (this.phaseT > 0.5)
        ui.prompt('A', dev, 'Continue', ui.width - 10, ui.height - 16, TH.title, 'right', TH);
      return;
    }
    this.cores?.draw(ui, dev);
  }

  private drawStats(ui: UiSurface): void {
    const rows = statRows(this.flow.run);
    const w = Math.min(260, ui.width - 16);
    const h = 26 + rows.length * 12 + 8;
    const x = Math.floor((ui.width - w) / 2);
    const y = Math.max(4, Math.floor((ui.height - h) / 2) - 10);
    ui.panel(x, y, w, h, TH.fill, TH.border);
    ui.text('The run', x + 10, y + 7, TH.title, { shadow: null });
    rows.forEach(([label, value], i) => {
      const yy = y + 24 + i * 12;
      ui.text(label, x + 10, yy, TH.text, { shadow: null });
      ui.text(value, x + w - 10, yy, TH.hi, { align: 'right', shadow: null });
    });
  }

  debugInfo(): Record<string, string | number> {
    return { t: this.time.toFixed(1), phase: this.phase, line: this.line };
  }
}

/** Dockworkers and crew on the quay at Tema. */
const QUAY_WORKERS: readonly WorkerDef[] = [
  { x: 4.4, z: 1.4, yaw: -0.6, anim: 'point', unit: false },
  { x: 5.6, z: 0.8, yaw: -2.4, anim: 'idle', unit: true },
  { x: -10.5, z: -2.6, yaw: 0.4, anim: 'idle', unit: false },
  { x: 8.6, z: 9.4, yaw: 2.6, anim: 'talk', unit: false },
  { x: 9.6, z: 8.7, yaw: -0.9, anim: 'idle', unit: true },
];

/** People and units at work among the panel rows. */
const COOP_WORKERS: readonly WorkerDef[] = [
  { x: -9.6, z: 6.1, yaw: Math.PI, anim: 'kneel', unit: false },
  { x: -11.4, z: 6.0, yaw: Math.PI, anim: 'search', unit: true },
  { x: 9.4, z: 1.0, yaw: Math.PI, anim: 'search', unit: false },
  { x: 11.6, z: 11.3, yaw: -2.2, anim: 'point', unit: true },
  { x: -2.9, z: -0.4, yaw: 0.3, anim: 'idle', unit: false, greet: true },
  { x: 2.7, z: -0.6, yaw: -0.4, anim: 'talk', unit: true },
  { x: -14.2, z: -3.7, yaw: 1.2, anim: 'talk', unit: false },
  { x: -13.0, z: -3.5, yaw: -1.8, anim: 'idle', unit: true },
  { x: 15.8, z: -4.0, yaw: Math.PI, anim: 'kneel', unit: true },
];

/** A worker in work clothes, colored from the epilogue palette. */
function workerLook(rng: Rng, i: number): Look {
  const L = npcLook('dockworker', 900 + i * 13);
  const cloth = [E.sun0, E.green1, E.sky4, E.earth2, E.sky3, E.green2] as const;
  L.jacket = rng.pick(cloth);
  L.shirt = rng.pick([E.sky5, E.sun2, E.green3] as const);
  L.pants = rng.pick([E.sky1, E.earth0, E.green0] as const);
  L.hat = rng.pick(['none', 'cap', 'none'] as const);
  L.hatColor = rng.pick(cloth);
  return L;
}

/** A unit at work: chassis showing, nothing to hide here. */
function unitLook(rng: Rng): Look {
  return {
    ...defaultLook(),
    height: rng.range(0.96, 1.06),
    shoulders: rng.range(0.95, 1.15),
    build: rng.range(0.9, 1.1),
    skin: rng.pick([E.skin1, E.skin2, E.skin3, E.skin4] as const),
    hair: rng.pick([E.sky0, E.earth0] as const),
    hairStyle: rng.int(0, 7),
    jacket: rng.pick([E.sky4, E.green1, E.sun1] as const),
    shirt: E.sky5,
    pants: E.sky1,
    shoes: E.earth0,
    hat: 'none',
    android: true,
  };
}

function at(k: Kit, id: PropId, x: number, z: number, ry = 0, variant = 0): void {
  k.at({ x, z, ry }, () => buildProp(k, id, variant));
}

/** The Sankofa alongside the quay, with her name on the stern quarter. */
function shipAlongside(): THREE.Group {
  const k = new Kit();
  sankofa(k);
  const g = new THREE.Group();
  addKit(g, k);
  const canvas = shipNameCanvas();
  if (canvas) {
    const a = SANKOFA_NAME_ANCHOR;
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(a.w, a.h),
      signMaterial(pixelTexture(canvas), false),
    );
    plate.position.set(a.x, a.y, a.z + 0.01);
    g.add(plate);
  }
  g.position.set(SHIP_AT.x, SHIP_AT.y, SHIP_AT.z);
  return g;
}

/** Tema: the quay apron, the water, quay cranes at either side, bollards, stacked containers. */
function buildQuay(k: Kit): void {
  k.ground(-60, -5.5, 60, 40, 0, E.sky5);
  k.ground(-60, -70, 60, -5.5, -2, E.sky4);
  // The quay edge, safety lines, crane rails.
  k.box(120, 2.0, 0.6, E.sky2, { y: -2, z: -5.2 }, { top: E.sky1 });
  for (const z of [-3.8, 12.5]) k.box(120, 0.02, 0.12, E.sun1, { y: 0.01, z });
  for (const z of [-4.6, 11.8]) k.box(120, 0.03, 0.18, E.sky2, { y: 0.01, z });
  for (let x = -40; x <= 40; x += 8) at(k, 'bollardMooring', x, -4.6, 0, Math.abs(x) % 16 === 8 ? 1 : 0);
  // Quay cranes at either side, booms out over the ship.
  at(k, 'quayCrane', -23, 2.5, 0, 0);
  at(k, 'quayCrane', 24, 2.5, 0, 1);
  // The gangway down from the ship, and a yard truck waiting with a box for the hold.
  at(k, 'gangway', -1.7, -1.2);
  k.at({ x: 11, z: 4.6, ry: -Math.PI / 2 }, () => yardTruck(k, 2));
  // Containers waiting on the apron.
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < (i % 2) + 1; j++) {
      k.at({ x: 12 + i * 0.2, y: j * 2.6, z: 14 + i * 2.6 }, () =>
        buildProp(k, 'container', (i + j * 3) % 6),
      );
    }
  }
  for (let i = 0; i < 3; i++) k.at({ x: -13, z: 14 + i * 2.6 }, () => buildProp(k, 'container', i + 2));
}

/** The solar cooperative: panel rows, the laterite road, the co-op building, a shade tree. */
function buildCooperative(k: Kit, rng: Rng): void {
  k.ground(-60, -60, 60, 60, 0, E.green1);
  // Dry patches in the grass.
  for (let i = 0; i < 30; i++) {
    const x = rng.range(-30, 30);
    const z = rng.range(-30, 30);
    if (Math.abs(x) < 4) continue;
    k.box(rng.range(1, 2.6), 0.01, rng.range(0.5, 1.2), rng.chance(0.7) ? E.green0 : E.earth1, {
      x,
      y: 0.003,
      z,
    });
  }
  // The road in, from the south.
  for (let z = 26; z >= 2; z -= 8) at(k, 'lateriteRoad', 0, z, 0, z === 10 ? 1 : 0);
  at(k, 'coopBuilding', 0, -6, 0, 0);
  at(k, 'shadeTree', -7.4, -1.2, 0, 1);
  // Rows of panels on both sides of the road, and on into the haze.
  for (const x of [-17, -10.5, 10.5, 17]) {
    for (let z = -30; z <= 22; z += 5.2) {
      if (Math.abs(x) < 12 && z > -10 && z < -1) continue;
      at(k, 'solarPanelRow', x, z, 0, Math.abs(Math.round(x + z)) % 3);
    }
  }
  for (const x of [-30, -23.5, 23.5, 30]) {
    for (let z = -30; z <= 22; z += 5.2) at(k, 'solarPanelRow', x, z, 0, 0);
  }
}
