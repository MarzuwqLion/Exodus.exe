/** Memory cores and unlocks (spec §15). */
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/content/tuning';
import { defaultSave } from '../src/core/save';
import type { AndroidState } from '../src/core/types';
import { recruitJune } from '../src/run/june';
import {
  PERK_ORDER,
  applyPerks,
  awardCores,
  buyPerk,
  canBuy,
  coreAward,
  perkCost,
  perkLines,
} from '../src/run/meta';
import { newRun } from '../src/run/run';

function lose(run: ReturnType<typeof newRun>, id: 'wren' | 'brick' | 'vesper'): void {
  (run.party.find((m) => m.id === id) as AndroidState).status = 'lost';
}

describe('memory cores (spec §15)', () => {
  it('awards 1 per 2 legs completed, 1 per android lost, and 3 for Ghana', () => {
    const run = newRun(3);
    run.leg = 10;
    lose(run, 'brick');
    const a = coreAward(run, true);
    expect(a).toEqual({ legs: 10, fromLegs: 5, lost: 1, fromLost: 1, ghana: 3, total: 9 });
    run.leg = 7;
    lose(run, 'wren');
    lose(run, 'vesper');
    expect(coreAward(run, false)).toEqual({ legs: 7, fromLegs: 3, lost: 3, fromLost: 3, ghana: 0, total: 6 });
  });

  it('banks the award with the run and win counts', () => {
    const meta = defaultSave().meta;
    const run = newRun(3);
    run.leg = 10;
    awardCores(meta, coreAward(run, true));
    expect(meta).toMatchObject({ cores: 8, coresEarned: 8, runs: 1, wins: 1 });
    run.leg = 3;
    awardCores(meta, coreAward(run, false));
    expect(meta).toMatchObject({ cores: 9, coresEarned: 9, runs: 2, wins: 1 });
  });
});

describe('unlocks (spec §15)', () => {
  it('costs 3–5 cores each; a perk is bought once', () => {
    for (const p of PERK_ORDER) {
      expect(perkCost(p)).toBeGreaterThanOrEqual(3);
      expect(perkCost(p)).toBeLessThanOrEqual(5);
    }
    const meta = defaultSave().meta;
    meta.cores = 4;
    expect(canBuy(meta, 'network-contacts')).toBe(false);
    expect(buyPerk(meta, 'network-contacts')).toBe(false);
    expect(buyPerk(meta, 'forged-papers')).toBe(true);
    expect(meta.cores).toBe(0);
    expect(meta.unlocked).toEqual(['forged-papers']);
    meta.cores = 10;
    expect(buyPerk(meta, 'forged-papers')).toBe(false);
    expect(meta.cores).toBe(10);
  });

  it('applies every unlocked perk to a new run', () => {
    const plain = newRun(21);
    const run = newRun(21);
    applyPerks(run, PERK_ORDER);
    expect(run.resources.cells).toBe(plain.resources.cells + TUNING.meta.spareCells);
    expect(run.resources.papers).toBe(plain.resources.papers + 1);
    expect(run.resources.skinPatches).toBe(plain.resources.skinPatches + 1);
    // Network contacts: one more Station shows on the map, through a Station rumor.
    const shown = (r: typeof run): number =>
      r.map.nodes.filter((n) => n.type === 'station' && n.revealed).length;
    expect(shown(run)).toBe(shown(plain) + 1);
    expect(run.rumors.filter((r) => r.kind === 'station')).toHaveLength(1);
    // Old route: one rumor about an ordinary stop ahead.
    expect(run.rumors.filter((r) => r.kind !== 'station')).toHaveLength(1);
    // Perks never shift the run's own rolls.
    expect(run.rngState).toBe(plain.rngState);
  });

  it('applies nothing without unlocks, and lists unlocked perks for the join screen', () => {
    const plain = newRun(5);
    const run = newRun(5);
    applyPerks(run, []);
    expect(run).toEqual(plain);
    const meta = defaultSave().meta;
    expect(perkLines(meta)).toEqual([]);
    meta.unlocked = ['old-route', 'spare-cells'];
    expect(perkLines(meta)).toEqual([
      `Spare cells: Start with ${TUNING.meta.spareCells} extra Cells.`,
      'Old route: Start with one rumor about the road ahead.',
    ]);
  });

  it('June stays out of it: perks only touch resources and the map', () => {
    const run = newRun(9);
    recruitJune(run.party, 50);
    const party = JSON.stringify(run.party);
    applyPerks(run, PERK_ORDER);
    expect(JSON.stringify(run.party)).toBe(party);
  });
});
