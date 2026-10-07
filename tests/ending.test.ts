/** The voyage, the Ghana epilogue, and the stats screen (spec §16). */
import { describe, expect, it } from 'vitest';
import { EPILOGUE, JUNE_EPILOGUE, VOYAGE_CONVERSATIONS } from '../src/content/conversations';
import type { AndroidId, AndroidState, MemberId } from '../src/core/types';
import {
  epilogueLines,
  formatPlayTime,
  reviveAboard,
  sailedMembers,
  statRows,
  voyageFor,
} from '../src/run/ending';
import { recruitJune } from '../src/run/june';
import { applyPortOutcome, newRun } from '../src/run/run';
import type { StopOutcome } from '../src/sim/types';

const ANDROIDS: AndroidId[] = ['wren', 'brick', 'vesper'];

/** Every non-empty subset of the androids, in party order. */
function subsets(): AndroidId[][] {
  const out: AndroidId[][] = [];
  for (let mask = 1; mask < 8; mask++) out.push(ANDROIDS.filter((_, i) => mask & (1 << i)));
  return out;
}

function portOutcome(run: ReturnType<typeof newRun>, aboard: MemberId[]): StopOutcome {
  return {
    end: 'left',
    seconds: 200,
    alert: true,
    resources: { ...run.resources },
    party: run.party,
    carried: [],
    lost: [],
    juneArrested: false,
    knockouts: 0,
    juneKioskUses: 0,
    cellsGathered: 0,
    rumorsSeen: 0,
    aboard,
    resetsResolved: [],
    flagsSet: [],
  };
}

describe('the voyage (spec §16.1)', () => {
  it('every survivor combination, with and without June, has exactly one conversation', () => {
    const seen = new Set<string>();
    for (const survivors of subsets()) {
      for (const june of [false, true]) {
        // Order of the aboard list doesn't matter.
        const aboard: MemberId[] = june ? ['june', ...[...survivors].reverse()] : [...survivors].reverse();
        const v = voyageFor(aboard);
        expect(v, `${survivors.join('+')}${june ? '+june' : ''}`).not.toBeNull();
        expect(v!.survivors).toEqual(survivors);
        expect(v!.withJune).toBe(june);
        seen.add(v!.id);
      }
    }
    expect(seen.size).toBe(VOYAGE_CONVERSATIONS.length);
  });

  it('no android aboard: no voyage', () => {
    expect(voyageFor([])).toBeNull();
    expect(voyageFor(['june'])).toBeNull();
  });

  it('a shut-down unit carried aboard is brought back online for the deck', () => {
    const run = newRun(2);
    const brick = run.party.find((m) => m.id === 'brick') as AndroidState;
    brick.status = 'shutdown';
    brick.battery = 0;
    run.carried = ['brick'];
    reviveAboard(run, ['wren', 'brick']);
    expect(brick.status).toBe('active');
    expect(brick.battery).toBeGreaterThan(0);
    expect(run.carried).toEqual([]);
  });
});

describe('Ghana (spec §16.2)', () => {
  it('one line per android, "made it" or "lost", then June if she was met', () => {
    const run = newRun(7);
    recruitJune(run.party, 60);
    const sailed = applyPortOutcome(run, portOutcome(run, ['wren', 'vesper', 'june']));
    expect(sailed).toEqual(['wren', 'vesper', 'june']);
    expect(sailedMembers(run)).toEqual(['wren', 'vesper', 'june']);
    const lines = epilogueLines(run);
    expect(lines).toEqual([EPILOGUE[0].madeIt, EPILOGUE[1].lost, EPILOGUE[2].madeIt, JUNE_EPILOGUE.sailed]);
  });

  it('June left on the quay gets her own line; a June never met gets none', () => {
    const run = newRun(7);
    recruitJune(run.party, 60);
    applyPortOutcome(run, portOutcome(run, ['wren', 'brick', 'vesper']));
    expect(epilogueLines(run).at(-1)).toBe(JUNE_EPILOGUE.quay);
    expect(statRows(run).find(([k]) => k === "June's fate")![1]).toBe('Stayed at the Port');
    const solo = newRun(7);
    expect(epilogueLines(solo)).toHaveLength(3);
  });

  it('June who left on the road, was arrested, or went home', () => {
    const run = newRun(7);
    recruitJune(run.party, 60);
    run.stats.juneFate = 'left';
    expect(epilogueLines(run).at(-1)).toBe(JUNE_EPILOGUE.left);
    run.stats.juneFate = 'arrested';
    expect(epilogueLines(run).at(-1)).toBe(JUNE_EPILOGUE.arrested);
    run.stats.juneFate = 'went-home';
    expect(epilogueLines(run).at(-1)).toBe(JUNE_EPILOGUE.wentHome);
  });

  it('the stats screen: days, stops, Cells, exposures, losses, June, run time', () => {
    const run = newRun(7);
    run.day = 12;
    run.stats.stops = 8;
    run.stats.cellsGathered = 211.6;
    run.stats.timesExposed = 2;
    run.stats.unitsLost = 1;
    run.stats.playTimeMs = 65 * 60000 + 20000;
    expect(statRows(run)).toEqual([
      ['Days', '12'],
      ['Stops', '8'],
      ['Cells gathered', '212'],
      ['Times exposed', '2'],
      ['Units lost', '1'],
      ["June's fate", 'Never met'],
      ['Run time', '1 h 5 min'],
    ]);
    expect(formatPlayTime(42 * 60000)).toBe('42 min');
    expect(formatPlayTime(0)).toBe('0 min');
  });
});
