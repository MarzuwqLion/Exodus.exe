/**
 * Tuning sweep (dev tool): runs the depot bot bands for a set of tuning overrides and prints the results, so
 * values can be chosen from measured curves instead of guesses.
 *   npx tsx tools/sweep.ts "rates.spoofedCharging=7,9,11" [n]
 */
import { summarize } from '../src/bots/runner';
import type { StopBotKind } from '../src/bots/stopbots';
import { DEPOT_A, DEPOT_B } from '../src/content/layouts/depot';
import { TUNING } from '../src/content/tuning';
import { runBand } from './botstats';

function setPath(path: string, value: number): void {
  const parts = path.split('.');
  let o = TUNING as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] as Record<string, unknown>;
  o[parts[parts.length - 1]] = value;
}

function main(): void {
  const spec = process.argv[2] ?? 'rates.spoofedCharging=7,9,11';
  const n = Number(process.argv[3] ?? 40);
  const [path, list] = spec.split('=');
  const values = list.split(',').map(Number);
  const bands: [StopBotKind, 1 | 2][] = [
    ['cautious', 1],
    ['cautious', 2],
    ['greedy', 1],
    ['greedy', 2],
  ];
  for (const v of values) {
    setPath(path, v);
    const row: string[] = [`${path}=${v}`];
    for (const [kind, players] of bands) {
      const s = summarize(runBand(kind, players, n, [DEPOT_A, DEPOT_B]));
      row.push(
        `${kind[0]}${players}: exp ${(s.exposure * 100).toFixed(0)}% cells ${s.meanCells.toFixed(0)} t ${s.meanSeconds.toFixed(0)}`,
      );
    }
    console.log(row.join(' | '));
  }
}

main();
