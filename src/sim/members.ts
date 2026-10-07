/**
 * Player control of party members (spec §7.4): PlayerIntent → movement, Blends and the radial, Chat and
 * pings, interactions, abilities, attacks, dash, and solo character swaps. Also picks each member's visible
 * activity after movement.
 */
import { TUNING } from '../content/tuning';
import { angleOf, dist } from '../core/math';
import type { PlayerIntent, Slot } from '../core/types';
import {
  bestBlend,
  blendsFor,
  findInteraction,
  hackInput,
  scanPress,
  startAttack,
  startBlend,
  startChat,
  startDash,
  startInteraction,
  unplug,
  updateMode,
  useAbility,
} from './actions';
import { BLEND_ACTIVITY, LOOPING } from './blend';
import { leash, steer } from './movement';
import type { StopSim } from './stop';
import type { Activity, MemberActor } from './types';

const _leash = { x: 0, y: 0 };

export function controlMembers(sim: StopSim, dt: number): void {
  // Solo D-pad swap: once per press, before anyone acts (spec §7.2).
  const solo = sim.control[1] === null && !sim.waiting[1];
  const swapped = new Set<Slot>();
  for (const s of [0, 1] as Slot[]) {
    const it = sim.intents[s];
    const cur = sim.controlled(s);
    if (!solo || !it || !cur || !(it.dpad.left || it.dpad.right)) continue;
    if (cur.mode === 'free' || cur.mode === 'blend' || cur.mode === 'chat') {
      sim.swap(s, it.dpad.right ? 1 : -1);
      swapped.add(s);
    }
  }
  for (const m of sim.members) {
    if (m.controller === null) continue;
    if (swapped.has(m.controller)) {
      steer(m, 0, 0, dt);
      continue;
    }
    playerControl(sim, m, m.controller, sim.intents[m.controller], dt);
  }
  for (const m of sim.members) {
    if (m.controller === null) continue;
    updateMode(sim, m, dt, !!sim.intents[m.controller]?.interactHeld);
  }
  // Leaving: any player holds A in the exit zone for 1.5 s (spec §8.6).
  if (!sim.exit.departing) {
    let holder = -1;
    for (const m of sim.members) {
      if (m.controller === null || !sim.inExit(m.x, m.y)) continue;
      const it = sim.intents[m.controller];
      if (it?.interactHeld && (m.mode === 'free' || m.mode === 'carry')) holder = m.idx;
    }
    if (holder >= 0 && sim.carCanLeave()) {
      sim.exit.holdT += dt;
      sim.exit.holder = holder;
      if (sim.exit.holdT >= TUNING.exit.holdSeconds) sim.beginDeparture(holder);
    } else sim.exit.holdT = 0;
  }
}

export function partnerOf(sim: StopSim, m: MemberActor): MemberActor | undefined {
  if (m.controller === null) return undefined;
  const other: Slot = m.controller === 0 ? 1 : 0;
  return sim.controlled(other);
}

function playerControl(sim: StopSim, m: MemberActor, slot: Slot, it: PlayerIntent | null, dt: number): void {
  void slot;
  if (!it) {
    steer(m, 0, 0, dt);
    return;
  }
  switch (m.mode) {
    case 'hack':
      if (it.interact) hackInput(sim, m, 0);
      else if (it.dash) hackInput(sim, m, 1);
      else if (it.blendTap) hackInput(sim, m, 2);
      else if (it.ability) hackInput(sim, m, 3);
      steer(m, 0, 0, dt);
      return;
    case 'scanned':
      if (it.interact) scanPress(m);
      steer(m, 0, 0, dt);
      return;
    case 'blend': {
      const moving = Math.hypot(it.move.x, it.move.y) > 0.35;
      if (moving && (m.plug || (m.blend && LOOPING.has(m.blend)))) {
        if (m.plug) unplug(sim, m);
        if (m.blend === 'sit') {
          m.activity = 'stand';
          m.activityT = 0;
          m.seatedAt = null;
        }
        m.blend = null;
        m.mode = 'free';
        m.modeT = 0;
      }
      steer(m, 0, 0, dt);
      return;
    }
    case 'chat':
    case 'search':
    case 'channel':
    case 'glitch':
      steer(m, 0, 0, dt);
      return;
    case 'attack':
      if (
        it.attack &&
        m.id === 'vesper' &&
        m.attackKind === 'light' &&
        m.attackT > TUNING.combat.members.vesper.swing * 0.45
      ) {
        startAttack(sim, m, 'light', it.aim);
      }
      steer(m, 0, 0, dt, 6);
      return;
    case 'dash':
      return;
    case 'carry':
      carryControl(sim, m, it, dt);
      return;
    case 'free':
      freeControl(sim, m, it, dt);
      return;
    default:
      steer(m, 0, 0, dt);
  }
}

function moveSpeed(m: MemberActor, it: PlayerIntent): { speed: number; sprinting: boolean } {
  const mag = Math.min(1, Math.hypot(it.move.x, it.move.y));
  const canSprint = !m.lowPower && m.mode === 'free' && m.chargeT < 0;
  const sprinting = it.sprint && canSprint && mag > 0.5;
  let speed = sprinting ? TUNING.movement.sprintSpeed : mag * TUNING.movement.briskSpeed;
  if (m.lowPower) speed *= TUNING.movement.lowPowerSpeedMult;
  if (m.mode === 'carry' && m.id !== 'brick') speed *= TUNING.movement.carrySpeedMult;
  if (m.chargeT >= 0) speed *= 0.4;
  return { speed, sprinting };
}

function applyMove(sim: StopSim, m: MemberActor, it: PlayerIntent, dt: number): void {
  const mag = Math.hypot(it.move.x, it.move.y);
  const { speed, sprinting } = moveSpeed(m, it);
  let tvx = 0;
  let tvy = 0;
  if (mag > 0.01) {
    tvx = (it.move.x / mag) * speed;
    tvy = (it.move.y / mag) * speed;
  }
  const partner = partnerOf(sim, m);
  if (partner && sim.present(partner)) {
    leash(m, partner, tvx, tvy, _leash);
    tvx = _leash.x;
    tvy = _leash.y;
  }
  steer(m, tvx, tvy, dt);
  m.sprinting = sprinting;
  if (sprinting && m.state.kind === 'android')
    m.state.battery = Math.max(0, m.state.battery - TUNING.battery.sprintPerSecond * dt);
  if (m.chargeT >= 0 && it.aim) m.facing = angleOf(it.aim.x, it.aim.y);
}

function freeControl(sim: StopSim, m: MemberActor, it: PlayerIntent, dt: number): void {
  // Radial: hold X, pick with the stick, release to perform.
  if (it.blendHeld) {
    m.radial = true;
    const list = blendsFor(sim, m);
    const mag = Math.hypot(it.move.x, it.move.y);
    if (mag > 0.5) {
      // Options sit around a circle starting at the top, clockwise.
      const a = Math.atan2(it.move.x, -it.move.y);
      const step = (Math.PI * 2) / list.length;
      m.radialSel = Math.round((((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / step) % list.length;
    }
    if (it.dpad.up || it.dpad.left) m.radialSel = (m.radialSel - 1 + list.length) % list.length;
    if (it.dpad.down || it.dpad.right) m.radialSel = (m.radialSel + 1) % list.length;
    steer(m, 0, 0, dt);
    return;
  }
  if (m.radial) {
    m.radial = false;
    const list = blendsFor(sim, m);
    const kind = list[Math.min(m.radialSel, list.length - 1)];
    if (kind) startBlend(sim, m, kind);
    return;
  }
  if (it.blendTap) {
    startBlend(sim, m, bestBlend(sim, m));
    return;
  }
  if (it.ping) {
    const partner = partnerOf(sim, m);
    if (
      partner &&
      (partner.mode === 'free' || partner.mode === 'blend') &&
      dist(partner, m) <= TUNING.blend.chatDistance
    ) {
      if (partner.plug) unplug(sim, partner);
      if (m.plug) unplug(sim, m);
      startChat(sim, m, partner);
      return;
    }
    ping(sim, m);
  }
  if (it.ability) {
    useAbility(sim, m);
    if (m.mode !== 'free') return;
  }
  const canFight = !m.plug;
  if (it.attack && canFight && m.chargeT < 0) m.chargeT = 0;
  if (m.chargeT >= 0) {
    if (it.attackHeld) m.chargeT += dt;
    else {
      const kind = m.chargeT >= TUNING.combat.heavyChargeSeconds ? 'heavy' : 'light';
      m.chargeT = -1;
      startAttack(sim, m, kind, it.aim);
      return;
    }
  }
  if (it.dash && m.dashCd <= 0 && m.state.kind === 'android' && !m.lowPower && !m.plug) {
    const mv = Math.hypot(it.move.x, it.move.y) > 0.2 ? it.move : null;
    startDash(sim, m, mv);
    return;
  }
  const inter = findInteraction(sim, m);
  if (inter && inter.kind !== 'exit' && it.interact) {
    startInteraction(sim, m, inter);
    if (m.mode !== 'free') return;
  }
  if (m.plug) {
    if (Math.hypot(it.move.x, it.move.y) > 0.35) unplug(sim, m);
    else {
      steer(m, 0, 0, dt);
      return;
    }
  }
  applyMove(sim, m, it, dt);
}

function carryControl(sim: StopSim, m: MemberActor, it: PlayerIntent, dt: number): void {
  if (!sim.inExit(m.x, m.y) && it.interact) {
    const inter = findInteraction(sim, m);
    if (inter) startInteraction(sim, m, inter);
  }
  applyMove(sim, m, it, dt);
}

/** RB away from your partner: ping the container you're facing for an AI teammate to search. */
function ping(sim: StopSim, m: MemberActor): void {
  let best = -1;
  let bestScore = Infinity;
  for (const c of sim.containers) {
    if (c.searched) continue;
    const dx = c.cx - m.x;
    const dy = c.cy - m.y;
    const d = Math.hypot(dx, dy);
    if (d > 6) continue;
    const ang = Math.abs(
      Math.atan2(Math.sin(angleOf(dx, dy) - m.facing), Math.cos(angleOf(dx, dy) - m.facing)),
    );
    const score = d + ang * 3;
    if (score < bestScore) {
      bestScore = score;
      best = c.id;
    }
  }
  if (best < 0) return;
  for (const c of sim.containers) c.pinged = false;
  sim.containers[best].pinged = true;
  sim.emit({ t: 'sfx', cue: 'ui_move', x: sim.containers[best].cx, y: sim.containers[best].cy });
  // The nearest AI member picks it up.
  let ai: MemberActor | null = null;
  let bd = Infinity;
  for (const o of sim.members) {
    if (o.controller !== null || !sim.available(o)) continue;
    const d = dist(o, sim.containers[best].access);
    if (d < bd) {
      bd = d;
      ai = o;
    }
  }
  if (ai) {
    ai.pingTarget = best;
    ai.path = [];
  }
}

/** Pick the visible activity for every member from mode and motion. */
export function updateMemberActivities(sim: StopSim): void {
  for (const m of sim.members) {
    if (m.mode === 'gone' || m.mode === 'inCar') continue;
    const sp = Math.hypot(m.vx, m.vy);
    m.speed01 = Math.min(1, sp / TUNING.movement.briskSpeed);
    let next: Activity = m.activity;
    switch (m.mode) {
      case 'free':
        if (m.chargeT > 0.12) next = 'charge';
        else if (m.plug) next = 'plugged';
        else if (sp > 0.15) {
          const sprinting = m.sprinting;
          next = sprinting && sp > 3.4 ? 'sprint' : sp > 2.15 ? 'brisk' : 'walk';
        } else if (m.activity === 'stand' && m.activityT < 0.5) next = 'stand';
        else if (m.activity === 'getup' && m.activityT < 0.8) next = 'getup';
        else if (
          (m.activity === 'flinch' || m.activity === 'heave' || m.activity === 'heavy') &&
          m.activityT < 0.45
        )
          next = m.activity;
        else if (m.state.kind === 'android' && m.stillT > 1.2)
          next = m.id === 'vesper' ? 'paradeRest' : 'still';
        else next = 'idle';
        break;
      case 'blend':
        next = m.blend ? BLEND_ACTIVITY[m.blend] : 'idle';
        if (m.activity === 'talk' && m.blend === 'fidget' && m.blendDur < 2) next = 'talk';
        break;
      case 'chat':
        next = 'talk';
        break;
      case 'search':
        next = 'search';
        break;
      case 'channel': {
        const k = m.channel?.kind;
        next =
          k === 'patch'
            ? 'patch'
            : k === 'gate'
              ? 'hack'
              : k === 'plug' || k === 'carCharge'
                ? 'plugged'
                : k === 'exit'
                  ? 'idle'
                  : 'kneel';
        break;
      }
      case 'hack':
        next = 'hack';
        break;
      case 'attack':
        if (m.activity !== 'takedown') next = m.attackKind === 'heavy' ? 'heavy' : 'light';
        break;
      case 'dash':
        next = 'dash';
        break;
      case 'carry':
        next = 'carry';
        break;
      case 'carried':
        next = 'carried';
        break;
      case 'shutdown':
        next = 'shutdown';
        break;
      case 'down':
        next = 'down';
        break;
      case 'glitch':
        next = 'still';
        break;
      case 'scanned':
        next = 'still';
        break;
      case 'factory':
        next = sp > 0.15 ? 'brisk' : 'still';
        break;
      default:
        break;
    }
    if (next !== m.activity) {
      m.activity = next;
      m.activityT = 0;
    }
  }
}
