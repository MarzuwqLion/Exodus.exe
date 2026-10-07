/**
 * Compromised Station bots (spec §10.5): careful play gets the keeper's bag and leaves quietly; reckless play
 * gets caught. Every interior, all four regions, solo and two-player.
 */
import { describe, expect, it } from 'vitest';
import { summarize } from '../../src/bots/runner';
import { STOP_LAYOUTS } from '../../src/content/layouts';
import { runBand } from '../../tools/botstats';
import { N } from './bands';

describe('compromised Station bots', () => {
  for (const players of [1, 2] as const) {
    it(`cautious, ${players}P: takes the bag and leaves, exposure ≤ 30%`, () => {
      const res = runBand('cautious', players, N, STOP_LAYOUTS.compromised);
      const s = summarize(res);
      console.info(
        `compromised cautious ${players}P: exposure ${(s.exposure * 100).toFixed(0)}% papers ${(s.papersRate * 100).toFixed(0)}%`,
      );
      expect(s.timeouts).toBe(0);
      expect(s.exposure).toBeLessThanOrEqual(0.3);
      expect(res.filter((r) => r.left && r.papers > 0).length / N).toBeGreaterThanOrEqual(0.9);
    });

    it(`reckless, ${players}P: exposure ≥ 90%`, () => {
      const s = summarize(runBand('reckless', players, N, STOP_LAYOUTS.compromised));
      console.info(`compromised reckless ${players}P: exposure ${(s.exposure * 100).toFixed(0)}%`);
      expect(s.timeouts).toBe(0);
      expect(s.exposure).toBeGreaterThanOrEqual(0.9);
    });
  }
});
