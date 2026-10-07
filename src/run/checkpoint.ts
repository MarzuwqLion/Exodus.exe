/**
 * Checkpoints (spec §11.1–11.4): the guard's interrogation and scan, headless. The guard asks each android
 * two questions (one fewer for the android June vouches for); timing matters as much as the answer; then
 * every android in the car is scanned (breathing). The guard's suspicion decides it: under 70 the car passes,
 * 70–99 costs 1 Papers or it's a bust, 100 is a bust.
 */
import { QUESTIONS } from '../content/questions';
import type { Question } from '../content/schema';
import { TUNING } from '../content/tuning';
import type { Rng } from '../core/rng';
import type { AndroidId, MemberId, RunState } from '../core/types';
import { activeJune } from './june';
import { activeAndroids } from './party';

export type AnswerKind = 'robotic' | 'human' | 'wrong' | 'soothing';

export interface AskedQuestion {
  member: AndroidId;
  question: Question;
  /** The answers in the order shown (soothing only for Wren, on some questions). */
  answers: AnswerKind[];
}

export interface CheckpointState {
  /** The guard's suspicion, 0–100 (the red meter). */
  suspicion: number;
  questions: AskedQuestion[];
  /** Index of the next question to answer. */
  next: number;
  /** June vouched for this android (one question fewer). */
  vouched: AndroidId | null;
  log: { member: AndroidId; question: string; answer: AnswerKind; seconds: number; delta: number }[];
}

/** The guard starts warier with Heat (+10 per level) and as the days go on (+2 per day past Day 7). */
export function startingSuspicion(heat: number, day: number): number {
  const E = TUNING.escalation;
  return Math.min(
    99,
    heat * TUNING.heat.checkpointPerLevel + Math.max(0, day - E.day7) * E.checkpointPerDayPast7,
  );
}

/**
 * Line up the interrogation: two questions per android in the car (never repeating a question), shuffled
 * answers. With June in the party she vouches for one android (by default the one with the lowest Integrity).
 */
export function startCheckpoint(run: RunState, rng: Rng, vouchFor?: AndroidId | null): CheckpointState {
  const C = TUNING.checkpoint;
  const androids = activeAndroids(run.party);
  const june = activeJune(run.party);
  let vouched: AndroidId | null = null;
  if (june && androids.length > 0) {
    vouched =
      vouchFor === undefined
        ? [...androids].sort((a, b) => a.integrity - b.integrity)[0].id
        : (vouchFor ?? null);
  }
  const pool = rng.shuffle([...QUESTIONS]);
  const questions: AskedQuestion[] = [];
  // Alternate between the androids, question by question (co-op alternates between players).
  for (let round = 0; round < C.questionsPerAndroid; round++) {
    for (const a of androids) {
      if (a.id === vouched && round === C.questionsPerAndroid - 1) continue;
      const q = pool.pop();
      if (!q) break;
      const answers: AnswerKind[] = rng.shuffle(['robotic', 'human', 'wrong']);
      if (a.id === 'wren' && q.soothing) answers.splice(rng.int(0, answers.length), 0, 'soothing');
      questions.push({ member: a.id, question: q, answers });
    }
  }
  return { suspicion: startingSuspicion(run.heat, run.day), questions, next: 0, vouched, log: [] };
}

/** What an answer does to the guard's suspicion, given how long it took (seconds after the answers appeared). */
export function answerDelta(kind: AnswerKind, seconds: number): number {
  const C = TUNING.checkpoint;
  let d =
    kind === 'robotic' ? C.robotic : kind === 'wrong' ? C.wrong : kind === 'soothing' ? C.soothing : C.human;
  if (seconds < C.tooFast) d += C.tooFastPenalty;
  else if (seconds > C.tooSlow) d += C.tooSlowPenalty;
  return d;
}

/** Answer the current question. Returns the change in suspicion. */
export function answerQuestion(s: CheckpointState, kind: AnswerKind, seconds: number): number {
  const q = s.questions[s.next];
  if (!q) return 0;
  const d = answerDelta(kind, seconds);
  s.suspicion = Math.max(0, Math.min(TUNING.checkpoint.bustAt, s.suspicion + d));
  s.log.push({ member: q.member, question: q.question.id, answer: kind, seconds, delta: d });
  s.next += 1;
  return d;
}

/** An AI member answers on its own: a human answer 70% of the time, at a human pace. */
export function aiAnswer(rng: Rng): { kind: AnswerKind; seconds: number } {
  const C = TUNING.checkpoint;
  const human = rng.chance(C.aiHumanChance);
  return { kind: human ? 'human' : 'robotic', seconds: rng.range(C.bestMin, C.bestMax) };
}

/** The scan: each android's breathing-scan meter adds to the guard's suspicion. */
export function applyScan(s: CheckpointState, meters: readonly number[]): void {
  const total = meters.reduce((a, b) => a + b, 0);
  s.suspicion = Math.max(0, Math.min(TUNING.checkpoint.bustAt, s.suspicion + total));
}

export type CheckpointResult = 'pass' | 'papers' | 'bust';

/** Under 70: pass. 70–99: Papers make it go away (or bust without them). 100: bust. */
export function checkpointResult(suspicion: number): CheckpointResult {
  const C = TUNING.checkpoint;
  if (suspicion < C.passBelow) return 'pass';
  if (suspicion < C.bustAt) return 'papers';
  return 'bust';
}

/** A bust costs +1 Heat and 10 Hull from every android (spec §11.4); the compound stop follows. */
export function applyBustCost(run: RunState): void {
  const C = TUNING.checkpoint;
  run.heat = Math.min(TUNING.heat.max, run.heat + C.bustHeat);
  run.stats.busts += 1;
  for (const a of activeAndroids(run.party)) a.hull = Math.max(0, a.hull - C.bustHull);
}

/** Who answers a question: a player if they control that android, otherwise the party AI. */
export function answeredBy(run: RunState, member: MemberId): 0 | 1 | null {
  if (run.control[0] === member) return 0;
  if (run.control[1] === member) return 1;
  return null;
}
