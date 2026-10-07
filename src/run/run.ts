/**
 * The run (spec §12.1–12.4, §11.6): Boston to the Port in ten legs on the sailing clock. Pure state
 * transitions over RunState, shared by the scenes, saves, and the economy simulator:
 *
 *   map: pick the next node → leg (drive or walk; costs; maybe a road event) → arrive (stop, Station,
 *   checkpoint, or the Port) → apply the outcome → camp → back to the map.
 */
import { layoutFor, type StopLayoutKind } from '../content/layouts';
import { TUNING } from '../content/tuning';
import { Rng, hashSeed } from '../core/rng';
import type { AndroidId, MapNode, MemberId, MemberState, Resources, RunState, Slot } from '../core/types';
import type { StopConfig } from '../sim/stop';
import type { StopOutcome } from '../sim/types';
import { juneLeg, kioskHeat } from './june';
import { currentNode, generateMap, nodeById, revealAhead, rumorAhead, rumorMods } from './map';
import { activeAndroids, clamp100, juneOf, startingParty, startingResources } from './party';
import { stationLayout, keeperForColumn } from './station';

export interface NewRunOpts {
  party?: MemberState[];
  control?: Record<Slot, MemberId | null>;
  resources?: Resources;
}

export function newRun(seed: number, o: NewRunOpts = {}): RunState {
  const run: RunState = {
    version: 1,
    seed,
    rngState: hashSeed('run', seed),
    day: 1,
    leg: 0,
    column: 0,
    heat: 0,
    resources: o.resources ?? startingResources(),
    party: o.party ?? startingParty(),
    control: o.control ?? { 0: 'wren', 1: null },
    map: generateMap(seed),
    rumors: [],
    flags: [],
    stats: {
      stops: 0,
      cellsGathered: 0,
      timesExposed: 0,
      unitsLost: 0,
      knockouts: 0,
      busts: 0,
      checkpointsPassed: 0,
      eventsSeen: [],
      playTimeMs: 0,
      juneFate: 'never-met',
      lostLog: [],
    },
    carried: [],
    pendingResets: [],
    nextStopMods: [],
    juneKioskUses: 0,
    lanternSeen: [],
    alertThisLeg: false,
    phase: 'map',
  };
  revealAhead(run.map, run.party);
  return run;
}

/** Roll with the run's own seeded stream (its state is saved with the run). */
export function withRng<T>(run: RunState, f: (rng: Rng) => T): T {
  const rng = new Rng(run.rngState);
  const out = f(rng);
  run.rngState = rng.state;
  return out;
}

export function addHeat(run: RunState, delta: number): void {
  run.heat = Math.max(0, Math.min(TUNING.heat.max, run.heat + delta));
}

/** Days left before the Sankofa sails, and legs left to the Port. Slack is their difference. */
export function sailing(run: RunState): { daysLeft: number; legsLeft: number; slack: number } {
  const daysLeft = TUNING.run.shipDay - run.day;
  const legsLeft = TUNING.run.columns - currentNode(run.map).column;
  return { daysLeft, legsLeft, slack: daysLeft - legsLeft };
}

// -------------------------------------------------------------------------------------------------
// Legs
// -------------------------------------------------------------------------------------------------

export interface LegPlan {
  to: MapNode;
  /** No charge for the drive: the party walks it (no drive scene, −15 Battery each, +1 day). */
  walking: boolean;
  /** A road event interrupts the drive (about 70% of legs). */
  event: boolean;
}

/** The party sets out for a node in the next column. Spends the leg's costs and advances the clock. */
export function beginLeg(run: RunState, toId: string): LegPlan {
  const cur = currentNode(run.map);
  if (!cur.next.includes(toId)) throw new Error(`${toId} is not reachable from ${cur.id}`);
  const to = nodeById(run.map, toId);
  const B = TUNING.battery;
  juneLeg(run.party);
  const walking = run.resources.carBattery < to.distance;
  if (walking) run.day += 1;
  else run.resources.carBattery -= to.distance;
  for (const a of activeAndroids(run.party))
    a.battery = Math.max(0, a.battery - (walking ? B.walkPerLeg : B.perLeg));
  run.day += 1;
  run.leg += 1;
  run.alertThisLeg = false;
  run.map.current = to.id;
  run.column = to.column;
  to.visited = true;
  const event =
    !walking && to.type !== 'port' && withRng(run, (rng) => rng.chance(TUNING.run.roadEventChance));
  run.phase = event ? 'event' : arrivalPhase(to);
  return { to, walking, event };
}

/** What the party does when it gets there. */
export function arrivalPhase(n: MapNode): RunState['phase'] {
  if (n.type === 'checkpoint') return 'checkpoint';
  if (n.type === 'port') return 'port';
  return 'stop';
}

/** The ship sails at dawn on Day 14: anywhere but the Port by then, and the run is over (§12.3). */
export function missedTheShip(run: RunState): boolean {
  return run.day >= TUNING.run.shipDay && currentNode(run.map).type !== 'port';
}

export function allAndroidsLost(run: RunState): boolean {
  return run.party.every((m) => m.kind !== 'android' || m.status === 'lost');
}

// -------------------------------------------------------------------------------------------------
// Stops
// -------------------------------------------------------------------------------------------------

/** The stop configuration for the current node (stops, Stations, compromised Stations, checkpoint busts). */
export function stopConfigForRun(
  run: RunState,
  o: { compromised?: boolean; bust?: boolean } = {},
): StopConfig {
  const node = currentNode(run.map);
  let layout;
  if (o.bust) layout = layoutFor('checkpoint', 0);
  else if (node.type === 'station') {
    const keeper = keeperForColumn(node.column);
    if (!keeper) throw new Error(`no keeper for column ${node.column}`);
    layout = stationLayout(keeper, o.compromised);
  } else layout = layoutFor(node.type as StopLayoutKind, node.layoutVariant);
  return {
    layout,
    seed: hashSeed('stop', run.seed, run.leg),
    region: node.region,
    weather: node.weather,
    heat: run.heat,
    day: run.day,
    party: run.party.map((m) => ({ ...m })),
    control: { ...run.control },
    resources: { ...run.resources },
    mods: [...run.nextStopMods, ...rumorMods(run.rumors, node.id)],
    flags: [...run.flags],
    pendingResets: [...run.pendingResets],
    juneKioskUses: run.juneKioskUses,
    startAlert: o.bust,
    bust: o.bust,
  };
}

/** Bring a stop's outcome back into the run (resources, the party, losses, Heat, rumors heard). */
export function applyStopOutcome(run: RunState, out: StopOutcome, where: string): void {
  const H = TUNING.heat;
  run.resources = { ...out.resources };
  run.party = out.party.map((m) => ({ ...m }));
  for (const id of out.carried) if (!run.carried.includes(id)) run.carried.push(id);
  run.nextStopMods = [];
  run.stats.stops += 1;
  run.stats.cellsGathered += out.cellsGathered;
  for (const l of out.lost) {
    run.stats.lostLog.push({ member: l.member, where, how: l.how });
    if (l.member === 'june') run.stats.juneFate = out.juneArrested ? 'arrested' : 'left';
    else run.stats.unitsLost += 1;
  }
  if (out.alert) {
    run.alertThisLeg = true;
    run.stats.timesExposed += 1;
    addHeat(run, H.alert);
  }
  if (out.knockouts > 0) {
    run.stats.knockouts += out.knockouts;
    addHeat(run, H.knockout * out.knockouts);
  }
  const kiosk = kioskHeat(run.juneKioskUses, out.juneKioskUses);
  if (kiosk > 0) addHeat(run, kiosk);
  run.juneKioskUses = out.juneKioskUses;
  for (const f of out.flagsSet) if (!run.flags.includes(f)) run.flags.push(f);
  // Factory resets that were resolved (pulled back or lost) are done.
  run.pendingResets = run.pendingResets.filter((id) => !out.resetsResolved.includes(id));
  // The diner TV: rumors about the road ahead.
  withRng(run, (rng) => {
    for (let i = 0; i < out.rumorsSeen; i++) rumorAhead(run.map, run.rumors, rng, 2);
  });
  run.phase = 'camp';
}

// -------------------------------------------------------------------------------------------------
// Heat (§11.6) and the end of a leg
// -------------------------------------------------------------------------------------------------

/**
 * Close out a leg at the end of camp: Heat decays without an ALERT (and a Station takes a little more off),
 * units still at 0 Battery shut down for good, units at 0 Integrity will reset at the next stop, and the road
 * ahead reveals itself.
 */
export function endLeg(run: RunState, atStation: boolean): { deadBattery: AndroidId[]; revealed: MapNode[] } {
  const H = TUNING.heat;
  if (!run.alertThisLeg) addHeat(run, -H.decayPerLeg);
  if (atStation) addHeat(run, -H.stationDecay);
  const deadBattery: AndroidId[] = [];
  for (const m of run.party) {
    if (m.kind !== 'android' || m.status === 'lost') continue;
    if (m.battery <= 0 && !run.carried.includes(m.id)) {
      m.status = 'lost';
      deadBattery.push(m.id);
      run.stats.unitsLost += 1;
      run.stats.lostLog.push({ member: m.id, where: currentNode(run.map).name, how: 'ran out of charge' });
    } else if (m.integrity <= 0 && !run.pendingResets.includes(m.id)) run.pendingResets.push(m.id);
  }
  const revealed = revealAhead(run.map, run.party);
  run.phase = 'map';
  return { deadBattery, revealed };
}

/** Clamp every member's stats after any change (events, camp). */
export function clampParty(party: MemberState[]): void {
  for (const m of party) {
    if (m.kind === 'android') {
      m.hull = clamp100(m.hull);
      m.skin = clamp100(m.skin);
      m.battery = clamp100(m.battery);
      m.integrity = clamp100(m.integrity);
    } else {
      m.health = clamp100(m.health);
      m.hunger = clamp100(m.hunger);
      m.trust = clamp100(m.trust);
    }
  }
}

/** June travels with the party (for the run stats). */
export function noteJune(run: RunState): void {
  const j = juneOf(run.party);
  if (j && j.status === 'active') run.stats.juneFate = 'with-party';
}
