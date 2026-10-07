/** The Port band check shared by port.bots.ts and port3.bots.ts (spec §17.2). */
import { expect, it } from 'vitest';
import { runPortBots } from '../../src/bots/portbots';
import { N } from './bands';

export function portBand(heat: 0 | 3, players: 1 | 2): void {
  const want = heat === 0 ? '≥ 70%' : '≤ 40%';
  it(`cautious, ${players}P, Heat ${heat}: an android aboard in ${want} of attempts`, () => {
    let aboard = 0;
    let all = 0;
    let timeouts = 0;
    for (let i = 0; i < N; i++) {
      const r = runPortBots({ seed: 1000 + i, players, heat });
      if (r.androidsAboard > 0) aboard++;
      if (r.androidsAboard === 3) all++;
      if (r.end === 'timeout') timeouts++;
    }
    console.info(`port Heat ${heat} ${players}P: aboard ${aboard}% all three ${all}% timeouts ${timeouts}`);
    expect(timeouts).toBe(0);
    if (heat === 0) expect(aboard / N).toBeGreaterThanOrEqual(0.7);
    else expect(aboard / N).toBeLessThanOrEqual(0.4);
  });
}
