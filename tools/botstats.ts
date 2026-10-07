/**
 * Quick bot statistics for tuning (not a test): `npx tsx tools/botstats.ts [kind] [players] [n] [layout]`.
 * Prints the band numbers the bot tests check.
 */
import { runStopBots, summarize, type StopRunResult } from '../src/bots/runner';
import type { StopBotKind } from '../src/bots/stopbots';
import { DEPOT_A, DEPOT_B } from '../src/content/layouts/depot';
import type { Region, Weather } from '../src/core/types';
import type { LayoutDef } from '../src/sim/layout';

const REGIONS: [Region, Weather][] = [
  ['newengland', 'snow'],
  ['corridor', 'rain'],
  ['piedmont', 'fog'],
  ['lowcountry', 'humid'],
];

export function runBand(
  kind: StopBotKind,
  players: 1 | 2,
  n: number,
  layouts: LayoutDef[],
  heat = 0,
): StopRunResult[] {
  const out: StopRunResult[] = [];
  for (let i = 0; i < n; i++) {
    const [region, weather] = REGIONS[i % REGIONS.length];
    out.push(
      runStopBots({
        layout: layouts[i % layouts.length],
        seed: 1000 + i,
        kind,
        players,
        region,
        weather,
        heat,
      }),
    );
  }
  return out;
}

function main(): void {
  const kind = (process.argv[2] ?? 'cautious') as StopBotKind;
  const players = (Number(process.argv[3] ?? 1) === 2 ? 2 : 1) as 1 | 2;
  const n = Number(process.argv[4] ?? 40);
  const which = process.argv[5] ?? 'both';
  const layouts = which === 'a' ? [DEPOT_A] : which === 'b' ? [DEPOT_B] : [DEPOT_A, DEPOT_B];
  const t0 = Date.now();
  const res = runBand(kind, players, n, layouts);
  const s = summarize(res);
  console.log(JSON.stringify({ kind, players, ...s, ms: Date.now() - t0 }, null, 0));
  const alerts = res.filter((r) => r.exposed).map((r) => Math.round(r.alertAt ?? 0));
  console.log('alert times:', alerts.join(' '));
}

if (process.argv[1]?.endsWith('botstats.ts')) main();
