/**
 * The voyage (spec §16.1): night on the Sankofa's deck as the storm breaks up. Whoever made it aboard stands
 * at the north rail, Captain Mensah says her one line, and a short conversation plays, chosen by exactly who
 * is aboard. Then the sunrise: over six seconds the palette crossfades from the main lookup to the epilogue
 * one, the first warm color in the game. It lands in silence; the music starts after.
 */
import * as THREE from 'three';
import { samplePose, type AnimName } from '../anim/poses';
import type { LoopHandle } from '../audio/engine';
import { MEMBERS } from '../content/characters';
import { MENSAH_DECK_LINE } from '../content/conversations';
import { TUNING } from '../content/tuning';
import { Rng, hashSeed } from '../core/rng';
import type { MemberId } from '../core/types';
import type { Game } from '../game';
import { Kit } from '../models/kit';
import { PARTY_LOOKS, npcLook } from '../models/looks';
import { buildProp } from '../models/props';
import { shipDeck } from '../models/ship';
import { CameraRig } from '../render/camera';
import { CharacterRenderer, type CharInstance } from '../render/characters';
import { LIGHT_SCALE, LightPool } from '../render/lights';
import { MASK, withMask } from '../render/materials';
import { C, E } from '../render/palettes';
import { Particles } from '../render/particles';
import { voyageFor } from '../run/ending';
import { EPILOGUE_THEME } from '../ui/cores';
import { Dialogue } from '../ui/dialogue';
import type { UiSurface } from '../ui/surface';
import { Backdrop, addKit, dialogueLines, figure, mixRgb, ramp, rgb, sampleStops } from './finale';
import type { RunFlow } from './runflow';
import type { GameScene, WorldView } from './scene';

/** The north rail of the deck section, where the party stands looking out to sea. */
const RAIL_Z = -4.9;
/** Sea level below the deck, and the horizon backdrop's distance. */
const SEA_Y = -2.6;
const HORIZON_Z = -10.5;
/** Where the sun comes up (east of the party, ahead of the ship), how big it is, and where it starts. */
const SUN_X = 3.4;
const SUN_R = 0.62;
const SUN_LOW = SEA_Y - 1.5;
const SUN_HIGH = SEA_Y + 1.6;
const FOCUS = { x: 0.4, z: -3.6, zoom: 0.85 };
/** The storm starts breaking up, and Mensah speaks once it has eased. */
const CLEAR_AT = 2.5;
const TALK_AT = 6.5;
const STAR_GROUPS = 8;

interface Figure {
  id: MemberId | 'mensah' | 'crew';
  inst: CharInstance;
  seed: number;
}

export class VoyageScene implements GameScene {
  readonly id = 'voyage';
  readonly scene = new THREE.Scene();
  readonly rig = new CameraRig();
  private readonly lights: LightPool;
  private readonly particles = new Particles();
  private readonly chars = new CharacterRenderer();
  private readonly figures: Figure[] = [];
  private readonly sky: Backdrop;
  private readonly sea: Backdrop;
  private readonly sun: THREE.Mesh;
  private readonly clouds: { group: THREE.Group; x: number; dir: number }[] = [];
  private readonly stars: THREE.Mesh[] = [];
  private readonly talk: Dialogue;
  private readonly loops: LoopHandle[] = [];
  private rain: LoopHandle | null = null;
  private weatherStep = 0;
  private time = 0;
  private talkDone = -1;
  private flashFrames = 0;
  private nextFlash = 0.9;
  private musicOn = false;
  private left = false;
  private readonly warmSky = new THREE.Color(0xffd9a8);
  private readonly warmGround = new THREE.Color(0x6a4e6b);
  private readonly warmSun = new THREE.Color(0xffb468);
  private readonly dawnFog = new THREE.Color(E.sky2);

  constructor(
    private readonly game: Game,
    flow: RunFlow,
    aboard: readonly MemberId[],
  ) {
    const rng = new Rng(hashSeed('voyage', flow.run.seed));
    this.scene.fog = new THREE.FogExp2(C.night1, 0.012);
    const k = new Kit();
    buildShip(k);
    this.lights = new LightPool(this.scene);
    this.lights.addAll(addKit(this.scene, k));
    // The sky over the horizon and the sea under it, each with a night and a dawn coloring.
    this.sky = new Backdrop(
      24,
      12,
      (u, v) => [-32 + u * 64, SEA_Y + v * 9, HORIZON_Z],
      (u, v, dawn) => skyColor(u, v, dawn),
    );
    this.sea = new Backdrop(
      24,
      16,
      (u, v) => [-32 + u * 64, SEA_Y, HORIZON_Z + v * 26],
      (u, v, dawn) => seaColor(u, v, dawn),
    );
    this.scene.add(this.sky.mesh, this.sea.mesh);
    this.sun = sunDisc();
    this.scene.add(this.sun);
    this.buildClouds(rng);
    this.buildStars(rng);
    // The party at the rail, Mensah beside them, a crew member by the hatch.
    const party = flow.run.party;
    const here = (['wren', 'brick', 'vesper', 'june'] as const).filter((id) => aboard.includes(id));
    here.forEach((id, i) => {
      const x = (i - (here.length - 1) / 2) * 1.35;
      const m = party.find((p) => p.id === id);
      const skin = m && m.kind === 'android' ? m.skin / 100 : 1;
      this.figures.push({
        id,
        inst: figure(PARTY_LOOKS[id], x, RAIL_Z + 0.65, Math.PI - x * 0.1, skin),
        seed: i * 0.27,
      });
    });
    const edge = (here.length - 1) * 0.675;
    this.figures.push({
      id: 'mensah',
      inst: figure(npcLook('mensah', 7), edge + 2.2, RAIL_Z + 1.5, -Math.PI / 2 - 0.35),
      seed: 0.61,
    });
    this.figures.push({ id: 'crew', inst: figure(npcLook('crew', 3), -6.4, 1.4, Math.PI / 2), seed: 0.83 });
    this.scene.add(this.chars.group);
    this.particles.setWeather('storm');
    this.scene.add(this.particles.group);
    this.rig.snap = game.config.snap;
    this.rig.teleport(FOCUS.x, FOCUS.z, FOCUS.zoom);
    const conv = voyageFor(aboard);
    const lines = [{ speaker: 'mensah' as const, text: MENSAH_DECK_LINE }, ...(conv?.lines ?? [])];
    this.talk = new Dialogue(dialogueLines(lines, C.amber2, C.fog0), () =>
      this.game.audio.play('type_tick', { gain: 0.2 }),
    );
  }

  private buildClouds(rng: Rng): void {
    // Storm clouds over the horizon; they part as the weather clears.
    for (let i = 0; i < 10; i++) {
      const group = cloud(rng, rng.range(6, 10));
      const x = -19 + i * 4.2 + rng.range(-1, 1);
      group.position.set(x, SEA_Y + rng.range(1.6, 6.5), HORIZON_Z + 0.3 + i * 0.06);
      this.scene.add(group);
      this.clouds.push({ group, x, dir: x < 0 ? -1 : 1 });
    }
  }

  private buildStars(rng: Rng): void {
    // Stars come out a few at a time: each group is one mesh.
    const mat = withMask(new THREE.MeshBasicMaterial({ color: E.sky5, fog: false }), MASK.emissive);
    for (let gi = 0; gi < STAR_GROUPS; gi++) {
      const pos: number[] = [];
      for (let i = 0; i < 9; i++) {
        const x = rng.range(-17, 17);
        const y = SEA_Y + rng.range(1.2, 8.5);
        const s = rng.chance(0.2) ? 0.09 : 0.05;
        const z = HORIZON_Z + 0.2;
        pos.push(x - s, y - s * 1.7, z, x + s, y - s * 1.7, z, x + s, y + s * 1.7, z);
        pos.push(x - s, y - s * 1.7, z, x + s, y + s * 1.7, z, x - s, y + s * 1.7, z);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.stars.push(mesh);
      this.scene.add(mesh);
    }
  }

  enter(): void {
    const a = this.game.audio;
    a.setMusic('none');
    this.loops.push(a.loop('sea', { gain: 0.7 }));
    this.rain = a.loop('rain_heavy', { gain: 0.8 });
  }

  exit(): void {
    for (const l of this.loops) l.stop(1.5);
    this.rain?.stop(0.5);
  }

  dispose(): void {
    this.particles.dispose();
    this.sky.dispose();
    this.sea.dispose();
    // The sun, clouds, and stars own their geometry and materials (the kit meshes share the global ones).
    const own = new Set<{ dispose(): void }>();
    const collect = (o: THREE.Object3D): void => {
      o.traverse((c) => {
        if (!(c instanceof THREE.Mesh)) return;
        own.add(c.geometry);
        own.add(c.material as THREE.Material);
      });
    };
    collect(this.sun);
    for (const c of this.clouds) collect(c.group);
    for (const s of this.stars) collect(s);
    for (const d of own) d.dispose();
  }

  allowJoin(): boolean {
    return false;
  }

  pausable(): boolean {
    return true;
  }

  /** QA: finish the conversation now. */
  skipTalk(): void {
    this.talk.done = true;
  }

  private get sunriseAt(): number {
    return this.talkDone < 0
      ? Infinity
      : Math.max(this.talkDone + 2, CLEAR_AT + TUNING.epilogue.stormClearSeconds + 1);
  }

  tick(dt: number): void {
    this.time += dt;
    const t = this.time;
    const intents = [this.game.intents[0], this.game.intents[1]];
    // The storm breaks up: lighter rain, then a drizzle, then nothing.
    const clear = ramp(t, CLEAR_AT, TUNING.epilogue.stormClearSeconds);
    const step = clear >= 0.7 ? 3 : clear >= 0.4 ? 2 : clear > 0 ? 1 : 0;
    if (step !== this.weatherStep) {
      this.weatherStep = step;
      this.particles.setWeather((['storm', 'rain', 'drizzle', 'clear'] as const)[step]);
      if (step === 1) this.rain?.setGain(0.5);
      if (step === 2) {
        this.rain?.stop(3);
        this.rain = null;
      }
    }
    // Lightning while the storm lasts.
    if (this.flashFrames > 0) this.flashFrames--;
    if (t >= this.nextFlash && clear < 0.35) {
      this.flashFrames = 2;
      this.nextFlash = t + 2.2 + ((t * 7.3) % 1.8);
      this.game.audio.play('thunder', { gain: 0.6 - clear });
    }
    if (t >= TALK_AT && this.talkDone < 0) {
      if (this.talk.update(dt, intents)) this.talkDone = t;
    }
    const sunrise = ramp(t, this.sunriseAt, TUNING.epilogue.sunriseSeconds);
    const musicAt = this.sunriseAt + TUNING.epilogue.sunriseSeconds + TUNING.epilogue.silenceSeconds;
    if (!this.musicOn && t >= musicAt) {
      this.musicOn = true;
      this.game.audio.setMusic('epilogue');
    }
    if (sunrise >= 1 && !this.left) {
      const skip = t >= musicAt + 1 && intents.some((it) => it?.confirm);
      if (skip || t >= musicAt + 9) {
        this.left = true;
        this.game.goto('ending');
      }
    }
  }

  frame(_alpha: number, dt: number): void {
    const t = this.time;
    const clear = ramp(t, CLEAR_AT, TUNING.epilogue.stormClearSeconds);
    const sunrise = ramp(t, this.sunriseAt, TUNING.epilogue.sunriseSeconds);
    // Clouds part; stars come out a group at a time, then fade with the dawn.
    const ease = clear * clear * (3 - 2 * clear);
    for (const c of this.clouds) c.group.position.x = c.x + c.dir * ease * 26;
    this.stars.forEach((s, i) => {
      const on = clear > 0.25 + (i / STAR_GROUPS) * 0.7;
      const gone = sunrise > (i + 1) / (STAR_GROUPS + 2);
      s.visible = on && !gone;
    });
    this.sky.setMix(sunrise);
    this.sea.setMix(sunrise);
    const rise = sunrise * sunrise * (3 - 2 * sunrise);
    this.sun.position.y = SUN_LOW + rise * (SUN_HIGH - SUN_LOW);
    this.sun.visible = sunrise > 0;
    // Light: the night's cold ambient warms into morning, and the moon gives way to a low sun ahead.
    const amb = this.lights.ambient;
    amb.color.setHex(0x4b525b).lerp(this.warmSky, rise);
    amb.groundColor.setHex(0x0e1013).lerp(this.warmGround, rise);
    amb.intensity = (TUNING.render.ambient * (0.75 + 0.25 * clear) + rise * 0.12) * LIGHT_SCALE;
    const moon = this.lights.moon;
    moon.color.setHex(0x8c9499).lerp(this.warmSun, rise);
    moon.intensity = (TUNING.render.moon + rise * 0.5) * LIGHT_SCALE;
    moon.position.set(-0.4 + rise * 0.9, 1 - rise * 0.6, 0.6 - rise * 1.4);
    // Poses at 12 fps: the speaker talks, everyone else stands at the rail.
    const speaker = this.talkDone < 0 && t >= TALK_AT ? this.talk.line?.speaker : undefined;
    const step = 1 / TUNING.render.poseFps;
    const pt = Math.floor(t / step) * step;
    for (const f of this.figures) {
      const name = f.id === 'mensah' ? 'Captain Mensah' : f.id === 'crew' ? '' : MEMBERS[f.id].name;
      const anim: AnimName = speaker && speaker === name ? 'talk' : 'idle';
      samplePose(f.inst.pose, anim, { phase: 0, speed: 0, t: pt + f.seed * 3, seed: f.seed });
    }
    this.chars.render(
      this.figures.map((f) => f.inst),
      dt,
    );
    this.rig.follow(FOCUS.x, FOCUS.z, dt > 0 ? dt : 1 / 60, FOCUS.zoom);
    this.lights.update(this.rig.focus.x, this.rig.focus.z, t);
    this.particles.update(dt, this.rig.camera, this.rig.focus.x, this.rig.focus.z, this.rig.zoom);
    (this.scene.fog as THREE.FogExp2).color.setHex(C.night1).lerp(this.dawnFog, rise);
  }

  world(): WorldView {
    const sunrise = ramp(this.time, this.sunriseAt, TUNING.epilogue.sunriseSeconds);
    return { scene: this.scene, rig: this.rig, lutMix: sunrise, flash: this.flashFrames > 0 };
  }

  drawUi(ui: UiSurface): void {
    const dev = this.game.input.glyphDevice(0, this.game.save.settings.glyphStyle);
    if (this.talkDone < 0 && this.time >= TALK_AT) this.talk.draw(ui, dev);
    const musicAt = this.sunriseAt + TUNING.epilogue.sunriseSeconds + TUNING.epilogue.silenceSeconds;
    if (this.time >= musicAt + 1 && !this.left) {
      const th = EPILOGUE_THEME;
      ui.prompt('A', dev, 'Continue', ui.width - 10, ui.height - 16, th.title, 'right', th);
    }
  }

  debugInfo(): Record<string, string | number> {
    return { t: this.time.toFixed(1), sunrise: ramp(this.time, this.sunriseAt, 6).toFixed(2) };
  }
}

/** The deck section from the models, with the rest of the ship around it. */
function buildShip(k: Kit): void {
  shipDeck(k);
  // The deck runs on aft (west, to the superstructure) and forward (east, toward the bow).
  for (const [x0, x1] of [
    [-36, -8],
    [8, 36],
  ] as const) {
    const cx = (x0 + x1) / 2;
    const w = x1 - x0;
    k.box(w, 0.4, 10, E.sky1, { x: cx, y: -0.4 }, { top: E.green0 });
    k.box(w, 2.2, 0.4, E.sky0, { x: cx, y: -2.6, z: 5.2 }, { top: E.sky1 });
    for (let x = x0; x < x1; x += 4) {
      k.at({ x: x + 2, z: RAIL_Z }, () => buildProp(k, 'shipDeckRail', 0));
      k.at({ x: x + 2, z: -RAIL_Z }, () => buildProp(k, 'shipDeckRail', x % 12 === 0 ? 1 : 0));
    }
  }
  // The superstructure aft: white, with warm lit windows.
  k.box(8, 7.5, 9, E.sun2, { x: -16, z: 0 }, { top: E.sky4 });
  for (let i = 0; i < 3; i++) {
    for (const y of [1.6, 4.2]) {
      k.glow(() => k.box(0.05, 0.9, 1.4, E.sun1, { x: -11.98, y, z: -2.8 + i * 2.8 }));
    }
  }
  k.light({ x: -11.2, y: 3.2, z: 0, color: E.sun1, intensity: 2.6, range: 9 });
  // Containers forward, two high.
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      k.at({ x: 15.5 + i * 0.1, y: j * 2.6, z: -2.6 + i * 2.6 }, () => buildProp(k, 'container', i * 2 + j));
    }
  }
}

function skyColor(u: number, v: number, dawn: boolean): [number, number, number] {
  if (!dawn)
    return sampleStops(
      [
        [0, E.sky1],
        [0.3, E.sky0],
        [1, E.sky0],
      ],
      v,
    );
  const base = sampleStops(
    [
      [0, E.sun2],
      [0.07, E.sun1],
      [0.2, E.sun0],
      [0.38, E.sky3],
      [0.62, E.sky2],
      [1, E.sky1],
    ],
    v,
  );
  // Brighter around the sun.
  const x = -32 + u * 64;
  const near = Math.max(0, 1 - Math.hypot((x - SUN_X) / 14, v / 0.4));
  return mixRgb(base, rgb(E.sun2), near * 0.7);
}

function seaColor(u: number, v: number, dawn: boolean): [number, number, number] {
  if (!dawn)
    return sampleStops(
      [
        [0, E.sky1],
        [0.12, E.sky0],
        [1, E.sky0],
      ],
      v,
    );
  const base = sampleStops(
    [
      [0, E.sun0],
      [0.08, E.sky3],
      [0.3, E.sky2],
      [1, E.sky1],
    ],
    v,
  );
  // The sun's path on the water narrows toward the horizon.
  const x = -32 + u * 64;
  const width = 1.5 + v * 5;
  const glint = Math.max(0, 1 - Math.abs(x - SUN_X) / width) * (1 - v * 0.6);
  return mixRgb(base, rgb(E.sun1), glint);
}

/**
 * The rising sun: a disc on the horizon backdrop (the sea hides it until it clears the water). The camera's
 * pitch squashes a vertical disc, so it's stretched to read round on screen.
 */
function sunDisc(): THREE.Mesh {
  const geo = new THREE.CircleGeometry(SUN_R, 18);
  const mat = withMask(new THREE.MeshBasicMaterial({ color: E.sun2, fog: false }), MASK.emissive);
  const m = new THREE.Mesh(geo, mat);
  m.scale.y = 1 / Math.cos((TUNING.render.pitchDeg * Math.PI) / 180);
  m.position.set(SUN_X, SUN_LOW, HORIZON_Z + 0.25);
  m.visible = false;
  return m;
}

/** A storm cloud: overlapping flat ellipses in front of the sky, unlit. */
function cloud(rng: Rng, w: number): THREE.Group {
  const g = new THREE.Group();
  const dark = withMask(new THREE.MeshBasicMaterial({ color: E.sky0, fog: false }), MASK.surface);
  const light = withMask(new THREE.MeshBasicMaterial({ color: E.sky1, fog: false }), MASK.surface);
  const disc = new THREE.CircleGeometry(1, 14);
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(disc, i < 4 ? dark : light);
    const r = rng.range(0.25, 0.45) * w;
    m.scale.set(r, r * rng.range(0.55, 0.8), 1);
    m.position.set(rng.range(-0.35, 0.35) * w, (i < 4 ? 0 : 0.25 * r) + rng.range(-0.1, 0.25) * r, i * 0.01);
    g.add(m);
  }
  return g;
}
