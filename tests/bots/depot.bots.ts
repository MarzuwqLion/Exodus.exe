/**
 * Depot bot bands (spec §17.2): 100 seeded attempts per policy, solo and two-player, across both depot
 * layouts and all four regions. The build fails if any result falls outside its band.
 */
import { describe, expect, it } from 'vitest';
import { summarize } from '../../src/bots/runner';
import { DEPOT_A, DEPOT_B } from '../../src/content/layouts/depot';
import { runBand } from '../../tools/botstats';

const N = 100;
const LAYOUTS = [DEPOT_A, DEPOT_B];

function report(name: string, s: ReturnType<typeof summarize>): string {
  return `${name}: exposure ${(s.exposure * 100).toFixed(0)}% cells ${s.meanCells.toFixed(1)} seconds ${s.meanSeconds.toFixed(0)} timeouts ${s.timeouts}`;
}

describe('depot bot bands', () => {
  for (const players of [1, 2] as const) {
    it(`cautious, ${players}P: exposure 10–30%, 20–40 Cells, 120–200 s`, () => {
      const s = summarize(runBand('cautious', players, N, LAYOUTS));
      console.info(report(`cautious ${players}P`, s));
      expect(s.timeouts).toBe(0);
      expect(s.exposure).toBeGreaterThanOrEqual(0.1);
      expect(s.exposure).toBeLessThanOrEqual(0.3);
      expect(s.meanCells).toBeGreaterThanOrEqual(20);
      expect(s.meanCells).toBeLessThanOrEqual(40);
      expect(s.meanSeconds).toBeGreaterThanOrEqual(120);
      expect(s.meanSeconds).toBeLessThanOrEqual(200);
    });

    it(`greedy, ${players}P: exposure 40–65%, 40–75 Cells`, () => {
      const s = summarize(runBand('greedy', players, N, LAYOUTS));
      console.info(report(`greedy ${players}P`, s));
      expect(s.timeouts).toBe(0);
      expect(s.exposure).toBeGreaterThanOrEqual(0.4);
      expect(s.exposure).toBeLessThanOrEqual(0.65);
      expect(s.meanCells).toBeGreaterThanOrEqual(40);
      expect(s.meanCells).toBeLessThanOrEqual(75);
    });

    it(`reckless, ${players}P: exposure ≥ 90%`, () => {
      const s = summarize(runBand('reckless', players, N, LAYOUTS));
      console.info(report(`reckless ${players}P`, s));
      expect(s.timeouts).toBe(0);
      expect(s.exposure).toBeGreaterThanOrEqual(0.9);
    });
  }
});
