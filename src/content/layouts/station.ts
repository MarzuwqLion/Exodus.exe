/**
 * Station interiors (spec §10.5): a house kitchen, a feed store back room, and a church fellowship hall —
 * warm, cluttered, lit by lamps and the amber infrared beacon in a window ('w'). A Station replaces both the
 * stop and camp for that leg.
 *
 * Compromised Stations (Heat 3) reuse the same interiors with a Recycler van outside: grab the keeper's supply
 * bag from the back room and leave quietly.
 */
import type { StationInterior } from '../schema';
import type { LayoutDef, NpcSpawnDef } from '../../sim/layout';
import { GridBuilder } from './builder';

function kitchen(): string[] {
  const g = new GridBuilder(26, 18, '"');
  g.room(2, 1, 23, 11, '.');
  // Kitchen along the north wall; a table with chairs; a sofa and a back room.
  g.text(3, 2, 'Cs sCCF');
  g.block(6, 5, ['cTc', 'cTc']);
  g.text(12, 9, 'OOO');
  g.vline(17, 2, 7, '#');
  g.hline(7, 17, 22, '#');
  g.rect(18, 2, 22, 6, 'z');
  g.set(17, 4, 'd');
  g.text(19, 2, 'HH');
  g.set(2, 5, 'w');
  g.set(23, 9, 'W');
  // Front door, porch, the car out front.
  g.set(9, 11, 'D');
  g.hline(12, 2, 23, '_');
  g.rect(3, 14, 7, 16, 'X');
  g.rect(0, 13, 25, 13, '"');
  g.hline(17, 0, 25, ',');
  return g.rows();
}

function feedstore(): string[] {
  const g = new GridBuilder(28, 18, ',');
  g.room(2, 1, 25, 11, '.');
  // Sacks of feed, shelving, the office desk, the back storeroom.
  g.text(3, 2, 'yy HHH yy');
  g.text(3, 3, 'y');
  g.block(14, 4, ['yy', 'yy']);
  g.block(6, 6, ['cTc']);
  g.vline(19, 2, 6, '#');
  g.hline(7, 19, 24, '#');
  g.rect(20, 2, 24, 6, 'z');
  g.set(19, 4, 'd');
  g.text(21, 2, 'HHH');
  g.set(25, 4, 'w');
  g.set(2, 8, 'W');
  g.text(9, 9, 'O');
  // Loading door and the lot.
  g.set(12, 11, 'D');
  g.hline(12, 2, 25, '_');
  g.rect(20, 14, 24, 16, 'X');
  return g.rows();
}

function church(): string[] {
  const g = new GridBuilder(30, 18, ',');
  g.room(2, 1, 27, 11, '.');
  // Folding tables in rows, a kitchen hatch with a coffee urn, a piano, the pantry.
  for (const y of [4, 7]) for (const x of [5, 11]) g.text(x, y, 'cTTc');
  g.text(17, 2, 'CCC');
  g.text(3, 2, 'O');
  g.vline(21, 2, 6, '#');
  g.hline(7, 21, 26, '#');
  g.rect(22, 2, 26, 6, 'z');
  g.set(21, 4, 'd');
  g.text(23, 2, 'HHH');
  g.set(2, 6, 'w');
  g.set(27, 9, 'W');
  g.set(9, 10, 'O');
  g.set(15, 11, 'D');
  g.hline(12, 2, 27, '_');
  g.rect(4, 14, 8, 16, 'X');
  return g.rows();
}

const KEEPER: NpcSpawnDef = { role: 'keeper', at: 'keeper' };

export const STATION_KITCHEN: LayoutDef = {
  id: 'station-kitchen',
  kind: 'station',
  variant: 0,
  name: 'Station',
  grid: kitchen(),
  points: { keeper: [5, 3], bag: [20, 4], enter: [24, 17] },
  npcs: [KEEPER],
  noAutoContainers: ['H'],
  vanEntry: [24, 17],
  car: { x: 5, y: 15, facing: 'east' },
};

export const STATION_FEEDSTORE: LayoutDef = {
  id: 'station-feedstore',
  kind: 'station',
  variant: 1,
  name: 'Station',
  grid: feedstore(),
  points: { keeper: [8, 5], bag: [22, 4], enter: [1, 17] },
  npcs: [KEEPER],
  noAutoContainers: ['H'],
  vanEntry: [1, 17],
  car: { x: 22, y: 15, facing: 'west' },
};

export const STATION_CHURCH: LayoutDef = {
  id: 'station-church',
  kind: 'station',
  variant: 2,
  name: 'Station',
  grid: church(),
  points: { keeper: [18, 3], bag: [24, 4], enter: [28, 17] },
  npcs: [KEEPER],
  noAutoContainers: ['H'],
  vanEntry: [28, 17],
  car: { x: 6, y: 15, facing: 'east' },
};

export const STATIONS: Record<StationInterior, LayoutDef> = {
  kitchen: STATION_KITCHEN,
  feedstore: STATION_FEEDSTORE,
  church: STATION_CHURCH,
};

/**
 * A compromised Station: same interior, a Recycler van outside with two Recyclers walking the lot, the keeper
 * gone, and the supply bag (Cells, Parts, Papers) in the back room.
 */
export function compromised(base: LayoutDef): LayoutDef {
  const bag = base.points.bag;
  return {
    ...base,
    id: `${base.id}-compromised`,
    kind: 'compromised',
    npcs: [
      { role: 'recycler', count: [1, 1], at: 'enter' },
      { role: 'gunner', count: [1, 1], at: 'enter' },
    ],
    containers: [{ kind: 'supplyBag', x: bag[0], y: bag[1] - 1 }],
  };
}
