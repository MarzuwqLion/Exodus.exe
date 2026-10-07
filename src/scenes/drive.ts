/**
 * The drive (spec §12.4): 15–25 s along a generated stretch of highway in the current region at night:
 * headlights through the weather, sodium lamps sliding past, wrecks on the shoulder, propaganda billboards,
 * a scanner tower sweeping its cyan beam across the lanes, and sometimes a drone overhead. Holding A
 * fast-forwards. On most legs a road event stops the car partway and its panel opens over the frozen road.
 */
import * as THREE from 'three';
import { LANTERN_MESSAGES } from '../content/lantern';
import { REGION_NAMES } from '../content/regions';
import { TUNING } from '../content/tuning';
import { Rng, hashSeed } from '../core/rng';
import type { PlayerIntent, Region } from '../core/types';
import type { Game } from '../game';
import { Kit } from '../models/kit';
import { BILLBOARD_FACE, buildProp, type PropId } from '../models/props';
import { BILLBOARD_LINES, billboardCanvas } from '../models/signs';
import { CameraRig } from '../render/camera';
import { LightPool, type Emitter } from '../render/lights';
import { materials, pixelTexture, signMaterial } from '../render/materials';
import { C } from '../render/palettes';
import { Particles } from '../render/particles';
import { droneMesh, wagonMesh } from '../render/stopview';
import { choiceAvailable, eventText, pickEvent, resolveChoice } from '../run/events';
import { activeJune } from '../run/june';
import { lanternFor } from '../run/lantern';
import { currentNode } from '../run/map';
import { withRng } from '../run/run';
import { EventPanel } from '../ui/eventpanel';
import type { UiSurface } from '../ui/surface';
import { partyLines } from './map';
import type { RunFlow } from './runflow';
import type { GameScene, WorldView } from './scene';

const SPEED = 14;
const LANE_Z = 3.6;

/** Roadside dressing per region: props and how often they appear. */
const DRESSING: Record<Region, { id: PropId; every: number; far?: boolean }[]> = {
  newengland: [
    { id: 'snowbank', every: 9 },
    { id: 'pineTree', every: 22 },
    { id: 'tripleDecker', every: 70, far: true },
    { id: 'millBuilding', every: 110, far: true },
  ],
  corridor: [
    { id: 'soundWall', every: 4.4, far: true },
    { id: 'powerPole', every: 30 },
    { id: 'stripMall', every: 160, far: true },
  ],
  piedmont: [
    { id: 'pineTree', every: 8 },
    { id: 'pineStand', every: 40, far: true },
    { id: 'tobaccoBarn', every: 120, far: true },
    { id: 'waterTower', every: 180, far: true },
  ],
  lowcountry: [
    { id: 'palmetto', every: 11 },
    { id: 'liveOak', every: 45, far: true },
    { id: 'swampWater', every: 60, far: true },
    { id: 'stiltHouse', every: 130, far: true },
  ],
};

function buildRoad(
  k: Kit,
  length: number,
  region: Region,
  rng: Rng,
): { billboards: { x: number; text: string }[]; towerX: number } {
  const x0 = -40;
  const x1 = length + 60;
  // Asphalt, lines, shoulders, the median barrier.
  k.ground(x0, -40, x1, 40, 0, region === 'newengland' ? C.night2 : C.night1);
  k.box(x1 - x0, 0.02, 14.4, C.night3, { x: (x0 + x1) / 2, y: 0.01, z: 0 });
  for (const z of [-7.0, 7.0]) k.box(x1 - x0, 0.03, 0.12, C.amber0, { x: (x0 + x1) / 2, y: 0.02, z });
  for (let x = x0; x < x1; x += 9) {
    for (const z of [-LANE_Z, LANE_Z]) k.box(3, 0.03, 0.1, C.fog0, { x: x + 1.5, y: 0.02, z });
  }
  for (let x = x0; x < x1; x += 4) buildAt(k, 'jerseyBarrier', x + 2, 0, 0, 0);
  // Sodium lamps on both sides, staggered.
  for (let x = x0; x < x1; x += 26) {
    buildAt(k, 'streetlamp', x, 8.2, Math.PI, 0);
    buildAt(k, 'streetlamp', x + 13, -8.2, 0, 1);
  }
  // Region dressing on both sides.
  for (const d of DRESSING[region]) {
    for (let x = x0 + rng.range(0, d.every); x < x1; x += d.every * rng.range(0.7, 1.3)) {
      const north = rng.chance(d.far ? 0.75 : 0.5);
      const z = north
        ? -(d.far ? rng.range(16, 26) : rng.range(10, 14))
        : d.far
          ? rng.range(15, 22)
          : rng.range(10, 13);
      buildAt(k, d.id, x, z, north ? 0 : Math.PI, rng.int(0, 5));
    }
  }
  // Wrecks on the shoulder.
  for (let i = 0; i < 2; i++)
    buildAt(
      k,
      'wreckedCar',
      rng.range(60, length),
      rng.chance(0.5) ? 8.6 : -8.6,
      rng.range(-0.4, 0.4),
      rng.int(0, 2),
    );
  // Billboards on the far side, facing the road.
  const billboards: { x: number; text: string }[] = [];
  for (let x = 70; x < length; x += rng.range(110, 170)) {
    buildAt(k, 'billboard', x, -15, 0, rng.int(0, 2));
    billboards.push({ x, text: rng.pick(BILLBOARD_LINES) });
  }
  // A scanner tower beside the highway.
  const towerX = rng.range(length * 0.25, length * 0.75);
  k.at({ x: towerX, z: -13 }, () => {
    buildProp(k, 'scannerTowerBase');
    k.at({ y: 12 }, () => buildProp(k, 'scannerTowerHead'));
  });
  return { billboards, towerX };
}

function buildAt(k: Kit, id: PropId, x: number, z: number, ry: number, variant: number): void {
  k.at({ x, z, ry }, () => buildProp(k, id, variant));
}

export class DriveScene implements GameScene {
  readonly id = 'drive';
  readonly scene = new THREE.Scene();
  readonly rig = new CameraRig();
  private lights: LightPool;
  private particles = new Particles();
  private car = wagonMesh();
  private heads: Emitter[] = [];
  private beam: THREE.Mesh;
  private beamSpot: Emitter;
  private towerX: number;
  private drone: THREE.Group | null = null;
  private traffic: THREE.Group[] = [];
  private length: number;
  private dist = 0;
  private speed = SPEED;
  private eventAt: number;
  private panel: EventPanel | null = null;
  private time = 0;
  private titleT = 3.5;
  private done = false;

  constructor(
    private readonly game: Game,
    private readonly flow: RunFlow,
  ) {
    const node = currentNode(flow.run.map);
    const rng = new Rng(hashSeed('drive', flow.run.seed, flow.run.leg));
    const [lo, hi] = TUNING.run.driveSeconds;
    this.length = SPEED * rng.range(lo, hi);
    this.eventAt = flow.pendingEvent ? this.length * rng.range(...TUNING.drive.eventAt) : Infinity;
    this.scene.fog = new THREE.FogExp2(C.slate0, node.weather === 'fog' ? 0.03 : 0.018);
    const k = new Kit();
    const road = buildRoad(k, this.length, node.region, rng);
    this.towerX = road.towerX;
    const out = k.build();
    const m = materials();
    if (out.solid) this.scene.add(new THREE.Mesh(out.solid, m.toon));
    if (out.glow) this.scene.add(new THREE.Mesh(out.glow, m.glow));
    this.lights = new LightPool(this.scene);
    this.lights.addAll(out.lights);
    // Billboard faces.
    for (const b of road.billboards) {
      const canvas = billboardCanvas(b.text);
      if (!canvas) continue;
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(BILLBOARD_FACE.w, BILLBOARD_FACE.h),
        signMaterial(pixelTexture(canvas), false),
      );
      face.position.set(b.x + BILLBOARD_FACE.x, BILLBOARD_FACE.y, -15 + BILLBOARD_FACE.z + 0.02);
      this.scene.add(face);
    }
    // The tower's sweeping beam: a long thin cyan glow pivoting at the head.
    const beamGeo = new THREE.BoxGeometry(26, 0.04, 0.16);
    beamGeo.translate(13, 0, 0);
    this.beam = new THREE.Mesh(beamGeo, m.glowInstanced);
    (this.beam.material as THREE.MeshBasicMaterial).color = new THREE.Color(C.cyan1);
    this.beam.position.set(this.towerX, 12.4, -13);
    this.scene.add(this.beam);
    // Where the beam lands, the road lights up cyan.
    this.beamSpot = this.lights.add({ x: this.towerX, y: 1, z: 0, color: C.cyan1, intensity: 2.4, range: 6 });
    // Headlights travel with the car.
    for (const dz of [-0.6, 0.6])
      this.heads.push(
        this.lights.add({ x: 0, y: 1.6, z: LANE_Z + dz, color: C.fog2, intensity: 1.3, range: 10 }),
      );
    this.car.position.set(0, 0, LANE_Z);
    this.scene.add(this.car);
    // Oncoming traffic on the far lanes, and sometimes a drone.
    for (let i = 0; i < 3; i++) {
      const t = wagonMesh();
      t.rotation.y = Math.PI;
      t.position.set(rng.range(40, this.length + 40), 0, -LANE_Z + rng.range(-0.6, 0.6));
      this.scene.add(t);
      this.traffic.push(t);
    }
    if (rng.chance(0.4)) {
      this.drone = droneMesh();
      this.drone.position.set(rng.range(30, this.length), 7, -20);
      this.scene.add(this.drone);
    }
    this.particles.setWeather(node.weather);
    this.scene.add(this.particles.group);
    this.rig.snap = game.config.snap;
    this.rig.teleport(8, LANE_Z - 1, 1);
  }

  enter(): void {
    this.game.audio.setMusic('scene');
  }

  exit(): void {}

  dispose(): void {
    this.particles.dispose();
  }

  allowJoin(): boolean {
    return !this.panel;
  }

  pausable(): boolean {
    return !this.done;
  }

  private openEvent(): void {
    const run = this.flow.run;
    const picked = withRng(run, (rng) => pickEvent(run, rng));
    if (!picked) return;
    const { event, ctx } = picked;
    this.panel = new EventPanel(event, {
      text: (s) => eventText(s, ctx),
      available: (c) => choiceAvailable(run, c),
      choose: (c) => {
        const hadJune = !!activeJune(run.party);
        const r = withRng(run, (rng) => resolveChoice(run, rng, c, ctx));
        for (const id of r.result.lantern) {
          const msg = LANTERN_MESSAGES.find((x) => x.id === id);
          if (msg && !run.lanternSeen.includes(id)) run.lanternSeen.push(id);
          this.flow.say([msg ?? null]);
        }
        if (!hadJune && activeJune(run.party)) this.flow.say([lanternFor(run, 'june-joined')]);
        return { text: r.text, next: r.outcome.next };
      },
    });
  }

  tick(dt: number): void {
    this.time += dt;
    if (this.titleT > 0) this.titleT -= dt;
    this.flow.phone.update(dt);
    if (this.done) return;
    const intents = [this.game.intents[0], this.game.intents[1]];
    if (this.panel) {
      if (this.panel.update(dt, intents)) this.panel = null;
      return;
    }
    const fast = intents.some((it: PlayerIntent | null) => it?.interactHeld);
    const k = fast ? TUNING.drive.fastForward : 1;
    // Slow to a stop for the road event, then go on.
    let target = SPEED;
    if (this.dist < this.eventAt && this.eventAt - this.dist < 18)
      target = Math.max(0, (this.eventAt - this.dist) * 0.9);
    this.speed += (target - this.speed) * Math.min(1, dt * 2.5);
    this.dist += this.speed * dt * k;
    if (this.eventAt !== Infinity && this.dist >= this.eventAt - 0.6) {
      this.eventAt = Infinity;
      this.openEvent();
    }
    if (this.dist >= this.length) {
      this.done = true;
      this.flow.arrive();
    }
  }

  frame(_alpha: number, dt: number): void {
    const x = this.dist;
    this.car.position.set(x, 0, LANE_Z);
    this.car.rotation.y = 0;
    for (const [i, h] of this.heads.entries()) {
      h.x = x + 5.5;
      h.z = LANE_Z + (i === 0 ? -0.6 : 0.6);
    }
    const yaw = -Math.PI / 2 + Math.sin(this.time * 0.7) * 0.9;
    this.beam.rotation.y = yaw;
    this.beam.rotation.z = -0.42;
    // The beam reaches the ground about 27 m out along its sweep.
    const reach = 12.4 / Math.tan(0.42);
    this.beamSpot.x = this.towerX + Math.cos(-yaw) * reach;
    this.beamSpot.z = -13 + Math.sin(-yaw) * reach;
    for (const t of this.traffic) {
      if (!this.panel) t.position.x -= 18 * (dt > 0 ? dt : 1 / 60);
      if (t.position.x < x - 50) t.position.x += 140;
    }
    if (this.drone) this.drone.position.x += (this.panel ? 0 : 6) * (dt > 0 ? dt : 1 / 60);
    this.rig.follow(x + 8, LANE_Z - 1, dt > 0 ? dt : 1 / 60, 1);
    this.lights.update(this.rig.focus.x, this.rig.focus.z, this.time);
    this.particles.update(dt, this.rig.camera, this.rig.focus.x, this.rig.focus.z, this.rig.zoom);
  }

  world(): WorldView {
    return { scene: this.scene, rig: this.rig };
  }

  drawUi(ui: UiSurface): void {
    const node = currentNode(this.flow.run.map);
    if (this.titleT > 0 && this.titleT < 3.2)
      ui.text(`${REGION_NAMES[node.region]} · ${node.name}`, ui.width / 2, 40, C.fog1, { align: 'center' });
    const dev = this.game.input.glyphDevice(0, this.game.save.settings.glyphStyle);
    if (!this.panel && !this.done) {
      const label = 'Hold to fast-forward';
      const w = ui.measureButton('A', dev) + 4 + ui.measure(label);
      const bx = Math.floor(ui.width / 2 - w / 2);
      ui.button('A', dev, bx, ui.height - 16);
      ui.text(label, bx + ui.measureButton('A', dev) + 4, ui.height - 16, C.fog0);
    }
    this.panel?.draw(ui, dev);
    this.flow.phone.draw(ui);
  }

  partyLines(): string[] {
    return partyLines(this.flow);
  }
}
