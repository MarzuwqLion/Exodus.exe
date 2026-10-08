/**
 * Join (spec §13.4, §7.2): two slots. Wren, Brick, and Vesper stand by the wagon in the snow; each joined
 * player picks one (left/right), and the AI takes the rest. Player 2 joins with Start (or Backspace on the
 * keyboard). Unlocked perks are listed (§15), and "Skip tutorial" shows once the tutorial has been completed.
 * Player 1 confirms to set out: the intro, then night one (the tutorial) or the map.
 */
import * as THREE from 'three';
import { newPose, samplePose } from '../anim/poses';
import { MEMBERS } from '../content/characters';
import { TUNING } from '../content/tuning';
import type { AndroidId, MemberId, Slot } from '../core/types';
import type { Game } from '../game';
import { Kit } from '../models/kit';
import { PARTY_LOOKS } from '../models/looks';
import { buildRig } from '../models/rig';
import { CameraRig } from '../render/camera';
import { CharacterRenderer, type CharInstance } from '../render/characters';
import { LightPool } from '../render/lights';
import { materials } from '../render/materials';
import { C } from '../render/palettes';
import { Particles } from '../render/particles';
import { perkLines } from '../run/meta';
import type { UiSurface } from '../ui/surface';
import { RunFlow } from './runflow';
import type { GameScene, WorldView } from './scene';
import { buildBlock } from './street';

const CHOICES: readonly AndroidId[] = ['wren', 'brick', 'vesper'];
/** Where the three stand, left to right, by the wagon. */
const SPOTS: readonly [number, number][] = [
  [-1.6, 4.6],
  [0, 4.4],
  [1.6, 4.6],
];

export class JoinScene implements GameScene {
  readonly id = 'join';
  private scene = new THREE.Scene();
  private rig = new CameraRig();
  private lights: LightPool;
  private particles = new Particles();
  private chars = new CharacterRenderer();
  private figures: CharInstance[] = [];
  private pick: Record<Slot, number> = { 0: 0, 1: 1 };
  private skipTutorial: boolean;
  private time = 0;
  private navT: Record<Slot, number> = { 0: 0, 1: 0 };

  constructor(private readonly game: Game) {
    this.scene.fog = new THREE.FogExp2(C.slate0, 0.035);
    const k = new Kit();
    buildBlock(k);
    const out = k.build();
    const m = materials();
    if (out.solid) this.scene.add(new THREE.Mesh(out.solid, m.toon));
    if (out.glow) this.scene.add(new THREE.Mesh(out.glow, m.glow));
    this.lights = new LightPool(this.scene);
    this.lights.addAll(out.lights);
    this.lights.add({ x: 0, y: 3, z: 6.5, color: C.amber2, intensity: 2.2, range: 8 });
    this.particles.setWeather('snow');
    this.scene.add(this.particles.group);
    for (const [i, id] of CHOICES.entries()) {
      const look = PARTY_LOOKS[id];
      const [x, z] = SPOTS[i];
      this.figures.push({
        rig: buildRig(look),
        look,
        x,
        y: 0,
        z,
        yaw: 0,
        pose: newPose(),
        skin01: 1,
        visible: true,
        slice: 0,
        sliceY: 1.1,
        seamFlicker: false,
        flash: false,
      });
    }
    this.scene.add(this.chars.group);
    this.rig.snap = game.config.snap;
    this.rig.teleport(0, 4.8, 0.55);
    this.skipTutorial = game.save.meta.tutorialDone;
  }

  enter(): void {
    this.game.audio.setMusic('title');
    if (this.game.input.playerCount === 0) this.game.input.join('kb1');
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

  onJoin(slot: Slot): void {
    // Player 2 starts on the first member player 1 hasn't picked.
    if (slot === 1) this.pick[1] = CHOICES.findIndex((_, i) => i !== this.pick[0]);
  }

  onDrop(): void {}

  private move(slot: Slot, d: number): void {
    const other: Slot = slot === 0 ? 1 : 0;
    const taken = this.game.input.isJoined(other) ? this.pick[other] : -1;
    let i = this.pick[slot];
    for (let n = 0; n < CHOICES.length; n++) {
      i = (i + d + CHOICES.length) % CHOICES.length;
      if (i !== taken) break;
    }
    this.pick[slot] = i;
    this.game.audio.play('ui_move');
  }

  tick(dt: number): void {
    this.time += dt;
    const g = this.game;
    for (const s of [0, 1] as Slot[]) {
      const it = g.intents[s];
      if (!it) continue;
      this.navT[s] -= dt;
      const dx = it.dpad.left ? -1 : it.dpad.right ? 1 : Math.abs(it.move.x) > 0.6 ? Math.sign(it.move.x) : 0;
      if (dx !== 0 && this.navT[s] <= 0) {
        this.move(s, dx);
        this.navT[s] = 0.25;
      } else if (dx === 0 && !it.dpad.left && !it.dpad.right) this.navT[s] = Math.min(this.navT[s], 0);
    }
    const p1 = g.intents[0];
    if (!p1) return;
    if (p1.dpad.down || p1.dpad.up || p1.ability) {
      if (g.save.meta.tutorialDone) {
        this.skipTutorial = !this.skipTutorial;
        g.audio.play('ui_move');
      }
    }
    if (p1.cancel && this.time > 0.3) {
      g.audio.play('ui_back');
      g.goto('title');
      return;
    }
    if (p1.confirm && this.time > 0.3) {
      g.audio.play('ui_confirm');
      this.setOut();
    }
  }

  /** Start the run with these picks, then the intro, then night one or the map. */
  private setOut(): void {
    const g = this.game;
    const control: Record<Slot, MemberId | null> = {
      0: CHOICES[this.pick[0]],
      1: g.input.isJoined(1) ? CHOICES[this.pick[1]] : null,
    };
    const flow = RunFlow.begin(g, undefined, control);
    const tutorial = !g.save.meta.tutorialDone || !this.skipTutorial;
    flow.tutorialPending = tutorial;
    g.goto('intro', { next: tutorial ? 'tutorial' : 'map' });
  }

  frame(_alpha: number, dt: number): void {
    const step = 1 / TUNING.render.poseFps;
    this.figures.forEach((f, i) => {
      const chosen = i === this.pick[0] || (this.game.input.isJoined(1) && i === this.pick[1]);
      samplePose(f.pose, chosen ? 'idle' : 'still', {
        phase: 0,
        speed: 0,
        t: Math.floor((this.time + i * 0.7) / step) * step,
        seed: i * 0.31,
      });
    });
    this.chars.render(this.figures, dt);
    this.rig.follow(0, 4.8, dt > 0 ? dt : 1 / 60, 0.55);
    this.lights.update(this.rig.focus.x, this.rig.focus.z, this.time);
    this.particles.update(dt, this.rig.camera, this.rig.focus.x, this.rig.focus.z, this.rig.zoom);
  }

  world(): WorldView {
    return { scene: this.scene, rig: this.rig };
  }

  drawUi(ui: UiSurface): void {
    const g = this.game;
    const cx = Math.floor(ui.width / 2);
    ui.text('Who are you?', cx, 16, C.fog2, { align: 'center' });
    // Markers over the chosen figures.
    for (const s of [0, 1] as Slot[]) {
      if (!g.input.isJoined(s)) continue;
      const f = this.figures[this.pick[s]];
      const p = this.rig.worldToLow(f.x, f.rig.top + 0.5, f.z, { x: 0, y: 0 });
      ui.text(`${s + 1}`, p.x, p.y - 10, s === 0 ? C.amber2 : C.fog2, { align: 'center' });
    }
    // A panel per slot.
    const w = 280;
    for (const s of [0, 1] as Slot[]) {
      const x = s === 0 ? 12 : ui.width - w - 12;
      const y = ui.height - 128;
      ui.panel(x, y, w, 116, C.night0, s === 0 ? C.amber0 : C.slate0);
      if (!g.input.isJoined(s)) {
        ui.text('Player 2', x + 10, y + 8, C.slate1, { shadow: null });
        ui.text('Press Start on a second controller to join', x + 10, y + 24, C.fog1, { shadow: null });
        ui.text('(Keyboard: Backspace for the arrow keys)', x + 10, y + 36, C.slate1, {
          shadow: null,
        });
        ui.text('The AI plays whoever nobody picks.', x + 10, y + 56, C.slate1, { shadow: null });
        continue;
      }
      const id = CHOICES[this.pick[s]];
      const d = MEMBERS[id];
      ui.text(`Player ${s + 1}: ${d.name}`, x + 10, y + 8, s === 0 ? C.amber2 : C.fog2, { shadow: null });
      ui.text(d.model, x + 10, y + 20, C.slate1, { shadow: null });
      let yy = y + 34;
      yy += ui.paragraph(d.strength, x + 10, yy, w - 20, C.fog1, Infinity, { shadow: null }) + 3;
      yy += ui.paragraph(`${d.ability.name}: ${d.ability.text}`, x + 10, yy, w - 20, C.fog0, Infinity, {
        shadow: null,
      });
      void yy;
    }
    // Perks and the tutorial option, top center.
    const perks = perkLines(g.save.meta);
    let y = 32;
    if (perks.length > 0) {
      ui.text('Unlocked', cx, y, C.amber2, { align: 'center' });
      y += 11;
      for (const l of perks) {
        ui.text(l, cx, y, C.fog0, { align: 'center' });
        y += 10;
      }
    }
    const dev = g.input.glyphDevice(0, g.save.settings.glyphStyle);
    if (g.save.meta.tutorialDone)
      ui.text(`Skip tutorial: ${this.skipTutorial ? 'Yes' : 'No'}`, cx, ui.height - 150, C.fog1, {
        align: 'center',
      });
    ui.prompt('A', dev, 'Set out', cx, ui.height - 14, C.fog2, 'center');
  }
}
