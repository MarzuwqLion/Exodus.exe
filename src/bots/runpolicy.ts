/**
 * A careful player's run decisions, shared by the economy simulator (tools/economy.ts) and the scripted full
 * run (fullrun.ts): what an event choice is worth, where to go next, and how to spend camp.
 */
import type { EventChoice, EventEffect } from '../content/schema';
import type { MapNode, Resources, RunState, StopModifier } from '../core/types';
import type { Rng } from '../core/rng';
import { feedJune, longRest, moveCells, patchSkin, repairHull, reviveCarried } from '../run/camp';
import { activeJune } from '../run/june';
import { shownType } from '../run/map';
import { activeAndroids } from '../run/party';
import { sailing } from '../run/run';

const MOD_VALUE: Record<StopModifier, number> = {
  droneAtStart: -15,
  cellsCache: 10,
  recyclerActivity: -10,
  sympatheticStaff: 10,
  gateCrewSympathizers: 15,
  extraGuard: -10,
  crowded: 0,
};

const RES_VALUE: Record<keyof Resources, number> = {
  cells: 1,
  carBattery: 1,
  parts: 8,
  skinPatches: 6,
  papers: 12,
  rations: 3,
};

/** A rough worth for an effect, from a careful player's point of view. */
export function effectValue(run: RunState, e: EventEffect): number {
  const androids = activeAndroids(run.party).length || 1;
  const slack = sailing(run).slack;
  switch (e.kind) {
    case 'resource':
      return RES_VALUE[e.key] * e.delta;
    case 'stat': {
      const per = e.stat === 'integrity' ? 0.7 : e.stat === 'hull' ? 0.5 : e.stat === 'battery' ? 0.8 : 0.3;
      const n = e.target === 'all' ? androids : typeof e.target === 'object' ? androids - 1 : 1;
      return per * e.delta * n;
    }
    case 'heat':
      return -(run.heat >= 2 ? 40 : 25) * e.delta;
    case 'day':
      return -(slack <= 1 ? 80 : 30) * e.delta;
    case 'trust':
      return 0.2 * e.delta;
    case 'juneStat':
      return 0.2 * e.delta;
    case 'recruit':
      return 25;
    case 'juneLeaves':
      return -20;
    case 'nextStop':
      return MOD_VALUE[e.mod];
    case 'revealStation':
      return 15;
    case 'revealPatrols':
    case 'rumor':
      return 5;
    default:
      return 0;
  }
}

export function choiceValue(run: RunState, c: EventChoice): number {
  const total = c.outcomes.reduce((s, o) => s + o.weight, 0) || 1;
  return c.outcomes.reduce(
    (s, o) => s + (o.weight / total) * o.effects.reduce((v, e) => v + effectValue(run, e), 0),
    0,
  );
}

export function sensibleCamp(
  run: RunState,
  atStation: boolean,
  rng: Rng,
  t: { car: number; battery: number; restBelow: number },
): void {
  for (const id of [...run.carried]) reviveCarried(run, id);
  // Repairs first (Parts are worth more than Cells), keeping a Part for emergencies.
  for (const a of activeAndroids(run.party)) {
    while (a.hull < 60 && (run.resources.parts > 1 || a.hull < 35) && repairHull(run, a.id));
    while (a.skin < 65 && patchSkin(run, a.id));
  }
  // Charge: the car for the next two legs, then every unit to a safe level, then share the rest.
  while (run.resources.carBattery < t.car && run.resources.cells >= 5 && moveCells(run, 'car', 5) > 0);
  for (const a of activeAndroids(run.party))
    while (a.battery < t.battery && run.resources.cells >= 5 && moveCells(run, a.id, 5) > 0);
  const androids = activeAndroids(run.party).sort((x, y) => x.battery - y.battery);
  for (const a of androids)
    while (a.battery < 85 && run.resources.cells >= 25 && moveCells(run, a.id, 5) > 0);
  const june = activeJune(run.party);
  if (june && (june.hunger >= 40 || atStation)) feedJune(run, atStation);
  // Rest long when it's free (a Station) or when Integrity is slipping and the clock allows.
  const low = activeAndroids(run.party).some((a) => a.integrity < t.restBelow || a.hull < 40);
  if (atStation || (low && sailing(run).slack >= 2)) longRest(run, atStation);
  void rng;
}

export function competentRoute(run: RunState, options: MapNode[], rng: Rng, greedy: boolean): MapNode {
  const androids = activeAndroids(run.party);
  const hurt = androids.some((a) => a.integrity < 60 || a.hull < 60);
  const score = (n: MapNode): number => {
    const t = shownType(n);
    let s = rng.range(0, 3);
    if (t === 'station') s += hurt ? 40 : 25;
    if (t === 'depot') s += run.resources.cells < 40 ? 20 : 10;
    if (t === 'gas') s += run.resources.carBattery < 40 ? 18 : 6;
    if (t === 'diner') s += activeJune(run.party) && run.resources.rations < 2 ? 12 : greedy ? 4 : 8;
    if (n.patrolKnown) s -= (n.patrol - 1) * (run.heat >= 2 ? 8 : 4);
    for (const r of run.rumors) {
      if (r.nodeId !== n.id) continue;
      if (r.kind === 'cells-cache' || r.kind === 'sympathetic-staff') s += 8;
      if (r.kind === 'recycler-activity') s -= 8;
    }
    s -= n.distance * 0.3;
    return s;
  };
  return [...options].sort((a, b) => score(b) - score(a))[0];
}

/** The best-valued available choice (a careful player). */
export function bestChoice(run: RunState, choices: EventChoice[]): EventChoice {
  return [...choices].sort((a, b) => choiceValue(run, b) - choiceValue(run, a))[0];
}
