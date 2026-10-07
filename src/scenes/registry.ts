/** Scene registry: maps scene names (and `?scene=` jumps) to factories. */
import type { Game } from '../game';
import type { StationInterior } from '../content/schema';
import type { MemberId } from '../core/types';
import { recruitJune } from '../run/june';
import { currentNode } from '../run/map';
import { CampScene } from './camp';
import { CheckpointScene } from './checkpoint';
import { DriveScene } from './drive';
import { GhanaScene } from './ending';
import { GameOverScene, type GameOverKind } from './gameover';
import { ensurePlayers, jumpStopConfig } from './jump';
import { MapScene } from './map';
import { RunFlow } from './runflow';
import { PortPlaceholder, runStationScene, runStopScene } from './runscenes';
import { compromisedScene, keeperForInterior, stationScene } from './station';
import { StopScene } from './stop';
import { StreetScene } from './street';
import { VoyageScene } from './voyage';

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
  registerFinaleScenes(game);
}

const PARTY_IDS: readonly MemberId[] = ['wren', 'brick', 'vesper', 'june'];

/**
 * The end of a run (spec §16): the voyage, Ghana, and the game overs. Scene jumps (`?scene=voyage`, `ending`,
 * `gameover`) set up a finished run first; `tag` picks who sailed (e.g. `wren,june`), the cooperative shot
 * (`coop`), or the game over (`allLost`, `shipSailed`, `missed`).
 */
function registerFinaleScenes(game: Game): void {
  game.register('voyage', (g, p) => {
    const flow = flowOf(g);
    if (!flow.award) qaSailed(g, flow);
    return new VoyageScene(g, flow, (p?.aboard as MemberId[] | undefined) ?? flow.aboard);
  });
  game.register('ending', (g, p) => {
    const flow = flowOf(g);
    if (!flow.award) qaSailed(g, flow);
    const coop = p?.shot === 'coop' || (!p && tags(g).includes('coop'));
    return new GhanaScene(g, flow, coop ? 'coop' : 'quay');
  });
  game.register('gameover', (g, p) => {
    const flow = flowOf(g);
    const tag = tags(g);
    const kind =
      (p?.kind as GameOverKind | undefined) ??
      (tag.includes('shipSailed') ? 'sailed-without' : tag.includes('missed') ? 'missed' : 'lost');
    if (!flow.award) {
      // QA: a run that ended partway down the coast.
      jumpTo(flow, kind === 'lost' ? 6 : 9);
      if (kind === 'lost') {
        for (const m of flow.run.party) if (m.kind === 'android') m.status = 'lost';
      } else flow.run.day = 14;
      flow.finish(false);
    }
    return new GameOverScene(g, flow, kind);
  });
}

function tags(g: Game): string[] {
  return (g.config.tag ?? '').split(',').map((s) => s.trim());
}

/** QA: the Sankofa has sailed with the members named in `tag` (default: everyone, June included). */
function qaSailed(g: Game, flow: RunFlow): void {
  const named = PARTY_IDS.filter((id) => tags(g).includes(id));
  const aboard = named.some((id) => id !== 'june') ? named : PARTY_IDS;
  const run = flow.run;
  if (aboard.includes('june')) recruitJune(run.party, 60);
  jumpTo(flow, 10);
  run.day = 12;
  Object.assign(run.stats, { stops: 8, cellsGathered: 214, timesExposed: 2, playTimeMs: 4_140_000 });
  for (const m of run.party) {
    if (aboard.includes(m.id)) continue;
    if (m.kind === 'android') {
      m.status = 'lost';
      run.stats.unitsLost++;
      run.stats.lostLog.push({ member: m.id, where: 'Savannah', how: 'reclaimed' });
    }
  }
  run.stats.juneFate = aboard.includes('june') ? 'sailed' : 'never-met';
  flow.aboard = [...aboard];
  flow.finish(true);
}
