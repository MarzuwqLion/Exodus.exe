/**
 * Bot band checks shared by the per-stop bot tests (spec §17.2): 100 seeded attempts per policy, solo and
 * two-player, across every layout of the stop type and all four regions.
 *
 * Exposure bands apply in every stop type (M4 exit: "the bot bands still pass in every stop type"). The
 * Cells bands are the depot's (charging is where Cells come from, §10.9); the cautious visit length applies
 * everywhere, since every cautious visit leaves at the first drone.
 */
import { expect, it } from 'vitest';
import { summarize } from '../../src/bots/runner';
import type { StopBotKind } from '../../src/bots/stopbots';
import type { LayoutDef } from '../../src/sim/layout';
import { runBand } from '../../tools/botstats';

export const N = 100;

function report(name: string, s: ReturnType<typeof summarize>): string {
  return (
    `${name}: exposure ${(s.exposure * 100).toFixed(0)}% cells ${s.meanCells.toFixed(1)} ` +
    `seconds ${s.meanSeconds.toFixed(0)} lost ${(s.lostRate * 100).toFixed(0)}% timeouts ${s.timeouts}`
  );
}

function band(stop: string, kind: StopBotKind, players: 1 | 2, layouts: readonly LayoutDef[]) {
  const s = summarize(runBand(kind, players, N, layouts));
  console.info(report(`${stop} ${kind} ${players}P`, s));
  expect(s.timeouts).toBe(0);
  return s;
}

export function stopBands(stop: string, layouts: readonly LayoutDef[], depot: boolean): void {
  for (const players of [1, 2] as const) {
    it(`cautious, ${players}P: exposure 10–30%, 120–200 s${depot ? ', 20–40 Cells' : ''}`, () => {
      const s = band(stop, 'cautious', players, layouts);
      expect(s.exposure).toBeGreaterThanOrEqual(0.1);
      expect(s.exposure).toBeLessThanOrEqual(0.3);
      expect(s.meanSeconds).toBeGreaterThanOrEqual(120);
      expect(s.meanSeconds).toBeLessThanOrEqual(200);
      if (depot) {
        expect(s.meanCells).toBeGreaterThanOrEqual(20);
        expect(s.meanCells).toBeLessThanOrEqual(40);
      }
    });

    it(`greedy, ${players}P: exposure 40–65%${depot ? ', 40–75 Cells' : ''}`, () => {
      const s = band(stop, 'greedy', players, layouts);
      expect(s.exposure).toBeGreaterThanOrEqual(0.4);
      expect(s.exposure).toBeLessThanOrEqual(0.65);
      if (depot) {
        expect(s.meanCells).toBeGreaterThanOrEqual(40);
        expect(s.meanCells).toBeLessThanOrEqual(75);
      }
    });

    it(`reckless, ${players}P: exposure ≥ 90%`, () => {
      const s = band(stop, 'reckless', players, layouts);
      expect(s.exposure).toBeGreaterThanOrEqual(0.9);
    });
  }
}
