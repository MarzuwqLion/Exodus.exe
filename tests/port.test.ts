/** The Port (spec §11.5, §17.1 "the Port timers"): the dawn clock, the arch, the horn, boarding, the berth. */
import { describe, expect, it } from 'vitest';
import { portConfigFor } from '../src/bots/portbots';
import { PORT_GEO } from '../src/content/layouts/port';
import { TUNING } from '../src/content/tuning';
import { findInteraction, startInteraction } from '../src/sim/actions';
import { updateBehaviors } from '../src/sim/behaviors';
import { gangwayFoot, trespassing } from '../src/sim/port';
import { StopSim, type StopConfig } from '../src/sim/stop';
import type { MemberActor } from '../src/sim/types';

function port(over: Partial<StopConfig> = {}, heat = 0): StopSim {
  const cfg = portConfigFor({ seed: 7, players: 1, heat });
  return new StopSim({ ...cfg, ...over });
}

/** Step the sim for `seconds` with nobody touching the controls. */
function idle(sim: StopSim, seconds: number): void {
  for (let i = 0; i < seconds * TUNING.sim.hz && !sim.outcome; i++) sim.step({});
}

function place(m: MemberActor, x: number, y: number): void {
  m.x = m.px = x;
  m.y = m.py = y;
  m.vx = m.vy = 0;
}

/** Keep everyone out of the way: hostiles and civilians off the map. */
function clearNpcs(sim: StopSim): void {
  for (const n of sim.npcs) if (n.role !== 'crew' && n.role !== 'mensah') n.mode = 'gone';
  sim.drones.length = 0;
}

describe('the Port (spec §11.5)', () => {
  it('the dawn clock runs 4:50 to 6:00 over six real minutes', () => {
    const sim = port();
    const P = TUNING.port;
    expect(sim.port!.clock).toBe(P.clockStartMinutes);
    clearNpcs(sim);
    idle(sim, P.realSeconds / 2);
    expect(sim.port!.clock).toBeCloseTo((P.clockStartMinutes + P.clockEndMinutes) / 2, 0);
  }, 20000);

  it('at 5:30 the horn sounds and the gangway timer runs; when it ends with nobody aboard, the ship has sailed', () => {
    // A quicker dawn (the clock scales with the configured length) keeps the test fast.
    const seconds = 60;
    const sim = port({ port: { seconds, gateCrewSympathizers: false } });
    clearNpcs(sim);
    const P = TUNING.port;
    const hornAt =
      ((P.hornAtMinutes - P.clockStartMinutes) / (P.clockEndMinutes - P.clockStartMinutes)) * seconds;
    idle(sim, hornAt - 1);
    expect(sim.port!.horn).toBe(false);
    idle(sim, 2);
    expect(sim.port!.horn).toBe(true);
    expect(sim.alert.on).toBe(true);
    idle(sim, P.gangwaySeconds + 1);
    expect(sim.outcome?.end).toBe('missedShip');
    expect(sim.outcome?.aboard).toEqual([]);
  }, 20000);

  it('the first step onto the gangway sounds the horn; reaching the deck is aboard; the ship sails once nobody is left ashore', () => {
    const sim = port();
    clearNpcs(sim);
    const [wren, brick, vesper] = sim.members;
    const G = PORT_GEO;
    place(wren, G.gangwayX + 0.5, G.gangwayFoot + 0.5);
    sim.step({});
    expect(sim.port!.horn).toBe(true);
    place(wren, G.gangwayX + 0.5, G.deckY + 0.5);
    sim.step({});
    expect(wren.mode).toBe('aboard');
    expect(sim.outcome).toBeNull();
    for (const m of [brick, vesper]) {
      place(m, G.gangwayX + 1.5, G.deckY + 0.5);
      sim.step({});
    }
    expect(sim.outcome?.end).toBe('sailed');
    expect(sim.outcome?.aboard.sort()).toEqual(['brick', 'vesper', 'wren']);
  });

  it('the arch takes 1 Papers per android; without Papers it scans; under ALERT it is locked', () => {
    const sim = port({
      resources: { ...portConfigFor({ seed: 7, players: 1, heat: 0 }).resources, papers: 1 },
    });
    const [wren, brick] = sim.members;
    place(wren, PORT_GEO.archSouth.x, PORT_GEO.archSouth.y);
    const it = findInteraction(sim, wren)!;
    expect(it.kind).toBe('arch');
    expect(it.verb).toMatch(/Papers/);
    startInteraction(sim, wren, it);
    expect(sim.resources.papers).toBe(0);
    expect(sim.port!.gatePassed.has(wren.idx)).toBe(true);
    expect(wren.y).toBeLessThan(PORT_GEO.fenceY);
    place(brick, PORT_GEO.archSouth.x, PORT_GEO.archSouth.y);
    const scan = findInteraction(sim, brick)!;
    expect(scan.verb).toBe('Breathing scan');
    startInteraction(sim, brick, scan);
    expect(brick.mode).toBe('scanned');
    expect(sim.port!.archScan).toBe(brick.idx);
    sim.raiseAlert(null);
    sim.step({});
    expect(sim.port!.archScan).toBe(-1);
    expect(findInteraction(sim, brick)?.disabled).toBe('Locked down');
  });

  it("Captain Mensah's friends at the gate wave the party through", () => {
    const cfg = portConfigFor({ seed: 7, players: 1, heat: 0, mensah: true, papers: 0 });
    const sim = new StopSim(cfg);
    const [wren] = sim.members;
    place(wren, PORT_GEO.archSouth.x, PORT_GEO.archSouth.y);
    const it = findInteraction(sim, wren)!;
    expect(it.verb).toBe('Walk through');
    startInteraction(sim, wren, it);
    expect(sim.port!.gatePassed.has(wren.idx)).toBe(true);
  });

  it('the yard, the waterline, and the apron (without the gate) are trespassing; the lot and the gate queue are not', () => {
    const sim = port();
    const [wren] = sim.members;
    place(wren, 20, 40);
    expect(trespassing(sim, wren)).toBe(true);
    place(wren, 3.5, 40);
    expect(trespassing(sim, wren)).toBe(true);
    place(wren, 20, 15);
    expect(trespassing(sim, wren)).toBe(true);
    sim.port!.gatePassed.add(wren.idx);
    expect(trespassing(sim, wren)).toBe(false);
    place(wren, 20, 56);
    expect(trespassing(sim, wren)).toBe(false);
    place(wren, PORT_GEO.archSouth.x, PORT_GEO.archSouth.y + 1);
    expect(trespassing(sim, wren)).toBe(false);
    place(wren, 20, 40);
    updateBehaviors(sim, 1 / 60);
    expect(wren.rate).toBeGreaterThanOrEqual(TUNING.rates.portTrespass);
  });

  it('Recyclers 2 + 1 per Heat level walk the yard, and at Heat 1+ more of them hold the berth', () => {
    const count = (heat: number): { beat: number; posted: number } => {
      const sim = port({}, heat);
      const recyclers = sim.npcs.filter((n) => n.role === 'recycler' || n.role === 'gunner');
      return {
        beat: recyclers.filter((n) => !n.post).length,
        posted: recyclers.filter((n) => n.post).length,
      };
    };
    expect(count(0)).toEqual({ beat: 2, posted: 0 });
    expect(count(2)).toEqual({ beat: 4, posted: 2 * TUNING.port.berthGuardsPerHeat });
  });

  it('the crew keeps the gangway up while a Recycler holds the berth, and lowers it once he is down', () => {
    const sim = port({}, 1);
    const guard = sim.npcs.find((n) => n.post)!;
    expect(guard).toBeDefined();
    sim.step({});
    expect(sim.port!.gangwayUp).toBe(true);
    const G = PORT_GEO;
    expect(sim.grid.walkable(G.gangwayX, G.gangwayFoot)).toBe(false);
    for (const n of sim.npcs) if (n.post) n.mode = 'ko';
    sim.step({});
    expect(sim.port!.gangwayUp).toBe(false);
    expect(sim.grid.walkable(G.gangwayX, G.gangwayFoot)).toBe(true);
    expect(gangwayFoot(sim).y).toBeGreaterThan(G.gangwayFoot);
  });

  it('yard trucks are moving cover: they block sight and stop for anyone in their way', () => {
    const sim = port();
    const truck = sim.port!.vehicles.find((v) => v.kind === 'truck')!;
    const tile = truck.tiles[0];
    expect(sim.grid.opaque(tile % sim.grid.w, Math.floor(tile / sim.grid.w))).toBe(true);
    // Someone standing just ahead of it in its lane: it waits.
    clearNpcs(sim);
    truck.waitT = 0;
    const ahead = truck.dir > 0 ? truck.x + truck.hx + 0.4 : truck.x - truck.hx - 0.4;
    const [wren] = sim.members;
    place(wren, Math.min(truck.maxX + truck.hx - 0.5, Math.max(truck.minX - truck.hx + 0.5, ahead)), truck.y);
    const x0 = truck.x;
    for (let i = 0; i < 30; i++) {
      place(wren, wren.x, truck.y);
      sim.step({});
    }
    if (Math.abs(ahead - wren.x) < 0.01) expect(truck.x).toBeCloseTo(x0, 1);
  });
});
