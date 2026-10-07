/**
 * Gas Station layouts (spec §10.4): pumps and an EV charger under a canopy, a convenience store with the
 * clerk behind glass, a rotating security camera, an auto-parts aisle, and a garage bay. The car charges at
 * the EV charger while someone pretends to pump gas.
 */
import type { LayoutDef } from '../../sim/layout';
import { GridBuilder } from './builder';

function gasA(): string[] {
  const g = new GridBuilder(42, 22, ',');
  // Store with a back office and the clerk's glass booth.
  g.room(4, 0, 23, 9, '.');
  g.rect(5, 1, 9, 3, 'z');
  g.vline(10, 1, 4, '#');
  g.hline(4, 5, 10, '#');
  g.set(7, 4, 'd');
  g.text(5, 1, 'LLz');
  g.set(9, 2, 'T');
  g.rect(18, 1, 22, 3, 'z');
  g.vline(17, 1, 4, 'W');
  g.hline(4, 17, 22, 'W');
  g.set(19, 4, 'R');
  g.set(17, 2, 'd');
  // Aisles: store shelves and the auto-parts aisle.
  g.text(12, 2, 'JJJ');
  g.text(6, 6, 'SSS');
  g.text(11, 6, 'SSS');
  g.text(12, 1, 'V');
  g.hline(9, 5, 22, 'W');
  g.set(14, 9, 'D');
  // Garage bay, open to the lot on the south side.
  g.room(25, 0, 35, 9, 'z');
  g.text(27, 1, 'NN JJ');
  g.set(34, 1, 'L');
  g.hline(9, 27, 33, 'z');
  g.set(24, 5, ',');
  // Canopy over the pumps.
  g.rect(5, 12, 31, 16, 'A');
  for (const x of [5, 31]) {
    g.set(x, 12, 'P');
    g.set(x, 16, 'P');
  }
  for (const x of [10, 16, 22, 28]) {
    g.set(x, 13, 'g');
    g.set(x, 15, 'g');
  }
  // The exit zone with an EV charger for the car.
  g.rect(36, 12, 40, 14, 'X');
  g.set(35, 13, 'E');
  g.hline(10, 4, 23, '_');
  return g.rows();
}

/** Gas Station A: store and garage to the north, the canopy in the middle, the car at the east edge. */
export const GAS_A: LayoutDef = {
  id: 'gas-a',
  kind: 'gas',
  variant: 0,
  name: 'Gas station',
  grid: gasA(),
  points: {
    enter: [1, 19],
    register: [19, 2],
    queue: [19, 5],
    smoke: [2, 8],
    smokeFace: [0, 10],
    office: [6, 2],
    bench: [28, 2],
    benchFace: [28, 1],
    dr1: [6, 11],
    dr2: [33, 11],
    dr3: [34, 17],
    dr4: [6, 18],
    ds1: [6, 13],
    ds2: [34, 13],
  },
  // The first drone circles the forecourt; the second sweeps back and forth along the pumps (spec §8.7).
  routes: { drone: ['dr1', 'dr2', 'dr3', 'dr4'], drone2: ['ds1', 'ds2'] },
  npcs: [
    { role: 'customer', count: [2, 5] },
    { role: 'clerk', at: 'register' },
    { role: 'mechanic', at: 'bench', chance: 0.7 },
  ],
  containers: [{ kind: 'office', x: 9, y: 2 }],
  cameras: [
    { x: 31, y: 12, facing: 0, sweep: 140 },
    { x: 5, y: 1, facing: 45, sweep: 50 },
  ],
  vanEntry: [41, 20],
  car: { x: 38, y: 13, facing: 'west' },
};

function gasB(): string[] {
  const g = new GridBuilder(42, 22, ',');
  // Garage to the west.
  g.room(2, 0, 12, 9, 'z');
  g.text(4, 1, 'JJ NN');
  g.set(3, 1, 'L');
  g.hline(9, 4, 10, 'z');
  // Store to the east with the glass booth on its west side and the office behind.
  g.room(16, 0, 37, 9, '.');
  g.rect(17, 1, 21, 3, 'z');
  g.vline(22, 1, 4, 'W');
  g.hline(4, 17, 22, 'W');
  g.set(20, 4, 'R');
  g.set(22, 2, 'd');
  g.rect(32, 1, 36, 3, 'z');
  g.vline(31, 1, 4, '#');
  g.hline(4, 31, 36, '#');
  g.set(34, 4, 'd');
  g.text(33, 1, 'LLz');
  g.set(35, 2, 'T');
  g.text(25, 2, 'JJJ');
  g.text(24, 6, 'SSS');
  g.text(29, 6, 'SSS');
  g.set(36, 6, 'V');
  g.hline(9, 17, 36, 'W');
  g.set(26, 9, 'D');
  // Canopy and pumps.
  g.rect(9, 12, 35, 16, 'A');
  for (const x of [9, 35]) {
    g.set(x, 12, 'P');
    g.set(x, 16, 'P');
  }
  for (const x of [14, 20, 26, 32]) {
    g.set(x, 13, 'g');
    g.set(x, 15, 'g');
  }
  // Exit zone at the west edge with the EV charger.
  g.rect(0, 12, 4, 14, 'X');
  g.set(5, 13, 'E');
  g.hline(10, 16, 37, '_');
  return g.rows();
}

/** Gas Station B: garage west, store east (clerk booth on its west side), the car at the west edge. */
export const GAS_B: LayoutDef = {
  id: 'gas-b',
  kind: 'gas',
  variant: 1,
  name: 'Gas station',
  grid: gasB(),
  points: {
    enter: [40, 19],
    register: [20, 2],
    queue: [20, 5],
    smoke: [39, 8],
    smokeFace: [41, 10],
    office: [34, 2],
    bench: [7, 2],
    benchFace: [7, 1],
    dr1: [35, 11],
    dr2: [8, 11],
    dr3: [7, 17],
    dr4: [35, 18],
    ds1: [35, 13],
    ds2: [7, 13],
  },
  routes: { drone: ['dr1', 'dr2', 'dr3', 'dr4'], drone2: ['ds1', 'ds2'] },
  npcs: [
    { role: 'customer', count: [2, 5] },
    { role: 'clerk', at: 'register' },
    { role: 'mechanic', at: 'bench', chance: 0.7 },
  ],
  containers: [{ kind: 'office', x: 35, y: 2 }],
  cameras: [
    { x: 9, y: 12, facing: 180, sweep: 140 },
    { x: 36, y: 1, facing: 135, sweep: 50 },
  ],
  vanEntry: [41, 20],
  car: { x: 2, y: 13, facing: 'east' },
};
