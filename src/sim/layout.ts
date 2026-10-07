/**
 * Stop layouts (spec §10.8): typed objects with an ASCII grid (one character per 1 m tile), named points,
 * routes, NPC spawn rules, containers, and security cameras. This module parses them into a Grid, finds
 * waypoints and containers, and validates reachability.
 */
import type { Region } from '../core/types';
import { F, Grid, type Point } from './grid';

export type LayoutKind =
  'depot' | 'diner' | 'gas' | 'station' | 'compromised' | 'checkpoint' | 'port' | 'test';

/**
 * Legend. The spec's characters (§10.8) plus extensions used by the diner, gas station, Stations, checkpoint,
 * and Port layouts. `walk`/`opaque` are collision and sight; `floor` says what the tile looks like underneath.
 */
export interface TileInfo {
  name: string;
  flags: number;
  /** Floor style rendered under the tile. */
  floor: 'interior' | 'staff' | 'asphalt' | 'sidewalk' | 'dirt' | 'water' | 'none';
}

const I = F.WALK | F.INTERIOR;
export const LEGEND: Record<string, TileInfo> = {
  '#': { name: 'wall', flags: F.OPAQUE, floor: 'none' },
  '.': { name: 'floor', flags: I, floor: 'interior' },
  ',': { name: 'asphalt', flags: F.WALK | F.OUTDOOR, floor: 'asphalt' },
  _: { name: 'sidewalk', flags: F.WALK | F.OUTDOOR, floor: 'sidewalk' },
  '"': { name: 'dirt', flags: F.WALK | F.OUTDOOR, floor: 'dirt' },
  z: { name: 'staff floor', flags: I | F.STAFF, floor: 'staff' },
  D: { name: 'door', flags: I | F.DOOR, floor: 'interior' },
  d: { name: 'staff door', flags: I | F.DOOR | F.STAFF, floor: 'staff' },
  W: { name: 'window wall', flags: 0, floor: 'none' },
  S: { name: 'shelf', flags: F.OPAQUE, floor: 'interior' },
  R: { name: 'register counter', flags: 0, floor: 'interior' },
  C: { name: 'counter', flags: 0, floor: 'interior' },
  B: { name: 'charging bay', flags: 0, floor: 'asphalt' },
  E: { name: 'ev charger', flags: 0, floor: 'asphalt' },
  K: { name: 'id kiosk', flags: 0, floor: 'asphalt' },
  L: { name: 'locker', flags: F.OPAQUE, floor: 'staff' },
  T: { name: 'table', flags: 0, floor: 'interior' },
  b: { name: 'booth', flags: F.SEAT, floor: 'interior' },
  c: { name: 'chair', flags: F.SEAT, floor: 'interior' },
  O: { name: 'bench', flags: F.SEAT, floor: 'interior' },
  V: { name: 'vending machine', flags: F.OPAQUE, floor: 'interior' },
  P: { name: 'post', flags: 0, floor: 'asphalt' },
  G: { name: 'guard booth', flags: 0, floor: 'asphalt' },
  X: { name: 'exit zone', flags: F.WALK | F.OUTDOOR | F.EXIT, floor: 'asphalt' },
  M: { name: 'menu board', flags: F.OPAQUE, floor: 'none' },
  U: { name: 'tv', flags: F.OPAQUE, floor: 'none' },
  Q: { name: 'corkboard', flags: F.OPAQUE, floor: 'none' },
  k: { name: 'kitchen equipment', flags: 0, floor: 'staff' },
  F: { name: 'fridge', flags: F.OPAQUE, floor: 'staff' },
  J: { name: 'parts bin', flags: 0, floor: 'interior' },
  N: { name: 'workbench', flags: 0, floor: 'staff' },
  H: { name: 'kitchen shelf', flags: F.OPAQUE, floor: 'staff' },
  g: { name: 'gas pump', flags: 0, floor: 'asphalt' },
  A: { name: 'covered asphalt', flags: F.WALK | F.OUTDOOR | F.COVER, floor: 'asphalt' },
  '~': { name: 'water', flags: F.WATER, floor: 'water' },
  Y: { name: 'container stack', flags: F.OPAQUE, floor: 'asphalt' },
  y: { name: 'crate', flags: 0, floor: 'asphalt' },
  '^': { name: 'tree', flags: F.OPAQUE, floor: 'dirt' },
  '%': { name: 'hedge', flags: F.OPAQUE, floor: 'dirt' },
  '!': { name: 'scanner arch', flags: F.WALK | F.OUTDOOR, floor: 'asphalt' },
  '&': { name: 'barrier', flags: 0, floor: 'asphalt' },
  $: { name: 'control booth', flags: 0, floor: 'asphalt' },
  w: { name: 'beacon window', flags: 0, floor: 'none' },
  s: { name: 'stove', flags: 0, floor: 'interior' },
  ' ': { name: 'void', flags: 0, floor: 'none' },
};

export type NpcRole =
  | 'customer'
  | 'clerk'
  | 'guard'
  | 'mechanic'
  | 'waitress'
  | 'cook'
  | 'keeper'
  | 'dockworker'
  | 'recycler'
  | 'gunner'
  | 'crew'
  | 'mensah';

export interface NpcSpawnDef {
  role: NpcRole;
  /** How many (min, max inclusive). Default [1, 1]. */
  count?: [number, number];
  /** Spawn chance for optional NPCs (the depot's mechanic is "sometimes"). */
  chance?: number;
  /** Named point to start at. */
  at?: string;
  /** Named route (patrol loops). */
  route?: string;
}

export type ContainerKind =
  | 'shelf'
  | 'locker'
  | 'register'
  | 'bench'
  | 'wallet'
  | 'kitchen'
  | 'office'
  | 'partsAisle'
  | 'garage'
  | 'store'
  | 'supplyBag';

export interface ContainerDef {
  kind: ContainerKind;
  /** Tile of the container. */
  x: number;
  y: number;
  /** Locked containers need Brick to pry or bash them. */
  locked?: boolean;
}

export interface CameraDef {
  x: number;
  y: number;
  /** Center facing in degrees (0 = east, 90 = south). */
  facing: number;
  /** Sweep amplitude in degrees (0 = fixed). */
  sweep?: number;
}

export interface PropPlacement {
  prop: string;
  x: number;
  y: number;
  /** Rotation in quarter turns (0 = facing south). */
  rot?: number;
  variant?: number;
}

export interface LayoutDef {
  id: string;
  kind: LayoutKind;
  variant: number;
  name: string;
  grid: string[];
  /** Named points in tile coordinates (tile centers). */
  points: Record<string, [number, number]>;
  routes?: Record<string, string[]>;
  npcs: NpcSpawnDef[];
  containers?: ContainerDef[];
  /** Glyphs that should not become containers automatically. */
  noAutoContainers?: string[];
  cameras?: CameraDef[];
  props?: PropPlacement[];
  /** Where the Recycler van arrives (a road-edge tile). */
  vanEntry: [number, number];
  /** The party car's parking tile (inside the exit zone) and which way it faces. */
  car: { x: number; y: number; facing: 'east' | 'west' | 'north' | 'south' };
  /** Regions this layout is meant for (all if omitted). */
  regions?: Region[];
}

export interface ParsedContainer extends ContainerDef {
  id: number;
  /** Covered tiles (a run of the same glyph). */
  tiles: Point[];
  /** World position of the container center. */
  cx: number;
  cy: number;
  /** Tile from which a character searches it (walkable, adjacent). */
  access: Point;
  /** Searching it is suspicious (non-public). */
  private: boolean;
}

export interface ParsedLayout {
  def: LayoutDef;
  grid: Grid;
  waypoints: Map<string, Point>;
  containers: ParsedContainer[];
  exitTiles: Point[];
  /** Interior regions of the grid (tiles flagged INTERIOR), for cutaway rendering. */
  interior: Uint8Array;
}

const DIGITS = '123456789';

function floorFor(rows: readonly string[], x: number, y: number): number {
  // A waypoint digit takes the floor of its neighbors (majority of interior/staff/outdoor).
  const counts: Record<string, number> = {};
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const ch = rows[y + dy]?.[x + dx];
    if (!ch || DIGITS.includes(ch)) continue;
    const info = LEGEND[ch];
    if (info && info.flags & F.WALK) counts[ch] = (counts[ch] ?? 0) + 1;
  }
  let best = '.';
  let bestN = 0;
  for (const [ch, n] of Object.entries(counts)) {
    if (n > bestN) {
      best = ch;
      bestN = n;
    }
  }
  return LEGEND[best].flags & ~F.EXIT;
}

/** Container kind implied by a glyph (and whether its tile is a staff area). */
function autoKind(ch: string, staff: boolean, layoutKind: LayoutKind): ContainerKind | null {
  switch (ch) {
    case 'S':
      if (layoutKind === 'gas') return 'partsAisle';
      return staff ? 'kitchen' : layoutKind === 'depot' ? 'shelf' : 'store';
    case 'L':
      return 'locker';
    case 'R':
      return 'register';
    case 'N':
      return layoutKind === 'gas' ? 'garage' : 'bench';
    case 'H':
      return 'kitchen';
    case 'J':
      return 'partsAisle';
    default:
      return null;
  }
}

export const PRIVATE_KINDS: ReadonlySet<ContainerKind> = new Set([
  'locker',
  'register',
  'bench',
  'kitchen',
  'office',
  'garage',
  'supplyBag',
]);

export function parseLayout(def: LayoutDef): ParsedLayout {
  const rows = def.grid;
  const grid = new Grid(rows, (ch, x, y) => {
    if (DIGITS.includes(ch)) return floorFor(rows, x, y);
    const info = LEGEND[ch];
    if (!info) throw new Error(`Layout ${def.id}: unknown tile '${ch}' at ${x},${y}`);
    return info.flags;
  });
  const waypoints = new Map<string, Point>();
  const exitTiles: Point[] = [];
  const interior = new Uint8Array(grid.w * grid.h);
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const ch = grid.charAt(x, y);
      if (DIGITS.includes(ch)) waypoints.set(ch, { x: x + 0.5, y: y + 0.5 });
      if (grid.has(x, y, F.EXIT)) exitTiles.push({ x: x + 0.5, y: y + 0.5 });
      if (grid.has(x, y, F.INTERIOR)) interior[grid.idx(x, y)] = 1;
    }
  }
  for (const [name, [x, y]] of Object.entries(def.points)) waypoints.set(name, { x: x + 0.5, y: y + 0.5 });

  // Containers: runs of the same container glyph (max 3 tiles) become one container each.
  const containers: ParsedContainer[] = [];
  const used = new Uint8Array(grid.w * grid.h);
  const skip = new Set(def.noAutoContainers ?? []);
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const ch = grid.charAt(x, y);
      if (used[grid.idx(x, y)] || skip.has(ch)) continue;
      const staff = isStaffNeighborhood(grid, x, y);
      const kind = autoKind(ch, staff, def.kind);
      if (!kind) continue;
      const tiles: Point[] = [];
      // Horizontal run first; if single, try vertical.
      let len = 0;
      while (len < 3 && grid.charAt(x + len, y) === ch && !used[grid.idx(x + len, y)]) len++;
      if (len > 1) {
        for (let i = 0; i < len; i++) {
          tiles.push({ x: x + i, y });
          used[grid.idx(x + i, y)] = 1;
        }
      } else {
        let vl = 0;
        while (vl < 3 && grid.charAt(x, y + vl) === ch && !used[grid.idx(x, y + vl)]) vl++;
        for (let i = 0; i < vl; i++) {
          tiles.push({ x, y: y + i });
          used[grid.idx(x, y + i)] = 1;
        }
      }
      addContainer(containers, grid, { kind, x, y }, tiles);
    }
  }
  for (const c of def.containers ?? []) addContainer(containers, grid, c, [{ x: c.x, y: c.y }]);
  return { def, grid, waypoints, containers, exitTiles, interior };
}

function isStaffNeighborhood(grid: Grid, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) if (grid.has(x + dx, y + dy, F.STAFF)) return true;
  }
  return false;
}

function addContainer(list: ParsedContainer[], grid: Grid, def: ContainerDef, tiles: Point[]): void {
  // Access tile: a walkable neighbor of any covered tile, preferring south (the camera side), then others.
  let access: Point | null = null;
  const dirs = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];
  outer: for (const [dx, dy] of dirs) {
    for (const t of tiles) {
      const nx = t.x + dx;
      const ny = t.y + dy;
      if (grid.walkable(nx, ny)) {
        access = { x: nx + 0.5, y: ny + 0.5 };
        break outer;
      }
    }
  }
  const cx = tiles.reduce((s, t) => s + t.x + 0.5, 0) / tiles.length;
  const cy = tiles.reduce((s, t) => s + t.y + 0.5, 0) / tiles.length;
  const isPrivate =
    PRIVATE_KINDS.has(def.kind) ||
    tiles.some((t) => isStaffNeighborhood(grid, t.x, t.y) && grid.has(t.x, t.y + 1, F.STAFF));
  list.push({
    ...def,
    id: list.length,
    tiles,
    cx,
    cy,
    access: access ?? { x: cx, y: cy + 1 },
    private: isPrivate,
  });
}

export interface LayoutProblem {
  layout: string;
  problem: string;
}

/**
 * Validation (spec §10.8): every exit reachable, every container reachable, no NPC waypoint inside a wall,
 * every route point defined, the car and van tiles sensible.
 */
export function validateLayout(def: LayoutDef): LayoutProblem[] {
  const out: LayoutProblem[] = [];
  const bad = (problem: string): void => {
    out.push({ layout: def.id, problem });
  };
  let parsed: ParsedLayout;
  try {
    parsed = parseLayout(def);
  } catch (e) {
    bad(String(e));
    return out;
  }
  const { grid, waypoints, containers, exitTiles } = parsed;
  if (exitTiles.length === 0) bad('no exit zone');
  const carT = { x: def.car.x + 0.5, y: def.car.y + 0.5 };
  if (!grid.has(def.car.x, def.car.y, F.EXIT)) bad('car is not parked in the exit zone');
  const field = grid.distanceField(exitTiles);
  const reach = (p: Point): boolean => field[grid.idx(Math.floor(p.x), Math.floor(p.y))] >= 0;
  for (const [name, p] of waypoints) {
    // Facing targets (names ending in 'Face') may point at furniture.
    if (name.endsWith('Face')) continue;
    if (!grid.walkableAt(p.x, p.y)) bad(`point ${name} is not walkable`);
    else if (!reach(p)) bad(`point ${name} is unreachable from the exit`);
  }
  for (const c of containers) {
    if (!grid.walkableAt(c.access.x, c.access.y)) bad(`container ${c.kind}#${c.id} has no access tile`);
    else if (!reach(c.access)) bad(`container ${c.kind}#${c.id} at ${c.x},${c.y} is unreachable`);
  }
  for (const [rname, pts] of Object.entries(def.routes ?? {})) {
    for (const p of pts) if (!waypoints.has(p)) bad(`route ${rname} uses unknown point ${p}`);
  }
  for (const n of def.npcs) {
    if (n.at && !waypoints.has(n.at)) bad(`npc ${n.role} starts at unknown point ${n.at}`);
    if (n.route && !def.routes?.[n.route]) bad(`npc ${n.role} uses unknown route ${n.route}`);
  }
  for (const cam of def.cameras ?? []) {
    if (!grid.inBounds(cam.x, cam.y)) bad(`camera at ${cam.x},${cam.y} is outside the grid`);
  }
  const [vx, vy] = def.vanEntry;
  if (!grid.walkable(vx, vy)) bad('van entry is not walkable');
  else if (!reach({ x: vx + 0.5, y: vy + 0.5 })) bad('van entry is unreachable');
  void carT;
  return out;
}
