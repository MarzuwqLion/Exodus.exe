/**
 * Quick bot statistics for tuning (not a test): `npx tsx tools/botstats.ts [kind] [players] [n] [stop]`.
 * Prints the band numbers the bot tests check. `tools/bands.ts` runs the same cases in parallel.
 */
import { runStopBots, summarize, type StopRunResult } from '../src/bots/runner';
import type { StopBotKind } from '../src/bots/stopbots';
import { STOP_LAYOUTS } from '../src/content/layouts';
import { DEPOT_A, DEPOT_B } from '../src/content/layouts/depot';
import type { Region, Weather } from '../src/core/types';
import type { LayoutDef } from '../src/sim/layout';

export const REGIONS: [Region, Weather][] = [
  ['newengland', 'snow'],
  ['corridor', 'rain'],
  ['piedmont', 'fog'],
  ['lowcountry', 'humid'],
];

/** Attempt `i` of a band: every layout meets every region (blocks of four regions per layout). */
export function bandCase(
  i: number,
  layouts: readonly LayoutDef[],
): { layout: LayoutDef; seed: number; region: Region; weather: Weather } {
  const [region, weather] = REGIONS[i % REGIONS.length];
  return {
    layout: layouts[Math.floor(i / REGIONS.length) % layouts.length],
    seed: 1000 + i,
    region,
    weather,
  };
}

export function runBand(
  kind: StopBotKind,
  players: 1 | 2,
  n: number,
  layouts: readonly LayoutDef[],
  heat = 0,
  first = 0,
): StopRunResult[] {
  const out: StopRunResult[] = [];
  for (let i = first; i < first + n; i++)
    out.push(runStopBots({ ...bandCase(i, layouts), kind, players, heat }));
  return out;
}

/** Layouts by name: a stop kind, or `a`/`b` for one depot. */
export function layoutsFor(which: string): LayoutDef[] {
  if (which === 'a') return [DEPOT_A];
  if (which === 'b') return [DEPOT_B];
  const list = (STOP_LAYOUTS as Record<string, readonly LayoutDef[]>)[which];
  return list ? [...list] : [DEPOT_A, DEPOT_B];
}

function main(): void {
  const kind = (process.argv[2] ?? 'cautious') as StopBotKind;
  const players = (Number(process.argv[3] ?? 1) === 2 ? 2 : 1) as 1 | 2;
  const n = Number(process.argv[4] ?? 40);
  const which = process.argv[5] ?? 'depot';
  const t0 = Date.now();
  const res = runBand(kind, players, n, layoutsFor(which));
  const s = summarize(res);
  console.log(JSON.stringify({ which, kind, players, ...s, ms: Date.now() - t0 }, null, 0));
  const alerts = res.filter((r) => r.exposed).map((r) => Math.round(r.alertAt ?? 0));
  console.log('alert times:', alerts.join(' '));
}

if (process.argv[1]?.endsWith('botstats.ts')) main();
