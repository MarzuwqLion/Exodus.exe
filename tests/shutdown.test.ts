/**
 * Shutdown, revive, carry, and loss in a stop (spec §8.10): a unit at 0 Hull shuts down; a teammate can reboot
 * it within 15 s for 1 Part, or carry it; it is lost if the car leaves without it or a Recycler scans it for
 * 3 s. June is knocked down instead, and helped up. Losing every android ends the stop.
 */
import { describe, expect, it } from 'vitest';
import { TEST_LOT } from '../src/content/layouts/test';
import { TUNING } from '../src/content/tuning';
import type { MemberId, PlayerIntent, Slot } from '../src/core/types';
import { emptyIntent } from '../src/input/intents';
import { newJune, startingParty, startingResources } from '../src/run/party';
import { shutdownMember } from '../src/sim/hostiles';
import { newNpc } from '../src/sim/npc';
import { StopSim, type StopConfig } from '../src/sim/stop';
import type { MemberActor } from '../src/sim/types';

const S = TUNING.shutdown;

function cfg(over: Partial<StopConfig> = {}): StopConfig {
  return {
    layout: TEST_LOT,
    seed: 13,
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

function run(sim: StopSim, seconds: number, f: () => Partial<Record<Slot, PlayerIntent | null>>): void {
  for (let t = 0; t < Math.round(seconds * 60); t++) sim.step(f());
}

function place(sim: StopSim, id: MemberId, x: number, y: number): MemberActor {
  const m = sim.member(id)!;
  m.x = m.px = x;
  m.y = m.py = y;
  m.vx = m.vy = 0;
  return m;
}

/** Press A, then hold it for `seconds` (the press is one tick; the hold is every tick). */
function holdA(sim: StopSim, seconds: number): void {
  let first = true;
  run(sim, seconds, () => {
    const it = intent({ interact: first, interactHeld: true });
    first = false;
    return { 0: it };
  });
}

/** Brick shut down in the open lot, Wren beside him, Vesper out of the way. */
function downed(over: Partial<StopConfig> = {}): { sim: StopSim; b: MemberActor; w: MemberActor } {
  const sim = new StopSim(cfg(over));
  place(sim, 'vesper', 4.5, 8.5);
  const b = place(sim, 'brick', 18.5, 9.5);
  const w = place(sim, 'wren', 17.7, 9.5);
  shutdownMember(sim, b);
  return { sim, b, w };
}

describe('shutdown and revive (spec §8.10)', () => {
  it('at 0 Hull an android shuts down; within 15 s, holding A for 3 s reboots it at 20 Hull for 1 Part', () => {
    const { sim, b } = downed();
    expect(b.mode).toBe('shutdown');
    expect(b.state.status).toBe('shutdown');
    const parts = sim.resources.parts;
    holdA(sim, S.reviveHold + 0.5);
    expect(b.mode).not.toBe('shutdown');
    expect(b.state.status).toBe('active');
    expect(b.state.kind === 'android' && b.state.hull).toBe(S.reviveHull);
    expect(sim.resources.parts).toBe(parts - S.reviveParts);
  });

  it('letting go of A early does not reboot it', () => {
    const { sim, b } = downed();
    holdA(sim, S.reviveHold - 1);
    run(sim, 0.5, () => ({ 0: intent() }));
    expect(b.mode).toBe('shutdown');
  });

  it('after 15 s, or with no Parts, the unit can only be picked up and carried', () => {
    for (const late of [true, false]) {
      const resources = startingResources();
      if (!late) resources.parts = 0;
      const { sim, b, w } = downed({ resources });
      if (late) b.downT = S.reviveWindow + 0.1;
      holdA(sim, 1.2);
      expect(b.state.status).toBe('shutdown');
      expect(b.mode).toBe('carried');
      expect(w.mode).toBe('carry');
      expect(sim.resources.parts).toBe(resources.parts);
    }
  });
});

describe('carrying (spec §8.10, §8.2)', () => {
  /** Metres walked east in 2 s at full tilt, carrying `who` or not. */
  function walked(carrier: 'wren' | 'brick', carrying: boolean): number {
    const sim = new StopSim(cfg({ control: { 0: carrier, 1: null } }));
    const other = carrier === 'wren' ? 'brick' : 'wren';
    place(sim, 'vesper', 4.5, 8.5);
    const c = place(sim, carrier, 6.5, 9.5);
    const o = place(sim, other, 7.3, 9.5);
    if (carrying) {
      shutdownMember(sim, o);
      o.downT = S.reviveWindow + 0.1;
      holdA(sim, 1.2);
      expect(c.mode).toBe('carry');
    } else o.x = o.px = 3.5;
    const x0 = c.x;
    run(sim, 2, () => ({ 0: intent({}, 1, 0) }));
    return c.x - x0;
  }

  it('a carrier walks at half speed, except Brick, who carries at full speed', () => {
    const ratio = walked('wren', true) / walked('wren', false);
    expect(ratio).toBeGreaterThan(TUNING.movement.carrySpeedMult - 0.1);
    expect(ratio).toBeLessThan(TUNING.movement.carrySpeedMult + 0.1);
    expect(walked('brick', true) / walked('brick', false)).toBeGreaterThan(0.9);
  });

  it('carrying a shut-down unit is very suspicious to anyone who sees it', () => {
    const watched = (carrying: boolean): number => {
      const { sim, b, w } = downed();
      if (carrying) {
        b.downT = S.reviveWindow + 0.1;
        holdA(sim, 1.2);
        expect(w.mode).toBe('carry');
      } else {
        sim.lose(b, 'test');
      }
      const n = newNpc(sim, 'mechanic', w.x + 4, w.y);
      n.facing = Math.PI;
      n.obs.sympathizer = false;
      sim.npcs.push(n);
      run(sim, 1, () => ({ 0: intent() }));
      return n.obs.awareness.wren ?? 0;
    };
    // Standing still for a second is nothing; standing there holding a body is +40/s (scaled by distance).
    expect(watched(false)).toBeLessThan(5);
    expect(watched(true)).toBeGreaterThan(TUNING.rates.carryUnit * 0.5);
  });
});

describe('loss (spec §8.10)', () => {
  it('a Recycler who reaches a shut-down unit scans it for 3 s, and it is reclaimed', () => {
    // A unit only goes down in a fight, so the stop is in ALERT.
    const { sim, b } = downed();
    sim.raiseAlert({ x: b.x, y: b.y });
    place(sim, 'wren', 4.5, 9.5);
    const r = newNpc(sim, 'recycler', b.x + 0.9, b.y);
    sim.npcs.push(r);
    run(sim, S.reclaimScanSeconds - 0.5, () => ({ 0: intent() }));
    expect(b.state.status).toBe('shutdown');
    run(sim, 1, () => ({ 0: intent() }));
    expect(b.state.status).toBe('lost');
    expect(sim.stats.lost).toContainEqual({ member: 'brick', how: 'reclaimed' });
  });

  it('when the car leaves, a shut-down unit outside the exit zone is lost; one carried into it rides along', () => {
    const left = downed().sim;
    place(left, 'wren', 1.5, 12.5);
    place(left, 'vesper', 2.5, 12.5);
    left.leave();
    expect(left.outcome?.lost).toContainEqual({ member: 'brick', how: 'left behind, shut down' });
    expect(left.outcome?.carried).toEqual([]);

    const { sim, b, w } = downed();
    b.downT = S.reviveWindow + 0.1;
    holdA(sim, 1.2);
    expect(w.mode).toBe('carry');
    place(sim, 'wren', 1.5, 12.5);
    place(sim, 'vesper', 2.5, 12.5);
    sim.leave();
    expect(sim.outcome?.carried).toEqual(['brick']);
    expect(sim.outcome?.lost).toEqual([]);
  });

  it('June at 0 Health is knocked down; holding A for 2 s helps her up; left behind, she is arrested', () => {
    const party = [...startingParty(), newJune()];
    const sim = new StopSim(cfg({ party }));
    place(sim, 'vesper', 4.5, 8.5);
    place(sim, 'brick', 5.5, 8.5);
    const j = place(sim, 'june', 18.5, 9.5);
    place(sim, 'wren', 17.7, 9.5);
    j.mode = 'down';
    j.downT = 0;
    if (j.state.kind === 'human') j.state.health = 0;
    holdA(sim, S.juneHelpUpHold - 0.5);
    expect(j.mode).toBe('down');
    holdA(sim, S.juneHelpUpHold + 0.5);
    expect(j.mode).not.toBe('down');
    expect(j.state.kind === 'human' && j.state.health).toBeGreaterThan(0);
    // Left outside the exit zone when the car goes: arrested.
    place(sim, 'wren', 1.5, 12.5);
    place(sim, 'vesper', 2.5, 12.5);
    place(sim, 'brick', 3.5, 12.5);
    sim.leave();
    expect(sim.outcome?.juneArrested).toBe(true);
    expect(sim.outcome?.lost).toContainEqual({ member: 'june', how: 'arrested' });
  });

  it('the stop ends the moment every android is lost', () => {
    const sim = new StopSim(cfg());
    for (const id of ['wren', 'brick'] as const) sim.lose(sim.member(id)!, 'reclaimed');
    expect(sim.outcome).toBeNull();
    sim.lose(sim.member('vesper')!, 'reclaimed');
    expect(sim.outcome?.end).toBe('allLost');
  });
});
