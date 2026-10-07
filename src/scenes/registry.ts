/** Scene registry: maps scene names (and `?scene=` jumps) to factories. */
import type { Game } from '../game';
import type { StationInterior } from '../content/schema';
import { jumpStopConfig } from './jump';
import { compromisedScene, keeperForInterior, stationScene } from './station';
import { StopScene } from './stop';
import { StreetScene } from './street';

export function registerScenes(game: Game): void {
  game.register('street', (g) => new StreetScene(g));
  game.register('boot', (g) => new StreetScene(g));
  game.register('title', (g) => new StreetScene(g));
  const titles: Record<string, string> = {
    depot: 'Charging depot',
    diner: 'Diner',
    gas: 'Gas station',
    station: 'Station',
    checkpoint: 'Checkpoint',
  };
  game.register('station', (g) => {
    const cfg = jumpStopConfig(g, 'station', g.config);
    const interior = cfg.layout.id.replace('station-', '') as StationInterior;
    return stationScene(g, { cfg, keeper: keeperForInterior(interior, cfg.seed) });
  });
  game.register('compromised', (g) => compromisedScene(g, jumpStopConfig(g, 'compromised', g.config)));
  for (const kind of ['depot', 'diner', 'gas', 'lot']) {
    game.register(
      kind,
      (g) =>
        new StopScene(g, {
          cfg: jumpStopConfig(g, kind, g.config),
          title: titles[kind],
        }),
    );
  }
}
