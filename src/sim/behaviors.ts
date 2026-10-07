/**
 * Suspicious behavior (spec §8.2, §9 tells): each tick, compute the rate at which observers who can see a
 * member grow suspicious of them. Instant spikes (dash, glitch, head snap, a broken stool) accumulate in
 * `member.spike` and are applied by perception. Visible chassis multiplies everything (×1 at full Skin,
 * ×2 at 0 Skin).
 */
import { TUNING } from '../content/tuning';
import { angleDiff, clamp01, lerp } from '../core/math';
import { covered } from './actions';
import { F } from './grid';
import type { StopSim } from './stop';
import type { MemberActor } from './types';

const SAMPLE_DT = 0.1;
const DEG = Math.PI / 180;

export function chassisMult(m: MemberActor): number {
  if (m.state.kind !== 'android') return 1;
  return 1 + (1 - Math.max(0, Math.min(100, m.state.skin)) / 100) * (TUNING.awareness.chassisMultMax - 1);
}

function humanWithin(sim: StopSim, m: MemberActor, r: number): boolean {
  for (const n of sim.npcs) {
    if (!sim.isActiveNpc(n) || n.role === 'keeper' || n.role === 'crew' || n.role === 'mensah') continue;
    if (Math.hypot(n.x - m.x, n.y - m.y) <= r) return true;
  }
  return false;
}

/** Wanted posters hang on corkboards at Heat 2+ in diners and gas stations (spec §10.3, §11.6). */
export function postersUp(sim: StopSim): boolean {
  return sim.cfg.heat >= TUNING.heat.postersAt && (sim.kind === 'diner' || sim.kind === 'gas');
}

function nearPoster(sim: StopSim, m: MemberActor): boolean {
  const r = TUNING.rates.wantedPosterRadius;
  const g = sim.grid;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const tx = Math.floor(m.x) + dx;
      const ty = Math.floor(m.y) + dy;
      if (g.charAt(tx, ty) !== 'Q') continue;
      if (Math.hypot(tx + 0.5 - m.x, ty + 0.5 - m.y) <= r) return true;
    }
  }
  return false;
}

export function updateBehaviors(sim: StopSim, dt: number): void {
  const R = TUNING.rates;
  const T = TUNING.tells;
  const brisk = TUNING.movement.briskSpeed;
  for (const m of sim.members) {
    m.rate = 0;
    if (!sim.present(m) || m.mode === 'carried' || m.mode === 'shutdown' || m.mode === 'down') {
      m.stillT = 0;
      continue;
    }
    const android = m.state.kind === 'android';
    const sp = Math.hypot(m.vx, m.vy);
    const performing = m.mode === 'blend' || m.mode === 'chat';
    let rate = 0;

    if (m.sprinting && sp > brisk * 1.1) rate += R.sprint;
    if (m.mode === 'search' && m.channel) {
      const c = sim.containers[m.channel.target];
      if (c?.private) rate += R.searchPrivate;
    }
    if (m.mode === 'hack') rate += R.hack;
    if (sim.grid.flagAt(m.x, m.y, F.STAFF)) rate += R.staffZone;
    if (m.mode === 'carry') rate += R.carryUnit;

    if (android) {
      // Uncanny stillness: standing still for more than 4 s without Blending.
      if (performing) m.stillT = 0;
      else if (m.mode === 'free' && sp < 0.15) m.stillT += dt;
      else m.stillT = 0;
      const wrenClose = m.id === 'wren' && humanWithin(sim, m, T.wrenRadius);
      const threshold = wrenClose ? T.wrenStillSeconds : R.stillnessStartSeconds;
      if (m.stillT > threshold) {
        let r = lerp(
          R.stillnessRateStart,
          R.stillnessRateMax,
          clamp01((m.stillT - threshold) / R.stillnessRampSeconds),
        );
        if (wrenClose) r *= T.wrenMult;
        if (m.id === 'vesper') r *= T.vesperStillMult;
        rate += r;
      }

      // Robotic movement: a perfectly straight line at constant full speed for more than 3 s.
      if (performing || m.mode !== 'free' || sp < brisk * R.roboticMinSpeedFrac) {
        m.histN = 0;
        m.histT = 0;
        m.roboticT = 0;
      } else {
        m.histT += dt;
        if (m.histT >= SAMPLE_DT) {
          m.histT -= SAMPLE_DT;
          const cap = m.headHist.length;
          m.headHist[m.histI] = Math.atan2(m.vy, m.vx);
          m.speedHist[m.histI] = sp;
          m.histI = (m.histI + 1) % cap;
          m.histN = Math.min(cap, m.histN + 1);
        }
        const need = Math.round(R.roboticAfterSeconds / SAMPLE_DT);
        if (m.histN >= need && isRobotic(m, need)) {
          if (m.roboticT === 0) sim.tutorialLog.roboticFired++;
          m.roboticT += dt;
          rate += R.robotic;
        } else m.roboticT = 0;
      }

      // Skipping human needs.
      if (sim.kind === 'diner' && sim.grid.flagAt(m.x, m.y, F.INTERIOR)) {
        m.dinerT += dt;
        if (m.dinerT > R.dinerOrderGraceSeconds && !m.ordered) rate += R.skippingNeeds;
      }
      if (m.mode === 'blend' && m.blend === 'sit' && sim.kind === 'diner' && !m.hasCoffee)
        rate += R.skippingNeeds;
      if (sim.raining && m.mode === 'free' && sp < 0.15 && !covered(sim, m.x, m.y)) {
        m.rainT += dt;
        if (m.rainT > R.rainNoReactionSeconds) rate += R.skippingNeeds;
      } else m.rainT = 0;

      if (postersUp(sim) && nearPoster(sim, m)) rate += R.wantedPoster;

      // Vesper's tell: her head snaps toward any human who comes within 5 m.
      if (m.id === 'vesper' && m.mode !== 'chat') {
        for (const n of sim.npcs) {
          if (!sim.isActiveNpc(n) || n.role === 'keeper' || n.role === 'crew' || n.role === 'mensah')
            continue;
          const d = Math.hypot(n.x - m.x, n.y - m.y);
          if (d <= T.vesperSnapRadius && !m.nearHumans.has(n.idx)) {
            m.nearHumans.add(n.idx);
            if (!performing) {
              m.spike += T.vesperSnapAwareness;
              m.headSnapT = 0.35;
              m.facing = Math.atan2(n.y - m.y, n.x - m.x);
            }
          } else if (d > T.vesperSnapRadius + 1.5) m.nearHumans.delete(n.idx);
        }
      }

      // Brick's tell: heavy footsteps carry.
      if (m.id === 'brick' && sp > 0.4 && (m.mode === 'free' || m.mode === 'carry')) {
        m.stepT += dt * (sp / 1.3);
        if (m.stepT >= 0.5) {
          m.stepT = 0;
          const sprint = m.sprinting;
          sim.noise(m.x, m.y, sprint ? T.brickSprintHearing : T.brickWalkHearing, sprint ? 1 : 0.25, m.idx);
        }
      }
    }
    if (m.headSnapT > 0) m.headSnapT -= dt;
    m.rate = rate * chassisMult(m);
  }
}

/** Heading and speed barely vary across the last `n` samples. */
function isRobotic(m: MemberActor, n: number): boolean {
  const cap = m.headHist.length;
  const ref = m.headHist[(m.histI - 1 + cap) % cap];
  let sumA = 0;
  let sumA2 = 0;
  let sumS = 0;
  let sumS2 = 0;
  for (let k = 0; k < n; k++) {
    const i = (m.histI - 1 - k + cap * 2) % cap;
    const a = angleDiff(ref, m.headHist[i]);
    sumA += a;
    sumA2 += a * a;
    const s = m.speedHist[i];
    sumS += s;
    sumS2 += s * s;
  }
  const meanA = sumA / n;
  const stdA = Math.sqrt(Math.max(0, sumA2 / n - meanA * meanA));
  const meanS = sumS / n;
  const stdS = Math.sqrt(Math.max(0, sumS2 / n - meanS * meanS));
  return (
    stdA < TUNING.rates.roboticMaxHeadingStdDeg * DEG &&
    stdS / Math.max(0.01, meanS) < TUNING.rates.roboticMaxSpeedStdFrac
  );
}
