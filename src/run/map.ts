/**
 * The map (spec §12.2): a node graph of columns from Boston (column 0) to the Port of Miami (column 10).
 * Columns 1–9 hold 2–3 towns each, except the single checkpoint nodes at columns 4 and 8; every node connects
 * to 1–2 nodes in the next column without roads crossing, and every node lies on a path from Boston to the
 * Port. Three Stations hide among the towns in columns 2, 3, 5, 6, 7, or 9 and show themselves when the
 * party is one column away (two with June). Rumors attach to nodes and change their stops.
 */
import { STATION_KEEPERS } from '../content/conversations';
import { REGION_WEATHER, regionOfColumn } from '../content/regions';
import { CHECKPOINT_NAMES, TOWNS_BY_COLUMN } from '../content/towns';
import { TUNING } from '../content/tuning';
import { Rng, hashSeed } from '../core/rng';
import type {
  MapNode,
  MemberState,
  NodeType,
  Rumor,
  RumorKind,
  RunMap,
  StopKind,
  StopModifier,
} from '../core/types';
import { stationRevealColumns } from './june';

const ORDINARY: readonly StopKind[] = ['depot', 'diner', 'gas'];
const ORDINARY_WEIGHTS = [0.4, 0.3, 0.3];

/** How many nodes each column gets (columns after a single node have two, so every node stays reachable). */
function columnSizes(rng: Rng): number[] {
  const R = TUNING.run;
  const sizes: number[] = [];
  for (let c = 0; c <= R.columns; c++) {
    if (c === 0 || c === R.columns || R.checkpointColumns.includes(c)) sizes.push(1);
    else if (sizes[c - 1] === 1) sizes.push(2);
    else sizes.push(rng.chance(0.5) ? 3 : 2);
  }
  return sizes;
}

/** Non-crossing roads from one column to the next: 1–2 per node, every node in the next column reached. */
function connect(rng: Rng, from: MapNode[], to: MapNode[]): void {
  const a = from.length;
  const b = to.length;
  const edges: Set<number>[] = from.map(() => new Set<number>());
  // A monotone base road for each node keeps roads from crossing.
  for (let i = 0; i < a; i++) edges[i].add(a === 1 ? 0 : Math.round((i * (b - 1)) / (a - 1)));
  if (a === 1) for (let j = 0; j < b; j++) edges[0].add(j);
  // Reach every node in the next column from its nearest neighbor above.
  for (let j = 0; j < b; j++) {
    if (edges.some((e) => e.has(j))) continue;
    const owner = edges.findIndex(
      (e, i) => Math.max(...e) < j && (i === a - 1 || Math.min(...edges[i + 1]) >= j),
    );
    edges[owner >= 0 ? owner : a - 1].add(j);
  }
  // Now and then a second road, to a neighbor, where it doesn't cross.
  for (let i = 0; i < a; i++) {
    if (edges[i].size >= 2 || !rng.chance(0.35)) continue;
    const hi = Math.max(...edges[i]) + 1;
    const lo = Math.min(...edges[i]) - 1;
    const nextLo = i + 1 < a ? Math.min(...edges[i + 1]) : Infinity;
    const prevHi = i > 0 ? Math.max(...edges[i - 1]) : -Infinity;
    if (hi < b && hi <= nextLo) edges[i].add(hi);
    else if (lo >= 0 && lo >= prevHi) edges[i].add(lo);
  }
  from.forEach((n, i) => {
    n.next = [...edges[i]].sort((x, y) => x - y).map((j) => to[j].id);
  });
}

/** Generate a run's map from its seed. */
export function generateMap(seed: number): RunMap {
  const rng = new Rng(hashSeed('map', seed));
  const R = TUNING.run;
  const sizes = columnSizes(rng);
  // Three Stations in three of the Station columns.
  const stationCols = rng.shuffle([...R.stationColumns]).slice(0, R.stationsPerMap);
  // Keepers' towns are theirs: no other node takes the name.
  const usedNames = new Set<string>(STATION_KEEPERS.map((k) => k.place.split(',')[0]));
  const town = (column: number): string => {
    const list = TOWNS_BY_COLUMN[column] ?? [];
    const free = list.filter((t) => !usedNames.has(t));
    const name = free.length ? rng.pick(free) : 'Rest stop';
    usedNames.add(name);
    return name;
  };
  const columns: MapNode[][] = [];
  for (let c = 0; c <= R.columns; c++) {
    const region = regionOfColumn(c);
    const n = sizes[c];
    const stationAt = (stationCols as readonly number[]).includes(c) ? rng.int(0, n - 1) : -1;
    const col: MapNode[] = [];
    let types: NodeType[] = [];
    for (let i = 0; i < n; i++) {
      let type: NodeType;
      if (c === 0) type = 'boston';
      else if (c === R.columns) type = 'port';
      else if (R.checkpointColumns.includes(c)) type = 'checkpoint';
      else if (i === stationAt) type = 'station';
      else type = rng.weighted(ORDINARY, (k) => ORDINARY_WEIGHTS[ORDINARY.indexOf(k)]) ?? 'depot';
      types.push(type);
    }
    // Some variety within a column: no column of identical ordinary stops.
    const ordinary = types.filter((t) => ORDINARY.includes(t as StopKind));
    if (ordinary.length >= 2 && new Set(ordinary).size === 1) {
      const k = types.findIndex((t) => ORDINARY.includes(t as StopKind));
      types = types.map((t, i) => (i === k ? ORDINARY[(ORDINARY.indexOf(t as StopKind) + 1) % 3] : t));
    }
    for (let i = 0; i < n; i++) {
      const type = types[i];
      const keeper = type === 'station' ? STATION_KEEPERS.findIndex((k) => k.column === c) : undefined;
      const name =
        type === 'boston'
          ? 'Boston'
          : type === 'port'
            ? 'Port of Miami'
            : type === 'checkpoint'
              ? (CHECKPOINT_NAMES[c] ?? 'Checkpoint')
              : keeper !== undefined && keeper >= 0
                ? STATION_KEEPERS[keeper].place.split(',')[0]
                : town(c);
      col.push({
        id: `c${c}n${i}`,
        column: c,
        index: i,
        type,
        region,
        // Spread across the map, drifting east toward the coast as the route goes south.
        x: n === 1 ? 0.55 + c * 0.015 : 0.2 + (0.6 * i) / (n - 1) + rng.range(-0.06, 0.06),
        name,
        crowd: rng.int(1, 3) as 1 | 2 | 3,
        patrol: rng.int(1, 3) as 1 | 2 | 3,
        distance: c === 0 ? 0 : rng.int(R.legBattery[0], R.legBattery[1]),
        weather: rng.pick(REGION_WEATHER[region]),
        layoutVariant: rng.int(0, 1),
        revealed: type !== 'station',
        decoy: type === 'station' ? rng.pick(ORDINARY) : undefined,
        patrolKnown: false,
        visited: c === 0,
        next: [],
        keeper: keeper !== undefined && keeper >= 0 ? keeper : undefined,
      });
    }
    columns.push(col);
  }
  for (let c = 0; c < R.columns; c++) connect(rng, columns[c], columns[c + 1]);
  const map: RunMap = { nodes: columns.flat(), current: columns[0][0].id };
  return map;
}

export function nodeById(map: RunMap, id: string): MapNode {
  const n = map.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`no node ${id}`);
  return n;
}

export function currentNode(map: RunMap): MapNode {
  return nodeById(map, map.current);
}

/** Where the party can go next. */
export function nextNodes(map: RunMap): MapNode[] {
  return currentNode(map).next.map((id) => nodeById(map, id));
}

/** Problems with a generated map (empty when it's valid). */
export function validateMap(map: RunMap): string[] {
  const R = TUNING.run;
  const out: string[] = [];
  const byCol = (c: number): MapNode[] => map.nodes.filter((n) => n.column === c);
  for (let c = 0; c <= R.columns; c++) {
    const col = byCol(c);
    if (col.length === 0) out.push(`column ${c} is empty`);
    if ((c === 0 || c === R.columns || R.checkpointColumns.includes(c)) && col.length !== 1)
      out.push(`column ${c} must be a single node`);
    if (col.length > 3) out.push(`column ${c} has ${col.length} nodes`);
    for (const n of col) {
      if (c < R.columns && (n.next.length < 1 || n.next.length > 2))
        out.push(`${n.id} has ${n.next.length} roads`);
      for (const id of n.next) {
        const m = map.nodes.find((x) => x.id === id);
        if (!m || m.column !== c + 1) out.push(`${n.id} -> ${id} skips a column`);
      }
    }
    // Roads don't cross: targets are non-decreasing down the column.
    for (let i = 1; i < col.length; i++) {
      const prev = col[i - 1].next.map((id) => nodeById(map, id).index);
      const cur = col[i].next.map((id) => nodeById(map, id).index);
      if (prev.length && cur.length && Math.max(...prev) > Math.min(...cur))
        out.push(`roads cross at column ${c}`);
    }
  }
  if (byCol(0)[0]?.type !== 'boston') out.push('column 0 is not Boston');
  if (byCol(R.columns)[0]?.type !== 'port') out.push('the last column is not the Port');
  for (const c of R.checkpointColumns)
    if (byCol(c)[0]?.type !== 'checkpoint') out.push(`column ${c} is not a checkpoint`);
  const stations = map.nodes.filter((n) => n.type === 'station');
  if (stations.length !== R.stationsPerMap) out.push(`${stations.length} Stations`);
  for (const s of stations)
    if (!(R.stationColumns as readonly number[]).includes(s.column))
      out.push(`Station in column ${s.column}`);
  // Everything reachable from Boston, and everything reaches the Port.
  const reach = new Set<string>([map.nodes[0].id]);
  for (const n of [...map.nodes].sort((x, y) => x.column - y.column))
    if (reach.has(n.id)) for (const id of n.next) reach.add(id);
  for (const n of map.nodes) if (!reach.has(n.id)) out.push(`${n.id} is unreachable`);
  return out;
}

// -------------------------------------------------------------------------------------------------
// Reveal rules and rumors
// -------------------------------------------------------------------------------------------------

/**
 * After the party moves: Stations within one column ahead (two with June) show their beacon, and the roads
 * ahead show their patrol presence. Returns the Stations revealed now.
 */
export function revealAhead(map: RunMap, party: readonly MemberState[]): MapNode[] {
  const cur = currentNode(map);
  const ahead = stationRevealColumns(party);
  const shown: MapNode[] = [];
  for (const n of map.nodes) {
    if (n.type === 'station' && !n.revealed && n.column > cur.column && n.column <= cur.column + ahead) {
      n.revealed = true;
      shown.push(n);
    }
  }
  for (const id of cur.next) nodeById(map, id).patrolKnown = true;
  return shown;
}

/** What a node looks like on the map: a hidden Station looks like an ordinary town. */
export function shownType(n: MapNode): NodeType {
  return n.type === 'station' && !n.revealed ? (n.decoy ?? 'depot') : n.type;
}

const RUMOR_MODS: Partial<Record<RumorKind, StopModifier>> = {
  'cells-cache': 'cellsCache',
  'recycler-activity': 'recyclerActivity',
  'sympathetic-staff': 'sympatheticStaff',
};

/** Ordinary stop nodes in the next `columns` columns. */
export function upcoming(map: RunMap, columns: number): MapNode[] {
  const c = currentNode(map).column;
  return map.nodes.filter((n) => n.column > c && n.column <= c + columns);
}

/**
 * Learn a rumor about a node ahead. Stop rumors (Cells cache, Recycler activity, sympathetic staff) change
 * that node's stop; 'patrols' reveals patrol presence; 'station' reveals a Station. Returns the rumor added.
 */
export function addRumor(rumors: Rumor[], kind: RumorKind, node: MapNode): Rumor | null {
  if (rumors.some((r) => r.nodeId === node.id && r.kind === kind)) return null;
  if (kind === 'station') {
    if (node.type !== 'station') return null;
    node.revealed = true;
  }
  if (kind === 'patrols') node.patrolKnown = true;
  const r: Rumor = { nodeId: node.id, kind };
  rumors.push(r);
  return r;
}

/** A random rumor about a random ordinary node within `columns` columns (the diner TV, events). */
export function rumorAhead(
  map: RunMap,
  rumors: Rumor[],
  rng: Rng,
  columns: number,
  kind?: RumorKind,
): Rumor | null {
  const nodes = upcoming(map, columns).filter((n) => ORDINARY.includes(n.type as StopKind));
  if (nodes.length === 0) return null;
  const k = kind ?? rng.pick(['cells-cache', 'recycler-activity', 'sympathetic-staff', 'patrols'] as const);
  for (const n of rng.shuffle([...nodes])) {
    const r = addRumor(rumors, k, n);
    if (r) return r;
  }
  return null;
}

/** Reveal a hidden Station within `columns` columns ahead; returns it, or null if none remains. */
export function revealStationAhead(map: RunMap, rumors: Rumor[], columns: number): MapNode | null {
  const s = upcoming(map, columns).find((n) => n.type === 'station' && !n.revealed);
  if (!s) return null;
  addRumor(rumors, 'station', s);
  return s;
}

/** The stop modifiers rumors put on a node (spec §12.2). */
export function rumorMods(rumors: readonly Rumor[], nodeId: string): StopModifier[] {
  const mods: StopModifier[] = [];
  for (const r of rumors) {
    const m = r.nodeId === nodeId ? RUMOR_MODS[r.kind] : undefined;
    if (m) mods.push(m);
  }
  return mods;
}
