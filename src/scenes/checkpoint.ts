/**
 * Checkpoints (spec §11.1–11.4): the car waits in line under the floodlights while, ahead, Recyclers lead a
 * unit from another car to their van. Then a guard leans into the window and asks each android two
 * questions (he alternates between players; the party AI answers for the rest), timing matters as much as
 * the answer, and his suspicion shows as a red meter beside his portrait. Then he sweeps a scanner over the
 * car: each android breathes for 6–8 s (both players at once in co-op, each with their own ring). Under 70
 * the car passes; 70–99 costs 1 Papers or it's a bust; 100 is a bust, and the compound becomes a stop.
 */
import * as THREE from 'three';
import { newPose, samplePose } from '../anim/poses';
import { MEMBERS } from '../content/characters';
import { STOP_LAYOUTS } from '../content/layouts';
import { TIPS } from '../content/lantern';
import { TUNING } from '../content/tuning';
import { Rng, hashSeed } from '../core/rng';
import type { AndroidState, Slot } from '../core/types';
import type { Game } from '../game';
import { MenuNav } from '../input/intents';
import { npcLook } from '../models/looks';
import { buildRig } from '../models/rig';
import { aiBreath } from '../bots/checkpointbots';
import { CameraRig } from '../render/camera';
import { CharacterRenderer, type CharInstance } from '../render/characters';
import { buildLevel } from '../render/level';
import { LightPool } from '../render/lights';
import { C } from '../render/palettes';
import { Particles } from '../render/particles';
import { vanMesh, wagonMesh } from '../render/stopview';
import {
  aiAnswer,
  answerQuestion,
  applyBustCost,
  applyScan,
  checkpointResult,
  checkpointStress,
  startCheckpoint,
  type AnswerKind,
  type CheckpointState,
} from '../run/checkpoint';
import { currentNode } from '../run/map';
import { activeAndroids } from '../run/party';
import { withRng } from '../run/run';
import { newScan, pressScan, ringPhase, stepScan, type BreathScan } from '../sim/breathing';
import { parseLayout } from '../sim/layout';
import type { UiSurface } from '../ui/surface';
import { partyLines } from './map';
import type { RunFlow } from './runflow';
import type { GameScene, WorldView } from './scene';

type Phase = 'queue' | 'ask' | 'scan' | 'papers' | 'pass' | 'bust';

interface PlayerScan {
  slot: Slot;
  member: AndroidState;
  scan: BreathScan;
}

export class CheckpointScene implements GameScene {
  readonly id = 'checkpoint';
  readonly scene = new THREE.Scene();
  readonly rig = new CameraRig();
  private lights: LightPool;
  private particles = new Particles();
  private chars = new CharacterRenderer();
  private walkers: CharInstance[] = [];
  private phase: Phase = 'queue';
  private phaseT = 0;
  private time = 0;
  private cp: CheckpointState;
  private asked = 0;
  private sel = 0;
  private nav = new MenuNav();
  /** When the party AI answers the current question (seconds into it). */
  private aiAt = -1;
  private scans: PlayerScan[] = [];
  private flash = 0;
  private tip: string | null = null;
  private rng: Rng;

  constructor(
    private readonly game: Game,
    private readonly flow: RunFlow,
  ) {
    flow.tip('first-checkpoint');
    const run = flow.run;
    const node = currentNode(run.map);
    this.rng = new Rng(hashSeed('checkpoint', run.seed, run.leg));
    this.scene.fog = new THREE.FogExp2(C.slate0, 0.02);
    const L = parseLayout(STOP_LAYOUTS.checkpoint[0]);
    const level = buildLevel(L, node.region, node.weather, run.seed);
    this.scene.add(level.group);
    this.lights = new LightPool(this.scene);
    this.lights.addAll(level.lights);
    // Floodlights over the lanes.
    for (const x of [15, 25]) this.lights.add({ x, y: 7, z: 12, color: C.fog2, intensity: 4, range: 16 });
    // The party's car in line, the car ahead, and the Recycler van in the inspection lot.
    const car = wagonMesh();
    car.position.set(19.5, 0, 9);
    car.rotation.y = -Math.PI / 2;
    const ahead = wagonMesh();
    ahead.position.set(19.5, 0, 14.5);
    ahead.rotation.y = -Math.PI / 2;
    const van = vanMesh();
    van.body.position.set(32, 0, 17);
    van.barOn.position.copy(van.body.position);
    this.scene.add(car, ahead, van.body, van.barOn);
    // Two Recyclers walking a unit from the car ahead to the van.
    for (const role of ['recycler', 'recycler', 'customer'] as const) {
      const look = npcLook(role, this.walkers.length * 17 + 3);
      this.walkers.push({
        rig: buildRig(look),
        look,
        x: 21,
        y: 0,
        z: 14.5,
        yaw: 0,
        pose: newPose(),
        skin01: role === 'customer' ? 0.4 : 1,
        visible: true,
        slice: 0,
        sliceY: 1.1,
        seamFlicker: false,
        flash: false,
      });
    }
    this.scene.add(this.chars.group);
    this.particles.setWeather(node.weather);
    this.scene.add(this.particles.group);
    this.rig.snap = game.config.snap;
    this.rig.teleport(21, 12, 0.9);
    checkpointStress(run);
    this.cp = withRng(run, (rng) => startCheckpoint(run, rng));
    if (!game.save.meta.tipsShown.includes('first-checkpoint') && game.save.settings.tips) {
      game.save.meta.tipsShown.push('first-checkpoint');
      flow.phone.push(TIPS.find((t) => t.id === 'first-checkpoint')!.text);
    }
  }

  enter(): void {
    this.game.audio.setMusic('scene');
  }

  exit(): void {}

  dispose(): void {
    this.particles.dispose();
  }

  allowJoin(): boolean {
    return false;
  }

  pausable(): boolean {
    return this.phase !== 'bust';
  }

  private slotFor(id: string): Slot | null {
    const c = this.flow.run.control;
    if (c[0] === id) return 0;
    if (c[1] === id) return 1;
    return null;
  }

  private beginQuestion(): void {
    const q = this.cp.questions[this.cp.next];
    this.phaseT = 0;
    this.sel = 0;
    this.aiAt = this.slotFor(q.member) === null ? this.rng.range(1.6, 3.4) : -1;
  }

  private beginScan(): void {
    this.phase = 'scan';
    this.phaseT = 0;
    const run = this.flow.run;
    this.scans = [];
    for (const slot of [0, 1] as Slot[]) {
      const id = run.control[slot];
      const m = run.party.find((p) => p.id === id && p.kind === 'android' && p.status === 'active') as
        AndroidState | undefined;
      if (!m) continue;
      this.scans.push({
        slot,
        member: m,
        scan: newScan(this.rng, { skin01: m.skin / 100, integrity: m.integrity }),
      });
    }
    if (!this.game.save.meta.tipsShown.includes('first-scan') && this.game.save.settings.tips) {
      this.game.save.meta.tipsShown.push('first-scan');
      this.tip = TIPS.find((t) => t.id === 'first-scan')!.text;
    }
  }

  /** The party AI's androids breathe on their own; their meters are added with the players'. */
  private aiScanMeters(): number[] {
    const run = this.flow.run;
    const out: number[] = [];
    for (const a of activeAndroids(run.party)) {
      if (this.slotFor(a.id) !== null) continue;
      const s = newScan(this.rng, { skin01: a.skin / 100, integrity: a.integrity });
      const press = aiBreath(a);
      let next = -1;
      let at = Infinity;
      while (!s.done) {
        if (s.next < s.beats.length && next !== s.next) {
          next = s.next;
          at = press(s.beats[s.next], this.rng);
        }
        if (s.t >= at) {
          pressScan(s);
          at = Infinity;
        }
        stepScan(s, 1 / 60);
      }
      out.push(s.meter);
    }
    return out;
  }

  private decide(): void {
    const result = checkpointResult(this.cp.suspicion);
    if (result === 'pass') this.setPhase('pass');
    else if (result === 'papers') this.setPhase('papers');
    else this.setPhase('bust');
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
    this.sel = 0;
    if (p === 'bust') {
      this.flash = 0.6;
      this.game.audio.play('alarm_pop');
    }
  }

  tick(dt: number): void {
    this.time += dt;
    this.phaseT += dt;
    this.flow.phone.update(dt);
    if (this.flash > 0) this.flash -= dt;
    const run = this.flow.run;
    const its = this.game.intents;
    switch (this.phase) {
      case 'queue':
        if (this.phaseT > 7 || its[0]?.confirm) {
          this.phase = 'ask';
          this.beginQuestion();
        }
        break;
      case 'ask': {
        const q = this.cp.questions[this.cp.next];
        if (!q) {
          this.beginScan();
          break;
        }
        const slot = this.slotFor(q.member);
        if (slot === null) {
          if (this.phaseT >= this.aiAt) {
            const ai = aiAnswer(this.rng);
            answerQuestion(this.cp, ai.kind, this.aiAt);
            this.nextQuestion();
          }
          break;
        }
        const it = its[slot];
        if (!it) break;
        const { dx, dy } = this.nav.step(it, dt);
        const d = dy !== 0 ? dy : dx;
        if (d !== 0) this.sel = (this.sel + d + q.answers.length) % q.answers.length;
        // Answers appear 0.4 s after the question; timing counts from then.
        if (it.confirm && this.phaseT > 0.4) {
          answerQuestion(this.cp, q.answers[this.sel], this.phaseT - 0.4);
          this.nextQuestion();
        }
        break;
      }
      case 'scan': {
        let allDone = true;
        for (const p of this.scans) {
          if (p.scan.done) continue;
          allDone = false;
          if (its[p.slot]?.interact) pressScan(p.scan);
          stepScan(p.scan, dt);
        }
        if (allDone && this.phaseT > 0.5) {
          applyScan(this.cp, [...this.scans.map((p) => p.scan.meter), ...this.aiScanMeters()]);
          for (const p of this.scans) p.member.integrity = Math.max(0, p.member.integrity);
          this.decide();
        }
        break;
      }
      case 'papers': {
        const it = its[0];
        if (!it) break;
        const { dx, dy } = this.nav.step(it, dt);
        if (dx !== 0 || dy !== 0) this.sel = 1 - this.sel;
        if (it.confirm && this.phaseT > 0.5) {
          if (this.sel === 0 && run.resources.papers > 0) {
            run.resources.papers -= 1;
            this.setPhase('pass');
          } else this.setPhase('bust');
        }
        break;
      }
      case 'pass':
        if (this.phaseT > 2.4 || (its[0]?.confirm && this.phaseT > 0.6)) {
          run.stats.checkpointsPassed += 1;
          this.phase = 'queue';
          this.phaseT = -999;
          this.flow.toCamp(false);
        }
        break;
      case 'bust':
        if (this.phaseT > 2.2) {
          this.phaseT = -999;
          applyBustCost(run);
          this.game.goto('runstop', { bust: true });
        }
        break;
    }
  }

  private nextQuestion(): void {
    this.asked++;
    if (this.cp.next >= this.cp.questions.length) this.beginScan();
    else this.beginQuestion();
  }

  frame(_alpha: number, dt: number): void {
    // The reclamation ahead: two Recyclers walk a limp unit to the van, slowly.
    const t = Math.min(1, Math.max(0, (this.time - 1.2) / 6));
    const step = 1 / TUNING.render.poseFps;
    const [r1, r2, unit] = this.walkers;
    const x = 21 + 10 * t;
    const z = 14.5 + 2.3 * t;
    unit.x = x;
    unit.z = z;
    r1.x = x;
    r1.z = z - 0.7;
    r2.x = x;
    r2.z = z + 0.7;
    for (const w of this.walkers) w.yaw = Math.PI / 2 - Math.atan2(2.3, 10);
    const q = (n: number): number => Math.floor(n / step) * step;
    samplePose(r1.pose, t < 1 ? 'walk' : 'idle', {
      phase: this.time * 4,
      speed: 0.4,
      t: q(this.time),
      seed: 0.1,
    });
    samplePose(r2.pose, t < 1 ? 'walk' : 'idle', {
      phase: this.time * 4 + 1,
      speed: 0.4,
      t: q(this.time),
      seed: 0.4,
    });
    samplePose(unit.pose, 'carried', { phase: 0, speed: 0, t: q(this.time), seed: 0.7 });
    unit.visible = t < 1;
    this.chars.render(this.walkers, dt);
    this.rig.follow(21, 11.5, dt > 0 ? dt : 1 / 60, 0.9);
    this.lights.update(this.rig.focus.x, this.rig.focus.z, this.time);
    this.particles.update(dt, this.rig.camera, this.rig.focus.x, this.rig.focus.z, this.rig.zoom);
  }

  /** F3: the guard waves them through. */
  debugSkip(): void {
    if (this.phase !== 'pass' && this.phase !== 'bust') this.setPhase('pass');
  }

  world(): WorldView {
    return { scene: this.scene, rig: this.rig, flash: this.flash > 0.3 };
  }

  drawUi(ui: UiSurface): void {
    const run = this.flow.run;
    const w = Math.min(460, ui.width - 24);
    const x = Math.floor((ui.width - w) / 2);
    // The guard's box: tall for questions, short otherwise.
    const tall = this.phase === 'ask';
    const boxH = tall ? 142 : 72;
    const boxY = ui.height - boxH - 10;
    const guardBox = (): void => {
      ui.panel(x, boxY, w, boxH, C.night0, C.slate0);
      // The guard's portrait (a pixel face) and his red suspicion meter.
      ui.rect(x + 8, boxY + 8, 34, 40, C.night2);
      ui.rect(x + 14, boxY + 14, 22, 24, C.skin2);
      ui.rect(x + 12, boxY + 10, 26, 7, C.night3);
      ui.rect(x + 18, boxY + 24, 3, 2, C.night0);
      ui.rect(x + 29, boxY + 24, 3, 2, C.night0);
      ui.rect(x + 20, boxY + 32, 10, 2, C.rust1);
      ui.rect(x + 8, boxY + 54, 34, 6, C.night2);
      ui.rect(x + 8, boxY + 54, Math.round((34 * this.cp.suspicion) / 100), 6, C.red1);
    };
    switch (this.phase) {
      case 'queue':
        ui.text(`${currentNode(run.map).name}`, ui.width / 2, 30, C.fog1, { align: 'center' });
        ui.text('The line moves slowly. Nobody looks at the van.', ui.width / 2, ui.height - 30, C.fog0, {
          align: 'center',
        });
        break;
      case 'ask': {
        const q = this.cp.questions[this.cp.next];
        if (!q) break;
        guardBox();
        const who = MEMBERS[q.member].name;
        ui.text(`To ${who}:`, x + 52, boxY + 8, C.fog0, { shadow: null });
        ui.paragraph(`"${q.question.prompt}"`, x + 52, boxY + 20, w - 64, C.fog2, Infinity, { shadow: null });
        const slot = this.slotFor(q.member);
        if (slot === null) {
          ui.text(`${who} answers.`, x + 52, boxY + 50, C.fog0, { shadow: null });
          break;
        }
        if (this.phaseT <= 0.4) break;
        // Answers stack by their wrapped height.
        let ly = boxY + 44;
        q.answers.forEach((kind: AnswerKind, i: number) => {
          const text =
            kind === 'wrong' && q.question.wrongIsSilence ? '(say nothing)' : (q.question[kind] ?? '');
          const sel = i === this.sel;
          const h = ui.wrap(text, w - 68).length * ui.lineHeight + 4;
          if (sel) ui.rect(x + 48, ly - 2, w - 56, h, C.night2);
          ui.paragraph(text, x + 56, ly, w - 68, sel ? C.amber2 : C.fog1, Infinity, { shadow: null });
          ly += h + 2;
        });
        if (slot === 1) ui.text('Player 2', x + w - 52, boxY + 8, C.fog0, { shadow: null });
        break;
      }
      case 'scan': {
        guardBox();
        ui.text('He sweeps the scanner over the car. Breathe.', x + 52, boxY + 10, C.fog1, { shadow: null });
        const n = this.scans.length;
        this.scans.forEach((p, i) => {
          const cx = n === 1 ? ui.width / 2 : ui.width * (i === 0 ? 0.3 : 0.7);
          drawRing(ui, p, cx, 120, this.game.input.glyphDevice(p.slot, this.game.save.settings.glyphStyle));
        });
        if (this.tip) ui.text(this.tip, ui.width / 2, 176, C.fog1, { align: 'center' });
        break;
      }
      case 'papers':
        guardBox();
        ui.text('"Something about you. Registration?"', x + 52, boxY + 10, C.fog2, { shadow: null });
        ['Show Papers (1)', 'Say you left them at home'].forEach((label, i) => {
          const ok = i === 1 || run.resources.papers > 0;
          const sel = i === this.sel;
          ui.text(label, x + 56, boxY + 40 + i * 14, !ok ? C.slate1 : sel ? C.amber2 : C.fog1, {
            shadow: null,
          });
        });
        break;
      case 'pass':
        guardBox();
        ui.text('"Go on."', x + 52, boxY + 10, C.fog2, { shadow: null });
        break;
      case 'bust':
        ui.text('The floodlights flare. The barrier drops.', ui.width / 2, 60, C.red2, { align: 'center' });
        break;
    }
    this.flow.phone.draw(ui);
  }

  partyLines(): string[] {
    return partyLines(this.flow);
  }
}

/** A breathing ring: the pulse grows toward the marker; the center notch is visible. */
function drawRing(
  ui: UiSurface,
  p: PlayerScan,
  cx: number,
  cy: number,
  dev: Parameters<UiSurface['button']>[1],
): void {
  const s = p.scan;
  const R = 26;
  const k = ringPhase(s);
  const r = Math.max(2, Math.round(R * Math.min(1.2, k)));
  // Marker circle and the moving pulse (drawn as octagons of pixels).
  const ring = (rad: number, color: number): void => {
    for (let a = 0; a < 48; a++) {
      const t = (a / 48) * Math.PI * 2;
      ui.pixel(Math.round(cx + Math.cos(t) * rad), Math.round(cy + Math.sin(t) * rad), color);
    }
  };
  ring(R, C.slate1);
  ring(R + 1, C.slate0);
  ring(r, C.cyan1);
  // The notch at the top of the marker.
  ui.rect(cx - 1, cy - R - 3, 3, 3, C.fog2);
  ui.text(`${MEMBERS[p.member.id].name}`, cx, cy + R + 8, C.fog1, { align: 'center' });
  const last = s.t - s.lastT < 0.6 ? s.last : 'none';
  const word =
    last === 'breath'
      ? 'breath'
      : last === 'notch'
        ? 'perfect'
        : last === 'miss'
          ? 'missed'
          : last === 'regular'
            ? 'too regular'
            : last === 'early'
              ? 'early'
              : '';
  if (word) ui.text(word, cx, cy - R - 16, last === 'breath' ? C.fog2 : C.amber2, { align: 'center' });
  ui.button('A', dev, cx - 4, cy - 4);
}
