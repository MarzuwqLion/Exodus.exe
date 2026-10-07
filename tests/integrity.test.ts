/**
 * Glitches, Integrity, and factory resets (spec §12.6): random glitches below 40 Integrity that observers
 * notice, the stresses that lower Integrity in a stop, and the rare, dramatic reset at 0.
 */
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/content/tuning';
import { TEST_LOT } from '../src/content/layouts/test';
import type { MemberId, PlayerIntent, Slot } from '../src/core/types';
import { emptyIntent } from '../src/input/intents';
import { startingParty, startingResources } from '../src/run/party';
import { glitch } from '../src/sim/actions';
import { beginScan } from '../src/sim/hostiles';
import { newNpc } from '../src/sim/npc';
import { StopSim, type StopConfig } from '../src/sim/stop';
import type { MemberActor } from '../src/sim/types';

function cfg(over: Partial<StopConfig> = {}): StopConfig {
  return {
    layout: TEST_LOT,
    seed: 11,
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

function setIntegrity(party: ReturnType<typeof startingParty>, id: MemberId, v: number): void {
  const m = party.find((p) => p.id === id);
  if (m?.kind === 'android') m.integrity = v;
}

function place(sim: StopSim, id: MemberId, x: number, y: number): MemberActor {
  const m = sim.member(id)!;
  m.x = x;
  m.y = y;
  m.vx = m.vy = 0;
  return m;
}

function countGlitches(integrity: number, seconds: number): number {
  const party = startingParty();
  setIntegrity(party, 'wren', integrity);
  const sim = new StopSim(cfg({ party }));
  let n = 0;
  run(sim, 60 * seconds, () => {
    n += sim.events.filter((e) => e.t === 'glitch').length;
    return { 0: intent() };
  });
  return n;
}

describe('glitches (spec §12.6)', () => {
  it('never at 40 Integrity or above; below it, more often as Integrity drops', () => {
    expect(countGlitches(40, 120)).toBe(0);
    const at20 = countGlitches(20, 300);
    const at0 = countGlitches(0, 300);
    expect(at0).toBeGreaterThan(3);
    expect(at0).toBeGreaterThan(at20);
  });

  it('a glitch interrupts what the unit was doing, freezes it briefly, and observers notice (+20)', () => {
    const sim = new StopSim(cfg());
    const w = place(sim, 'wren', 18.5, 9.5);
    const n = newNpc(sim, 'mechanic', 21.5, 9.5);
    n.facing = Math.PI;
    n.obs.sympathizer = false;
    sim.npcs.push(n);
    sim.step({ 0: intent({ blendTap: true }) });
    expect(w.mode).toBe('blend');
    glitch(sim, w, 0.3);
    expect(w.mode).toBe('glitch');
    expect(w.blend).toBeNull();
    const before = n.obs.awareness.wren ?? 0;
    run(sim, 4, () => ({ 0: intent() }));
    expect((n.obs.awareness.wren ?? 0) - before).toBeGreaterThanOrEqual(TUNING.rates.glitch);
    run(sim, 30, () => ({ 0: intent() }));
    expect(w.mode).not.toBe('glitch');
  });
});

describe('Integrity stress in a stop (spec §12.6)', () => {
  it('being scanned costs 4', () => {
    const sim = new StopSim(cfg());
    const w = sim.member('wren')!;
    const r = newNpc(sim, 'recycler', w.x + 1, w.y);
    sim.npcs.push(r);
    const i0 = w.state.kind === 'android' ? w.state.integrity : 0;
    beginScan(sim, r, w, true);
    expect(w.state.kind === 'android' && w.state.integrity).toBe(i0 + TUNING.integrity.scanned);
  });

  it('losing a party member costs every android still with the party 15', () => {
    const sim = new StopSim(cfg());
    const w = sim.member('wren')!;
    const b = sim.member('brick')!;
    const i0 = w.state.kind === 'android' ? w.state.integrity : 0;
    sim.lose(b, 'reclaimed');
    expect(w.state.kind === 'android' && w.state.integrity).toBe(i0 + TUNING.integrity.memberLost);
  });
});

describe('factory reset at 0 Integrity (spec §12.6)', () => {
  it('the unit walks toward the nearest human to turn itself in; pulled back in time, it resets to 20', () => {
    const party = startingParty();
    setIntegrity(party, 'vesper', 0);
    const sim = new StopSim(cfg({ party, pendingResets: ['vesper'] }));
    const v = sim.member('vesper')!;
    expect(v.mode).toBe('factory');
    const n = newNpc(sim, 'mechanic', 24.5, 8.5);
    n.obs.sympathizer = false;
    sim.npcs.push(n);
    const d0 = Math.hypot(v.x - n.x, v.y - n.y);
    run(sim, 60, () => ({ 0: intent() }));
    expect(Math.hypot(v.x - n.x, v.y - n.y)).toBeLessThan(d0);
    // Wren reaches it and holds A to pull it back.
    place(sim, 'wren', v.x - 0.8, v.y);
    run(sim, 60 * (TUNING.integrity.resetPullHold + 0.5), () => ({
      0: intent({ interact: true, interactHeld: true }),
    }));
    expect(v.mode).not.toBe('factory');
    expect(v.state.kind === 'android' && v.state.integrity).toBe(TUNING.integrity.resetTo);
    expect(v.state.status).toBe('active');
  });

  it('nobody reaches it in 10 s: it turns itself in and is lost', () => {
    const party = startingParty();
    setIntegrity(party, 'vesper', 0);
    const sim = new StopSim(cfg({ party, pendingResets: ['vesper'] }));
    run(sim, 60 * (TUNING.integrity.resetPullSeconds + 0.5), () => ({ 0: intent() }));
    const v = sim.member('vesper')!;
    expect(v.state.status).toBe('lost');
    expect(sim.stats.lost.some((l) => l.member === 'vesper' && l.how === 'turned itself in')).toBe(true);
  });
});
