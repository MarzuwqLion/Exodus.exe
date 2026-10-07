/**
 * Scene jumps (spec §17.6: `?scene=depot` etc.): build a playable configuration straight from URL parameters
 * (seed, region, weather, players, heat, day, variant, skin, integrity, alert) without a run.
 */
import { STOP_LAYOUTS } from '../content/layouts';
import { REGION_WEATHER } from '../content/regions';
import type { LaunchConfig } from '../core/config';
import type { MemberId, Region, Slot, Weather } from '../core/types';
import type { Game } from '../game';
import { startingParty, startingResources } from '../run/party';
import type { LayoutDef } from '../sim/layout';
import type { StopConfig } from '../sim/stop';

export const LAYOUTS: Record<string, readonly LayoutDef[]> = {
  depot: STOP_LAYOUTS.depot,
  diner: STOP_LAYOUTS.diner,
  gas: STOP_LAYOUTS.gas,
  station: STOP_LAYOUTS.station,
  compromised: STOP_LAYOUTS.compromised,
  checkpoint: STOP_LAYOUTS.checkpoint,
  lot: STOP_LAYOUTS.test,
};

/** Join the requested number of players for QA and scene jumps (keyboard layouts). */
export function ensurePlayers(game: Game, n: 1 | 2): void {
  if (!game.input.isJoined(0)) game.input.join('kb1');
  if (n === 2 && !game.input.isJoined(1)) game.input.join('kb2');
}

export function jumpStopConfig(game: Game, kind: string, c: LaunchConfig): StopConfig {
  const layouts = LAYOUTS[kind] ?? LAYOUTS.depot;
  const variant = Math.max(0, Math.min(layouts.length - 1, c.variant ?? 0));
  const region: Region = c.region ?? 'newengland';
  const weather: Weather = c.weather ?? REGION_WEATHER[region][0];
  const party = startingParty();
  for (const m of party) {
    if (m.kind !== 'android') continue;
    if (c.skin !== null) m.skin = c.skin;
    if (c.integrity !== null) m.integrity = c.integrity;
  }
  ensurePlayers(game, c.players);
  const control: Record<Slot, MemberId | null> = { 0: 'wren', 1: c.players === 2 ? 'brick' : null };
  return {
    layout: layouts[variant],
    seed: c.seed ?? 1,
    region,
    weather,
    heat: c.heat ?? 0,
    day: c.day ?? 3,
    party,
    control,
    resources: startingResources(),
    startAlert: c.alert || kind === 'checkpoint',
    bust: kind === 'checkpoint',
  };
}
