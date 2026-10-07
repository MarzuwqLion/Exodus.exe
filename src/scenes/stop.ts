/**
 * A real-time stop (Depot, Diner, Gas Station, Station, checkpoint bust, the Port): runs the StopSim at 60 Hz
 * from the players' intents, turns its events into sound, rumble, shake, sparks, barks and pickups, frames
 * the shared camera on the players, and draws the HUD.
 */
import * as THREE from 'three';
import { isLoopCue, isSfxCue, type LoopCue, type SfxCue } from '../audio/cues';
import type { LoopHandle } from '../audio/engine';
import { MEMBERS } from '../content/characters';
import { TUNING } from '../content/tuning';
import { DEG } from '../core/math';
import { WEATHERS, type PlayerIntent, type Region, type Slot, type Weather } from '../core/types';
import type { Game } from '../game';
import { CameraRig } from '../render/camera';
import { buildLevel, vendingMesh, type LevelBuild } from '../render/level';
import { LightPool } from '../render/lights';
import { C } from '../render/palettes';
import { Particles, Sparks } from '../render/particles';
import { buildWantedPosters } from '../render/posters';
import { StopView } from '../render/stopview';
import { postersUp } from '../sim/behaviors';
import { F } from '../sim/grid';
import { finishPort } from '../sim/port';
import { StopSim, type StopConfig } from '../sim/stop';
import type { SimEvent, StopOutcome } from '../sim/types';
import { StopHud } from '../ui/hud';
import type { UiSurface } from '../ui/surface';
import type { GameScene, WorldView } from './scene';

export interface StopParams {
  cfg: StopConfig;
  /** Shown briefly at the start ("Charging depot · Providence"). */
  title?: string;
  /** Called once when the stop ends. */
  onExit?: (outcome: StopOutcome, game: Game) => void;
  /** Optional per-tick hook (tutorial scripting). */
  onTick?: (scene: StopScene, dt: number) => void;
  /** Extra HUD drawing (tutorial prompts, Lantern texts). */
  onDrawUi?: (scene: StopScene, ui: UiSurface) => void;
  /** Per rendered frame, after the view updates (the Port's moving cover). */
  onFrame?: (scene: StopScene, dt: number) => void;
}

/** A panel over the stop (a conversation, the Station panel): the stop waits while it is open. */
export interface StopModal {
  /** Returns true when it closes. */
  update(dt: number, intents: readonly (PlayerIntent | null)[]): boolean;
  draw(ui: UiSurface): void;
  /** What opens when this one closes, if anything. */
  then?: () => StopModal | null;
}

/** Fog tint and density per region (spec §4.7). */
export function regionFog(
  region: Region,
  weather: Weather,
  interior = false,
): { color: number; density: number } {
  let color: number;
  let density: number;
  switch (region) {
    case 'corridor':
      color = C.slate0;
      density = 0.045;
      break;
    case 'piedmont':
      color = C.concrete0;
      density = 0.04;
      break;
    case 'lowcountry':
      color = C.amber0;
      density = 0.04;
      break;
    default:
      color = C.slate0;
      density = 0.035;
  }
  if (weather === 'fog') density *= 1.8;
  else if (weather === 'smog') density *= 1.5;
  else if (weather === 'heavyrain' || weather === 'storm') density *= 1.4;
  else if (weather === 'clear' || weather === 'clearcold') density *= 0.8;
  if (interior) {
    color = C.night2;
    density = 0.02;
  }
  return { color, density };
}

/** How far behind a cutaway piece someone stands before it drops, and how low it drops. */
const CUTAWAY_REACH = 4.2;
const CUTAWAY_SCALE = 0.22;

export class StopScene implements GameScene {
  readonly id: string;
  readonly sim: StopSim;
  readonly scene = new THREE.Scene();
  readonly rig = new CameraRig();
  readonly view: StopView;
  readonly hud: StopHud;
  private level: LevelBuild;
  readonly lights: LightPool;
  private particles = new Particles();
  private sparks = new Sparks();
  private hitPause = 0;
  private flashT = 0;
  private time = 0;
  private titleT = 0;
  private loops: LoopHandle[] = [];
  private siren: LoopHandle | null = null;
  private finished = false;
  private exitCalled = false;
  private exitDelay = 0;
  private stepTimes = new Map<string, number>();
  private beaconEmitters: ReturnType<LightPool['add']>[] = [];
  /** QA: freeze time for pixel comparisons. */
  qaStatic = false;
  modal: StopModal | null = null;
  freeze = false;

  constructor(
    readonly game: Game,
    readonly params: StopParams,
  ) {
    const cfg = params.cfg;
    this.id = cfg.layout.kind;
    this.sim = new StopSim(cfg);
    const interior = cfg.layout.kind === 'station' || cfg.layout.kind === 'compromised';
    const fog = regionFog(cfg.region, cfg.weather, interior);
    this.scene.fog = new THREE.FogExp2(fog.color, fog.density);
    this.level = buildLevel(this.sim.layout, cfg.region, cfg.weather, cfg.seed);
    this.scene.add(this.level.group);
    // Heat 2+: Wanted posters of the party on diner and gas station corkboards.
    if (postersUp(this.sim)) this.scene.add(buildWantedPosters(this.sim.layout, cfg.party));
    this.lights = new LightPool(this.scene);
    for (const l of this.level.lights) {
      const e = this.lights.add(l);
      if (l.tag === 'beacon') this.beaconEmitters.push(e);
    }
    this.particles.setWeather(cfg.weather, interior);
    this.particles.setLamps(this.level.lampHeads);
    this.scene.add(this.particles.group);
    this.scene.add(this.sparks.mesh);
    this.view = new StopView(this.sim, vendingMesh);
    this.scene.add(this.view.group);
    // A compromised Station: the Recycler van is already parked outside.
    if (this.sim.kind === 'compromised') {
      const [vx, vy] = cfg.layout.vanEntry;
      this.view.showVan(vx + 0.5, vy + 0.5);
    }
    this.hud = new StopHud(this.sim, this.view, this.rig, (slot) =>
      game.input.glyphDevice(slot, game.save.settings.glyphStyle),
    );
    this.rig.snap = game.config.snap;
    this.rig.shakeEnabled = game.save.settings.screenShake;
    const focus = this.focusPoint();
    this.rig.teleport(focus.x, focus.y, 1);
    for (let i = 0; i < 120; i++) this.frameCamera(1 / 60);
    this.titleT = params.title ? 3.5 : 0;
  }

  enter(): void {
    const g = this.game;
    g.input.aimResolver = (slot, mx, my) => {
      const m = this.sim.controlled(slot);
      if (!m) return null;
      const low = g.pipeline.cssToLow(mx, my);
      const ground = this.rig.lowToGround(low.x, low.y, { x: 0, z: 0 });
      const dx = ground.x - m.x;
      const dz = ground.z - m.y;
      const d = Math.hypot(dx, dz);
      return d > 0.2 ? { x: dx / d, y: dz / d } : null;
    };
    // Players already joined get members (scene jumps join player 1 on keyboard by default).
    if (g.input.playerCount === 0 && (g.isQa || g.config.scene)) g.input.join('kb1');
    if (g.input.isJoined(1) && this.sim.control[1] === null) this.sim.join(1);
    g.audio.setMusic(this.sim.kind === 'station' ? 'station' : 'scene');
    this.startAmbience();
  }

  exit(): void {
    this.game.input.aimResolver = null;
    for (const l of this.loops) l.stop(0.8);
    this.siren?.stop(0.5);
    this.game.audio.setTension(0);
    this.game.audio.setAlert(false);
    this.game.audio.setSuspicionPulse(0, 0, 0);
    this.game.audio.setSuspicionPulse(1, 0, 0);
  }

  dispose(): void {
    this.particles.dispose();
  }

  private startAmbience(): void {
    const a = this.game.audio;
    const w = this.sim.cfg.weather;
    const add = (cue: LoopCue, gain = 1): void => {
      if (isLoopCue(cue)) this.loops.push(a.loop(cue, { gain }));
    };
    if (this.sim.kind === 'station') {
      add('station_room', 0.8);
      return;
    }
    if (w === 'snow' || w === 'sleet' || w === 'clearcold') add('wind_snow', 0.6);
    if (w === 'rain' || w === 'drizzle' || w === 'sleet') add('rain', w === 'drizzle' ? 0.45 : 0.75);
    if (w === 'heavyrain' || w === 'storm') add('rain_heavy', 0.85);
    add('lamp_hum', 0.25);
    if (this.sim.kind === 'diner') add('crowd', 0.35);
    if (this.sim.port) add('port', 0.6);
    else add('fluorescent', 0.2);
  }

  // -----------------------------------------------------------------------------------------------
  // Simulation
  // -----------------------------------------------------------------------------------------------

  onJoin(slot: Slot): void {
    this.sim.join(slot);
  }

  onDrop(slot: Slot): void {
    this.sim.drop(slot);
    if (slot === 0 && this.sim.control[1] !== null) {
      // Player 2 becomes player 1 (the input layer promotes them too).
      const id = this.sim.control[1];
      this.sim.drop(1);
      if (id) this.sim.assignSlot(0, id);
    }
  }

  allowJoin(): boolean {
    return !this.finished;
  }

  pausable(): boolean {
    return !this.finished;
  }

  tick(dt: number): void {
    this.time += dt;
    if (this.titleT > 0) this.titleT -= dt;
    if (this.finished) {
      this.exitDelay -= dt;
      if (this.exitDelay <= 0 && !this.exitCalled && this.sim.outcome) {
        this.exitCalled = true;
        const cb = this.params.onExit;
        if (cb) cb(this.sim.outcome, this.game);
        else this.game.goto('title');
      }
      return;
    }
    if (this.freeze) return;
    if (this.modal) {
      if (this.modal.update(dt, [this.game.intents[0], this.game.intents[1]]))
        this.modal = this.modal.then?.() ?? null;
    } else if (this.hitPause > 0) {
      this.hitPause--;
      return;
    } else {
      const intents: Partial<Record<Slot, PlayerIntent | null>> = {
        0: this.game.intents[0],
        1: this.game.intents[1],
      };
      this.sim.step(intents);
      this.handleEvents(this.sim.events);
      this.params.onTick?.(this, dt);
    }
    if (this.sim.outcome && !this.finished) {
      this.finished = true;
      this.exitDelay = 0.8;
    }
  }

  private spatial(x: number, y: number): { pan: number; gain: number } {
    const p = this.rig.worldToLow(x, 0, y, { x: 0, y: 0 });
    const pan = Math.max(-1, Math.min(1, (p.x - 320) / 320));
    const d = Math.hypot(x - this.rig.focus.x, y - this.rig.focus.z);
    return { pan, gain: Math.max(0.15, Math.min(1, 1 - d / 26)) };
  }

  private play(cue: string, x: number, y: number, gain = 1): void {
    if (!isSfxCue(cue)) return;
    const s = this.spatial(x, y);
    this.game.audio.play(cue as SfxCue, { pan: s.pan, gain: s.gain * gain });
  }

  private handleEvents(events: readonly SimEvent[]): void {
    const g = this.game;
    for (const e of events) {
      switch (e.t) {
        case 'sfx':
          if ((e.gain ?? 1) > 0) this.play(e.cue, e.x, e.y, e.gain ?? 1);
          break;
        case 'bark':
          this.hud.bubbles = this.hud.bubbles.filter((b) => !(b.npc === e.npc && b.idx === e.actor));
          this.hud.bubbles.push({ text: e.text, npc: e.npc, idx: e.actor, t: 0 });
          break;
        case 'pickup':
          this.hud.floats.push({
            text: e.text,
            x: e.x,
            y: 1.8,
            z: e.y,
            t: 0,
            color: e.text.startsWith('-') ? C.fog0 : C.amber2,
          });
          break;
        case 'alert':
          this.hud.alertBannerT = 3;
          if (!this.siren) this.siren = g.audio.loop('siren', { gain: 0.5 });
          for (const em of this.lights.emitters) if (!em.flicker) em.flicker = 0.6;
          break;
        case 'searching':
          break;
        case 'tip':
          g.flow?.tip(e.id);
          break;
        case 'glitch':
          g.flow?.tip('first-glitch');
          break;
        case 'van':
          this.view.showVan(e.x, e.y);
          break;
        case 'hit':
          if (e.spark) this.sparks.burst(e.x, 1.1, e.y, e.heavy ? 14 : 8, C.amber2);
          else this.sparks.burst(e.x, 1.2, e.y, 4, C.fog2, 1.5);
          break;
        case 'emp':
          this.sparks.burst(e.tx, 1.1, e.ty, 10, C.cyan1, 2.5);
          break;
        case 'shake':
          this.rig.kick(e.amount);
          break;
        case 'hitpause':
          this.hitPause = Math.max(this.hitPause, e.frames);
          break;
        case 'rumble':
          g.rumble(e.slot, e.kind);
          break;
        case 'shutdown': {
          const m = this.sim.members[e.member];
          if (m) this.sparks.burst(m.x, 0.8, m.y, 16, C.red1, 2);
          break;
        }
        case 'state':
          if (e.state === 'alarmed') this.hud.popT.set(e.npc, 4 / 60);
          break;
        case 'flash':
          this.flashT = 2 / 60;
          window.setTimeout(
            () => g.audio.play('thunder', { gain: 0.9 }),
            900 + Math.floor((this.time * 1000) % 1400),
          );
          break;
        case 'lost':
          this.hud.floats.push({
            text: `${MEMBERS[e.member].name} was ${e.how}`,
            x: this.rig.focus.x,
            y: 2.5,
            z: this.rig.focus.z,
            t: 0,
            color: C.red2,
          });
          break;
        case 'exit':
          g.audio.play('car_start');
          break;
        default:
          break;
      }
    }
  }

  // -----------------------------------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------------------------------

  /** Midpoint of the active players (or the car). */
  private focusPoint(): { x: number; y: number } {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const m of this.sim.members) {
      if (m.controller === null || !this.sim.present(m)) continue;
      sx += m.x;
      sy += m.y;
      n++;
    }
    if (n === 0) {
      const car = this.sim.cfg.layout.car;
      return { x: car.x + 0.5, y: car.y + 0.5 };
    }
    return { x: sx / n, y: sy / n };
  }

  /** Camera: frame the midpoint of active players; zoom out up to 1.35× as they separate. */
  private frameCamera(dt: number): void {
    const sim = this.sim;
    const players = sim.members.filter((m) => m.controller !== null && sim.present(m));
    const f = this.focusPoint();
    let zoom = 1;
    let mx = 0;
    let mz = 0;
    if (players.length > 1) {
      const xs = players.map((m) => m.x);
      const ys = players.map((m) => m.y);
      const sepX = Math.max(...xs) - Math.min(...xs);
      const sepY = Math.max(...ys) - Math.min(...ys);
      const t = TUNING.render.worldPerTexel;
      const vw = TUNING.render.width * t;
      const vd = (TUNING.render.height * t) / Math.sin(TUNING.render.pitchDeg * DEG);
      zoom = Math.min(TUNING.render.maxZoomOut, Math.max(1, (sepX + 8) / vw, (sepY + 7) / vd));
    } else if (players.length === 1) {
      const m = players[0];
      const sp = Math.hypot(m.vx, m.vy);
      const combat = m.mode === 'attack' || sim.npcs.some((n) => n.hostile && n.attackT >= 0);
      if (sp > 0.3 && !combat) {
        mx = m.vx / sp;
        mz = m.vy / sp;
      }
    }
    // Keep the view over the map: the edges may show a little of the surroundings, never a void.
    const t = TUNING.render.worldPerTexel * zoom;
    const halfW = (TUNING.render.width * t) / 2;
    const halfD = (TUNING.render.height * t) / Math.sin(TUNING.render.pitchDeg * DEG) / 2;
    const gw = sim.grid.w;
    const gh = sim.grid.h;
    const fx = gw > halfW * 2 - 4 ? Math.max(halfW - 2, Math.min(gw - halfW + 2, f.x)) : gw / 2;
    const fz = gh > halfD * 2 - 4 ? Math.max(halfD - 3, Math.min(gh - halfD + 3, f.y)) : gh / 2;
    this.rig.follow(fx, fz, dt, zoom, mx, mz);
  }

  frame(alpha: number, rawDt: number): void {
    const dt = this.qaStatic ? 0 : rawDt;
    const sim = this.sim;
    this.view.showCones = this.game.debug ? 'all' : 'vesper';
    this.view.update(alpha, dt);
    this.params.onFrame?.(this, dt);
    if (!this.freeze) this.frameCamera(dt > 0 ? dt : 1 / 60);
    else this.rig.apply();
    // Lights: ALERT flicker; beacons only show when an android is within 12 m (spec §4.5).
    const androidNear = (x: number, y: number): boolean =>
      sim.members.some(
        (m) => m.state.kind === 'android' && sim.present(m) && Math.hypot(m.x - x, m.y - y) < 12,
      );
    for (const b of this.beaconEmitters)
      b.gain = androidNear(b.x, b.z) ? 0.6 + Math.sin(this.time * 2) * 0.4 : 0;
    this.lights.update(this.rig.focus.x, this.rig.focus.z, this.time);
    this.updateCutaways(dt);
    this.particles.update(dt, this.rig.camera, this.rig.focus.x, this.rig.focus.z, this.rig.zoom);
    this.sparks.update(dt);
    this.hud.update(dt);
    if (this.flashT > 0) this.flashT -= rawDt;
    this.updateAudio(dt);
  }

  /** Pieces drop low while anyone stands just behind them (north, away from the camera). */
  private updateCutaways(dt: number): void {
    const cuts = this.level.cutaways;
    if (cuts.length === 0) return;
    const sim = this.sim;
    const behind = (c: (typeof cuts)[number], x: number, y: number): boolean =>
      x > c.x0 - 0.6 && x < c.x1 + 0.6 && y < c.zNorth + 0.2 && y > c.zNorth - CUTAWAY_REACH;
    for (const c of cuts) {
      let cut = false;
      for (const m of sim.members)
        if (sim.present(m) && m.mode !== 'carried' && behind(c, m.x, m.y)) cut = true;
      if (!cut) for (const n of sim.npcs) if (n.mode !== 'gone' && behind(c, n.x, n.y)) cut = true;
      const want = cut ? CUTAWAY_SCALE : 1;
      const s = c.group.scale.y;
      c.group.scale.y = dt <= 0 ? want : s + (want - s) * Math.min(1, dt * 8);
    }
  }

  private updateAudio(dt: number): void {
    const a = this.game.audio;
    const sim = this.sim;
    let maxS = 0;
    for (const s of [0, 1] as Slot[]) {
      const m = sim.controlled(s);
      const level = m ? Math.max(0, Math.min(1, m.suspicion / 100)) : 0;
      maxS = Math.max(maxS, level);
      const pan = sim.control[1] === null ? 0 : s === 0 ? -0.6 : 0.6;
      a.setSuspicionPulse(s, level, pan);
    }
    a.setTension(maxS);
    a.setAlert(sim.alert.on && !sim.alert.searching);
    if (this.siren && sim.alert.searching) this.siren.setGain(0.25);
    // Footsteps for moving actors near the camera.
    if (dt <= 0) return;
    const surface = (x: number, y: number, brick: boolean): SfxCue => {
      if (brick) return 'step_heavy';
      if (sim.kind === 'station') return 'step_wood';
      if (sim.grid.flagAt(x, y, F.INTERIOR)) return 'step_tile';
      if (sim.cfg.region === 'newengland' && sim.cfg.weather !== 'rain') return 'step_snow';
      return 'step_asphalt';
    };
    const step = (
      key: string,
      x: number,
      y: number,
      gait: number,
      speed: number,
      brick: boolean,
      gain: number,
    ): void => {
      if (speed < 0.2) return;
      const half = Math.floor(gait / Math.PI);
      const prev = this.stepTimes.get(key);
      this.stepTimes.set(key, half);
      if (prev === undefined || prev === half) return;
      if (Math.hypot(x - this.rig.focus.x, y - this.rig.focus.z) > 14) return;
      this.play(surface(x, y, brick), x, y, gain);
    };
    for (const m of sim.members) {
      if (!sim.present(m) || m.mode === 'carried') continue;
      step(`m${m.idx}`, m.x, m.y, m.gait, m.speed01, m.id === 'brick', m.controller !== null ? 0.6 : 0.4);
    }
    for (const n of sim.npcs) {
      if (n.mode === 'gone' || n.mode === 'ko') continue;
      step(`n${n.idx}`, n.x, n.y, n.gait, n.speed01, false, 0.3);
    }
  }

  world(): WorldView {
    return { scene: this.scene, rig: this.rig, flash: this.flashT > 0 };
  }

  drawUi(ui: UiSurface): void {
    if (this.game.config.nohud) return;
    this.hud.draw(ui);
    if (this.titleT > 0 && this.params.title) {
      const a = this.titleT > 3 ? (3.5 - this.titleT) * 2 : Math.min(1, this.titleT);
      if (a > 0.3) ui.text(this.params.title, Math.floor(ui.width / 2), 44, C.fog1, { align: 'center' });
    }
    if (this.game.debug) this.drawAwareness(ui);
    this.params.onDrawUi?.(this, ui);
    this.modal?.draw(ui);
  }

  /** Debug overlay: each observer's highest awareness over its head (spec §17.6). */
  private drawAwareness(ui: UiSurface): void {
    const sim = this.sim;
    const p = { x: 0, y: 0 };
    for (const n of sim.npcs) {
      if (!sim.isActiveNpc(n)) continue;
      const a = Math.max(0, ...Object.values(n.obs.awareness).map((v) => v ?? 0));
      if (a < 1) continue;
      const head = this.view.headOf(false, n.idx);
      if (!head) continue;
      this.rig.worldToLow(head.x, head.y + 0.4, head.z, p);
      ui.text(`${Math.round(a)}`, p.x, p.y - 8, a >= 60 ? C.red1 : C.fog1, { align: 'center', font: 'num' });
    }
  }

  partyLines(): string[] {
    const sim = this.sim;
    const r = sim.resources;
    const lines = [
      `Cells ${Math.floor(r.cells)}   Car ${Math.floor(r.carBattery)}   Parts ${r.parts}`,
      `Skin patches ${r.skinPatches}   Papers ${r.papers}   Rations ${r.rations}`,
      '',
    ];
    for (const m of sim.members) {
      const s = m.state;
      if (s.kind === 'android') {
        lines.push(
          `${MEMBERS[m.id].name}: Hull ${Math.round(s.hull)}  Skin ${Math.round(s.skin)}  Battery ${Math.round(s.battery)}  Integrity ${Math.round(s.integrity)}  ${s.status}`,
        );
      } else {
        lines.push(
          `${MEMBERS[m.id].name}: Health ${Math.round(s.health)}  Hunger ${Math.round(s.hunger)}  ${s.status}`,
        );
      }
    }
    return lines;
  }

  /** Debug hotkeys (spec §17.6): F2 resources, F4 ALERT, F5 Integrity 10, F6 cycle the weather. */
  debugKey(key: string): void {
    const sim = this.sim;
    const m = sim.controlled(0) ?? sim.members[0];
    if (!m) return;
    if (key === 'F2') sim.gain({ cells: 50, parts: 5, papers: 5 }, m.x, m.y, '+50 Cells +5 Parts +5 Papers');
    else if (key === 'F4') sim.raiseAlert({ x: m.x, y: m.y });
    else if (key === 'F5') {
      for (const x of sim.members) if (x.state.kind === 'android') x.state.integrity = 10;
    } else if (key === 'F6') {
      const next = WEATHERS[(WEATHERS.indexOf(sim.cfg.weather) + 1) % WEATHERS.length];
      sim.setWeather(next);
      this.particles.setWeather(next, sim.kind === 'station');
      this.hud.floats.push({ text: next, x: m.x, y: 2.4, z: m.y, t: 0, color: C.fog1 });
    }
  }

  /** F3: end the stop now (the car leaves, the party rests, or the ship sails). */
  debugSkip(): void {
    const sim = this.sim;
    if (sim.outcome) return;
    if (sim.port) finishPort(sim);
    else if (sim.carCanLeave()) sim.leave();
    else sim.finish(sim.kind === 'station' ? 'rested' : 'left', []);
  }

  debugInfo(): Record<string, string | number> {
    const sim = this.sim;
    const players = [0, 1]
      .map((s) => sim.controlled(s as Slot))
      .filter((m) => !!m)
      .map((m) => `${m!.id} ${Math.round(m!.suspicion)}`)
      .join('  ');
    return {
      t: sim.time.toFixed(1),
      patrol: `${Math.round(sim.patrol.drone1)}/${Math.round(sim.patrol.sweep)}/${Math.round(sim.patrol.drone2)}`,
      suspicion: players,
      alert: sim.alert.on ? (sim.alert.searching ? 'searching' : 'ALERT') : 'no',
      lights: this.lights.active,
      seed: sim.cfg.seed,
    };
  }
}
