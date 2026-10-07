/**
 * Diner layouts (spec §10.3): booths, a counter with stools, a kitchen, a back office, restrooms; a TV with the
 * news, a menu board, a corkboard for Wanted posters; 3–7 customers, a waitress, a cook.
 * Stay 20 s without ordering and the waitress gets curious; coffee at a booth is a strong Blend.
 */
import type { LayoutDef } from '../../sim/layout';
import { GridBuilder } from './builder';

function dinerA(): string[] {
  const g = new GridBuilder(40, 21, ',');
  g.rect(0, 0, 2, 15, '"'); // alley behind the kitchen
  g.room(3, 0, 38, 14, '.');
  // Kitchen and office behind the counter.
  g.rect(4, 1, 14, 4, 'z');
  g.vline(15, 1, 4, '#');
  g.rect(16, 1, 20, 4, 'z');
  g.vline(21, 1, 4, '#');
  g.text(4, 1, 'Hzsssk zzF');
  g.set(18, 2, 'T');
  g.set(20, 1, 'L');
  g.set(3, 3, 'd'); // kitchen back door to the alley
  // Restrooms.
  g.rect(22, 1, 28, 3, '.');
  g.vline(25, 1, 3, '#');
  g.vline(29, 1, 4, '#');
  g.hline(3, 22, 28, '#');
  g.set(23, 3, 'D');
  g.set(27, 3, 'D');
  // The wall between the back and the dining room, with the kitchen pass and doors.
  g.hline(5, 4, 21, '#');
  g.text(8, 5, 'CCCCCC');
  g.set(6, 5, 'd');
  g.set(18, 5, 'd');
  // Staff strip behind the counter, the counter, the register, the stools.
  g.hline(6, 4, 19, 'z');
  g.hline(7, 5, 18, 'C');
  g.set(19, 7, 'R');
  g.hline(8, 5, 18, 'c');
  // Booths along the front windows.
  for (const x of [5, 8, 11, 14, 17, 20]) g.block(x, 11, ['b', 'T', 'b']);
  // Tables in the east half.
  for (const x of [24, 29, 34]) {
    g.text(x, 8, 'cTc');
    g.text(x, 11, 'cTc');
  }
  // TV, menu board, corkboard on the north wall of the dining room.
  g.set(32, 0, 'U');
  g.set(35, 0, 'M');
  g.set(30, 0, 'Q');
  // Front windows and door.
  g.hline(14, 4, 37, 'W');
  g.set(34, 14, 'D');
  g.hline(15, 3, 38, '_');
  // The car waits at the far (west) edge of the lot.
  g.rect(1, 16, 5, 18, 'X');
  return g.rows();
}

/** Diner A: kitchen and office behind a long counter on the north side, booths along the front windows. */
export const DINER_A: LayoutDef = {
  id: 'diner-a',
  kind: 'diner',
  variant: 0,
  name: 'Diner',
  grid: dinerA(),
  points: {
    enter: [1, 19],
    counter: [12, 6],
    room: [21, 10],
    pass: [9, 6],
    register: [19, 6],
    queue: [19, 8],
    grill: [9, 2],
    grillFace: [9, 1],
    back: [2, 3],
    office: [17, 3],
    dr1: [8, 19],
    dr2: [37, 19],
  },
  // The drone patrols back and forth along the far side of the lot, sweeping the lot and the windows (§8.7).
  routes: { drone: ['dr1', 'dr2'] },
  npcs: [
    { role: 'customer', count: [3, 7] },
    { role: 'waitress', at: 'counter' },
    { role: 'cook', at: 'grill' },
  ],
  containers: [
    { kind: 'office', x: 18, y: 2 },
    { kind: 'wallet', x: 5, y: 12 },
    { kind: 'wallet', x: 11, y: 12 },
    { kind: 'wallet', x: 17, y: 12 },
    { kind: 'wallet', x: 30, y: 11 },
  ],
  cameras: [{ x: 37, y: 1, facing: 135, sweep: 50 }],
  vanEntry: [39, 20],
  car: { x: 3, y: 17, facing: 'east' },
};

function dinerB(): string[] {
  const g = new GridBuilder(44, 21, ',');
  g.rect(42, 0, 43, 15, '"'); // alley behind the kitchen
  g.room(6, 0, 41, 14, '.');
  // Kitchen on the east side, joined to the staff strip behind a north–south counter.
  g.rect(35, 1, 40, 8, 'z');
  g.text(36, 1, 'Hkssz');
  g.set(40, 3, 'F');
  g.vline(34, 1, 11, 'z');
  g.vline(33, 2, 9, 'C');
  g.set(33, 10, 'R');
  g.vline(32, 2, 9, 'c');
  g.set(41, 5, 'd'); // kitchen back door
  // Office below the kitchen.
  g.hline(9, 35, 40, '#');
  g.vline(35, 9, 13, '#');
  g.rect(36, 10, 40, 13, 'z');
  g.set(38, 11, 'T');
  g.set(40, 13, 'L');
  g.set(35, 11, 'd');
  // Restrooms in the north-west corner.
  g.vline(11, 1, 3, '#');
  g.hline(4, 7, 11, '#');
  g.vline(9, 1, 3, '#');
  g.set(8, 4, 'D');
  g.set(10, 4, 'D');
  // Booths on the north wall and along the front windows; tables in the middle.
  for (const x of [13, 16, 19, 22, 25]) g.block(x, 1, ['b', 'T', 'b']);
  for (const x of [8, 11, 14, 17, 20]) g.block(x, 11, ['b', 'T', 'b']);
  for (const x of [9, 15, 21, 27]) g.text(x, 7, 'cTc');
  // TV, menu board, corkboard on the north wall.
  g.set(29, 0, 'U');
  g.set(34, 0, 'M');
  g.set(12, 0, 'Q');
  // Front windows and door; the lot is west and south.
  g.hline(14, 7, 34, 'W');
  g.set(9, 14, 'D');
  g.hline(15, 6, 41, '_');
  // The car waits at the far (east) edge of the lot.
  g.rect(38, 16, 42, 18, 'X');
  return g.rows();
}

/** Diner B: the counter runs north–south by the kitchen on the east, booths on both long walls. */
export const DINER_B: LayoutDef = {
  id: 'diner-b',
  kind: 'diner',
  variant: 1,
  name: 'Diner',
  grid: dinerB(),
  points: {
    enter: [1, 20],
    counter: [34, 5],
    room: [20, 9],
    pass: [36, 5],
    register: [34, 10],
    queue: [32, 11],
    grill: [38, 2],
    grillFace: [38, 1],
    back: [42, 5],
    office: [37, 12],
    dr1: [35, 19],
    dr2: [6, 19],
  },
  routes: { drone: ['dr1', 'dr2'] },
  npcs: [
    { role: 'customer', count: [3, 7] },
    { role: 'waitress', at: 'counter' },
    { role: 'cook', at: 'grill' },
  ],
  containers: [
    { kind: 'office', x: 38, y: 11 },
    { kind: 'wallet', x: 8, y: 12 },
    { kind: 'wallet', x: 14, y: 12 },
    { kind: 'wallet', x: 16, y: 2 },
    { kind: 'wallet', x: 22, y: 2 },
  ],
  cameras: [{ x: 7, y: 1, facing: 45, sweep: 60 }],
  vanEntry: [0, 20],
  car: { x: 40, y: 17, facing: 'west' },
};
