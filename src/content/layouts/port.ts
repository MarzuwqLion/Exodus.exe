/**
 * The Port of Miami before dawn (spec §11.5), north at the top:
 *
 * - the harbor and the Sankofa's berth along the north edge, with the gangway ('=') rising from the apron to
 *   her deck ('v', where a member is aboard);
 * - the apron: open, floodlit concrete under a rail-mounted gantry crane that carries a container low across it;
 * - the terminal fence ('&', chain link: see-through, not climbable) with the gate: a scanner arch ('!') and the
 *   operator's booth;
 * - the container yard: stacks ('Y') in strips with narrow aisles between them, a main aisle to the gate, and
 *   three truck lanes the yard trucks shuttle along;
 * - the waterline path ('_') along the west quay edge, outside the yard fence: longer, more drones, no scan;
 * - the perimeter fence with two holes cut in it, and the landside lot where the car is left.
 */
import type { LayoutDef } from '../../sim/layout';
import { GridBuilder } from './builder';

export const PORT_W = 64;
export const PORT_H = 60;

/** Geometry the Port's simulation and renderer share. */
export const PORT_GEO = {
  /** Row of the terminal fence (the gate is in it). */
  fenceY: 25,
  /** The scanner arch tile. */
  arch: { x: 31, y: 25 },
  /** The operator's booth beside the arch. */
  booth: { x: 33, y: 25 },
  /** Where a member stands to go through the arch, and where they come out. */
  archSouth: { x: 31.5, y: 26.6 },
  archNorth: { x: 31.5, y: 23.8 },
  /** Gangway tiles (2 wide) from the deck (row 4) down to its foot on the apron. */
  gangwayX: 44,
  gangwayTop: 5,
  gangwayFoot: 12,
  deckY: 4,
  /** The gantry crane's legs ride rails on these rows; it travels between these x positions. */
  craneRails: [6, 24] as [number, number],
  craneX: [10, 39] as [number, number],
  /** Truck lanes (top rows of 2-row lanes) and the x range the trucks shuttle over. */
  truckLanes: [30, 38, 46],
  truckX: [7, 62] as [number, number],
  /** West of this x (south of the fence) is the waterline path. */
  waterlineX: 5,
  /** South of this row is the landside lot (public). */
  lotY: 52.5,
  /** Within this distance of the arch's front, a member is queueing at the gate (nobody minds). */
  gateZone: 3.5,
  /** Ring of the yard's Recycler beats, in spawn order (2 + 1 per Heat level). */
  recyclerRoutes: ['yardWest', 'yardEast', 'mainAisle', 'apron', 'lanes'],
} as const;

/** Container strips: [row, [x0, x1] runs of stacks]. */
const STRIPS: [number, [number, number][]][] = [
  [
    28,
    [
      [8, 13],
      [15, 20],
      [22, 27],
      [35, 40],
      [42, 47],
      [49, 54],
      [56, 61],
    ],
  ],
  [
    32,
    [
      [8, 13],
      [15, 27],
      [35, 40],
      [42, 54],
      [56, 61],
    ],
  ],
  [
    35,
    [
      [8, 20],
      [22, 27],
      [35, 47],
      [49, 54],
      [56, 61],
    ],
  ],
  [
    40,
    [
      [8, 13],
      [15, 20],
      [22, 27],
      [35, 40],
      [42, 47],
      [49, 61],
    ],
  ],
  [
    43,
    [
      [8, 13],
      [15, 27],
      [35, 47],
      [49, 54],
      [56, 61],
    ],
  ],
  [
    48,
    [
      [8, 20],
      [22, 27],
      [35, 40],
      [42, 47],
      [49, 54],
      [56, 61],
    ],
  ],
];

function port(): string[] {
  const G = PORT_GEO;
  const g = new GridBuilder(PORT_W, PORT_H, ',');
  // The harbor along the north edge, and along the west edge beside the yard and the lot.
  g.rect(0, 0, PORT_W - 1, 5, '~');
  g.rect(0, G.fenceY, 2, PORT_H - 1, '~');
  // The Sankofa's deck where the gangway lands, and the gangway itself.
  g.hline(G.deckY, G.gangwayX, G.gangwayX + 1, 'v');
  g.rect(G.gangwayX, G.gangwayTop, G.gangwayX + 1, G.gangwayFoot, '=');
  // It rises over the quay: nobody climbs onto it from the side, only at its foot.
  g.vline(G.gangwayX - 1, G.gangwayTop + 1, G.gangwayFoot, '&');
  g.vline(G.gangwayX + 2, G.gangwayTop + 1, G.gangwayFoot, '&');
  // Static cover on the apron: a few boxes waiting to be loaded.
  g.rect(12, 21, 17, 22, 'Y');
  g.rect(52, 15, 57, 16, 'Y');
  g.rect(24, 10, 29, 11, 'Y');
  g.text(48, 19, 'yy');
  g.text(20, 8, 'y');
  // The terminal fence, the gate's arch, and the operator's booth.
  g.hline(G.fenceY, G.waterlineX, PORT_W - 1, '&');
  g.set(G.arch.x, G.arch.y, '!');
  g.set(G.booth.x, G.booth.y, 'G');
  // The waterline path along the west quay edge, outside the yard fence.
  g.rect(3, G.fenceY, 4, PORT_H - 1, '_');
  g.vline(G.waterlineX, G.fenceY, 52, '&');
  // The yard: strips of stacks two containers deep.
  for (const [row, runs] of STRIPS) for (const [x0, x1] of runs) g.rect(x0, row, x1, row + 1, 'Y');
  // The perimeter fence, with two holes cut in it.
  g.hline(52, G.waterlineX, PORT_W - 1, '&');
  g.hline(52, 10, 11, ',');
  g.hline(52, 57, 58, ',');
  // The landside lot: the car is left here (the Port's only way out is the gangway).
  g.text(30, 56, 'yy');
  g.text(44, 55, 'yy');
  return g.rows();
}

export const PORT: LayoutDef = {
  id: 'port',
  kind: 'port',
  variant: 0,
  name: 'The Port of Miami',
  grid: port(),
  points: {
    enter: [16, 58],
    office: [34, 27],
    operator: [33, 26],
    crewA: [42, 13],
    crewB: [47, 13],
    mensah: [47, 11],
    gangwayFoot: [44, 13],
    terminal: [62, 22],
    // Recycler beats.
    yw1: [7, 27],
    yw2: [28, 27],
    yw3: [28, 37],
    yw4: [14, 42],
    yw5: [7, 46],
    ye1: [34, 50],
    ye2: [62, 50],
    ye3: [62, 34],
    ye4: [48, 37],
    ye5: [34, 34],
    ma1: [31, 28],
    ma2: [31, 50],
    ap1: [6, 21],
    ap2: [30, 22],
    ap3: [60, 21],
    ap4: [40, 17],
    ln1: [7, 39],
    ln2: [62, 39],
    ln3: [62, 47],
    ln4: [7, 47],
    // Dock workers' errands.
    d1: [21, 27],
    d2: [41, 26],
    d3: [14, 34],
    d4: [48, 42],
    d5: [24, 45],
    d6: [58, 31],
    d7: [18, 13],
    d8: [50, 21],
    d9: [34, 12],
    // Drone beats: the yard, the waterline, the apron.
    dy1: [10, 30],
    dy2: [58, 30],
    dy3: [58, 46],
    dy4: [10, 46],
    dw1: [4, 52],
    dw2: [4, 28],
    da1: [8, 16],
    da2: [58, 16],
  },
  routes: {
    yardWest: ['yw1', 'yw2', 'yw3', 'yw4', 'yw5'],
    yardEast: ['ye1', 'ye2', 'ye3', 'ye4', 'ye5'],
    mainAisle: ['ma1', 'ma2'],
    apron: ['ap1', 'ap2', 'ap3', 'ap4'],
    lanes: ['ln1', 'ln2', 'ln3', 'ln4'],
    dock: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'],
    dockApron: ['d7', 'd8', 'd9', 'ap4'],
    drone: ['dy1', 'dy2', 'dy3', 'dy4'],
    drone2: ['dw1', 'dw2'],
    drone3: ['da1', 'da2'],
  },
  npcs: [
    { role: 'dockworker', count: [2, 3], at: 'd1', route: 'dock' },
    { role: 'dockworker', at: 'd8', route: 'dockApron' },
    { role: 'crew', at: 'crewA' },
    { role: 'crew', at: 'crewB' },
    { role: 'mensah', at: 'mensah' },
  ],
  noAutoContainers: ['Y'],
  vanEntry: [62, 58],
  car: { x: 16, y: 56, facing: 'east' },
  regions: ['lowcountry'],
};
