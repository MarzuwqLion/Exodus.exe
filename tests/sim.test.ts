import { describe, expect, it } from 'vitest';
import { DEPOT_A, DEPOT_B } from '../src/content/layouts/depot';
import { TEST_LOT } from '../src/content/layouts/test';
import type { PlayerIntent, Slot } from '../src/core/types';
import { emptyIntent } from '../src/input/intents';
import { startingParty, startingResources } from '../src/run/party';
import { leashLimits } from '../src/sim/movement';
import { StopSim, type StopConfig } from '../src/sim/stop';
import { validateLayout } from '../src/sim/layout';

function cfg(over: Partial<StopConfig> = {}): StopConfig {
  return {
    layout: TEST_LOT,
    seed: 1,
    region: 'newengland',
    weather: 'clear',
    heat: 0,
    day: 1,
    party: startingParty(),
    control: { 0: 'wren', 1: null },
    resources: startingResources(),
    noPatrol: true,
    ...over,
  };
}

function intent(mx = 0, my = 0, extra: Partial<PlayerIntent> = {}): PlayerIntent {
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

describe('layouts', () => {
  it('validate (exits, containers, and points reachable; no point inside a wall)', () => {
    for (const L of [TEST_LOT, DEPOT_A, DEPOT_B]) expect(validateLayout(L), L.id).toEqual([]);
  });
});

describe('stop simulation: movement and control', () => {
  it('moves the player-controlled member with intents and faces the direction of travel', () => {
    const sim = new StopSim(cfg());
    const w = sim.member('wren')!;
    const x0 = w.x;
    run(sim, 90, () => ({ 0: intent(0.7, 0) }));
    expect(w.x - x0).toBeGreaterThan(2.5);
    expect(w.dir).toBe(0);
  });

  it('two intent streams move two characters; the third follows as AI', () => {
    const sim = new StopSim(cfg({ control: { 0: 'wren', 1: 'brick' } }));
    const w = sim.member('wren')!;
    const b = sim.member('brick')!;
    const v = sim.member('vesper')!;
    expect(w.controller).toBe(0);
    expect(b.controller).toBe(1);
    expect(v.controller).toBeNull();
    // Start everyone in the open lot.
    for (const [m, x, y] of [
      [w, 8.5, 8.5],
      [b, 18.5, 8.5],
      [v, 10.5, 9.5],
    ] as const) {
      m.x = m.px = x;
      m.y = m.py = y;
    }
    const w0 = { x: w.x, y: w.y };
    const b0 = { x: b.x, y: b.y };
    run(sim, 120, () => ({ 0: intent(0.8, 0), 1: intent(0, -0.8) }));
    expect(w.x - w0.x).toBeGreaterThan(3);
    expect(b0.y - b.y).toBeGreaterThan(2);
    // The AI member moved toward the nearest player.
    expect(Math.hypot(v.x - w0.x, v.y - w0.y)).toBeGreaterThan(0.5);
  });

  it('drops player 2 (their member turns AI) and rejoins next to player 1', () => {
    const sim = new StopSim(cfg({ control: { 0: 'wren', 1: 'brick' } }));
    const b = sim.member('brick')!;
    run(sim, 60, () => ({ 0: intent(0.8, 0), 1: intent(0, -0.8) }));
    sim.drop(1);
    expect(b.controller).toBeNull();
    expect(sim.control[1]).toBeNull();
    // While dropped, slot 1's intents are ignored; Brick follows as AI.
    run(sim, 120, () => ({ 0: intent(0.8, 0.2) }));
    // Rejoin: they get Brick back and appear next to Wren if far.
    const m = sim.join(1, 'brick')!;
    expect(m.id).toBe('brick');
    expect(m.controller).toBe(1);
    const w = sim.member('wren')!;
    expect(Math.hypot(m.x - w.x, m.y - w.y)).toBeLessThan(3.2);
    const x0 = m.x;
    run(sim, 60, () => ({ 0: intent(0, 0), 1: intent(-0.8, 0) }));
    expect(x0 - m.x).toBeGreaterThan(1.2);
  });

  it('leashes two players: they can never separate past the frame', () => {
    const sim = new StopSim(cfg({ layout: DEPOT_A, control: { 0: 'wren', 1: 'brick' } }));
    const L = leashLimits();
    run(sim, 900, () => ({ 0: intent(-1, 0), 1: intent(1, 0) }));
    const w = sim.member('wren')!;
    const b = sim.member('brick')!;
    expect(Math.abs(w.x - b.x)).toBeLessThanOrEqual(L.hardX + 0.2);
  });

  it('swaps characters in single player with the D-pad', () => {
    const sim = new StopSim(cfg());
    expect(sim.control[0]).toBe('wren');
    sim.step({ 0: intent(0, 0, { dpad: { up: false, down: false, left: false, right: true } }) });
    expect(sim.control[0]).not.toBe('wren');
    expect(sim.member(sim.control[0]!)!.controller).toBe(0);
    expect(sim.member('wren')!.controller).toBeNull();
  });

  it('is deterministic for the same seed and inputs', () => {
    const a = new StopSim(cfg({ layout: DEPOT_A, noPatrol: false, seed: 77 }));
    const b = new StopSim(cfg({ layout: DEPOT_A, noPatrol: false, seed: 77 }));
    const f = (t: number): Partial<Record<Slot, PlayerIntent>> => ({
      0: intent(Math.sin(t / 50) * 0.7, Math.cos(t / 70) * 0.6),
    });
    run(a, 1200, f);
    run(b, 1200, f);
    expect(a.members.map((m) => [m.x, m.y])).toEqual(b.members.map((m) => [m.x, m.y]));
    expect(a.npcs.map((n) => [n.x, n.y, n.obs.state])).toEqual(b.npcs.map((n) => [n.x, n.y, n.obs.state]));
  });
});

describe('stop simulation: suspicious behavior (spec §8.2)', () => {
  it('flags robotic movement: a straight line at constant full speed for more than 3 s', () => {
    const sim = new StopSim(cfg({ layout: DEPOT_A }));
    const w = sim.member('wren')!;
    w.x = 3;
    w.y = 13.5;
    let flagged = false;
    run(sim, 240, () => {
      if (w.roboticT > 0) flagged = true;
      return { 0: intent(1, 0) };
    });
    expect(flagged).toBe(true);
  });

  it('does not flag natural, varying movement', () => {
    const sim = new StopSim(cfg({ layout: DEPOT_A }));
    const w = sim.member('wren')!;
    w.x = 3;
    w.y = 13.5;
    let flagged = false;
    run(sim, 300, (t) => {
      if (w.roboticT > 0) flagged = true;
      return { 0: intent(0.75 + Math.sin(t / 9) * 0.2, Math.sin(t / 23) * 0.3) };
    });
    expect(flagged).toBe(false);
  });

  it('builds stillness suspicion after 4 s, and a Blend resets it', () => {
    const sim = new StopSim(cfg({ layout: TEST_LOT }));
    const w = sim.member('wren')!;
    run(sim, 300, () => ({ 0: intent(0, 0) }));
    expect(w.stillT).toBeGreaterThan(4);
    expect(w.rate).toBeGreaterThan(4);
    sim.step({ 0: intent(0, 0, { blendTap: true }) });
    expect(w.mode).toBe('blend');
    expect(w.stillT).toBe(0);
  });

  it('makes sprinting suspicious', () => {
    const sim = new StopSim(cfg({ layout: TEST_LOT }));
    const w = sim.member('wren')!;
    run(sim, 30, () => ({ 0: intent(1, 0, { sprint: true }) }));
    expect(w.rate).toBeGreaterThanOrEqual(30);
  });
});
