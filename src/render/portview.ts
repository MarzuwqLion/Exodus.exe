/**
 * The Port's dressing over the stop view (spec §11.5): the Sankofa at her berth with her name on the stern
 * quarter, the gangway (its foot lifted while Recyclers hold the berth) and the crew's flashing amber beacon,
 * floodlight towers by the terminal, and the moving cover synced from the simulation every frame: the yard
 * trucks and the gantry crane with the container it carries low across the apron.
 */
import * as THREE from 'three';
import { PORT_GEO } from '../content/layouts/port';
import { TUNING } from '../content/tuning';
import { Kit, type LightSpec } from '../models/kit';
import { buildProp, container, gantryCrane, GANGWAY_TOP } from '../models/props';
import { SANKOFA_NAME_ANCHOR, sankofa } from '../models/ship';
import { shipNameCanvas } from '../models/signs';
import { yardTruck } from '../models/vehicles';
import type { PortVehicle } from '../sim/port';
import type { StopSim } from '../sim/stop';
import type { Emitter, LightPool } from './lights';
import { materials, pixelTexture, signMaterial } from './materials';
import { C } from './palettes';

/** The ship's waterline sits 2 m down, so her deck meets the top of the gangway. */
const SHIP_AT = { x: 36, y: -2, z: -1 };
/** The gangway's foot (the south edge of its lowest tile) and how far it rises over its run. */
const FOOT_Z = PORT_GEO.gangwayFoot + 1;
const RUN = 8.6;
/** How far the crew swings the gangway's foot up while the berth is held. */
const LIFT = -0.45;
/** The gantry crane is drawn at this fraction of its height (readability from the camera's pitch). */
const CRANE_SQUAT = 0.45;
/** The yard truck model's length runs from z −4.47 to 5.85: its middle sits this far forward of the origin. */
const TRUCK_MID = 0.69;

function meshOf(k: Kit): { group: THREE.Group; lights: LightSpec[] } {
  const out = k.build();
  const g = new THREE.Group();
  const m = materials();
  if (out.solid) g.add(new THREE.Mesh(out.solid, m.toon));
  if (out.glow) g.add(new THREE.Mesh(out.glow, m.glow));
  return { group: g, lights: out.lights };
}

interface Mover {
  v: PortVehicle;
  mesh: THREE.Group;
  /** Emitters riding along, with their offsets in the mesh's space. */
  lights: { e: Emitter; ox: number; oy: number; oz: number }[];
  /** Trucks face one way and back up the other. */
  yaw: number;
}

export class PortView {
  readonly group = new THREE.Group();
  private movers: Mover[] = [];
  private gangway = new THREE.Group();
  private lift = 0;
  private beacon: Emitter | null = null;
  private time = 0;

  constructor(
    private readonly sim: StopSim,
    lights: LightPool,
  ) {
    // The Sankofa alongside, her name on the stern quarter.
    const ship = meshOf(
      (() => {
        const k = new Kit();
        sankofa(k);
        return k;
      })(),
    );
    ship.group.position.set(SHIP_AT.x, SHIP_AT.y, SHIP_AT.z);
    const canvas = shipNameCanvas();
    if (canvas) {
      const a = SANKOFA_NAME_ANCHOR;
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(a.w, a.h),
        signMaterial(pixelTexture(canvas), false),
      );
      plate.position.set(a.x, a.y, a.z + 0.01);
      ship.group.add(plate);
    }
    this.group.add(ship.group);
    // Her deck lamps burn a little lower than the model's: a warm promise across the dark apron, not a floodlight.
    for (const l of ship.lights)
      lights.add({
        ...l,
        x: l.x + SHIP_AT.x,
        y: l.y + SHIP_AT.y,
        z: l.z + SHIP_AT.z,
        intensity: l.intensity * 0.7,
      });

    // The gangway, hinged at the deck so its foot can swing up.
    const gk = new Kit();
    buildPropGangway(gk);
    const gw = meshOf(gk);
    const topZ = FOOT_Z - RUN;
    gw.group.position.set(0, -GANGWAY_TOP.y, FOOT_Z - 4 - topZ);
    this.gangway.position.set(PORT_GEO.gangwayX + 1, GANGWAY_TOP.y, topZ);
    this.gangway.add(gw.group);
    this.group.add(this.gangway);
    for (const l of gw.lights) {
      const e = lights.add({ ...l, x: l.x + PORT_GEO.gangwayX + 1, y: l.y, z: l.z + FOOT_Z - 4 });
      if (l.tag === 'gangway') this.beacon = e;
    }

    // Floodlight towers on the terminal's side of the apron and the yard.
    const fk = new Kit();
    for (const z of [9, 33, 49])
      fk.at({ x: sim.grid.w + 2.2, z, ry: -Math.PI / 2 }, () => buildProp(fk, 'floodlightTower', 1));
    const towers = meshOf(fk);
    this.group.add(towers.group);
    lights.addAll(towers.lights);

    // Moving cover.
    let lane = 0;
    for (const v of sim.port?.vehicles ?? []) {
      const k = new Kit();
      let yaw = 0;
      if (v.kind === 'truck') {
        yardTruck(k, 2);
        // Trucks face east or west, lane by lane, and back up the other way.
        yaw = lane++ % 2 === 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        // The gantry straddles the apron on its rails, the box hanging low under the spreader. It's drawn
        // squat (a 45% height) so its girders don't hide the apron from the camera.
        k.at({ ry: Math.PI / 2, sy: CRANE_SQUAT }, () => gantryCrane(k, 0));
        const dz = TUNING.port.craneLoadY - (PORT_GEO.craneRails[0] + PORT_GEO.craneRails[1]) / 2;
        k.at({ y: 0.25, z: dz, ry: Math.PI / 2 }, () => container(k, 7));
        for (const ox of [-0.9, 0.9])
          for (const oz of [-1.2, 1.2])
            k.pipe([ox, 7 * CRANE_SQUAT, dz + oz], [ox, 2.85, dz + oz], 0.06, C.night2);
      }
      const built = meshOf(k);
      const mover: Mover = { v, mesh: built.group, lights: [], yaw };
      for (const l of built.lights) {
        const e = lights.add({ ...l });
        mover.lights.push({ e, ox: l.x, oy: l.y, oz: l.z });
      }
      this.movers.push(mover);
      this.group.add(built.group);
    }
    this.update(0);
  }

  /** Height of whoever stands at (x, z): the gangway climbs from the quay to the deck. */
  heightAt(x: number, z: number): number {
    const gx = PORT_GEO.gangwayX;
    if (x < gx - 0.1 || x > gx + 2.1 || z > FOOT_Z || z < FOOT_Z - RUN) return 0;
    return GANGWAY_TOP.y * Math.min(1, (FOOT_Z - z) / RUN);
  }

  update(dt: number): void {
    const port = this.sim.port;
    if (!port) return;
    this.time += dt;
    // The gangway's foot swings up while the berth is held, and back down when it's clear.
    const want = port.gangwayUp ? LIFT : 0;
    this.lift += (want - this.lift) * Math.min(1, dt * 2.5);
    this.gangway.rotation.x = this.lift;
    // Mensah's crew flashes the beacon: quick double flashes, quicker after the horn.
    if (this.beacon) {
      const rate = port.horn ? 2.2 : 1.2;
      const p = (this.time * rate) % 1;
      this.beacon.gain = p < 0.12 || (p > 0.24 && p < 0.36) ? 1.4 : 0.15;
    }
    for (const m of this.movers) {
      const v = m.v;
      const fwd = m.yaw > 0 ? 1 : -1;
      const x = v.kind === 'truck' ? v.x - fwd * TRUCK_MID : v.x;
      const z = v.kind === 'truck' ? v.y : (PORT_GEO.craneRails[0] + PORT_GEO.craneRails[1]) / 2;
      m.mesh.position.set(x, 0, z);
      m.mesh.rotation.y = m.yaw;
      const c = Math.cos(m.yaw);
      const s = Math.sin(m.yaw);
      for (const l of m.lights) {
        l.e.x = x + l.ox * c + l.oz * s;
        l.e.y = l.oy;
        l.e.z = z - l.ox * s + l.oz * c;
      }
    }
  }
}

function buildPropGangway(k: Kit): void {
  buildProp(k, 'gangway');
}
