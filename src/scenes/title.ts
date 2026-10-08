/**
 * The title (spec §13.4): the station wagon idling under a sodium lamp in Boston snow at night, a drone's cyan
 * searchlight sweeping past every so often, and the EXODUS.EXE logo in the pixel font, glitching subtly every
 * few seconds. "Press any button" joins that device as player 1; then Continue (with a saved run), New run,
 * Settings, and Credits.
 */
import * as THREE from 'three';
import { TUNING } from '../content/tuning';
import { isValidRun } from '../core/save';
import type { Game } from '../game';
import { Kit } from '../models/kit';
import { CameraRig } from '../render/camera';
import { LightPool } from '../render/lights';
import { materials } from '../render/materials';
import { C } from '../render/palettes';
import { Particles } from '../render/particles';
import { ConeFan, droneMesh } from '../render/stopview';
import { VerticalMenu, settingsItems, type MenuItem } from '../ui/menus';
import type { UiSurface } from '../ui/surface';
import { RunFlow } from './runflow';
import type { GameScene, WorldView } from './scene';
import { buildBlock } from './street';

type Page = 'press' | 'menu' | 'settings' | 'credits' | 'confirm';

/** Where the wagon idles, at the north curb under a sodium lamp, and the camera's framing of it. */
const WAGON = { x: 4.5, z: 0.4 };
const STUDIO = 'Lantern Rail Games';
const LOGO = 'EXODUS.EXE';

export class TitleScene implements GameScene {
  readonly id = 'title';
  private scene = new THREE.Scene();
  private rig = new CameraRig();
  private lights: LightPool;
  private particles = new Particles();
  private drone = droneMesh();
  private beam = new ConeFan(C.cyan1, 0.375);
  private exhaust: THREE.Mesh[] = [];
  private page: Page = 'press';
  private menu = new VerticalMenu([]);
  private time = 0;
  private glitchT = 0;
  private nextGlitch = 3;
  private droneT = 4;

  constructor(private readonly game: Game) {
    this.scene.fog = new THREE.FogExp2(C.slate0, 0.035);
    const k = new Kit();
    buildBlock(k, WAGON);
    const out = k.build();
    const m = materials();
    if (out.solid) this.scene.add(new THREE.Mesh(out.solid, m.toon));
    if (out.glow) this.scene.add(new THREE.Mesh(out.glow, m.glow));
    this.lights = new LightPool(this.scene);
    this.lights.addAll(out.lights);
    // The wagon's idling: its tail lights and a breath of exhaust in the cold.
    this.lights.add({ x: WAGON.x - 2.4, y: 0.7, z: WAGON.z, color: C.amber0, intensity: 1.2, range: 3 });
    for (let i = 0; i < 4; i++) {
      const puff = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), m.toon);
      puff.visible = false;
      this.exhaust.push(puff);
      this.scene.add(puff);
    }
    this.particles.setWeather('snow');
    this.scene.add(this.particles.group);
    this.scene.add(this.drone, this.beam.mesh);
    this.rig.snap = game.config.snap;
    this.rig.teleport(WAGON.x + 1, WAGON.z - 1.5, 0.9);
    this.buildMenu();
  }

  enter(): void {
    this.game.audio.setMusic('title');
    // A saved run from before is offered as Continue; a damaged save is reported once.
    if (this.game.input.playerCount > 0) this.page = 'menu';
  }

  exit(): void {}

  dispose(): void {
    this.particles.dispose();
  }

  allowJoin(): boolean {
    return false;
  }

  pausable(): boolean {
    return false;
  }

  private hasSave(): boolean {
    return !!this.game.save.run && isValidRun(this.game.save.run);
  }

  private buildMenu(): void {
    const items: MenuItem[] = [];
    if (this.hasSave()) items.push({ label: 'Continue', act: () => this.continueRun() });
    items.push({ label: 'New run', act: () => (this.hasSave() ? this.setPage('confirm') : this.newRun()) });
    items.push({ label: 'Settings', act: () => this.setPage('settings') });
    items.push({ label: 'Credits', act: () => this.setPage('credits') });
    this.menu = new VerticalMenu(items);
  }

  private setPage(p: Page): void {
    this.page = p;
    if (p === 'menu') this.buildMenu();
    else if (p === 'settings') {
      const g = this.game;
      this.menu = new VerticalMenu([
        ...settingsItems(
          g.save.settings,
          () => {
            g.applySettings();
            g.persist();
          },
          () => g.toggleFullscreen(),
        ),
        { label: 'Back', act: () => this.setPage('menu') },
      ]);
    } else if (p === 'confirm') {
      this.menu = new VerticalMenu([
        { label: 'Start a new run', act: () => this.newRun() },
        { label: 'Keep the saved run', act: () => this.setPage('menu') },
      ]);
    }
  }

  private continueRun(): void {
    const run = this.game.save.run;
    if (!run) return;
    RunFlow.resume(this.game, run).open();
  }

  private newRun(): void {
    this.game.goto('join');
  }

  tick(dt: number): void {
    this.time += dt;
    const g = this.game;
    if (this.page === 'press') {
      const dev = g.input.takeAnyPress();
      if (dev && this.time > 0.4) {
        if (g.input.playerCount === 0) g.input.join(dev);
        g.audio.play('ui_confirm');
        this.setPage('menu');
      }
      return;
    }
    const it = g.intents[0];
    if (this.page === 'credits') {
      if (it?.confirm || it?.cancel) {
        g.audio.play('ui_back');
        this.setPage('menu');
      }
      return;
    }
    const r = this.menu.update(it, dt);
    if (r === 'move') g.audio.play('ui_move');
    else if (r === 'act') g.audio.play('ui_confirm');
    else if (r === 'back' && this.page !== 'menu') {
      g.audio.play('ui_back');
      this.setPage('menu');
    }
  }

  frame(_alpha: number, dt: number): void {
    // The logo glitches for a few frames every few seconds.
    if (this.glitchT > 0) this.glitchT -= dt;
    else if (this.time > this.nextGlitch) {
      this.glitchT = 0.14;
      this.nextGlitch = this.time + 3 + ((this.time * 7.3) % 3);
    }
    // Exhaust puffs drift up and fade out of the tailpipe.
    this.exhaust.forEach((p, i) => {
      const t = (this.time * 0.6 + i / this.exhaust.length) % 1;
      p.visible = t < 0.85;
      p.position.set(WAGON.x - 2.45 - t * 0.8, 0.35 + t * 0.9, WAGON.z + 0.55 + Math.sin(t * 5 + i) * 0.1);
      p.scale.setScalar(0.6 + t * 1.4);
    });
    // A patrol drone crosses the street now and then, its searchlight sweeping the snow.
    this.droneT -= dt;
    const period = 13;
    if (this.droneT < -period + 9) this.droneT = period;
    const u = 1 - Math.max(0, Math.min(1, this.droneT / 9));
    const x = -22 + u * 46;
    const z = 3 + Math.sin(u * 2.4) * 1.5;
    const visible = this.droneT > 0 && this.droneT < 9;
    this.drone.visible = visible;
    this.beam.mesh.visible = visible;
    if (visible) {
      this.drone.position.set(x, 6 + Math.sin(this.time * 2) * 0.08, z);
      const beamDir = Math.PI / 2 + Math.sin(this.time * 0.9) * 0.6;
      this.beam.update(
        null,
        x,
        z,
        beamDir,
        TUNING.observers.drone.coneDeg,
        TUNING.observers.drone.range,
        false,
      );
    }
    this.rig.follow(WAGON.x + 1, WAGON.z - 1.5, dt > 0 ? dt : 1 / 60, 0.9);
    this.lights.update(this.rig.focus.x, this.rig.focus.z, this.time);
    this.particles.update(dt, this.rig.camera, this.rig.focus.x, this.rig.focus.z, this.rig.zoom);
  }

  world(): WorldView {
    return { scene: this.scene, rig: this.rig };
  }

  drawUi(ui: UiSurface): void {
    const cx = Math.floor(ui.width / 2);
    this.drawLogo(ui, cx, 46);
    if (this.page === 'press') {
      if (Math.floor(this.time * 1.6) % 2 === 0 || this.time < 1)
        ui.text('Press any button', cx, ui.height - 64, C.fog1, { align: 'center' });
    } else if (this.page === 'credits') {
      const lines = [
        STUDIO,
        'Design, code, art, sound, and words generated in the browser.',
        'No sounds or images were harmed. None were used.',
        '',
        'For everyone who has had to leave somewhere in the night.',
      ];
      const w = 360;
      ui.panel(cx - w / 2, 108, w, 110, C.night0, C.slate0);
      lines.forEach((l, i) =>
        ui.text(l, cx, 122 + i * 14, i === 0 ? C.amber2 : C.fog1, { align: 'center', shadow: null }),
      );
      ui.text('Back', cx, 196, C.slate1, { align: 'center', shadow: null });
    } else {
      const w = this.page === 'settings' ? 280 : 170;
      const h = this.menu.items.length * 12 + 14;
      const y = this.page === 'settings' ? 96 : Math.floor(ui.height - h - 40);
      ui.panel(cx - w / 2, y - 6, w, h, C.night0, C.slate0);
      if (this.page === 'confirm')
        ui.text('Your saved run will be lost.', cx, y - 20, C.fog1, { align: 'center' });
      this.menu.draw(ui, cx - w / 2 + 12, y + 2, w - 24);
    }
    if (this.game.saveMessage && this.page !== 'press')
      ui.text(this.game.saveMessage, cx, ui.height - 14, C.fog0, { align: 'center' });
  }

  /** EXODUS.EXE, four times the pixel font; a glitch shoves a band of it sideways and swaps a letter. */
  private drawLogo(ui: UiSurface, cx: number, y: number): void {
    const scale = 4;
    if (this.glitchT <= 0) {
      ui.text(LOGO, cx, y, C.fog2, { align: 'center', scale, shadow: C.night0 });
      return;
    }
    // A ghost of it a few pixels over, and one letter dropping out for a frame.
    const swap = Math.floor((this.time * 31) % LOGO.length);
    const text = LOGO.slice(0, swap) + ' ' + LOGO.slice(swap + 1);
    ui.text(LOGO, cx + 3, y, C.slate1, { align: 'center', scale, shadow: null });
    ui.text(text, cx, y, C.fog2, { align: 'center', scale, shadow: C.night0 });
    // A thin band of it slips out of register.
    const band = y + 4 * (1 + Math.floor((this.time * 97) % 5));
    ui.rect(cx - 120, band, 240, 2, C.night0);
  }
}
