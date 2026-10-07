/**
 * The road events engine (spec §12.7): which events can fire on a leg (region, column range, once per run,
 * conditions, Heat-dependent weights), which choices the party can take, weighted outcomes, chained steps,
 * and every effect kind. Camp conversations reuse the effects.
 */
import { MEMBERS } from '../content/characters';
import { ROAD_EVENTS } from '../content/events';
import type {
  ChoiceRequirement,
  EventChoice,
  EventConditions,
  EventEffect,
  EventOutcome,
  RoadEvent,
} from '../content/schema';
import { TUNING } from '../content/tuning';
import type { Rng } from '../core/rng';
import type { AndroidId, AndroidState, RunState } from '../core/types';
import { activeJune, recruitJune } from './june';
import { currentNode, revealStationAhead, rumorAhead, upcoming } from './map';
import { activeAndroids, clamp100 } from './party';

export interface EventContext {
  /** The android the event is about (`{featured}` in its text). */
  featured: AndroidId | null;
}

/** Lantern messages queued by effects (the scene shows them; ids). */
export interface EffectResult {
  lantern: string[];
}

function active(run: RunState, id: string): boolean {
  return run.party.some((m) => m.id === id && m.status === 'active');
}

export function conditionsMet(run: RunState, c: EventConditions | undefined): boolean {
  if (!c) return true;
  if (c.members && !c.members.every((id) => active(run, id))) return false;
  if (c.notMembers && c.notMembers.some((id) => active(run, id))) return false;
  if (c.minHeat !== undefined && run.heat < c.minHeat) return false;
  if (c.maxHeat !== undefined && run.heat > c.maxHeat) return false;
  if (c.minDay !== undefined && run.day < c.minDay) return false;
  if (c.maxDay !== undefined && run.day > c.maxDay) return false;
  if (c.resources)
    for (const [k, v] of Object.entries(c.resources) as [keyof RunState['resources'], number][])
      if (run.resources[k] < v) return false;
  if (c.flags && !c.flags.every((f) => run.flags.includes(f))) return false;
  if (c.notFlags && c.notFlags.some((f) => run.flags.includes(f))) return false;
  return true;
}

/** Events that can fire on the leg into the current node. */
export function eligibleEvents(run: RunState): RoadEvent[] {
  const node = currentNode(run.map);
  return ROAD_EVENTS.filter((e) => {
    if (e.oncePerRun && run.stats.eventsSeen.includes(e.id)) return false;
    if (e.regions && !e.regions.includes(node.region)) return false;
    const [lo, hi] = e.columns ?? [1, 9];
    if (node.column < lo || node.column > hi) return false;
    return conditionsMet(run, e.conditions);
  });
}

export function eventWeight(run: RunState, e: RoadEvent): number {
  if (e.heatWeight && run.heat >= e.heatWeight.minHeat) return e.heatWeight.weight;
  return e.weight;
}

/** Pick the leg's event and its featured android (null when nothing fits). */
export function pickEvent(run: RunState, rng: Rng): { event: RoadEvent; ctx: EventContext } | null {
  const pool = eligibleEvents(run);
  const event = rng.weighted(pool, (e) => eventWeight(run, e));
  if (!event) return null;
  const androids = activeAndroids(run.party);
  const ctx: EventContext = { featured: androids.length ? rng.pick(androids).id : null };
  run.stats.eventsSeen.push(event.id);
  return { event, ctx };
}

/** `{featured}` becomes the featured android's name. */
export function eventText(text: string, ctx: EventContext): string {
  return ctx.featured ? text.split('{featured}').join(MEMBERS[ctx.featured].name) : text;
}

export function requirementMet(run: RunState, r: ChoiceRequirement | undefined): boolean {
  if (!r) return true;
  if (r.member && !active(run, r.member)) return false;
  if (r.resource && run.resources[r.resource.key] < r.resource.min) return false;
  if (r.flag && !run.flags.includes(r.flag)) return false;
  return true;
}

export function choiceAvailable(run: RunState, c: EventChoice): boolean {
  return requirementMet(run, c.requires);
}

/** Take a choice: roll its outcome, apply the effects. */
export function resolveChoice(
  run: RunState,
  rng: Rng,
  choice: EventChoice,
  ctx: EventContext,
): { outcome: EventOutcome; text: string; result: EffectResult } {
  const outcome = rng.weighted(choice.outcomes, (o) => o.weight) ?? choice.outcomes[0];
  const result: EffectResult = { lantern: [] };
  for (const e of outcome.effects) applyEffect(run, e, ctx, rng, result);
  return { outcome, text: eventText(outcome.text, ctx), result };
}

// -------------------------------------------------------------------------------------------------
// Effects
// -------------------------------------------------------------------------------------------------

function targets(run: RunState, t: EventEffect & { kind: 'stat' }, ctx: EventContext): AndroidState[] {
  const all = activeAndroids(run.party);
  const tgt = t.target;
  if (tgt === 'all') return all;
  if (tgt === 'featured') return all.filter((a) => a.id === ctx.featured);
  if (typeof tgt === 'string') return all.filter((a) => a.id === tgt);
  return all.filter((a) => a.id !== tgt.except);
}

export function applyEffect(
  run: RunState,
  e: EventEffect,
  ctx: EventContext,
  rng: Rng,
  result: EffectResult = { lantern: [] },
): void {
  switch (e.kind) {
    case 'resource': {
      const r = run.resources;
      r[e.key] = Math.max(0, r[e.key] + e.delta);
      if (e.key === 'carBattery') r.carBattery = Math.min(100, r.carBattery);
      break;
    }
    case 'stat':
      for (const a of targets(run, e, ctx)) a[e.stat] = clamp100(a[e.stat] + e.delta);
      break;
    case 'heat':
      run.heat = Math.max(0, Math.min(TUNING.heat.max, run.heat + e.delta));
      break;
    case 'trust': {
      const j = activeJune(run.party);
      if (j) j.trust = clamp100(j.trust + e.delta);
      break;
    }
    case 'juneStat': {
      const j = activeJune(run.party);
      if (j) j[e.stat] = clamp100(j[e.stat] + e.delta);
      break;
    }
    case 'recruit':
      if (recruitJune(run.party, e.trust)) {
        run.stats.juneFate = 'with-party';
        if (!run.flags.includes('june-joined')) run.flags.push('june-joined');
      }
      break;
    case 'juneLeaves': {
      const j = activeJune(run.party);
      if (j) {
        j.status = 'left';
        run.stats.juneFate = e.fate;
      }
      break;
    }
    case 'flag':
      if (!run.flags.includes(e.flag)) run.flags.push(e.flag);
      break;
    case 'day':
      run.day += e.delta;
      break;
    case 'nextStop':
      if (!run.nextStopMods.includes(e.mod)) run.nextStopMods.push(e.mod);
      break;
    case 'revealStation':
      if (!revealStationAhead(run.map, run.rumors, e.columns) && e.fallbackRumor)
        rumorAhead(run.map, run.rumors, rng, e.columns, e.fallbackRumor);
      break;
    case 'revealPatrols':
      for (const n of upcoming(run.map, e.columns)) n.patrolKnown = true;
      break;
    case 'rumor':
      rumorAhead(run.map, run.rumors, rng, e.columns, e.rumor);
      break;
    case 'lantern':
      result.lantern.push(e.id);
      break;
  }
}
