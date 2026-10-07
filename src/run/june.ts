/**
 * June's run-level systems (spec §9.5): joining, Hunger and Rations, starving, Trust and leaving, the
 * logged kiosk sessions that add Heat, and the conductor's longer view of the map. Her stop abilities (the
 * legal kiosk and Patch) live in the stop simulation. Pure functions over party and resource data.
 */
import { TUNING } from '../content/tuning';
import type { Rng } from '../core/rng';
import type { HumanState, MemberState, Resources } from '../core/types';
import { clamp100, juneOf, newJune } from './party';

const MAX_PARTY = 4;

/** June joins (from an event) with this starting Trust, if there's room in the car. */
export function recruitJune(party: MemberState[], trust: number): boolean {
  if (juneOf(party)) return false;
  const active = party.filter((m) => m.status !== 'lost' && m.status !== 'left').length;
  if (active >= MAX_PARTY) return false;
  party.push(newJune(clamp100(trust)));
  return true;
}

/** June still travelling with the party. */
export function activeJune(party: readonly MemberState[]): HumanState | undefined {
  const j = juneOf(party);
  return j && j.status === 'active' ? j : undefined;
}

/** Each leg of the road makes her hungrier. */
export function juneLeg(party: MemberState[]): void {
  const j = activeJune(party);
  if (j) j.hunger = clamp100(j.hunger + TUNING.run.juneHungerPerLeg);
}

export interface JuneCamp {
  ate: boolean;
  starving: boolean;
  /** At 0 Health she leaves to find help (she doesn't die). */
  left: boolean;
}

/**
 * Camp: she eats a Ration if the party has one (a Station feeds her for free). Hunger at 100 costs Health;
 * at 0 Health she leaves the party to find help.
 */
export function juneCamp(party: MemberState[], res: Resources, freeMeal: boolean): JuneCamp {
  const out: JuneCamp = { ate: false, starving: false, left: false };
  const j = activeJune(party);
  if (!j) return out;
  const R = TUNING.run;
  if (freeMeal || res.rations > 0) {
    if (!freeMeal) res.rations -= 1;
    j.hunger = clamp100(j.hunger - R.rationHunger);
    out.ate = true;
  }
  if (j.hunger >= 100) {
    out.starving = true;
    j.health = clamp100(j.health - R.juneStarveHealth);
    if (j.health <= 0) {
      j.status = 'left';
      out.left = true;
    }
  }
  return out;
}

/** Trust moves with how the party treats people (events). It's never shown. */
export function adjustTrust(party: MemberState[], delta: number): void {
  const j = activeJune(party);
  if (j) j.trust = clamp100(j.trust + delta);
}

/** At a Station, with Trust below 20, she may say a quiet goodbye and stay behind. */
export function juneLeavesAtStation(party: MemberState[], rng: Rng): boolean {
  const j = activeJune(party);
  if (!j || j.trust >= TUNING.run.juneLeaveTrust) return false;
  if (!rng.chance(TUNING.run.juneLeaveChance)) return false;
  j.status = 'left';
  return true;
}

/** Heat added by her logged kiosk sessions: 1 for every 2 sessions over the run. */
export function kioskHeat(usesBefore: number, usesAfter: number): number {
  const per = TUNING.heat.juneKioskUsesPerHeat;
  return Math.floor(usesAfter / per) - Math.floor(usesBefore / per);
}

/** The conductor knows the network: with June, Stations show two columns ahead instead of one. */
export function stationRevealColumns(party: readonly MemberState[]): number {
  return activeJune(party) ? 2 : 1;
}
