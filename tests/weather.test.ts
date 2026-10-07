/** Weather and region stealth effects (spec §8.8), plus the rain-related human needs (§8.2, §8.3). */
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/content/tuning';
import { DEPOT_A } from '../src/content/layouts/depot';
import { GAS_A } from '../src/content/layouts/gas';
import { TEST_LOT } from '../src/content/layouts/test';
import type { PlayerIntent, Region, Slot, Weather } from '../src/core/types';
import { emptyIntent } from '../src/input/intents';
import { startingParty, startingResources } from '../src/run/party';
import { blendsFor } from '../src/sim/actions';
import { F } from '../src/sim/grid';
import { newNpc } from '../src/sim/npc';
import { StopSim, type StopConfig } from '../src/sim/stop';

function cfg(over: Partial<StopConfig> = {}): StopConfig {
  return {
    layout: TEST_LOT,
    seed: 2,
    region: 'newengland',
    weather: 'clear',
    heat: 0,
    day: 3,
    party: startingParty(),
    control: { 0: 'wren', 1: null },
    resources: startingResources(),
    noPatrol: true,
    ...over,
  };
}

function intent(extra: Partial<PlayerIntent> = {}, mx = 0, my = 0): PlayerIntent {
  const it = emptyIntent();
  it.move.x = mx;
  it.move.y = my;
  return Object.assign(it, extra);
}

function run(
  sim: StopSim,
  ticks: number,
  f: (t: number) => Partial<Record<Slot, PlayerIntent | null>>,
): void {
  for (let t = 0; t < ticks; t++) sim.step(f(t));
}

function at(weather: Weather, region: Region = 'newengland'): StopSim {
  return new StopSim(cfg({ weather, region }));
}

describe('weather (spec §8.8)', () => {
  it('rain cuts observer range 20%, fog 30%, heavy rain and storms 35% with hearing halved', () => {
    const W = TUNING.weather;
    expect(at('clear').rangeMult).toBe(1);
    expect(at('rain').rangeMult).toBeCloseTo(W.rainRangeMult);
    expect(at('fog').rangeMult).toBeCloseTo(W.fogRangeMult);
    expect(at('storm').rangeMult).toBeCloseTo(W.heavyRangeMult);
    expect(at('heavyrain').hearMult).toBeCloseTo(W.heavyHearingMult);
    expect(W.rainRangeMult).toBeCloseTo(0.8);
    expect(W.fogRangeMult).toBeCloseTo(0.7);
    expect(W.heavyRangeMult).toBeCloseTo(0.65);
    expect(W.heavyHearingMult).toBeCloseTo(0.5);
  });

  it('snow muffles footsteps: hearing −40%', () => {
    expect(at('snow').hearMult).toBeCloseTo(TUNING.weather.snowHearingMult);
    expect(TUNING.weather.snowHearingMult).toBeCloseTo(0.6);
    expect(at('snow').rangeMult).toBe(1);
  });

  it('lightning flashes briefly restore full range in a storm', () => {
    const sim = at('storm');
    let flashed = false;
    let fullRange = false;
    run(sim, 60 * 40, () => {
      if (sim.events.some((e) => e.t === 'flash')) {
        flashed = true;
        fullRange ||= sim.currentRangeMult() === 1;
      }
      return { 0: intent() };
    });
    expect(flashed).toBe(true);
    expect(fullRange).toBe(true);
    expect(sim.currentRangeMult()).toBeCloseTo(TUNING.weather.heavyRangeMult);
  });
});

describe('regions (spec §8.8)', () => {
  it('the Corridor adds a security camera to every stop and runs the patrol clock 15% faster', () => {
    const ne = new StopSim(cfg({ layout: DEPOT_A, noPatrol: false }));
    const co = new StopSim(cfg({ layout: DEPOT_A, region: 'corridor', weather: 'rain', noPatrol: false }));
    expect(co.cameras.length).toBe(ne.cameras.length + TUNING.weather.corridorExtraCameras);
    expect(co.patrolFactor()).toBeCloseTo(ne.patrolFactor() * TUNING.weather.corridorPatrolMult);
  });

  it('the Piedmont: civilians grow suspicious 20% faster (strangers stand out in small towns)', () => {
    const gain = (region: Region): number => {
      // Brick standing uncannily still in front of a cook (staff count as civilians; no grill here).
      const sim = new StopSim(
        cfg({ layout: GAS_A, region, weather: 'clear', control: { 0: 'brick', 1: null } }),
      );
      sim.npcs.length = 0;
      sim.cameras.length = 0;
      const b = sim.member('brick')!;
      b.x = 18.5;
      b.y = 18.5;
      const n = newNpc(sim, 'cook', 22.5, 18.5);
      n.facing = Math.PI;
      n.obs.sympathizer = false;
      sim.npcs.push(n);
      run(sim, 60 * 7, () => ({ 0: intent() }));
      return n.obs.awareness.brick ?? 0;
    };
    const ne = gain('newengland');
    void ne;
    const pd = gain('piedmont');
    expect(ne).toBeGreaterThan(0);
    expect(pd / ne).toBeCloseTo(TUNING.awareness.piedmontCivilianMult, 1);
  });
});

describe('rain and human needs (spec §8.2, §8.3)', () => {
  it('standing in the rain with no reaction is skipping a human need; under cover it is fine', () => {
    const sim = new StopSim(cfg({ layout: GAS_A, weather: 'rain' }));
    const w = sim.member('wren')!;
    w.x = 2.5;
    w.y = 19.5;
    expect(sim.grid.flagAt(w.x, w.y, F.COVER)).toBe(false);
    run(sim, 60 * (TUNING.rates.rainNoReactionSeconds + 1), () => ({ 0: intent() }));
    expect(w.rainT).toBeGreaterThan(TUNING.rates.rainNoReactionSeconds);
    const covered = new StopSim(cfg({ layout: GAS_A, weather: 'rain' }));
    const c = covered.member('wren')!;
    c.x = 12.5;
    c.y = 14.5;
    expect(covered.grid.flagAt(c.x, c.y, F.COVER)).toBe(true);
    run(covered, 60 * (TUNING.rates.rainNoReactionSeconds + 1), () => ({ 0: intent() }));
    expect(c.rainT).toBe(0);
    expect(blendsFor(covered, c)).toContain('shelter');
  });
});
