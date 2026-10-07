/**
 * Checkpoint bots (spec §17.2): a human answerer (human answers at 1.5–4 s, breathing within ±100 ms but
 * never on the center notch) and a robotic answerer (instant robotic answers, perfect breathing). Players'
 * androids follow the policy; the party AI answers and breathes for the rest, as in the game.
 */
import { TUNING } from '../content/tuning';
import { Rng, hashSeed } from '../core/rng';
import type { AndroidId, AndroidState, MemberId, RunState, Slot } from '../core/types';
import { newScan, pressScan, stepScan } from '../sim/breathing';
import {
  aiAnswer,
  answerQuestion,
  applyScan,
  checkpointResult,
  startCheckpoint,
  type CheckpointResult,
} from '../run/checkpoint';
import { activeAndroids } from '../run/party';

export type CheckpointPolicy = 'human' | 'robotic';

/** Play one breathing scan; returns its meter. `press` gives the press time for a beat (or null to skip). */
export function playScan(
  rng: Rng,
  a: AndroidState,
  press: (beat: number, rng: Rng) => number | null,
  short = false,
): number {
  const s = newScan(rng, { short, skin01: a.skin / 100, integrity: a.integrity });
  const dt = 1 / 60;
  let planned = -1;
  let at = Infinity;
  while (!s.done) {
    if (s.next < s.beats.length && planned !== s.next) {
      planned = s.next;
      at = press(s.beats[s.next], rng) ?? Infinity;
    }
    if (s.t >= at) {
      pressScan(s);
      at = Infinity;
    }
    stepScan(s, dt);
  }
  return s.meter;
}

/** Off-center human timing: 50–100 ms early or late. */
export function humanBreath(beat: number, rng: Rng): number {
  return beat + rng.range(0.05, 0.1) * rng.sign();
}

/** Perfect timing: dead on the beat (the notch). */
export function perfectBreath(beat: number): number {
  return beat;
}

/** The party AI's best effort (as in the stop sim): mostly fine, sometimes late. */
export function aiBreath(a: AndroidState): (beat: number, rng: Rng) => number {
  const skill = 0.6 + a.integrity / 250;
  return (beat, rng) =>
    rng.chance(TUNING.breathing.aiBreathSuccess * skill)
      ? beat + rng.range(0.06, 0.16) * rng.sign()
      : beat + rng.range(0.3, 0.5);
}

export interface CheckpointRun {
  result: CheckpointResult;
  suspicion: number;
  afterQuestions: number;
}

/** Run a whole checkpoint for the party in `run` under a policy for the players' androids. */
export function runCheckpointBots(run: RunState, policy: CheckpointPolicy, seed: number): CheckpointRun {
  const rng = new Rng(hashSeed('checkpoint-bot', seed));
  const s = startCheckpoint(run, rng);
  const player = (id: MemberId): boolean => run.control[0] === id || run.control[1] === id;
  while (s.next < s.questions.length) {
    const q = s.questions[s.next];
    if (player(q.member)) {
      if (policy === 'human')
        answerQuestion(s, 'human', rng.range(TUNING.checkpoint.bestMin, TUNING.checkpoint.bestMax));
      else answerQuestion(s, 'robotic', rng.range(0.15, 0.35));
    } else {
      const ai = aiAnswer(rng);
      answerQuestion(s, ai.kind, ai.seconds);
    }
  }
  const afterQuestions = s.suspicion;
  const meters = activeAndroids(run.party).map((a) =>
    playScan(rng, a, player(a.id) ? (policy === 'human' ? humanBreath : perfectBreath) : aiBreath(a)),
  );
  applyScan(s, meters);
  return { result: checkpointResult(s.suspicion), suspicion: s.suspicion, afterQuestions };
}

/** Control for a solo or two-player party (Wren for player 1, Brick for player 2). */
export function controlFor(players: 1 | 2): Record<Slot, MemberId | null> {
  return { 0: 'wren' as AndroidId, 1: players === 2 ? ('brick' as AndroidId) : null };
}
