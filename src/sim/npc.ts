/**
 * NPCs (spec §10.6): spawning from layout rules, simple state-machine routines over layout waypoints that
 * create the distraction windows stealth play is built on, and civilian reactions (glance, watch, report,
 * flee, hide). Hostile behavior during ALERT lives in hostiles.ts.
 */
import { TUNING } from '../content/tuning';
import { angleOf, dist } from '../core/math';
import type { ObserverKind } from '../core/types';
import type { Point } from './grid';
import { F } from './grid';
import type { NpcRole } from './layout';
import { followPath, steer } from './movement';
import { npcFacing, setNpcState } from './perception';
import type { StopSim } from './stop';
import type { Activity, CustomerSpot, NpcActor } from './types';

const WALK = 1.25;

export function observerKind(role: NpcRole): ObserverKind {
  switch (role) {
    case 'customer':
      return 'civilian';
    case 'guard':
      return 'guard';
    case 'recycler':
    case 'gunner':
      return 'recycler';
    default:
      return 'staff';
  }
}

export function newNpc(sim: StopSim, role: NpcRole, x: number, y: number): NpcActor {
  const kind = observerKind(role);
  const O = TUNING.observers;
  const spec =
    kind === 'civilian'
      ? O.civilian
      : kind === 'guard'
        ? O.guard
        : kind === 'recycler'
          ? O.recycler
          : O.staff;
  const hostile = kind === 'guard' || kind === 'recycler';
  let symp = 0;
  if (!hostile && role !== 'keeper' && role !== 'crew' && role !== 'mensah') {
    symp = role === 'dockworker' ? O.dockSympathizerChance : O.sympathizerChance;
    if (sim.mods.has('sympatheticStaff') && kind === 'staff') symp = Math.max(symp, 0.45);
  }
  const C = TUNING.combat;
  const hp =
    role === 'recycler'
      ? C.recyclerHp
      : role === 'gunner'
        ? C.gunnerHp
        : role === 'guard'
          ? C.guardHp
          : C.civilianHp;
  return {
    kind: 'npc',
    idx: sim.npcs.length,
    role,
    x,
    y,
    px: x,
    py: y,
    vx: 0,
    vy: 0,
    facing: Math.PI / 2,
    dir: 2,
    radius: TUNING.movement.actorRadius,
    obs: {
      id: `npc${sim.npcs.length}`,
      kind,
      sympathizer: sim.rng.chance(symp),
      coneDeg: spec.coneDeg,
      range: spec.range,
      hearing: spec.hearing,
      awareness: {},
      state: 'unaware',
    },
    hostile,
    hp,
    maxHp: hp,
    mode: 'routine',
    modeT: 0,
    activity: 'idle',
    activityT: 0,
    gait: 0,
    speed01: 0,
    lookSeed: sim.rng.int(0, 1_000_000),
    routine: role,
    step: 0,
    stepT: 0,
    path: [],
    pathI: 0,
    target: null,
    faceTo: null,
    slot: -1,
    blindT: 0,
    ignoreT: 0,
    helped: false,
    lookAt: null,
    lookT: 0,
    barkCd: sim.rng.range(0, 4),
    speech: null,
    speechT: 0,
    lastKnown: null,
    attackT: -1,
    attackCd: 0,
    aimTarget: -1,
    hitFlash: 0,
    stunT: 0,
    found: false,
    fromVan: false,
    scanTarget: -1,
    post: null,
  };
}

// -------------------------------------------------------------------------------------------------
// Spawning
// -------------------------------------------------------------------------------------------------

function customerSpots(sim: StopSim): CustomerSpot[] {
  const out: CustomerSpot[] = [];
  const g = sim.grid;
  for (const c of sim.containers) {
    if (c.kind === 'shelf' || c.kind === 'store' || c.kind === 'partsAisle')
      out.push({ p: c.access, face: { x: c.cx, y: c.cy }, kind: 'shelf', taken: -1 });
  }
  for (const b of sim.bays) {
    if (b.forCar) continue;
    const p = g.nearestWalkable(b.x, b.y + 1) ?? { x: b.x, y: b.y + 1 };
    out.push({ p, face: { x: b.x, y: b.y }, kind: 'bay', taken: -1 });
  }
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const ch = g.charAt(x, y);
      if (g.has(x, y, F.SEAT)) {
        // Sit "at" the seat from an adjacent walkable tile (rendered seated on it).
        for (const [dx, dy] of [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0],
        ]) {
          if (g.walkable(x + dx, y + dy)) {
            out.push({
              p: { x: x + dx + 0.5, y: y + dy + 0.5 },
              face: { x: x + 0.5, y: y + 0.5 },
              kind: 'seat',
              taken: -1,
            });
            break;
          }
        }
      } else if (ch === 'g') {
        const p = g.nearestWalkable(x + 0.5, y + 1.5);
        if (p) out.push({ p, face: { x: x + 0.5, y: y + 0.5 }, kind: 'pump', taken: -1 });
      }
    }
  }
  return out;
}

export function spawnNpcs(sim: StopSim): void {
  const spots = customerSpots(sim);
  sim.spots.push(...spots);
  for (const def of sim.cfg.layout.npcs) {
    if (def.chance !== undefined && !sim.rng.chance(def.chance)) continue;
    const [a, b] = def.count ?? [1, 1];
    let n = sim.rng.int(a, b);
    if (def.role === 'customer' && sim.mods.has('crowded')) n++;
    for (let i = 0; i < n; i++) {
      let p: Point | undefined = def.at ? sim.layout.waypoints.get(def.at) : undefined;
      if (def.role === 'customer') {
        const free = spots.filter((s) => s.taken < 0);
        if (free.length > 0) {
          const s = sim.rng.pick(free);
          p = s.p;
        }
      }
      p ??= sim.layout.waypoints.get('enter') ?? sim.exitTiles[0];
      const npc = newNpc(sim, def.role, p.x, p.y);
      if (def.route) npc.routine = `${def.role}:${def.route}`;
      sim.npcs.push(npc);
      startRoutine(sim, npc, true);
    }
  }
  if (sim.mods.has('extraGuard') && sim.layout.waypoints.has('booth')) {
    const p = sim.layout.waypoints.get('booth')!;
    const g = newNpc(sim, 'guard', p.x, p.y);
    sim.npcs.push(g);
    startRoutine(sim, g, true);
  }
}

function spotsOf(sim: StopSim): CustomerSpot[] {
  return sim.spots;
}

// -------------------------------------------------------------------------------------------------
// Movement helpers
// -------------------------------------------------------------------------------------------------

export function goTo(sim: StopSim, n: NpcActor, p: Point, avoidStaff = false): boolean {
  // At the Port, hostiles stop at the foot of the gangway: Mensah's crew won't let them up.
  if (n.hostile && sim.port) {
    const ch = sim.grid.charAt(Math.floor(p.x), Math.floor(p.y));
    if (ch === '=' || ch === 'v') p = sim.layout.waypoints.get('gangwayFoot') ?? p;
  }
  const avoid = avoidStaff ? (tx: number, ty: number) => (sim.grid.has(tx, ty, F.STAFF) ? 20 : 0) : undefined;
  const raw = sim.grid.path(n.x, n.y, p.x, p.y, avoid);
  n.target = p;
  if (!raw) {
    n.path = [];
    n.pathI = 0;
    return false;
  }
  if (raw.length > 0) raw[raw.length - 1] = { x: p.x, y: p.y };
  n.path = sim.grid.smooth({ x: n.x, y: n.y }, raw, n.radius);
  n.pathI = 0;
  return true;
}

export function walk(sim: StopSim, n: NpcActor, dt: number, speed = WALK): boolean {
  if (n.stunT > 0) {
    steer(n, 0, 0, dt, 6);
    return false;
  }
  const done = followPath(n, speed, dt, sim.time, 0.6, n.lookSeed % 97);
  return done;
}

function face(n: NpcActor, p: Point | null): void {
  if (!p) return;
  n.facing = angleOf(p.x - n.x, p.y - n.y);
  n.dir = Math.round(n.facing / (Math.PI / 4)) & 7;
}

function setActivity(n: NpcActor, a: Activity): void {
  if (n.activity !== a) {
    n.activity = a;
    n.activityT = 0;
  }
}

// -------------------------------------------------------------------------------------------------
// Routines
// -------------------------------------------------------------------------------------------------

function point(sim: StopSim, name: string): Point | undefined {
  return sim.layout.waypoints.get(name);
}

function routeOf(sim: StopSim, n: NpcActor): Point[] {
  const name = n.routine.includes(':') ? n.routine.split(':')[1] : '';
  const names = sim.cfg.layout.routes?.[name] ?? [];
  return names.map((k) => sim.layout.waypoints.get(k)).filter((p): p is Point => !!p);
}

/** (Re)start a role's routine. `initial` places NPCs mid-routine at the start of a stop. */
export function startRoutine(sim: StopSim, n: NpcActor, initial = false): void {
  n.mode = 'routine';
  n.modeT = 0;
  n.step = 0;
  n.stepT = 0;
  n.path = [];
  n.pathI = 0;
  switch (n.role) {
    case 'customer': {
      const spots = spotsOf(sim);
      const here = spots.find((s) => s.taken < 0 && dist(s.p, n) < 0.6);
      if (initial && here) {
        here.taken = n.idx;
        n.slot = spots.indexOf(here);
        n.step = 1;
        n.stepT = sim.rng.range(15, 70);
        n.faceTo = here.face;
      } else pickCustomerSpot(sim, n);
      break;
    }
    default:
      n.step = 0;
      n.stepT = initial ? sim.rng.range(0, 30) : 0;
  }
}

function pickCustomerSpot(sim: StopSim, n: NpcActor): void {
  const spots = spotsOf(sim);
  const prefer = sim.kind === 'diner' ? 'seat' : sim.kind === 'gas' ? 'pump' : null;
  let free = spots.filter((s) => s.taken < 0 && (!prefer || s.kind === prefer || sim.rng.chance(0.4)));
  if (free.length === 0) free = spots.filter((s) => s.taken < 0);
  if (free.length === 0) {
    n.step = 3;
    return;
  }
  const s = sim.rng.pick(free);
  s.taken = n.idx;
  n.slot = spots.indexOf(s);
  n.faceTo = s.face;
  goTo(sim, n, s.p, true);
  n.step = 0;
}

function releaseSpot(sim: StopSim, n: NpcActor): void {
  const s = spotsOf(sim)[n.slot];
  if (s && s.taken === n.idx) s.taken = -1;
  n.slot = -1;
}

const IDLE_VARIETY: Activity[] = ['idle', 'phone', 'idle', 'stretch', 'watch', 'idle', 'scratch', 'phone'];

function idleVariety(sim: StopSim, n: NpcActor, base: Activity = 'idle'): void {
  if (n.activityT > 6 + (n.lookSeed % 5)) {
    const a = sim.rng.chance(0.55) ? base : sim.rng.pick(IDLE_VARIETY);
    n.activity = a;
    n.activityT = 0;
    // Phone checks blind the person for a moment.
    if (a === 'phone') n.blindT = Math.max(n.blindT, 2.5);
  }
}

function customer(sim: StopSim, n: NpcActor, dt: number): void {
  const spots = spotsOf(sim);
  const s = spots[n.slot];
  switch (n.step) {
    case 0: // walking to a spot
      if (walk(sim, n, dt)) {
        n.step = 1;
        n.stepT =
          s?.kind === 'seat'
            ? sim.rng.range(50, 140)
            : s?.kind === 'bay'
              ? sim.rng.range(40, 90)
              : s?.kind === 'pump'
                ? sim.rng.range(30, 60)
                : sim.rng.range(6, 14);
        face(n, n.faceTo);
      } else setActivity(n, 'walk');
      break;
    case 1: {
      // at the spot
      steer(n, 0, 0, dt);
      face(n, n.faceTo);
      const base: Activity =
        s?.kind === 'seat' ? 'sit' : s?.kind === 'pump' ? 'pump' : s?.kind === 'shelf' ? 'browse' : 'idle';
      if (s?.kind === 'seat') setActivity(n, 'sit');
      else idleVariety(sim, n, base);
      n.stepT -= dt;
      if (n.stepT <= 0) {
        releaseSpot(sim, n);
        // Shoppers sometimes browse another shelf, then pay.
        if (s?.kind === 'shelf' && sim.rng.chance(0.4)) pickCustomerSpot(sim, n);
        else {
          const q = point(sim, 'queue');
          if (q && sim.kind !== 'test' && sim.rng.chance(s?.kind === 'bay' ? 0.3 : 0.85)) {
            goTo(sim, n, q, true);
            n.step = 2;
          } else n.step = 3;
          n.stepT = 0;
        }
      }
      break;
    }
    case 2: // paying
      if (n.pathI < n.path.length) {
        walk(sim, n, dt);
        setActivity(n, 'walk');
      } else {
        steer(n, 0, 0, dt);
        setActivity(n, 'idle');
        n.faceTo = point(sim, 'register') ?? null;
        face(n, n.faceTo);
        n.stepT += dt;
        if (n.stepT > 4) {
          n.step = 3;
          n.stepT = 0;
        }
      }
      break;
    case 3: {
      // leaving
      if (n.path.length === 0 || n.pathI >= n.path.length) {
        const e = point(sim, 'enter');
        if (!e || dist(e, n) < 0.8) {
          n.mode = 'gone';
          scheduleRespawn(sim);
          return;
        }
        goTo(sim, n, e, true);
      }
      walk(sim, n, dt);
      setActivity(n, 'walk');
      break;
    }
  }
}

function scheduleRespawn(sim: StopSim): void {
  sim.respawnAt.push(sim.time + sim.rng.range(8, 22));
}

function respawns(sim: StopSim): void {
  const st = sim;
  if (st.respawnAt.length === 0 || sim.alert.on) return;
  const def = sim.cfg.layout.npcs.find((d) => d.role === 'customer');
  if (!def) return;
  const max = (def.count ?? [1, 1])[1];
  const alive = sim.npcs.filter((n) => n.role === 'customer' && n.mode !== 'gone' && n.mode !== 'ko').length;
  for (let i = st.respawnAt.length - 1; i >= 0; i--) {
    if (sim.time < st.respawnAt[i]) continue;
    st.respawnAt.splice(i, 1);
    if (alive >= max) continue;
    const e = point(sim, 'enter');
    if (!e) continue;
    const n = newNpc(sim, 'customer', e.x, e.y);
    sim.npcs.push(n);
    startRoutine(sim, n);
  }
}

/** Seconds between the clerk's smoke breaks (varies per clerk). */
function smokeEvery(n: NpcActor): number {
  const N = TUNING.npc;
  return N.smokeEvery + ((n.lookSeed % (N.smokeJitter * 2 + 1)) - N.smokeJitter);
}

function clerk(sim: StopSim, n: NpcActor, dt: number): void {
  const post = point(sim, 'register');
  const smoke = point(sim, 'smoke');
  switch (n.step) {
    case 0: // at the register
      if (post && dist(post, n) > 0.4) {
        if (n.path.length === 0 || n.pathI >= n.path.length) goTo(sim, n, post);
        walk(sim, n, dt);
        setActivity(n, 'walk');
        break;
      }
      steer(n, 0, 0, dt);
      n.faceTo = point(sim, 'queue') ?? null;
      face(n, n.faceTo);
      idleVariety(sim, n, 'idle');
      n.stepT += dt;
      // A smoke break about every 60 s leaves the register and back office unwatched for ~15 s.
      if (smoke && n.stepT > smokeEvery(n)) {
        n.step = 1;
        n.stepT = 0;
        goTo(sim, n, smoke);
      }
      break;
    case 1: // walking out
      if (walk(sim, n, dt)) {
        n.step = 2;
        n.stepT = 0;
      } else setActivity(n, 'walk');
      break;
    case 2: {
      // smoking, facing away from the store
      steer(n, 0, 0, dt);
      const away = point(sim, 'smokeFace');
      if (away) face(n, away);
      else n.facing = Math.PI / 2;
      setActivity(n, 'smoke');
      n.stepT += dt;
      if (n.stepT > TUNING.npc.smokeSeconds) {
        n.step = 0;
        n.stepT = 0;
        if (post) goTo(sim, n, post);
      }
      break;
    }
  }
}

function guard(sim: StopSim, n: NpcActor, dt: number): void {
  const route = routeOf(sim, n);
  if (route.length === 0) {
    steer(n, 0, 0, dt);
    idleVariety(sim, n);
    return;
  }
  switch (n.step) {
    case 0:
      if (n.path.length === 0 || n.pathI >= n.path.length)
        goTo(sim, n, route[n.slot < 0 ? 0 : n.slot % route.length]);
      if (walk(sim, n, dt, 1.1)) {
        n.step = 1;
        n.stepT = sim.rng.range(2, 5);
        // Sometimes he stops to check his phone: his cone is off for 6–10 s.
        if (sim.rng.chance(TUNING.npc.guardPhoneChance)) {
          n.stepT = sim.rng.range(TUNING.npc.guardPhoneSeconds[0], TUNING.npc.guardPhoneSeconds[1]);
          n.blindT = n.stepT;
          n.activity = 'phone';
          n.activityT = 0;
        }
      } else setActivity(n, 'walk');
      break;
    case 1:
      steer(n, 0, 0, dt);
      if (n.blindT <= 0) {
        setActivity(n, 'idle');
        n.facing += Math.sin(sim.time * 0.8 + n.lookSeed) * 0.02;
      }
      n.stepT -= dt;
      if (n.stepT <= 0) {
        n.slot = (n.slot < 0 ? 0 : n.slot) + 1;
        n.step = 0;
        n.path = [];
      }
      break;
  }
}

function stationary(
  sim: StopSim,
  n: NpcActor,
  dt: number,
  at: string,
  faceName: string,
  act: Activity,
  breakPoint?: string,
): void {
  const p = point(sim, at);
  const brk = breakPoint ? point(sim, breakPoint) : undefined;
  switch (n.step) {
    case 0:
      if (p && dist(p, n) > 0.4) {
        if (n.path.length === 0 || n.pathI >= n.path.length) goTo(sim, n, p);
        walk(sim, n, dt);
        setActivity(n, 'walk');
        break;
      }
      steer(n, 0, 0, dt);
      face(n, point(sim, faceName) ?? null);
      setActivity(n, act);
      n.stepT += dt;
      if (brk && n.stepT > 70 + (n.lookSeed % 25)) {
        n.step = 1;
        n.stepT = 0;
        goTo(sim, n, brk);
      }
      break;
    case 1:
      if (walk(sim, n, dt)) {
        n.step = 2;
        n.stepT = 0;
      } else setActivity(n, 'walk');
      break;
    case 2:
      steer(n, 0, 0, dt);
      setActivity(n, 'smoke');
      n.stepT += dt;
      if (n.stepT > 12) {
        n.step = 0;
        n.stepT = 0;
        if (p) goTo(sim, n, p);
      }
      break;
  }
}

function waitress(sim: StopSim, n: NpcActor, dt: number): void {
  const counter = point(sim, 'counter');
  switch (n.step) {
    case 0: {
      // lean on the counter, watching the room
      if (counter && dist(counter, n) > 0.4) {
        if (n.path.length === 0 || n.pathI >= n.path.length) goTo(sim, n, counter);
        walk(sim, n, dt);
        setActivity(n, 'walk');
        break;
      }
      steer(n, 0, 0, dt);
      face(n, point(sim, 'room') ?? null);
      setActivity(n, 'lean');
      n.stepT += dt;
      if (n.stepT > 8 + (n.lookSeed % 8)) {
        // take an order, deliver food, or refill coffee at an occupied seat
        const seated = sim.npcs.filter(
          (o) => o.role === 'customer' && o.activity === 'sit' && o.mode === 'routine',
        );
        if (seated.length > 0) {
          const o = sim.rng.pick(seated);
          goTo(sim, n, sim.grid.nearestWalkable(o.x + 0.8, o.y) ?? { x: o.x, y: o.y }, false);
          n.target = { x: o.x, y: o.y };
          n.step = 1;
        } else {
          const pass = point(sim, 'pass');
          if (pass) goTo(sim, n, pass);
          n.step = 1;
        }
        n.stepT = 0;
      }
      break;
    }
    case 1:
      if (walk(sim, n, dt)) {
        n.step = 2;
        n.stepT = 0;
      } else setActivity(n, 'walk');
      break;
    case 2:
      steer(n, 0, 0, dt);
      setActivity(n, 'talk');
      n.stepT += dt;
      if (n.stepT > 4) {
        n.step = 0;
        n.stepT = 0;
        if (counter) goTo(sim, n, counter);
      }
      break;
  }
}

function dockworker(sim: StopSim, n: NpcActor, dt: number): void {
  const route = routeOf(sim, n);
  const pts = route.length > 0 ? route : [...sim.layout.waypoints.values()];
  switch (n.step) {
    case 0:
      if (n.path.length === 0 || n.pathI >= n.path.length) goTo(sim, n, sim.rng.pick(pts));
      if (walk(sim, n, dt, 1.15)) {
        n.step = 1;
        n.stepT = sim.rng.range(4, 14);
      } else setActivity(n, 'walk');
      break;
    case 1:
      steer(n, 0, 0, dt);
      idleVariety(sim, n, sim.rng.chance(0.3) ? 'point' : 'idle');
      n.stepT -= dt;
      if (n.stepT <= 0) {
        n.step = 0;
        n.path = [];
      }
      break;
  }
}

function keeper(sim: StopSim, n: NpcActor, dt: number): void {
  steer(n, 0, 0, dt);
  const p = sim.members.find((m) => sim.present(m));
  if (p && dist(p, n) < 6) face(n, p);
  idleVariety(sim, n, 'idle');
}

function routine(sim: StopSim, n: NpcActor, dt: number): void {
  switch (n.role) {
    case 'customer':
      customer(sim, n, dt);
      break;
    case 'clerk':
      clerk(sim, n, dt);
      break;
    case 'guard':
      guard(sim, n, dt);
      break;
    case 'recycler':
    case 'gunner':
      // Recyclers posted at a compromised Station walk a beat around the house like guards.
      if (routeOf(sim, n).length > 0) guard(sim, n, dt);
      else steer(n, 0, 0, dt);
      break;
    case 'mechanic':
      stationary(sim, n, dt, 'bench', 'benchFace', 'search');
      break;
    case 'cook':
      stationary(sim, n, dt, 'grill', 'grillFace', 'search', 'back');
      break;
    case 'waitress':
      waitress(sim, n, dt);
      break;
    case 'dockworker':
      dockworker(sim, n, dt);
      break;
    case 'keeper':
    case 'mensah':
    case 'crew':
      keeper(sim, n, dt);
      break;
    default:
      steer(n, 0, 0, dt);
  }
}

// -------------------------------------------------------------------------------------------------
// Reactions (non-hostile)
// -------------------------------------------------------------------------------------------------

function mostAware(sim: StopSim, n: NpcActor): { m: (typeof sim.members)[number]; a: number } | null {
  let best: (typeof sim.members)[number] | null = null;
  let a = 0;
  for (const m of sim.members) {
    const v = n.obs.awareness[m.id] ?? 0;
    if (v > a && sim.present(m)) {
      a = v;
      best = m;
    }
  }
  return best ? { m: best, a } : null;
}

export function updateNpcs(sim: StopSim, dt: number): void {
  respawns(sim);
  for (const n of sim.npcs) {
    if (n.mode === 'gone') continue;
    n.modeT += dt;
    n.activityT += dt;
    if (n.blindT > 0) n.blindT -= dt;
    if (n.ignoreT > 0) n.ignoreT -= dt;
    if (n.lookT > 0) n.lookT -= dt;
    if (n.stunT > 0) n.stunT -= dt;
    if (n.hitFlash > 0) n.hitFlash -= dt;
    if (n.speechT > 0) {
      n.speechT -= dt;
      if (n.speechT <= 0) n.speech = null;
    }
    n.speed01 = Math.min(1, Math.hypot(n.vx, n.vy) / TUNING.movement.briskSpeed);
    if (n.mode === 'ko') {
      steer(n, 0, 0, dt, 8);
      setActivity(n, 'down');
      continue;
    }
    if (n.hostile && (sim.alert.on || n.mode === 'sweep' || n.fromVan)) continue; // hostiles.ts
    reactCivilian(sim, n, dt);
  }
}

function reactCivilian(sim: StopSim, n: NpcActor, dt: number): void {
  const st = n.obs.state;
  // ALERT: civilians flee or hide; staff hide. Searching calms them down.
  if (sim.alert.on && !n.hostile && n.role !== 'keeper' && n.role !== 'crew' && n.role !== 'mensah') {
    if (n.mode !== 'flee' && n.mode !== 'hide' && n.mode !== 'report' && !sim.alert.searching) {
      if (n.role === 'customer' && sim.rng.chance(0.55)) {
        n.mode = 'flee';
        releaseSpot(sim, n);
        const e = point(sim, 'enter');
        if (e) goTo(sim, n, e);
      } else {
        n.mode = 'hide';
        n.modeT = 0;
      }
    }
    if (sim.alert.searching && n.mode === 'hide' && n.modeT > 4) {
      startRoutine(sim, n);
      return;
    }
  }
  switch (n.mode) {
    case 'flee':
    case 'report': {
      if (walk(sim, n, dt, 3.6)) {
        if (n.role === 'customer') {
          n.mode = 'gone';
          return;
        }
        n.mode = 'hide';
        n.modeT = 0;
      }
      setActivity(n, Math.hypot(n.vx, n.vy) > 2 ? 'sprint' : 'walk');
      return;
    }
    case 'hide':
      steer(n, 0, 0, dt);
      setActivity(n, 'cower');
      return;
    case 'help':
      steer(n, 0, 0, dt);
      if (n.modeT < 1.2) setActivity(n, n.activity === 'point' ? 'point' : 'idle');
      else {
        n.mode = 'routine';
        n.modeT = 0;
      }
      return;
    default:
      break;
  }
  if (st === 'alarmed' && !n.obs.sympathizer && n.role !== 'keeper') {
    // "I'm calling the hotline!" — run to report it.
    n.mode = 'report';
    n.modeT = 0;
    releaseSpot(sim, n);
    const dest =
      n.role === 'customer' ? point(sim, 'enter') : (point(sim, 'office') ?? point(sim, 'register'));
    if (dest) goTo(sim, n, dest);
    return;
  }
  if (st === 'suspicious' && n.ignoreT <= 0 && n.blindT <= 0) {
    // Stop the routine and watch; maybe walk closer.
    const t = mostAware(sim, n);
    if (t) {
      if (n.mode !== 'watch') {
        n.mode = 'watch';
        n.modeT = 0;
        n.path = [];
      }
      const d = dist(t.m, n);
      n.lookAt = { x: t.m.x, y: t.m.y };
      n.lookT = 0.5;
      if (d > 4 && n.modeT > 1.5 && n.role !== 'clerk' && !n.post) {
        if (n.path.length === 0 || n.pathI >= n.path.length)
          goTo(sim, n, sim.grid.nearestWalkable(t.m.x, t.m.y) ?? t.m);
        walk(sim, n, dt, 0.9);
        setActivity(n, 'walk');
      } else {
        steer(n, 0, 0, dt);
        n.facing = angleOf(t.m.x - n.x, t.m.y - n.y);
        setActivity(n, 'idle');
      }
      return;
    }
  }
  if (n.mode === 'watch') {
    startRoutine(sim, n);
    return;
  }
  // Curious: glance now and then.
  if (
    st === 'curious' &&
    n.lookT <= 0 &&
    n.blindT <= 0 &&
    sim.rng.chance(dt / TUNING.observers.glanceEvery)
  ) {
    const t = mostAware(sim, n);
    if (t) {
      n.lookAt = { x: t.m.x, y: t.m.y };
      n.lookT = 1;
    }
  }
  routine(sim, n, dt);
  void npcFacing;
  void setNpcState;
}
