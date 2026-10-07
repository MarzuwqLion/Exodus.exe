/** Scene registry: maps scene names (and `?scene=` jumps) to factories. */
import type { Game } from '../game';
import type { StationInterior } from '../content/schema';
import { currentNode } from '../run/map';
import { CampScene } from './camp';
import { CheckpointScene } from './checkpoint';
import { DriveScene } from './drive';
import { ensurePlayers, jumpStopConfig } from './jump';
import { MapScene } from './map';
import { RunFlow, type RunEnding } from './runflow';
import { EndingScene, PortPlaceholder, runStationScene, runStopScene } from './runscenes';
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
  registerRunScenes(game);
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

/** The run's flow, or (scene jumps) a new run from Boston on the launch seed. */
function flowOf(g: Game): RunFlow {
  if (g.flow) return g.flow;
  ensurePlayers(g, g.config.players);
  return RunFlow.begin(g, g.config.seed ?? 1);
}

/** QA jumps into a run: move the party to the first node of a column. */
function jumpTo(flow: RunFlow, column: number): void {
  const run = flow.run;
  const node = run.map.nodes.find((n) => n.column === column);
  if (!node) return;
  run.map.current = node.id;
  run.column = column;
  run.leg = column;
  run.day = Math.max(run.day, column + 1);
}

function registerRunScenes(game: Game): void {
  game.register('run', (g) => new MapScene(g, flowOf(g)));
  game.register('map', (g) => new MapScene(g, flowOf(g)));
  game.register('drive', (g) => {
    const flow = flowOf(g);
    if (g.config.scene === 'drive' && flow.run.leg === 0) {
      const next = flow.run.map.nodes.find((n) => n.id === currentNode(flow.run.map).next[0])!;
      jumpTo(flow, next.column);
      flow.pendingEvent = true;
    }
    return new DriveScene(g, flow);
  });
  game.register('camp', (g, p) => new CampScene(g, flowOf(g), !!p?.station));
  game.register('checkpoint', (g) => {
    const flow = flowOf(g);
    if (g.config.scene === 'checkpoint' && currentNode(flow.run.map).type !== 'checkpoint') jumpTo(flow, 4);
    return new CheckpointScene(g, flow);
  });
  game.register('runstop', (g, p) =>
    runStopScene(g, flowOf(g), { compromised: !!p?.compromised, bust: !!p?.bust }),
  );
  game.register('runstation', (g) => runStationScene(g, flowOf(g)));
  game.register('port', (g) => new PortPlaceholder(g, flowOf(g)));
  game.register('ending', (g, p) => new EndingScene(g, (p?.kind as RunEnding | undefined) ?? 'lost'));
}
