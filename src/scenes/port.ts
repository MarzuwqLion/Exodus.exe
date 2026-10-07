/**
 * The Port of Miami before dawn, in a thunderstorm (spec §11.5): the run's last stop. A StopScene over the
 * Port's simulation, dressed with the Sankofa at her berth, the gangway, the moving cover, and the dawn clock;
 * when it's over, who made it aboard decides the ending (RunFlow.portEnded).
 */
import { MEMBERS } from '../content/characters';
import type { Game } from '../game';
import { C } from '../render/palettes';
import { PortView } from '../render/portview';
import type { UiSurface } from '../ui/surface';
import type { RunFlow } from './runflow';
import { StopScene } from './stop';

export function portScene(game: Game, flow: RunFlow): StopScene {
  let view: PortView | null = null;
  const scene = new StopScene(game, {
    cfg: flow.stopConfig(),
    title: 'The Port of Miami · before dawn',
    onExit: (out) => flow.portEnded(out),
    onTick: (_s, dt) => flow.phone.update(dt),
    onFrame: (_s, dt) => view?.update(dt),
    onDrawUi: (s, ui) => {
      drawAboard(s, ui);
      flow.phone.draw(ui);
    },
  });
  view = new PortView(scene.sim, scene.lights);
  scene.scene.add(view.group);
  const v = view;
  scene.view.heightAt = (x, z) => v.heightAt(x, z);
  return scene;
}

/** Who's aboard so far, under the dawn clock. */
function drawAboard(s: StopScene, ui: UiSurface): void {
  const port = s.sim.port;
  if (!port || port.aboard.size === 0) return;
  const names = [...port.aboard].map((i) => MEMBERS[s.sim.members[i].id].name).join(', ');
  ui.text(`Aboard: ${names}`, Math.floor(ui.width / 2), port.gangwayT >= 0 ? 30 : 20, C.amber2, {
    align: 'center',
  });
}
