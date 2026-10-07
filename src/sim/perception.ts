/**
 * Perception and awareness (spec §8.1, §8.3–8.6). Every human NPC, security camera, and drone is an observer
 * with a view cone and line of sight; humans also hear. Each observer tracks awareness 0..100 per party
 * member. Suspicious behavior in view raises it, Blending and Chat lower it, and out of sight it decays.
 * A member's Suspicion is the highest awareness any non-sympathizer has of them.
 */
import { TUNING } from '../content/tuning';
import { BARKS } from '../content/barks';
import { angleDiff, angleOf } from '../core/math';
import type { ObserverState } from '../core/types';
import { chassisMult } from './behaviors';
import { F } from './grid';
import { rollLoot } from './loot';
import type { StopSim } from './stop';
import type { MemberActor, NpcActor } from './types';

const DEG = Math.PI / 180;

/** Does an observer at (x, y) facing `facing` see point (tx, ty)? */
export function inView(
  sim: StopSim,
  x: number,
  y: number,
  facing: number,
  coneDeg: number,
  range: number,
  tx: number,
  ty: number,
  los = true,
): boolean {
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.hypot(dx, dy);
  if (d > range) return false;
  if (d > 0.5 && Math.abs(angleDiff(facing, Math.atan2(dy, dx))) > (coneDeg * DEG) / 2) return false;
  return !los || sim.grid.los(x, y, tx, ty);
}

/** Effective facing for a human: the body, or a glance toward something that caught their attention. */
export function npcFacing(n: NpcActor): number {
  if (n.lookT > 0 && n.lookAt) return angleOf(n.lookAt.x - n.x, n.lookAt.y - n.y);
  return n.facing;
}

export function npcCanObserve(sim: StopSim, n: NpcActor): boolean {
  if (!sim.isActiveNpc(n)) return false;
  if (n.role === 'keeper' || n.role === 'crew' || n.role === 'mensah') return false;
  if (n.mode === 'flee' || n.mode === 'report' || n.mode === 'leave' || n.mode === 'hide') return n.hostile;
  return true;
}

function perceivable(sim: StopSim, m: MemberActor): boolean {
  return sim.present(m) && m.mode !== 'carried';
}

function blendDrop(sim: StopSim, m: MemberActor): number {
  const A = TUNING.awareness;
  if (m.mode === 'chat') return A.chatRate;
  if (m.mode !== 'blend') return 0;
  let r = A.blendRate;
  if (m.id === 'wren') r *= TUNING.blend.wrenMult;
  if (m.blend === 'sit' && m.hasCoffee && sim.kind === 'diner') r *= TUNING.blend.coffeeBoothMult;
  return r;
}

/** Awareness change for one observer looking at one member this perception tick. */
function seenDelta(
  sim: StopSim,
  m: MemberActor,
  hostile: boolean,
  civilian: boolean,
  dtP: number,
  base: number,
): number {
  const A = TUNING.awareness;
  let gain = m.rate * dtP + m.spike * chassisMult(m) + base * dtP;
  if (m.mode === 'shutdown') gain += TUNING.rates.carryUnit * dtP;
  if (civilian && sim.cfg.region === 'piedmont') gain *= A.piedmontCivilianMult;
  if (sim.alert.on && hostile) {
    gain *= A.alertSightMult;
    // Hunting: hostiles on alert recognize fugitives they can see; Searching is calmer.
    gain += (sim.alert.searching ? 18 : 60) * dtP;
  }
  const drop = blendDrop(sim, m);
  if (drop > 0) return gain - drop * dtP;
  if (gain <= 0) return -A.decaySeenNeutral * dtP;
  return gain;
}

function stateFor(a: number): ObserverState {
  const A = TUNING.awareness;
  if (a >= A.alarmed) return 'alarmed';
  if (a >= A.suspicious) return 'suspicious';
  if (a >= A.curious) return 'curious';
  return 'unaware';
}

function bark(sim: StopSim, n: NpcActor, context: string): void {
  if (n.barkCd > 0) return;
  const list = BARKS.filter((b) => b.context === context);
  if (list.length === 0) return;
  n.speech = sim.rng.pick(list).text;
  n.speechT = 2.6;
  n.barkCd = 7;
  sim.emit({ t: 'bark', actor: n.idx, npc: true, text: n.speech });
}

export function perceive(sim: StopSim, dtP: number): void {
  const A = TUNING.awareness;
  const O = TUNING.observers;
  const range = sim.currentRangeMult();
  const members = sim.members;
  const prevSusp = members.map((m) => m.suspicion);
  for (const m of members) m.seen = false;
  let hostileSaw = false;

  // Humans.
  for (const n of sim.npcs) {
    if (n.barkCd > 0) n.barkCd -= dtP;
    if (!npcCanObserve(sim, n)) continue;
    const civilian = n.obs.kind === 'civilian' || n.obs.kind === 'staff';
    const blind = n.blindT > 0 || n.ignoreT > 0;
    const facing = npcFacing(n);
    const r = n.obs.range * range;
    for (const m of members) {
      if (!perceivable(sim, m)) continue;
      let a = n.obs.awareness[m.id] ?? 0;
      const seen = !blind && inView(sim, n.x, n.y, facing, n.obs.coneDeg, r, m.x, m.y);
      if (seen) {
        if (!n.obs.sympathizer) m.seen = true;
        if (m.fighting) a = A.alarmed;
        else a += seenDelta(sim, m, n.hostile, civilian, dtP, 0);
        if (n.hostile && sim.alert.on) {
          n.lastKnown = { x: m.x, y: m.y };
          if (a >= A.suspicious) {
            hostileSaw = true;
            sim.alert.lastKnown = { x: m.x, y: m.y };
          }
        }
      } else a -= A.decayUnseen * dtP;
      n.obs.awareness[m.id] = Math.max(0, Math.min(A.alarmed, a));
    }
    // Hearing (cameras and drones don't hear).
    const hearing = n.obs.hearing * sim.hearMult;
    for (const noise of sim.noises) {
      const d = Math.hypot(noise.x - n.x, noise.y - n.y);
      if (d > Math.min(noise.radius, hearing)) continue;
      const m = members[noise.member];
      if (m && !blind) {
        n.obs.awareness[m.id] = Math.min(
          A.alarmed,
          (n.obs.awareness[m.id] ?? 0) + A.noiseAwareness * noise.level,
        );
      }
      n.lookAt = { x: noise.x, y: noise.y };
      n.lookT = A.noiseLookSeconds;
    }
    // Finding a knocked-out human makes anyone Alarmed (spec §8.9).
    if (!blind && !n.obs.sympathizer) {
      for (const body of sim.npcs) {
        if (body === n || body.mode !== 'ko' || body.found) continue;
        if (inView(sim, n.x, n.y, facing, n.obs.coneDeg, r, body.x, body.y)) {
          body.found = true;
          n.obs.state = 'alarmed';
          setNpcState(sim, n, 'alarmed', null);
          sim.raiseAlert({ x: body.x, y: body.y });
        }
      }
    }
    updateNpcState(sim, n);
  }

  // Security cameras.
  for (const c of sim.cameras) {
    for (const m of members) {
      if (!perceivable(sim, m)) continue;
      let a = c.obs.awareness[m.id] ?? 0;
      const seen = inView(sim, c.x, c.y, c.facing, c.obs.coneDeg, c.obs.range * range, m.x, m.y);
      if (seen) {
        m.seen = true;
        a = m.fighting ? A.alarmed : a + seenDelta(sim, m, false, false, dtP, 0);
      } else a -= A.decayUnseen * dtP;
      c.obs.awareness[m.id] = Math.max(0, Math.min(A.alarmed, a));
      if (c.obs.awareness[m.id]! >= A.alarmed) {
        c.obs.state = 'alarmed';
        sim.raiseAlert({ x: m.x, y: m.y });
      }
    }
    if (c.obs.state !== 'alarmed')
      c.obs.state = stateFor(Math.max(0, ...Object.values(c.obs.awareness).map((v) => v ?? 0)));
  }

  // Drones: the searchlight cone (the one cone that's always visible).
  for (const d of sim.drones) {
    if (d.arriving > 0) continue;
    for (const m of members) {
      if (!perceivable(sim, m)) continue;
      let a = d.obs.awareness[m.id] ?? 0;
      const indoor = sim.grid.flagAt(m.x, m.y, F.INTERIOR);
      let visible = inView(sim, d.x, d.y, d.beam, O.drone.coneDeg, O.drone.range * range, m.x, m.y, false);
      if (visible && indoor) visible = nearWindow(sim, m.x, m.y);
      if (visible) {
        m.seen = true;
        a = m.fighting ? A.alarmed : a + seenDelta(sim, m, true, false, dtP, A.droneBeamRate);
        if (sim.alert.on && a >= A.suspicious) {
          hostileSaw = true;
          sim.alert.lastKnown = { x: m.x, y: m.y };
        }
      } else a -= A.decayUnseen * dtP;
      d.obs.awareness[m.id] = Math.max(0, Math.min(A.alarmed, a));
      if (d.obs.awareness[m.id]! >= A.alarmed) {
        d.obs.state = 'alarmed';
        sim.raiseAlert({ x: m.x, y: m.y });
      }
    }
    if (d.obs.state !== 'alarmed')
      d.obs.state = stateFor(Math.max(0, ...Object.values(d.obs.awareness).map((v) => v ?? 0)));
  }

  if (hostileSaw) sim.alert.unseen = 0;

  // Suspicion per member, rumble ticks at 60 and 90, spikes consumed.
  for (const m of members) {
    let s = 0;
    for (const n of sim.npcs) {
      if (!npcCanObserve(sim, n) || n.obs.sympathizer) continue;
      s = Math.max(s, n.obs.awareness[m.id] ?? 0);
    }
    for (const c of sim.cameras) s = Math.max(s, c.obs.awareness[m.id] ?? 0);
    for (const d of sim.drones) s = Math.max(s, d.obs.awareness[m.id] ?? 0);
    m.suspicion = s;
    m.spike = 0;
    m.fighting = false;
    if (m.controller !== null) {
      const prev = prevSusp[m.idx];
      if ((prev < 60 && s >= 60) || (prev < 90 && s >= 90))
        sim.emit({ t: 'rumble', slot: m.controller, kind: 'tick' });
    }
  }
}

function nearWindow(sim: StopSim, x: number, y: number): boolean {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++)
      if (sim.grid.charAt(Math.floor(x) + dx, Math.floor(y) + dy) === 'W') return true;
  }
  return false;
}

export function setNpcState(sim: StopSim, n: NpcActor, s: ObserverState, cause: MemberActor | null): void {
  if (n.obs.state === s && s !== 'alarmed') return;
  const prev = n.obs.state;
  n.obs.state = s;
  sim.emit({ t: 'state', npc: n.idx, state: s });
  if (s === 'curious' && prev === 'unaware') {
    sim.emit({ t: 'sfx', cue: 'notice', x: n.x, y: n.y, gain: 0.5 });
    if (sim.rng.chance(0.35)) bark(sim, n, 'curious');
  } else if (s === 'suspicious' && (prev === 'unaware' || prev === 'curious')) {
    bark(sim, n, n.role === 'waitress' && sim.kind === 'diner' ? 'waitress' : 'suspicious');
  } else if (s === 'alarmed' && prev !== 'alarmed') {
    sim.emit({ t: 'sfx', cue: 'alarm_pop', x: n.x, y: n.y });
    n.barkCd = 0;
    bark(sim, n, n.hostile ? (n.role === 'guard' ? 'guard' : 'recycler') : 'alarmed');
    if (cause) n.lastKnown = { x: cause.x, y: cause.y };
  } else if (s === 'helping') {
    n.barkCd = 0;
    bark(sim, n, 'helping');
  } else if (s === 'searching') {
    bark(sim, n, 'searching');
  }
}

function updateNpcState(sim: StopSim, n: NpcActor): void {
  const A = TUNING.awareness;
  let maxA = 0;
  let cause: MemberActor | null = null;
  for (const m of sim.members) {
    const a = n.obs.awareness[m.id] ?? 0;
    if (a > maxA) {
      maxA = a;
      cause = m;
    }
  }
  // Sympathizers reveal themselves at 60 and help instead of escalating (spec §8.5).
  if (n.obs.sympathizer) {
    if (!n.helped && maxA >= A.sympathizerHelpAt) sympathize(sim, n);
    else if (n.helped) n.obs.state = n.modeT < 3 && n.mode === 'help' ? 'helping' : 'unaware';
    else n.obs.state = stateFor(Math.min(maxA, A.alarmed - 1));
    return;
  }
  if (n.obs.state === 'alarmed' && !n.hostile) return;
  if (n.hostile && sim.alert.on) {
    const s: ObserverState =
      maxA >= A.alarmed - 0.5
        ? 'alarmed'
        : sim.alert.searching
          ? 'searching'
          : maxA >= A.suspicious
            ? 'suspicious'
            : n.obs.state === 'alarmed'
              ? 'alarmed'
              : 'searching';
    if (s !== n.obs.state) setNpcState(sim, n, s, cause);
    return;
  }
  const s = stateFor(maxA);
  if (s !== n.obs.state) {
    setNpcState(sim, n, s, cause);
    if (s === 'alarmed') sim.raiseAlert(cause ? { x: cause.x, y: cause.y } : null);
  }
}

/** A sympathizer helps once: look away, leave something, or (during ALERT) misdirect the Recyclers. */
function sympathize(sim: StopSim, n: NpcActor): void {
  n.helped = true;
  n.mode = 'help';
  n.modeT = 0;
  for (const m of sim.members) n.obs.awareness[m.id] = 0;
  setNpcState(sim, n, 'helping', null);
  sim.emit({ t: 'tip', id: 'first-sympathizer' });
  if (sim.alert.on && !sim.alert.misdirected) {
    sim.alert.misdirected = true;
    // Point the hunters the wrong way.
    const away = sim.grid.nearestWalkable(n.x + (n.x < sim.grid.w / 2 ? 12 : -12), n.y + 6) ?? {
      x: n.x,
      y: n.y,
    };
    sim.alert.lastKnown = away;
    for (const h of sim.npcs) if (h.hostile) h.lastKnown = { ...away };
    n.activity = 'point';
    n.activityT = 0;
    return;
  }
  if (sim.rng.chance(0.5)) {
    n.blindT = TUNING.awareness.lookAwaySeconds;
  } else {
    // Leave something on the table or counter: a small amber glint.
    const spot = sim.grid.nearestWalkable(n.x, n.y) ?? { x: n.x, y: n.y };
    const papers = sim.rng.chance(TUNING.loot.sympathizerPapersChance);
    const [a, b] = TUNING.loot.sympathizerCells;
    const loot = papers ? { papers: 1 } : { cells: sim.rng.int(a, b) };
    void rollLoot;
    sim.containers.push({
      id: sim.containers.length,
      kind: 'wallet',
      x: Math.floor(spot.x),
      y: Math.floor(spot.y),
      cx: spot.x,
      cy: spot.y,
      access: spot,
      tiles: [{ x: Math.floor(spot.x), y: Math.floor(spot.y) }],
      private: false,
      locked: false,
      searched: false,
      progress: 0,
      loot,
      pinged: false,
      glint: true,
    });
  }
}
