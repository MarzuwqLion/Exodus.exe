/**
 * Night one (spec §12.9): the first stop of a new player's first run, a Boston charging depot in the snow the
 * night the party leaves. The simulation's tutorial director (sim/tutorial.ts) runs the steps; this scene
 * shows Lantern's lines on the phone and the step's prompt, restarts from the last completed step after an
 * ALERT ("That's how it goes wrong. Try again."), and hands the finished stop to the run like any other.
 */
import { layoutFor } from '../content/layouts';
import { TUTORIAL_LINES } from '../content/lantern';
import { hashSeed } from '../core/rng';
import type { Game } from '../game';
import { C } from '../render/palettes';
import { TUTORIAL_ORDER, type TutorialStep } from '../sim/tutorial';
import type { StopConfig } from '../sim/stop';
import type { UiSurface } from '../ui/surface';
import type { RunFlow } from './runflow';
import { StopScene } from './stop';

/** Seconds after an ALERT before the tutorial picks up again. */
const RETRY_AFTER = 3.5;

function lineFor(step: string): { text: string; prompt: string } | null {
  return TUTORIAL_LINES.find((l) => l.step === step) ?? null;
}

export function tutorialConfig(flow: RunFlow, from: TutorialStep): StopConfig {
  const run = flow.run;
  return {
    layout: layoutFor('depot', 0),
    seed: hashSeed('tutorial', run.seed),
    region: 'newengland',
    weather: 'snow',
    heat: 0,
    day: run.day,
    party: run.party.map((m) => ({ ...m })),
    control: { ...run.control },
    // The tutorial grants one Papers for the charging lesson.
    resources: { ...run.resources, papers: run.resources.papers + 1 },
    tutorial: true,
    tutorialFrom: from,
    patrolTimes: { drone1: Infinity, sweep: Infinity, drone2: Infinity },
  };
}

export function tutorialScene(game: Game, flow: RunFlow, from: TutorialStep = 'walk'): StopScene {
  let prompt: string | null = null;
  let retryT = -1;
  const scene = new StopScene(game, {
    cfg: tutorialConfig(flow, from),
    title: 'Boston · the night you leave',
    onExit: (out) => {
      game.save.meta.tutorialDone = true;
      game.persist();
      flow.tutorialPending = false;
      flow.stopEnded(out);
    },
    onTick: (s, dt) => {
      flow.phone.update(dt);
      for (const e of s.sim.events) {
        if (e.t === 'tutorial') {
          const l = lineFor(e.step);
          if (l) {
            flow.phone.push(l.text);
            if (e.step !== 'robotic') prompt = l.prompt;
          }
        } else if (e.t === 'alert' && retryT < 0) {
          const l = lineFor('retry');
          if (l) flow.phone.push(l.text);
          retryT = RETRY_AFTER;
        }
      }
      if (retryT >= 0) {
        retryT -= dt;
        if (retryT < 0) {
          // Pick up from the last completed step on a fresh stop.
          const done = s.sim.tutorial?.completed ?? null;
          let next: TutorialStep = done
            ? (TUTORIAL_ORDER[TUTORIAL_ORDER.indexOf(done) + 1] ?? 'leave')
            : 'walk';
          if (next === 'chat' && s.sim.control[1] === null) next = 'leave';
          game.goto('tutorial', { from: next });
        }
      }
    },
    onDrawUi: (_s, ui: UiSurface) => {
      if (prompt && retryT < 0)
        ui.text(prompt, Math.floor(ui.width / 2), ui.height - 34, C.slate1, { align: 'center' });
      flow.phone.draw(ui);
    },
  });
  return scene;
}
