/**
 * The other stops (spec §10.3–10.5, M4): layout validation for every layout, the Gas Station's car charging,
 * the Diner's coffee, the party AI's manners around staff rooms, the patrol clock's drones, and footsteps.
 */
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/content/tuning';
import { allLayouts, STOP_LAYOUTS } from '../src/content/layouts';
import { DEPOT_A } from '../src/content/layouts/depot';
import { DINER_A } from '../src/content/layouts/diner';
import { GAS_A, GAS_B } from '../src/content/layouts/gas';
import type { PlayerIntent, Slot } from '../src/core/types';
import { emptyIntent } from '../src/input/intents';
import { startingParty, startingResources } from '../src/run/party';
import { F } from '../src/sim/grid';
import { parseLayout, validateLayout } from '../src/sim/layout';
import { Rng } from '../src/core/rng';
import {
  applyTrade,
  canTrade,
  keeperForColumn,
  rollCompromised,
  stationCare,
  stationLayout,
  type StationTrade,
} from '../src/run/station';
import { StopSim, type StopConfig } from '../src/sim/stop';

function cfg(over: Partial<StopConfig> = {}): StopConfig {
  return {
    layout: GAS_A,
    seed: 3,
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

function place(sim: StopSim, id: 'wren' | 'brick' | 'vesper', x: number, y: number): void {
  const m = sim.member(id)!;
  m.x = x;
  m.y = y;
  m.vx = 0;
  m.vy = 0;
}

describe('layouts', () => {
  it('every layout validates: exits, containers, and points reachable, no point inside a wall', () => {
    const all = allLayouts();
    expect(all.length).toBeGreaterThanOrEqual(13);
    for (const L of all) expect(validateLayout(L), L.id).toEqual([]);
  });

  it('every stop type has two layout variants (Stations three), with rows of equal width', () => {
    for (const kind of ['depot', 'diner', 'gas'] as const) expect(STOP_LAYOUTS[kind].length).toBe(2);
    expect(STOP_LAYOUTS.station.length).toBe(3);
    for (const L of allLayouts()) {
      const widths = new Set(L.grid.map((r) => r.length));
      expect(widths.size, L.id).toBe(1);
    }
  });

  it('gas stations have parts aisles, a garage, a register, an EV charger, and a sweeping camera', () => {
    for (const L of STOP_LAYOUTS.gas) {
      const p = parseLayout(L);
      const kinds = new Set(p.containers.map((c) => c.kind));
      for (const k of ['partsAisle', 'garage', 'register', 'store'] as const)
        expect(kinds.has(k), `${L.id} ${k}`).toBe(true);
      expect(
        L.grid.some((r) => r.includes('E')),
        L.id,
      ).toBe(true);
      expect(
        (L.cameras ?? []).some((c) => (c.sweep ?? 0) >= 120),
        L.id,
      ).toBe(true);
    }
  });
});

describe('grid', () => {
  it('finds the way out of a staff room by walking distance', () => {
    const p = parseLayout(DEPOT_A);
    const office = p.waypoints.get('office')!;
    expect(p.grid.flagAt(office.x, office.y, F.STAFF)).toBe(true);
    const out = p.grid.nearestWithout(office.x, office.y, F.STAFF)!;
    expect(out).not.toBeNull();
    expect(p.grid.flagAt(out.x, out.y, F.STAFF)).toBe(false);
    expect(p.grid.walkableAt(out.x, out.y)).toBe(true);
    // Reachable from the office.
    expect(p.grid.path(office.x, office.y, out.x, out.y)).not.toBeNull();
  });
});

describe('gas station: charging the car (spec §10.4)', () => {
  for (const L of [GAS_A, GAS_B]) {
    it(`${L.id}: plug in from the lot side, pump gas, and the car charges on a spoofed session`, () => {
      const sim = new StopSim(cfg({ layout: L }));
      const bay = sim.bays.find((b) => b.forCar)!;
      // Stand beside the charger outside the exit zone (inside it, A means Leave).
      const spot = [-1, 1]
        .map((dx) => ({ x: bay.x + dx, y: bay.y }))
        .find((q) => sim.grid.walkableAt(q.x, q.y) && !sim.inExit(q.x, q.y))!;
      expect(spot).toBeDefined();
      place(sim, 'wren', spot.x, spot.y);
      const car0 = sim.resources.carBattery;
      const papers0 = sim.resources.papers;
      run(sim, 60, () => ({ 0: intent({ interact: true, interactHeld: true }) }));
      const w = sim.member('wren')!;
      expect(w.plug).toBe('car');
      expect(w.mode).toBe('blend');
      expect(w.blend).toBe('pump');
      expect(sim.resources.papers).toBe(papers0 - 1);
      // The session is spoofed: suspicious while watched, covered by pumping.
      expect(w.rate).toBeGreaterThanOrEqual(TUNING.rates.spoofedCharging);
      run(sim, 600, () => ({ 0: intent() }));
      expect(sim.resources.carBattery).toBeGreaterThan(car0 + 10);
    });
  }
});

describe('diner: ordering (spec §10.3)', () => {
  it('one order at the counter gets the whole party coffee', () => {
    const sim = new StopSim(cfg({ layout: DINER_A }));
    const q = sim.layout.waypoints.get('queue')!;
    place(sim, 'wren', q.x, q.y);
    sim.step({ 0: intent({ blendTap: true }) });
    const w = sim.member('wren')!;
    expect(w.blend).toBe('order');
    run(sim, 60 * (TUNING.blend.durations.order + 0.5), () => ({ 0: intent() }));
    for (const m of sim.members) {
      expect(m.ordered, m.id).toBe(true);
      expect(m.hasCoffee, m.id).toBe(true);
    }
  });
});

describe('party AI around staff rooms (spec §10.7)', () => {
  it('waits outside while its player goes into a back office', () => {
    const sim = new StopSim(cfg({ layout: DEPOT_A }));
    const office = sim.layout.waypoints.get('office')!;
    place(sim, 'wren', office.x, office.y);
    run(sim, 60 * 20, () => ({ 0: intent() }));
    for (const id of ['brick', 'vesper'] as const) {
      const m = sim.member(id)!;
      expect(sim.grid.flagAt(m.x, m.y, F.STAFF), id).toBe(false);
      expect(Math.hypot(m.x - office.x, m.y - office.y), id).toBeLessThan(12);
    }
  });

  it('catches up at a walk when left behind, even after the player stops', () => {
    const sim = new StopSim(cfg({ layout: GAS_A }));
    const w = sim.member('wren')!;
    const v = sim.member('vesper')!;
    place(sim, 'vesper', w.x - 14 < 1 ? w.x + 14 : w.x - 14, w.y);
    const d0 = Math.hypot(v.x - w.x, v.y - w.y);
    run(sim, 60 * 4, () => ({ 0: intent() }));
    const d1 = Math.hypot(v.x - w.x, v.y - w.y);
    // At least an easy walk (60% of brisk) for most of four seconds.
    expect(d0 - d1).toBeGreaterThan(TUNING.movement.briskSpeed * 0.6 * 4 * 0.6);
  });
});

describe('patrol clock (spec §8.7)', () => {
  it('each patrol comes a little early or late, the same way for the same seed', () => {
    const a = new StopSim(cfg({ noPatrol: false }));
    const b = new StopSim(cfg({ noPatrol: false }));
    expect(a.patrol.drone1).toBe(b.patrol.drone1);
    const P = TUNING.patrol;
    expect(Math.abs(a.patrol.drone1 - P.drone1)).toBeLessThanOrEqual(P.jitter);
    expect(Math.abs(a.patrol.sweep - P.sweep)).toBeLessThanOrEqual(P.jitter);
    expect(Math.abs(a.patrol.drone2 - P.drone2)).toBeLessThanOrEqual(P.jitter);
    const times = new Set(
      [1, 2, 3, 4, 5].map((seed) => new StopSim(cfg({ noPatrol: false, seed })).patrol.drone1),
    );
    expect(times.size).toBeGreaterThan(1);
  });

  it('a second drone can fly its own beat', () => {
    const sim = new StopSim(cfg({ noPatrol: false, patrolTimes: { drone1: 0.5, sweep: 9999, drone2: 1 } }));
    run(sim, 120, () => ({ 0: intent() }));
    expect(sim.drones.length).toBe(2);
    const own = (GAS_A.routes?.drone2 ?? []).map((n) => sim.layout.waypoints.get(n)!);
    const key = (p: { x: number; y: number }): string => `${p.x},${p.y}`;
    expect(new Set(sim.drones[1].route.map(key))).toEqual(new Set(own.map(key)));
    const first = (GAS_A.routes?.drone ?? []).map((n) => key(sim.layout.waypoints.get(n)!));
    expect(new Set(sim.drones[0].route.map(key))).toEqual(new Set(first));
  });
});

describe('footsteps (spec §8.1 hearing, §9.3 tell)', () => {
  it("anyone's running steps carry a few meters; walking steps don't (except Brick's)", () => {
    const sim = new StopSim(cfg({ layout: GAS_A }));
    const heard: { member: number; radius: number }[] = [];
    const orig = sim.noise.bind(sim);
    sim.noise = (x, y, radius, level, member) => {
      heard.push({ member, radius });
      orig(x, y, radius, level, member);
    };
    const w = sim.member('wren')!;
    run(sim, 60, () => ({ 0: intent({}, 0.7, 0) }));
    expect(heard.filter((h) => h.member === w.idx)).toHaveLength(0);
    run(sim, 60, () => ({ 0: intent({ sprint: true }, -1, 0) }));
    const mine = heard.filter((h) => h.member === w.idx);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((h) => h.radius === TUNING.tells.sprintHearing)).toBe(true);
  });
});

describe('Stations (spec §10.5)', () => {
  it('every Station column has a keeper, and each keeper lives in a Station interior', () => {
    for (const col of TUNING.run.stationColumns) {
      const k = keeperForColumn(col);
      expect(k, `column ${col}`).toBeDefined();
      expect(stationLayout(k!).kind).toBe('station');
      expect(stationLayout(k!, true).kind).toBe('compromised');
      expect(k!.lines.length).toBeGreaterThanOrEqual(2);
      expect(k!.lines.length).toBeLessThanOrEqual(4);
    }
  });

  it('the keeper patches everyone up: +25 Hull, +25 Skin, +20 Integrity, capped at 100', () => {
    const party = startingParty();
    const [w, b] = party;
    if (w.kind !== 'android' || b.kind !== 'android') throw new Error('androids expected');
    w.hull = 50;
    w.skin = 90;
    w.integrity = 30;
    b.status = 'lost';
    b.hull = 10;
    const lines = stationCare(party);
    expect(w.hull).toBe(75);
    expect(w.skin).toBe(100);
    expect(w.integrity).toBe(50);
    expect(b.hull).toBe(10);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Wren');
  });

  it('each trade works once and only with what it costs', () => {
    const res = startingResources();
    res.parts = 3;
    res.papers = 0;
    const used = new Set<StationTrade>();
    expect(canTrade(res, 'papersForCells', used)).toBe(false);
    expect(canTrade(res, 'partsForPapers', used)).toBe(true);
    applyTrade(res, 'partsForPapers');
    used.add('partsForPapers');
    expect(res.parts).toBe(1);
    expect(res.papers).toBe(1);
    expect(canTrade(res, 'partsForPapers', used)).toBe(false);
    const cells = res.cells;
    applyTrade(res, 'papersForCells');
    expect(res.papers).toBe(0);
    expect(res.cells).toBe(cells + TUNING.station.tradePapersForCells);
  });

  it('a Station is compromised only at Heat 3, about one time in four', () => {
    const rng = new Rng(7);
    let hits = 0;
    for (let i = 0; i < 4000; i++) if (rollCompromised(3, rng)) hits++;
    expect(hits / 4000).toBeGreaterThan(0.2);
    expect(hits / 4000).toBeLessThan(0.3);
    for (let i = 0; i < 200; i++) expect(rollCompromised(2, rng)).toBe(false);
  });

  it('the keeper can be talked to, and the car does not leave from a Station', () => {
    const sim = new StopSim(cfg({ layout: STOP_LAYOUTS.station[0] }));
    const keeper = sim.npcs.find((n) => n.role === 'keeper')!;
    place(sim, 'wren', keeper.x + 1, keeper.y);
    sim.step({ 0: intent({ interact: true }) });
    expect(sim.events.some((e) => e.t === 'talk' && e.npc === keeper.idx)).toBe(true);
    const exit = sim.exitTiles.find((t) => sim.grid.walkableAt(t.x, t.y))!;
    place(sim, 'wren', exit.x, exit.y);
    run(sim, 200, () => ({ 0: intent({ interact: true, interactHeld: true }) }));
    expect(sim.exit.departing).toBe(false);
    expect(sim.outcome).toBeNull();
  });

  it('compromised: no keeper, the bag in the back room, one Recycler inside and one outside on a beat', () => {
    for (const L of STOP_LAYOUTS.compromised) {
      const sim = new StopSim(cfg({ layout: L }));
      expect(
        sim.npcs.some((n) => n.role === 'keeper'),
        L.id,
      ).toBe(false);
      const bag = sim.containers.find((c) => c.kind === 'supplyBag');
      expect(bag, L.id).toBeDefined();
      expect(sim.grid.flagAt(bag!.access.x, bag!.access.y, F.STAFF), L.id).toBe(true);
      const hostiles = sim.npcs.filter((n) => n.hostile);
      expect(hostiles.length, L.id).toBe(2);
      const start = hostiles.map((n) => ({ x: n.x, y: n.y }));
      run(sim, 60 * 12, () => ({ 0: intent() }));
      hostiles.forEach((n, i) =>
        expect(Math.hypot(n.x - start[i].x, n.y - start[i].y), L.id).toBeGreaterThan(1),
      );
      expect(hostiles.some((n) => sim.grid.flagAt(n.x, n.y, F.INTERIOR))).toBe(true);
    }
  });
});
