/**
 * The Port (spec §11.5), on top of the ordinary stop simulation:
 *
 * - the dawn clock (4:50 to 6:00 AM over six real minutes);
 * - the yard's Recycler beats (2 + 1 per Heat level), drones over the yard and (more of them) the waterline;
 * - yard trucks shuttling along their lanes and the gantry crane carrying a container low across the apron,
 *   both moving cover: they block sight and movement, and stop for anyone in their way;
 * - the terminal gate's scanner arch: each android shows 1 Papers or passes a 4 s breathing scan (a carried
 *   unit needs Papers), unless Captain Mensah's part was delivered and the gate crew wave the party through;
 * - the horn (the first step onto the gangway, or 5:30 AM): every hostile goes to ALERT, more Recyclers come
 *   out of the terminal, and a 60 s gangway timer starts. Whoever reaches the deck is aboard; carried units
 *   go aboard with their carrier. The ship sails when the timer ends, at 6:00, or once nobody is left ashore.
 */
import { MENSAH_GANGWAY_LINE, MENSAH_HOLD_LINE } from '../content/conversations';
import { PORT_GEO } from '../content/layouts/port';
import { TUNING } from '../content/tuning';
import { dist } from '../core/math';
import { beginScan, spawnDrone } from './hostiles';
import type { Point } from './grid';
import { newNpc, startRoutine } from './npc';
import type { Interaction } from './actions';
import type { StopSim } from './stop';
import type { MemberActor, NpcActor } from './types';

/** A yard truck or the gantry crane: a moving blocker over grid tiles. */
export interface PortVehicle {
  kind: 'truck' | 'crane';
  /** Center in world meters (tile units). */
  x: number;
  y: number;
  dir: 1 | -1;
  speed: number;
  minX: number;
  maxX: number;
  /** Where the crane is heading next (trucks shuttle end to end). */
  goalX: number;
  /** Paused (loading, setting down) for this long. */
  waitT: number;
  /** Something is in the way this tick. */
  blocked: boolean;
  /** Half extents of the blocking body. */
  hx: number;
  hy: number;
  /** Tiles currently stamped into the grid's dynamic blockers. */
  tiles: number[];
}

// -------------------------------------------------------------------------------------------------
// Setup
// -------------------------------------------------------------------------------------------------

export function setupPort(sim: StopSim): void {
  const G = PORT_GEO;
  const P = TUNING.port;
  const port = sim.port!;
  // The arch is a turnstile: nobody walks through it; members are let through (see passArch).
  sim.grid.dynBlock[sim.grid.idx(G.arch.x, G.arch.y)] = 1;
  // The gate operator: a guard who scans, or (Mensah's part delivered) one of her friends.
  const op = sim.layout.waypoints.get('operator');
  if (op) {
    const friendly = !!sim.cfg.port?.gateCrewSympathizers;
    const n = newNpc(sim, friendly ? 'crew' : 'guard', op.x, op.y);
    n.facing = Math.PI / 2;
    sim.npcs.push(n);
    startRoutine(sim, n, true);
    port.operator = n.idx;
  }
  // The Recyclers on their beats, 2 + 1 per Heat level.
  const count = P.baseRecyclers + Math.floor(sim.cfg.heat);
  for (let i = 0; i < count; i++) {
    const route = G.recyclerRoutes[i % G.recyclerRoutes.length];
    const pts = sim.cfg.layout.routes?.[route] ?? [];
    const start = sim.layout.waypoints.get(pts[sim.rng.int(0, Math.max(0, pts.length - 1))] ?? 'terminal');
    if (!start) continue;
    const r = newNpc(sim, i % 3 === 2 ? 'gunner' : 'recycler', start.x, start.y);
    r.obs.sympathizer = false;
    r.routine = `recycler:${route}`;
    r.slot = sim.rng.int(0, Math.max(0, pts.length - 1));
    sim.npcs.push(r);
    startRoutine(sim, r, true);
  }
  // At Heat 1+, Recyclers stand across the gangway's foot (spec §11.6: Recycler counts rise at the Port).
  const guards = Math.floor(Math.floor(sim.cfg.heat) * P.berthGuardsPerHeat);
  const foot = gangwayFoot(sim);
  const line = [0, 1, -1, 2, -2, 3];
  for (let i = 0; i < guards; i++) {
    const k = line[i % line.length];
    const post = { x: PORT_GEO.gangwayX + 0.5 + k, y: foot.y + Math.floor(i / line.length) };
    const r = newNpc(sim, i === 2 ? 'gunner' : 'recycler', post.x, post.y);
    r.obs.sympathizer = false;
    r.post = post;
    r.facing = Math.PI / 2;
    sim.npcs.push(r);
    startRoutine(sim, r, true);
  }
  // Dock workers start spread over their errands rather than in a knot.
  for (const n of sim.npcs) {
    if (n.role !== 'dockworker') continue;
    const route = n.routine.split(':')[1] ?? '';
    const pts = sim.cfg.layout.routes?.[route] ?? [];
    const p = sim.layout.waypoints.get(sim.rng.pick(pts));
    if (p) {
      n.x = n.px = p.x;
      n.y = n.py = p.y;
    }
  }
  // Drones: the yard, two over the waterline path, the apron from Heat 1, another over the yard per 2 Heat.
  for (let i = 0; i < P.yardDrones + Math.floor(sim.cfg.heat / 2); i++) spawnDrone(sim, 'drone');
  for (let i = 0; i < P.waterlineDrones; i++) spawnDrone(sim, 'drone2');
  if (sim.cfg.heat >= 1) spawnDrone(sim, 'drone3');
  // Moving cover.
  for (const row of G.truckLanes) {
    const [x0, x1] = G.truckX;
    const half = P.truckLength / 2;
    const x = sim.rng.range(x0 + half, x1 - half);
    port.vehicles.push({
      kind: 'truck',
      x,
      y: row + 1,
      dir: sim.rng.chance(0.5) ? 1 : -1,
      speed: P.truckSpeed,
      minX: x0 + half,
      maxX: x1 - half,
      goalX: x,
      waitT: sim.rng.range(0, 4),
      blocked: false,
      hx: half,
      hy: 1,
      tiles: [],
    });
  }
  const [c0, c1] = G.craneX;
  const cx = sim.rng.range(c0, c1);
  port.vehicles.push({
    kind: 'crane',
    x: cx,
    y: P.craneLoadY,
    dir: 1,
    speed: P.craneSpeed,
    minX: c0,
    maxX: c1,
    goalX: cx,
    waitT: sim.rng.range(2, 6),
    blocked: false,
    hx: P.craneLoadHalf[0],
    hy: P.craneLoadHalf[1],
    tiles: [],
  });
  for (const v of port.vehicles) stamp(sim, v, footprint(sim, v, v.x));
}

// -------------------------------------------------------------------------------------------------
// Moving cover
// -------------------------------------------------------------------------------------------------

/** Grid tiles a vehicle covers with its center at x (the crane's legs ride the rails at both ends). */
function footprint(sim: StopSim, v: PortVehicle, x: number): number[] {
  const g = sim.grid;
  const out: number[] = [];
  const x0 = Math.floor(x - v.hx);
  const x1 = Math.floor(x + v.hx - 1e-3);
  const y0 = Math.floor(v.y - v.hy);
  const y1 = Math.floor(v.y + v.hy - 1e-3);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) if (g.inBounds(tx, ty)) out.push(g.idx(tx, ty));
  if (v.kind === 'crane') {
    for (const row of PORT_GEO.craneRails) {
      for (const lx of [x - TUNING.port.craneLegOffset, x + TUNING.port.craneLegOffset]) {
        const tx = Math.floor(lx);
        if (g.inBounds(tx, row)) out.push(g.idx(tx, row));
      }
    }
  }
  return out;
}

function stamp(sim: StopSim, v: PortVehicle, tiles: number[]): void {
  const d = sim.grid.dynBlock;
  for (const i of v.tiles) d[i] = 0;
  for (const i of tiles) d[i] = 2;
  v.tiles = tiles;
}

/** Anyone (or anything) standing on a tile the vehicle would move onto. */
function occupied(sim: StopSim, v: PortVehicle, tiles: number[]): boolean {
  const g = sim.grid;
  const fresh = tiles.filter((i) => !v.tiles.includes(i));
  if (fresh.length === 0) return false;
  const hit = (x: number, y: number, r: number): boolean => {
    for (const i of fresh) {
      const tx = i % g.w;
      const ty = Math.floor(i / g.w);
      const nx = Math.max(tx, Math.min(tx + 1, x));
      const ny = Math.max(ty, Math.min(ty + 1, y));
      if ((nx - x) ** 2 + (ny - y) ** 2 < (r + 0.15) ** 2) return true;
    }
    return false;
  };
  for (const m of sim.members)
    if (sim.present(m) && m.mode !== 'carried' && hit(m.x, m.y, m.radius)) return true;
  for (const n of sim.npcs) if (n.mode !== 'gone' && hit(n.x, n.y, n.radius)) return true;
  // Other blockers (the arch, the parked car) never move.
  for (const i of fresh)
    if (!(sim.grid.flags[i] & 1) || (sim.grid.dynBlock[i] !== 0 && !v.tiles.includes(i))) return true;
  return false;
}

function updateVehicles(sim: StopSim, dt: number): void {
  const P = TUNING.port;
  for (const v of sim.port!.vehicles) {
    v.blocked = false;
    if (v.waitT > 0) {
      v.waitT -= dt;
      continue;
    }
    if (v.kind === 'truck') {
      const goal = v.dir > 0 ? v.maxX : v.minX;
      if (Math.abs(goal - v.x) < 0.05) {
        // Loading at the end of the lane, then back the other way.
        v.dir = v.dir > 0 ? -1 : 1;
        v.waitT = sim.rng.range(P.truckWait[0], P.truckWait[1]);
        continue;
      }
      v.goalX = goal;
    } else if (Math.abs(v.goalX - v.x) < 0.05) {
      // The crane sets its box down a while, then carries it somewhere else.
      v.goalX = sim.rng.range(v.minX, v.maxX);
      v.waitT = sim.rng.range(P.craneWait[0], P.craneWait[1]);
      continue;
    }
    const step = Math.sign(v.goalX - v.x) * Math.min(Math.abs(v.goalX - v.x), v.speed * dt);
    const nx = v.x + step;
    const tiles = footprint(sim, v, nx);
    if (occupied(sim, v, tiles)) {
      v.blocked = true;
      continue;
    }
    v.dir = step > 0 ? 1 : -1;
    v.x = nx;
    stamp(sim, v, tiles);
  }
}

// -------------------------------------------------------------------------------------------------
// The terminal gate
// -------------------------------------------------------------------------------------------------

function operatorOf(sim: StopSim): NpcActor | null {
  const i = sim.port?.operator ?? -1;
  return i >= 0 ? (sim.npcs[i] ?? null) : null;
}

/** Papers it takes to put this member (and whoever they carry) through the arch. */
export function archPapers(sim: StopSim, m: MemberActor): number {
  const carried = m.carrying >= 0 ? sim.members[m.carrying] : undefined;
  return (m.state.kind === 'android' ? 1 : 0) + (carried && carried.state.kind === 'android' ? 1 : 0);
}

const BUSY = 'Someone is being scanned';

/** What the arch offers a member wherever they stand (null once they're through). */
export function archOffer(sim: StopSim, m: MemberActor): { verb: string; disabled?: string } | null {
  const port = sim.port;
  if (!port || port.gatePassed.has(m.idx)) return null;
  if (port.archScan >= 0) return { verb: 'Scanner arch', disabled: BUSY };
  const op = operatorOf(sim);
  const waved = !!sim.cfg.port?.gateCrewSympathizers || !op || !sim.isActiveNpc(op);
  const need = archPapers(sim, m);
  if (waved || need === 0) return { verb: 'Walk through' };
  // ALERT shuts the gate: the yard's only other way out is the waterline path.
  if (sim.alert.on) return { verb: 'Scanner arch', disabled: 'Locked down' };
  if (sim.resources.papers >= need) return { verb: `Show Papers · ${need}` };
  if (m.carrying >= 0) return { verb: 'Scanner arch', disabled: `Needs ${need} Papers` };
  return { verb: 'Breathing scan' };
}

/** The arch will let this member through (now, or once the scan ahead of them is over). */
export function archOpenTo(sim: StopSim, m: MemberActor): boolean {
  const o = archOffer(sim, m);
  return !!o && (!o.disabled || o.disabled === BUSY);
}

/** The scanner arch interaction for a member standing at it (or null if not there). */
export function archInteraction(sim: StopSim, m: MemberActor): Interaction | null {
  const at = PORT_GEO.archSouth;
  if (!sim.port || dist(m, at) > TUNING.port.archReach) return null;
  const o = archOffer(sim, m);
  return o ? { kind: 'arch', hold: 0, target: 0, x: at.x, y: at.y - 1, ...o } : null;
}

/** Use the arch: walk through, show Papers, or start the 4 s breathing scan. */
export function useArch(sim: StopSim, m: MemberActor): void {
  const port = sim.port!;
  const it = archInteraction(sim, m);
  if (!it || it.disabled) return;
  if (it.verb === 'Breathing scan') {
    const op = operatorOf(sim);
    if (!op) return;
    port.archScan = m.idx;
    beginScan(sim, op, m, false);
    if (m.scan) m.scan.meter += TUNING.port.archScanPerHeat * Math.floor(sim.cfg.heat);
    return;
  }
  if (it.verb.startsWith('Show Papers')) {
    const need = archPapers(sim, m);
    sim.resources.papers -= need;
    sim.emit({ t: 'pickup', text: `-${need} Papers`, x: m.x, y: m.y });
  }
  passArch(sim, m);
}

/** A breathing scan at the arch is over (see resolveScan): through on a pass. */
export function archScanDone(sim: StopSim, m: MemberActor, passed: boolean): void {
  const port = sim.port!;
  port.archScan = -1;
  if (passed) passArch(sim, m);
}

/** Through the arch to the apron side (with anyone carried). */
export function passArch(sim: StopSim, m: MemberActor): void {
  const port = sim.port!;
  const out = PORT_GEO.archNorth;
  port.gatePassed.add(m.idx);
  m.x = m.px = out.x;
  m.y = m.py = out.y;
  m.vx = m.vy = 0;
  m.path = [];
  m.pathI = 0;
  if (m.carrying >= 0) {
    const c = sim.members[m.carrying];
    if (c) {
      port.gatePassed.add(c.idx);
      c.x = c.px = out.x;
      c.y = c.py = out.y;
    }
  }
  sim.emit({ t: 'gate' });
  sim.emit({ t: 'sfx', cue: 'kiosk_beep', x: out.x, y: out.y + 1 });
}

/**
 * Trespassing (spec §11.5's stealth crossing): anywhere in the yard or on the waterline path, or on the apron
 * without having come through the gate. The landside lot and the queue at the gate are public.
 */
export function trespassing(sim: StopSim, m: MemberActor): boolean {
  const G = PORT_GEO;
  if (m.y >= G.lotY) return false;
  if (dist(m, G.archSouth) < G.gateZone) return false;
  if (m.y < G.fenceY) return !sim.port!.gatePassed.has(m.idx);
  return true;
}

/** South of the terminal fence, inside the yard or the lot (not on the waterline path). */
export function behindGate(p: Point): boolean {
  return p.y > PORT_GEO.fenceY + 0.5 && p.x > PORT_GEO.waterlineX + 1;
}

// -------------------------------------------------------------------------------------------------
// The horn, boarding, and sailing
// -------------------------------------------------------------------------------------------------

export function onGangway(sim: StopSim, p: Point): boolean {
  const ch = sim.grid.charAt(Math.floor(p.x), Math.floor(p.y));
  return ch === '=' || ch === 'v';
}

/** The gangway's foot on the apron (where hostiles stop: the crew won't let them up). */
export function gangwayFoot(sim: StopSim): Point {
  return (
    sim.layout.waypoints.get('gangwayFoot') ?? { x: PORT_GEO.gangwayX + 1, y: PORT_GEO.gangwayFoot + 1.5 }
  );
}

/**
 * Recyclers come out of the terminal onto the apron and secure the berth: they hold the ground around the
 * gangway's foot, chase whoever they see, and go back to it when they lose them.
 */
function terminalRecyclers(sim: StopSim, count: number): void {
  const at = sim.layout.waypoints.get('terminal');
  if (!at) return;
  const foot = gangwayFoot(sim);
  for (let i = 0; i < count; i++) {
    const spot = sim.grid.nearestWalkable(at.x - i * 1.2, at.y + (i % 2)) ?? at;
    const r = newNpc(sim, i === 0 ? 'gunner' : 'recycler', spot.x, spot.y);
    r.obs.sympathizer = false;
    r.fromVan = true;
    r.mode = 'hunt';
    r.post = { x: foot.x + (i % 2 === 0 ? -2.5 : 2.5) + i * 0.4, y: foot.y + 1.5 + Math.floor(i / 2) * 1.5 };
    r.lastKnown = { ...r.post };
    sim.npcs.push(r);
  }
  sim.emit({ t: 'sfx', cue: 'van_screech', x: at.x, y: at.y });
}

function soundHorn(sim: StopSim): void {
  const port = sim.port!;
  if (port.horn) return;
  port.horn = true;
  port.gangwayT = 0;
  const foot = gangwayFoot(sim);
  sim.emit({ t: 'horn' });
  sim.emit({ t: 'sfx', cue: 'ship_horn', x: foot.x, y: foot.y - 6 });
  sim.emit({ t: 'shake', amount: 2 });
  terminalRecyclers(sim, TUNING.port.hornRecyclers);
  // Every hostile goes to ALERT, converging on the gangway.
  sim.raiseAlert(foot);
  sim.alert.lastKnown = { ...foot };
  for (const n of sim.npcs) if (n.hostile) n.lastKnown = { ...foot };
}

function board(sim: StopSim, m: MemberActor): void {
  const port = sim.port!;
  const go = (x: MemberActor): void => {
    port.aboard.add(x.idx);
    if (x.controller !== null) {
      const s = x.controller;
      x.controller = null;
      sim.control[s] = null;
      sim.assignSlot(s);
    }
    x.mode = 'aboard';
    x.vx = x.vy = 0;
    x.carriedBy = -1;
  };
  if (m.carrying >= 0) {
    const c = sim.members[m.carrying];
    m.carrying = -1;
    if (c) go(c);
  }
  go(m);
  sim.emit({ t: 'pickup', text: 'Aboard', x: m.x, y: m.y });
  sim.emit({ t: 'sfx', cue: 'gate_raise', x: m.x, y: m.y, gain: 0.3 });
}

/** Members still ashore who could yet get aboard on their own feet or someone else's. */
function anyoneAshore(sim: StopSim): boolean {
  return sim.members.some(
    (m) =>
      sim.present(m) &&
      m.mode !== 'aboard' &&
      m.mode !== 'shutdown' &&
      m.mode !== 'carried' &&
      m.mode !== 'down' &&
      m.mode !== 'factory',
  );
}

export function updatePort(sim: StopSim, dt: number): void {
  const port = sim.port;
  if (!port || sim.outcome) return;
  const P = TUNING.port;
  const seconds = sim.cfg.port?.seconds ?? P.realSeconds;
  port.clock = P.clockStartMinutes + (sim.time / seconds) * (P.clockEndMinutes - P.clockStartMinutes);
  updateVehicles(sim, dt);
  updateGangway(sim);
  // Boarding, and the horn on the first step onto the gangway.
  for (const m of sim.members) {
    if (!sim.present(m) || m.mode === 'carried' || m.mode === 'aboard') continue;
    const ch = sim.grid.charAt(Math.floor(m.x), Math.floor(m.y));
    if (ch === '=' || ch === 'v') soundHorn(sim);
    if (ch === 'v' && sim.available(m)) board(sim, m);
  }
  if (!port.horn && port.clock >= P.hornAtMinutes) soundHorn(sim);
  // ALERT before the horn: the terminal sends its Recyclers (2 + 1 per Heat level, like the van, §8.6).
  if (sim.alert.on && !port.alertForces) {
    port.alertForces = true;
    if (!port.horn) terminalRecyclers(sim, TUNING.alert.baseRecyclers + Math.floor(sim.cfg.heat));
  }
  // Captain Mensah calls them up the gangway when the first of them gets close (or tells them to clear the
  // dock first).
  const mensah = sim.npcs.find((n) => n.role === 'mensah');
  const close = !!mensah && sim.members.some((m) => sim.present(m) && dist(m, mensah) < P.mensahCallRange);
  if (mensah && close) {
    if (port.gangwayUp && sim.time - port.holdSaidAt > 8) {
      port.holdSaidAt = sim.time;
      say(sim, mensah, MENSAH_HOLD_LINE);
    } else if (!port.gangwayUp && !port.mensahSaid) {
      port.mensahSaid = true;
      say(sim, mensah, MENSAH_GANGWAY_LINE);
    }
  }
  if (port.horn) port.gangwayT += dt;
  const sails =
    (port.horn && port.gangwayT >= P.gangwaySeconds) ||
    port.clock >= P.clockEndMinutes ||
    (port.aboard.size > 0 && !anyoneAshore(sim));
  if (sails) finishPort(sim);
}

function say(sim: StopSim, n: NpcActor, text: string): void {
  n.speech = text;
  n.speechT = 4;
  sim.emit({ t: 'bark', actor: n.idx, npc: true, text });
}

/** Tiles at the gangway's foot (its lowest row), which come up with it. */
function gangwayFootTiles(sim: StopSim): number[] {
  const G = PORT_GEO;
  return [sim.grid.idx(G.gangwayX, G.gangwayFoot), sim.grid.idx(G.gangwayX + 1, G.gangwayFoot)];
}

/**
 * Mensah's crew won't lower the gangway onto Recyclers: while any active one is near its foot, the foot is up.
 * Whoever is already on it keeps climbing.
 */
function updateGangway(sim: StopSim): void {
  const port = sim.port!;
  const foot = gangwayFoot(sim);
  const held = sim.npcs.some(
    (n) => n.hostile && sim.isActiveNpc(n) && dist(n, foot) < TUNING.port.berthHoldRadius,
  );
  if (held === port.gangwayUp) return;
  const tiles = gangwayFootTiles(sim);
  if (held) {
    const g = sim.grid;
    const standing = sim.members.some(
      (m) => sim.present(m) && tiles.includes(g.idx(Math.floor(m.x), Math.floor(m.y))),
    );
    if (standing) return;
    for (const i of tiles) g.dynBlock[i] = 1;
  } else for (const i of tiles) sim.grid.dynBlock[i] = 0;
  port.gangwayUp = held;
  sim.emit({ t: 'sfx', cue: 'gate_raise', x: foot.x, y: foot.y - 2, gain: 0.7 });
}

/** The Sankofa sails (or the ship is gone and nobody made it aboard). */
export function finishPort(sim: StopSim): void {
  const port = sim.port!;
  const androids = [...port.aboard].some((i) => sim.members[i]?.state.kind === 'android');
  sim.emit({ t: 'sfx', cue: 'ship_horn', x: gangwayFoot(sim).x, y: 0, gain: 0.6 });
  sim.finish(androids ? 'sailed' : 'missedShip', []);
}
