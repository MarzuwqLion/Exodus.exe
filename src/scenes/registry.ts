/** Scene registry: maps scene names (and `?scene=` jumps) to factories. */
import type { Game } from '../game';
import { StreetScene } from './street';

export function registerScenes(game: Game): void {
  game.register('street', (g) => new StreetScene(g));
  game.register('boot', (g) => new StreetScene(g));
}
