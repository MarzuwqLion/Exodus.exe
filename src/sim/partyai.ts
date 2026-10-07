/**
 * Party AI (spec §10.7): members no player controls follow the nearest player at a natural distance on
 * curved, varied paths, Blend whenever they're idle, search pinged containers, head for the car during ALERT
 * or departure (carrying shut-down teammates they pass), and fight only when cornered. They never sprint unless
 * their player does, and they never trip the robotic-movement check.
 */
import { TUNING } from '../content/tuning';
import { angleOf, dist } from '../core/math';
import { blendsFor, findInteraction, startAttack, startBlend, startInteraction, updateMode } from './actions';
import { LOOPING } from './blend';
import { F, type Point } from './grid';
import { followPath, steer } from './movement';
import type { StopSim } from './stop';
import type { BlendKind, MemberActor } from './types';

export function updatePartyAi(sim: StopSim, dt: number): void {
  for (const m of sim.members) {
    if (m.controller !== null || m.mode === 'gone' || m.mode === 'inCar') continue;
    aiControl(sim, m, dt);
    updateMode(sim, m, dt, true);
  }
}

function leaderOf(sim: StopSim, m: MemberActor): MemberActor | null {
  let best: MemberActor | null = null;
  let bd = Infinity;
  for (const o of sim.members) {
    if (o === m || o.controller === null || !sim.present(o)) continue;
    const d = dist(o, m);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}

function pathTo(sim: StopSim, m: MemberActor, p: Point): void {
  const avoid = (tx: number, ty: number): number => (sim.grid.has(tx, ty, F.STAFF) ? 30 : 0);
  const raw = sim.grid.path(m.x, m.y, p.x, p.y, avoid);
  if (!raw) {
    m.path = [];
    m.pathI = 0;
    return;
  }
  if (raw.length > 0) raw[raw.length - 1] = { x: p.x, y: p.y };
  m.path = sim.grid.smooth({ x: m.x, y: m.y }, raw, m.radius);
  m.pathI = 0;
  m.aiTarget = p;
}

function nearestExit(sim: StopSim, m: MemberActor): Point {
  const car = sim.cfg.layout.car;
  let best = sim.exitTiles[0] ?? { x: car.x + 0.5, y: car.y + 0.5 };
  let bd = Infinity;
  for (const t of sim.exitTiles) {
    // Skip tiles under the parked car, and spread out over free ones.
    if (!sim.grid.walkable(Math.floor(t.x), Math.floor(t.y))) continue;
    const taken = sim.members.some(
      (o) => o !== m && sim.present(o) && Math.hypot(o.x - t.x, o.y - t.y) < 0.5,
    );
    const d = (t.x - m.x) ** 2 + (t.y - m.y) ** 2 + (taken ? 4 : 0);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

function walkPath(sim: StopSim, m: MemberActor, speed: number, dt: number): boolean {
  return followPath(m, speed, dt, sim.time, 1, m.idx * 13 + 5);
}

function idleBlend(sim: StopSim, m: MemberActor): void {
  const list = blendsFor(sim, m);
  // Prefer something that fits the place; never order (the AI doesn't spend coffee money on its own).
  const fitting = list.filter(
    (b) => b !== 'order' && b !== 'phone' && b !== 'stretch' && b !== 'fidget' && b !== 'pump',
  );
  const generic: BlendKind[] = ['phone', 'stretch', 'fidget', 'phone'];
  const k =
    fitting.length > 0 && sim.rng.chance(0.6)
      ? sim.rng.pick(fitting)
      : generic[(Math.floor(sim.time / 5) + m.idx) % generic.length];
  startBlend(sim, m, k);
}

function aiControl(sim: StopSim, m: MemberActor, dt: number): void {
  m.aiT -= dt;
  m.sprinting = false;
  switch (m.mode) {
    case 'factory':
      factoryWalk(sim, m, dt);
      return;
    case 'free':
      break;
    case 'blend': {
      const leader = leaderOf(sim, m);
      const far = leader && dist(leader, m) > 3.6;
      const urgent = sim.exit.departing || (sim.alert.on && !sim.alert.searching);
      if ((far || urgent) && m.blend && LOOPING.has(m.blend)) {
        m.blend = null;
        m.mode = 'free';
        m.modeT = 0;
        if (m.seatedAt) {
          m.activity = 'stand';
          m.activityT = 0;
          m.seatedAt = null;
        }
      }
      steer(m, 0, 0, dt);
      return;
    }
    case 'carry': {
      const exit = nearestExit(sim, m);
      if (sim.inExit(m.x, m.y)) {
        steer(m, 0, 0, dt);
        return;
      }
      if (m.path.length === 0 || m.pathI >= m.path.length || m.aiT <= 0) {
        pathTo(sim, m, exit);
        m.aiT = 1;
      }
      walkPath(sim, m, m.id === 'brick' ? 2.2 : 1.2, dt);
      return;
    }
    default:
      steer(m, 0, 0, dt);
      return;
  }

  // ALERT or departure: head for the car.
  if (sim.exit.departing || (sim.alert.on && !sim.alert.searching)) {
    // Fight only when blocked: a hostile right on top of them.
    for (const n of sim.npcs) {
      if (!n.hostile || !sim.isActiveNpc(n)) continue;
      if (dist(n, m) < 1.1 && n.attackT >= 0 && m.state.kind === 'android') {
        startAttack(sim, m, 'light', { x: n.x - m.x, y: n.y - m.y });
        return;
      }
    }
    // Carry a shut-down teammate if passing one and nobody else is.
    if (m.carrying < 0) {
      for (const o of sim.members) {
        if (o.mode !== 'shutdown' || dist(o, m) > 3) continue;
        const someoneOn = sim.members.some((x) => x !== m && x.channel?.target === o.idx);
        if (someoneOn) continue;
        if (dist(o, m) < 1.3) {
          const it = findInteraction(sim, m);
          if (it && (it.kind === 'pickUp' || it.kind === 'revive')) {
            startInteraction(sim, m, { ...it, kind: 'pickUp', hold: 0.8 });
            return;
          }
        }
        if (m.aiT <= 0) {
          pathTo(sim, m, { x: o.x, y: o.y });
          m.aiT = 0.8;
        }
        walkPath(sim, m, 3, dt);
        return;
      }
    }
    if (sim.inExit(m.x, m.y)) {
      steer(m, 0, 0, dt);
      return;
    }
    if (m.path.length === 0 || m.pathI >= m.path.length || m.aiT <= 0) {
      pathTo(sim, m, nearestExit(sim, m));
      m.aiT = 1.2;
    }
    walkPath(sim, m, sim.alert.on ? 3.6 : 2.2, dt);
    return;
  }

  // A pinged container: go and search it.
  if (m.pingTarget >= 0) {
    const c = sim.containers[m.pingTarget];
    if (!c || c.searched || (c.locked && m.id !== 'brick')) {
      m.pingTarget = -1;
    } else if (dist(c.access, m) < 0.5) {
      steer(m, 0, 0, dt);
      const it = findInteraction(sim, m);
      if (it && (it.kind === 'search' || it.kind === 'pry')) startInteraction(sim, m, it);
      m.pingTarget = -1;
      return;
    } else {
      if (m.path.length === 0 || m.pathI >= m.path.length || m.aiT <= 0) {
        pathTo(sim, m, c.access);
        m.aiT = 1.5;
      }
      walkPath(sim, m, TUNING.movement.briskSpeed * 0.72, dt);
      return;
    }
  }

  // Follow the nearest player at a natural distance.
  const leader = leaderOf(sim, m);
  if (!leader) {
    steer(m, 0, 0, dt);
    if (m.stillT > 1) idleBlend(sim, m);
    return;
  }
  const back = 1.5;
  const side = (m.idx % 2 === 0 ? 1 : -1) * (1 + (m.idx % 3) * 0.3);
  const lf = leader.facing;
  const want = {
    x: leader.x - Math.cos(lf) * back + Math.cos(lf + Math.PI / 2) * side,
    y: leader.y - Math.sin(lf) * back + Math.sin(lf + Math.PI / 2) * side,
  };
  const target = sim.grid.walkableAt(want.x, want.y)
    ? want
    : (sim.grid.nearestWalkable(want.x, want.y) ?? { x: leader.x, y: leader.y });
  const d = dist(m, target);
  const leaderSpeed = Math.hypot(leader.vx, leader.vy);
  if (leaderSpeed > 0.3 || d > 2.6) {
    if (
      m.path.length === 0 ||
      m.pathI >= m.path.length ||
      m.aiT <= 0 ||
      (m.aiTarget && dist(m.aiTarget, target) > 1.2)
    ) {
      pathTo(sim, m, target);
      m.aiT = 0.6;
    }
    const sprint = leader.sprinting && d > 2;
    let speed = sprint
      ? TUNING.movement.sprintSpeed
      : Math.min(TUNING.movement.briskSpeed * 0.86, leaderSpeed * 1.05 + (d > 3.5 ? 0.7 : 0.15));
    if (m.lowPower) speed = Math.min(speed, TUNING.movement.briskSpeed * TUNING.movement.lowPowerSpeedMult);
    m.sprinting = sprint && !m.lowPower;
    if (m.mode === 'free' && m.carrying >= 0) speed *= m.id === 'brick' ? 1 : TUNING.movement.carrySpeedMult;
    walkPath(sim, m, speed, dt);
    return;
  }
  steer(m, 0, 0, dt);
  // Idle: face roughly the way the leader faces, and Blend before stillness becomes suspicious.
  m.facing += Math.sin(angleOf(Math.cos(leader.facing), Math.sin(leader.facing)) - m.facing) * dt;
  if (m.stillT > 0.8 || m.suspicion > 20) idleBlend(sim, m);
}

/** A factory-reset unit walks toward the nearest human to turn itself in (spec §12.6). */
function factoryWalk(sim: StopSim, m: MemberActor, dt: number): void {
  let best: Point | null = null;
  let bd = Infinity;
  for (const n of sim.npcs) {
    if (!sim.isActiveNpc(n) || n.role === 'keeper' || n.role === 'crew' || n.role === 'mensah') continue;
    const d = dist(n, m);
    if (d < bd) {
      bd = d;
      best = { x: n.x, y: n.y };
    }
  }
  if (!best || bd < 1.2) {
    steer(m, 0, 0, dt);
    return;
  }
  if (m.path.length === 0 || m.pathI >= m.path.length || m.aiT <= 0) {
    const raw = sim.grid.path(m.x, m.y, best.x, best.y);
    m.path = raw ? sim.grid.smooth({ x: m.x, y: m.y }, raw, m.radius) : [];
    m.pathI = 0;
    m.aiT = 1;
  }
  // Perfectly even, unnatural steps.
  followPath(m, 1.6, dt, sim.time, 0, 0);
}
