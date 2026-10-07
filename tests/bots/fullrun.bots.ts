/**
 * The M6 exit (spec §18): a scripted full run reaches Ghana headless. Every stop, checkpoint, and the Port are
 * simulated live by the bots (src/bots/fullrun.ts); six seeded runs must all finish cleanly (no bot timeouts)
 * and at least one must sail.
 */
import { describe, expect, it } from 'vitest';
import { playFullRun, type FullRun } from '../../src/bots/fullrun';

describe('a scripted full run (M6 exit)', () => {
  it('reaches Ghana headless, with every scene played live', () => {
    const runs: FullRun[] = [];
    for (let seed = 1; seed <= 6; seed++) runs.push(playFullRun(seed));
    const lines = runs.map(
      (r, i) =>
        `seed ${i + 1}: ${r.end}, day ${r.run.day}, ${r.log.length} legs, aboard ${r.aboard.join(', ') || 'nobody'}`,
    );
    console.info(lines.join('\n'));
    const ghana = runs.find((r) => r.end === 'ghana');
    if (ghana) console.info(ghana.log.join('\n'));
    expect(runs.filter((r) => r.end === 'timeout')).toHaveLength(0);
    expect(ghana).toBeDefined();
    expect(ghana!.aboard.some((id) => id !== 'june')).toBe(true);
  });
});
