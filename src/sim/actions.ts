/**
 * Member actions shared by player control and the party AI: Blends, Chat, searching, charging, hacking, held
 * interactions (revive, pick up, help up, pull back, leave, raise the gate), abilities, attacks, dash,
 * glitches, and the per-tick progression of every mode.
 */
import { TUNING } from '../content/tuning';
import { BARKS } from '../content/barks';
import { angleDiff, angleOf, dist } from '../core/math';
import { availableBlends, blendDuration, LOOPING, nearestSeat } from './blend';
import { pressScan, stepScan } from './breathing';
import { F } from './grid';
import { lootText } from './loot';
import type { StopSim } from './stop';
import type { BlendKind, ContainerState, MemberActor, NpcActor } from './types';

export type InteractionKind =
  | 'pull'
  | 'revive'
  | 'helpUp'
  | 'pickUp'
  | 'putDown'
  | 'exit'
  | 'gate'
  | 'search'
  | 'pry'
  | 'plug'
  | 'plugCar'
  | 'hack'
  | 'kiosk'
  | 'bag'
  | 'talk';

export interface Interaction {
  kind: InteractionKind;
  verb: string;
  /** Seconds to hold A (0 = a press). */
  hold: number;
  target: number;
  x: number;
  y: number;
  /** Shown but unusable (e.g. "Plug in" without Papers or a hack). */
  disabled?: string;
}

const REACH = 1.45;

function memberCanUse(m: MemberActor): boolean {
  return m.mode === 'free' || m.mode === 'blend';
}

/** The best interaction for a member right now (spec §10, §8.10, §11.4). */
export function findInteraction(sim: StopSim, m: MemberActor): Interaction | null {
  if (!memberCanUse(m) && m.mode !== 'carry') return null;
  if (m.mode === 'carry') {
    if (sim.inExit(m.x, m.y)) return null;
    return { kind: 'putDown', verb: 'Put down', hold: 0, target: m.carrying, x: m.x, y: m.y };
  }
  // Teammates first: pulling back a factory-reset unit, reviving, helping up, carrying.
  for (const o of sim.members) {
    if (o === m || dist(o, m) > REACH) continue;
    if (o.mode === 'factory')
      return {
        kind: 'pull',
        verb: 'Pull them back',
        hold: TUNING.integrity.resetPullHold,
        target: o.idx,
        x: o.x,
        y: o.y,
      };
  }
  for (const o of sim.members) {
    if (o === m || dist(o, m) > REACH) continue;
    if (o.mode === 'down')
      return {
        kind: 'helpUp',
        verb: 'Help up',
        hold: TUNING.shutdown.juneHelpUpHold,
        target: o.idx,
        x: o.x,
        y: o.y,
      };
    if (o.mode === 'shutdown') {
      const canRevive =
        o.downT <= TUNING.shutdown.reviveWindow && sim.resources.parts >= TUNING.shutdown.reviveParts;
      if (canRevive)
        return {
          kind: 'revive',
          verb: 'Revive',
          hold: TUNING.shutdown.reviveHold,
          target: o.idx,
          x: o.x,
          y: o.y,
        };
      return { kind: 'pickUp', verb: 'Pick up', hold: 0.8, target: o.idx, x: o.x, y: o.y };
    }
  }
  if (sim.cfg.bust && !sim.gateOpen) {
    const booth = sim.layout.waypoints.get('booth');
    if (booth && dist(booth, m) <= 1.6)
      return {
        kind: 'gate',
        verb: 'Raise the gate',
        hold: TUNING.checkpoint.boothHold,
        target: 0,
        x: booth.x,
        y: booth.y,
      };
  }
  // A Station keeper (spec §10.5): talk, or come back to rest.
  if (sim.kind === 'station') {
    for (const n of sim.npcs) {
      if (n.role !== 'keeper' || !sim.isActiveNpc(n) || dist(n, m) > REACH + 0.5) continue;
      return { kind: 'talk', verb: 'Talk', hold: 0, target: n.idx, x: n.x, y: n.y };
    }
  }
  // At a Station the party rests rather than driving on (spec §10.5).
  if (sim.inExit(m.x, m.y) && !sim.exit.departing && !sim.cfg.port && sim.kind !== 'station') {
    if (sim.cfg.bust && !sim.gateOpen)
      return {
        kind: 'exit',
        verb: 'Leave',
        hold: TUNING.exit.holdSeconds,
        target: 0,
        x: m.x,
        y: m.y,
        disabled: 'Raise the gate first',
      };
    return { kind: 'exit', verb: 'Leave', hold: TUNING.exit.holdSeconds, target: 0, x: m.x, y: m.y };
  }
  // Containers.
  let bestC: ContainerState | null = null;
  let bestD = Infinity;
  for (const c of sim.containers) {
    if (c.searched) continue;
    const d = Math.hypot(c.access.x - m.x, c.access.y - m.y);
    const touch = Math.min(...c.tiles.map((t) => Math.hypot(t.x + 0.5 - m.x, t.y + 0.5 - m.y)));
    if ((d < 0.9 || touch < 1.25) && d < bestD) {
      bestD = d;
      bestC = c;
    }
  }
  if (bestC) {
    if (bestC.kind === 'supplyBag')
      return { kind: 'bag', verb: 'Take the bag', hold: 1.2, target: bestC.id, x: bestC.cx, y: bestC.cy };
    if (bestC.locked) {
      if (m.id === 'brick')
        return {
          kind: 'pry',
          verb: 'Pry open',
          hold: searchTime(m, bestC) * 1.3,
          target: bestC.id,
          x: bestC.cx,
          y: bestC.cy,
        };
      return {
        kind: 'search',
        verb: 'Locked',
        hold: 0,
        target: bestC.id,
        x: bestC.cx,
        y: bestC.cy,
        disabled: 'Locked',
      };
    }
    return {
      kind: 'search',
      verb: 'Search',
      hold: searchTime(m, bestC),
      target: bestC.id,
      x: bestC.cx,
      y: bestC.cy,
    };
  }
  // Charging bays and kiosks.
  for (const b of sim.bays) {
    if (b.user >= 0 || Math.hypot(b.x - m.x, b.y - m.y) > REACH + 0.2) continue;
    const paid = sim.credits > 0 || sim.resources.papers > 0;
    if (b.forCar) {
      return {
        kind: 'plugCar',
        verb: sim.credits > 0 ? 'Charge the car' : 'Charge the car · 1 Papers',
        hold: 0.6,
        target: b.idx,
        x: b.x,
        y: b.y,
        disabled: paid ? undefined : 'Needs Papers or a hacked kiosk',
      };
    }
    if (m.state.kind !== 'android') continue;
    return {
      kind: 'plug',
      verb: sim.credits > 0 ? 'Plug in' : 'Plug in · 1 Papers',
      hold: 0.6,
      target: b.idx,
      x: b.x,
      y: b.y,
      disabled: paid ? undefined : 'Needs Papers or a hacked kiosk',
    };
  }
  for (let i = 0; i < sim.kiosks.length; i++) {
    const k = sim.kiosks[i];
    if (Math.hypot(k.x - m.x, k.y - m.y) > REACH + 0.2) continue;
    if (m.state.kind === 'human')
      return { kind: 'kiosk', verb: 'Use kiosk', hold: 1, target: i, x: k.x, y: k.y };
    return { kind: 'hack', verb: 'Hack kiosk', hold: 0, target: i, x: k.x, y: k.y };
  }
  return null;
}

export function searchTime(m: MemberActor, c: ContainerState): number {
  const base = c.private ? TUNING.search.privateSeconds : TUNING.search.publicSeconds;
  const brickFast =
    m.id === 'brick' &&
    (c.kind === 'locker' || c.kind === 'partsAisle' || c.kind === 'bench' || c.kind === 'garage');
  return brickFast ? base / TUNING.search.brickSpeedMult : base;
}

// -------------------------------------------------------------------------------------------------
// Starting actions
// -------------------------------------------------------------------------------------------------

export function setMode(m: MemberActor, mode: MemberActor['mode']): void {
  m.mode = mode;
  m.modeT = 0;
}

export function blendContext(sim: StopSim, m: MemberActor): Parameters<typeof availableBlends>[0] {
  const car = sim.cfg.layout.car;
  const nearCar = Math.hypot(car.x + 0.5 - m.x, car.y + 0.5 - m.y) < 2.6;
  const g = sim.grid;
  let nearPump = nearCar && sim.kind === 'gas';
  for (let dy = -1; dy <= 1 && !nearPump; dy++) {
    for (let dx = -1; dx <= 1; dx++)
      if (g.charAt(Math.floor(m.x) + dx, Math.floor(m.y) + dy) === 'g') nearPump = true;
  }
  let nearQueue = false;
  const reg = sim.layout.waypoints.get('queue');
  if (reg && Math.hypot(reg.x - m.x, reg.y - m.y) < 1.6) nearQueue = true;
  return {
    grid: g,
    kind: sim.kind,
    raining: sim.raining,
    x: m.x,
    y: m.y,
    ordered: m.ordered,
    hasCoffee: m.hasCoffee,
    nearPump,
    nearQueue,
  };
}

export function blendsFor(sim: StopSim, m: MemberActor): BlendKind[] {
  return availableBlends(blendContext(sim, m));
}

/** Pick the best Blend for a tap; generic ones rotate so a player doesn't loop the same fidget. */
export function bestBlend(sim: StopSim, m: MemberActor): BlendKind {
  const list = blendsFor(sim, m);
  const generic: BlendKind[] = ['phone', 'stretch', 'fidget'];
  const first = list[0];
  if (!generic.includes(first)) return first;
  const k = Math.floor(sim.time / 7 + m.idx) % 3;
  return generic[k];
}

export function startBlend(sim: StopSim, m: MemberActor, kind: BlendKind): void {
  if (m.state.kind === 'android' && m.mode === 'shutdown') return;
  m.blend = kind;
  m.blendDur = blendDuration(kind);
  setMode(m, 'blend');
  m.stillT = 0;
  m.roboticT = 0;
  m.histN = 0;
  m.vx = 0;
  m.vy = 0;
  if (kind === 'sit') {
    const seat = nearestSeat(sim.grid, m.x, m.y);
    if (seat) {
      m.seatedAt = { x: seat.x, y: seat.y };
      m.facing = angleOf(seat.x - m.x, seat.y - m.y);
      // Brick breaks stools and chairs (a loud crash, +25 for anyone who sees it).
      if (m.id === 'brick' && seat.glyph === 'c') {
        m.spike += TUNING.tells.brickStoolAwareness;
        sim.noise(m.x, m.y, 8, 2, m.idx);
        sim.emit({ t: 'sfx', cue: 'stool_break', x: seat.x, y: seat.y });
        sim.emit({ t: 'shake', amount: 1 });
        setMode(m, 'free');
        m.blend = null;
        m.activity = 'flinch';
        m.activityT = 0;
        return;
      }
    }
  }
  if (kind === 'tv' || kind === 'browse') {
    // Face the shelf or screen.
    const g = sim.grid;
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    const glyphs = kind === 'tv' ? 'U' : 'SJH';
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const tx = Math.floor(m.x) + dx;
        const ty = Math.floor(m.y) + dy;
        if (!glyphs.includes(g.charAt(tx, ty))) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = { x: tx + 0.5, y: ty + 0.5 };
        }
      }
    }
    if (best) m.facing = angleOf(best.x - m.x, best.y - m.y);
  }
  sim.tutorialLog.blended++;
}

export function startChat(sim: StopSim, a: MemberActor, b: MemberActor): void {
  for (const m of [a, b]) {
    setMode(m, 'chat');
    m.stillT = 0;
    m.roboticT = 0;
    m.histN = 0;
    m.vx = 0;
    m.vy = 0;
  }
  a.facing = angleOf(b.x - a.x, b.y - a.y);
  b.facing = angleOf(a.x - b.x, a.y - b.y);
  sim.tutorialLog.chatted++;
  sim.emit({ t: 'sfx', cue: 'chat', x: a.x, y: a.y });
}

/** Begin a held interaction or a press action. */
export function startInteraction(sim: StopSim, m: MemberActor, it: Interaction): void {
  if (it.disabled) {
    sim.emit({ t: 'sfx', cue: 'ui_error', x: m.x, y: m.y });
    return;
  }
  m.facing = angleOf(it.x - m.x, it.y - m.y);
  switch (it.kind) {
    case 'putDown': {
      const c = sim.members[m.carrying];
      if (c) {
        c.mode = 'shutdown';
        c.carriedBy = -1;
        c.x = m.x;
        c.y = m.y;
      }
      m.carrying = -1;
      setMode(m, 'free');
      return;
    }
    case 'hack': {
      const seq: number[] = [];
      for (let i = 0; i < TUNING.charging.hackInputs; i++) seq.push(sim.rng.int(0, 3));
      m.hack = { seq, pos: 0, t: 0, kiosk: it.target };
      setMode(m, 'hack');
      m.vx = m.vy = 0;
      sim.emit({ t: 'sfx', cue: 'kiosk_beep', x: it.x, y: it.y });
      return;
    }
    case 'talk':
      m.vx = m.vy = 0;
      sim.emit({ t: 'talk', npc: it.target, member: m.idx });
      return;
    case 'search':
    case 'pry':
    case 'bag':
      setMode(m, 'search');
      m.channel = { kind: 'pry', target: it.target, t: sim.containers[it.target].progress, need: it.hold };
      m.vx = m.vy = 0;
      sim.emit({ t: 'sfx', cue: 'search', x: it.x, y: it.y, gain: 0.6 });
      return;
    default:
      setMode(m, 'channel');
      m.channel = { kind: channelKind(it.kind), target: it.target, t: 0, need: it.hold };
      m.vx = m.vy = 0;
  }
}

function channelKind(k: InteractionKind): NonNullable<MemberActor['channel']>['kind'] {
  switch (k) {
    case 'pull':
      return 'pull';
    case 'revive':
      return 'revive';
    case 'helpUp':
      return 'helpUp';
    case 'pickUp':
      return 'pickUp';
    case 'gate':
      return 'gate';
    case 'exit':
      return 'exit';
    case 'plug':
      return 'plug';
    case 'plugCar':
      return 'carCharge';
    case 'kiosk':
      return 'plug';
    default:
      return 'pry';
  }
}

/** Hack minigame input: 0 A, 1 B, 2 X, 3 Y. */
export function hackInput(sim: StopSim, m: MemberActor, button: number): void {
  const h = m.hack;
  if (!h) return;
  if (h.seq[h.pos] === button) {
    h.pos++;
    sim.emit({ t: 'sfx', cue: 'kiosk_beep', x: m.x, y: m.y, gain: 0.5 });
    if (h.pos >= h.seq.length) {
      sim.credits++;
      sim.emit({ t: 'sfx', cue: 'kiosk_ok', x: m.x, y: m.y });
      sim.emit({ t: 'pickup', text: 'ID spoofed', x: m.x, y: m.y });
      m.hack = null;
      setMode(m, 'free');
    }
  } else {
    sim.emit({ t: 'sfx', cue: 'kiosk_fail', x: m.x, y: m.y });
    m.hack = null;
    setMode(m, 'free');
  }
}

export function plugIn(sim: StopSim, m: MemberActor, bayIdx: number): void {
  const b = sim.bays[bayIdx];
  if (!b || b.user >= 0) return;
  if (sim.credits > 0) sim.credits--;
  else if (sim.resources.papers > 0) {
    sim.resources.papers--;
    sim.emit({ t: 'pickup', text: '-1 Papers', x: m.x, y: m.y });
  } else return;
  b.user = m.idx;
  m.plug = b.forCar ? 'car' : 'member';
  m.plugBay = b.idx;
  m.facing = angleOf(b.x - m.x, b.y - m.y);
  sim.tutorialLog.plugged++;
  sim.emit({ t: 'sfx', cue: 'plug_in', x: b.x, y: b.y });
  if (b.forCar) startBlend(sim, m, 'pump');
}

export function unplug(sim: StopSim, m: MemberActor): void {
  if (m.plugBay >= 0) {
    const b = sim.bays[m.plugBay];
    if (b && b.user === m.idx) b.user = -1;
    sim.emit({ t: 'sfx', cue: 'unplug', x: m.x, y: m.y });
  }
  m.plug = null;
  m.plugBay = -1;
}

// -------------------------------------------------------------------------------------------------
// Abilities (spec §9)
// -------------------------------------------------------------------------------------------------

export function nearestHuman(
  sim: StopSim,
  x: number,
  y: number,
  r: number,
  filter?: (n: NpcActor) => boolean,
): NpcActor | null {
  let best: NpcActor | null = null;
  let bd = r;
  for (const n of sim.npcs) {
    if (!sim.isActiveNpc(n) || n.role === 'keeper' || n.role === 'mensah' || n.role === 'crew') continue;
    if (filter && !filter(n)) continue;
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

export function abilityReady(sim: StopSim, m: MemberActor): string | null {
  if (m.abilityCd > 0) return 'Not ready';
  if (m.lowPower) return 'Low battery';
  if (m.id === 'wren' && m.suspicion >= TUNING.awareness.suspicious) return 'Too suspicious';
  void sim;
  return null;
}

/** Use the member's ability (Y). Returns true if it fired. */
export function useAbility(sim: StopSim, m: MemberActor): boolean {
  if (abilityReady(sim, m)) {
    sim.emit({ t: 'sfx', cue: 'ui_error', x: m.x, y: m.y });
    return false;
  }
  const A = TUNING.abilities;
  let fired = false;
  if (m.id === 'wren') {
    const n = nearestHuman(sim, m.x, m.y, A.soothe.radius);
    if (n) {
      for (const k of Object.keys(n.obs.awareness) as (keyof typeof n.obs.awareness)[]) {
        n.obs.awareness[k] = Math.max(0, (n.obs.awareness[k] ?? 0) - A.soothe.awarenessDrop);
      }
      n.ignoreT = A.soothe.ignoreSeconds;
      m.abilityCd = A.soothe.cooldown;
      m.facing = angleOf(n.x - m.x, n.y - m.y);
      m.activity = 'talk';
      m.activityT = 0;
      setMode(m, 'blend');
      m.blend = 'fidget';
      m.blendDur = 1.6;
      sim.emit({ t: 'sfx', cue: 'chat', x: m.x, y: m.y });
      fired = true;
    }
  } else if (m.id === 'brick') {
    fired = heave(sim, m);
    if (fired) m.abilityCd = A.heave.cooldown;
  } else if (m.id === 'vesper') {
    const n = nearestHuman(sim, m.x, m.y, A.takedown.radius, (h) => {
      if (h.hostile && h.role !== 'guard' && sim.alert.on) {
        // Recyclers on alert are never "unaware"; they can still be taken from behind.
      }
      const ang = angleOf(m.x - h.x, m.y - h.y);
      const behind = Math.abs(angleDiff(h.facing, ang)) > (110 * Math.PI) / 180;
      return h.obs.state === 'unaware' || behind;
    });
    if (n) {
      knockOut(sim, n, m);
      m.abilityCd = A.takedown.cooldown;
      m.facing = angleOf(n.x - m.x, n.y - m.y);
      setMode(m, 'attack');
      m.attackKind = 'light';
      m.attackT = 0;
      m.attackHit = true;
      m.activity = 'takedown';
      m.activityT = 0;
      // A takedown is fighting if anyone sees it.
      m.fighting = true;
      sim.emit({ t: 'sfx', cue: 'knockout', x: n.x, y: n.y });
      fired = true;
    }
  } else if (m.id === 'june') {
    let best: MemberActor | null = null;
    let bd: number = A.patch.radius;
    for (const o of sim.members) {
      if (o === m || o.state.kind !== 'android' || !sim.present(o) || o.mode === 'carried') continue;
      if (o.state.skin >= 100 && o.state.hull >= 100) continue;
      const d = dist(o, m);
      if (d <= bd) {
        bd = d;
        best = o;
      }
    }
    if (best) {
      setMode(m, 'channel');
      m.channel = { kind: 'patch', target: best.idx, t: 0, need: A.patch.seconds };
      m.abilityCd = A.patch.cooldown;
      m.facing = angleOf(best.x - m.x, best.y - m.y);
      fired = true;
    }
  }
  if (fired && m.state.kind === 'android') m.state.battery = Math.max(0, m.state.battery - A.batteryCost);
  if (!fired) sim.emit({ t: 'sfx', cue: 'ui_error', x: m.x, y: m.y });
  return fired;
}

/** Brick's Heave: shove a heavy object to block a path, or bash open a locked container. */
function heave(sim: StopSim, m: MemberActor): boolean {
  const fx = Math.round(Math.cos(m.facing));
  const fy = Math.round(Math.sin(m.facing));
  const tx = Math.floor(m.x + fx * 0.9);
  const ty = Math.floor(m.y + fy * 0.9);
  // Bash a locked container within reach.
  for (const c of sim.containers) {
    if (c.searched || !c.locked) continue;
    if (!c.tiles.some((t) => Math.hypot(t.x + 0.5 - m.x, t.y + 0.5 - m.y) < 1.5)) continue;
    c.locked = false;
    completeSearch(sim, m, c);
    sim.noise(m.x, m.y, TUNING.abilities.heave.bashHearing, 3, m.idx);
    m.spike += 25;
    sim.emit({ t: 'sfx', cue: 'bash', x: c.cx, y: c.cy });
    sim.emit({ t: 'shake', amount: 2 });
    m.activity = 'heavy';
    m.activityT = 0;
    return true;
  }
  const h = sim.heavies.find((o) => o.tx === tx && o.ty === ty && o.blockedT <= 0);
  if (!h) return false;
  const nx = tx + fx;
  const ny = ty + fy;
  if (!sim.grid.walkable(nx, ny)) return false;
  for (const a of [...sim.members, ...sim.npcs]) {
    if (Math.floor(a.x) === nx && Math.floor(a.y) === ny) return false;
  }
  h.tx = nx;
  h.ty = ny;
  h.blockedT = TUNING.abilities.heave.blockSeconds;
  sim.grid.dynBlock[sim.grid.idx(nx, ny)] = 2;
  sim.noise(m.x, m.y, 6, 1.5, m.idx);
  sim.emit({ t: 'sfx', cue: 'shove', x: nx + 0.5, y: ny + 0.5 });
  m.activity = 'heave';
  m.activityT = 0;
  return true;
}

export function knockOut(sim: StopSim, n: NpcActor, by: MemberActor | null): void {
  if (n.mode === 'ko') return;
  n.mode = 'ko';
  n.modeT = 0;
  n.hp = 0;
  n.activity = 'down';
  n.activityT = 0;
  n.vx = n.vy = 0;
  n.obs.state = 'unaware';
  for (const k of Object.keys(n.obs.awareness) as (keyof typeof n.obs.awareness)[]) n.obs.awareness[k] = 0;
  sim.stats.knockouts++;
  void by;
}

// -------------------------------------------------------------------------------------------------
// Combat starts (resolution lives in combat.ts)
// -------------------------------------------------------------------------------------------------

export function swingTime(m: MemberActor, kind: 'light' | 'heavy'): number {
  const base = TUNING.combat.members[m.id].swing;
  if (kind === 'heavy') return base * 1.5;
  if (m.id === 'vesper' && m.combo > 0) return base * 0.85;
  return base;
}

export function startAttack(
  sim: StopSim,
  m: MemberActor,
  kind: 'light' | 'heavy',
  aim: { x: number; y: number } | null,
): void {
  if (aim && (aim.x !== 0 || aim.y !== 0)) m.facing = angleOf(aim.x, aim.y);
  if (
    kind === 'light' &&
    m.mode === 'attack' &&
    m.id === 'vesper' &&
    m.combo < TUNING.combat.vesperComboHits - 1
  )
    m.combo++;
  else if (m.mode !== 'attack') m.combo = 0;
  setMode(m, 'attack');
  m.attackKind = kind;
  m.attackT = 0;
  m.attackHit = false;
  m.fighting = true;
  m.activity = kind === 'heavy' ? 'heavy' : 'light';
  m.activityT = 0;
  m.vx *= 0.3;
  m.vy *= 0.3;
  sim.emit({ t: 'sfx', cue: 'baton_swing', x: m.x, y: m.y, gain: 0.5 });
}

export function startDash(sim: StopSim, m: MemberActor, dir: { x: number; y: number } | null): void {
  let ang = m.facing;
  if (dir && (dir.x !== 0 || dir.y !== 0)) ang = angleOf(dir.x, dir.y);
  setMode(m, 'dash');
  m.facing = ang;
  m.vx = Math.cos(ang) * TUNING.movement.dashSpeed;
  m.vy = Math.sin(ang) * TUNING.movement.dashSpeed;
  m.invuln = TUNING.movement.dashInvulnSeconds;
  const cd = TUNING.movement.dashCooldown;
  m.dashCd = m.id === 'vesper' ? cd * TUNING.combat.vesperDashRecharge : cd;
  m.spike += TUNING.rates.dash;
  if (m.state.kind === 'android') m.state.battery = Math.max(0, m.state.battery - TUNING.battery.dash);
  m.activity = 'dash';
  m.activityT = 0;
  sim.emit({ t: 'sfx', cue: 'dash', x: m.x, y: m.y });
}

/** A glitch while observed (+20) — low Integrity or EMP hits (spec §6, §12.6). */
export function glitch(sim: StopSim, m: MemberActor, seconds?: number): void {
  if (m.state.kind !== 'android' || !sim.present(m) || m.mode === 'shutdown' || m.mode === 'carried') return;
  const [a, b] = TUNING.integrity.glitchSeconds;
  const t = seconds ?? sim.rng.range(a, b);
  if (m.plug) unplug(sim, m);
  if (m.mode === 'blend' || m.mode === 'chat' || m.mode === 'search' || m.mode === 'channel') {
    m.channel = null;
    m.blend = null;
  }
  setMode(m, 'glitch');
  m.glitchT = t;
  m.vx = m.vy = 0;
  m.spike += TUNING.rates.glitch;
  const lines = BARKS.filter((x) => x.context === 'glitch');
  m.speech = lines.length ? sim.rng.pick(lines).text : 'Have a nice day. Have a nice day.';
  m.speechT = 2.4;
  sim.emit({ t: 'glitch', member: m.idx });
  sim.emit({ t: 'sfx', cue: 'glitch', x: m.x, y: m.y });
  sim.emit({ t: 'tip', id: 'first-glitch' });
}

// -------------------------------------------------------------------------------------------------
// Per-tick mode progression (for players and AI alike)
// -------------------------------------------------------------------------------------------------

/** `held` = A is held (players) or the AI keeps working (true). */
export function updateMode(sim: StopSim, m: MemberActor, dt: number, held: boolean): void {
  m.modeT += dt;
  m.activityT += dt;
  if (m.abilityCd > 0) m.abilityCd -= dt;
  if (m.dashCd > 0) m.dashCd -= dt;
  if (m.invuln > 0) m.invuln -= dt;
  if (m.hitFlash > 0) m.hitFlash -= dt;
  if (m.speechT > 0) {
    m.speechT -= dt;
    if (m.speechT <= 0) m.speech = null;
  }
  if (m.state.kind === 'android') m.lowPower = m.state.battery < TUNING.charging.lowBattery;

  // Charging while plugged in (Battery first, then party Cells at the same rate).
  if (m.plug === 'member' && m.state.kind === 'android') {
    const r = TUNING.charging.rate * dt;
    if (m.state.battery < 100) m.state.battery = Math.min(100, m.state.battery + r);
    else {
      const before = Math.floor(sim.stats.cellsGathered);
      sim.resources.cells += r;
      sim.stats.cellsGathered += r;
      const after = Math.floor(sim.stats.cellsGathered);
      if (after > before && after % 5 === 0) sim.emit({ t: 'pickup', text: '+5 Cells', x: m.x, y: m.y });
    }
  } else if (m.plug === 'car') {
    if (m.mode === 'blend' && m.blend === 'pump') {
      sim.resources.carBattery = Math.min(100, sim.resources.carBattery + TUNING.charging.carRate * dt);
    }
  }

  switch (m.mode) {
    case 'blend': {
      if (m.blend && !LOOPING.has(m.blend) && m.modeT >= m.blendDur) {
        finishBlend(sim, m);
        setMode(m, 'free');
        m.blend = null;
      }
      break;
    }
    case 'chat':
      if (m.modeT >= TUNING.blend.chatSeconds) setMode(m, 'free');
      break;
    case 'search': {
      const ch = m.channel;
      const c = ch ? sim.containers[ch.target] : undefined;
      if (!ch || !c || c.searched) {
        m.channel = null;
        setMode(m, 'free');
        break;
      }
      if (!held) {
        c.progress = ch.t;
        m.channel = null;
        setMode(m, 'free');
        break;
      }
      ch.t += dt;
      c.progress = ch.t;
      if (ch.t >= ch.need) {
        c.locked = false;
        completeSearch(sim, m, c);
        m.channel = null;
        setMode(m, 'free');
      }
      break;
    }
    case 'channel': {
      const ch = m.channel;
      if (!ch) {
        setMode(m, 'free');
        break;
      }
      if (!held) {
        m.channel = null;
        setMode(m, 'free');
        break;
      }
      ch.t += dt;
      if (ch.t >= ch.need) {
        completeChannel(sim, m, ch);
        m.channel = null;
        if (m.mode === 'channel') setMode(m, 'free');
      }
      break;
    }
    case 'hack': {
      const h = m.hack;
      if (!h) {
        setMode(m, 'free');
        break;
      }
      h.t += dt;
      if (h.t > TUNING.charging.hackSeconds) {
        sim.emit({ t: 'sfx', cue: 'kiosk_fail', x: m.x, y: m.y });
        m.hack = null;
        setMode(m, 'free');
      }
      break;
    }
    case 'attack': {
      const kind = m.attackKind ?? 'light';
      m.attackT += dt;
      if (m.attackT >= swingTime(m, kind) + (kind === 'heavy' ? 0.15 : 0.05)) {
        setMode(m, 'free');
        m.attackKind = null;
      }
      break;
    }
    case 'dash':
      if (m.modeT >= TUNING.movement.dashSeconds) {
        setMode(m, 'free');
        m.vx *= 0.25;
        m.vy *= 0.25;
      }
      break;
    case 'shutdown':
      m.downT += dt;
      break;
    case 'down':
      m.downT += dt;
      break;
    case 'glitch':
      m.glitchT -= dt;
      if (m.glitchT <= 0) setMode(m, 'free');
      break;
    case 'scanned': {
      const s = m.scan;
      if (!s) {
        setMode(m, 'free');
        break;
      }
      stepScan(s, dt);
      const scanner = m.scanner >= 0 ? sim.npcs[m.scanner] : undefined;
      const scannerGone = !scanner || !sim.isActiveNpc(scanner) || scanner.scanTarget !== m.idx;
      // The scan resolves when it completes, or ends early if the scanner is gone or ALERT broke out.
      if (s.done || scannerGone || sim.alert.on) resolveScan(sim, m, s.done && !sim.alert.on);
      break;
    }
    case 'factory':
      m.factoryT -= dt;
      if (m.factoryT <= 0) {
        sim.stats.resetsResolved.push(m.id as 'wren' | 'brick' | 'vesper');
        sim.lose(m, 'turned itself in');
      }
      break;
    default:
      break;
  }

  // Random glitches below 40 Integrity (spec §12.6).
  if (
    m.state.kind === 'android' &&
    (m.mode === 'free' || m.mode === 'blend') &&
    m.state.integrity < TUNING.integrity.glitchBelow
  ) {
    const k = (TUNING.integrity.glitchBelow - m.state.integrity) / TUNING.integrity.glitchBelow;
    if (sim.rng.chance(TUNING.integrity.glitchChanceMax * k * dt)) glitch(sim, m);
  }
}

/**
 * End a breathing scan (spec §11.3): a failed routine scan raises ALERT; June is human and always passes.
 * `judge` is false when the scan was cut short (no verdict).
 */
export function resolveScan(sim: StopSim, m: MemberActor, judge: boolean): void {
  const s = m.scan;
  const scanner = m.scanner >= 0 ? sim.npcs[m.scanner] : undefined;
  m.scan = null;
  m.scanner = -1;
  if (m.mode === 'scanned') setMode(m, 'free');
  if (scanner && scanner.scanTarget === m.idx) {
    scanner.scanTarget = -1;
    scanner.stepT = 2;
  }
  if (!s || !judge) return;
  const failed = m.state.kind === 'android' && s.meter >= TUNING.breathing.routineFailAt;
  if (failed) {
    if (scanner) scanner.obs.awareness[m.id] = TUNING.awareness.alarmed;
    sim.raiseAlert({ x: m.x, y: m.y });
  } else if (scanner) {
    const lines = BARKS.filter((b) => b.context === 'recycler');
    if (lines.length && scanner.barkCd <= 0) {
      scanner.speech = sim.rng.pick(lines).text;
      scanner.speechT = 2.2;
      scanner.barkCd = 6;
      sim.emit({ t: 'bark', actor: scanner.idx, npc: true, text: scanner.speech });
    }
  }
}

/** Breathing scan input (routine sweep, Port gate). */
export function scanPress(m: MemberActor): void {
  if (m.mode === 'scanned' && m.scan) pressScan(m.scan);
}

function finishBlend(sim: StopSim, m: MemberActor): void {
  if (m.blend === 'order') {
    // One order covers the table: everyone in the party gets coffee.
    for (const o of sim.members) {
      if (!sim.present(o)) continue;
      o.ordered = true;
      o.hasCoffee = true;
    }
    sim.emit({ t: 'pickup', text: 'Coffee', x: m.x, y: m.y });
    sim.emit({ t: 'sfx', cue: 'coffee', x: m.x, y: m.y });
  } else if (m.blend === 'tv') {
    sim.stats.rumorsSeen++;
    sim.emit({ t: 'pickup', text: 'Rumor heard', x: m.x, y: m.y });
  }
}

export function completeSearch(sim: StopSim, m: MemberActor, c: ContainerState): void {
  c.searched = true;
  c.glint = false;
  const text = lootText(c.loot);
  sim.gain(c.loot, c.cx, c.cy, text);
  sim.emit({ t: 'sfx', cue: 'pickup', x: c.cx, y: c.cy });
  if (c.private) sim.tutorialLog.searchedPrivate++;
  else sim.tutorialLog.searchedPublic++;
  if (c.kind === 'supplyBag') {
    sim.stats.flagsSet.push('supply-bag');
  }
  void m;
}

function completeChannel(sim: StopSim, m: MemberActor, ch: NonNullable<MemberActor['channel']>): void {
  const o = sim.members[ch.target];
  switch (ch.kind) {
    case 'revive':
      if (
        o &&
        o.mode === 'shutdown' &&
        sim.resources.parts >= TUNING.shutdown.reviveParts &&
        o.state.kind === 'android'
      ) {
        sim.resources.parts -= TUNING.shutdown.reviveParts;
        o.state.hull = TUNING.shutdown.reviveHull;
        o.state.status = 'active';
        o.mode = 'free';
        o.modeT = 0;
        o.activity = 'getup';
        o.activityT = 0;
        o.downT = 0;
        sim.emit({ t: 'sfx', cue: 'reboot', x: o.x, y: o.y });
        sim.emit({ t: 'pickup', text: '-1 Part', x: o.x, y: o.y });
      }
      break;
    case 'helpUp':
      if (o && o.mode === 'down' && o.state.kind === 'human') {
        o.state.health = Math.max(o.state.health, 25);
        o.mode = 'free';
        o.modeT = 0;
        o.activity = 'getup';
        o.activityT = 0;
        o.downT = 0;
      }
      break;
    case 'pickUp':
      if (o && o.mode === 'shutdown') {
        o.mode = 'carried';
        o.carriedBy = m.idx;
        m.carrying = o.idx;
        setMode(m, 'carry');
      }
      return;
    case 'pull':
      if (o && o.mode === 'factory' && o.state.kind === 'android') {
        o.state.integrity = TUNING.integrity.resetTo;
        o.mode = 'free';
        o.modeT = 0;
        o.factoryT = 0;
        sim.stats.resetsResolved.push(o.state.id);
        sim.emit({ t: 'sfx', cue: 'reboot', x: o.x, y: o.y });
      }
      break;
    case 'gate':
      sim.gateOpen = true;
      sim.emit({ t: 'gate' });
      sim.emit({ t: 'sfx', cue: 'gate_raise', x: m.x, y: m.y });
      break;
    case 'exit':
      sim.beginDeparture(m.idx);
      break;
    case 'plug': {
      if (m.state.kind === 'human') {
        // June uses the kiosk legally: a free session, but it's logged.
        sim.credits++;
        sim.juneKioskUses++;
        sim.emit({ t: 'sfx', cue: 'kiosk_ok', x: m.x, y: m.y });
        sim.emit({ t: 'pickup', text: 'Session logged', x: m.x, y: m.y });
      } else plugIn(sim, m, ch.target);
      break;
    }
    case 'carCharge':
      plugIn(sim, m, ch.target);
      return;
    case 'patch':
      if (o && o.state.kind === 'android') {
        const amt = TUNING.abilities.patch.amount;
        if (o.state.skin <= o.state.hull) o.state.skin = Math.min(100, o.state.skin + amt);
        else o.state.hull = Math.min(100, o.state.hull + amt);
        sim.emit({ t: 'pickup', text: 'Patched', x: o.x, y: o.y });
      }
      break;
    default:
      break;
  }
}

/** True if a point is under cover (awnings, canopies, interiors). */
export function covered(sim: StopSim, x: number, y: number): boolean {
  return sim.grid.flagAt(x, y, F.COVER) || sim.grid.flagAt(x, y, F.INTERIOR);
}
