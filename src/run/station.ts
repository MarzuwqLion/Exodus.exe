/**
 * Stations (spec §10.5): the keepers, their interiors, the free care, the trades, and compromised Stations.
 * Pure functions over plain party and resource data, so the Station scene and the run share them.
 */
import { STATION_KEEPERS } from '../content/conversations';
import { MEMBERS } from '../content/characters';
import { compromised, STATIONS } from '../content/layouts/station';
import type { StationKeeper } from '../content/schema';
import { TUNING } from '../content/tuning';
import type { Rng } from '../core/rng';
import type { MemberState, Resources } from '../core/types';
import type { LayoutDef } from '../sim/layout';
import { clamp100 } from './party';

/** The keeper who runs the Station in this map column (2, 3, 5, 6, 7, or 9). */
export function keeperForColumn(column: number): StationKeeper | undefined {
  return STATION_KEEPERS.find((k) => k.column === column);
}

/** The interior a keeper lives in, or its compromised version (the van outside, the bag in the back). */
export function stationLayout(keeper: StationKeeper, isCompromised = false): LayoutDef {
  const base = STATIONS[keeper.interior];
  return isCompromised ? compromised(base) : base;
}

/** At Heat 3, a Station is compromised one time in four (spec §10.5). */
export function rollCompromised(heat: number, rng: Rng): boolean {
  const S = TUNING.station;
  return heat >= S.compromisedHeat && rng.chance(S.compromisedChance);
}

/**
 * The keeper patches everyone up: +25 Hull, +25 Skin, and +20 Integrity for every android still with the
 * party. Returns one line per android for the Station panel.
 */
export function stationCare(party: MemberState[]): string[] {
  const S = TUNING.station;
  const lines: string[] = [];
  for (const m of party) {
    if (m.kind !== 'android' || m.status === 'lost') continue;
    const before = { hull: m.hull, skin: m.skin, integrity: m.integrity };
    m.hull = clamp100(m.hull + S.hull);
    m.skin = clamp100(m.skin + S.skin);
    m.integrity = clamp100(m.integrity + S.integrity);
    const parts: string[] = [];
    if (m.hull > before.hull) parts.push(`Hull +${Math.round(m.hull - before.hull)}`);
    if (m.skin > before.skin) parts.push(`Skin +${Math.round(m.skin - before.skin)}`);
    if (m.integrity > before.integrity)
      parts.push(`Integrity +${Math.round(m.integrity - before.integrity)}`);
    lines.push(`${MEMBERS[m.id].name}: ${parts.length ? parts.join(', ') : 'nothing to fix'}`);
  }
  return lines;
}

export type StationTrade = 'partsForPapers' | 'papersForCells';

export const STATION_TRADES: Record<
  StationTrade,
  { give: Partial<Resources>; get: Partial<Resources>; label: string }
> = {
  partsForPapers: {
    give: { parts: TUNING.station.tradePartsForPapers },
    get: { papers: 1 },
    label: `Trade ${TUNING.station.tradePartsForPapers} Parts for 1 Papers`,
  },
  papersForCells: {
    give: { papers: 1 },
    get: { cells: TUNING.station.tradePapersForCells },
    label: `Trade 1 Papers for ${TUNING.station.tradePapersForCells} Cells`,
  },
};

/** Each trade works once per visit, and only if the party has what it gives. */
export function canTrade(res: Resources, t: StationTrade, used: ReadonlySet<StationTrade>): boolean {
  if (used.has(t)) return false;
  const give = STATION_TRADES[t].give;
  return (Object.keys(give) as (keyof Resources)[]).every((k) => res[k] >= (give[k] ?? 0));
}

export function applyTrade(res: Resources, t: StationTrade): void {
  const { give, get } = STATION_TRADES[t];
  for (const k of Object.keys(give) as (keyof Resources)[]) res[k] -= give[k] ?? 0;
  for (const k of Object.keys(get) as (keyof Resources)[]) res[k] += get[k] ?? 0;
}

/** The other things a Station gives, as panel lines (applied by the camp: §10.5). */
export function stationPerks(party: readonly MemberState[]): string[] {
  const lines: string[] = [];
  if (party.some((m) => m.kind === 'human' && m.status === 'active'))
    lines.push("June eats here tonight. It doesn't cost Rations.");
  lines.push('Rumors for the next two columns.');
  lines.push("A long rest here doesn't cost an extra day.");
  return lines;
}
