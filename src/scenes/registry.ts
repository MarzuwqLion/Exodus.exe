/** Scene registry: maps scene names (and `?scene=` jumps) to factories. */
import type { Game } from '../game';
import { jumpStopConfig } from './jump';
import { StopScene } from './stop';
import { StreetScene } from './street';

export function registerScenes(game: Game): void {
  game.register('street', (g) => new StreetScene(g));
  game.register('boot', (g) => new StreetScene(g));
  game.register('title', (g) => new StreetScene(g));
  for (const kind of ['depot', 'lot']) {
    game.register(
      kind,
      (g) =>
        new StopScene(g, {
          cfg: jumpStopConfig(g, kind, g.config),
          title: kind === 'depot' ? 'Charging depot' : undefined,
        }),
    );
  }
}
