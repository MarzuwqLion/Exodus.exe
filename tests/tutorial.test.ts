/** Night one's director (spec §12.9): each step completes the moment the player does the thing. */
import { describe, expect, it } from 'vitest';
import { layoutFor } from '../src/content/layouts';
import { TUNING } from '../src/content/tuning';
import { newRun } from '../src/run/run';
import { completeSearch, plugIn, startBlend, startChat } from '../src/sim/actions';
import { StopSim, type StopConfig } from '../src/sim/stop';
import type { TutorialStep } from '../src/sim/tutorial';

function tutorial(from: TutorialStep = 'walk', players: 1 | 2 = 1): StopSim {
  const run = newRun(3, { control: { 0: 'wren', 1: players === 2 ? 'brick' : null } });
  const cfg: StopConfig = {
    layout: layoutFor('depot', 0),
    seed: 9,
    region: 'newengland',
    weather: 'snow',
    heat: 0,
    day: 1,
    party: run.party.map((m) => ({ ...m })),
    control: { ...run.control },
    resources: { ...run.resources, papers: run.resources.papers + 1 },
    tutorial: true,
    tutorialFrom: from,
    patrolTimes: { drone1: Infinity, sweep: Infinity, drone2: Infinity },
  };
  return new StopSim(cfg);
}

function steps(sim: StopSim): string[] {
  return sim.events.filter((e) => e.t === 'tutorial').map((e) => (e as { step: string }).step);
}

describe('the tutorial (spec §12.9)', () => {
  it('walk → blend → search → charge → leave, solo; the drone comes for the last step', () => {
    const sim = tutorial();
    sim.step({});
    expect(steps(sim)).toEqual(['walk']);
    const wren = sim.controlled(0)!;
    // Walk back and forth between two open spots 3 m apart until 8 m are behind her.
    const a = { x: wren.x, y: wren.y };
    const b = sim.grid.nearestWalkable(wren.x, wren.y - 3)!;
    for (let i = 0; i < 12 && sim.tutorial!.step === 'walk'; i++) {
      const p = i % 2 === 0 ? b : a;
      wren.x = wren.px = p.x;
      wren.y = wren.py = p.y;
      sim.step({});
    }
    expect(sim.tutorial!.step).toBe('blend');
    // A customer has turned Curious about Wren.
    const curious = sim.npcs.some(
      (n) => n.role === 'customer' && (n.obs.awareness.wren ?? 0) >= TUNING.awareness.curious,
    );
    expect(curious).toBe(true);
    startBlend(sim, wren, 'phone');
    sim.step({});
    expect(sim.tutorial!.step).toBe('search');
    const pub = sim.containers.find((c) => !c.private)!;
    completeSearch(sim, wren, pub);
    for (let i = 0; i < 3; i++) sim.step({});
    // The clerk goes out for a smoke once a shelf is done.
    const clerk = sim.npcs.find((n) => n.role === 'clerk');
    if (clerk) expect(clerk.step).toBeGreaterThanOrEqual(1);
    const priv = sim.containers.find((c) => c.private && !c.locked)!;
    completeSearch(sim, wren, priv);
    sim.step({});
    expect(sim.tutorial!.step).toBe('charge');
    const bay = sim.bays.find((b) => !b.forCar)!;
    plugIn(sim, wren, bay.idx);
    startBlend(sim, wren, 'phone');
    sim.step({});
    // Solo: no chat lesson.
    expect(sim.tutorial!.step).toBe('leave');
    expect(sim.patrol.drone1).toBeLessThanOrEqual(Math.max(TUNING.patrol.tutorialDrone, sim.time + 2));
  });

  it('two players get the chat lesson; a restart starts from the step it is given', () => {
    const sim = tutorial('charge', 2);
    sim.step({});
    expect(steps(sim)).toEqual(['charge']);
    const wren = sim.controlled(0)!;
    plugIn(sim, wren, sim.bays.find((b) => !b.forCar)!.idx);
    startBlend(sim, wren, 'phone');
    sim.step({});
    expect(sim.tutorial!.step).toBe('chat');
    startChat(sim, wren, sim.controlled(1)!);
    sim.step({});
    expect(sim.tutorial!.step).toBe('leave');
  });
});
