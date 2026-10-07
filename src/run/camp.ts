/**
 * Camp (spec §12.5): the management panel's actions and the camp conversation. Pure functions over the run;
 * the camp scene and the economy simulator both use them.
 *
 * - Cells go to the car battery or an android's Battery in steps of 5 (and can be taken back).
 * - Parts restore Hull (+25 each), Skin patches restore Skin (+35 each).
 * - A shut-down unit carried back to the car is revived for 2 Parts.
 * - June eats a Ration (−40 Hunger).
 * - A long rest gives every android +15 Integrity and +10 Hull and costs a day (not at a Station).
 */
import { CAMP_CONVERSATIONS } from '../content/conversations';
import type { CampConversation, EventEffect } from '../content/schema';
import { TUNING } from '../content/tuning';
import type { Rng } from '../core/rng';
import type { AndroidId, AndroidState, RunState } from '../core/types';
import { applyEffect } from './events';
import { juneCamp, type JuneCamp } from './june';
import { activeAndroids, clamp100 } from './party';

export type CellTarget = 'car' | AndroidId;

function android(run: RunState, id: AndroidId): AndroidState | undefined {
  const m = run.party.find((p) => p.id === id);
  return m?.kind === 'android' && m.status !== 'lost' ? m : undefined;
}

/** Move Cells into (amount > 0) or back out of (amount < 0) the car or an android, in steps of 5. */
export function moveCells(run: RunState, target: CellTarget, amount: number): number {
  const step = TUNING.run.cellsStep;
  const want = Math.trunc(amount / step) * step;
  const res = run.resources;
  const cur = target === 'car' ? res.carBattery : (android(run, target)?.battery ?? 0);
  if (target !== 'car' && !android(run, target)) return 0;
  // Into: limited by Cells and by room (100). Out of: limited by what's there.
  const moved =
    want > 0
      ? Math.min(want, Math.floor(res.cells), 100 - Math.floor(cur))
      : Math.max(want, -Math.floor(cur));
  if (moved === 0) return 0;
  res.cells -= moved;
  if (target === 'car') res.carBattery = clamp100(res.carBattery + moved);
  else {
    const a = android(run, target)!;
    a.battery = clamp100(a.battery + moved);
  }
  return moved;
}

/** One Part: +25 Hull. */
export function repairHull(run: RunState, id: AndroidId): boolean {
  const a = android(run, id);
  if (!a || a.status !== 'active' || run.resources.parts < 1 || a.hull >= 100) return false;
  run.resources.parts -= 1;
  a.hull = clamp100(a.hull + TUNING.run.partHull);
  return true;
}

/** One Skin patch: +35 Skin. */
export function patchSkin(run: RunState, id: AndroidId): boolean {
  const a = android(run, id);
  if (!a || a.status !== 'active' || run.resources.skinPatches < 1 || a.skin >= 100) return false;
  run.resources.skinPatches -= 1;
  a.skin = clamp100(a.skin + TUNING.run.patchSkin);
  return true;
}

/** Revive a shut-down unit carried back to the car (2 Parts). It wakes at 20 Hull. */
export function reviveCarried(run: RunState, id: AndroidId): boolean {
  const a = android(run, id);
  const cost = TUNING.shutdown.campReviveParts;
  if (!a || a.status !== 'shutdown' || !run.carried.includes(id) || run.resources.parts < cost) return false;
  run.resources.parts -= cost;
  a.status = 'active';
  a.hull = Math.max(a.hull, TUNING.shutdown.reviveHull);
  run.carried = run.carried.filter((c) => c !== id);
  return true;
}

/** June eats (free at a Station). */
export function feedJune(run: RunState, free: boolean): JuneCamp {
  return juneCamp(run.party, run.resources, free);
}

/** A long rest: +15 Integrity and +10 Hull for every android; a day, except at a Station. */
export function longRest(run: RunState, atStation: boolean): void {
  const R = TUNING.run;
  for (const a of activeAndroids(run.party)) {
    a.integrity = clamp100(a.integrity + R.longRestIntegrity);
    a.hull = clamp100(a.hull + R.longRestHull);
  }
  if (!atStation) run.day += 1;
}

// -------------------------------------------------------------------------------------------------
// Camp conversations (§12.5, §12.10)
// -------------------------------------------------------------------------------------------------

function memberActive(run: RunState, id: string): boolean {
  return run.party.some((m) => m.id === id && m.status === 'active');
}

/** Conversations that fit the party right now. */
export function campConversations(run: RunState): CampConversation[] {
  const androids = activeAndroids(run.party);
  const lostSomeone = run.stats.lostLog.length > 0 || run.stats.juneFate === 'left';
  return CAMP_CONVERSATIONS.filter((c) => {
    if (!c.requires.every((id) => memberActive(run, id))) return false;
    const w = c.when;
    if (!w) return true;
    if (w.someIntegrityBelow !== undefined && !androids.some((a) => a.integrity < w.someIntegrityBelow!))
      return false;
    if (w.allIntegrityAtLeast !== undefined && !androids.every((a) => a.integrity >= w.allIntegrityAtLeast!))
      return false;
    if (w.flags && !w.flags.every((f) => run.flags.includes(f))) return false;
    if (w.notFlags && w.notFlags.some((f) => run.flags.includes(f))) return false;
    if (w.minDay !== undefined && run.day < w.minDay) return false;
    if (w.maxDay !== undefined && run.day > w.maxDay) return false;
    if (w.minHeat !== undefined && run.heat < w.minHeat) return false;
    if (w.afterLoss && !lostSomeone) return false;
    return true;
  });
}

/** Pick tonight's conversation: unheard ones first (heard ones are flagged `conv-<id>`). */
export function pickCampConversation(run: RunState, rng: Rng): CampConversation | null {
  const fits = campConversations(run);
  const fresh = fits.filter((c) => !run.flags.includes(`conv-${c.id}`));
  const pool = fresh.length > 0 ? fresh : fits;
  const c = rng.weighted(pool, (x) => x.weight ?? 1) ?? null;
  if (c) {
    const flag = `conv-${c.id}`;
    if (!run.flags.includes(flag)) run.flags.push(flag);
  }
  return c;
}

/** A conversation's effects (Integrity, Trust, flags) go through the events engine. */
export function campEffects(run: RunState, effects: readonly EventEffect[], rng: Rng): void {
  for (const e of effects) applyEffect(run, e, { featured: null }, rng);
}
