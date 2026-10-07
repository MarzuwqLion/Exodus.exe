/**
 * Run scene factories: stops, Stations, compromised Stations, and checkpoint busts inside a run (their
 * outcomes go back to the run flow), the Port, and the ending screen.
 */
import * as THREE from 'three';
import { GAME_OVER_TEXT, GHANA_LINES } from '../content/conversations';
import { REGION_NAMES } from '../content/regions';
import { TUNING } from '../content/tuning';
import type { Game } from '../game';
import { CameraRig } from '../render/camera';
import { C } from '../render/palettes';
import { activeJune, juneLeavesAtStation } from '../run/june';
import { addRumor, currentNode, upcoming } from '../run/map';
import { activeAndroids } from '../run/party';
import { withRng } from '../run/run';
import { keeperForColumn } from '../run/station';
import type { UiSurface } from '../ui/surface';
import type { RunEnding, RunFlow } from './runflow';
import type { GameScene, WorldView } from './scene';
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

/**
 * The Port (spec §11.5) until its scene lands in M6: the dawn crossing resolves from the run's state the way
 * the economy simulator models it (Papers at the gate, Mensah's part, Heat).
 */
export class PortPlaceholder implements GameScene {
  readonly id = 'port';
  private t = 0;
  private result: RunEnding | null = null;

  constructor(
    private readonly game: Game,
    private readonly flow: RunFlow,
  ) {}

  enter(): void {
    this.game.audio.setMusic('scene');
  }

  exit(): void {}

  allowJoin(): boolean {
    return false;
  }

  pausable(): boolean {
    return false;
  }

  tick(dt: number): void {
    this.t += dt;
    if (this.t > 3 && !this.result) {
      const run = this.flow.run;
      const n = activeAndroids(run.party).length;
      const papers = Math.min(run.resources.papers, n);
      const mensah = run.flags.includes('mensah-part') && run.resources.parts >= TUNING.port.mensahParts;
      const p = 0.5 + 0.1 * papers + (mensah ? 0.08 : 0) - 0.12 * run.heat;
      this.result = withRng(run, (rng) => rng.chance(Math.max(0.05, Math.min(0.95, p))))
        ? 'ghana'
        : 'sailed-without';
      this.flow.end(this.result);
    }
  }

  frame(): void {}

  world(): WorldView | null {
    return null;
  }

  drawUi(ui: UiSurface): void {
    ui.text('The Port of Miami, before dawn.', ui.width / 2, ui.height / 2 - 10, C.fog1, { align: 'center' });
    ui.text(REGION_NAMES.lowcountry, ui.width / 2, ui.height / 2 + 6, C.slate1, { align: 'center' });
  }
}

/** The end of a run: Ghana, or a game over (spec §16.2–16.3). Any button returns to the title. */
export class EndingScene implements GameScene {
  readonly id = 'ending';
  private t = 0;
  private scene = new THREE.Scene();
  private rig = new CameraRig();

  constructor(
    private readonly game: Game,
    private readonly kind: RunEnding,
  ) {}

  enter(): void {
    this.game.audio.setMusic(this.kind === 'ghana' ? 'epilogue' : 'gameover');
  }

  exit(): void {}

  allowJoin(): boolean {
    return false;
  }

  pausable(): boolean {
    return false;
  }

  tick(dt: number): void {
    this.t += dt;
    const its = [this.game.intents[0], this.game.intents[1]];
    if (this.t > 2 && its.some((it) => it?.confirm)) {
      this.game.flow = null;
      this.game.goto('title');
    }
  }

  frame(): void {}

  world(): WorldView | null {
    void this.scene;
    void this.rig;
    return null;
  }

  drawUi(ui: UiSurface): void {
    const lines: string[] =
      this.kind === 'ghana'
        ? GHANA_LINES
        : this.kind === 'lost'
          ? [GAME_OVER_TEXT.allLost.title, GAME_OVER_TEXT.allLost.body]
          : [GAME_OVER_TEXT.shipSailed.title, GAME_OVER_TEXT.shipSailed.body];
    lines.forEach((l, i) => {
      const shown = Math.max(0, Math.min(l.length, (this.t - i * 1.2) * 40));
      if (shown > 0) ui.paragraph(l, 60, 120 + i * 24, ui.width - 120, i === 0 ? C.fog2 : C.fog1, shown);
    });
  }
}

export { TYPE_NAMES };
