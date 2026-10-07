/**
 * Camp (spec §12.5): a small diorama with the car pulled off the road (under an overpass in the Corridor,
 * in a dark field elsewhere), weather falling, the party sitting by the open hatch and June by a camp
 * stove if she's with them. A camp conversation plays first; then the camp panel. At a Station the same
 * panel opens in the keeper's warm light.
 */
import * as THREE from 'three';
import { newPose, samplePose } from '../anim/poses';
import { MEMBERS } from '../content/characters';
import { TUNING } from '../content/tuning';
import type { MemberState } from '../core/types';
import type { Game } from '../game';
import { Kit } from '../models/kit';
import { PARTY_LOOKS } from '../models/looks';
import { buildProp } from '../models/props';
import { buildRig } from '../models/rig';
import { CameraRig } from '../render/camera';
import { CharacterRenderer, type CharInstance } from '../render/characters';
import { LightPool } from '../render/lights';
import { materials } from '../render/materials';
import { C } from '../render/palettes';
import { Particles } from '../render/particles';
import { wagonMesh } from '../render/stopview';
import { campEffects, pickCampConversation } from '../run/camp';
import { currentNode } from '../run/map';
import { withRng } from '../run/run';
import { CampPanel } from '../ui/camp';
import { Dialogue, type DialogueLine } from '../ui/dialogue';
import type { UiSurface } from '../ui/surface';
import { partyLines } from './map';
import type { RunFlow } from './runflow';
import type { GameScene, WorldView } from './scene';

const SEATS: [number, number, number][] = [
  [-3.4, 1.2, Math.PI * 0.75],
  [-3.9, -0.4, Math.PI * 0.55],
  [-2.6, 2.2, Math.PI * 0.95],
  [-1.2, 2.6, Math.PI * 1.1],
];

export class CampScene implements GameScene {
  readonly id = 'camp';
  readonly scene = new THREE.Scene();
  readonly rig = new CameraRig();
  private lights: LightPool;
  private particles = new Particles();
  private chars = new CharacterRenderer();
  private sitters: CharInstance[] = [];
  private talk: Dialogue | null = null;
  private panel: CampPanel;
  private time = 0;

  constructor(
    private readonly game: Game,
    private readonly flow: RunFlow,
    private readonly atStation: boolean,
  ) {
    const run = flow.run;
    const node = currentNode(run.map);
    this.scene.fog = new THREE.FogExp2(atStation ? C.night2 : C.slate0, 0.03);
    const k = new Kit();
    k.ground(-30, -20, 30, 20, 0, atStation ? C.rust0 : C.night1);
    if (!atStation) {
      if (node.region === 'corridor') k.at({ x: 0, z: -3 }, () => buildProp(k, 'overpass', 0));
      else
        for (let i = 0; i < 9; i++) {
          const id =
            node.region === 'lowcountry'
              ? 'palmetto'
              : node.region === 'newengland'
                ? 'snowbank'
                : 'pineTree';
          k.at({ x: -14 + i * 3.6, z: -6 - (i % 3) * 1.5 }, () => buildProp(k, id, i));
        }
    } else {
      k.at({ x: 2.5, z: -2 }, () => buildProp(k, 'floorLamp', 0));
      k.light({ x: 2.5, y: 1.6, z: -2, color: C.amber2, intensity: 3, range: 9 });
    }
    const june = run.party.find((m) => m.id === 'june' && m.status === 'active');
    if (june) {
      k.at({ x: -2.2, z: 0.9 }, () => {
        k.box(0.4, 0.15, 0.3, C.slate0);
        k.glow(() => k.box(0.2, 0.06, 0.16, C.amber2, { y: 0.16 }));
      });
      k.light({ x: -2.2, y: 0.5, z: 0.9, color: C.amber2, intensity: 2.2, range: 5 });
    }
    // The open hatch's dome light.
    k.light({ x: -2.2, y: 1.2, z: 0, color: C.fog2, intensity: 1, range: 4 });
    const out = k.build();
    const m = materials();
    if (out.solid) this.scene.add(new THREE.Mesh(out.solid, m.toon));
    if (out.glow) this.scene.add(new THREE.Mesh(out.glow, m.glow));
    this.lights = new LightPool(this.scene);
    this.lights.addAll(out.lights);
    const car = wagonMesh();
    car.position.set(0, 0, 0);
    this.scene.add(car);
    // The party, sitting by the hatch.
    const present = run.party.filter((p: MemberState) => p.status === 'active');
    present.forEach((p, i) => {
      const look = PARTY_LOOKS[p.id];
      const [x, z, yaw] = SEATS[i % SEATS.length];
      this.sitters.push({
        rig: buildRig(look),
        look,
        x,
        y: 0,
        z,
        yaw,
        pose: newPose(),
        skin01: p.kind === 'android' ? p.skin / 100 : 1,
        visible: true,
        slice: 0,
        sliceY: 1.1,
        seamFlicker: false,
        flash: false,
      });
    });
    this.scene.add(this.chars.group);
    if (!atStation) {
      this.particles.setWeather(node.weather);
      this.scene.add(this.particles.group);
    }
    this.rig.snap = game.config.snap;
    this.rig.teleport(-1.5, 0.8, 0.75);
    // Tonight's conversation, then the panel.
    const conv = withRng(run, (rng) => pickCampConversation(run, rng));
    if (conv) {
      withRng(run, (rng) => campEffects(run, conv.effects, rng));
      const lines: DialogueLine[] = conv.lines.map((l) =>
        l.speaker === 'direction' ||
        l.speaker === 'lantern' ||
        l.speaker === 'keeper' ||
        l.speaker === 'mensah'
          ? { speaker: '', text: l.text, color: C.fog0 }
          : { speaker: MEMBERS[l.speaker].name, text: l.text, color: C.fog1 },
      );
      this.talk = new Dialogue(lines, () => game.audio.play('type_tick', { gain: 0.25 }));
    }
    this.panel = new CampPanel(run, atStation, () => flow.campDone(atStation));
    // The first time someone's Integrity is slipping (spec §12.9).
    if (
      run.party.some(
        (m) => m.kind === 'android' && m.status === 'active' && m.integrity < TUNING.integrity.glitchBelow,
      )
    )
      flow.tip('first-integrity');
  }

  enter(): void {
    this.game.audio.setMusic(this.atStation ? 'station' : 'camp');
  }

  exit(): void {}

  dispose(): void {
    this.particles.dispose();
  }

  allowJoin(): boolean {
    return true;
  }

  pausable(): boolean {
    return !this.panel.done;
  }

  onJoin(): void {
    // Player 2 joins: they take the first member nobody plays.
    const run = this.flow.run;
    if (run.control[1] !== null) return;
    const free = run.party.find(
      (m) => m.status === 'active' && m.kind === 'android' && m.id !== run.control[0],
    );
    if (free) run.control[1] = free.id;
  }

  tick(dt: number): void {
    this.time += dt;
    this.flow.phone.update(dt);
    const intents = [this.game.intents[0], this.game.intents[1]];
    if (this.talk) {
      if (this.talk.update(dt, intents)) this.talk = null;
      return;
    }
    if (!this.panel.done) this.panel.update(dt, intents);
  }

  frame(_alpha: number, dt: number): void {
    const step = 1 / TUNING.render.poseFps;
    this.sitters.forEach((s, i) => {
      samplePose(s.pose, 'sit', {
        phase: 0,
        speed: 0,
        t: Math.floor((this.time + i) / step) * step,
        seed: i * 0.31,
      });
    });
    this.chars.render(this.sitters, dt);
    this.rig.follow(-1.5, 0.8, dt > 0 ? dt : 1 / 60, 0.75);
    this.lights.update(this.rig.focus.x, this.rig.focus.z, this.time);
    this.particles.update(dt, this.rig.camera, this.rig.focus.x, this.rig.focus.z, this.rig.zoom);
  }

  /** F3: skip the talk and take a short rest. */
  debugSkip(): void {
    this.talk = null;
    if (!this.panel.done) this.panel.skip();
  }

  world(): WorldView {
    return { scene: this.scene, rig: this.rig };
  }

  drawUi(ui: UiSurface): void {
    const dev = this.game.input.glyphDevice(0, this.game.save.settings.glyphStyle);
    if (this.talk) this.talk.draw(ui, dev);
    else this.panel.draw(ui);
    this.flow.phone.draw(ui);
  }

  partyLines(): string[] {
    return partyLines(this.flow);
  }
}
