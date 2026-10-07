/**
 * The Mask's remaining unit checks (spec §17.1): breathing notch detection (§11.3), awareness thresholds and
 * decay (§8.4), and sympathizers (§8.5).
 */
import { describe, expect, it } from 'vitest';
import { TEST_LOT } from '../src/content/layouts/test';
import { TUNING } from '../src/content/tuning';
import { Rng } from '../src/core/rng';
import { startingParty, startingResources } from '../src/run/party';
import { newScan, pressScan, stepScan, type BreathScan } from '../src/sim/breathing';
import { newNpc } from '../src/sim/npc';
import { perceive } from '../src/sim/perception';
import { StopSim, type StopConfig } from '../src/sim/stop';
import type { NpcActor } from '../src/sim/types';

const B = TUNING.breathing;

function scan(): BreathScan {
  return newScan(new Rng(3), { skin01: 1, integrity: 100 });
}

/** Advance to `offset` seconds from the next beat and breathe there. */
function breatheAt(s: BreathScan, offset: number): void {
  const target = s.beats[s.next] + offset;
  stepScan(s, target - s.t);
  pressScan(s);
}

describe('breathing scan (spec §11.3)', () => {
  it('a breath inside the window counts; a beat left alone is a missed breath (+12)', () => {
    const s = scan();
    breatheAt(s, 0.12);
    expect(s.hits).toBe(1);
    expect(s.meter).toBe(0);
    // Let the next beat pass untouched.
    stepScan(s, s.beats[s.next] - s.t + B.windowMs / 1000 + 0.01);
    expect(s.misses).toBe(1);
    expect(s.meter).toBe(B.missPenalty);
  });

  it('three breaths in a row dead on the beat are too regular (+30); off-center breaths never are', () => {
    const regular = scan();
    for (let i = 0; i < B.tooRegularStreak; i++) breatheAt(regular, 0.005);
    expect(regular.tooRegularFlagged).toBe(1);
    expect(regular.meter).toBe(B.tooRegularPenalty);
    const human = scan();
    for (let i = 0; i < 4; i++) breatheAt(human, i % 2 === 0 ? 0.09 : -0.11);
    expect(human.tooRegularFlagged).toBe(0);
    expect(human.meter).toBe(0);
  });

  it('a press well before the beat does not count as a breath', () => {
    const s = scan();
    breatheAt(s, -(B.windowMs / 1000) * 1.5);
    expect(s.hits).toBe(0);
    expect(s.last).toBe('early');
  });
});

function sim(): StopSim {
  const cfg: StopConfig = {
    layout: TEST_LOT,
    seed: 5,
    region: 'newengland',
    weather: 'clear',
    heat: 0,
    day: 3,
    party: startingParty(),
    control: { 0: 'wren', 1: null },
    resources: startingResources(),
    noPatrol: true,
  };
  return new StopSim(cfg);
}

/** A clerk standing where Wren isn't in view (so only what we set matters). */
function watcher(s: StopSim, sympathizer: boolean): NpcActor {
  const w = s.member('wren')!;
  const n = newNpc(s, 'clerk', w.x + 6, w.y);
  n.facing = 0; // facing away, east
  n.obs.sympathizer = sympathizer;
  s.npcs.push(n);
  return n;
}

describe('awareness and sympathizers (spec §8.4, §8.5)', () => {
  it('out of sight, awareness decays', () => {
    const s = sim();
    const n = watcher(s, false);
    n.obs.awareness.wren = 50;
    for (let i = 0; i < 30; i++) perceive(s, 1 / 10);
    expect(n.obs.awareness.wren!).toBeLessThan(50);
  });

  it('a sympathizer who has noticed helps once instead of raising the alarm', () => {
    const s = sim();
    const n = watcher(s, true);
    n.obs.awareness.wren = TUNING.awareness.alarmed;
    perceive(s, 1 / 10);
    expect(n.helped).toBe(true);
    expect(n.obs.awareness.wren).toBe(0);
    expect(s.alert.on).toBe(false);
  });

  it('anyone else who reaches Alarmed raises ALERT', () => {
    const s = sim();
    const n = watcher(s, false);
    // Facing Wren while she does something suspicious.
    n.facing = Math.PI;
    s.member('wren')!.rate = TUNING.rates.sprint;
    n.obs.awareness.wren = TUNING.awareness.alarmed - 1;
    perceive(s, 1 / 10);
    expect(n.obs.state).toBe('alarmed');
    expect(s.alert.on).toBe(true);
  });
});
