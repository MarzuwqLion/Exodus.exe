/**
 * Procedural sound design (spec §14.2): one voice function per SFX and loop cue, plus the small
 * building blocks they share (looping noise buffers, envelopes, filtered-noise bursts, FM blips,
 * bit-crush curves, generated reverb impulses, Karplus-Strong plucks).
 *
 * Direction: quiet, muted, a little cold, never cartoonish. Surveillance sounds (scanner, kiosk,
 * alarm, van, alarm_pop) are the only sharp ones.
 *
 * Nothing here touches `window` or constructs an AudioContext: every function builds into the
 * context it is handed, so the same code renders offline (OfflineAudioContext) for checks.
 */
import type { LoopCue, SfxCue } from './cues';

export type NoiseColor = 'white' | 'pink' | 'brown';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// Small math helpers
// ---------------------------------------------------------------------------------------------

/** Uniform random number in [a, b). Sound-effect variation only; music has its own seeded RNG. */
export function rr(a: number, b: number): number {
  return a + (b - a) * Math.random();
}

function pick<T>(items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(Math.random() * items.length))];
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function midiHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** mulberry32: a tiny, fast, seeded PRNG returning values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Connects nodes in series and returns the last one. */
export function chain(...nodes: AudioNode[]): AudioNode {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

// ---------------------------------------------------------------------------------------------
// Envelopes (all times in AudioContext seconds)
// ---------------------------------------------------------------------------------------------

/** Linear attack, exponential decay to silence. Returns the end time. */
export function ad(p: AudioParam, t: number, peak: number, attack: number, decay: number): number {
  const end = t + attack + decay;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.exponentialRampToValueAtTime(0.0001, end);
  p.setValueAtTime(0, end);
  return end;
}

/** Linear attack, hold, linear release. Returns the end time. */
export function ahr(
  p: AudioParam,
  t: number,
  peak: number,
  attack: number,
  hold: number,
  release: number,
): number {
  const end = t + attack + hold + release;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.setValueAtTime(peak, t + attack + hold);
  p.linearRampToValueAtTime(0, end);
  return end;
}

/** Exponential glide, for frequency-like params (both values must be positive). */
export function glide(p: AudioParam, t: number, from: number, to: number, dur: number): void {
  p.setValueAtTime(from, t);
  p.exponentialRampToValueAtTime(to, t + Math.max(0.001, dur));
}

/** Smoothly moves a param from wherever it is now to `value` (safe to call every frame). */
export function rampParam(p: AudioParam, value: number, at: number, ramp: number): void {
  p.cancelScheduledValues(at);
  p.setValueAtTime(p.value, at);
  p.linearRampToValueAtTime(value, at + Math.max(0.005, ramp));
}

// ---------------------------------------------------------------------------------------------
// Shared buffers and curves (one Kit per AudioContext)
// ---------------------------------------------------------------------------------------------

function removeDc(d: Float32Array): void {
  let mean = 0;
  for (let i = 0; i < d.length; i++) mean += d[i];
  mean /= Math.max(1, d.length);
  for (let i = 0; i < d.length; i++) d[i] -= mean;
}

function normalizeRms(d: Float32Array, target: number): void {
  let sum = 0;
  for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
  const rms = Math.sqrt(sum / Math.max(1, d.length));
  const k = rms > 1e-9 ? target / rms : 0;
  for (let i = 0; i < d.length; i++) d[i] = clamp(d[i] * k, -1, 1);
}

function normalizePeak(d: Float32Array, target: number): void {
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const k = peak > 1e-9 ? target / peak : 0;
  for (let i = 0; i < d.length; i++) d[i] *= k;
}

/** A few seconds of seamlessly looping noise (the tail is cross-faded into the head). */
function makeNoise(ctx: BaseAudioContext, color: NoiseColor, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.max(64, Math.floor(sr * seconds));
  const fade = Math.min(Math.floor(sr * 0.05), len >> 2);
  const raw = new Float32Array(len + fade);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  let brown = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'white') {
      raw[i] = w;
    } else if (color === 'pink') {
      // Paul Kellet's refined pink filter.
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    } else {
      brown = (brown + 0.02 * w) / 1.02;
      raw[i] = brown;
    }
  }
  removeDc(raw);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = raw[i];
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[i] = raw[i] * k + raw[len + i] * (1 - k);
  }
  normalizeRms(d, 0.25);
  return buf;
}

/** The typewriter tick: a tiny bright click with a short ring. Cheap to fire per character. */
function makeTick(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.03);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const w = Math.random() * 2 - 1;
    const hp = w - prev;
    prev = w;
    d[i] = hp * 0.5 * Math.exp(-t / 0.0012) + Math.sin(TAU * 2900 * t) * 0.6 * Math.exp(-t / 0.0035);
  }
  normalizePeak(d, 0.9);
  return buf;
}

/** Raw material for the glitch cue: chirps, buzz, and noise, decimated and quantized to 4 bits. */
function makeGlitch(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.8);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let i = 0;
  while (i < len) {
    const seg = Math.max(8, Math.floor(sr * rr(0.012, 0.045)));
    const kind = Math.random();
    const f = rr(140, 2400);
    const f2 = f * rr(0.4, 2.2);
    const hold = 4 + Math.floor(Math.random() * 9);
    let held = 0;
    let phase = 0;
    for (let j = 0; j < seg && i < len; j++, i++) {
      const k = j / seg;
      const freq = kind < 0.6 ? f + (f2 - f) * k : f;
      phase += freq / sr;
      let x = 0;
      if (kind < 0.35) x = Math.sin(TAU * phase) > 0 ? 0.55 : -0.55;
      else if (kind < 0.6) x = Math.sin(TAU * phase) * 0.8;
      else if (kind < 0.85) x = (Math.random() * 2 - 1) * 0.6;
      if (j % hold === 0) held = Math.round(x * 7) / 7;
      d[i] = held;
    }
  }
  return buf;
}

/** Karplus-Strong pluck at `freq` (Hz), falling 60 dB over `t60` seconds. */
function makePluck(ctx: BaseAudioContext, freq: number, t60: number, bright: number): AudioBuffer {
  const sr = 22050;
  const len = Math.floor(sr * Math.min(3.2, t60 * 1.15 + 0.1));
  const buf = ctx.createBuffer(1, len, sr);
  const y = buf.getChannelData(0);
  const period = sr / freq;
  // The two-point average in the loop adds half a sample of delay.
  const delay = Math.max(2, period - 0.5);
  const di = Math.floor(delay);
  const frac = delay - di;
  const loss = Math.pow(10, -3 / (t60 * freq));
  const n = Math.max(2, Math.min(len, Math.ceil(period)));
  const exc = new Float32Array(n);
  const a = clamp(0.12 + 0.8 * bright, 0.05, 1);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp += a * (Math.random() * 2 - 1 - lp);
    exc[i] = lp;
  }
  removeDc(exc);
  for (let i = 0; i < len; i++) {
    const j = i - di;
    const s0 = j >= 0 ? y[j] : 0;
    const s1 = j >= 1 ? y[j - 1] : 0;
    const s2 = j >= 2 ? y[j - 2] : 0;
    const d0 = (1 - frac) * s0 + frac * s1;
    const d1 = (1 - frac) * s1 + frac * s2;
    y[i] = (i < n ? exc[i] : 0) + loss * 0.5 * (d0 + d1);
  }
  const fade = Math.min(len, Math.floor(sr * 0.04));
  for (let i = 0; i < fade; i++) y[len - 1 - i] *= i / fade;
  normalizePeak(y, 0.9);
  return buf;
}

/**
 * A generated reverb impulse response: decaying stereo noise that darkens over time, with a few
 * early reflections. `rt60` is the time to fall 60 dB; `bright` (0..1) is the initial brightness.
 * Seeded, so the room sounds (and balances) the same every session.
 */
export function makeImpulse(
  ctx: BaseAudioContext,
  seconds: number,
  rt60: number,
  bright: number,
  seed = 0x5eed,
): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.max(64, Math.floor(sr * seconds));
  const buf = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(sr * 0.012);
  const decay = Math.pow(10, -3 / (rt60 * sr));
  const rand = mulberry32(seed);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let env = 1;
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const k = Math.min(1, 0.05 + bright * Math.exp(-t * 2.2));
      lp += k * (rand() * 2 - 1 - lp);
      // Keep the level steady while the one-pole filter darkens the tail.
      d[i] = lp * env * Math.sqrt((2 - k) / k) * 0.3;
      env *= decay;
    }
    for (let r = 0; r < 8; r++) {
      const idx = pre + Math.floor(sr * (0.004 + rand() * 0.071));
      if (idx < len) d[idx] += (rand() < 0.5 ? -1 : 1) * (0.15 + rand() * 0.3) * (1 - r / 10);
    }
    const fade = Math.min(len - pre, Math.floor(sr * 0.1));
    for (let i = 0; i < fade; i++) d[len - 1 - i] *= i / fade;
  }
  return buf;
}

/** A reverb send: high-passed (no low-end mud) into a convolver whose return feeds `bus`. */
export function reverbInto(
  ctx: BaseAudioContext,
  bus: AudioNode,
  impulse: AudioBuffer,
  lowCut: number,
): GainNode {
  const verb = ctx.createConvolver();
  verb.buffer = impulse;
  verb.connect(bus);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = lowCut;
  hp.Q.value = 0.6;
  hp.connect(verb);
  const send = ctx.createGain();
  send.connect(hp);
  return send;
}

/** Shared, lazily built buffers and curves for one AudioContext. */
export class Kit {
  readonly white: AudioBuffer;
  readonly pink: AudioBuffer;
  readonly brown: AudioBuffer;
  readonly tick: AudioBuffer;
  private glitchBuf: AudioBuffer | null = null;
  private readonly curves = new Map<string, Float32Array<ArrayBuffer>>();
  private readonly plucks = new Map<string, AudioBuffer>();

  constructor(readonly ctx: BaseAudioContext) {
    // Odd lengths so layered sources never line up into an audible repeat.
    this.white = makeNoise(ctx, 'white', 4.1);
    this.pink = makeNoise(ctx, 'pink', 4.7);
    this.brown = makeNoise(ctx, 'brown', 5.3);
    this.tick = makeTick(ctx);
  }

  noise(color: NoiseColor): AudioBuffer {
    return color === 'white' ? this.white : color === 'pink' ? this.pink : this.brown;
  }

  glitch(): AudioBuffer {
    this.glitchBuf ??= makeGlitch(this.ctx);
    return this.glitchBuf;
  }

  /** Staircase curve for WaveShaper bit-crushing (`levels` steps each side of zero). */
  crushCurve(levels: number): Float32Array<ArrayBuffer> {
    const key = `crush${levels}`;
    let c = this.curves.get(key);
    if (!c) {
      c = new Float32Array(2048);
      for (let i = 0; i < c.length; i++) {
        const x = (i / (c.length - 1)) * 2 - 1;
        c[i] = Math.round(x * levels) / levels;
      }
      this.curves.set(key, c);
    }
    return c;
  }

  /** Soft saturation, unity gain for small signals: adds harmonics so low thumps reach small speakers. */
  softCurve(drive = 1.5): Float32Array<ArrayBuffer> {
    const key = `soft${drive}`;
    let c = this.curves.get(key);
    if (!c) {
      c = new Float32Array(2048);
      for (let i = 0; i < c.length; i++) {
        const x = (i / (c.length - 1)) * 2 - 1;
        c[i] = Math.tanh(drive * x) / drive;
      }
      this.curves.set(key, c);
    }
    return c;
  }

  /** A cached Karplus-Strong pluck for a MIDI note. */
  pluck(midi: number, t60: number, bright: number): AudioBuffer {
    const key = `${midi}|${t60}|${bright}`;
    let b = this.plucks.get(key);
    if (!b) {
      b = makePluck(this.ctx, midiHz(midi), t60, bright);
      this.plucks.set(key, b);
    }
    return b;
  }

  clearPlucks(): void {
    this.plucks.clear();
  }
}

// ---------------------------------------------------------------------------------------------
// Voice: a group of nodes that plays, then disconnects itself when its last source ends
// ---------------------------------------------------------------------------------------------

export interface VoiceInit {
  readonly ctx: BaseAudioContext;
  readonly kit: Kit;
  /** Start time (AudioContext seconds). */
  readonly time: number;
  /** Dry destination. */
  readonly dest: AudioNode;
  /** Reverb send destination (null for none). */
  readonly wet?: AudioNode | null;
  /** Output level, 0..1. */
  readonly level?: number;
  /** Stereo position, -1..1. */
  readonly pan?: number;
  /** Detune in cents, applied to every oscillator, noise source, and filter. */
  readonly detune?: number;
  /** Called once, after the voice has disconnected. */
  readonly onDone?: (voice: Voice) => void;
}

let openVoices = 0;

/** Voices that have not yet cleaned up (for leak checks). */
export function openVoiceCount(): number {
  return openVoices;
}

export class Voice {
  readonly ctx: BaseAudioContext;
  readonly kit: Kit;
  readonly t: number;
  readonly detune: number;
  private readonly inGain: GainNode;
  private readonly panParam: AudioParam | null;
  private readonly wetDest: AudioNode | null;
  private wetGain: GainNode | null = null;
  private level: number;
  private readonly nodes: AudioNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];
  private live = 0;
  private closed = false;
  private readonly onDone: ((voice: Voice) => void) | undefined;

  constructor(init: VoiceInit) {
    this.ctx = init.ctx;
    this.kit = init.kit;
    this.t = init.time;
    this.detune = init.detune ?? 0;
    this.wetDest = init.wet ?? null;
    this.onDone = init.onDone;
    this.level = init.level ?? 1;
    this.inGain = this.ctx.createGain();
    this.inGain.gain.value = this.level;
    this.nodes.push(this.inGain);
    if (typeof this.ctx.createStereoPanner === 'function') {
      const p = this.ctx.createStereoPanner();
      p.pan.value = clamp(init.pan ?? 0, -1, 1);
      this.inGain.connect(p);
      p.connect(init.dest);
      this.nodes.push(p);
      this.panParam = p.pan;
    } else {
      this.inGain.connect(init.dest);
      this.panParam = null;
    }
    openVoices++;
  }

  /** True once every source has ended and the nodes are disconnected. */
  get done(): boolean {
    return this.closed;
  }

  /** The voice's dry input (before its level and pan). */
  get input(): AudioNode {
    return this.inGain;
  }

  /** The voice's reverb input (before its level), or null when it has no reverb. */
  get wetInput(): AudioNode | null {
    if (!this.wetDest) return null;
    if (!this.wetGain) {
      this.wetGain = this.ctx.createGain();
      this.wetGain.gain.value = this.level;
      this.wetGain.connect(this.wetDest);
      this.nodes.push(this.wetGain);
    }
    return this.wetGain;
  }

  gain(value = 0): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    this.nodes.push(g);
    return g;
  }

  filter(type: BiquadFilterType, freq: number, q = 0.707): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    if (this.detune !== 0) f.detune.value = this.detune;
    this.nodes.push(f);
    return f;
  }

  panner(pan: number): AudioNode {
    if (typeof this.ctx.createStereoPanner !== 'function') return this.gain(1);
    const p = this.ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    this.nodes.push(p);
    return p;
  }

  shaper(curve: Float32Array<ArrayBuffer>): WaveShaperNode {
    const s = this.ctx.createWaveShaper();
    s.curve = curve;
    this.nodes.push(s);
    return s;
  }

  delay(maxTime: number, time: number): DelayNode {
    const d = this.ctx.createDelay(maxTime);
    d.delayTime.value = time;
    this.nodes.push(d);
    return d;
  }

  /** An oscillator started at `start`; with no `stop` it runs until `Voice.stop`. */
  osc(type: OscillatorType, freq: number, start: number, stop?: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (this.detune !== 0) o.detune.value = this.detune;
    this.nodes.push(o);
    o.start(start);
    this.track(o, stop);
    return o;
  }

  /** Looping noise from a random offset; with no `stop` it runs until `Voice.stop`. */
  noise(color: NoiseColor, start: number, stop?: number, rate = 1): AudioBufferSourceNode {
    const buf = this.kit.noise(color);
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = rate;
    if (this.detune !== 0) s.detune.value = this.detune;
    this.nodes.push(s);
    s.start(start, Math.random() * buf.duration * 0.95);
    this.track(s, stop);
    return s;
  }

  /** Plays a buffer once (or looped). Without `loop` it stops by itself at the buffer's end. */
  play(
    buffer: AudioBuffer,
    start: number,
    opts: { loop?: boolean; rate?: number; offset?: number; duration?: number } = {},
  ): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = opts.loop === true;
    s.playbackRate.value = opts.rate ?? 1;
    this.nodes.push(s);
    const offset = clamp(opts.offset ?? 0, 0, Math.max(0, buffer.duration - 0.001));
    if (opts.duration !== undefined) s.start(start, offset, Math.max(0.001, opts.duration));
    else s.start(start, offset);
    this.track(s, undefined);
    return s;
  }

  /** A silent source that keeps a voice open until `Voice.stop` (for event-only loops). */
  keepAlive(): void {
    const c = this.ctx.createConstantSource();
    c.offset.value = 0;
    c.connect(this.inGain);
    this.nodes.push(c);
    c.start(this.t);
    this.track(c, undefined);
  }

  /** Routes a node into the voice's dry output, optionally through a level. */
  out(node: AudioNode, level?: number): void {
    if (level === undefined) {
      node.connect(this.inGain);
      return;
    }
    const g = this.gain(level);
    node.connect(g);
    g.connect(this.inGain);
  }

  /** Sends a node to the reverb (no-op when the voice has none). */
  send(node: AudioNode, amount: number): void {
    const wet = this.wetInput;
    if (!wet || amount <= 0) return;
    const g = this.gain(amount);
    node.connect(g);
    g.connect(wet);
  }

  setLevel(value: number, at: number, ramp: number): void {
    this.level = value;
    if (this.closed) return;
    rampParam(this.inGain.gain, value, at, ramp);
    if (this.wetGain) rampParam(this.wetGain.gain, value, at, ramp);
  }

  setPan(value: number, at: number, ramp: number): void {
    if (this.closed || !this.panParam) return;
    rampParam(this.panParam, clamp(value, -1, 1), at, ramp);
  }

  /** Stops every source at `at`. The voice disconnects once they have ended. */
  stop(at: number): void {
    if (this.closed) return;
    for (const s of this.sources) {
      try {
        s.stop(Math.max(at, this.t));
      } catch {
        // Already stopped.
      }
    }
    // Stopped before it ever starts: it will never sound, so release it now.
    if (at <= this.t) this.close();
  }

  /** Fast fade and stop (voice stealing). */
  kill(now: number): void {
    if (this.closed) return;
    this.setLevel(0, now, 0.015);
    this.stop(now + 0.03);
  }

  private track(src: AudioScheduledSourceNode, stop: number | undefined): void {
    if (stop !== undefined) src.stop(Math.max(stop, this.t + 0.001));
    this.sources.push(src);
    this.live++;
    src.onended = (): void => {
      this.live--;
      if (this.live <= 0) this.close();
    };
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    openVoices--;
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        // Already disconnected.
      }
    }
    for (const s of this.sources) s.onended = null;
    this.nodes.length = 0;
    this.sources.length = 0;
    this.onDone?.(this);
  }
}

// ---------------------------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------------------------

export interface BurstOpts {
  color?: NoiseColor;
  type?: BiquadFilterType;
  freq: number;
  q?: number;
  peak: number;
  attack?: number;
  decay: number;
  /** Extra high-pass (Hz) after the main filter. */
  hp?: number;
  rate?: number;
}

/** A burst of filtered noise with an attack-decay envelope. Returns its output gain. */
export function burst(v: Voice, t: number, o: BurstOpts): GainNode {
  const attack = o.attack ?? 0.001;
  const end = t + attack + o.decay;
  const src = v.noise(o.color ?? 'white', t, end + 0.02, o.rate ?? 1);
  const f = v.filter(o.type ?? 'bandpass', o.freq, o.q ?? 0.707);
  const g = v.gain(0);
  ad(g.gain, t, o.peak, attack, o.decay);
  src.connect(f);
  if (o.hp !== undefined) {
    const h = v.filter('highpass', o.hp, 0.707);
    f.connect(h);
    h.connect(g);
  } else {
    f.connect(g);
  }
  v.out(g);
  return g;
}

export interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  /** Glide target (Hz). */
  to?: number;
  /** Glide time (defaults to the whole note). */
  glide?: number;
  peak: number;
  attack?: number;
  decay: number;
  /** Optional low-pass (Hz). */
  lp?: number;
}

/** An oscillator with an attack-decay envelope and an optional glide. Returns its output gain. */
export function tone(v: Voice, t: number, o: ToneOpts): GainNode {
  const attack = o.attack ?? 0.002;
  const end = t + attack + o.decay;
  const osc = v.osc(o.type ?? 'sine', o.freq, t, end + 0.02);
  if (o.to !== undefined) glide(osc.frequency, t, o.freq, o.to, o.glide ?? attack + o.decay);
  const g = v.gain(0);
  ad(g.gain, t, o.peak, attack, o.decay);
  if (o.lp !== undefined) {
    const f = v.filter('lowpass', o.lp, 0.707);
    osc.connect(f);
    f.connect(g);
  } else {
    osc.connect(g);
  }
  v.out(g);
  return g;
}

/** A low thump: a sine with a fast pitch drop, softly saturated so small speakers still hear it. */
export function thump(
  v: Voice,
  t: number,
  from: number,
  to: number,
  drop: number,
  peak: number,
  decay: number,
): AudioNode {
  const o = v.osc('sine', from, t, t + 0.002 + decay + 0.03);
  glide(o.frequency, t, from, to, drop);
  const g = v.gain(0);
  ad(g.gain, t, peak, 0.002, decay);
  const sh = v.shaper(v.kit.softCurve(1.6));
  o.connect(g);
  g.connect(sh);
  v.out(sh);
  return sh;
}

/** Inharmonic sine partials (metal, glass, wood rings). */
export function partials(
  v: Voice,
  t: number,
  freqs: readonly number[],
  amps: readonly number[],
  decays: readonly number[],
): void {
  for (let i = 0; i < freqs.length; i++) {
    tone(v, t, { freq: freqs[i], peak: amps[i] ?? 0.01, attack: 0.001, decay: decays[i] ?? 0.1 });
  }
}

/** A beep: a soft square through a low-pass, with linear edges so it never clicks. */
function beep(v: Voice, t: number, freq: number, dur: number, peak: number, lp = 3200): GainNode {
  const o = v.osc('square', freq, t, t + dur + 0.02);
  const f = v.filter('lowpass', lp, 0.6);
  const g = v.gain(0);
  ahr(g.gain, t, peak, 0.004, Math.max(0.001, dur - 0.016), 0.012);
  chain(o, f, g);
  v.out(g);
  return g;
}

/** A soft UI blip: sine plus a quiet FM sparkle on the attack. */
function blip(v: Voice, t: number, freq: number, peak: number, decay: number): GainNode {
  const carrier = v.osc('sine', freq, t, t + decay + 0.03);
  const mod = v.osc('sine', freq * 2, t, t + decay + 0.03);
  const index = v.gain(0);
  index.gain.setValueAtTime(freq * 0.8, t);
  index.gain.exponentialRampToValueAtTime(1, t + Math.min(0.04, decay));
  mod.connect(index);
  index.connect(carrier.frequency);
  const g = v.gain(0);
  ad(g.gain, t, peak, 0.003, decay);
  carrier.connect(g);
  v.out(g);
  return g;
}

/**
 * A body of noise whose level jitters in tiny random steps (crunch, crackle, static), then filtered
 * so the steps soften. Returns the filter; the caller routes it.
 */
function grains(
  v: Voice,
  t: number,
  dur: number,
  peak: number,
  step: readonly [number, number],
  filterType: BiquadFilterType,
  freq: number,
  q: number,
): BiquadFilterNode {
  const n = v.noise('white', t, t + dur + 0.03);
  const g = v.gain(0);
  const f = v.filter(filterType, freq, q);
  let tt = t;
  let guard = 0;
  while (tt < t + dur && guard++ < 200) {
    const k = (tt - t) / dur;
    const shape = Math.sin(Math.PI * Math.min(1, k * 1.25 + 0.05));
    g.gain.setValueAtTime(peak * shape * rr(0.15, 1), tt);
    tt += rr(step[0], step[1]);
  }
  g.gain.setValueAtTime(0, t + dur);
  chain(n, g, f);
  return f;
}

// ---------------------------------------------------------------------------------------------
// Mix trims
// ---------------------------------------------------------------------------------------------

/**
 * Per-cue output trims in dB, from offline loudness measurements (loudest 50 ms window), so the
 * synthesized cues sit together: footsteps and UI around -36 dBFS, surveillance and mid hits
 * around -27, big impacts around -16, ambience beds around -36 RMS. Override files are untrimmed.
 */
const SFX_TRIM_DB: Partial<Record<SfxCue, number>> = {
  step_asphalt: 2,
  step_tile: 6.5,
  step_snow: -1,
  step_wood: -6,
  step_heavy: -7.5,
  servo: -2,
  dash: 8,
  scanner_sweep: -3,
  kiosk_beep: -2.5,
  kiosk_ok: -2,
  kiosk_fail: -2,
  van_screech: 2,
  hit_light: -1,
  hit_heavy: -3,
  baton_swing: 13,
  knockout: -4,
  shutdown: -1.5,
  reboot: -2,
  glitch: -5.5,
  stool_break: 2.5,
  bash: -1,
  ui_move: 2.5,
  ui_confirm: 1,
  ui_back: 1.5,
  ui_error: -3.5,
  type_tick: 5,
  phone_buzz: -2,
  pickup: 7,
  breath_ok: 5.5,
  breath_miss: -2,
  car_door: -3.5,
  car_start: 1.5,
  alarm_pop: 1.5,
  notice: 2,
  search: 12,
  plug_in: 1,
  unplug: 2.5,
  chat: -1.5,
  coffee: 2.5,
  gate_raise: -1,
  suspicion_thump: -6,
};
const LOOP_TRIM_DB: Partial<Record<LoopCue, number>> = {
  rain: 1,
  rain_heavy: -1,
  lamp_hum: -10,
  fluorescent: -3,
  siren: -2,
  station_room: 0.5,
  car_engine: -1,
  drone: 12,
  charging: -8,
  camp_night: 5,
  sea: 1.5,
  crowd: 11.5,
};

export function sfxTrim(cue: SfxCue): number {
  return Math.pow(10, (SFX_TRIM_DB[cue] ?? 0) / 20);
}

export function loopTrim(cue: LoopCue): number {
  return Math.pow(10, (LOOP_TRIM_DB[cue] ?? 0) / 20);
}

// ---------------------------------------------------------------------------------------------
// One-shot sound effects
// ---------------------------------------------------------------------------------------------

export type SfxVoice = (v: Voice) => void;

export const SFX: Record<SfxCue, SfxVoice> = {
  step_asphalt(v) {
    const t = v.t;
    burst(v, t, { freq: rr(1800, 2600), q: 0.9, peak: 0.16, decay: rr(0.035, 0.05), hp: 500 });
    burst(v, t + rr(0.008, 0.02), { type: 'highpass', freq: 3200, peak: 0.035, attack: 0.002, decay: 0.025 });
    burst(v, t, { color: 'brown', type: 'lowpass', freq: 320, peak: 0.3, attack: 0.002, decay: 0.05 });
  },

  step_tile(v) {
    const t = v.t;
    const click = burst(v, t, { freq: rr(3200, 4200), q: 2.2, peak: 0.22, attack: 0.0008, decay: 0.022 });
    tone(v, t, { freq: rr(1700, 2100), peak: 0.02, attack: 0.001, decay: 0.03 });
    burst(v, t, { color: 'brown', type: 'lowpass', freq: 380, peak: 0.2, attack: 0.001, decay: 0.035 });
    v.send(click, 0.35);
  },

  step_snow(v) {
    const t = v.t;
    v.out(grains(v, t, rr(0.11, 0.15), 0.4, [0.006, 0.016], 'lowpass', rr(1200, 1700), 0.6));
    burst(v, t, { color: 'brown', type: 'lowpass', freq: 220, peak: 0.16, attack: 0.01, decay: 0.08 });
  },

  step_wood(v) {
    const t = v.t;
    const f = rr(170, 230);
    burst(v, t, { freq: 1400, q: 1.2, peak: 0.08, attack: 0.0008, decay: 0.018 });
    const body = tone(v, t, { freq: f * 1.05, to: f, glide: 0.03, peak: 0.2, attack: 0.002, decay: 0.09 });
    tone(v, t, { freq: f * 2.4, peak: 0.05, attack: 0.001, decay: 0.05 });
    burst(v, t, { freq: f * 3, q: 6, peak: 0.14, attack: 0.001, decay: 0.06 });
    v.send(body, 0.25);
  },

  step_heavy(v) {
    const t = v.t;
    thump(v, t, 95, 42, 0.09, 0.42, 0.18);
    burst(v, t, {
      color: 'brown',
      type: 'lowpass',
      freq: 520,
      q: 0.7,
      peak: 0.38,
      attack: 0.002,
      decay: 0.11,
    });
    burst(v, t, { freq: 1600, q: 1, peak: 0.05, attack: 0.001, decay: 0.04 });
    partials(v, t + 0.004, [rr(310, 350), rr(505, 545)], [0.022, 0.016], [0.12, 0.09]);
  },

  servo(v) {
    const t = v.t;
    const f = rr(700, 1000);
    const o = v.osc('sawtooth', f, t, t + 0.25);
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * rr(1.25, 1.45), t + 0.12);
    o.frequency.linearRampToValueAtTime(f * 1.1, t + 0.2);
    const bp = v.filter('bandpass', 1400, 2.5);
    const am = v.gain(0.6);
    const lfo = v.osc('square', rr(45, 70), t, t + 0.25);
    const depth = v.gain(0.4);
    lfo.connect(depth);
    depth.connect(am.gain);
    const g = v.gain(0);
    ahr(g.gain, t, 0.05, 0.02, 0.1, 0.08);
    chain(o, bp, am, g);
    v.out(g);
  },

  dash(v) {
    const t = v.t;
    const n = v.noise('white', t, t + 0.45);
    const bp = v.filter('bandpass', 500, 2.8);
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(3800, t + 0.12);
    bp.frequency.exponentialRampToValueAtTime(900, t + 0.34);
    const g = v.gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.4, t + 0.07);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    chain(n, bp, g);
    v.out(g);
    // A short comb on the whoosh makes it ring like metal rather than air.
    const comb = v.delay(0.02, 0.005);
    comb.delayTime.setValueAtTime(0.005, t);
    comb.delayTime.linearRampToValueAtTime(0.003, t + 0.3);
    const fb = v.gain(0.55);
    g.connect(comb);
    comb.connect(fb);
    fb.connect(comb);
    v.out(comb, 0.55);
    tone(v, t, { freq: 220, to: 1600, glide: 0.14, peak: 0.04, attack: 0.01, decay: 0.15 });
    v.send(g, 0.2);
  },

  scanner_sweep(v) {
    const t = v.t;
    const dur = 0.95;
    const o = v.osc('sine', 650, t, t + dur + 0.05);
    glide(o.frequency, t, 650, 1900, 0.75);
    o.frequency.linearRampToValueAtTime(1700, t + dur);
    const o2 = v.osc('triangle', 975, t, t + dur + 0.05);
    glide(o2.frequency, t, 975, 2850, 0.75);
    o2.frequency.linearRampToValueAtTime(2550, t + dur);
    const o2g = v.gain(0.12);
    o2.connect(o2g);
    const trem = v.gain(0.65);
    const lfo = v.osc('sine', 11, t, t + dur + 0.05);
    const depth = v.gain(0.35);
    lfo.connect(depth);
    depth.connect(trem.gain);
    const g = v.gain(0);
    ahr(g.gain, t, 0.15, 0.06, dur - 0.24, 0.18);
    o.connect(trem);
    o2g.connect(trem);
    trem.connect(g);
    v.out(g);
    const n = v.noise('white', t, t + dur + 0.05);
    const nf = v.filter('bandpass', 6000, 0.8);
    const ng = v.gain(0);
    ahr(ng.gain, t, 0.05, 0.1, dur - 0.3, 0.2);
    chain(n, nf, ng);
    v.out(ng);
    v.send(g, 0.25);
  },

  kiosk_beep(v) {
    beep(v, v.t, 1568, 0.085, 0.07, 3600);
  },

  kiosk_ok(v) {
    const t = v.t;
    beep(v, t, 1318, 0.07, 0.065, 3600);
    beep(v, t + 0.1, 1760, 0.09, 0.065, 3600);
  },

  kiosk_fail(v) {
    const t = v.t;
    const a = beep(v, t, 392, 0.13, 0.08, 1800);
    const b = beep(v, t + 0.17, 294, 0.22, 0.08, 1800);
    v.send(a, 0.1);
    v.send(b, 0.1);
  },

  van_screech(v) {
    const t = v.t;
    const dur = rr(0.9, 1.2);
    const f0 = rr(1250, 1500);
    const end = t + dur + 0.35;
    const o = v.osc('sawtooth', f0, t, end);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * 0.78, t + dur);
    const wob = v.osc('sine', rr(6, 9), t, end);
    const wobDepth = v.gain(f0 * 0.03);
    wob.connect(wobDepth);
    wobDepth.connect(o.frequency);
    const obp = v.filter('bandpass', f0 * 0.9, 3);
    const og = v.gain(0.08);
    chain(o, obp, og);
    const n = v.noise('white', t, end);
    const nbp = v.filter('bandpass', f0, 14);
    nbp.frequency.setValueAtTime(f0, t);
    nbp.frequency.linearRampToValueAtTime(f0 * 0.8, t + dur);
    const ng = v.gain(1.4);
    chain(n, nbp, ng);
    const lp = v.filter('lowpass', 3200, 0.7);
    const env = v.gain(0);
    ahr(env.gain, t, 0.5, 0.05, dur, 0.28);
    og.connect(lp);
    ng.connect(lp);
    lp.connect(env);
    v.out(env);
    burst(v, t, { color: 'brown', type: 'lowpass', freq: 180, peak: 0.25, attack: 0.08, decay: dur });
    v.send(env, 0.18);
  },

  hit_light(v) {
    const t = v.t;
    burst(v, t, { freq: 1900, q: 1, peak: 0.3, decay: 0.05 });
    thump(v, t, 150, 80, 0.05, 0.3, 0.08);
    partials(v, t, [2700, 4100], [0.025, 0.012], [0.05, 0.03]);
  },

  hit_heavy(v) {
    const t = v.t;
    thump(v, t, 110, 40, 0.12, 0.55, 0.22);
    const body = burst(v, t, { color: 'brown', type: 'lowpass', freq: 900, peak: 0.5, decay: 0.16 });
    burst(v, t, { freq: 1400, q: 0.8, peak: 0.18, decay: 0.06 });
    partials(v, t, [410, 677, 1130], [0.045, 0.03, 0.018], [0.35, 0.25, 0.18]);
    v.send(body, 0.2);
  },

  baton_swing(v) {
    const t = v.t;
    const n = v.noise('white', t, t + 0.3);
    const bp = v.filter('bandpass', 700, 1.5);
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.09);
    bp.frequency.exponentialRampToValueAtTime(1000, t + 0.22);
    const g = v.gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    chain(n, bp, g);
    v.out(g);
    // The baton's live tip: a gated buzz.
    const buzz = v.osc('sawtooth', 120, t, t + 0.26);
    const bbp = v.filter('bandpass', 2600, 2);
    const gate = v.gain(0);
    let tt = t;
    while (tt < t + 0.22) {
      gate.gain.setValueAtTime(Math.random() < 0.6 ? rr(0.03, 0.07) : 0, tt);
      tt += rr(0.008, 0.02);
    }
    gate.gain.setValueAtTime(0, t + 0.22);
    chain(buzz, bbp, gate);
    v.out(gate);
  },

  emp_charge(v) {
    const t = v.t;
    const dur = 0.8;
    const end = t + dur + 0.06;
    const o = v.osc('sawtooth', 280, t, end);
    glide(o.frequency, t, 280, 2400, dur);
    const o2 = v.osc('sine', 560, t, end);
    glide(o2.frequency, t, 560, 4800, dur);
    const vib = v.osc('sine', 7, t, end);
    vib.frequency.linearRampToValueAtTime(15, t + dur);
    const vibDepth = v.gain(0);
    vibDepth.gain.setValueAtTime(0, t);
    vibDepth.gain.linearRampToValueAtTime(60, t + dur);
    vib.connect(vibDepth);
    vibDepth.connect(o.frequency);
    vibDepth.connect(o2.frequency);
    const lp = v.filter('lowpass', 3500, 0.8);
    const o2g = v.gain(0.3);
    o2.connect(o2g);
    o2g.connect(lp);
    o.connect(lp);
    const g = v.gain(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + dur - 0.02);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.03);
    lp.connect(g);
    v.out(g);
    const n = v.noise('white', t, end);
    const hp = v.filter('highpass', 2000, 0.7);
    glide(hp.frequency, t, 2000, 7000, dur);
    const ng = v.gain(0);
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.04, t + dur - 0.02);
    ng.gain.linearRampToValueAtTime(0, t + dur + 0.03);
    chain(n, hp, ng);
    v.out(ng);
  },

  emp_shot(v) {
    const t = v.t;
    const end = t + 0.36;
    const carrier = v.osc('sine', 2600, t, end);
    glide(carrier.frequency, t, 2600, 160, 0.28);
    const mod = v.osc('sine', 3900, t, end);
    glide(mod.frequency, t, 3900, 240, 0.28);
    const index = v.gain(0);
    index.gain.setValueAtTime(4800, t);
    index.gain.exponentialRampToValueAtTime(40, t + 0.25);
    mod.connect(index);
    index.connect(carrier.frequency);
    const crush = v.shaper(v.kit.crushCurve(6));
    const lp = v.filter('lowpass', 5200, 0.7);
    const g = v.gain(0);
    ad(g.gain, t, 0.24, 0.002, 0.32);
    chain(carrier, crush, lp, g);
    v.out(g);
    burst(v, t, { type: 'highpass', freq: 2500, peak: 0.2, decay: 0.12 });
    thump(v, t, 95, 48, 0.1, 0.3, 0.2);
    v.send(g, 0.3);
  },

  knockout(v) {
    const t = v.t;
    thump(v, t, 85, 40, 0.12, 0.5, 0.28);
    burst(v, t, { color: 'brown', type: 'lowpass', freq: 450, peak: 0.4, attack: 0.004, decay: 0.22 });
    burst(v, t, { freq: 2800, q: 0.8, peak: 0.04, attack: 0.01, decay: 0.09 });
    thump(v, t + rr(0.1, 0.15), 120, 70, 0.05, 0.16, 0.1);
  },

  shutdown(v) {
    const t = v.t;
    const end = t + 1.25;
    const o = v.osc('sawtooth', 220, t, end);
    glide(o.frequency, t, 220, 30, 1.1);
    const o2 = v.osc('sine', 440, t, end);
    glide(o2.frequency, t, 440, 55, 1.1);
    const o2g = v.gain(0.5);
    o2.connect(o2g);
    const lp = v.filter('lowpass', 2000, 1.2);
    glide(lp.frequency, t, 2000, 150, 1.1);
    o.connect(lp);
    o2g.connect(lp);
    const g = v.gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.14, t + 0.02);
    // A few stutters as the power gives out.
    for (const s of [0.07, 0.14, 0.26]) {
      g.gain.setValueAtTime(0.02, t + s);
      g.gain.setValueAtTime(0.13, t + s + 0.025);
    }
    g.gain.setValueAtTime(0.13, t + 0.9);
    g.gain.linearRampToValueAtTime(0, t + 1.2);
    lp.connect(g);
    v.out(g);
    burst(v, t + 1.15, { type: 'highpass', freq: 2000, peak: 0.07, decay: 0.01 });
    v.send(g, 0.15);
  },

  reboot(v) {
    const t = v.t;
    burst(v, t, { type: 'highpass', freq: 2500, peak: 0.09, decay: 0.008 });
    const o = v.osc('sine', 90, t, t + 0.75);
    glide(o.frequency, t, 90, 520, 0.6);
    const lp = v.filter('lowpass', 1500, 0.7);
    const g = v.gain(0);
    ahr(g.gain, t, 0.12, 0.1, 0.4, 0.2);
    chain(o, lp, g);
    v.out(g);
    const hum = v.osc('sawtooth', 110, t, t + 0.95);
    const hl = v.filter('lowpass', 400, 0.7);
    const hg = v.gain(0);
    ahr(hg.gain, t, 0.04, 0.5, 0.1, 0.3);
    chain(hum, hl, hg);
    v.out(hg);
    blip(v, t + 0.55, 880, 0.045, 0.09);
    blip(v, t + 0.7, 1175, 0.045, 0.09);
    const last = blip(v, t + 0.85, 1568, 0.05, 0.14);
    v.send(last, 0.2);
  },

  glitch(v) {
    const t = v.t;
    const buf = v.kit.glitch();
    const crush = v.shaper(v.kit.crushCurve(5));
    const bp = v.filter('bandpass', 1800, 0.5);
    const g = v.gain(0.5);
    chain(crush, bp, g);
    v.out(g);
    const reps = 3 + Math.floor(Math.random() * 5);
    let slice = rr(0.025, 0.07);
    let offset = rr(0, buf.duration - 0.1);
    let tt = t;
    for (let i = 0; i < reps; i++) {
      if (Math.random() < 0.3) offset = rr(0, buf.duration - 0.1);
      if (Math.random() < 0.25) slice *= 0.5;
      const rate = pick([1, 1, 0.5, 2, 0.75, 1.5]);
      const src = v.play(buf, tt, { offset, duration: slice * rate, rate });
      const env = v.gain(0);
      ahr(env.gain, tt, rr(0.5, 1), 0.002, Math.max(0.002, slice - 0.006), 0.004);
      src.connect(env);
      env.connect(crush);
      tt += slice * rr(0.9, 1.5);
    }
  },

  stool_break(v) {
    const t = v.t;
    burst(v, t, { freq: 2800, q: 1.2, peak: 0.35, attack: 0.0005, decay: 0.03 });
    partials(v, t, [rr(180, 220), rr(410, 470)], [0.16, 0.06], [0.12, 0.08]);
    thump(v, t + 0.05, 100, 55, 0.06, 0.26, 0.15);
    const knocks = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < knocks; i++) {
      const tt = t + rr(0.06, 0.6);
      const fade = 1 - (tt - t) / 0.7;
      burst(v, tt, { freq: rr(400, 1100), q: 5, peak: 0.13 * fade, decay: 0.04 });
      tone(v, tt, { freq: rr(250, 600), peak: 0.05 * fade, attack: 0.001, decay: 0.05 });
    }
    const body = burst(v, t, { color: 'brown', type: 'lowpass', freq: 700, peak: 0.25, decay: 0.12 });
    v.send(body, 0.25);
  },

  bash(v) {
    const t = v.t;
    thump(v, t, 120, 45, 0.1, 0.55, 0.25);
    const body = burst(v, t, { color: 'brown', type: 'lowpass', freq: 1100, peak: 0.5, decay: 0.15 });
    burst(v, t, { freq: 2200, q: 0.7, peak: 0.22, decay: 0.05 });
    partials(v, t, [380, 920, 1490, 2210], [0.05, 0.04, 0.025, 0.015], [0.45, 0.35, 0.25, 0.2]);
    v.send(body, 0.3);
  },

  shove(v) {
    const t = v.t;
    const n = v.noise('white', t, t + 0.22);
    const bp = v.filter('bandpass', 900, 0.8);
    glide(bp.frequency, t, 900, 1500, 0.15);
    const g = v.gain(0);
    ad(g.gain, t, 0.16, 0.03, 0.14);
    chain(n, bp, g);
    v.out(g);
    thump(v, t + 0.05, 110, 70, 0.06, 0.22, 0.1);
    burst(v, t + 0.04, { type: 'highpass', freq: 3500, peak: 0.03, attack: 0.005, decay: 0.06 });
  },

  thunder(v) {
    const t = v.t;
    const dur = rr(4.5, 6.5);
    const near = Math.random() < 0.5;
    const end = t + dur + 0.6;
    if (near) {
      burst(v, t, { type: 'lowpass', freq: 4000, peak: 0.35, attack: 0.002, decay: 0.25 });
      burst(v, t, { color: 'brown', type: 'lowpass', freq: 1200, peak: 0.6, attack: 0.003, decay: 0.45 });
    }
    const n = v.noise('brown', t, end);
    const lp = v.filter('lowpass', near ? 1800 : 700, 0.6);
    glide(lp.frequency, t, near ? 1800 : 700, 90, dur * 0.7);
    const g = v.gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(near ? 0.75 : 0.55, t + (near ? 0.08 : 0.6));
    const rolls = 3 + Math.floor(Math.random() * 4);
    let tt = t + (near ? 0.3 : 0.9);
    for (let i = 0; i < rolls && tt < t + dur * 0.8; i++) {
      const left = 1 - (tt - t) / dur;
      g.gain.setTargetAtTime(rr(0.3, 0.8) * Math.max(0.15, left), tt, rr(0.15, 0.4));
      tt += rr(0.35, 1.1);
    }
    g.gain.setTargetAtTime(0, Math.max(tt, t + dur * 0.6), dur * 0.12);
    g.gain.setValueAtTime(0, end - 0.02);
    chain(n, lp, g);
    v.out(g);
    const sub = v.noise('brown', t, end);
    const sl = v.filter('lowpass', 70, 0.7);
    const sg = v.gain(0);
    ahr(sg.gain, t, 0.5, near ? 0.05 : 0.5, dur * 0.35, dur * 0.5);
    chain(sub, sl, sg);
    v.out(sg);
    v.send(g, 0.4);
  },

  ship_horn(v) {
    const t = v.t;
    const dur = rr(2.8, 3.4);
    const end = t + 0.35 + dur + 1.3;
    const lp = v.filter('lowpass', 300, 2);
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.linearRampToValueAtTime(650, t + 0.4);
    lp.frequency.linearRampToValueAtTime(520, t + 1.2);
    const formant = v.filter('peaking', 310, 1.2);
    formant.gain.value = 6;
    const g = v.gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.35);
    g.gain.setValueAtTime(0.5, t + 0.35 + dur);
    g.gain.linearRampToValueAtTime(0, t + 0.35 + dur + 1.2);
    const tones: readonly (readonly [number, number])[] = [
      [73.4, 0.2],
      [87.3, 0.15],
    ];
    for (const [f, a] of tones) {
      const tg = v.gain(a);
      for (const cents of [-8, 8]) {
        const o = v.osc('sawtooth', f, t, end);
        o.detune.value = cents;
        // The horn sags as the air runs out.
        o.frequency.setValueAtTime(f, t + 0.35 + dur);
        o.frequency.linearRampToValueAtTime(f * 0.97, t + 0.35 + dur + 1.2);
        o.connect(tg);
      }
      const body = v.osc('triangle', f, t, end);
      body.connect(tg);
      tg.connect(lp);
    }
    chain(lp, formant, g);
    v.out(g);
    v.send(g, 0.55);
  },

  ui_move(v) {
    const t = v.t;
    tone(v, t, { freq: 1046, peak: 0.07, attack: 0.002, decay: 0.045, lp: 5000 });
    tone(v, t, { type: 'triangle', freq: 2093, peak: 0.012, attack: 0.002, decay: 0.03 });
  },

  ui_confirm(v) {
    const t = v.t;
    blip(v, t, 784, 0.08, 0.09);
    blip(v, t + 0.055, 1175, 0.08, 0.13);
  },

  ui_back(v) {
    const t = v.t;
    blip(v, t, 880, 0.07, 0.07);
    blip(v, t + 0.05, 659, 0.07, 0.1);
  },

  ui_error(v) {
    const t = v.t;
    for (const s of [0, 0.13]) {
      const a = v.osc('square', 196, t + s, t + s + 0.11);
      const b = v.osc('square', 207, t + s, t + s + 0.11);
      const lp = v.filter('lowpass', 900, 0.7);
      const g = v.gain(0);
      ahr(g.gain, t + s, 0.035, 0.004, 0.07, 0.02);
      a.connect(lp);
      b.connect(lp);
      lp.connect(g);
      v.out(g);
    }
  },

  type_tick(v) {
    const src = v.play(v.kit.tick, v.t, { rate: rr(0.85, 1.2) });
    v.out(src, 0.05);
  },

  phone_buzz(v) {
    const t = v.t;
    for (const s of [0, 0.34]) {
      const t0 = t + s;
      const o = v.osc('square', 155, t0, t0 + 0.25);
      const bp = v.filter('bandpass', 310, 0.7);
      const lp = v.filter('lowpass', 1400, 0.7);
      const am = v.gain(0.6);
      const rattle = v.osc('square', 31, t0, t0 + 0.25);
      const depth = v.gain(0.4);
      rattle.connect(depth);
      depth.connect(am.gain);
      const g = v.gain(0);
      ahr(g.gain, t0, 0.14, 0.01, 0.2, 0.02);
      chain(o, bp, lp, am, g);
      v.out(g);
      burst(v, t0, { freq: 2000, q: 2, peak: 0.012, attack: 0.01, decay: 0.2 });
    }
  },

  pickup(v) {
    const t = v.t;
    burst(v, t, { freq: 2400, q: 2, peak: 0.12, decay: 0.02 });
    burst(v, t, { color: 'brown', type: 'lowpass', freq: 500, peak: 0.12, decay: 0.03 });
    tone(v, t + 0.02, { freq: 1318, to: 1760, glide: 0.04, peak: 0.04, attack: 0.004, decay: 0.12 });
  },

  breath_beat(v) {
    const t = v.t;
    tone(v, t, { freq: 392, to: 370, peak: 0.09, attack: 0.01, decay: 0.22, lp: 2000 });
    tone(v, t, { freq: 784, peak: 0.015, attack: 0.01, decay: 0.12 });
    const n = v.noise('pink', t, t + 0.3);
    const bp = v.filter('bandpass', 1200, 1);
    const g = v.gain(0);
    ahr(g.gain, t, 0.05, 0.06, 0.05, 0.15);
    chain(n, bp, g);
    v.out(g);
  },

  breath_ok(v) {
    const t = v.t;
    const n = v.noise('pink', t, t + 0.55);
    const bp = v.filter('bandpass', 1100, 1.2);
    glide(bp.frequency, t, 1100, 700, 0.45);
    const lp = v.filter('lowpass', 2500, 0.7);
    const g = v.gain(0);
    ahr(g.gain, t, 0.22, 0.08, 0.15, 0.25);
    chain(n, bp, lp, g);
    v.out(g);
    tone(v, t, { freq: 587, peak: 0.025, attack: 0.02, decay: 0.2 });
  },

  breath_miss(v) {
    const t = v.t;
    const a = v.osc('sine', 147, t, t + 0.3);
    const b = v.osc('square', 151, t, t + 0.3);
    const bg = v.gain(0.25);
    b.connect(bg);
    const lp = v.filter('lowpass', 600, 0.7);
    const g = v.gain(0);
    ad(g.gain, t, 0.12, 0.005, 0.25);
    a.connect(lp);
    bg.connect(lp);
    lp.connect(g);
    v.out(g);
    const crush = v.shaper(v.kit.crushCurve(4));
    grains(v, t, 0.12, 0.08, [0.004, 0.012], 'bandpass', 3000, 1).connect(crush);
    v.out(crush, 0.5);
  },

  car_door(v) {
    const t = v.t;
    thump(v, t, 95, 48, 0.07, 0.45, 0.16);
    const body = burst(v, t, { color: 'brown', type: 'lowpass', freq: 600, peak: 0.4, decay: 0.12 });
    burst(v, t + 0.015, { freq: 3200, q: 2, peak: 0.12, decay: 0.012 });
    tone(v, t + 0.015, { freq: 2400, peak: 0.015, attack: 0.001, decay: 0.03 });
    burst(v, t + 0.05, { freq: 1200, q: 3, peak: 0.05, decay: 0.06 });
    v.send(body, 0.12);
  },

  car_start(v) {
    const t = v.t;
    burst(v, t, { freq: 1500, q: 2, peak: 0.15, decay: 0.02 });
    thump(v, t, 160, 100, 0.03, 0.1, 0.05);
    const w = v.osc('sine', 180, t + 0.05, t + 1.4);
    glide(w.frequency, t + 0.05, 180, 1150, 0.9);
    const w2 = v.osc('sine', 360, t + 0.05, t + 1.4);
    glide(w2.frequency, t + 0.05, 360, 2300, 0.9);
    const wg = v.gain(0);
    ahr(wg.gain, t + 0.05, 0.03, 0.15, 0.6, 0.5);
    const w2g = v.gain(0.3);
    w.connect(wg);
    w2.connect(w2g);
    w2g.connect(wg);
    v.out(wg);
    const hum = v.osc('sawtooth', 50, t + 0.1, t + 1.8);
    hum.frequency.linearRampToValueAtTime(75, t + 1);
    const hl = v.filter('lowpass', 250, 0.7);
    const hg = v.gain(0);
    ahr(hg.gain, t + 0.1, 0.08, 0.3, 0.7, 0.6);
    chain(hum, hl, hg);
    v.out(hg);
  },

  alarm_pop(v) {
    const t = v.t;
    for (const f of [740, 1047]) {
      const o = v.osc('square', f, t, t + 0.2);
      glide(o.frequency, t, f, f * 0.97, 0.16);
      const lp = v.filter('lowpass', 3500, 0.7);
      const g = v.gain(0);
      ad(g.gain, t, 0.07, 0.002, 0.16);
      chain(o, lp, g);
      v.out(g);
      v.send(g, 0.15);
    }
    burst(v, t, { type: 'highpass', freq: 2500, peak: 0.1, decay: 0.03 });
    thump(v, t, 130, 80, 0.05, 0.22, 0.12);
  },

  notice(v) {
    const t = v.t;
    tone(v, t, { freq: 1046, to: 1244, glide: 0.06, peak: 0.06, attack: 0.004, decay: 0.12 });
    tone(v, t, { freq: 2093, peak: 0.008, attack: 0.004, decay: 0.08 });
  },

  search(v) {
    const t = v.t;
    const dur = rr(0.45, 0.7);
    const rustles = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < rustles; i++) {
      const tt = t + rr(0, dur);
      burst(v, tt, {
        freq: rr(900, 3200),
        q: rr(0.8, 2),
        peak: rr(0.04, 0.1),
        attack: 0.004,
        decay: rr(0.03, 0.08),
      });
    }
    const clicks = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < clicks; i++) {
      const tt = t + rr(0.05, dur);
      burst(v, tt, { freq: rr(1500, 2500), q: 4, peak: 0.07, decay: 0.01 });
      tone(v, tt, { freq: rr(600, 1200), peak: 0.018, attack: 0.001, decay: 0.05 });
    }
  },

  plug_in(v) {
    const t = v.t;
    burst(v, t, { freq: 4000, q: 1.5, peak: 0.14, decay: 0.006 });
    burst(v, t + 0.02, { freq: 700, q: 3, peak: 0.2, decay: 0.035 });
    thump(v, t + 0.02, 200, 140, 0.03, 0.09, 0.04);
    for (const [f, a] of [
      [120, 0.035],
      [240, 0.015],
    ] as const) {
      const o = v.osc('sine', f, t + 0.08, t + 0.4);
      const g = v.gain(0);
      ahr(g.gain, t + 0.08, a, 0.05, 0.1, 0.15);
      o.connect(g);
      v.out(g);
    }
    tone(v, t + 0.15, { freq: 660, to: 880, glide: 0.05, peak: 0.025, attack: 0.005, decay: 0.15 });
  },

  unplug(v) {
    const t = v.t;
    burst(v, t, { freq: 650, q: 3, peak: 0.18, decay: 0.03 });
    thump(v, t, 180, 120, 0.03, 0.08, 0.04);
    tone(v, t, { freq: 240, to: 90, glide: 0.2, peak: 0.03, attack: 0.005, decay: 0.2 });
    burst(v, t + 0.05, { freq: 3800, q: 1.5, peak: 0.1, decay: 0.006 });
  },

  chat(v) {
    const t = v.t;
    const syllables = 3 + Math.floor(Math.random() * 3);
    let tt = t;
    const lens: number[] = [];
    for (let i = 0; i < syllables; i++) {
      const len = rr(0.08, 0.16);
      lens.push(len);
      tt += len + rr(0.03, 0.08);
    }
    const end = tt + 0.05;
    const f0 = rr(110, 190);
    const src = v.osc('sawtooth', f0, t, end);
    const breath = v.noise('pink', t, end);
    const f1 = v.filter('bandpass', rr(400, 750), 4);
    const f2 = v.filter('bandpass', rr(1100, 1900), 6);
    const mix = v.gain(1);
    const bg = v.gain(0.3);
    src.connect(f1);
    src.connect(f2);
    breath.connect(bg);
    bg.connect(f1);
    f1.connect(mix);
    f2.connect(mix);
    const lp = v.filter('lowpass', 1800, 0.7);
    const env = v.gain(0);
    mix.connect(lp);
    lp.connect(env);
    v.out(env);
    tt = t;
    for (const len of lens) {
      src.frequency.setValueAtTime(f0 * rr(0.9, 1.15), tt);
      src.frequency.linearRampToValueAtTime(f0 * rr(0.85, 1.1), tt + len);
      f1.frequency.setTargetAtTime(rr(400, 800), tt, 0.03);
      f2.frequency.setTargetAtTime(rr(1100, 2000), tt, 0.03);
      env.gain.setValueAtTime(0, tt);
      env.gain.linearRampToValueAtTime(rr(0.18, 0.3), tt + 0.025);
      env.gain.linearRampToValueAtTime(0, tt + len);
      tt += len + rr(0.03, 0.08);
    }
  },

  coffee(v) {
    const t = v.t;
    const dur = rr(0.8, 1);
    const n = v.noise('white', t, t + dur + 0.05);
    const bp = v.filter('bandpass', 900, 3);
    let tt = t;
    while (tt < t + dur) {
      const k = (tt - t) / dur;
      bp.frequency.setValueAtTime((900 + 700 * k) * rr(0.8, 1.5), tt);
      tt += rr(0.015, 0.035);
    }
    const lp = v.filter('lowpass', 3000, 0.7);
    const g = v.gain(0);
    ahr(g.gain, t, 0.22, 0.05, dur - 0.2, 0.15);
    chain(n, bp, lp, g);
    v.out(g);
    const glug = v.noise('brown', t, t + dur + 0.05);
    const gf = v.filter('bandpass', 350, 2);
    const gg = v.gain(0);
    ahr(gg.gain, t, 0.12, 0.05, dur - 0.2, 0.15);
    chain(glug, gf, gg);
    v.out(gg);
    partials(v, t + dur, [2640, 3960, 5200], [0.02, 0.012, 0.006], [0.15, 0.1, 0.07]);
  },

  gate_raise(v) {
    const t = v.t;
    thump(v, t, 110, 60, 0.06, 0.28, 0.12);
    burst(v, t, { freq: 900, q: 2, peak: 0.13, decay: 0.05 });
    const end = t + 1.6;
    const mix = v.gain(1);
    for (const k of [1, 1.01]) {
      const o = v.osc('sawtooth', 85 * k, t + 0.05, end);
      o.frequency.linearRampToValueAtTime(120 * k, t + 1.4);
      o.connect(mix);
    }
    const lp = v.filter('lowpass', 700, 1.5);
    const wob = v.gain(0.85);
    const lfo = v.osc('sine', 9, t + 0.05, end);
    const depth = v.gain(0.15);
    lfo.connect(depth);
    depth.connect(wob.gain);
    const g = v.gain(0);
    ahr(g.gain, t + 0.05, 0.06, 0.15, 1.15, 0.25);
    chain(mix, lp, wob, g);
    v.out(g);
    tone(v, t + 0.1, { freq: 850, to: 1100, glide: 1.3, peak: 0.008, attack: 0.2, decay: 1.2 });
    thump(v, t + 1.55, 120, 70, 0.05, 0.22, 0.1);
    partials(v, t + 1.55, [520, 1310], [0.025, 0.012], [0.2, 0.12]);
    v.send(g, 0.2);
  },

  crash(v) {
    const t = v.t;
    thump(v, t, 100, 35, 0.15, 0.65, 0.4);
    const n = v.noise('white', t, t + 0.8);
    const lp = v.filter('lowpass', 6000, 0.7);
    glide(lp.frequency, t, 6000, 600, 0.5);
    const g = v.gain(0);
    ad(g.gain, t, 0.45, 0.002, 0.6);
    chain(n, lp, g);
    v.out(g);
    burst(v, t, { color: 'brown', type: 'lowpass', freq: 800, peak: 0.55, decay: 0.5 });
    partials(
      v,
      t,
      [rr(300, 320), rr(510, 540), rr(850, 890), rr(1320, 1360), rr(2100, 2200)],
      [0.05, 0.04, 0.03, 0.025, 0.02],
      [0.5, 0.4, 0.3, 0.25, 0.2],
    );
    for (let i = 0; i < 4; i++) {
      burst(v, t + rr(0, 0.3), { freq: rr(1500, 4000), q: 4, peak: 0.12, decay: 0.03 });
    }
    const debris = 8 + Math.floor(Math.random() * 7);
    for (let i = 0; i < debris; i++) {
      const tt = t + rr(0.2, 1.2);
      tone(v, tt, { freq: rr(2500, 6000), peak: rr(0.01, 0.035), attack: 0.001, decay: rr(0.03, 0.1) });
      burst(v, tt, { type: 'highpass', freq: 4000, peak: 0.03, decay: 0.01 });
    }
    v.send(g, 0.3);
  },

  suspicion_thump(v) {
    const t = v.t;
    const low = thump(v, t, 92, 52, 0.06, 0.5, 0.2);
    // A slightly inharmonic upper partial: the "servo" in the heartbeat, and audible on laptops.
    tone(v, t, { freq: 190, to: 108, glide: 0.06, peak: 0.08, attack: 0.002, decay: 0.12 });
    burst(v, t, { freq: 4000, q: 0.7, peak: 0.04, attack: 0.0005, decay: 0.006, hp: 2500 });
    v.send(low, 0.08);
  },
};

// ---------------------------------------------------------------------------------------------
// Loops: persistent beds plus randomly scheduled events
// ---------------------------------------------------------------------------------------------

/** Schedules random events up to `until`. Called every frame (or so) by the engine. */
export type Ticker = (now: number, until: number) => void;

/** Runs `fn` at random intervals. `fn` may return a number to override the next gap. */
export class Every {
  private next: number;

  constructor(
    first: number,
    private readonly gap: () => number,
    private readonly fn: (t: number) => unknown,
  ) {
    this.next = first;
  }

  run(now: number, until: number): void {
    // After a long stall, skip the missed events instead of firing them all at once.
    if (this.next < now - 0.5) this.next = now + Math.random() * this.gap() * 0.5;
    let guard = 0;
    while (this.next < until && guard++ < 64) {
      const r = this.fn(this.next);
      const g = typeof r === 'number' && r > 0 ? r : this.gap();
      this.next += Math.max(0.005, g);
    }
  }
}

/** A loop: a persistent bed voice (its level and pan are the handle's) plus short event voices. */
export class LoopVoice {
  readonly bed: Voice;
  private readonly events: Voice[] = [];
  private ticker: Ticker | null = null;

  constructor(init: VoiceInit) {
    this.bed = new Voice(init);
    this.bed.keepAlive();
  }

  get t(): number {
    return this.bed.t;
  }

  /** Builds the loop's sound. */
  start(build: LoopBuild): void {
    this.ticker = build(this);
  }

  /** A short voice routed through this loop's level, pan, and reverb. */
  event(t: number, pan = 0, level = 1): Voice {
    const v = new Voice({
      ctx: this.bed.ctx,
      kit: this.bed.kit,
      time: t,
      dest: this.bed.input,
      wet: this.bed.wetInput,
      pan,
      level,
    });
    this.events.push(v);
    return v;
  }

  tick(now: number, until: number): void {
    let w = 0;
    for (let r = 0; r < this.events.length; r++) {
      const e = this.events[r];
      if (!e.done) this.events[w++] = e;
    }
    this.events.length = w;
    if (this.ticker) this.ticker(now, until);
  }

  setLevel(value: number, at: number, ramp: number): void {
    this.bed.setLevel(value, at, ramp);
  }

  setPan(value: number, at: number, ramp: number): void {
    this.bed.setPan(value, at, ramp);
  }

  stop(at: number): void {
    this.ticker = null;
    this.bed.stop(at);
    for (const e of this.events) e.stop(at);
  }

  get done(): boolean {
    return this.bed.done;
  }
}

export type LoopBuild = (l: LoopVoice) => Ticker | null;

/** Noise through a filter chain into a gain, panned: the basic ambience layer. */
function bedLayer(
  v: Voice,
  color: NoiseColor,
  filters: readonly (readonly [BiquadFilterType, number, number])[],
  level: number,
  pan = 0,
  rate = 1,
): { gain: GainNode; filters: BiquadFilterNode[] } {
  const n = v.noise(color, v.t, undefined, rate);
  const fs = filters.map(([type, f, q]) => v.filter(type, f, q));
  const g = v.gain(level);
  chain(n, ...fs, g);
  if (pan !== 0) {
    const p = v.panner(pan);
    g.connect(p);
    v.out(p);
  } else {
    v.out(g);
  }
  return { gain: g, filters: fs };
}

function drip(l: LoopVoice, t: number, peak: number): void {
  const e = l.event(t, rr(-0.85, 0.85));
  const f = rr(1300, 3400);
  tone(e, t, { freq: f, to: f * rr(1.2, 1.5), glide: 0.018, peak, attack: 0.001, decay: rr(0.02, 0.05) });
}

export const LOOPS: Record<LoopCue, LoopBuild> = {
  wind_snow(l) {
    const v = l.bed;
    const t = v.t;
    const layers = [-0.55, 0.55].map((side) =>
      bedLayer(
        v,
        'pink',
        [
          ['bandpass', rr(380, 520), 0.9],
          ['lowpass', 1600, 0.7],
        ],
        0.22,
        side,
      ),
    );
    const hiss = bedLayer(v, 'white', [['bandpass', 6000, 0.6]], 0.012);
    const gusts = new Every(
      t + rr(0.5, 2),
      () => rr(1.6, 3.8),
      (tt) => {
        const strong = Math.random() < 0.18;
        for (const layer of layers) {
          const at = tt + rr(0, 0.6);
          layer.filters[0].frequency.setTargetAtTime(strong ? rr(700, 1100) : rr(260, 620), at, rr(0.8, 1.8));
          layer.gain.gain.setTargetAtTime(strong ? rr(0.4, 0.55) : rr(0.12, 0.3), at, rr(0.7, 1.6));
        }
        hiss.gain.gain.setTargetAtTime(strong ? 0.035 : rr(0.006, 0.016), tt, 1.2);
      },
    );
    return (now, until) => gusts.run(now, until);
  },

  rain(l) {
    const v = l.bed;
    const t = v.t;
    for (const side of [-0.5, 0.5]) {
      bedLayer(
        v,
        'white',
        [
          ['highpass', 600, 0.5],
          ['lowpass', 5200, 0.5],
        ],
        0.07,
        side,
        rr(0.97, 1.03),
      );
    }
    bedLayer(v, 'pink', [['lowpass', 900, 0.7]], 0.05);
    const drips = new Every(
      t + 0.1,
      () => rr(0.04, 0.32),
      (tt) => drip(l, tt, rr(0.01, 0.035)),
    );
    const plinks = new Every(
      t + rr(0.5, 2),
      () => rr(0.7, 2.6),
      (tt) => {
        const e = l.event(tt, rr(-0.7, 0.7));
        tone(e, tt, { freq: rr(2200, 4600), peak: rr(0.006, 0.016), attack: 0.001, decay: rr(0.08, 0.18) });
      },
    );
    return (now, until) => {
      drips.run(now, until);
      plinks.run(now, until);
    };
  },

  rain_heavy(l) {
    const v = l.bed;
    const t = v.t;
    for (const side of [-0.6, 0.6]) {
      bedLayer(
        v,
        'white',
        [
          ['highpass', 300, 0.5],
          ['lowpass', 7000, 0.5],
        ],
        0.11,
        side,
        rr(0.97, 1.03),
      );
    }
    const roar = bedLayer(v, 'pink', [['lowpass', 1500, 0.7]], 0.09);
    const rumble = bedLayer(v, 'brown', [['lowpass', 260, 0.7]], 0.08);
    const drips = new Every(
      t + 0.05,
      () => rr(0.02, 0.1),
      (tt) => drip(l, tt, rr(0.006, 0.02)),
    );
    const splashes = new Every(
      t + 0.3,
      () => rr(0.3, 1.2),
      (tt) => {
        const e = l.event(tt, rr(-0.8, 0.8));
        burst(e, tt, {
          freq: rr(1200, 2400),
          q: 0.7,
          peak: rr(0.02, 0.05),
          attack: 0.004,
          decay: rr(0.05, 0.12),
        });
      },
    );
    const surges = new Every(
      t + rr(2, 4),
      () => rr(3, 7),
      (tt) => {
        roar.gain.gain.setTargetAtTime(rr(0.06, 0.13), tt, 1.5);
        rumble.gain.gain.setTargetAtTime(rr(0.05, 0.11), tt, 2);
      },
    );
    return (now, until) => {
      drips.run(now, until);
      splashes.run(now, until);
      surges.run(now, until);
    };
  },

  lamp_hum(l) {
    const v = l.bed;
    const t = v.t;
    const hum = v.gain(1);
    const harmonics: readonly (readonly [number, number])[] = [
      [120, 0.05],
      [240, 0.022],
      [360, 0.008],
      [480, 0.004],
    ];
    for (const [f, a] of harmonics) {
      const o = v.osc('sine', f * rr(0.998, 1.002), t);
      const g = v.gain(a);
      o.connect(g);
      g.connect(hum);
    }
    const buzz = v.osc('sawtooth', 120, t);
    const bf = v.filter('bandpass', 1300, 1.4);
    const bg = v.gain(0.006);
    chain(buzz, bf, bg, hum);
    v.out(hum);
    const drift = new Every(
      t + 1,
      () => rr(1.5, 4),
      (tt) => {
        hum.gain.setTargetAtTime(rr(0.75, 1), tt, 1);
        bg.gain.setTargetAtTime(rr(0.002, 0.009), tt, 0.6);
      },
    );
    return (now, until) => drift.run(now, until);
  },

  fluorescent(l) {
    const v = l.bed;
    const t = v.t;
    const o = v.osc('sawtooth', 120, t);
    const hp = v.filter('highpass', 400, 0.7);
    const bp = v.filter('bandpass', 2600, 0.9);
    const buzz = v.gain(0.014);
    const hum = v.osc('sine', 120, t);
    const hg = v.gain(0.02);
    const sw = v.gain(1);
    chain(o, hp, bp, buzz, sw);
    chain(hum, hg, sw);
    v.out(sw);
    const flicker = new Every(
      t + rr(2, 6),
      () => rr(4, 14),
      (tt) => {
        const n = 2 + Math.floor(Math.random() * 4);
        let c = tt;
        for (let i = 0; i < n; i++) {
          const off = rr(0.02, 0.07);
          sw.gain.setValueAtTime(0.05, c);
          sw.gain.setValueAtTime(1, c + off);
          const e = l.event(c, rr(-0.2, 0.2));
          burst(e, c, { type: 'highpass', freq: 3500, peak: rr(0.03, 0.06), attack: 0.0005, decay: 0.004 });
          c += off + rr(0.03, 0.12);
        }
      },
    );
    return (now, until) => flicker.run(now, until);
  },

  siren(l) {
    const v = l.bed;
    const t = v.t;
    const base = rr(820, 960);
    const o1 = v.osc('triangle', base, t);
    const o2 = v.osc('triangle', base * 1.004, t);
    const lfo = v.osc('sine', rr(0.16, 0.22), t);
    const depth = v.gain(base * 0.33);
    lfo.connect(depth);
    depth.connect(o1.frequency);
    depth.connect(o2.frequency);
    const lp = v.filter('lowpass', 1500, 0.6);
    const g = v.gain(0.035);
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g);
    v.out(g);
    v.send(g, 0.8);
    const drift = new Every(
      t + 2,
      () => rr(3, 7),
      (tt) => {
        g.gain.setTargetAtTime(rr(0.012, 0.04), tt, 2.5);
        lp.frequency.setTargetAtTime(rr(1100, 1800), tt, 2.5);
      },
    );
    return (now, until) => drift.run(now, until);
  },

  alarm(l) {
    const v = l.bed;
    const t = v.t;
    const hi = 830;
    const lo = 622;
    const o1 = v.osc('square', lo, t);
    const o2 = v.osc('square', lo * 1.005, t);
    const bp = v.filter('bandpass', 1100, 0.6);
    const lp = v.filter('lowpass', 2800, 0.7);
    const g = v.gain(0.03);
    o1.connect(bp);
    o2.connect(bp);
    chain(bp, lp, g);
    v.out(g);
    v.send(g, 0.25);
    let k = 0;
    const steps = new Every(
      t,
      () => 0.42,
      (tt) => {
        const f = k++ % 2 === 0 ? hi : lo;
        o1.frequency.setValueAtTime(f, tt);
        o2.frequency.setValueAtTime(f * 1.005, tt);
      },
    );
    return (now, until) => steps.run(now, until);
  },

  station_room(l) {
    const v = l.bed;
    const t = v.t;
    bedLayer(v, 'brown', [['lowpass', 240, 0.7]], 0.05);
    const radio = bedLayer(
      v,
      'pink',
      [
        ['bandpass', 700, 1.1],
        ['lowpass', 1600, 0.7],
      ],
      0.02,
      -0.35,
    );
    const talk = new Every(
      t + 0.2,
      () => rr(0.09, 0.26),
      (tt) => {
        if (Math.random() < 0.07) {
          radio.gain.gain.setTargetAtTime(0.003, tt, 0.15);
          return rr(0.4, 1.2);
        }
        radio.gain.gain.setTargetAtTime(rr(0.008, 0.03), tt, 0.04);
        if (Math.random() < 0.15) radio.filters[0].frequency.setTargetAtTime(rr(550, 900), tt, 0.3);
        return undefined;
      },
    );
    let tock = false;
    const clock = new Every(
      t + rr(0.1, 1),
      () => 1,
      (tt) => {
        const e = l.event(tt, 0.45);
        burst(e, tt, { freq: tock ? 2500 : 3300, q: 3, peak: 0.03, attack: 0.0005, decay: 0.012 });
        tock = !tock;
      },
    );
    const kettle = new Every(
      t + rr(12, 25),
      () => rr(35, 75),
      (tt) => {
        const e = l.event(tt, 0.25);
        const dur = rr(6, 9);
        const n = e.noise('white', tt, tt + dur + 0.1);
        const f = e.filter('bandpass', 3800, 1.2);
        glide(f.frequency, tt, 3800, 6800, dur * 0.7);
        const g = e.gain(0);
        g.gain.setValueAtTime(0, tt);
        g.gain.linearRampToValueAtTime(0.012, tt + dur * 0.55);
        g.gain.linearRampToValueAtTime(0.018, tt + dur * 0.8);
        g.gain.linearRampToValueAtTime(0, tt + dur);
        chain(n, f, g);
        e.out(g);
        const w = e.osc('sine', 2100, tt + dur * 0.5, tt + dur + 0.05);
        w.frequency.linearRampToValueAtTime(2350, tt + dur);
        const wg = e.gain(0);
        ahr(wg.gain, tt + dur * 0.5, 0.003, dur * 0.3, dur * 0.1, dur * 0.1);
        w.connect(wg);
        e.out(wg);
      },
    );
    return (now, until) => {
      talk.run(now, until);
      clock.run(now, until);
      kettle.run(now, until);
    };
  },

  port(l) {
    const v = l.bed;
    const t = v.t;
    const bed = bedLayer(v, 'brown', [['lowpass', 380, 0.7]], 0.06);
    const lap = bedLayer(v, 'pink', [['bandpass', 520, 0.8]], 0.025);
    bedLayer(v, 'pink', [['bandpass', 300, 0.5]], 0.015);
    const waves = new Every(
      t,
      () => rr(1.2, 3.2),
      (tt) => {
        lap.gain.gain.setTargetAtTime(rr(0.01, 0.05), tt, 0.6);
        lap.filters[0].frequency.setTargetAtTime(rr(380, 800), tt, 0.8);
        bed.gain.gain.setTargetAtTime(rr(0.04, 0.08), tt, 1.2);
      },
    );
    const slaps = new Every(
      t + rr(0.5, 2),
      () => rr(1, 3.5),
      (tt) => {
        const e = l.event(tt, rr(-0.7, 0.7));
        burst(e, tt, {
          color: 'brown',
          type: 'lowpass',
          freq: rr(450, 700),
          peak: rr(0.08, 0.18),
          attack: rr(0.01, 0.03),
          decay: rr(0.2, 0.4),
        });
        burst(e, tt + 0.01, {
          freq: rr(700, 1100),
          q: 1,
          peak: rr(0.015, 0.04),
          attack: 0.01,
          decay: rr(0.08, 0.15),
        });
      },
    );
    const crane = new Every(
      t + rr(4, 10),
      () => rr(12, 26),
      (tt) => {
        const e = l.event(tt, rr(-0.8, 0.8));
        const dur = rr(5, 8);
        const f0 = rr(42, 52);
        const lp = e.filter('lowpass', 320, 1);
        for (const k of [1, 2.01]) {
          const o = e.osc('sawtooth', f0 * k, tt, tt + dur + 0.2);
          o.frequency.setValueAtTime(f0 * k, tt);
          o.frequency.linearRampToValueAtTime(f0 * k * 1.3, tt + 2);
          o.frequency.setValueAtTime(f0 * k * 1.3, tt + dur - 2);
          o.frequency.linearRampToValueAtTime(f0 * k, tt + dur);
          o.connect(lp);
        }
        const g = e.gain(0);
        ahr(g.gain, tt, 0.05, 1.5, dur - 3, 1.5);
        lp.connect(g);
        e.out(g);
        e.send(g, 0.5);
        tone(e, tt + 0.5, { freq: 600, to: 780, glide: 2, peak: 0.004, attack: 1, decay: dur - 1.5 });
        for (const at of [tt, tt + dur]) {
          partials(
            e,
            at,
            [rr(280, 330), rr(700, 800), rr(1500, 1700)],
            [0.02, 0.012, 0.006],
            [0.5, 0.35, 0.2],
          );
        }
      },
    );
    return (now, until) => {
      waves.run(now, until);
      slaps.run(now, until);
      crane.run(now, until);
    };
  },

  car_engine(l) {
    const v = l.bed;
    const t = v.t;
    const road = bedLayer(v, 'brown', [['lowpass', 170, 0.7]], 0.11);
    const tire = bedLayer(v, 'pink', [['bandpass', 650, 0.6]], 0.03);
    const whine = v.osc('sine', 430, t);
    const whine2 = v.osc('sine', 860, t);
    const wg = v.gain(0.005);
    const w2g = v.gain(0.0015);
    whine.connect(wg);
    whine2.connect(w2g);
    v.out(wg);
    v.out(w2g);
    const cab = v.osc('sawtooth', 52, t);
    const cl = v.filter('lowpass', 110, 0.7);
    const cg = v.gain(0.018);
    chain(cab, cl, cg);
    v.out(cg);
    const texture = new Every(
      t + 0.3,
      () => rr(0.4, 1.4),
      (tt) => {
        road.gain.gain.setTargetAtTime(rr(0.08, 0.13), tt, 0.3);
        tire.gain.gain.setTargetAtTime(rr(0.02, 0.04), tt, 0.4);
        const f = rr(400, 470);
        whine.frequency.setTargetAtTime(f, tt, 1.5);
        whine2.frequency.setTargetAtTime(f * 2, tt, 1.5);
      },
    );
    const seams = new Every(
      t + rr(1, 3),
      () => rr(1.2, 3.5),
      (tt) => {
        const e = l.event(tt);
        thump(e, tt, 75, 50, 0.04, 0.06, 0.08);
        thump(e, tt + rr(0.1, 0.14), 75, 50, 0.04, 0.045, 0.08);
      },
    );
    return (now, until) => {
      texture.run(now, until);
      seams.run(now, until);
    };
  },

  drone(l) {
    const v = l.bed;
    const t = v.t;
    const freqs = [rr(176, 184), rr(184, 190), rr(236, 244), rr(244, 250)];
    const mix = v.gain(1);
    const oscs = freqs.map((f) => {
      const o = v.osc('sawtooth', f, t);
      o.connect(mix);
      return o;
    });
    const bp = v.filter('bandpass', 1000, 0.8);
    const lp = v.filter('lowpass', 2600, 0.7);
    const am = v.gain(0.75);
    const lfo = v.osc('sine', rr(22, 28), t);
    const ld = v.gain(0.25);
    lfo.connect(ld);
    ld.connect(am.gain);
    const out = v.gain(0.012);
    chain(mix, bp, lp, am, out);
    v.out(out);
    bedLayer(v, 'white', [['bandpass', 1300, 0.7]], 0.012);
    const hover = new Every(
      t + 0.5,
      () => rr(0.6, 2),
      (tt) => {
        const k = rr(0.95, 1.06);
        for (let i = 0; i < oscs.length; i++) oscs[i].frequency.setTargetAtTime(freqs[i] * k, tt, 0.4);
        out.gain.setTargetAtTime(0.012 * rr(0.8, 1.15), tt, 0.4);
      },
    );
    return (now, until) => hover.run(now, until);
  },

  charging(l) {
    const v = l.bed;
    const t = v.t;
    const hum: readonly (readonly [OscillatorType, number, number])[] = [
      ['sine', 100, 0.025],
      ['sine', 200, 0.01],
    ];
    for (const [type, f, a] of hum) {
      const o = v.osc(type, f, t);
      v.out(o, a);
    }
    const buzz = v.osc('sawtooth', 100, t);
    const bf = v.filter('bandpass', 900, 2);
    const bg = v.gain(0.003);
    chain(buzz, bf, bg);
    v.out(bg);
    const whine = v.osc('sine', 3150, t);
    const wg = v.gain(0.0018);
    const lfo = v.osc('sine', 0.5, t);
    const ld = v.gain(0.0012);
    lfo.connect(ld);
    ld.connect(wg.gain);
    whine.connect(wg);
    v.out(wg);
    const pulses = new Every(
      t + 0.6,
      () => 1.3,
      (tt) => {
        const e = l.event(tt);
        tone(e, tt, { freq: 880, to: 935, glide: 0.08, peak: 0.018, attack: 0.01, decay: 0.2 });
        tone(e, tt, { freq: 1760, peak: 0.004, attack: 0.01, decay: 0.12 });
      },
    );
    const crackle = new Every(
      t + rr(1, 3),
      () => rr(2, 6),
      (tt) => {
        const e = l.event(tt, rr(-0.3, 0.3));
        burst(e, tt, { type: 'highpass', freq: 5000, peak: 0.01, attack: 0.0005, decay: 0.003 });
      },
    );
    return (now, until) => {
      pulses.run(now, until);
      crackle.run(now, until);
    };
  },

  camp_night(l) {
    const v = l.bed;
    const t = v.t;
    const wind = bedLayer(v, 'pink', [['bandpass', 380, 0.7]], 0.02);
    const breeze = new Every(
      t + 1,
      () => rr(2, 5),
      (tt) => {
        wind.gain.gain.setTargetAtTime(rr(0.01, 0.03), tt, 1.5);
        wind.filters[0].frequency.setTargetAtTime(rr(260, 520), tt, 1.5);
      },
    );
    const count = Math.random() < 0.5 ? 2 : 3;
    const crickets: Every[] = [];
    for (let c = 0; c < count; c++) {
      const o = v.osc('sine', rr(4100, 5300), t);
      const g = v.gain(0);
      const p = v.panner(rr(-0.8, 0.8));
      chain(o, g, p);
      v.out(p);
      const amp = rr(0.004, 0.008);
      crickets.push(
        new Every(
          t + rr(0, 1.5),
          () => rr(0.5, 1.1),
          (tt) => {
            if (Math.random() < 0.08) return rr(2, 6);
            const pulses = Math.random() < 0.4 ? 4 : 3;
            for (let i = 0; i < pulses; i++) {
              const p0 = tt + i * 0.03;
              g.gain.setTargetAtTime(amp, p0, 0.002);
              g.gain.setTargetAtTime(0, p0 + 0.016, 0.003);
            }
            return undefined;
          },
        ),
      );
    }
    return (now, until) => {
      breeze.run(now, until);
      for (const c of crickets) c.run(now, until);
    };
  },

  sea(l) {
    const v = l.bed;
    const t = v.t;
    const swell = bedLayer(v, 'brown', [['lowpass', 450, 0.7]], 0.05);
    const wash = bedLayer(v, 'pink', [['lowpass', 600, 0.7]], 0.02);
    const waves = new Every(
      t + 0.5,
      () => rr(4, 7),
      (tt) => {
        const rise = rr(1.5, 2.5);
        wash.gain.gain.setTargetAtTime(rr(0.05, 0.09), tt, rise / 3);
        wash.filters[0].frequency.setTargetAtTime(rr(1100, 1700), tt, rise / 3);
        wash.gain.gain.setTargetAtTime(0.015, tt + rise, rr(0.8, 1.3));
        wash.filters[0].frequency.setTargetAtTime(500, tt + rise, 1);
        swell.gain.gain.setTargetAtTime(rr(0.04, 0.07), tt, 1.5);
        const ts = tt + rise * rr(0.8, 1);
        const e = l.event(ts, rr(-0.4, 0.4));
        const hit = thump(e, ts, 68, 46, 0.08, rr(0.05, 0.1), 0.3);
        burst(e, ts, {
          color: 'brown',
          type: 'lowpass',
          freq: 420,
          peak: rr(0.05, 0.09),
          attack: 0.02,
          decay: 0.35,
        });
        e.send(hit, 0.2);
      },
    );
    const creaks = new Every(
      t + rr(3, 8),
      () => rr(6, 15),
      (tt) => {
        const e = l.event(tt, rr(-0.6, 0.6));
        const hold = rr(0.3, 0.8);
        const f = rr(150, 230);
        const o = e.osc('sawtooth', f, tt, tt + hold + 0.5);
        o.frequency.linearRampToValueAtTime(f * rr(0.92, 1.08), tt + hold + 0.35);
        const bp = e.filter('bandpass', rr(500, 800), 9);
        const g = e.gain(0);
        ahr(g.gain, tt, 0.006, 0.15, hold, 0.2);
        chain(o, bp, g);
        e.out(g);
      },
    );
    return (now, until) => {
      waves.run(now, until);
      creaks.run(now, until);
    };
  },

  crowd(l) {
    const v = l.bed;
    const t = v.t;
    bedLayer(
      v,
      'pink',
      [
        ['bandpass', 650, 0.5],
        ['lowpass', 1800, 0.7],
      ],
      0.018,
    );
    const talkers = [-0.6, -0.1, 0.45].map((side) => {
      const layer = bedLayer(
        v,
        'pink',
        [
          ['bandpass', rr(480, 900), 1.3],
          ['lowpass', 1700, 0.7],
        ],
        0.012,
        side,
        rr(0.9, 1.1),
      );
      return new Every(
        t + rr(0, 0.3),
        () => rr(0.08, 0.22),
        (tt) => {
          layer.gain.gain.setTargetAtTime(Math.random() < 0.1 ? 0.002 : rr(0.006, 0.022), tt, 0.035);
          if (Math.random() < 0.2) layer.filters[0].frequency.setTargetAtTime(rr(450, 950), tt, 0.1);
        },
      );
    });
    const clinks = new Every(
      t + rr(0.5, 2),
      () => rr(0.8, 3.2),
      (tt) => {
        const e = l.event(tt, rr(-0.8, 0.8));
        const f = rr(2400, 4300);
        partials(e, tt, [f, f * 1.47], [rr(0.006, 0.012), 0.004], [rr(0.06, 0.14), 0.05]);
      },
    );
    return (now, until) => {
      for (const talker of talkers) talker.run(now, until);
      clinks.run(now, until);
    };
  },
};
