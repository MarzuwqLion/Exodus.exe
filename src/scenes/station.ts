/**
 * Stations (spec §10.5). The keeper greets the party when they come in; then the Station panel (what the
 * keeper fixed, what else the Station gives, two trades) opens over the room. "Rest here" ends the scene and
 * the camp panel follows (§12.5). "Look around first" lets the party walk the room; talking to the keeper
 * brings the panel back. Near the keeper's personal detail, a caption describes it.
 *
 * A compromised Station is a short stop instead: Lantern warns on arrival, a Recycler van is parked outside,
 * and the party grabs the keeper's supply bag from the back room and leaves quietly.
 */
import { MEMBERS } from '../content/characters';
import { STATION_KEEPERS } from '../content/conversations';
import { LANTERN_MESSAGES } from '../content/lantern';
import type { Line, StationKeeper, StationInterior } from '../content/schema';
import type { Game } from '../game';
import { C } from '../render/palettes';
import { stationCare, stationPerks, type StationTrade } from '../run/station';
import { F } from '../sim/grid';
import type { StopConfig } from '../sim/stop';
import type { StopOutcome } from '../sim/types';
import { Dialogue, type DialogueLine } from '../ui/dialogue';
import { LanternPhone } from '../ui/phone';
import { StationPanel } from '../ui/station';
import { StopScene, type StopModal } from './stop';

export interface StationParams {
  cfg: StopConfig;
  keeper: StationKeeper;
  onExit?: (outcome: StopOutcome, game: Game) => void;
}

/** A keeper for an interior (scene jumps): the seed picks among the keepers who live there. */
export function keeperForInterior(interior: StationInterior, seed: number): StationKeeper {
  const list = STATION_KEEPERS.filter((k) => k.interior === interior);
  return list[Math.abs(seed) % list.length] ?? STATION_KEEPERS[0];
}

function dialogueLines(keeper: StationKeeper, lines: readonly Line[]): DialogueLine[] {
  return lines.map((l) => {
    if (l.speaker === 'keeper') return { speaker: keeper.name, text: l.text, color: C.amber2 };
    if (l.speaker === 'lantern') return { speaker: 'Lantern', text: l.text, color: C.amber2 };
    if (l.speaker === 'direction' || l.speaker === 'mensah')
      return { speaker: '', text: l.text, color: C.fog1 };
    return { speaker: MEMBERS[l.speaker].name, text: l.text, color: C.fog1 };
  });
}

class Talk implements StopModal {
  private d: Dialogue;
  constructor(
    lines: DialogueLine[],
    private readonly game: Game,
    readonly then: () => StopModal | null,
  ) {
    this.d = new Dialogue(lines);
  }

  update(dt: number, intents: Parameters<StopModal['update']>[1]): boolean {
    return this.d.update(dt, intents);
  }

  draw(ui: Parameters<StopModal['draw']>[0]): void {
    this.d.draw(ui, this.game.input.glyphDevice(0, this.game.save.settings.glyphStyle));
  }
}

export function stationScene(game: Game, p: StationParams): StopScene {
  const { keeper } = p;
  const phone = new LanternPhone();
  const used = new Set<StationTrade>();
  let talked = false;
  let care: string[] | null = null;
  let scene: StopScene | null = null;

  const panel = (): StopModal => {
    const sim = scene!.sim;
    // The keeper looks after everyone once, the first time the panel opens.
    care ??= stationCare(sim.members.map((m) => m.state));
    const view = new StationPanel({
      title: `${keeper.name} · ${keeper.place}`,
      care,
      perks: stationPerks(sim.members.map((m) => m.state)),
      resources: sim.resources,
      used,
      onRest: () => sim.finish('rested', []),
      onLook: () => {},
    });
    return { update: (dt, its) => view.update(dt, its), draw: (ui) => view.draw(ui) };
  };

  scene = new StopScene(game, {
    cfg: p.cfg,
    title: `Station · ${keeper.place}`,
    onExit: p.onExit,
    onTick: (s, dt) => {
      phone.update(dt);
      const sim = s.sim;
      // The keeper greets the party the moment a player steps inside.
      const inside = sim.members.some(
        (m) => m.controller !== null && sim.present(m) && sim.grid.flagAt(m.x, m.y, F.INTERIOR),
      );
      const asked = sim.events.some((e) => e.t === 'talk');
      if (!talked && (inside || asked)) {
        talked = true;
        s.modal = new Talk(dialogueLines(keeper, keeper.lines), game, panel);
      } else if (asked) s.modal = panel();
    },
    onDrawUi: (s, ui) => {
      phone.draw(ui);
      const sim = s.sim;
      const spot = sim.layout.waypoints.get('detail');
      if (!spot || s.modal) return;
      const near = sim.members.some(
        (m) => m.controller !== null && sim.present(m) && Math.hypot(m.x - spot.x, m.y - spot.y) < 2,
      );
      if (near) {
        const w = Math.min(360, ui.width - 40);
        const lines = ui.wrap(keeper.detail, w);
        const y = ui.height - 30 - lines.length * ui.lineHeight;
        ui.paragraph(keeper.detail, Math.floor((ui.width - w) / 2), y, w, C.fog1);
      }
    },
  });
  return scene;
}

/** A compromised Station: a short stop with Lantern's warning on arrival. */
export function compromisedScene(
  game: Game,
  cfg: StopConfig,
  onExit?: (outcome: StopOutcome, game: Game) => void,
): StopScene {
  const phone = new LanternPhone();
  const warning = LANTERN_MESSAGES.find((m) => m.id === 'compromised');
  if (warning) phone.push(warning.text);
  return new StopScene(game, {
    cfg,
    title: 'Station',
    onExit,
    onTick: (_s, dt) => phone.update(dt),
    onDrawUi: (_s, ui) => phone.draw(ui),
  });
}
