/**
 * Memory cores and unlocks (spec §15): every run ends with an award of memory cores, which buy perks that
 * apply to every new run. Pure functions over MetaState and RunState (the run flow persists the save).
 */
import { TUNING } from '../content/tuning';
import { Rng, hashSeed } from '../core/rng';
import type { MetaState, PerkId, RunState } from '../core/types';
import { addRumor, rumorAhead } from './map';

/** Perks in the order the core screen lists them. */
export const PERK_ORDER: readonly PerkId[] = [
  'spare-cells',
  'forged-papers',
  'field-kit',
  'network-contacts',
  'old-route',
];

export const PERK_INFO: Record<PerkId, { name: string; text: string }> = {
  'spare-cells': { name: 'Spare cells', text: `Start with ${TUNING.meta.spareCells} extra Cells.` },
  'forged-papers': { name: 'Forged papers', text: 'Start with 1 extra Papers.' },
  'field-kit': { name: 'Field kit', text: 'Start with 1 extra Skin patch.' },
  'network-contacts': { name: 'Network contacts', text: 'One Station shows on the map from the start.' },
  'old-route': { name: 'Old route', text: 'Start with one rumor about the road ahead.' },
};

/** What a finished run earned, line by line (the core screen shows the breakdown). */
export interface CoreAward {
  /** Legs set out on (Boston to the Port is 10). */
  legs: number;
  fromLegs: number;
  /** Androids lost by the end of the run. */
  lost: number;
  fromLost: number;
  /** Cores for reaching Ghana (0 otherwise). */
  ghana: number;
  total: number;
}

/** Cores for a finished run: 1 per 2 legs completed, 1 per android lost, 3 for reaching Ghana. */
export function coreAward(run: RunState, reachedGhana: boolean): CoreAward {
  const M = TUNING.meta;
  const legs = run.leg;
  const lost = run.party.filter((m) => m.kind === 'android' && m.status === 'lost').length;
  const fromLegs = Math.floor(legs / 2) * M.coresPerTwoLegs;
  const fromLost = lost * M.coresPerLost;
  const ghana = reachedGhana ? M.coresGhana : 0;
  return { legs, fromLegs, lost, fromLost, ghana, total: fromLegs + fromLost + ghana };
}

/** Bank an award: the cores, the lifetime total, and the run and win counts. */
export function awardCores(meta: MetaState, award: CoreAward): void {
  meta.cores += award.total;
  meta.coresEarned += award.total;
  meta.runs += 1;
  if (award.ghana > 0) meta.wins += 1;
}

export function perkCost(p: PerkId): number {
  return TUNING.meta.perkCosts[p];
}

export function canBuy(meta: MetaState, p: PerkId): boolean {
  return !meta.unlocked.includes(p) && meta.cores >= perkCost(p);
}

/** Spend cores on a perk. Returns false (and changes nothing) if it's owned or unaffordable. */
export function buyPerk(meta: MetaState, p: PerkId): boolean {
  if (!canBuy(meta, p)) return false;
  meta.cores -= perkCost(p);
  meta.unlocked.push(p);
  return true;
}

/**
 * Apply the unlocked perks to a new run before the first leg. The Station and the rumor are picked with their
 * own seeded streams, so a perk never shifts the run's own rolls.
 */
export function applyPerks(run: RunState, unlocked: readonly PerkId[]): void {
  const has = (p: PerkId): boolean => unlocked.includes(p);
  if (has('spare-cells')) run.resources.cells += TUNING.meta.spareCells;
  if (has('forged-papers')) run.resources.papers += 1;
  if (has('field-kit')) run.resources.skinPatches += 1;
  if (has('network-contacts')) {
    const hidden = run.map.nodes.filter((n) => n.type === 'station' && !n.revealed);
    if (hidden.length > 0)
      addRumor(run.rumors, 'station', new Rng(hashSeed('perk-station', run.seed)).pick(hidden));
  }
  if (has('old-route'))
    rumorAhead(run.map, run.rumors, new Rng(hashSeed('perk-rumor', run.seed)), TUNING.run.columns);
}

/** One line per unlocked perk, for the join screen. */
export function perkLines(meta: MetaState): string[] {
  return PERK_ORDER.filter((p) => meta.unlocked.includes(p)).map(
    (p) => `${PERK_INFO[p].name}: ${PERK_INFO[p].text}`,
  );
}
