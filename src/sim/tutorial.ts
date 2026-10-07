/**
 * Night one (spec §12.9): the tutorial's director, inside the simulation so it stays headless and testable.
 * Each step completes the moment the player does the thing; the director scripts what the lesson needs:
 *
 *   walk    — move about 8 m (the first robotic-movement flag gets its own one-line explanation)
 *   blend   — a customer turns Curious; Blend (or Chat)
 *   search  — a public shelf, then the back-office locker while the clerk takes a scripted smoke break
 *   charge  — plug in at a bay (the tutorial grants a Papers) and Blend while it charges
 *   chat    — with a second player only: Chat
 *   leave   — the first drone comes early (at 75 s, or now if later) and the party goes back to the car
 *
 * It reports steps as 'tutorial' events for the scene to show Lantern's lines. A restart (after an ALERT)
 * builds a fresh stop that starts from the last completed step.
 */
import { TUNING } from '../content/tuning';
import { dist } from '../core/math';
import type { StopSim } from './stop';

export type TutorialStep = 'walk' | 'blend' | 'search' | 'charge' | 'chat' | 'leave' | 'done';

export const TUTORIAL_ORDER: readonly TutorialStep[] = ['walk', 'blend', 'search', 'charge', 'chat', 'leave'];

/** How far to walk before the first lesson is learned. */
const TUTORIAL_WALK_METERS = 8;

export interface TutorialState {
  step: TutorialStep;
  /** The last step finished (where a restart picks up). */
  completed: TutorialStep | null;
  walked: number;
  lastX: number;
  lastY: number;
  /** Counters at the start of the step (the sim's tutorial log keeps running totals). */
  base: {
    blended: number;
    chatted: number;
    searchedPublic: number;
    searchedPrivate: number;
    plugged: number;
  };
  smokeForced: boolean;
  chargeBlend: boolean;
  roboticSaid: boolean;
  started: boolean;
}

export function newTutorial(from: TutorialStep = 'walk'): TutorialState {
  return {
    step: from,
    completed: null,
    walked: 0,
    lastX: NaN,
    lastY: NaN,
    base: { blended: 0, chatted: 0, searchedPublic: 0, searchedPrivate: 0, plugged: 0 },
    smokeForced: false,
    chargeBlend: false,
    roboticSaid: false,
    started: false,
  };
}

function begin(sim: StopSim, t: TutorialState, step: TutorialStep): void {
  t.step = step;
  t.base = { ...sim.tutorialLog };
  sim.emit({ t: 'tutorial', step });
  if (step === 'blend') {
    // Someone notices: the nearest customer turns Curious about player 1.
    const m = sim.controlled(0);
    let best = null as (typeof sim.npcs)[number] | null;
    let bd = Infinity;
    for (const n of sim.npcs) {
      if (n.role !== 'customer' || !sim.isActiveNpc(n) || !m) continue;
      const d = dist(n, m);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (best && m) {
      best.obs.awareness[m.id] = Math.max(best.obs.awareness[m.id] ?? 0, TUNING.awareness.curious + 8);
      best.lookAt = { x: m.x, y: m.y };
      best.lookT = 2;
    }
  }
  if (step === 'leave') {
    // The patrol clock's first pip fills early: a drone comes.
    sim.patrol.drone1 = Math.min(sim.patrol.drone1, Math.max(TUNING.patrol.tutorialDrone, sim.time + 2));
  }
}

function advance(sim: StopSim, t: TutorialState): void {
  t.completed = t.step;
  const i = TUTORIAL_ORDER.indexOf(t.step);
  let next: TutorialStep = TUTORIAL_ORDER[i + 1] ?? 'done';
  // Chat needs a second player.
  if (next === 'chat' && sim.control[1] === null) next = 'leave';
  if (next === 'done') t.step = 'done';
  else begin(sim, t, next);
}

export function updateTutorial(sim: StopSim, t: TutorialState): void {
  if (t.step === 'done' || sim.outcome) return;
  if (!t.started) {
    t.started = true;
    begin(sim, t, t.step);
  }
  const m = sim.controlled(0);
  const log = sim.tutorialLog;
  if (!t.roboticSaid && log.roboticFired > 0) {
    t.roboticSaid = true;
    sim.emit({ t: 'tutorial', step: 'robotic' });
  }
  switch (t.step) {
    case 'walk': {
      if (m) {
        if (!Number.isNaN(t.lastX)) t.walked += Math.hypot(m.x - t.lastX, m.y - t.lastY);
        t.lastX = m.x;
        t.lastY = m.y;
      }
      if (t.walked >= TUTORIAL_WALK_METERS) advance(sim, t);
      return;
    }
    case 'blend':
      if (log.blended > t.base.blended || log.chatted > t.base.chatted) advance(sim, t);
      return;
    case 'search': {
      const pub = log.searchedPublic > t.base.searchedPublic;
      // Once a shelf is done, the clerk goes out for a smoke: the back office is unwatched.
      if (pub && !t.smokeForced) {
        const clerk = sim.npcs.find((n) => n.role === 'clerk' && sim.isActiveNpc(n));
        if (!clerk || clerk.step >= 1) t.smokeForced = true;
        else if (clerk.mode === 'routine') {
          clerk.stepT = Infinity;
          t.smokeForced = true;
        }
      }
      if (pub && log.searchedPrivate > t.base.searchedPrivate) advance(sim, t);
      return;
    }
    case 'charge':
      if (m && m.plug && m.mode === 'blend') t.chargeBlend = true;
      if (log.plugged > t.base.plugged && t.chargeBlend) advance(sim, t);
      return;
    case 'chat':
      if (log.chatted > t.base.chatted) advance(sim, t);
      return;
    case 'leave':
      // Done when the car leaves (the stop's own exit).
      return;
  }
}
