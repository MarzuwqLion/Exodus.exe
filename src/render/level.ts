/**
 * Builds the 3D world for a stop from its parsed layout (spec §5.3, §10): floors per tile, walls with
 * cutaway south walls, windows, doors, furniture and fixtures per glyph, light emitters, and region dressing
 * around the grid so the edges never look empty. Everything static merges into one toon mesh plus one
 * emissive mesh.
 */
import * as THREE from 'three';
import type { Region, Weather } from '../core/types';
import { Rng, hashSeed } from '../core/rng';
import { Kit, type LightSpec } from '../models/kit';
import { buildProp, container, CONTAINER_SIZE, type PropId } from '../models/props';
import { F } from '../sim/grid';
import type { ParsedLayout } from '../sim/layout';
import { materials } from './materials';
import { C } from './palettes';

export interface LevelBuild {
  group: THREE.Group;
  lights: LightSpec[];
  /** Lamp heads for insects (humid Florida nights). */
  lampHeads: { x: number; y: number; z: number }[];
  triangles: number;
  /**
   * Pieces that drop low while someone stands just behind them, so nobody is hidden from the camera (the
   * Port's container stacks; the cutaway rule walls follow statically).
   */
  cutaways: Cutaway[];
}

export interface Cutaway {
  group: THREE.Group;
  x0: number;
  x1: number;
  /** The north face: whoever stands up to a few meters north of it is behind it. */
  zNorth: number;
}

const WALL_H = 3.1;
const CUT_H = 0.55;

interface Ctx {
  k: Kit;
  L: ParsedLayout;
  region: Region;
  weather: Weather;
  rng: Rng;
  lampHeads: { x: number; y: number; z: number }[];
}

function ch(L: ParsedLayout, x: number, y: number): string {
  return L.grid.charAt(x, y);
}

function isWallish(c: string): boolean {
  return c === '#' || c === 'W' || c === 'M' || c === 'U' || c === 'Q' || c === 'w';
}

function interiorAt(L: ParsedLayout, x: number, y: number): boolean {
  return L.grid.has(x, y, F.INTERIOR);
}

/** A wall whose north side is a room faces the camera: it renders cut away. */
export function isSouthWall(L: ParsedLayout, x: number, y: number): boolean {
  return (
    interiorAt(L, x, y - 1) ||
    (isWallish(ch(L, x, y - 1)) && interiorAt(L, x, y - 2) && !interiorAt(L, x, y + 1))
  );
}

function regionGround(region: Region): { dirt: number; dirt2: number } {
  switch (region) {
    case 'piedmont':
      return { dirt: C.rust1, dirt2: C.rust0 };
    case 'lowcountry':
      return { dirt: C.moss1, dirt2: C.moss0 };
    case 'corridor':
      return { dirt: C.concrete0, dirt2: C.slate0 };
    default:
      return { dirt: C.moss0, dirt2: C.night3 };
  }
}

function floorColor(ctx: Ctx, c: string, x: number, y: number): number {
  const L = ctx.L;
  const g = regionGround(ctx.region);
  const v = (x * 7 + y * 13) % 5;
  if (L.grid.has(x, y, F.STAFF)) return v === 0 ? C.slate0 : C.slate1;
  if (L.grid.has(x, y, F.INTERIOR)) return isHouse(L.def.kind) ? C.rust0 : v === 0 ? C.slate1 : C.concrete0;
  if (c === '_') return v === 0 ? C.concrete0 : C.concrete1;
  if (c === '"' || c === '^' || c === '%') return v < 2 ? g.dirt2 : g.dirt;
  if (c === '~') return C.night1;
  if (c === 'X') return C.night3;
  // Asphalt: one tone (patches read as noise at this scale).
  return C.night2;
}

function buildFloors(ctx: Ctx): void {
  const { k, L } = ctx;
  const G = L.grid;
  for (let y = 0; y < G.h; y++) {
    for (let x = 0; x < G.w; x++) {
      let c = ch(L, x, y);
      if (c === ' ' || c === '#' || c === 'v') continue;
      // Under the gangway: the quay, or the strip of water between the quay and the hull.
      if (c === '=') c = ch(L, x - 1, y) === '~' ? '~' : ',';
      const col = floorColor(ctx, c, x, y);
      const fy = c === '~' ? -0.25 : 0;
      k.ground(x, y, x + 1, y + 1, fy, col);
      // Parking lines and lane marks.
      if (c === 'X' && (x + y) % 3 === 0)
        k.box(0.9, 0.012, 0.1, C.amber0, { x: x + 0.5, y: 0.003, z: y + 0.5 });
      if (c === ',' && L.grid.has(x, y - 1, F.OUTDOOR) && y > 0 && ch(L, x, y - 1) === '_' && x % 2 === 0) {
        k.box(0.12, 0.012, 0.6, C.concrete1, { x: x + 0.5, y: 0.003, z: y + 0.3 });
      }
    }
  }
}

function wallColor(ctx: Ctx, x: number, y: number): { side: number; top: number } {
  const v = (x * 3 + y * 5) % 4;
  switch (ctx.L.def.kind) {
    case 'diner':
      return { side: v === 0 ? C.fog0 : C.concrete2, top: C.night2 };
    case 'station':
    case 'compromised':
      return { side: v === 0 ? C.rust1 : C.rust2, top: C.night2 };
    case 'gas':
      return { side: v === 0 ? C.concrete1 : C.concrete2, top: C.night2 };
    case 'port':
    case 'checkpoint':
      return { side: C.slate1, top: C.night2 };
    default:
      return { side: v === 0 ? C.slate0 : C.slate1, top: C.night2 };
  }
}

function buildWalls(ctx: Ctx): void {
  const { k, L } = ctx;
  const G = L.grid;
  for (let y = 0; y < G.h; y++) {
    for (let x = 0; x < G.w; x++) {
      const c = ch(L, x, y);
      if (!isWallish(c)) continue;
      const south = isSouthWall(L, x, y);
      const boundary =
        !interiorAt(L, x, y - 1) &&
        !interiorAt(L, x, y + 1) &&
        !interiorAt(L, x - 1, y) &&
        !interiorAt(L, x + 1, y);
      const { side, top } = wallColor(ctx, x, y);
      if (c === 'W' || c === 'w') {
        // Window wall: a sill; glass and frame above unless cut away.
        k.box(1, 0.85, 0.35, side, { x: x + 0.5, z: y + 0.5 }, { top: C.concrete1 });
        if (!south) {
          k.box(1, 0.12, 0.3, C.night3, { x: x + 0.5, y: WALL_H - 0.4, z: y + 0.5 });
          k.box(1, WALL_H - 0.4 - 0.85, 0.06, C.night2, { x: x + 0.5, y: 0.85, z: y + 0.5 });
          k.box(1, 0.4, 0.35, side, { x: x + 0.5, y: WALL_H - 0.4, z: y + 0.5 }, { top });
        }
        if (c === 'w') {
          // The Station's infrared beacon: amber, only visible to androids (the scene toggles it).
          k.glow(() => k.box(0.32, 0.32, 0.1, C.amber1, { x: x + 0.5, y: 1.35, z: y + 0.75 }));
          k.light({ x: x + 0.5, y: 1.5, z: y + 1, color: C.amber1, intensity: 2.5, range: 4, tag: 'beacon' });
        }
        continue;
      }
      if (boundary && !L.grid.has(x, y + 1, F.INTERIOR)) {
        // Outer boundary walls (lot fences): a low concrete wall.
        k.box(1, 1.1, 1, C.concrete0, { x: x + 0.5, z: y + 0.5 }, { top: C.concrete1 });
        continue;
      }
      const h = south ? CUT_H : WALL_H;
      k.box(1, h, 1, side, { x: x + 0.5, z: y + 0.5 }, { top: south ? C.concrete1 : top });
      if (c === 'M' && !south) {
        // Menu board: amber-lit sign on the wall.
        k.glow(() => k.box(0.9, 0.55, 0.05, C.amber1, { x: x + 0.5, y: 1.9, z: y + 1.02 }));
      } else if (c === 'U' && !south) {
        k.box(0.95, 0.6, 0.1, C.night0, { x: x + 0.5, y: 2.05, z: y + 1.04 });
        k.glow(() => k.box(0.8, 0.45, 0.04, C.fog1, { x: x + 0.5, y: 2.12, z: y + 1.1 }));
        k.light({ x: x + 0.5, y: 2.2, z: y + 1.6, color: C.fog1, intensity: 0.8, range: 3 });
      } else if (c === 'Q' && !south) {
        k.box(1.0, 0.8, 0.05, C.rust1, { x: x + 0.5, y: 1.4, z: y + 1.02 });
      }
    }
  }
}

/**
 * The modeled prop for a furniture glyph (the art pass, spec §5.3), by the kind of stop it's in. Props face +z;
 * `facing` turns them toward their open side. Null keeps the glyph's simple box.
 */
function propFor(L: ParsedLayout, c: string, x: number, y: number): PropId | null {
  const kind = L.def.kind;
  const house = isHouse(kind);
  const staff = L.grid.has(x, y, F.STAFF);
  switch (c) {
    case 'S':
      return house ? 'bookshelf' : 'shelf';
    case 'R':
      return 'register';
    case 'C':
      return house ? 'kitchenCounter' : 'counter';
    case 'L':
      return 'lockers';
    case 'T':
      return kind === 'diner' ? 'dinerTable' : house ? 'kitchenTable' : null;
    case 'b':
      return 'boothSeat';
    case 'c':
      return kind === 'diner' ? 'stool' : 'chair';
    case 'O':
      return 'bench';
    case 'B':
      return 'chargingBay';
    case 'E':
      return 'evCharger';
    case 'K':
      return 'idKiosk';
    case 'k':
      return house ? 'sinkCounter' : 'grill';
    case 's':
      return 'stove';
    case 'F':
      return 'fridge';
    case 'J':
      return 'partsBin';
    case 'N':
      return house ? 'officeDesk' : staff || kind === 'gas' || kind === 'depot' ? 'mechanicBench' : null;
    case 'g':
      return 'gasPump';
    case 'y':
      return kind === 'port' ? 'pallet' : 'boxes';
    case '$':
      return 'boothConsole';
    default:
      return null;
  }
}

/**
 * Which way a piece of furniture faces: toward a table it belongs to (booths, chairs), else toward open floor,
 * preferring the camera's side. Returns the rotation about y for a prop modeled facing +z.
 */
function facing(L: ParsedLayout, c: string, x: number, y: number): number {
  const dirs: [number, number, number][] = [
    [0, 1, 0],
    [1, 0, Math.PI / 2],
    [-1, 0, -Math.PI / 2],
    [0, -1, Math.PI],
  ];
  if (c === 'b' || c === 'c') {
    for (const [dx, dy, ry] of dirs) if (ch(L, x + dx, y + dy) === 'T') return ry;
  }
  for (const [dx, dy, ry] of dirs) if (L.grid.walkable(x + dx, y + dy)) return ry;
  return 0;
}

/** Furniture and fixtures per glyph. */
function buildFurniture(ctx: Ctx): void {
  const { k, L, rng } = ctx;
  const G = L.grid;
  for (let y = 0; y < G.h; y++) {
    for (let x = 0; x < G.w; x++) {
      const c = ch(L, x, y);
      const cx = x + 0.5;
      const cz = y + 0.5;
      const prop = propFor(L, c, x, y);
      // Multi-tile pieces (a workbench) take one prop per pair of tiles.
      if (prop === 'mechanicBench' && ch(L, x - 1, y) === c && (x - firstOfRun(L, c, x, y)) % 2 === 1)
        continue;
      if (prop) {
        const wide = prop === 'mechanicBench' && ch(L, x + 1, y) === c;
        k.at({ x: wide ? x + 1 : cx, z: cz, ry: facing(L, c, x, y) }, () =>
          buildProp(k, prop, (x * 7 + y * 3) % 4),
        );
        continue;
      }
      switch (c) {
        case 'S': {
          // Shelf with goods in muted blocks.
          k.box(0.9, 1.75, 0.8, C.slate0, { x: cx, z: cz }, { top: C.night3 });
          for (let s = 0; s < 3; s++) {
            const yy = 0.25 + s * 0.52;
            k.box(0.92, 0.05, 0.84, C.slate1, { x: cx, y: yy, z: cz });
            for (let i = 0; i < 3; i++) {
              const col = [C.rust1, C.moss1, C.amber0, C.fog0, C.concrete2, C.rust2][(x * 3 + y + s + i) % 6];
              k.box(0.2, 0.28, 0.32, col, { x: cx - 0.3 + i * 0.3, y: yy + 0.05, z: cz + 0.22 });
            }
          }
          break;
        }
        case 'R':
          k.box(1, 1.0, 0.9, C.rust0, { x: cx, z: cz }, { top: C.concrete2 });
          if (ch(L, x, y - 1) !== 'R') {
            k.box(0.4, 0.25, 0.35, C.night2, { x: cx, y: 1.0, z: cz });
            k.glow(() => k.box(0.3, 0.12, 0.04, C.fog1, { x: cx, y: 1.12, z: cz + 0.19 }));
          }
          break;
        case 'C':
          k.box(1, 1.0, 0.9, C.rust1, { x: cx, z: cz }, { top: C.fog0 });
          break;
        case 'L':
          k.box(0.95, 2.0, 0.7, C.slate1, { x: cx, z: cz }, { top: C.slate0 });
          k.box(0.06, 1.7, 0.02, C.night2, { x: cx, y: 0.15, z: cz + 0.36 });
          k.box(0.1, 0.1, 0.04, C.concrete2, { x: cx + 0.25, y: 1.05, z: cz + 0.37 });
          break;
        case 'T':
          k.box(0.9, 0.75, 0.9, C.rust1, { x: cx, z: cz }, { top: C.rust2 });
          break;
        case 'b':
          k.box(0.95, 0.5, 0.8, C.rust0, { x: cx, z: cz }, { top: C.rust1 });
          k.box(0.95, 0.65, 0.2, C.rust0, { x: cx, y: 0.5, z: cz - 0.3 });
          break;
        case 'c':
          k.cylinder(0.22, 0.75, 6, C.slate1, { x: cx, z: cz }, C.rust1);
          break;
        case 'O':
          k.box(0.95, 0.45, 0.6, C.rust0, { x: cx, z: cz }, { top: C.rust1 });
          break;
        case 'V':
          // Vending machines are dynamic (Brick can shove them): built separately.
          break;
        case 'P':
          k.box(0.25, 4.4, 0.25, C.concrete1, { x: cx, z: cz });
          break;
        case 'B': {
          // Charging bay: a post with a screen and a cable.
          k.box(0.45, 1.5, 0.4, C.slate1, { x: cx, z: cz }, { top: C.slate0 });
          k.glow(() => k.box(0.32, 0.28, 0.04, C.amber1, { x: cx, y: 1.05, z: cz + 0.21 }));
          k.box(0.1, 0.1, 0.5, C.night1, { x: cx + 0.18, y: 0.6, z: cz + 0.4 });
          break;
        }
        case 'E':
          k.box(0.5, 1.4, 0.4, C.slate1, { x: cx, z: cz }, { top: C.slate0 });
          k.glow(() => k.box(0.3, 0.24, 0.04, C.fog1, { x: cx, y: 1.0, z: cz + 0.21 }));
          break;
        case 'K':
          // ID kiosk: cyan screen (reserved meaning).
          k.box(0.6, 1.55, 0.5, C.slate0, { x: cx, z: cz }, { top: C.night3 });
          k.glow(() => k.box(0.42, 0.36, 0.05, C.cyan1, { x: cx, y: 1.05, z: cz + 0.26 }));
          k.light({ x: cx, y: 1.3, z: cz + 0.8, color: C.cyan0, intensity: 1.2, range: 3 });
          break;
        case 'G':
          k.box(0.95, 0.9, 0.95, C.slate1, { x: cx, z: cz }, { top: C.slate0 });
          k.box(0.95, 1.3, 0.06, C.night2, { x: cx, y: 0.9, z: cz + 0.45 });
          k.box(1.05, 0.15, 1.05, C.slate0, { x: cx, y: 2.25, z: cz });
          k.glow(() => k.box(0.4, 0.08, 0.4, C.fog1, { x: cx, y: 2.2, z: cz }));
          break;
        case 'k':
        case 's':
          k.box(0.95, 0.95, 0.85, C.concrete2, { x: cx, z: cz }, { top: C.night3 });
          if (c === 'k' && (x + y) % 2 === 0) k.box(0.7, 0.05, 0.6, C.night1, { x: cx, y: 0.95, z: cz });
          break;
        case 'F':
          k.box(0.9, 2.0, 0.8, C.fog0, { x: cx, z: cz }, { top: C.concrete2 });
          break;
        case 'H':
          k.box(0.9, 1.9, 0.7, C.concrete1, { x: cx, z: cz }, { top: C.night3 });
          for (let s = 0; s < 3; s++)
            k.box(0.7, 0.25, 0.3, C.amber0, { x: cx, y: 0.3 + s * 0.55, z: cz + 0.2 });
          break;
        case 'J':
          k.box(0.9, 0.9, 0.8, C.rust0, { x: cx, z: cz }, { top: C.night2 });
          break;
        case 'N':
          k.box(0.95, 0.95, 0.75, C.rust1, { x: cx, z: cz }, { top: C.night3 });
          k.box(0.3, 0.2, 0.2, C.slate1, { x: cx - 0.2, y: 0.95, z: cz });
          break;
        case 'g':
          k.box(0.55, 1.6, 0.4, C.concrete1, { x: cx, z: cz }, { top: C.slate0 });
          k.glow(() => k.box(0.32, 0.2, 0.04, C.amber1, { x: cx, y: 1.2, z: cz + 0.21 }));
          break;
        case '&':
          if (L.def.kind === 'port') chainLink(ctx, x, y);
          else barrier(ctx, x, y);
          break;
        case 'Y': {
          if (L.def.kind === 'port') break;
          const h = 2.6 * (1 + ((x * 31 + y * 17) % 2));
          const cols = [C.rust1, C.slate1, C.moss1, C.concrete1, C.amber0];
          k.box(
            1,
            h,
            1,
            cols[(Math.floor(x / 6) + Math.floor(y / 3)) % cols.length],
            { x: cx, z: cz },
            { top: C.night3 },
          );
          break;
        }
        case 'y':
          k.box(0.9, 0.9, 0.9, C.amber0, { x: cx, z: cz }, { top: C.rust1 });
          break;
        case '^': {
          const kind = ctx.region === 'lowcountry' ? 'palm' : ctx.region === 'newengland' ? 'bare' : 'pine';
          tree(k, cx, cz, kind, rng);
          break;
        }
        case '%':
          k.box(0.95, 1.1, 0.95, C.moss0, { x: cx, z: cz }, { top: C.moss1 });
          break;
        case '!':
          k.box(0.2, 2.6, 0.3, C.slate1, { x: x + 0.1, z: cz });
          k.box(0.2, 2.6, 0.3, C.slate1, { x: x + 0.9, z: cz });
          k.box(1, 0.25, 0.3, C.slate1, { x: cx, y: 2.6, z: cz });
          k.glow(() => {
            k.box(0.08, 2.2, 0.08, C.cyan1, { x: x + 0.2, y: 0.2, z: cz + 0.16 });
            k.box(0.08, 2.2, 0.08, C.cyan1, { x: x + 0.8, y: 0.2, z: cz + 0.16 });
          });
          break;
        case '$':
          k.box(0.95, 1.2, 0.95, C.slate1, { x: cx, z: cz }, { top: C.slate0 });
          k.glow(() => k.box(0.5, 0.2, 0.05, C.fog1, { x: cx, y: 1.0, z: cz + 0.48 }));
          break;
        case 'D':
        case 'd':
          if (!isSouthWall(L, x, y)) {
            k.box(0.12, WALL_H, 1, C.night3, { x: x + 0.06, z: cz });
            k.box(0.12, WALL_H, 1, C.night3, { x: x + 0.94, z: cz });
            k.box(1, WALL_H - 2.3, 1, wallColor(ctx, x, y).side, { x: cx, y: 2.3, z: cz }, { top: C.night2 });
          }
          break;
        default:
          break;
      }
    }
  }
}

/** Which way a run of fence or barrier tiles goes at (x, y). */
function runsAlongX(L: ParsedLayout, x: number, y: number): boolean {
  const solid = (c: string): boolean => c === '&' || c === '!' || c === 'G' || c === '#';
  return (
    solid(ch(L, x - 1, y)) || solid(ch(L, x + 1, y)) || !(solid(ch(L, x, y - 1)) || solid(ch(L, x, y + 1)))
  );
}

/** Chain-link fence, 2.4 m: a post per meter, top and bottom rails, and crossed wire you can see through. */
function chainLink(ctx: Ctx, x: number, y: number): void {
  const { k, L } = ctx;
  const along = runsAlongX(L, x, y);
  const H = 2.4;
  const ry = along ? 0 : Math.PI / 2;
  k.at({ x: x + 0.5, z: y + 0.5, ry }, () => {
    k.box(0.07, H, 0.07, C.slate1, { x: -0.5 });
    k.box(1.0, 0.05, 0.05, C.slate1, { y: H - 0.05 });
    k.box(1.0, 0.04, 0.04, C.slate0, { y: 0.12 });
    for (const s of [-1, 1])
      k.box(1.38, 0.025, 0.025, C.slate0, { y: H / 2, rz: s * Math.atan2(H - 0.3, 1.0) });
    // Barbed wire along the top.
    k.box(1.0, 0.03, 0.03, C.night3, { y: H + 0.18 });
  });
}

/** A road barrier (the checkpoint): a striped arm on short posts. */
function barrier(ctx: Ctx, x: number, y: number): void {
  const { k, L } = ctx;
  const along = runsAlongX(L, x, y);
  k.at({ x: x + 0.5, z: y + 0.5, ry: along ? 0 : Math.PI / 2 }, () => {
    k.box(0.12, 1.0, 0.12, C.slate1, { x: -0.45 }, { top: C.slate0 });
    k.box(1.0, 0.14, 0.1, (x + y) % 2 === 0 ? C.amber1 : C.fog1, { y: 0.9 });
  });
}

/**
 * The Port's container stacks: each 2-deep strip of 'Y' tiles is filled with real containers along its run,
 * slightly out of line.
 */
function buildPortContainers(ctx: Ctx, cutaways: Cutaway[]): void {
  const { L, rng } = ctx;
  const G = L.grid;
  for (let y = 0; y < G.h - 1; y++) {
    for (let x = 0; x < G.w; x++) {
      const top = ch(L, x, y) === 'Y' && ch(L, x, y + 1) === 'Y' && ch(L, x, y - 1) !== 'Y';
      if (!top || ch(L, x - 1, y) === 'Y') continue;
      let len = 0;
      while (ch(L, x + len, y) === 'Y' && ch(L, x + len, y + 1) === 'Y') len++;
      const n = Math.max(1, Math.round(len / 6.5));
      const seg = len / n;
      // Each strip is its own piece so it can drop low when someone stands behind it.
      const k = new Kit();
      // Stacks are one or two high; whoever stands behind one is shown by the cutaway.
      for (let i = 0; i < n; i++) {
        const cx = x + seg * (i + 0.5);
        const high = 1 + rng.int(0, 1);
        for (let h = 0; h < high; h++) {
          const s = Math.min(1, (seg - 0.2) / CONTAINER_SIZE.len);
          k.at(
            {
              x: cx + rng.range(-0.12, 0.12),
              y: h * CONTAINER_SIZE.h,
              z: y + 1 + rng.range(-0.08, 0.08),
              sx: s,
            },
            () => container(k, rng.int(0, 30)),
          );
        }
      }
      const out = k.build();
      const group = new THREE.Group();
      if (out.solid) group.add(new THREE.Mesh(out.solid, materials().toon));
      cutaways.push({ group, x0: x, x1: x + len, zNorth: y });
    }
  }
}

/** The Port's lights: floodlights on the terminal fence's posts and over the yard's truck lanes. */
function buildPortLights(ctx: Ctx): void {
  const { k, L } = ctx;
  const G = L.grid;
  for (let x = 8; x < G.w; x += 12) {
    for (let y = 0; y < G.h; y++) {
      if (ch(L, x, y) !== '&' || !runsAlongX(L, x, y)) continue;
      k.at({ x: x + 0.5, z: y + 0.5 }, () => {
        k.box(0.12, 6, 0.12, C.slate0);
        k.box(0.5, 0.3, 0.4, C.night3, { y: 6 });
        k.glow(() => k.box(0.42, 0.06, 0.32, C.fog2, { y: 5.97 }));
      });
      k.light({ x: x + 0.5, y: 5.6, z: y + 1.2, color: C.fog2, intensity: 4, range: 11 });
      ctx.lampHeads.push({ x: x + 0.5, y: 5.9, z: y + 0.5 });
    }
  }
}

/** Around the Port: the harbor north and west, the city behind the lot, the terminal sheds to the east. */
function buildPortSurroundings(ctx: Ctx): void {
  const { k, L, rng } = ctx;
  const G = L.grid;
  const pad = 40;
  // The harbor: north of the quay and west of the yard (the grid's own water tiles sit at -0.25 too).
  k.ground(-pad, -pad - 30, G.w + pad, 0, -0.25, C.night1);
  k.ground(-pad, 0, 0, G.h + pad, -0.25, C.night1);
  // The quay's lip along the water.
  k.box(G.w, 0.3, 0.3, C.concrete0, { x: G.w / 2, y: -0.25, z: 6.15 }, { top: C.concrete1 });
  k.box(0.3, 0.3, G.h - 25, C.concrete0, { x: 2.85, y: -0.25, z: 25 + (G.h - 25) / 2 }, { top: C.concrete1 });
  // Mooring bollards along the quay, clear of the gangway.
  for (let x = 4; x < G.w - 2; x += 8) {
    if (Math.abs(x - 44.5) < 4) continue;
    k.at({ x, z: 6.55 }, () => buildProp(k, 'bollardMooring', x % 16 === 4 ? 1 : 0));
  }
  // East: the terminal's sheds, a lit door where the Recyclers come out.
  k.ground(G.w, 0, G.w + pad, G.h + pad, -0.01, C.night2);
  k.box(10, 7, 16, C.slate0, { x: G.w + 6, z: 21 }, { top: C.night1 });
  k.glow(() => k.box(0.05, 2.4, 2.2, C.fog1, { x: G.w + 0.98, y: 0, z: 22.5 }));
  k.light({ x: G.w + 0.2, y: 2.4, z: 22.5, color: C.fog2, intensity: 2.5, range: 7 });
  for (let z = 32; z < G.h; z += 9)
    k.box(8, 5 + rng.next() * 3, 7, C.night3, { x: G.w + 6, z }, { top: C.night1 });
  // South: the road past the lot and the dark city beyond it.
  k.ground(0, G.h, G.w, G.h + pad, -0.01, C.night2);
  for (let x = -6; x < G.w + 10; x += 4) k.box(2, 0.01, 0.14, C.amber0, { x: x + 1, y: 0.004, z: G.h + 4 });
  for (let x = 0; x < G.w; x += 10) {
    const h = 6 + rng.next() * 8;
    k.box(8, h, 7, rng.chance(0.5) ? C.night3 : C.slate0, { x: x + 4, z: G.h + 12 }, { top: C.night1 });
  }
  // Puddles on the apron and in the lanes (it's storming).
  for (let i = 0; i < 26; i++) {
    const x = rng.next() * G.w;
    const y = 6 + rng.next() * (G.h - 6);
    if (!G.walkable(Math.floor(x), Math.floor(y))) continue;
    k.box(1 + rng.next() * 1.5, 0.008, 0.6 + rng.next(), C.slate0, { x, y: 0.004, z: y });
  }
}

/** The x where a horizontal run of glyph `c` through (x, y) starts. */
function firstOfRun(L: ParsedLayout, c: string, x: number, y: number): number {
  let x0 = x;
  while (ch(L, x0 - 1, y) === c) x0--;
  return x0;
}

/** Security cameras on their walls (the sim's cameras sweep; the housing points down its centre line). */
function buildCameras(ctx: Ctx): void {
  const { k, L } = ctx;
  for (const cam of L.def.cameras ?? []) {
    const ry = Math.PI / 2 - (cam.facing * Math.PI) / 180;
    k.at({ x: cam.x + 0.5, y: 0, z: cam.y + 0.5, ry }, () => buildProp(k, 'securityCamera'));
  }
}

function tree(k: Kit, x: number, z: number, kind: 'pine' | 'palm' | 'bare', rng: Rng): void {
  const s = 0.8 + rng.next() * 0.5;
  if (kind === 'pine') {
    k.cylinder(0.15, 1.2 * s, 6, C.rust0, { x, z });
    k.cone(1.1 * s, 2.2 * s, 7, C.moss0, { x, y: 0.9 * s, z });
    k.cone(0.8 * s, 1.8 * s, 7, C.moss1, { x, y: 2.0 * s, z });
  } else if (kind === 'palm') {
    k.cylinder(0.14, 3.2 * s, 6, C.rust1, { x, z });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      k.box(0.25, 0.08, 1.3 * s, C.moss1, {
        x: x + Math.cos(a) * 0.5,
        y: 3.1 * s,
        z: z + Math.sin(a) * 0.5,
        ry: -a + Math.PI / 2,
        rx: 0.35,
      });
    }
  } else {
    k.cylinder(0.14, 2.6 * s, 6, C.night3, { x, z });
    k.pipe([x, 1.7 * s, z], [x + 0.7, 2.6 * s, z - 0.2], 0.09, C.night3);
    k.pipe([x, 2.0 * s, z], [x - 0.6, 2.9 * s, z + 0.2], 0.09, C.night3);
  }
}

/** Fluorescent tubes over interiors, sodium lamps over the lot. */
function buildLights(ctx: Ctx): void {
  const { k, L } = ctx;
  const G = L.grid;
  // Interiors: a tube every ~5 m over interior floor.
  for (let y = 1; y < G.h; y += 4) {
    for (let x = 1; x < G.w; x += 5) {
      if (!interiorAt(L, x, y)) continue;
      const staff = G.has(x, y, F.STAFF);
      // A Station is lamp-lit; a compromised one has most lamps off (the keeper is gone).
      const station = isHouse(L.def.kind);
      const dim = L.def.kind === 'compromised';
      k.glow(() => k.box(0.9, 0.06, 0.18, station ? C.amber2 : C.fog2, { x: x + 0.5, y: 2.95, z: y + 0.5 }));
      k.light({
        x: x + 0.5,
        y: 2.7,
        z: y + 0.5,
        color: station ? C.amber2 : C.fog2,
        intensity: dim ? 0.9 : station ? 2.2 : staff ? 1.1 : 1.5,
        range: 7,
        flicker: station ? 0 : 0.5,
      });
    }
  }
  // Lot: sodium streetlamps along the lot, on the sidewalk side, every ~10 m.
  for (let y = 2; y < G.h; y += 7) {
    for (let x = 3; x < G.w; x += 10) {
      const tx = x + ((y * 3) % 4);
      if (!G.has(tx, y, F.OUTDOOR) || !G.walkable(tx, y)) continue;
      // Only at the lot's edges (next to a wall, fence, or the map's edge), never in the middle of a path.
      const edge = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => !G.inBounds(tx + dx, y + dy) || G.has(tx + dx, y + dy, F.OPAQUE));
      if (!edge) continue;
      // Keep lamps off paths players use a lot: only on the lot edges or between bays.
      streetlamp(ctx, tx + 0.5, y + 0.5);
    }
  }
  // Canopy light panels over charging bays.
  for (let y = 0; y < G.h; y++) {
    for (let x = 0; x < G.w; x++) {
      if (ch(L, x, y) !== 'P') continue;
      k.box(2.2, 0.12, 0.5, C.concrete1, { x: x + 0.5, y: 4.4, z: y + 0.9 });
      k.glow(() => k.box(1.4, 0.05, 0.3, C.fog2, { x: x + 0.5, y: 4.36, z: y + 0.9 }));
      k.light({ x: x + 0.5, y: 4.0, z: y + 1.2, color: C.fog2, intensity: 2.6, range: 6 });
    }
  }
}

function streetlamp(ctx: Ctx, x: number, z: number): void {
  const { k } = ctx;
  k.at({ x, z }, () => {
    k.cylinder(0.08, 5, 6, C.slate0);
    k.box(0.12, 0.12, 1.1, C.slate0, { y: 4.9, z: 0.5 });
    k.box(0.45, 0.16, 0.35, C.slate1, { y: 4.78, z: 1.0 });
    k.glow(() => k.box(0.32, 0.07, 0.24, C.amber2, { y: 4.72, z: 1.0 }));
    k.light({ x: 0, y: 4.4, z: 1.0, color: C.amber2, intensity: 6, range: 9 });
  });
  ctx.lampHeads.push({ x, y: 4.6, z: z + 1 });
}

/** Region dressing outside the grid: ground, road shoulders, trees, buildings, snow. */
function buildSurroundings(ctx: Ctx): void {
  const { k, L, region, rng } = ctx;
  const G = L.grid;
  const g = regionGround(region);
  const pad = 22;
  // Ground beyond the grid.
  k.ground(-pad, -pad, G.w + pad, 0, -0.01, g.dirt2);
  k.ground(-pad, G.h, G.w + pad, G.h + pad, -0.01, C.night2);
  k.ground(-pad, 0, 0, G.h, -0.01, g.dirt2);
  k.ground(G.w, 0, G.w + pad, G.h, -0.01, g.dirt2);
  // Roads continue past the south edge.
  for (let x = -pad; x < G.w + pad; x += 4)
    k.box(2, 0.01, 0.14, C.amber0, { x: x + 1, y: 0.004, z: G.h + 4 });
  // North: dark buildings or trees.
  for (let x = -pad; x < G.w + pad; x += 9) {
    const h = 5 + rng.next() * 7;
    const col = [C.night3, C.slate0, C.rust0][Math.floor(rng.next() * 3)];
    if (region === 'piedmont' || region === 'lowcountry') {
      for (let i = 0; i < 3; i++)
        tree(k, x + rng.next() * 8, -3 - rng.next() * 10, region === 'lowcountry' ? 'palm' : 'pine', rng);
    } else {
      k.box(8, h, 7, col, { x: x + 4, z: -6 }, { top: C.night1 });
      for (let wy = 1.5; wy < h - 1; wy += 2.6) {
        for (let wx = 0; wx < 3; wx++) {
          const lit = rng.chance(0.12);
          if (lit) k.glow(() => k.box(1.1, 1.0, 0.05, C.amber1, { x: x + 1.5 + wx * 2.4, y: wy, z: -2.47 }));
          else k.box(1.1, 1.0, 0.05, C.night0, { x: x + 1.5 + wx * 2.4, y: wy, z: -2.47 });
        }
      }
    }
  }
  // Sides: trees / poles.
  for (let y = 0; y < G.h; y += 5) {
    for (const x of [-3 - rng.next() * 4, G.w + 2 + rng.next() * 4]) {
      if (region === 'newengland' || region === 'corridor') {
        k.cylinder(0.12, 8, 6, C.rust0, { x, z: y });
        k.box(2.2, 0.14, 0.14, C.rust0, { x, y: 7.3, z: y });
      } else tree(k, x, y, region === 'lowcountry' ? 'palm' : 'pine', rng);
    }
  }
  // Snowbanks in New England.
  if (region === 'newengland' && ctx.weather !== 'rain') {
    for (let x = -pad + 1; x < G.w + pad; x += 3.3) {
      const h = 0.3 + rng.next() * 0.35;
      k.box(2.4, h, 0.9, C.fog1, { x, z: G.h + 1.2 }, { top: C.fog2 });
    }
    for (let y = 1; y < G.h; y += 3.1) {
      k.box(0.9, 0.35 + rng.next() * 0.3, 2.2, C.fog1, { x: -1.2, z: y }, { top: C.fog2 });
      k.box(0.9, 0.35 + rng.next() * 0.3, 2.2, C.fog1, { x: G.w + 1.2, z: y }, { top: C.fog2 });
    }
  }
  // Puddles in the rain.
  if (
    ctx.weather === 'rain' ||
    ctx.weather === 'heavyrain' ||
    ctx.weather === 'storm' ||
    ctx.weather === 'drizzle'
  ) {
    for (let i = 0; i < 18; i++) {
      const x = rng.next() * G.w;
      const y = rng.next() * G.h;
      if (!G.has(Math.floor(x), Math.floor(y), F.OUTDOOR)) continue;
      k.box(1 + rng.next() * 1.5, 0.008, 0.6 + rng.next(), C.slate0, { x, y: 0.004, z: y });
    }
  }
}

export function buildLevel(L: ParsedLayout, region: Region, weather: Weather, seed: number): LevelBuild {
  const k = new Kit();
  const ctx: Ctx = { k, L, region, weather, rng: new Rng(hashSeed('level', L.def.id, seed)), lampHeads: [] };
  buildFloors(ctx);
  buildWalls(ctx);
  buildFurniture(ctx);
  buildCameras(ctx);
  const cutaways: Cutaway[] = [];
  if (L.def.kind === 'port') {
    buildPortContainers(ctx, cutaways);
    buildPortLights(ctx);
    buildPortSurroundings(ctx);
  } else {
    buildLights(ctx);
    buildSurroundings(ctx);
  }
  const out = k.build();
  const group = new THREE.Group();
  const m = materials();
  if (out.solid) group.add(new THREE.Mesh(out.solid, m.toon));
  if (out.glow) group.add(new THREE.Mesh(out.glow, m.glow));
  for (const c of cutaways) group.add(c.group);
  return { group, lights: out.lights, lampHeads: ctx.lampHeads, triangles: k.triangles, cutaways };
}

/** A vending machine (dynamic: Brick can shove it). */
export function vendingMesh(): THREE.Group {
  const k = new Kit();
  buildProp(k, 'vendingMachine');
  const out = k.build();
  const g = new THREE.Group();
  const m = materials();
  if (out.solid) g.add(new THREE.Mesh(out.solid, m.toon));
  if (out.glow) g.add(new THREE.Mesh(out.glow, m.glow));
  return g;
}

/** Station interiors (and compromised ones) are a home, not a shop. */
function isHouse(kind: string): boolean {
  return kind === 'station' || kind === 'compromised';
}
