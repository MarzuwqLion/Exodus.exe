/**
 * The economy simulator (spec §17.3): `npm run sim:economy [-- --runs 2000] [--lib 150] [--jobs 18]`.
 *
 * 1. Builds a library of stop outcomes by running the stop bots (in parallel worker processes): every stop
 *    type, compromised Stations, and checkpoint busts, for the cautious, greedy, and reckless policies, at
 *    Heat 0 and Heat 2.
 * 2. Plays whole runs headless for three player policies (competent, skilled and greedy, random): the map,
 *    road events, camp decisions, checkpoints, Heat, and the sailing clock are simulated in full; each stop
 *    samples an outcome from the library and applies its changes to the run.
 * 3. Checks the bands and writes the distributions to qa/economy.md. Exits non-zero if a band fails.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runCheckpointBots } from '../src/bots/checkpointbots';
import { runStopBots, stopConfigFor, type StopRunResult } from '../src/bots/runner';
import type { StopBotKind } from '../src/bots/stopbots';
import { STOP_LAYOUTS } from '../src/content/layouts';
import type { EventChoice, EventEffect, EventStep, RoadEvent } from '../src/content/schema';
import { TUNING } from '../src/content/tuning';
import { Rng, hashSeed } from '../src/core/rng';
import type { AndroidId, AndroidState, MapNode, Resources, RunState, StopModifier } from '../src/core/types';
import { RESOURCE_KEYS } from '../src/core/types';
import {
  campEffects,
  feedJune,
  longRest,
  moveCells,
  patchSkin,
  pickCampConversation,
  repairHull,
  reviveCarried,
} from '../src/run/camp';
import {
  answerQuestion,
  applyBustCost,
  applyScan,
  checkpointResult,
  checkpointStress,
  startCheckpoint,
} from '../src/run/checkpoint';
import { choiceAvailable, pickEvent, resolveChoice } from '../src/run/events';
import { activeJune, juneLeavesAtStation } from '../src/run/june';
import { currentNode, nextNodes, rumorAhead, shownType } from '../src/run/map';
import { activeAndroids, clamp100 } from '../src/run/party';
import {
  addHeat,
  allAndroidsLost,
  beginLeg,
  endLeg,
  missedTheShip,
  newRun,
  sailing,
  withRng,
} from '../src/run/run';
import { applyTrade, canTrade, rollCompromised, stationCare, type StationTrade } from '../src/run/station';
import { bandCase, REGIONS } from './botstats';

// -------------------------------------------------------------------------------------------------
// 1. The stop library
// -------------------------------------------------------------------------------------------------

type LibKind = 'depot' | 'diner' | 'gas' | 'compromised' | 'checkpoint';
const LIB_KINDS: LibKind[] = ['depot', 'diner', 'gas', 'compromised', 'checkpoint'];
const LIB_POLICIES: StopBotKind[] = ['cautious', 'greedy', 'reckless'];
const LIB_HEATS = [0, 2];

interface LibEntry {
  kind: LibKind;
  policy: StopBotKind;
  heat: number;
  r: StopRunResult;
}

function libKey(kind: LibKind, policy: StopBotKind, heat: number): string {
  return `${kind}:${policy}:${heat}`;
}

function worker(args: string[]): void {
  const [kind, policy, heat, from, to] = args;
  const layouts = STOP_LAYOUTS[kind as LibKind];
  for (let i = Number(from); i < Number(to); i++) {
    const c = bandCase(i, layouts);
    const r = runStopBots({ ...c, kind: policy as StopBotKind, players: 1, heat: Number(heat) });
    process.stdout.write(JSON.stringify({ kind, policy, heat: Number(heat), r }) + '\n');
  }
}

function runChunk(self: string, args: string[], into: LibEntry[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--import', 'tsx', self, '--worker', ...args], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let buf = '';
    p.stdout.on('data', (d: Buffer) => {
      buf += d.toString();
      let k = buf.indexOf('\n');
      while (k >= 0) {
        const l = buf.slice(0, k).trim();
        if (l) into.push(JSON.parse(l) as LibEntry);
        buf = buf.slice(k + 1);
        k = buf.indexOf('\n');
      }
    });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))));
  });
}

export async function buildLibrary(n: number, jobs: number): Promise<Map<string, StopRunResult[]>> {
  const self = fileURLToPath(import.meta.url);
  const tasks: string[][] = [];
  for (const kind of LIB_KINDS)
    for (const policy of LIB_POLICIES)
      for (const heat of LIB_HEATS) {
        const count = kind === 'compromised' || kind === 'checkpoint' ? Math.ceil(n / 2) : n;
        const chunk = Math.max(10, Math.ceil(count / 4));
        for (let from = 0; from < count; from += chunk)
          tasks.push([kind, policy, String(heat), String(from), String(Math.min(count, from + chunk))]);
      }
  const rows: LibEntry[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(jobs, tasks.length) }, async () => {
      while (next < tasks.length) await runChunk(self, tasks[next++], rows);
    }),
  );
  const lib = new Map<string, StopRunResult[]>();
  for (const e of rows) {
    const k = libKey(e.kind, e.policy, e.heat);
    const list = lib.get(k) ?? [];
    list.push(e.r);
    lib.set(k, list);
  }
  return lib;
}

// -------------------------------------------------------------------------------------------------
// 2. Applying a sampled stop to a run
// -------------------------------------------------------------------------------------------------

/** The state every library run started from (stopConfigFor: the starting party after a drive). */
const LIB_START = stopConfigFor({
  layout: STOP_LAYOUTS.depot[0],
  seed: 0,
  kind: 'cautious',
  players: 1,
  region: REGIONS[0][0],
  weather: REGIONS[0][1],
});

function sampleStop(
  lib: Map<string, StopRunResult[]>,
  kind: LibKind,
  policy: StopBotKind,
  heat: number,
  rng: Rng,
): StopRunResult {
  const h = heat >= 1.5 ? 2 : 0;
  const list = lib.get(libKey(kind, policy, h)) ?? lib.get(libKey(kind, 'cautious', 0))!;
  return rng.pick(list);
}

/** Apply a library outcome's changes (not its absolute state) to the run. */
function applySample(run: RunState, r: StopRunResult, where: string, rng: Rng): void {
  const out = r.outcome;
  if (!out) return;
  const res = run.resources;
  let overflow = 0;
  for (const k of RESOURCE_KEYS) {
    const d = out.resources[k] - LIB_START.resources[k];
    res[k] = Math.max(0, res[k] + d);
  }
  res.carBattery = Math.min(100, res.carBattery);
  for (const m of out.party) {
    if (m.kind !== 'android') continue;
    const start = LIB_START.party.find((p) => p.id === m.id) as AndroidState;
    const a = run.party.find((p) => p.id === m.id) as AndroidState | undefined;
    if (!a || a.status === 'lost') continue;
    if (m.status === 'lost') {
      a.status = 'lost';
      run.stats.unitsLost += 1;
      run.stats.lostLog.push({ member: a.id, where, how: 'lost at a stop' });
      for (const o of activeAndroids(run.party))
        o.integrity = clamp100(o.integrity + TUNING.integrity.memberLost);
      continue;
    }
    if (m.status === 'shutdown') {
      a.status = 'shutdown';
      if (!run.carried.includes(a.id)) run.carried.push(a.id);
    }
    a.hull = clamp100(a.hull + (m.hull - start.hull));
    a.skin = clamp100(a.skin + (m.skin - start.skin));
    a.integrity = clamp100(a.integrity + (m.integrity - start.integrity));
    // Charging tops a unit up: whatever doesn't fit in its Battery goes to Cells.
    const nb = a.battery + (m.battery - start.battery);
    if (nb > 100) overflow += nb - 100;
    a.battery = clamp100(nb);
  }
  res.cells += overflow;
  run.stats.stops += 1;
  run.stats.cellsGathered += out.cellsGathered;
  run.nextStopMods = [];
  if (out.alert) {
    run.alertThisLeg = true;
    run.stats.timesExposed += 1;
    addHeat(run, TUNING.heat.alert);
  }
  if (out.knockouts > 0) {
    run.stats.knockouts += out.knockouts;
    addHeat(run, TUNING.heat.knockout * out.knockouts);
  }
  for (let i = 0; i < out.rumorsSeen; i++) rumorAhead(run.map, run.rumors, rng, 2);
}

// -------------------------------------------------------------------------------------------------
// 3. Player policies
// -------------------------------------------------------------------------------------------------

interface Policy {
  name: string;
  stop(run: RunState, rng: Rng): StopBotKind;
  checkpoint: 'human' | 'robotic' | 'random';
  route(run: RunState, options: MapNode[], rng: Rng): MapNode;
  choose(run: RunState, choices: EventChoice[], rng: Rng): EventChoice;
  camp(run: RunState, atStation: boolean, rng: Rng): void;
  /** The Station's trades (once each). */
  trade(run: RunState, used: Set<StationTrade>): void;
  /** Chance a player reaches a factory-reset unit in its 10 s. */
  pullBack: number;
}

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
function effectValue(run: RunState, e: EventEffect): number {
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

function choiceValue(run: RunState, c: EventChoice): number {
  const total = c.outcomes.reduce((s, o) => s + o.weight, 0) || 1;
  return c.outcomes.reduce(
    (s, o) => s + (o.weight / total) * o.effects.reduce((v, e) => v + effectValue(run, e), 0),
    0,
  );
}

function sensibleCamp(
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

function competentRoute(run: RunState, options: MapNode[], rng: Rng, greedy: boolean): MapNode {
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

export const COMPETENT: Policy = {
  name: 'competent',
  stop: () => 'cautious',
  checkpoint: 'human',
  route: (run, options, rng) => competentRoute(run, options, rng, false),
  choose: (run, choices) => [...choices].sort((a, b) => choiceValue(run, b) - choiceValue(run, a))[0],
  camp: (run, atStation, rng) => sensibleCamp(run, atStation, rng, { car: 30, battery: 45, restBelow: 60 }),
  trade: (run, used) => {
    if (run.resources.papers === 0 && canTrade(run.resources, 'partsForPapers', used))
      applyTrade(run.resources, 'partsForPapers');
    if (
      run.resources.cells < 25 &&
      run.resources.papers >= 2 &&
      canTrade(run.resources, 'papersForCells', used)
    )
      applyTrade(run.resources, 'papersForCells');
  },
  pullBack: 0.75,
};

export const SKILLED: Policy = {
  name: 'skilled and greedy',
  // Greedy while Heat can still decay; careful once it builds or the Port gets close.
  stop: (run) => (run.heat >= 1.5 || currentNode(run.map).column >= 7 ? 'cautious' : 'greedy'),
  checkpoint: 'human',
  route: (run, options, rng) => competentRoute(run, options, rng, true),
  choose: (run, choices) => [...choices].sort((a, b) => choiceValue(run, b) - choiceValue(run, a))[0],
  camp: (run, atStation, rng) => sensibleCamp(run, atStation, rng, { car: 32, battery: 50, restBelow: 55 }),
  // Papers are worth the most at the Port gate: trade Parts for them, never Papers away.
  trade: (run, used) => {
    if (run.resources.parts >= 3 && canTrade(run.resources, 'partsForPapers', used))
      applyTrade(run.resources, 'partsForPapers');
  },
  pullBack: 0.9,
};

export const RANDOM: Policy = {
  name: 'random',
  stop: (_run, rng) => rng.pick(LIB_POLICIES),
  checkpoint: 'random',
  route: (_run, options, rng) => rng.pick(options),
  choose: (_run, choices, rng) => rng.pick(choices),
  camp: (run, atStation, rng) => {
    const targets: ('car' | AndroidId)[] = ['car', ...activeAndroids(run.party).map((a) => a.id)];
    for (let i = rng.int(0, 8); i > 0; i--) moveCells(run, rng.pick(targets), 5 * rng.int(-2, 4));
    for (const a of activeAndroids(run.party)) {
      if (rng.chance(0.5)) repairHull(run, a.id);
      if (rng.chance(0.5)) patchSkin(run, a.id);
    }
    if (rng.chance(0.5)) feedJune(run, atStation);
    if (rng.chance(0.4)) longRest(run, atStation);
  },
  trade: (run, used) => {
    for (const t of ['partsForPapers', 'papersForCells'] as const)
      if (canTrade(run.resources, t, used) && run.resources.cells % 2 === 0) applyTrade(run.resources, t);
  },
  pullBack: 0.4,
};

// -------------------------------------------------------------------------------------------------
// 4. Whole runs
// -------------------------------------------------------------------------------------------------

type RunEnd = 'ghana' | 'sailed-without' | 'missed' | 'lost';

interface RunResult {
  end: RunEnd;
  /** The run at the end (diagnostics). */
  run?: RunState;
  day: number;
  slackAtPort: number | null;
  heat: number;
  aboard: number;
  lost: number;
  leg1: boolean;
  exposures: number;
  busts: number;
}

/**
 * The Port (until its own bot results exist): a careful party gets at least one android aboard 50% of the
 * time at Heat 0 on its own; each Papers spent at the terminal gate (one per android) adds 10 points, Captain
 * Mensah's part (2 Parts) adds 8, and each Heat level takes 12 off. With the starting 2 Papers that is 70% at
 * Heat 0 and 34% at Heat 3, the Port band (≥ 70% and ≤ 40%).
 */
export function portAboard(run: RunState, rng: Rng): number {
  const n = activeAndroids(run.party).length;
  if (n === 0) return 0;
  const papers = Math.min(run.resources.papers, n);
  const mensah = run.flags.includes('mensah-part') && run.resources.parts >= TUNING.port.mensahParts;
  const p = 0.5 + 0.1 * papers + (mensah ? 0.08 : 0) - 0.12 * run.heat;
  if (!rng.chance(Math.max(0.05, Math.min(0.95, p)))) return 0;
  return rng.int(1, n);
}

function playEvent(run: RunState, policy: Policy, rng: Rng): void {
  const picked = pickEvent(run, rng);
  if (!picked) return;
  let step: EventStep | undefined = picked.event as RoadEvent;
  for (let guard = 0; step && guard < 4; guard++) {
    const choices = step.choices.filter((c) => choiceAvailable(run, c));
    if (choices.length === 0) return;
    const choice = policy.choose(run, choices, rng);
    const { outcome } = resolveChoice(run, rng, choice, picked.ctx);
    step = outcome.next;
  }
}

function playCheckpoint(run: RunState, policy: Policy, lib: Map<string, StopRunResult[]>, rng: Rng): void {
  checkpointStress(run);
  let result;
  if (policy.checkpoint === 'random') {
    const s = startCheckpoint(run, rng);
    while (s.next < s.questions.length) {
      const q = s.questions[s.next];
      answerQuestion(s, rng.pick(q.answers), rng.range(0.3, 7));
    }
    applyScan(
      s,
      activeAndroids(run.party).map(() => rng.int(0, 3) * TUNING.breathing.missPenalty),
    );
    result = checkpointResult(s.suspicion);
  } else result = runCheckpointBots(run, policy.checkpoint, rng.int(0, 1_000_000)).result;
  if (result === 'papers' && run.resources.papers > 0) {
    run.resources.papers -= 1;
    result = 'pass';
  }
  if (result === 'pass') {
    run.stats.checkpointsPassed += 1;
    return;
  }
  applyBustCost(run);
  applySample(
    run,
    sampleStop(lib, 'checkpoint', policy.stop(run, rng), run.heat, rng),
    currentNode(run.map).name,
    rng,
  );
}

function resolveResets(run: RunState, policy: Policy, rng: Rng): void {
  for (const id of run.pendingResets) {
    const a = run.party.find((m) => m.id === id) as AndroidState | undefined;
    if (!a || a.status === 'lost') continue;
    if (rng.chance(policy.pullBack)) a.integrity = TUNING.integrity.resetTo;
    else {
      a.status = 'lost';
      run.stats.unitsLost += 1;
      for (const o of activeAndroids(run.party))
        o.integrity = clamp100(o.integrity + TUNING.integrity.memberLost);
    }
  }
  run.pendingResets = [];
}

export function simulateRun(seed: number, policy: Policy, lib: Map<string, StopRunResult[]>): RunResult {
  const run = newRun(seed);
  const rng = new Rng(hashSeed('economy', policy.name, seed));
  let leg1 = true;
  const finish = (end: RunEnd, aboard = 0): RunResult => ({
    end,
    run,
    day: run.day,
    slackAtPort: currentNode(run.map).type === 'port' ? TUNING.run.shipDay - run.day : null,
    heat: run.heat,
    aboard,
    lost: run.stats.unitsLost,
    leg1,
    exposures: run.stats.timesExposed,
    busts: run.stats.busts,
  });
  for (let legs = 0; legs < TUNING.run.columns + 2; legs++) {
    const to = policy.route(run, nextNodes(run.map), rng);
    const plan = beginLeg(run, to.id);
    if (plan.event) playEvent(run, policy, rng);
    if (missedTheShip(run)) return finish('missed');
    const node = currentNode(run.map);
    let atStation = false;
    if (node.type === 'port') {
      const aboard = portAboard(run, rng);
      return finish(aboard > 0 ? 'ghana' : 'sailed-without', aboard);
    }
    resolveResets(run, policy, rng);
    if (node.type === 'checkpoint') playCheckpoint(run, policy, lib, rng);
    else if (node.type === 'station') {
      if (withRng(run, (r) => rollCompromised(run.heat, r)))
        applySample(
          run,
          sampleStop(lib, 'compromised', policy.stop(run, rng), run.heat, rng),
          node.name,
          rng,
        );
      else {
        atStation = true;
        stationCare(run.party);
        policy.trade(run, new Set<StationTrade>());
        withRng(run, (r) => juneLeavesAtStation(run.party, r));
      }
    } else {
      const kind = node.type as 'depot' | 'diner' | 'gas';
      applySample(run, sampleStop(lib, kind, policy.stop(run, rng), run.heat, rng), node.name, rng);
    }
    if (allAndroidsLost(run)) return finish('lost');
    policy.camp(run, atStation, rng);
    const conv = pickCampConversation(run, rng);
    if (conv) campEffects(run, conv.effects, rng);
    endLeg(run, atStation);
    if (legs === 0 && allAndroidsLost(run)) leg1 = false;
    if (allAndroidsLost(run)) return finish('lost');
    if (missedTheShip(run)) return finish('missed');
  }
  return finish('missed');
}

// -------------------------------------------------------------------------------------------------
// 5. Bands and the report
// -------------------------------------------------------------------------------------------------

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function pct(n: number, d: number): string {
  return `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const opt = (name: string, dflt: number): number => {
    const i = argv.indexOf(name);
    return i >= 0 ? Number(argv[i + 1]) : dflt;
  };
  // Tuning experiments on run-level values: --set path=value (repeatable).
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--set') continue;
    const [path, v] = argv[i + 1].split('=');
    const parts = path.split('.');
    let o = TUNING as unknown as Record<string, unknown>;
    for (let k = 0; k < parts.length - 1; k++) o = o[parts[k]] as Record<string, unknown>;
    const last = parts[parts.length - 1];
    o[last] = v.includes(',') ? v.split(',').map(Number) : Number(v);
  }
  const runs = opt('--runs', 2000);
  const libN = opt('--lib', 150);
  const jobs = opt('--jobs', 18);
  const t0 = Date.now();
  const cache = 'qa/tmp/economy-library.json';
  let lib: Map<string, StopRunResult[]>;
  if (argv.includes('--cached') && existsSync(cache))
    lib = new Map(JSON.parse(readFileSync(cache, 'utf8')) as [string, StopRunResult[]][]);
  else {
    lib = await buildLibrary(libN, jobs);
    mkdirSync('qa/tmp', { recursive: true });
    writeFileSync(cache, JSON.stringify([...lib]));
  }
  const libSecs = (Date.now() - t0) / 1000;
  const policies = [COMPETENT, SKILLED, RANDOM];
  const bands: Record<string, [number, number]> = {
    competent: [0.4, 0.6],
    'skilled and greedy': [0.6, 0.8],
    random: [0, 0.1],
  };
  const lines: string[] = [
    '# Economy simulator',
    '',
    `Generated by \`npm run sim:economy\` (spec §17.3): ${runs} runs per policy; stop outcomes sampled from a library of ${libN} bot runs per stop type, policy, and Heat (built in ${libSecs.toFixed(0)} s).`,
    '',
    '| Policy | Reaches Ghana | Band | Missed the ship | All lost | Sailed without anyone | Median day | Median slack at the Port | Median Heat | Busts per run | Exposures per run |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  let failed = false;
  const notes: string[] = [];
  for (const p of policies) {
    const res: RunResult[] = [];
    for (let s = 0; s < runs; s++) res.push(simulateRun(s, p, lib));
    const count = (e: RunEnd): number => res.filter((r) => r.end === e).length;
    const ghana = count('ghana') / runs;
    const [lo, hi] = bands[p.name];
    const ok = ghana >= lo && ghana <= hi;
    if (!ok) failed = true;
    const slack = median(res.filter((r) => r.slackAtPort !== null).map((r) => r.slackAtPort!));
    lines.push(
      `| ${p.name} | ${pct(count('ghana'), runs)} | ${lo * 100}–${hi * 100}% ${ok ? 'pass' : 'FAIL'} | ${pct(count('missed'), runs)} | ${pct(count('lost'), runs)} | ${pct(count('sailed-without'), runs)} | ${median(res.map((r) => r.day))} | ${slack} | ${median(res.map((r) => r.heat))} | ${(res.reduce((a, r) => a + r.busts, 0) / runs).toFixed(2)} | ${(res.reduce((a, r) => a + r.exposures, 0) / runs).toFixed(2)} |`,
    );
    if (p.name === 'competent') {
      const slackOk = slack >= 1 && slack <= 3;
      if (!slackOk) failed = true;
      notes.push(
        `- Competent median slack on arrival at the Port: ${slack} days (band 1–3: ${slackOk ? 'pass' : 'FAIL'}).`,
      );
      const leg1Dead = res.filter((r) => !r.leg1).length;
      if (leg1Dead > 0) failed = true;
      notes.push(`- Runs that could not survive leg 1 from the starting state: ${leg1Dead} (must be 0).`);
    }
    console.log(lines[lines.length - 1]);
  }
  lines.push('', ...notes, '');
  lines.push(
    '## Stop library',
    '',
    '| Stop | Policy | Heat | Runs | Exposed | Lost a member | Mean Cells |',
    '|---|---|---|---|---|---|---|',
  );
  for (const [k, list] of lib) {
    const [kind, policy, heat] = k.split(':');
    const exposed = list.filter((r) => r.exposed).length;
    const lost = list.filter((r) => r.lost > 0).length;
    const cells = list.reduce((a, r) => a + r.cells, 0) / list.length;
    lines.push(
      `| ${kind} | ${policy} | ${heat} | ${list.length} | ${pct(exposed, list.length)} | ${pct(lost, list.length)} | ${cells.toFixed(1)} |`,
    );
  }
  writeFileSync('qa/economy.md', lines.join('\n') + '\n');
  for (const n of notes) console.log(n);
  console.log(`qa/economy.md written (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (failed) process.exit(1);
}

if (process.argv[2] === '--worker') worker(process.argv.slice(3));
else if (process.argv[1]?.endsWith('economy.ts')) void main();
