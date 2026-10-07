/**
 * The map (spec §12.2): a dark top-down diorama of the route from Boston (top) to Miami (bottom) with the
 * Atlantic along the right. Roads are faint amber lines, towns small clusters of lights, revealed Stations
 * pulse with the amber beacon, and the car marker crawls to the chosen town. The sailing clock sits at the
 * top; the selected town shows its type, crowd, patrols, region, the leg's cost, and any rumors.
 * Either player moves the cursor and confirms.
 */
import * as THREE from 'three';
import { REGION_NAMES } from '../content/regions';
import { TUNING } from '../content/tuning';
import type { MapNode, NodeType, PlayerIntent, RumorKind } from '../core/types';
import type { Game } from '../game';
import { MenuNav } from '../input/intents';
import { Kit } from '../models/kit';
import { CameraRig } from '../render/camera';
import { LightPool, type Emitter } from '../render/lights';
import { materials } from '../render/materials';
import { C } from '../render/palettes';
import { Particles } from '../render/particles';
import { wagonMesh } from '../render/stopview';
import { currentNode, nextNodes, shownType } from '../run/map';
import { sailing } from '../run/run';
import type { UiSurface } from '../ui/surface';
import type { RunFlow } from './runflow';
import type { GameScene, WorldView } from './scene';

/** World layout of the diorama. */
const COL_Z = 7;
const SPAN_X = 30;

export function nodePos(n: MapNode): { x: number; z: number } {
  return { x: (n.x - 0.5) * SPAN_X, z: n.column * COL_Z };
}

/** The coast's x at depth z: Cape Cod, the New York bight, Delmarva, Hatteras, the Georgia bight, Florida. */
function coastX(z: number): number {
  const k = z / (COL_Z * TUNING.run.columns);
  return (
    14 +
    2.5 * Math.exp(-(((k - 0.03) / 0.05) ** 2)) -
    3 * Math.exp(-(((k - 0.24) / 0.06) ** 2)) +
    2 * Math.exp(-(((k - 0.45) / 0.05) ** 2)) +
    3 * Math.exp(-(((k - 0.62) / 0.05) ** 2)) -
    3.5 * Math.exp(-(((k - 0.85) / 0.06) ** 2)) +
    Math.sin(z * 1.7) * 0.35
  );
}

export const TYPE_NAMES: Record<NodeType, string> = {
  boston: 'Boston',
  depot: 'Charging depot',
  diner: 'Diner',
  gas: 'Gas station',
  station: 'Station',
  checkpoint: 'Checkpoint',
  port: 'Port of Miami',
};

const RUMOR_NAMES: Record<RumorKind, string> = {
  'cells-cache': 'Cells cache',
  'recycler-activity': 'Recycler activity',
  'sympathetic-staff': 'Sympathetic staff',
  station: 'A light in the window',
  patrols: 'Patrols reported',
};

const CROWD = ['', 'Quiet', 'Busy', 'Crowded'];
const PATROL = ['', 'Light patrols', 'Patrols', 'Heavy patrols'];

function buildDiorama(k: Kit, flow: RunFlow): void {
  const run = flow.run;
  const zMax = COL_Z * TUNING.run.columns;
  // Land, and the Atlantic to the east in strips that follow the coast.
  k.ground(-40, -10, 40, zMax + 10, 0, C.night2);
  for (let z = -10; z < zMax + 10; z += 1) {
    const cx = coastX(z + 0.5);
    k.box(40 - cx, 0.02, 1.02, C.night0, { x: (cx + 40) / 2, y: 0.01, z: z + 0.5 });
    // A pale line of surf.
    k.box(0.35, 0.03, 1.02, C.slate1, { x: cx + 0.17, y: 0.015, z: z + 0.5 });
  }
  // Roads first, so towns sit on top.
  const byId = new Map(run.map.nodes.map((n) => [n.id, n]));
  for (const n of run.map.nodes) {
    const a = nodePos(n);
    for (const id of n.next) {
      const b = nodePos(byId.get(id)!);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      const ry = -Math.atan2(dz, dx);
      k.box(len, 0.03, 0.12, C.amber0, { x: (a.x + b.x) / 2, y: 0.03, z: (a.z + b.z) / 2, ry });
    }
  }
  // Towns: a few dark blocks and lit windows; bigger for Boston and the Port.
  for (const n of run.map.nodes) {
    const p = nodePos(n);
    const big = n.type === 'boston' || n.type === 'port';
    const count = big ? 9 : 3 + ((n.column * 7 + n.index * 3) % 3);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + n.index;
      const r = (big ? 1.4 : 0.8) * (0.4 + ((i * 5) % 7) / 10);
      const bx = p.x + Math.cos(a) * r;
      const bz = p.z + Math.sin(a) * r;
      const h = 0.3 + ((i * 3 + n.column) % 4) * 0.18 + (big ? 0.4 : 0);
      k.box(0.45, h, 0.45, C.night3, { x: bx, z: bz }, { top: C.slate0 });
      if ((i + n.index) % 2 === 0)
        k.glow(() =>
          k.box(0.16, 0.12, 0.05, i % 3 === 0 ? C.fog1 : C.amber1, { x: bx, y: h * 0.6, z: bz + 0.24 }),
        );
    }
    if (n.type === 'checkpoint')
      k.glow(() => k.box(2.2, 0.08, 0.12, C.cyan0, { x: p.x, y: 0.5, z: p.z + 1.2 }));
    if (n.type === 'port') {
      for (const dx of [-1.6, 0, 1.6]) {
        k.box(0.15, 2.4, 0.15, C.slate1, { x: p.x + 2 + dx, z: p.z + 1.6 });
        k.box(1.6, 0.12, 0.15, C.slate1, { x: p.x + 2.6 + dx, y: 2.4, z: p.z + 1.6 });
      }
    }
    k.light({
      x: p.x,
      y: 1.6,
      z: p.z + 0.6,
      color: C.amber2,
      intensity: big ? 2.2 : 1.2,
      range: big ? 6 : 4,
    });
  }
}

export class MapScene implements GameScene {
  readonly id = 'map';
  readonly scene = new THREE.Scene();
  readonly rig = new CameraRig();
  private lights: LightPool;
  private beacons: { node: MapNode; e: Emitter; glow: THREE.Mesh }[] = [];
  private particles = new Particles();
  private car = wagonMesh();
  private nav = new MenuNav();
  private sel = 0;
  private time = 0;
  /** The car is on its way to the chosen town (seconds into the move). */
  private moving = -1;
  private target: MapNode | null = null;

  constructor(
    private readonly game: Game,
    private readonly flow: RunFlow,
  ) {
    this.scene.fog = new THREE.FogExp2(C.night1, 0.012);
    const k = new Kit();
    buildDiorama(k, flow);
    const out = k.build();
    const m = materials();
    if (out.solid) this.scene.add(new THREE.Mesh(out.solid, m.toon));
    if (out.glow) this.scene.add(new THREE.Mesh(out.glow, m.glow));
    this.lights = new LightPool(this.scene);
    this.lights.addAll(out.lights);
    // Revealed Stations pulse with the amber beacon.
    for (const n of flow.run.map.nodes) {
      if (n.type !== 'station' || !n.revealed) continue;
      const p = nodePos(n);
      const e = this.lights.add({
        x: p.x,
        y: 1.2,
        z: p.z,
        color: C.amber1,
        intensity: 3,
        range: 5,
        tag: 'beacon',
      });
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), m.glowInstanced);
      glow.position.set(p.x, 0.9, p.z);
      (glow.material as THREE.MeshBasicMaterial).color = new THREE.Color(C.amber1);
      this.scene.add(glow);
      this.beacons.push({ node: n, e, glow });
    }
    const cur = currentNode(flow.run.map);
    this.particles.setWeather(cur.weather);
    this.scene.add(this.particles.group);
    this.car.scale.setScalar(0.5);
    const p = nodePos(cur);
    this.car.position.set(p.x, 0.05, p.z);
    this.scene.add(this.car);
    this.rig.snap = game.config.snap;
    this.rig.teleport(p.x, p.z + 4, 1.25);
  }

  private get options(): MapNode[] {
    return nextNodes(this.flow.run.map);
  }

  enter(): void {
    this.game.audio.setMusic('camp');
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
    return this.moving < 0;
  }

  tick(dt: number): void {
    this.time += dt;
    this.flow.phone.update(dt);
    if (this.moving >= 0) {
      this.moving += dt;
      if (this.moving > 1.6 && this.target) {
        const id = this.target.id;
        this.moving = -1;
        this.target = null;
        this.flow.go(id);
      }
      return;
    }
    const opts = this.options;
    const intents = [this.game.intents[0], this.game.intents[1]].filter((x): x is PlayerIntent => !!x);
    for (const it of intents) {
      const { dx, dy } = this.nav.step(it, dt);
      const d = dx !== 0 ? dx : dy;
      if (d !== 0 && opts.length > 1) {
        this.sel = (this.sel + d + opts.length) % opts.length;
        this.game.audio.play('ui_move');
      }
      if (it.confirm && opts[this.sel]) {
        this.target = opts[this.sel];
        this.moving = 0;
        this.game.audio.play('ui_confirm');
        break;
      }
    }
  }

  frame(_alpha: number, dt: number): void {
    const cur = currentNode(this.flow.run.map);
    const a = nodePos(cur);
    const opts = this.options;
    const sel = this.target ?? opts[this.sel] ?? cur;
    const b = nodePos(sel);
    if (this.moving >= 0) {
      const t = Math.min(1, this.moving / 1.4);
      const e = t * t * (3 - 2 * t);
      this.car.position.set(a.x + (b.x - a.x) * e, 0.05, a.z + (b.z - a.z) * e);
      this.car.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    } else {
      this.car.position.set(a.x, 0.05, a.z);
      this.car.rotation.y = -Math.PI / 2;
    }
    for (const bc of this.beacons) bc.e.gain = 0.55 + Math.sin(this.time * 2.2) * 0.45;
    this.rig.follow((a.x + b.x) / 2, (a.z + b.z) / 2 + 1.5, dt > 0 ? dt : 1 / 60, 1.25);
    this.lights.update(this.rig.focus.x, this.rig.focus.z, this.time);
    this.particles.update(dt, this.rig.camera, this.rig.focus.x, this.rig.focus.z, this.rig.zoom);
  }

  /** F3: set out for the first town ahead. */
  debugSkip(): void {
    const next = nextNodes(this.flow.run.map)[0];
    if (next) this.flow.go(next.id);
  }

  world(): WorldView {
    return { scene: this.scene, rig: this.rig };
  }

  drawUi(ui: UiSurface): void {
    const run = this.flow.run;
    const cur = currentNode(run.map);
    const opts = this.options;
    const sel = this.target ?? opts[this.sel];
    // Town names under each town on screen.
    const p = { x: 0, y: 0 };
    for (const n of run.map.nodes) {
      const w = nodePos(n);
      this.rig.worldToLow(w.x, 0, w.z + 1.6, p);
      const sx = (p.x / 640) * ui.width;
      const sy = (p.y / 360) * ui.height;
      if (sx < -40 || sx > ui.width + 40 || sy < 20 || sy > ui.height - 10) continue;
      const isOpt = opts.includes(n);
      const color = n === sel ? C.amber2 : isOpt ? C.fog1 : n === cur ? C.fog2 : C.slate1;
      const label = n.type === 'station' && n.revealed ? `${n.name} ◆` : n.name;
      ui.text(label, sx, sy, color, { align: 'center' });
    }
    // The sailing clock.
    const s = sailing(run);
    const color = s.slack <= 0 ? C.red1 : s.slack <= 2 ? C.amber2 : C.fog2;
    ui.text(`Day ${run.day} · The Sankofa sails in ${s.daysLeft} days`, ui.width / 2, 8, color, {
      align: 'center',
    });
    // The selected town.
    if (sel) {
      const wx = ui.width - 172;
      const lines: [string, number][] = [];
      const type = shownType(sel);
      lines.push([sel.name, C.amber2]);
      lines.push([`${TYPE_NAMES[type]} · ${REGION_NAMES[sel.region]}`, C.fog1]);
      if (sel.type !== 'checkpoint' && sel.type !== 'port') lines.push([CROWD[sel.crowd], C.fog0]);
      lines.push([sel.patrolKnown ? PATROL[sel.patrol] : 'Patrols unknown', C.fog0]);
      const walk = run.resources.carBattery < sel.distance;
      lines.push([
        walk ? `Walk it: no charge for ${sel.distance}` : `Drive: ${sel.distance} car battery`,
        walk ? C.amber2 : C.fog0,
      ]);
      for (const r of run.rumors) if (r.nodeId === sel.id) lines.push([RUMOR_NAMES[r.kind], C.amber1]);
      const h = 10 + lines.length * ui.lineHeight;
      ui.panel(wx - 8, ui.height - h - 26, 172, h, C.night0, C.slate0);
      lines.forEach(([t, c], i) =>
        ui.text(t, wx, ui.height - h - 21 + i * ui.lineHeight, c, { shadow: null }),
      );
      const dev = this.game.input.glyphDevice(0, this.game.save.settings.glyphStyle);
      const verb = walk ? 'Walk to' : 'Drive to';
      const bw = ui.measureButton('A', dev) + 4 + ui.measure(`${verb} ${sel.name}`);
      const bx = Math.floor(ui.width / 2 - bw / 2);
      ui.button('A', dev, bx, ui.height - 16);
      ui.text(`${verb} ${sel.name}`, bx + ui.measureButton('A', dev) + 4, ui.height - 16, C.fog2);
    }
    // The party's supplies.
    const r = run.resources;
    ui.text(
      `Car ${Math.round(r.carBattery)}  Cells ${Math.floor(r.cells)}  Parts ${r.parts}  Patches ${r.skinPatches}  Papers ${r.papers}  Rations ${r.rations}`,
      8,
      22,
      C.fog0,
    );
    if (run.heat > 0)
      ui.text(`Heat ${run.heat.toFixed(2).replace(/.?0+$/, '')}`, 8, 34, run.heat >= 2 ? C.red1 : C.amber1);
    this.flow.phone.draw(ui);
  }

  partyLines(): string[] {
    return partyLines(this.flow);
  }
}

/** The pause menu's party page for any run scene. */
export function partyLines(flow: RunFlow): string[] {
  const run = flow.run;
  const r = run.resources;
  const lines = [
    `Day ${run.day} · Heat ${run.heat}`,
    `Cells ${Math.floor(r.cells)}   Car ${Math.round(r.carBattery)}   Parts ${r.parts}`,
    `Skin patches ${r.skinPatches}   Papers ${r.papers}   Rations ${r.rations}`,
    '',
  ];
  for (const m of run.party) {
    if (m.kind === 'android')
      lines.push(
        `${m.id[0].toUpperCase()}${m.id.slice(1)}: Hull ${Math.round(m.hull)}  Skin ${Math.round(m.skin)}  Battery ${Math.round(m.battery)}  Integrity ${Math.round(m.integrity)}  ${m.status}`,
      );
    else lines.push(`June: Health ${Math.round(m.health)}  Hunger ${Math.round(m.hunger)}  ${m.status}`);
  }
  return lines;
}
