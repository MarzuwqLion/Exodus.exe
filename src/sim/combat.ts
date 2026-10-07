/**
 * Light combat (spec §8.9): party light and heavy attacks resolve on their hit frame against humans in an
 * arc. Non-lethal: humans at 0 HP are knocked out for the stop (each one adds Heat via the stop outcome).
 */
import { TUNING } from '../content/tuning';
import { angleDiff, angleOf } from '../core/math';
import { knockOut, swingTime } from './actions';
import type { StopSim } from './stop';
import type { MemberActor } from './types';

export function resolveCombat(sim: StopSim, dt: number): void {
  void dt;
  for (const m of sim.members) {
    if (m.mode !== 'attack' || m.attackHit || !m.attackKind) continue;
    const kind = m.attackKind;
    if (m.attackT < swingTime(m, kind) * 0.5) continue;
    m.attackHit = true;
    strike(sim, m, kind);
  }
}

function strike(sim: StopSim, m: MemberActor, kind: 'light' | 'heavy'): void {
  const C = TUNING.combat;
  const range = kind === 'heavy' ? C.heavyRange : C.lightRange;
  const arc = (C.lightArcDeg * Math.PI) / 180 / 2;
  const stats = C.members[m.id];
  let dmg = kind === 'heavy' ? stats.heavy : stats.light;
  if (m.id === 'vesper' && kind === 'light' && m.combo >= 2) dmg *= 1.5;
  const kb = kind === 'heavy' ? (m.id === 'brick' ? C.heavyKnockback * 1.5 : C.heavyKnockback) : C.knockback;
  let hitAny = false;
  for (const n of sim.npcs) {
    if (!sim.isActiveNpc(n) || n.role === 'keeper' || n.role === 'crew' || n.role === 'mensah') continue;
    const dx = n.x - m.x;
    const dy = n.y - m.y;
    const d = Math.hypot(dx, dy);
    if (d > range + n.radius) continue;
    if (d > 0.3 && Math.abs(angleDiff(m.facing, angleOf(dx, dy))) > arc) continue;
    hitAny = true;
    n.hp -= dmg;
    n.hitFlash = 0.12;
    n.stunT = kind === 'heavy' ? 0.6 : 0.3;
    n.attackT = -1;
    const a = angleOf(dx, dy);
    n.vx += Math.cos(a) * kb;
    n.vy += Math.sin(a) * kb;
    n.activity = 'flinch';
    n.activityT = 0;
    // Being hit makes anyone a witness.
    n.obs.awareness[m.id] = TUNING.awareness.alarmed;
    sim.emit({ t: 'hit', x: n.x, y: n.y, heavy: kind === 'heavy', spark: false });
    sim.emit({ t: 'sfx', cue: kind === 'heavy' ? 'hit_heavy' : 'hit_light', x: n.x, y: n.y });
    if (n.hp <= 0) {
      knockOut(sim, n, m);
      sim.emit({ t: 'sfx', cue: 'knockout', x: n.x, y: n.y });
    } else if (!sim.alert.on) {
      sim.raiseAlert({ x: m.x, y: m.y });
    }
  }
  if (hitAny) {
    sim.emit({ t: 'hitpause', frames: TUNING.combat.hitPauseFrames });
    sim.emit({ t: 'shake', amount: kind === 'heavy' ? 2 : 1 });
    if (m.controller !== null) sim.emit({ t: 'rumble', slot: m.controller, kind: 'hit' });
  }
}
