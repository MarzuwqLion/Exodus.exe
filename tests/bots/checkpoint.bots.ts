/**
 * Checkpoint bot bands (spec §17.2): a human answerer (human answers at 1.5–4 s, off-center breathing)
 * passes at least 85% of checkpoints at Heat 0; a robotic answerer (instant robotic answers, perfect
 * breathing) is busted at least 90% of the time. 100 seeded attempts each, solo and two-player.
 */
import { describe, expect, it } from 'vitest';
import { controlFor, runCheckpointBots } from '../../src/bots/checkpointbots';
import { newRun } from '../../src/run/run';
import { N } from './bands';

function rate(policy: 'human' | 'robotic', players: 1 | 2, want: 'pass' | 'bust'): number {
  let hits = 0;
  for (let i = 0; i < N; i++) {
    const run = newRun(1000 + i, { control: controlFor(players) });
    run.day = 4;
    if (runCheckpointBots(run, policy, i).result === want) hits++;
  }
  return hits / N;
}

describe('checkpoint bot bands', () => {
  for (const players of [1, 2] as const) {
    it(`human answerer, ${players}P: passes ≥ 85% at Heat 0`, () => {
      const r = rate('human', players, 'pass');
      console.info(`checkpoint human ${players}P: pass ${(r * 100).toFixed(0)}%`);
      expect(r).toBeGreaterThanOrEqual(0.85);
    });

    it(`robotic answerer, ${players}P: busted ≥ 90%`, () => {
      const r = rate('robotic', players, 'bust');
      console.info(`checkpoint robotic ${players}P: bust ${(r * 100).toFixed(0)}%`);
      expect(r).toBeGreaterThanOrEqual(0.9);
    });
  }
});
