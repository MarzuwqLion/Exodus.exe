/** Headless bot runs of a stop (spec §17.2). */
import type { MemberId, Region, Slot, Weather } from '../core/types';
import { hashSeed } from '../core/rng';
import { startingParty, startingResources } from '../run/party';
import type { LayoutDef } from '../sim/layout';
import { StopSim, type StopConfig } from '../sim/stop';
import { BOT_LIMIT_SECONDS, StopBot, type StopBotKind } from './stopbots';

export interface StopRunOpts {
  layout: LayoutDef;
  seed: number;
  kind: StopBotKind;
  players: 1 | 2;
  region: Region;
  weather: Weather;
  heat?: number;
  day?: number;
  /** Patch the config (tests). */
  patch?: (cfg: StopConfig) => void;
}

export interface StopRunResult {
  exposed: boolean;
  alertAt: number | null;
  cells: number;
  parts: number;
  skin: number;
  papers: number;
  seconds: number;
  left: boolean;
  lost: number;
  end: string;
  knockouts: number;
}

export function stopConfigFor(o: StopRunOpts): StopConfig {
  const control: Record<Slot, MemberId | null> = { 0: 'wren', 1: o.players === 2 ? 'brick' : null };
  const party = startingParty();
  // Arriving after a drive: -5 Battery each (spec §12.4).
  for (const m of party) if (m.kind === 'android') m.battery -= 5;
  const cfg: StopConfig = {
    layout: o.layout,
    seed: hashSeed('bot', o.seed),
    region: o.region,
    weather: o.weather,
    heat: o.heat ?? 0,
    day: o.day ?? 3,
    party,
    control,
    resources: startingResources(),
  };
  o.patch?.(cfg);
  return cfg;
}

export function runStopBots(o: StopRunOpts): StopRunResult {
  const cfg = stopConfigFor(o);
  const sim = new StopSim(cfg);
  const bots: StopBot[] = [new StopBot(o.kind, 0, o.players === 2 ? 'charger' : 'solo', o.seed * 7 + 1)];
  if (o.players === 2) bots.push(new StopBot(o.kind, 1, 'searcher', o.seed * 7 + 2));
  let alertAt: number | null = null;
  const limit = BOT_LIMIT_SECONDS * 60;
  for (let t = 0; t < limit && !sim.outcome; t++) {
    const intents: Partial<Record<Slot, ReturnType<StopBot['decide']>>> = {};
    for (const b of bots) intents[b.slot] = b.decide(sim);
    sim.step(intents);
    if (alertAt === null && sim.alert.on) alertAt = sim.time;
  }
  const out = sim.outcome;
  return {
    exposed: alertAt !== null,
    alertAt,
    cells: Math.round(sim.stats.cellsGathered),
    parts: sim.stats.found.parts,
    skin: sim.stats.found.skinPatches,
    papers: sim.stats.found.papers,
    seconds: sim.time,
    left: out?.end === 'left',
    lost: out?.lost.length ?? 0,
    end: out?.end ?? 'timeout',
    knockouts: sim.stats.knockouts,
  };
}

export interface BandStats {
  n: number;
  exposure: number;
  meanCells: number;
  meanSeconds: number;
  meanParts: number;
  skinRate: number;
  papersRate: number;
  timeouts: number;
  lostRate: number;
}

export function summarize(results: readonly StopRunResult[]): BandStats {
  const n = results.length;
  const mean = (f: (r: StopRunResult) => number): number =>
    results.reduce((s, r) => s + f(r), 0) / Math.max(1, n);
  return {
    n,
    exposure: mean((r) => (r.exposed ? 1 : 0)),
    meanCells: mean((r) => r.cells),
    meanSeconds: mean((r) => r.seconds),
    meanParts: mean((r) => r.parts),
    skinRate: mean((r) => (r.skin > 0 ? 1 : 0)),
    papersRate: mean((r) => (r.papers > 0 ? 1 : 0)),
    timeouts: results.filter((r) => r.end === 'timeout').length,
    lostRate: mean((r) => (r.lost > 0 ? 1 : 0)),
  };
}
