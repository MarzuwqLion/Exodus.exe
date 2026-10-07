/**
 * Surveillance and hostiles (spec §8.6, §8.7, §8.9, §10.6): security cameras, the patrol clock (drones and the
 * routine Recycler sweep with breathing scans), ALERT (the van, Recyclers arriving, hunting, searching), the
 * hostile combat AI (baton swings, EMP rifles), and reclaiming shut-down units.
 */
import { TUNING } from '../content/tuning';
import { BARKS } from '../content/barks';
import { angleOf, dist } from '../core/math';
import { glitch, setMode, unplug } from './actions';
import { newScan, pressScan } from './breathing';
import { F, type Point } from './grid';
import { steer } from './movement';
import { goTo, newNpc, startRoutine, walk } from './npc';
import { inView } from './perception';
import type { StopSim } from './stop';
import type { DroneActor, MemberActor, NpcActor } from './types';

// -------------------------------------------------------------------------------------------------
// Cameras
// -------------------------------------------------------------------------------------------------

export function setupCameras(sim: StopSim): void {
  const O = TUNING.observers;
  const defs = [...(sim.cfg.layout.cameras ?? [])];
  // The Corridor adds one more camera per stop (spec §8.8).
  if (sim.cfg.region === 'corridor' && defs.length > 0 && sim.kind !== 'station') {
    const base = defs[0];
    const exitC = sim.exitTiles[Math.floor(sim.exitTiles.length / 2)] ?? { x: base.x, y: base.y };
    defs.push({ x: Math.floor(exitC.x), y: Math.max(0, Math.floor(exitC.y) - 3), facing: 270, sweep: 80 });
  }
  for (const d of defs) {
    sim.cameras.push({
      idx: sim.cameras.length,
      x: d.x + 0.5,
      y: d.y + 0.5,
      base: (d.facing * Math.PI) / 180,
      sweep: ((d.sweep ?? O.cameraSweepDeg) * Math.PI) / 180,
      phase: sim.rng.range(0, Math.PI * 2),
      facing: (d.facing * Math.PI) / 180,
      period: sim.kind === 'gas' ? O.cameraSweepSeconds * 0.8 : O.cameraSweepSeconds,
      obs: {
        id: `cam${sim.cameras.length}`,
        kind: 'camera',
        sympathizer: false,
        coneDeg: O.camera.coneDeg,
        range: O.camera.range,
        hearing: 0,
        awareness: {},
        state: 'unaware',
      },
    });
  }
}

function updateCameras(sim: StopSim): void {
  for (const c of sim.cameras) {
    c.facing = c.base + Math.sin((sim.time / c.period) * Math.PI * 2 + c.phase) * (c.sweep / 2);
  }
}

// -------------------------------------------------------------------------------------------------
// Drones
// -------------------------------------------------------------------------------------------------

/**
 * A loop over the outdoor lot and past the windows, from the layout or generated. The second drone can fly
 * its own beat (route `drone2`); otherwise it flies the first one's the other way round.
 */
function droneRoute(sim: StopSim, offset: number): Point[] {
  const routes = sim.cfg.layout.routes;
  const own = offset > 0 ? routes?.[`drone${offset + 1}`] : undefined;
  const names = own ?? routes?.drone;
  if (names && names.length > 0) {
    const pts = names.map((n) => sim.layout.waypoints.get(n)).filter((p): p is Point => !!p);
    if (pts.length > 1) return own || offset % 2 === 0 ? pts : [...pts].reverse();
  }
  const g = sim.grid;
  let x0 = g.w;
  let x1 = 0;
  let y0 = g.h;
  let y1 = 0;
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (!g.has(x, y, F.OUTDOOR)) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 <= x0) return [{ x: g.w / 2, y: g.h / 2 }];
  const m = 2;
  const pts: Point[] = [
    { x: x0 + m, y: y0 + m },
    { x: x1 - m, y: y0 + m },
    { x: x1 - m, y: y1 - m },
    { x: x0 + m, y: y1 - m },
  ];
  return offset % 2 === 0 ? pts : pts.reverse();
}

/** A layout route's points (null if it has fewer than two). */
function namedRoute(sim: StopSim, name: string): Point[] | null {
  const pts = (sim.cfg.layout.routes?.[name] ?? [])
    .map((n) => sim.layout.waypoints.get(n))
    .filter((p): p is Point => !!p);
  return pts.length > 1 ? pts : null;
}

export function spawnDrone(sim: StopSim, beat?: string): DroneActor {
  // Drones come in over a random point of their loop, so a patrol's timing can't be learned by heart.
  const loop = (beat ? namedRoute(sim, beat) : null) ?? droneRoute(sim, sim.drones.length);
  const k = sim.rng.int(0, loop.length - 1);
  const route = [...loop.slice(k), ...loop.slice(0, k)];
  const start = route[0];
  const d: DroneActor = {
    idx: sim.drones.length,
    x: start.x,
    y: start.y - 14,
    px: start.x,
    py: start.y - 14,
    z: 6,
    heading: Math.PI / 2,
    beam: Math.PI / 2,
    route,
    routeI: 0,
    home: null,
    arriving: 1,
    obs: {
      id: `drone${sim.drones.length}`,
      kind: 'drone',
      sympathizer: false,
      coneDeg: TUNING.observers.drone.coneDeg,
      range: TUNING.observers.drone.range,
      hearing: 0,
      awareness: {},
      state: 'unaware',
    },
  };
  sim.drones.push(d);
  sim.emit({ t: 'drone', idx: d.idx });
  sim.emit({ t: 'sfx', cue: 'scanner_sweep', x: start.x, y: start.y });
  return d;
}

function updateDrones(sim: StopSim, dt: number): void {
  for (const d of sim.drones) {
    d.px = d.x;
    d.py = d.y;
    let target: Point;
    if (sim.alert.on && sim.alert.lastKnown && !sim.alert.searching) target = sim.alert.lastKnown;
    else if (sim.alert.on && sim.alert.lastKnown) {
      // Searching: circle the last known position.
      const a = sim.time * 0.4 + d.idx * 2;
      target = { x: sim.alert.lastKnown.x + Math.cos(a) * 5, y: sim.alert.lastKnown.y + Math.sin(a) * 4 };
    } else target = d.route[d.routeI % d.route.length];
    const dx = target.x - d.x;
    const dy = target.y - d.y;
    const dd = Math.hypot(dx, dy);
    const speed = sim.alert.on ? 3.4 : 2.2;
    if (dd > 0.3) {
      d.x += (dx / dd) * Math.min(dd, speed * dt);
      d.y += (dy / dd) * Math.min(dd, speed * dt);
      d.heading = angleOf(dx, dy);
    } else if (!sim.alert.on) d.routeI++;
    if (d.arriving > 0) {
      d.arriving -= dt * 0.25;
      if (dd < 4) d.arriving = 0;
    }
    // The searchlight sweeps across the heading (a slow figure, wider when searching).
    const sweep = sim.alert.on && !sim.alert.searching ? 0.25 : 0.8;
    d.beam = d.heading + Math.sin(sim.time * 0.9 + d.idx) * sweep;
  }
}

// -------------------------------------------------------------------------------------------------
// Patrol clock (spec §8.7)
// -------------------------------------------------------------------------------------------------

function updatePatrol(sim: StopSim): void {
  const p = sim.patrol;
  if (!p.fired.drone1 && sim.time >= p.drone1) {
    p.fired.drone1 = true;
    spawnDrone(sim);
    sim.emit({ t: 'patrol', which: 'drone1' });
  }
  if (!p.fired.sweep && sim.time >= p.sweep) {
    p.fired.sweep = true;
    // At a compromised Station the van is already here.
    if (!sim.alert.on && sim.kind !== 'compromised') startSweep(sim);
    sim.emit({ t: 'patrol', which: 'sweep' });
  }
  if (!p.fired.drone2 && sim.time >= p.drone2) {
    p.fired.drone2 = true;
    spawnDrone(sim);
    sim.emit({ t: 'patrol', which: 'drone2' });
  }
  if (sim.mods.has('droneAtStart') && sim.drones.length === 0 && sim.time > 1) spawnDrone(sim);
}

function vanPoint(sim: StopSim): Point {
  const [x, y] = sim.cfg.layout.vanEntry;
  return { x: x + 0.5, y: y + 0.5 };
}

function startSweep(sim: StopSim): void {
  const at = vanPoint(sim);
  sim.sweep.active = true;
  sim.sweep.t = 0;
  sim.sweep.leaving = false;
  sim.emit({ t: 'van', x: at.x, y: at.y });
  sim.emit({ t: 'sfx', cue: 'van_screech', x: at.x, y: at.y });
  const n = sim.cfg.heat >= 2 ? 2 : 1 + (sim.rng.chance(0.5) ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const r = spawnRecycler(sim, i === 1 ? 'gunner' : 'recycler', at);
    r.mode = 'sweep';
    sim.sweep.recyclers.push(r.idx);
  }
}

function spawnRecycler(sim: StopSim, role: 'recycler' | 'gunner', at: Point): NpcActor {
  const spot = sim.spawnTiles(at.x, at.y, sim.npcs.length % 4)[sim.npcs.length % 3] ?? at;
  const r = newNpc(sim, role, spot.x, spot.y);
  r.fromVan = true;
  r.obs.sympathizer = false;
  sim.npcs.push(r);
  return r;
}

// -------------------------------------------------------------------------------------------------
// Routine sweep: walk the lot, stop random people, scan them (spec §8.7)
// -------------------------------------------------------------------------------------------------

function sweepRecycler(sim: StopSim, r: NpcActor, dt: number): void {
  const S = TUNING.patrol;
  const sw = sim.sweep;
  // Scanning a member in progress (the member's side resolves it; see resolveScan).
  if (r.scanTarget >= 0) {
    const m = sim.members[r.scanTarget];
    steer(r, 0, 0, dt);
    setAct(r, 'scan');
    if (!m || m.mode !== 'scanned' || !m.scan) {
      r.scanTarget = -1;
      r.stepT = 0;
      return;
    }
    r.facing = angleOf(m.x - r.x, m.y - r.y);
    return;
  }
  // Leaving after the stay.
  if (sw.t > S.sweepStaySeconds || sw.leaving) {
    sw.leaving = true;
    const v = vanPoint(sim);
    if (r.path.length === 0 || r.pathI >= r.path.length) goTo(sim, r, v);
    if (walk(sim, r, dt) || dist(r, v) < 1) r.mode = 'gone';
    setAct(r, 'walk');
    return;
  }

  r.stepT -= dt;
  if (r.stepT > 0 && r.path.length > 0 && r.pathI < r.path.length) {
    walk(sim, r, dt, 1.2);
    setAct(r, 'walk');
    return;
  }
  if (r.stepT > 0) {
    steer(r, 0, 0, dt);
    setAct(r, 'idle');
    return;
  }
  // Pick someone to stop: a person within reach outdoors (party members included).
  const cands: { x: number; y: number; member: MemberActor | null; npc: NpcActor | null }[] = [];
  for (const m of sim.members) {
    if (!sim.available(m) || sim.grid.flagAt(m.x, m.y, F.INTERIOR)) continue;
    if (dist(m, r) < 9) cands.push({ x: m.x, y: m.y, member: m, npc: null });
  }
  for (const n of sim.npcs) {
    if (n === r || n.role !== 'customer' || !sim.isActiveNpc(n)) continue;
    if (dist(n, r) < 9) cands.push({ x: n.x, y: n.y, member: null, npc: n });
  }
  const pick = cands.length > 0 && sim.rng.chance(0.6) ? sim.rng.pick(cands) : null;
  if (pick && dist(pick, r) < 1.8) {
    if (pick.member && sw.scanned < TUNING.patrol.sweepScanTargets) beginScan(sim, r, pick.member, true);
    else {
      r.stepT = 3;
      setAct(r, 'scan');
      r.facing = angleOf(pick.x - r.x, pick.y - r.y);
      bark(sim, r, 'recycler');
    }
    sw.scanned++;
    return;
  }
  const dest = pick
    ? { x: pick.x, y: pick.y }
    : sim.grid.nearestWalkable(r.x + sim.rng.range(-8, 8), r.y + sim.rng.range(-6, 6));
  if (dest && goTo(sim, r, dest)) r.stepT = 6;
  else r.stepT = 1.5;
}

/** Start a breathing scan on a party member (the short 4 s version, spec §11.3). */
export function beginScan(sim: StopSim, r: NpcActor, m: MemberActor, routine: boolean): void {
  if (m.plug) unplug(sim, m);
  m.blend = null;
  m.channel = null;
  setMode(m, 'scanned');
  m.vx = m.vy = 0;
  m.scanner = r.idx;
  m.scan = newScan(sim.rng, {
    short: true,
    skin01: sim.skin01(m),
    integrity: m.state.kind === 'android' ? m.state.integrity : 100,
  });
  r.scanTarget = m.idx;
  r.facing = angleOf(m.x - r.x, m.y - r.y);
  bark(sim, r, 'recycler');
  sim.emit({ t: 'sfx', cue: 'scanner_sweep', x: m.x, y: m.y });
  sim.emit({ t: 'tip', id: 'first-scan' });
  if (m.controller !== null) sim.emit({ t: 'rumble', slot: m.controller, kind: 'scan' });
  if (m.state.kind === 'android')
    m.state.integrity = Math.max(0, m.state.integrity + TUNING.integrity.scanned);
  void routine;
}

/** AI members being scanned breathe on their own (the party AI's best effort). */
export function aiBreathe(sim: StopSim, m: MemberActor): void {
  const s = m.scan;
  if (!s || s.done || s.next >= s.beats.length) return;
  if (m.aiBreathBeat !== s.next) {
    const skill = m.state.kind === 'android' ? 0.6 + m.state.integrity / 250 : 1;
    const ok = sim.rng.chance(TUNING.breathing.aiBreathSuccess * skill);
    // A good breath lands off-center inside the window; a bad one lands late, outside it.
    const off = ok ? sim.rng.range(0.06, 0.16) * sim.rng.sign() : sim.rng.range(0.3, 0.5);
    m.aiBreathAt = s.beats[s.next] + off;
    m.aiBreathBeat = s.next;
  }
  if (s.t >= m.aiBreathAt) {
    m.aiBreathAt = Infinity;
    pressScan(s);
  }
}

// -------------------------------------------------------------------------------------------------
// ALERT: the van, Recyclers, hunting, searching (spec §8.6)
// -------------------------------------------------------------------------------------------------

function updateAlertForces(sim: StopSim): void {
  const a = sim.alert;
  if (!a.on || a.vanArrived || sim.time < 0) return;
  if (a.t >= a.vanAt) {
    a.vanArrived = true;
    const at = vanPoint(sim);
    sim.emit({ t: 'van', x: at.x, y: at.y });
    sim.emit({ t: 'sfx', cue: 'van_screech', x: at.x, y: at.y });
    const count = TUNING.alert.baseRecyclers + Math.floor(sim.cfg.heat);
    for (let i = 0; i < count; i++) {
      const r = spawnRecycler(sim, i === 0 ? 'gunner' : 'recycler', at);
      r.mode = 'hunt';
      r.lastKnown = a.lastKnown ? { ...a.lastKnown } : null;
    }
    // Sweep Recyclers already on site join the hunt.
    for (const idx of sim.sweep.recyclers) {
      const r = sim.npcs[idx];
      if (r && r.mode === 'sweep') r.mode = 'hunt';
    }
  }
}

function bark(sim: StopSim, n: NpcActor, context: string): void {
  if (n.barkCd > 0) return;
  const list = BARKS.filter((b) => b.context === context);
  if (list.length === 0) return;
  n.speech = sim.rng.pick(list).text;
  n.speechT = 2.4;
  n.barkCd = 6;
  sim.emit({ t: 'bark', actor: n.idx, npc: true, text: n.speech });
}

function setAct(n: NpcActor, a: NpcActor['activity']): void {
  if (n.activity !== a) {
    n.activity = a;
    n.activityT = 0;
  }
}

/** The member a hostile sees best right now (or null). */
function visibleTarget(sim: StopSim, h: NpcActor): MemberActor | null {
  let best: MemberActor | null = null;
  let bd = Infinity;
  const range = h.obs.range * sim.currentRangeMult();
  for (const m of sim.members) {
    if (!sim.present(m) || m.mode === 'carried') continue;
    if ((h.obs.awareness[m.id] ?? 0) < TUNING.awareness.suspicious) continue;
    const d = dist(m, h);
    if (d < bd && inView(sim, h.x, h.y, h.facing, 160, range, m.x, m.y)) {
      bd = d;
      best = m;
    }
  }
  return best;
}

function hostileAi(sim: StopSim, h: NpcActor, dt: number): void {
  const C = TUNING.combat;
  if (h.attackCd > 0) h.attackCd -= dt;
  if (h.stunT > 0) {
    steer(h, 0, 0, dt, 6);
    return;
  }
  // Reclaiming: a Recycler who reaches a shut-down unit scans it for 3 s (spec §8.10).
  if (h.role === 'recycler' || h.role === 'gunner') {
    for (const m of sim.members) {
      if (m.mode !== 'shutdown') continue;
      const d = dist(m, h);
      if (d < 1.2) {
        steer(h, 0, 0, dt);
        setAct(h, 'scan');
        h.facing = angleOf(m.x - h.x, m.y - h.y);
        h.stepT += dt;
        if (h.stepT === dt) bark(sim, h, 'recycler');
        if (h.stepT >= TUNING.shutdown.reclaimScanSeconds) {
          h.stepT = 0;
          sim.emit({ t: 'sfx', cue: 'scanner_sweep', x: m.x, y: m.y });
          sim.lose(m, 'reclaimed');
        }
        return;
      }
      if (d < 7 && sim.grid.los(h.x, h.y, m.x, m.y)) {
        if (h.path.length === 0 || h.pathI >= h.path.length || !h.target || dist(h.target, m) > 1)
          goTo(sim, h, m);
        walk(sim, h, dt, 2.6);
        setAct(h, 'brisk');
        return;
      }
    }
  }
  h.stepT = 0;
  let target = visibleTarget(sim, h);
  // A hostile holding a post (the Port's berth) only goes after someone close to it.
  if (h.post && target && dist(target, h.post) > TUNING.port.postLeash) target = null;
  // Attacks in progress.
  if (h.attackT >= 0) {
    h.attackT += dt;
    steer(h, 0, 0, dt, 8);
    const victim = sim.members[h.aimTarget];
    if (victim && h.role !== 'gunner') h.facing = angleOf(victim.x - h.x, victim.y - h.y);
    const wind = h.role === 'gunner' ? C.gunnerAimSeconds : C.batonWindup;
    setAct(h, h.role === 'gunner' ? 'aim' : 'light');
    if (h.attackT >= wind) {
      if (h.role === 'gunner') fireEmp(sim, h);
      else swingBaton(sim, h);
      h.attackT = -1;
      h.attackCd = h.role === 'gunner' ? C.gunnerCooldown : C.batonCooldown;
    }
    return;
  }
  if (target) {
    h.lastKnown = { x: target.x, y: target.y };
    const d = dist(target, h);
    if (
      h.role === 'gunner' &&
      d <= C.gunnerRange &&
      h.attackCd <= 0 &&
      sim.grid.los(h.x, h.y, target.x, target.y)
    ) {
      h.attackT = 0;
      h.aimTarget = target.idx;
      h.facing = angleOf(target.x - h.x, target.y - h.y);
      sim.emit({ t: 'sfx', cue: 'emp_charge', x: h.x, y: h.y });
      return;
    }
    if (h.role !== 'gunner' && d <= C.batonRange && h.attackCd <= 0) {
      h.attackT = 0;
      h.aimTarget = target.idx;
      bark(sim, h, h.role === 'guard' ? 'guard' : 'recycler');
      return;
    }
    // Close in (gunners keep a little distance).
    const want = h.role === 'gunner' ? 5 : 0.9;
    if (d > want) {
      if (h.path.length === 0 || h.pathI >= h.path.length || !h.target || dist(h.target, target) > 1.5)
        goTo(sim, h, target);
      walk(sim, h, dt, h.role === 'gunner' ? 2.4 : 3.4);
      setAct(h, 'brisk');
    } else {
      steer(h, 0, 0, dt);
      h.facing = angleOf(target.x - h.x, target.y - h.y);
      setAct(h, 'aim');
    }
    return;
  }
  // Holding a post: back to it, facing out.
  if (h.post) {
    if (dist(h, h.post) > 0.4) {
      if (h.path.length === 0 || h.pathI >= h.path.length || !h.target || dist(h.target, h.post) > 0.3)
        goTo(sim, h, h.post);
      walk(sim, h, dt, 2.2);
      setAct(h, 'walk');
    } else {
      steer(h, 0, 0, dt);
      h.facing = Math.PI / 2 + Math.sin(sim.time * 0.7 + h.idx) * 0.6;
      setAct(h, 'idle');
    }
    return;
  }
  // Searching: sweep around the last known position.
  const lk = h.lastKnown ?? sim.alert.lastKnown;
  if (!lk) {
    steer(h, 0, 0, dt);
    setAct(h, 'idle');
    return;
  }
  if (h.path.length === 0 || h.pathI >= h.path.length) {
    h.modeT += dt;
    if (h.modeT > 2.5 || !h.target) {
      h.modeT = 0;
      const p = sim.grid.nearestWalkable(lk.x + sim.rng.range(-6, 6), lk.y + sim.rng.range(-5, 5)) ?? lk;
      goTo(sim, h, p);
    } else {
      steer(h, 0, 0, dt);
      h.facing += dt * 1.6;
      setAct(h, 'scan');
      return;
    }
  }
  walk(sim, h, dt, sim.alert.searching ? 1.4 : 2.6);
  setAct(h, sim.alert.searching ? 'walk' : 'brisk');
}

function swingBaton(sim: StopSim, h: NpcActor): void {
  const C = TUNING.combat;
  sim.emit({ t: 'sfx', cue: 'baton_swing', x: h.x, y: h.y });
  for (const m of sim.members) {
    if (!sim.present(m) || m.mode === 'carried' || m.mode === 'shutdown' || m.mode === 'down') continue;
    const d = dist(m, h);
    if (d > C.batonRange + 0.2) continue;
    const ang = Math.abs(
      Math.atan2(
        Math.sin(angleOf(m.x - h.x, m.y - h.y) - h.facing),
        Math.cos(angleOf(m.x - h.x, m.y - h.y) - h.facing),
      ),
    );
    if (ang > Math.PI / 2.2) continue;
    if (m.invuln > 0) continue;
    damageMember(sim, m, { hull: C.batonHull, skin: C.batonSkin, health: 15 }, h);
  }
}

function fireEmp(sim: StopSim, h: NpcActor): void {
  const C = TUNING.combat;
  const m = sim.members[h.aimTarget];
  const tx = m ? m.x : h.x + Math.cos(h.facing) * C.gunnerRange;
  const ty = m ? m.y : h.y + Math.sin(h.facing) * C.gunnerRange;
  sim.emit({ t: 'emp', x: h.x, y: h.y, tx, ty });
  sim.emit({ t: 'sfx', cue: 'emp_shot', x: h.x, y: h.y });
  if (!m || m.invuln > 0 || !sim.present(m)) return;
  // The shot follows the targeting line drawn during the aim; dashing out of it dodges.
  const lx = tx - h.x;
  const ly = ty - h.y;
  const len = Math.hypot(lx, ly) || 1;
  const along = ((m.x - h.x) * lx + (m.y - h.y) * ly) / len;
  const off = Math.abs(((m.x - h.x) * ly - (m.y - h.y) * lx) / len);
  if (along < 0 || along > C.gunnerRange || off > 0.6 || !sim.grid.los(h.x, h.y, m.x, m.y)) return;
  damageMember(sim, m, { hull: C.empHull, battery: C.empBattery, health: 10 }, h);
  if (m.state.kind === 'android') {
    m.state.integrity = Math.max(0, m.state.integrity + TUNING.integrity.emp);
    if (sim.present(m) && m.mode !== 'shutdown') glitch(sim, m, 0.5);
  }
}

/** Damage a party member (hits from batons, EMP, the bust crash). */
export function damageMember(
  sim: StopSim,
  m: MemberActor,
  dmg: { hull?: number; skin?: number; battery?: number; health?: number },
  from: { x: number; y: number } | null,
): void {
  m.hitFlash = 0.12;
  if (from) {
    const a = angleOf(m.x - from.x, m.y - from.y);
    m.vx += Math.cos(a) * TUNING.combat.knockback;
    m.vy += Math.sin(a) * TUNING.combat.knockback;
  }
  if (m.plug) unplug(sim, m);
  if (
    m.mode === 'blend' ||
    m.mode === 'chat' ||
    m.mode === 'search' ||
    m.mode === 'channel' ||
    m.mode === 'hack'
  ) {
    m.blend = null;
    m.channel = null;
    m.hack = null;
    setMode(m, 'free');
  }
  m.activity = 'flinch';
  m.activityT = 0;
  sim.emit({ t: 'hit', x: m.x, y: m.y, heavy: false, spark: m.state.kind === 'android' });
  sim.emit({ t: 'hitpause', frames: TUNING.combat.hitPauseFrames });
  sim.emit({ t: 'shake', amount: 2 });
  sim.emit({ t: 'sfx', cue: 'hit_heavy', x: m.x, y: m.y });
  if (m.controller !== null) sim.emit({ t: 'rumble', slot: m.controller, kind: 'hit' });
  if (m.state.kind === 'android') {
    const s = m.state;
    s.hull = Math.max(0, s.hull - (dmg.hull ?? 0));
    s.skin = Math.max(0, s.skin - (dmg.skin ?? 0));
    s.battery = Math.max(0, s.battery - (dmg.battery ?? 0));
    if (s.hull <= 0) shutdownMember(sim, m);
  } else {
    const s = m.state;
    s.health = Math.max(0, s.health - (dmg.health ?? 0));
    if (s.health <= 0) {
      setMode(m, 'down');
      m.downT = 0;
      m.vx = m.vy = 0;
    }
  }
}

export function shutdownMember(sim: StopSim, m: MemberActor): void {
  if (m.state.kind !== 'android') return;
  if (m.carrying >= 0) {
    const c = sim.members[m.carrying];
    if (c) {
      c.mode = 'shutdown';
      c.carriedBy = -1;
      c.x = m.x;
      c.y = m.y;
    }
    m.carrying = -1;
  }
  if (m.plug) unplug(sim, m);
  m.state.status = 'shutdown';
  m.blend = null;
  m.channel = null;
  m.scan = null;
  setMode(m, 'shutdown');
  m.downT = 0;
  m.vx = m.vy = 0;
  sim.emit({ t: 'shutdown', member: m.idx });
  sim.emit({ t: 'sfx', cue: 'shutdown', x: m.x, y: m.y });
  sim.emit({ t: 'hit', x: m.x, y: m.y, heavy: true, spark: true });
}

// -------------------------------------------------------------------------------------------------
// Tick
// -------------------------------------------------------------------------------------------------

export function updateHostiles(sim: StopSim, dt: number): void {
  updateCameras(sim);
  updatePatrol(sim);
  updateDrones(sim, dt);
  updateAlertForces(sim);
  if (sim.sweep.active) sim.sweep.t += dt;
  for (const n of sim.npcs) {
    if (n.mode === 'gone' || n.mode === 'ko') continue;
    if (!n.hostile) continue;
    if (n.mode === 'sweep' && !sim.alert.on) {
      sweepRecycler(sim, n, dt);
      continue;
    }
    if (sim.alert.on) {
      if (n.mode !== 'hunt') {
        n.mode = 'hunt';
        n.modeT = 0;
        n.path = [];
        n.blindT = 0;
      }
      hostileAi(sim, n, dt);
      continue;
    }
    if (n.fromVan && n.mode === 'hunt') {
      hostileAi(sim, n, dt);
      continue;
    }
    // Local guards follow their routine (npc.ts) until ALERT.
    if (n.mode === 'hunt') startRoutine(sim, n);
  }
  // Scans in progress on AI members resolve themselves.
  for (const m of sim.members) {
    if (m.mode === 'scanned' && m.controller === null) aiBreathe(sim, m);
  }
}
