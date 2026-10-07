/** Boot: parse URL parameters, create the game, register scenes, expose QA hooks, start. */
import { parseConfig } from './core/config';
import { Game } from './game';
import { installQaHooks } from './qa';
import { registerScenes } from './scenes/registry';

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #game canvas');

const config = parseConfig(window.location.search);
const game = new Game(canvas, config);
registerScenes(game);
if (config.qa || config.bench || config.debug) installQaHooks(game);
game.start();
game.goto(config.scene ?? (config.qa ? 'street' : 'boot'));
