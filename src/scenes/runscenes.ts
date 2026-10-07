/**
 * Run scene factories: stops, Stations, compromised Stations, and checkpoint busts inside a run (their
 * outcomes go back to the run flow). The Port is in port.ts.
 */
import type { Game } from '../game';
import { activeJune, juneLeavesAtStation } from '../run/june';
import { addRumor, currentNode, upcoming } from '../run/map';
import { withRng } from '../run/run';
import { keeperForColumn } from '../run/station';
import type { RunFlow } from './runflow';
import type { GameScene } from './scene';
import { compromisedScene, stationScene } from './station';
import { StopScene } from './stop';
import { TYPE_NAMES } from './map';

/** A stop in a run (or a compromised Station, or the compound after a checkpoint bust). */
export function runStopScene(
  game: Game,
  flow: RunFlow,
  o: { compromised?: boolean; bust?: boolean },
): GameScene {
  const node = currentNode(flow.run.map);
  const cfg = flow.stopConfig(o);
  const onExit = (out: Parameters<RunFlow['stopEnded']>[0]): void => flow.stopEnded(out);
  if (o.compromised) return compromisedScene(game, cfg, onExit);
  const title = o.bust ? 'Checkpoint' : `${TYPE_NAMES[node.type]} · ${node.name}`;
  return new StopScene(game, {
    cfg,
    title,
    onExit,
    onDrawUi: (_s, ui) => flow.phone.draw(ui),
    onTick: (_s, dt) => flow.phone.update(dt),
  });
}

/** A Station in a run: the keeper's care and trades, then camp in the keeper's light. */
export function runStationScene(game: Game, flow: RunFlow): GameScene {
  const run = flow.run;
  flow.tip('first-station');
  const node = currentNode(run.map);
  const keeper = keeperForColumn(node.column)!;
  return stationScene(game, {
    cfg: flow.stopConfig(),
    keeper,
    onExit: (out) => {
      // Rumors for the next two columns (spec §10.5).
      withRng(run, (rng) => {
        for (const n of upcoming(run.map, 2)) {
          if (n.type === 'depot' || n.type === 'diner' || n.type === 'gas')
            addRumor(
              run.rumors,
              rng.pick(['cells-cache', 'recycler-activity', 'sympathetic-staff', 'patrols'] as const),
              n,
            );
        }
      });
      const hadJune = !!activeJune(out.party);
      flow.stopEnded(out, true);
      // Low Trust: June may say a quiet goodbye here.
      if (hadJune && withRng(run, (rng) => juneLeavesAtStation(run.party, rng)))
        run.stats.juneFate = 'went-home';
    },
  });
}

export { TYPE_NAMES };
