/**
 * Breathing scan (spec §11.3): a pulse ring expands about once every 1.2 s, slightly irregularly. Pressing A
 * as the ring reaches the marker "breathes". A press within ±220 ms of the beat counts; a missed breath adds
 * +12. The center of the window has a ±35 ms notch: hitting it 3 times in a row flags "too regular" (+15).
 * Visible chassis adds a constant upward drift; low Integrity adds glitch beats where the ring stutters.
 *
 * Pure and time-driven so the checkpoint, routine sweeps, and the Port gate share it, and bots can play it.
 */
import { TUNING } from '../content/tuning';
import type { Rng } from '../core/rng';

export interface BreathScan {
  duration: number;
  t: number;
  /** Upcoming beat times (seconds from scan start). */
  beats: number[];
  /** Index of the next beat that hasn't been resolved. */
  next: number;
  /** Suspicion added by this scan so far. */
  meter: number;
  /** Consecutive notch hits. */
  streak: number;
  hits: number;
  misses: number;
  notches: number;
  /** Beats where the ring stutters (glitch beats from low Integrity). */
  glitchBeats: Set<number>;
  /** Visible-chassis drift per second. */
  drift: number;
  done: boolean;
  /** Last result for UI feedback. */
  last: 'none' | 'breath' | 'notch' | 'miss' | 'early' | 'regular';
  lastT: number;
  /** The scan has shown its one-line tip. */
  tooRegularFlagged: number;
}

export function newScan(rng: Rng, opts: { short?: boolean; skin01: number; integrity: number }): BreathScan {
  const b = TUNING.breathing;
  const duration = opts.short ? b.shortScanSeconds : rng.range(b.scanSeconds[0], b.scanSeconds[1]);
  const beats: number[] = [];
  let t = 0.9;
  while (t < duration - 0.2) {
    beats.push(t);
    t += b.beatInterval + rng.range(-b.beatJitter, b.beatJitter);
  }
  const glitchBeats = new Set<number>();
  if (opts.integrity < b.glitchBeatIntegrity) {
    const chance = (b.glitchBeatIntegrity - opts.integrity) / b.glitchBeatIntegrity;
    beats.forEach((_, i) => {
      if (i > 0 && rng.chance(chance * 0.5)) glitchBeats.add(i);
    });
  }
  return {
    duration,
    t: 0,
    beats,
    next: 0,
    meter: 0,
    streak: 0,
    hits: 0,
    misses: 0,
    notches: 0,
    glitchBeats,
    drift: b.chassisDriftPerSecond * (1 - Math.max(0, Math.min(1, opts.skin01))),
    done: false,
    last: 'none',
    lastT: -10,
    tooRegularFlagged: 0,
  };
}

/** Advance time; beats whose window has fully passed without a press count as misses. */
export function stepScan(s: BreathScan, dt: number): void {
  if (s.done) return;
  s.t += dt;
  s.meter += s.drift * dt;
  const w = TUNING.breathing.windowMs / 1000;
  while (s.next < s.beats.length && s.t > s.beats[s.next] + w) {
    s.misses++;
    s.meter += TUNING.breathing.missPenalty;
    s.streak = 0;
    s.last = 'miss';
    s.lastT = s.t;
    s.next++;
  }
  if (s.t >= s.duration) s.done = true;
}

/** A press of A at the current time. */
export function pressScan(s: BreathScan): void {
  if (s.done) return;
  const b = TUNING.breathing;
  const w = b.windowMs / 1000;
  const notch = b.notchMs / 1000;
  if (s.next >= s.beats.length) return;
  const beat = s.beats[s.next];
  const off = s.t - beat;
  if (Math.abs(off) <= w) {
    s.hits++;
    s.next++;
    if (Math.abs(off) <= notch) {
      s.notches++;
      s.streak++;
      s.last = 'notch';
      if (s.streak >= b.tooRegularStreak) {
        s.meter += b.tooRegularPenalty;
        s.streak = 0;
        s.tooRegularFlagged++;
        s.last = 'regular';
      }
    } else {
      s.streak = 0;
      s.last = 'breath';
    }
    s.lastT = s.t;
  } else if (off < -w && off > -w * 2.5) {
    // Early press near a beat: it doesn't count, and the beat may still be missed.
    s.last = 'early';
    s.lastT = s.t;
  }
}

/** Ring radius 0..1 for rendering: grows toward the marker as the next beat approaches. */
export function ringPhase(s: BreathScan): number {
  if (s.next >= s.beats.length) return 0;
  const beat = s.beats[s.next];
  const prev = s.next > 0 ? s.beats[s.next - 1] : 0;
  let k = (s.t - prev) / Math.max(0.1, beat - prev);
  if (s.glitchBeats.has(s.next)) {
    // Stutter: the ring jumps back and forth.
    const st = Math.floor(s.t * 14) % 3;
    k += st === 0 ? -0.12 : st === 1 ? 0.08 : 0;
  }
  return Math.max(0, Math.min(1.2, k));
}

/** Seconds until the next beat (negative once it passed but its window is still open). */
export function timeToBeat(s: BreathScan): number {
  if (s.next >= s.beats.length) return Infinity;
  return s.beats[s.next] - s.t;
}
