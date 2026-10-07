/**
 * Generative music (spec §14.2):
 * - title, scene, camp, gameover: dark ambient pads (slow, detuned oscillators through a low-pass
 *   and a long reverb), minor or modal, chords changing every 8–20 s;
 * - station: a softer, warmer pad (major sevenths, brighter, a few soft electric-piano notes);
 * - epilogue: the first warm, major-key music in the game, a simple bright plucked melody
 *   (Karplus-Strong) over a soft pad;
 * - a pulsing tension layer whose level follows `setTension`, and a driving percussion layer for
 *   ALERT and the Port gangway timer. Both sit on one beat grid and follow the pad's harmony.
 *
 * Everything is scheduled ahead on the AudioContext clock by `schedule(now, until)`, which the
 * engine calls every frame (and from a slow timer when frames stop). Each track runs on a small
 * seeded generator: a Markov chain over chords with varying lengths and voicings, so it never
 * settles into a short loop, yet plays the same way from the same seed.
 */
import type { MusicTrack } from './cues';
import {
  type Kit,
  Voice,
  ad,
  ahr,
  burst,
  chain,
  clamp,
  glide,
  midiHz,
  mulberry32,
  partials,
  rampParam,
} from './synth';

// ---------------------------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------------------------

export { mulberry32 };

export type Rng = () => number;

/** FNV-1a string hash, for per-track seeds. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function rpick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

function rrange(rng: Rng, a: number, b: number): number {
  return a + (b - a) * rng();
}

type Next = readonly (readonly [index: number, weight: number])[];

function weighted(rng: Rng, options: Next): number {
  let total = 0;
  for (const [, w] of options) total += w;
  let x = rng() * total;
  for (const [i, w] of options) {
    x -= w;
    if (x <= 0) return i;
  }
  return options[options.length - 1][0];
}

/** Moves a MIDI note by octaves into [lo, hi] (the range must span at least an octave). */
function fold(m: number, lo: number, hi: number): number {
  let x = m;
  while (x < lo) x += 12;
  while (x > hi) x -= 12;
  return x;
}

function mean(xs: readonly number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return xs.length > 0 ? s / xs.length : 0;
}

/**
 * Places chord tones inside [lo, hi], keeping the authored spacing but choosing the inversion and
 * octave whose centre is closest to `center` (smooth voice leading), avoiding low semitone mud.
 */
function voiceChord(tones: readonly number[], lo: number, hi: number, center: number, rng: Rng): number[] {
  let cur = [...tones].sort((a, b) => a - b);
  let best: number[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let inv = 0; inv < cur.length; inv++) {
    for (let oct = -3; oct <= 3; oct++) {
      const cand = cur.map((m) => m + oct * 12);
      if (cand[0] < lo || cand[cand.length - 1] > hi) continue;
      let score = Math.abs(mean(cand) - center) + rng() * 1.5;
      for (let k = 1; k < cand.length; k++) if (cand[k] - cand[k - 1] < 2 && cand[k] < 62) score += 4;
      if (score < bestScore) {
        bestScore = score;
        best = cand;
      }
    }
    cur = [...cur.slice(1), cur[0] + 12];
  }
  return best ?? tones.map((m) => fold(m, lo, hi)).sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------------------------
// Pad styles
// ---------------------------------------------------------------------------------------------

interface ChordDef {
  /** Semitones above the tonic, in the authored voicing. */
  readonly iv: readonly number[];
  /** Bass root (semitones above the tonic) when it isn't the lowest tone. */
  readonly root?: number;
  /** Weighted next chords (indices into the same table). */
  readonly next: Next;
}

interface PadStyle {
  /** MIDI note of the key's tonic in the pad register. */
  readonly tonic: number;
  readonly chords: readonly ChordDef[];
  /** Chord lengths to choose from (seconds). */
  readonly durs: readonly number[];
  /** Voicing range (MIDI). */
  readonly lo: number;
  readonly hi: number;
  /** Oscillators per note: wave and relative level. */
  readonly waves: readonly (readonly [OscillatorType, number])[];
  /** Detune spread between a note's oscillators (cents). */
  readonly spread: number;
  /** Per-note level. */
  readonly level: number;
  /** Pad low-pass cutoff (Hz) and its slow LFO (rate in Hz, depth as a fraction of the cutoff). */
  readonly cutoff: number;
  readonly lfoRate: number;
  readonly lfoDepth: number;
  /** Bass note level (0 = none). */
  readonly bass: number;
  /** Tonic pedal drone level (0 = none). */
  readonly pedal: number;
  /** Seconds between sparse high "glint" notes, or null. */
  readonly glint: readonly [number, number] | null;
  readonly glintLevel: number;
  /** Seconds between soft electric-piano notes, or null. */
  readonly keys: readonly [number, number] | null;
  readonly keysLevel: number;
  /** Reverb send. */
  readonly wet: number;
}

/** D minor (Aeolian): i, bVImaj7, iv7, bVII, bIIImaj7, v7. */
const TITLE_CHORDS: readonly ChordDef[] = [
  {
    iv: [0, 3, 7, 14],
    next: [
      [1, 3],
      [2, 2],
      [3, 1],
      [4, 1],
      [5, 1],
    ],
  },
  {
    iv: [8, 12, 15, 19],
    next: [
      [3, 2],
      [2, 2],
      [0, 2],
      [4, 1],
    ],
  },
  {
    iv: [5, 8, 12, 15],
    next: [
      [0, 3],
      [1, 2],
      [5, 1],
    ],
  },
  {
    iv: [10, 14, 17],
    next: [
      [0, 3],
      [1, 1],
      [4, 1],
    ],
  },
  {
    iv: [3, 7, 10, 14],
    next: [
      [1, 2],
      [2, 2],
      [3, 1],
    ],
  },
  {
    iv: [7, 10, 14, 17],
    next: [
      [0, 3],
      [1, 2],
    ],
  },
];

/** E, Phrygian-tinged and mostly static: i (open), isus, bII, iv, bVImaj7, bVII. */
const SCENE_CHORDS: readonly ChordDef[] = [
  {
    iv: [0, 7, 15],
    next: [
      [1, 2],
      [3, 2],
      [4, 2],
      [2, 1],
      [0, 1],
    ],
  },
  {
    iv: [0, 5, 7, 14],
    next: [
      [0, 3],
      [3, 1],
      [4, 1],
    ],
  },
  {
    iv: [1, 5, 8],
    next: [
      [0, 4],
      [1, 1],
    ],
  },
  {
    iv: [5, 8, 12],
    next: [
      [0, 2],
      [2, 1],
      [4, 2],
    ],
  },
  {
    iv: [8, 12, 15, 19],
    next: [
      [5, 2],
      [3, 1],
      [0, 2],
    ],
  },
  {
    iv: [10, 14, 17],
    next: [
      [0, 3],
      [2, 1],
    ],
  },
];

/** A Dorian, quiet: i9, IV, bVII, bIII, v7, IVadd9. */
const CAMP_CHORDS: readonly ChordDef[] = [
  {
    iv: [0, 3, 7, 14],
    next: [
      [1, 3],
      [2, 2],
      [4, 1],
      [5, 1],
    ],
  },
  {
    iv: [5, 9, 12],
    next: [
      [0, 3],
      [2, 1],
      [3, 1],
    ],
  },
  {
    iv: [10, 14, 17],
    next: [
      [0, 2],
      [3, 2],
      [1, 1],
    ],
  },
  {
    iv: [3, 7, 10],
    next: [
      [1, 2],
      [2, 1],
      [0, 1],
    ],
  },
  {
    iv: [7, 10, 14, 17],
    next: [
      [0, 3],
      [1, 1],
    ],
  },
  {
    iv: [5, 9, 12, 19],
    next: [
      [0, 3],
      [2, 1],
    ],
  },
];

/** C minor, slow and low: i, bVI, iv, i add9, bVII, iv add9. */
const GAMEOVER_CHORDS: readonly ChordDef[] = [
  {
    iv: [0, 3, 7],
    next: [
      [1, 3],
      [2, 2],
      [3, 1],
    ],
  },
  {
    iv: [8, 12, 15],
    next: [
      [2, 2],
      [0, 2],
      [4, 1],
    ],
  },
  {
    iv: [5, 8, 12],
    next: [
      [0, 3],
      [3, 1],
    ],
  },
  {
    iv: [0, 3, 7, 14],
    next: [
      [1, 2],
      [5, 1],
      [2, 1],
    ],
  },
  {
    iv: [10, 14, 17],
    next: [
      [0, 2],
      [1, 1],
    ],
  },
  {
    iv: [5, 8, 12, 19],
    next: [
      [0, 2],
      [1, 1],
    ],
  },
];

/** F major, warm: Imaj7, vi7, IVmaj7, iii7, ii9, Imaj9 (rootless over F), Vsus4. */
const STATION_CHORDS: readonly ChordDef[] = [
  {
    iv: [0, 4, 7, 11],
    next: [
      [2, 3],
      [1, 2],
      [3, 1],
      [4, 1],
    ],
  },
  {
    iv: [9, 12, 16, 19],
    next: [
      [2, 2],
      [4, 2],
      [0, 1],
    ],
  },
  {
    iv: [5, 9, 12, 16],
    next: [
      [0, 3],
      [5, 2],
      [1, 1],
      [6, 1],
    ],
  },
  {
    iv: [4, 7, 11, 14],
    next: [
      [1, 2],
      [2, 2],
    ],
  },
  {
    iv: [2, 5, 9, 16],
    next: [
      [0, 2],
      [6, 2],
      [5, 1],
    ],
  },
  {
    iv: [4, 7, 11, 14],
    root: 0,
    next: [
      [2, 2],
      [1, 2],
      [4, 1],
    ],
  },
  {
    iv: [7, 12, 14],
    next: [
      [0, 3],
      [5, 1],
    ],
  },
];

const STYLES: Record<Exclude<MusicTrack, 'epilogue'>, PadStyle> = {
  title: {
    tonic: 50,
    chords: TITLE_CHORDS,
    durs: [10, 12, 14, 16],
    lo: 50,
    hi: 70,
    waves: [
      ['sawtooth', 1],
      ['sawtooth', 1],
    ],
    spread: 9,
    level: 0.024,
    cutoff: 900,
    lfoRate: 0.045,
    lfoDepth: 0.35,
    bass: 0.036,
    pedal: 0,
    glint: [6, 14],
    glintLevel: 0.02,
    keys: null,
    keysLevel: 0,
    wet: 0.7,
  },
  scene: {
    tonic: 52,
    chords: SCENE_CHORDS,
    durs: [8, 10, 12, 14, 16],
    lo: 46,
    hi: 64,
    waves: [
      ['sawtooth', 1],
      ['sawtooth', 1],
    ],
    spread: 8,
    level: 0.022,
    cutoff: 700,
    lfoRate: 0.06,
    lfoDepth: 0.3,
    bass: 0.032,
    pedal: 0.028,
    glint: [10, 22],
    glintLevel: 0.014,
    keys: null,
    keysLevel: 0,
    wet: 0.6,
  },
  camp: {
    tonic: 57,
    chords: CAMP_CHORDS,
    durs: [12, 14, 16],
    lo: 52,
    hi: 70,
    waves: [
      ['triangle', 1],
      ['sawtooth', 0.5],
    ],
    spread: 7,
    level: 0.026,
    cutoff: 620,
    lfoRate: 0.05,
    lfoDepth: 0.3,
    bass: 0.028,
    pedal: 0,
    glint: [8, 16],
    glintLevel: 0.016,
    keys: null,
    keysLevel: 0,
    wet: 0.7,
  },
  gameover: {
    tonic: 48,
    chords: GAMEOVER_CHORDS,
    durs: [14, 16, 18, 20],
    lo: 43,
    hi: 62,
    waves: [
      ['sawtooth', 1],
      ['triangle', 1],
    ],
    spread: 8,
    level: 0.022,
    cutoff: 520,
    lfoRate: 0.035,
    lfoDepth: 0.25,
    bass: 0.038,
    pedal: 0.024,
    glint: [18, 30],
    glintLevel: 0.012,
    keys: null,
    keysLevel: 0,
    wet: 0.75,
  },
  station: {
    tonic: 53,
    chords: STATION_CHORDS,
    durs: [9, 11, 13],
    lo: 53,
    hi: 72,
    waves: [
      ['triangle', 1],
      ['triangle', 1],
      ['sawtooth', 0.3],
    ],
    spread: 6,
    level: 0.022,
    cutoff: 1500,
    lfoRate: 0.07,
    lfoDepth: 0.2,
    bass: 0.034,
    pedal: 0,
    glint: null,
    glintLevel: 0,
    keys: [4, 9],
    keysLevel: 0.03,
    wet: 0.5,
  },
};

// ---------------------------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------------------------

interface TrackPlayer {
  readonly name: MusicTrack;
  schedule(now: number, until: number): void;
  fadeIn(now: number, dur: number): void;
  fadeOut(now: number, dur: number): void;
  isDead(now: number): boolean;
  dispose(): void;
  /** MIDI root of the harmony sounding at `t`, or null when unknown. */
  rootAt(t: number): number | null;
}

abstract class TrackBase implements TrackPlayer {
  protected readonly dry: GainNode;
  protected readonly wet: GainNode;
  protected readonly voices: Voice[] = [];
  protected endAt = Number.POSITIVE_INFINITY;

  constructor(
    readonly name: MusicTrack,
    protected readonly ctx: BaseAudioContext,
    protected readonly kit: Kit,
    out: AudioNode,
    verb: AudioNode,
  ) {
    this.dry = ctx.createGain();
    this.dry.gain.value = 0;
    this.dry.connect(out);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0;
    this.wet.connect(verb);
  }

  protected get ending(): boolean {
    return this.endAt !== Number.POSITIVE_INFINITY;
  }

  fadeIn(now: number, dur: number): void {
    rampParam(this.dry.gain, 1, now, dur);
    rampParam(this.wet.gain, 1, now, dur);
  }

  fadeOut(now: number, dur: number): void {
    if (this.ending) return;
    rampParam(this.dry.gain, 0, now, dur);
    rampParam(this.wet.gain, 0, now, dur);
    this.endAt = now + dur;
    for (const v of this.voices) v.stop(this.endAt + 0.05);
    this.onEnd(this.endAt + 0.05);
  }

  /** Stops the track's persistent nodes. */
  protected onEnd(_at: number): void {
    // Tracks without persistent nodes have nothing to stop.
  }

  isDead(now: number): boolean {
    return now > this.endAt + 0.5;
  }

  dispose(): void {
    try {
      this.dry.disconnect();
      this.wet.disconnect();
    } catch {
      // Already disconnected.
    }
  }

  protected note(t: number, dest: AudioNode, wet: AudioNode | null, level = 1, pan = 0): Voice {
    const v = new Voice({ ctx: this.ctx, kit: this.kit, time: t, dest, wet, level, pan });
    this.voices.push(v);
    return v;
  }

  protected prune(): void {
    let w = 0;
    for (let r = 0; r < this.voices.length; r++) {
      const v = this.voices[r];
      if (!v.done) this.voices[w++] = v;
    }
    this.voices.length = w;
  }

  abstract schedule(now: number, until: number): void;
  abstract rootAt(t: number): number | null;
}

interface Harmony {
  readonly t: number;
  readonly root: number;
  readonly tones: readonly number[];
}

/** The dark pads (title, scene, camp, gameover) and the warm Station pad. */
class PadTrack extends TrackBase {
  private readonly rng: Rng;
  private readonly bed: Voice;
  private readonly padIn: GainNode;
  private nextChord: number;
  private chordIdx = 0;
  private center: number;
  private nextGlint: number;
  private nextKeys: number;
  private readonly harmony: Harmony[] = [];

  constructor(
    name: MusicTrack,
    ctx: BaseAudioContext,
    kit: Kit,
    out: AudioNode,
    verb: AudioNode,
    private readonly style: PadStyle,
    seed: number,
    start: number,
  ) {
    super(name, ctx, kit, out, verb);
    this.rng = mulberry32(seed);
    this.center = (style.lo + style.hi) / 2;
    this.nextChord = start;
    this.nextGlint = style.glint ? start + rrange(this.rng, style.glint[0] * 0.5, style.glint[1]) : 0;
    this.nextKeys = style.keys ? start + rrange(this.rng, 2, style.keys[1]) : 0;
    // Bed: every pad note → low-pass with a slow LFO → dry and reverb.
    this.bed = new Voice({ ctx, kit, time: start, dest: this.dry, wet: this.wet });
    this.bed.keepAlive();
    this.padIn = this.bed.gain(1);
    const lp = this.bed.filter('lowpass', style.cutoff, 0.6);
    const lfo = this.bed.osc('sine', style.lfoRate, start);
    const depth = this.bed.gain(style.cutoff * style.lfoDepth);
    lfo.connect(depth);
    depth.connect(lp.frequency);
    this.padIn.connect(lp);
    this.bed.out(lp);
    this.bed.send(lp, style.wet);
    if (style.pedal > 0) {
      const pedal = this.bed.osc('sine', midiHz(style.tonic - 12), start);
      const pg = this.bed.gain(0);
      pg.gain.setValueAtTime(0, start);
      pg.gain.linearRampToValueAtTime(style.pedal, start + 6);
      pedal.connect(pg);
      pg.connect(lp);
    }
  }

  protected override onEnd(at: number): void {
    this.bed.stop(at);
  }

  override schedule(now: number, until: number): void {
    if (this.ending) return;
    this.prune();
    const st = this.style;
    if (this.nextChord < now - 2) this.nextChord = now;
    let guard = 0;
    while (this.nextChord < until && guard++ < 4) this.playChord(this.nextChord);
    if (st.glint) {
      if (this.nextGlint < now - 2) this.nextGlint = now + rrange(this.rng, st.glint[0], st.glint[1]) * 0.5;
      while (this.nextGlint < until && guard++ < 12) {
        this.playGlint(this.nextGlint);
        this.nextGlint += rrange(this.rng, st.glint[0], st.glint[1]);
      }
    }
    if (st.keys) {
      if (this.nextKeys < now - 2) this.nextKeys = now + rrange(this.rng, st.keys[0], st.keys[1]) * 0.5;
      while (this.nextKeys < until && guard++ < 20) {
        this.playKeys(this.nextKeys);
        this.nextKeys += rrange(this.rng, st.keys[0], st.keys[1]);
      }
    }
  }

  override rootAt(t: number): number | null {
    return this.harmonyAt(t)?.root ?? null;
  }

  private harmonyAt(t: number): Harmony | null {
    let found: Harmony | null = null;
    for (const h of this.harmony) if (h.t <= t + 1e-6) found = h;
    return found ?? this.harmony[0] ?? null;
  }

  private playChord(t: number): void {
    const st = this.style;
    const rng = this.rng;
    const chord = st.chords[this.chordIdx];
    const dur = rpick(rng, st.durs);
    const tones = chord.iv.map((i) => st.tonic + i);
    const voicing = voiceChord(tones, st.lo, st.hi, this.center, rng);
    this.center = 0.6 * mean(voicing) + 0.4 * ((st.lo + st.hi) / 2);
    const attack = clamp(dur * 0.35, 1.5, 5);
    const release = 4.5;
    for (const m of voicing) this.padNote(t, m, dur, attack, release, st.level, st.waves);
    const root = fold(st.tonic + (chord.root ?? chord.iv[0]), st.tonic - 19, st.tonic - 8);
    if (st.bass > 0) this.padNote(t, root, dur, attack, release, st.bass, [['triangle', 1]]);
    this.harmony.push({ t, root, tones: voicing });
    if (this.harmony.length > 4) this.harmony.shift();
    this.chordIdx = weighted(rng, chord.next);
    this.nextChord = t + dur;
  }

  private padNote(
    t: number,
    midi: number,
    dur: number,
    attack: number,
    release: number,
    level: number,
    waves: readonly (readonly [OscillatorType, number])[],
  ): void {
    const v = this.note(t, this.padIn, null);
    const end = t + dur + release;
    const g = v.gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + attack);
    g.gain.setValueAtTime(level, t + dur);
    g.gain.linearRampToValueAtTime(0, end);
    const f = midiHz(midi);
    const n = waves.length;
    for (let i = 0; i < n; i++) {
      const [type, amp] = waves[i];
      const o = v.osc(type, f, t, end + 0.05);
      o.detune.value = (n > 1 ? ((i / (n - 1)) * 2 - 1) * this.style.spread : 0) + rrange(this.rng, -2, 2);
      if (amp === 1) {
        o.connect(g);
      } else {
        const a = v.gain(amp);
        o.connect(a);
        a.connect(g);
      }
    }
    v.out(g);
  }

  /** A sparse, soft high note from the current chord, mostly reverb. */
  private playGlint(t: number): void {
    const st = this.style;
    const h = this.harmonyAt(t);
    if (!h) return;
    const m = fold(rpick(this.rng, h.tones), st.hi + 5, st.hi + 17);
    const v = this.note(t, this.dry, this.wet, 1, rrange(this.rng, -0.5, 0.5));
    const f = midiHz(m);
    const attack = rrange(this.rng, 0.3, 0.9);
    const decay = rrange(this.rng, 2.5, 4.5);
    const end = t + attack + decay + 0.05;
    const o = v.osc('sine', f, t, end);
    const o2 = v.osc('sine', f * 2.003, t, end);
    const g = v.gain(0);
    ad(g.gain, t, st.glintLevel, attack, decay);
    const g2 = v.gain(0.15);
    o2.connect(g2);
    g2.connect(g);
    o.connect(g);
    v.out(g);
    v.send(g, 0.9);
  }

  /** Station only: one or two soft FM electric-piano notes from the chord. */
  private playKeys(t: number): void {
    const st = this.style;
    const h = this.harmonyAt(t);
    if (!h) return;
    const count = this.rng() < 0.35 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const tt = t + i * rrange(this.rng, 0.18, 0.4);
      const m = fold(rpick(this.rng, h.tones), st.tonic + 9, st.tonic + 21);
      const v = this.note(tt, this.dry, this.wet, 1, rrange(this.rng, -0.3, 0.3));
      const f = midiHz(m);
      const dur = 2.8;
      const carrier = v.osc('sine', f, tt, tt + dur + 0.05);
      const mod = v.osc('sine', f, tt, tt + dur + 0.05);
      const index = v.gain(0);
      index.gain.setValueAtTime(f * 1.1, tt);
      index.gain.exponentialRampToValueAtTime(f * 0.05, tt + 1.4);
      mod.connect(index);
      index.connect(carrier.frequency);
      const lp = v.filter('lowpass', 2600, 0.6);
      const g = v.gain(0);
      ad(g.gain, tt, st.keysLevel * rrange(this.rng, 0.7, 1), 0.006, dur - 0.1);
      chain(carrier, lp, g);
      v.out(g);
      v.send(g, 0.45);
    }
  }
}

// --- Epilogue -------------------------------------------------------------------------------

/** D3: the epilogue key's tonic. */
const EPI_TONIC = 50;
const EPI_BPM = 76;
/** Pad and bass only, before the melody enters. */
const EPI_INTRO_BARS = 2;
/** I, ii, iii, IV, V, vi in D major (semitones above the tonic). */
const EPI_CHORDS: readonly (readonly number[])[] = [
  [0, 4, 7],
  [2, 5, 9],
  [4, 7, 11],
  [5, 9, 12],
  [7, 11, 14],
  [9, 12, 16],
];
/** Four chords per eight-bar phrase, two bars each. */
const EPI_PROGS: readonly (readonly number[])[] = [
  [0, 4, 5, 3],
  [0, 3, 5, 4],
  [3, 0, 4, 5],
  [5, 3, 0, 4],
  [0, 2, 3, 4],
  [0, 3, 1, 4],
];
/** D major pentatonic (pitch classes above D). */
const PENTA_PCS: readonly number[] = [0, 2, 4, 7, 9];
const MELODY_LO = 66;
const MELODY_HI = 86;
/** One bar of eighth-note durations (sums to 8). */
const RHYTHMS: readonly (readonly number[])[] = [
  [2, 2, 2, 2],
  [3, 1, 2, 2],
  [2, 1, 1, 4],
  [4, 2, 2],
  [2, 2, 4],
  [1, 1, 2, 4],
  [3, 3, 2],
  [2, 4, 2],
];
/** A phrase-ending bar: fewer, longer notes. */
const ENDINGS: readonly (readonly number[])[] = [[4, 4], [2, 6], [3, 5], [2, 2, 4], [8]];
const STEPS: readonly number[] = [-2, -1, -1, 0, 1, 1, 1, 2];

interface PlannedNote {
  readonly t: number;
  readonly midi: number;
  readonly vel: number;
}

/** Sunrise and Ghana: the first warm, major-key music. A simple plucked melody over a soft pad. */
class EpilogueTrack extends TrackBase {
  private readonly rng: Rng;
  private readonly beat = 60 / EPI_BPM;
  private readonly bed: Voice;
  private readonly padIn: GainNode;
  private readonly penta: number[] = [];
  private nextBar: number;
  private bar = 0;
  private prog: readonly number[] = EPI_PROGS[0];
  private melody: PlannedNote[] = [];
  private lastPitch = 74;
  private currentRoot = EPI_TONIC;

  constructor(ctx: BaseAudioContext, kit: Kit, out: AudioNode, verb: AudioNode, seed: number, start: number) {
    super('epilogue', ctx, kit, out, verb);
    this.rng = mulberry32(seed);
    this.nextBar = start + 0.3;
    for (let m = MELODY_LO; m <= MELODY_HI; m++) {
      if (PENTA_PCS.includes((((m - EPI_TONIC) % 12) + 12) % 12)) this.penta.push(m);
    }
    this.bed = new Voice({ ctx, kit, time: start, dest: this.dry, wet: this.wet });
    this.bed.keepAlive();
    this.padIn = this.bed.gain(1);
    const lp = this.bed.filter('lowpass', 1900, 0.5);
    const lfo = this.bed.osc('sine', 0.06, start);
    const depth = this.bed.gain(300);
    lfo.connect(depth);
    depth.connect(lp.frequency);
    this.padIn.connect(lp);
    this.bed.out(lp);
    this.bed.send(lp, 0.5);
  }

  protected override onEnd(at: number): void {
    this.bed.stop(at);
  }

  override dispose(): void {
    super.dispose();
    this.kit.clearPlucks();
  }

  override rootAt(_t: number): number | null {
    return this.currentRoot;
  }

  override schedule(now: number, until: number): void {
    if (this.ending) return;
    this.prune();
    if (this.nextBar < now - 2) this.nextBar = now;
    let guard = 0;
    while (this.nextBar < until && guard++ < 4) {
      this.playBar(this.nextBar);
      this.bar++;
      this.nextBar += this.beat * 4;
    }
  }

  private playBar(t: number): void {
    const barDur = this.beat * 4;
    const bar = this.bar;
    if (bar < EPI_INTRO_BARS) {
      if (bar === 0) this.padChord(t, EPI_CHORDS[0], barDur * EPI_INTRO_BARS, 3.5);
      if (bar === 1) this.bassPluck(t, EPI_CHORDS[0][0], 0.55);
      this.currentRoot = EPI_TONIC;
      return;
    }
    const pb = (bar - EPI_INTRO_BARS) % 8;
    if (pb === 0) this.planPhrase(t);
    const chord = EPI_CHORDS[this.prog[pb >> 1]];
    if (pb % 2 === 0) {
      this.padChord(t, chord, barDur * 2, 1.2);
      this.bassPluck(t, chord[0], 0.8);
      this.bassPluck(t + this.beat * 2, chord[0] + 7, 0.45);
    } else {
      this.bassPluck(t, chord[0], 0.6);
      if (this.rng() < 0.5) this.bassPluck(t + this.beat * 2, chord[0] + 7, 0.4);
    }
    this.currentRoot = EPI_TONIC + chord[0];
    for (const n of this.melody) {
      if (n.t >= t - 1e-4 && n.t < t + barDur - 1e-4) this.melodyPluck(n);
    }
  }

  /** Plans eight bars: motif A, A varied, B, A varied, each fitted to its chord. */
  private planPhrase(t0: number): void {
    const rng = this.rng;
    this.prog = rpick(rng, EPI_PROGS);
    const e8 = this.beat / 2;
    const barDur = this.beat * 4;
    const motifA = [...rpick(rng, RHYTHMS), ...rpick(rng, ENDINGS)];
    const motifB = [...rpick(rng, RHYTHMS), ...rpick(rng, ENDINGS)];
    const contourA = this.contour(motifA.length);
    const contourB = this.contour(motifB.length);
    const notes: PlannedNote[] = [];
    let prev = this.lastPitch;
    for (let s = 0; s < 4; s++) {
      const chord = EPI_CHORDS[this.prog[s]];
      const useB = s === 2;
      const rhythm = useB ? motifB : motifA;
      const contour = useB ? contourB : contourA;
      let pitch = this.nearestChordTone(chord, useB ? prev + 3 : prev);
      let pos = 0;
      let time = t0 + s * 2 * barDur;
      for (let i = 0; i < rhythm.length; i++) {
        const last = i === rhythm.length - 1;
        if (i > 0) {
          let step = contour[i];
          // Vary the tail of the repeated motif so the repeat answers rather than echoes.
          if ((s === 1 || s === 3) && i >= rhythm.length - 2 && rng() < 0.5) step += rng() < 0.5 ? -1 : 1;
          pitch = this.stepPenta(pitch, step);
        }
        if (pos % 4 === 0 || (last && s === 3)) pitch = this.nearestChordTone(chord, pitch);
        const rest = last && s < 3 && rng() < 0.22;
        if (!rest) {
          const accent = pos === 0 ? 0.95 : pos % 4 === 0 ? 0.85 : 0.7;
          notes.push({ t: time + (rng() - 0.5) * 0.016, midi: pitch, vel: accent + (rng() - 0.5) * 0.1 });
        }
        time += rhythm[i] * e8;
        pos += rhythm[i];
      }
      prev = pitch;
    }
    this.lastPitch = prev;
    this.melody = notes;
  }

  private contour(n: number): number[] {
    const out: number[] = [0];
    let acc = 0;
    for (let i = 1; i < n; i++) {
      let step = rpick(this.rng, STEPS);
      if (acc > 3) step = -Math.abs(step) || -1;
      else if (acc < -3) step = Math.abs(step) || 1;
      acc += step;
      out.push(step);
    }
    return out;
  }

  private stepPenta(pitch: number, step: number): number {
    let idx = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.penta.length; i++) {
      const d = Math.abs(this.penta[i] - pitch);
      if (d < best) {
        best = d;
        idx = i;
      }
    }
    return this.penta[clamp(idx + step, 0, this.penta.length - 1)];
  }

  private nearestChordTone(chord: readonly number[], pitch: number): number {
    let best = pitch;
    let bestD = Number.POSITIVE_INFINITY;
    for (let m = MELODY_LO; m <= MELODY_HI; m++) {
      const pc = (((m - EPI_TONIC) % 12) + 12) % 12;
      if (!chord.some((c) => c % 12 === pc)) continue;
      const d = Math.abs(m - pitch);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  }

  private melodyPluck(n: PlannedNote): void {
    const buf = this.kit.pluck(n.midi, 1.8, 0.62);
    const v = this.note(n.t, this.dry, this.wet, clamp(n.vel, 0.3, 1) * 0.36, (this.rng() - 0.5) * 0.4);
    const src = v.play(buf, n.t);
    const lp = v.filter('lowpass', 4200, 0.5);
    src.connect(lp);
    v.out(lp);
    v.send(lp, 0.35);
  }

  private bassPluck(t: number, interval: number, vel: number): void {
    const midi = fold(EPI_TONIC + interval, 38, 49);
    const buf = this.kit.pluck(midi, 2.4, 0.3);
    const v = this.note(t, this.dry, this.wet, vel * 0.36);
    const src = v.play(buf, t);
    const lp = v.filter('lowpass', 900, 0.5);
    src.connect(lp);
    v.out(lp);
    v.send(lp, 0.15);
  }

  private padChord(t: number, chord: readonly number[], dur: number, attack: number): void {
    const tones = chord.map((i) => EPI_TONIC + 12 + i);
    const voicing = voiceChord(tones, 57, 74, 64, this.rng);
    for (const m of voicing) {
      const v = this.note(t, this.padIn, null);
      const end = t + dur + 2.5;
      const g = v.gain(0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.026, t + attack);
      g.gain.setValueAtTime(0.026, t + dur);
      g.gain.linearRampToValueAtTime(0, end);
      const f = midiHz(m);
      for (const cents of [-5, 5]) {
        const o = v.osc('triangle', f, t, end + 0.05);
        o.detune.value = cents;
        o.connect(g);
      }
      const shimmer = v.osc('sine', f * 2, t, end + 0.05);
      const sg = v.gain(0.15);
      shimmer.connect(sg);
      sg.connect(g);
      v.out(g);
    }
  }
}

/** An override file looped as the track. */
class BufferTrack extends TrackBase {
  constructor(
    name: MusicTrack,
    ctx: BaseAudioContext,
    kit: Kit,
    out: AudioNode,
    verb: AudioNode,
    buffer: AudioBuffer,
    start: number,
  ) {
    super(name, ctx, kit, out, verb);
    const v = this.note(start, this.dry, null);
    v.out(v.play(buffer, start, { loop: true }));
  }

  override schedule(): void {
    this.prune();
  }

  override rootAt(_t: number): number | null {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// The music engine: tracks with crossfades, plus the tension and percussion layers
// ---------------------------------------------------------------------------------------------

const LAYER_BPM = 100;
/** One sixteenth note on the layer grid (seconds). */
const STEP = 60 / LAYER_BPM / 4;
/** Eighth-note accents for the tension pulse: a 3+3+2 lilt that never quite settles. */
const PULSE_ACCENTS: readonly number[] = [1, 0.5, 0.62, 0.9, 0.5, 0.62, 0.95, 0.55];
const TOM_FREQS: readonly number[] = [150, 132, 118, 104];

function pattern(p: string): boolean[] {
  return [...p].map((c) => c === 'x');
}

const KICKS: readonly (readonly boolean[])[] = [
  pattern('x.....x.x.......'),
  pattern('x.....x...x.....'),
  pattern('x..x....x.x.....'),
];
const TOMS: readonly (readonly boolean[])[] = [
  pattern('....x.......x...'),
  pattern('....x.....x.x...'),
  pattern('......x.....x...'),
];
const CLANKS: readonly (readonly boolean[])[] = [pattern('....x.......x...'), pattern('............x...')];

export class MusicEngine {
  private readonly tracks: TrackPlayer[] = [];
  private current: TrackPlayer | null = null;
  private currentName: MusicTrack | 'none' = 'none';
  private readonly starts = new Map<MusicTrack, number>();
  private readonly tensionBus: GainNode;
  private readonly tensionHiBus: GainNode;
  private readonly percBus: GainNode;
  private tensionWanted = 0;
  private tension = 0;
  private alertWanted = false;
  private alert = false;
  private percUntil = 0;
  private nextStep = -1;
  private stepIdx = 0;
  private lastRoot = 45;
  private percPattern = 0;
  private readonly layerRng: Rng = mulberry32(hashString('layers'));

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly kit: Kit,
    private readonly out: AudioNode,
    private readonly verb: AudioNode,
    private readonly overrideFor: (track: MusicTrack) => AudioBuffer | undefined = () => undefined,
  ) {
    this.tensionBus = ctx.createGain();
    this.tensionBus.gain.value = 0;
    this.tensionBus.connect(out);
    const tensionSend = ctx.createGain();
    tensionSend.gain.value = 0.3;
    this.tensionBus.connect(tensionSend);
    tensionSend.connect(verb);
    this.tensionHiBus = ctx.createGain();
    this.tensionHiBus.gain.value = 0;
    this.tensionHiBus.connect(this.tensionBus);
    this.percBus = ctx.createGain();
    this.percBus.gain.value = 0;
    this.percBus.connect(out);
    const percSend = ctx.createGain();
    percSend.gain.value = 0.12;
    this.percBus.connect(percSend);
    percSend.connect(verb);
  }

  get track(): MusicTrack | 'none' {
    return this.currentName;
  }

  /** Crossfades to `track` over `fade` seconds. `force` restarts the same track (new override). */
  setTrack(track: MusicTrack | 'none', now: number, fade = 2, force = false): void {
    if (track === this.currentName && !force) return;
    this.currentName = track;
    if (this.current) this.current.fadeOut(now, fade);
    this.current = null;
    // The epilogue has no tension or ALERT layers.
    this.applyTension(now);
    this.applyAlert(now);
    if (track === 'none') return;
    const n = (this.starts.get(track) ?? 0) + 1;
    this.starts.set(track, n);
    const seed = (hashString(track) + Math.imul(n, 0x9e3779b1)) >>> 0;
    const start = now + 0.05;
    const buffer = this.overrideFor(track);
    let player: TrackPlayer;
    if (buffer) {
      player = new BufferTrack(track, this.ctx, this.kit, this.out, this.verb, buffer, start);
    } else if (track === 'epilogue') {
      player = new EpilogueTrack(this.ctx, this.kit, this.out, this.verb, seed, start);
    } else {
      player = new PadTrack(track, this.ctx, this.kit, this.out, this.verb, STYLES[track], seed, start);
    }
    player.fadeIn(now, fade);
    this.tracks.push(player);
    this.current = player;
  }

  /** 0..1: the pulsing tension layer's level. */
  setTension(level: number, now: number): void {
    this.tensionWanted = clamp(level, 0, 1);
    this.applyTension(now);
  }

  /** The driving percussion layer. */
  setAlert(on: boolean, now: number): void {
    this.alertWanted = on;
    this.applyAlert(now);
  }

  /** Schedules everything that starts before `until`. */
  schedule(now: number, until: number): void {
    for (let i = this.tracks.length - 1; i >= 0; i--) {
      const tr = this.tracks[i];
      if (tr.isDead(now)) {
        tr.dispose();
        this.tracks.splice(i, 1);
        continue;
      }
      tr.schedule(now, until);
    }
    this.scheduleLayers(now, until);
  }

  private applyTension(now: number): void {
    const eff = this.currentName === 'epilogue' ? 0 : this.tensionWanted;
    if (Math.abs(eff - this.tension) < 0.01 && !(eff === 0 && this.tension !== 0)) return;
    this.tension = eff;
    this.tensionBus.gain.setTargetAtTime(Math.pow(eff, 1.3) * 0.9, now, 0.4);
    this.tensionHiBus.gain.setTargetAtTime(clamp((eff - 0.5) / 0.5, 0, 1), now, 0.6);
  }

  private applyAlert(now: number): void {
    const eff = this.alertWanted && this.currentName !== 'epilogue';
    if (eff === this.alert) return;
    this.alert = eff;
    rampParam(this.percBus.gain, eff ? 0.7 : 0, now, eff ? 0.4 : 1.6);
    this.percUntil = eff ? Number.POSITIVE_INFINITY : now + 1.7;
  }

  private scheduleLayers(now: number, until: number): void {
    if (this.nextStep < 0) this.nextStep = now + 0.05;
    if (this.nextStep < now - 0.3) {
      const skip = Math.ceil((now - this.nextStep) / STEP);
      this.nextStep += skip * STEP;
      this.stepIdx += skip;
    }
    const tensionOn = this.tension > 0.02;
    const percOn = this.alert || now < this.percUntil;
    let guard = 0;
    while (this.nextStep < until && guard++ < 128) {
      const t = this.nextStep;
      const s = this.stepIdx % 16;
      const bar = Math.floor(this.stepIdx / 16);
      if (tensionOn || percOn) {
        const root = this.current ? this.current.rootAt(t) : null;
        if (root !== null) this.lastRoot = root;
      }
      if (tensionOn && s % 2 === 0) this.tensionPulse(t, s);
      if (tensionOn && s === 0) this.tensionHigh(t);
      if (percOn) this.percStep(t, s, bar);
      this.nextStep += STEP;
      this.stepIdx++;
    }
  }

  private layerVoice(t: number, dest: AudioNode): Voice {
    return new Voice({ ctx: this.ctx, kit: this.kit, time: t, dest });
  }

  /** An eighth-note pulse on the chord root, brighter as tension rises. */
  private tensionPulse(t: number, s: number): void {
    const a = PULSE_ACCENTS[(s >> 1) & 7];
    const f = midiHz(fold(this.lastRoot, 33, 44));
    const v = this.layerVoice(t, this.tensionBus);
    const o = v.osc('sawtooth', f, t, t + 0.32);
    const lp = v.filter('lowpass', 200, 3);
    glide(lp.frequency, t, 300 + 1300 * this.tension * a, 130, 0.2);
    const g = v.gain(0);
    ad(g.gain, t, 0.26 * a, 0.004, 0.26);
    chain(o, lp, g);
    v.out(g);
  }

  /** Above half tension: a high tremolo tone on the fifth, the flat ninth near the top. */
  private tensionHigh(t: number): void {
    if (this.tension < 0.45) return;
    const bar = STEP * 16;
    const m = fold(this.lastRoot + (this.tension > 0.85 ? 1 : 7), 76, 88);
    const v = this.layerVoice(t, this.tensionHiBus);
    const end = t + bar + 0.1;
    const o = v.osc('triangle', midiHz(m), t, end);
    const trem = v.gain(0.55);
    const lfo = v.osc('square', 1 / STEP, t, end);
    const depth = v.gain(0.45);
    lfo.connect(depth);
    depth.connect(trem.gain);
    const g = v.gain(0);
    ahr(g.gain, t, 0.03, 0.3, bar - 0.5, 0.2);
    chain(o, trem, g);
    v.out(g);
  }

  private percStep(t: number, s: number, bar: number): void {
    if (s === 0) this.percPattern = Math.floor(this.layerRng() * KICKS.length);
    const p = this.percPattern;
    const fill = bar % 4 === 3 && s >= 12;
    if (KICKS[p][s]) this.kick(t, s === 0 ? 1 : 0.8);
    if (fill) this.tom(t, s - 12);
    else if (TOMS[p][s]) this.tom(t, 0);
    if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 1 : 0.6);
    else if (this.layerRng() < 0.3) this.hat(t, 0.35);
    if (!fill && CLANKS[p % CLANKS.length][s]) this.clank(t);
  }

  private kick(t: number, a: number): void {
    const v = this.layerVoice(t, this.percBus);
    const o = v.osc('sine', 130, t, t + 0.4);
    glide(o.frequency, t, 130, 44, 0.12);
    const g = v.gain(0);
    ad(g.gain, t, 0.55 * a, 0.002, 0.32);
    const sh = v.shaper(this.kit.softCurve(1.6));
    chain(o, g, sh);
    v.out(sh);
    burst(v, t, { type: 'highpass', freq: 1800, peak: 0.05 * a, attack: 0.0005, decay: 0.008 });
  }

  private tom(t: number, n: number): void {
    const v = this.layerVoice(t, this.percBus);
    const f = TOM_FREQS[clamp(n, 0, TOM_FREQS.length - 1)];
    const o = v.osc('sine', f * 1.5, t, t + 0.5);
    glide(o.frequency, t, f * 1.5, f, 0.15);
    const g = v.gain(0);
    ad(g.gain, t, 0.3, 0.003, 0.38);
    const sh = v.shaper(this.kit.softCurve(1.4));
    chain(o, g, sh);
    v.out(sh);
    burst(v, t, { freq: 350, q: 1.2, peak: 0.07, attack: 0.002, decay: 0.07 });
  }

  private hat(t: number, a: number): void {
    const v = this.layerVoice(t, this.percBus);
    burst(v, t, { type: 'highpass', freq: 7000, peak: 0.04 * a, attack: 0.0008, decay: 0.03 + 0.02 * a });
  }

  private clank(t: number): void {
    const v = this.layerVoice(t, this.percBus);
    partials(v, t, [1730, 2650, 4120], [0.025, 0.016, 0.01], [0.12, 0.08, 0.05]);
    burst(v, t, { freq: 2200, q: 5, peak: 0.05, decay: 0.05 });
  }
}
