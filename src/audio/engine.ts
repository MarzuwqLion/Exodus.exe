/**
 * The audio engine (spec §14). WebAudio buses: master → music, SFX, ambience (which follows the
 * SFX volume), and UI, through a gentle compressor so nothing clips. One-shots and loops are
 * synthesized in code (synth.ts), music is generative (music.ts), and any cue can be replaced by
 * a file in `public/audio/` (override.ts).
 *
 * Safe everywhere: in Node (tests, bots, the economy simulator) there is no AudioContext and every
 * method is a no-op. In the browser nothing sounds until `unlock()` succeeds on the first input.
 * Requests made before that (music, loops, volumes) are remembered and start then. No method
 * ever throws.
 */
import { type LoopCue, type MusicTrack, type SfxCue, isMusicTrack } from './cues';
import { MusicEngine } from './music';
import { type OverrideMap, loadAudioOverrides } from './override';
import {
  Kit,
  LOOPS,
  LoopVoice,
  SFX,
  Voice,
  clamp,
  loopTrim,
  makeImpulse,
  rampParam,
  reverbInto,
  sfxTrim,
} from './synth';

export interface SfxOptions {
  /** Stereo position, -1 (left) .. 1 (right). */
  pan?: number;
  /** 0..1, default 1. */
  gain?: number;
  /** Pitch offset in cents. */
  detune?: number;
}

export interface LoopHandle {
  setGain(g: number): void;
  setPan(p: number): void;
  stop(fadeSeconds?: number): void;
}

/** Simultaneous one-shots; the oldest is faded out to make room. */
const MAX_VOICES = 24;
/** A safety cap on simultaneous loops (scenes normally run a handful). */
const MAX_LOOPS = 32;
const LOOP_FADE_IN = 0.8;
const LOOP_FADE_OUT = 0.8;
const MUSIC_CROSSFADE = 2;
/** Seconds scheduled ahead when driven by `update()` every frame. */
const FRAME_HORIZON = 0.35;
/** Seconds scheduled ahead when frames stop (hidden tab) and a ~1 Hz timer takes over. */
const TIMER_HORIZON = 2.5;
const TIMER_MS = 250;
/** How long loops and music wait for override files before starting with the synth. */
const OVERRIDE_WAIT = 2;
/** The same cue retriggered within this window (seconds) is dropped. */
const RETRIGGER = 0.012;
/** Suspicion pulse: silent below this level; interval from slow to fast as level goes to 1. */
const PULSE_MIN = 0.3;
const PULSE_SLOW = 1.2;
const PULSE_FAST = 0.28;
const PULSE_LOOKAHEAD = 0.1;
/** Mix trims, applied on top of the squared volume settings. */
const MASTER_TRIM = 0.9;
const MUSIC_TRIM = 0.8;
const SFX_TRIM = 1;
const AMB_TRIM = 0.85;
const UI_TRIM = 0.9;
/** While paused, the world (not the UI) drops to this level behind a low-pass. */
const PAUSE_DUCK = 0.3;
const PAUSE_CUTOFF = 900;
/** Menu sounds: never ducked by the pause, no reverb. */
const UI_CUES: ReadonlySet<SfxCue> = new Set<SfxCue>([
  'ui_move',
  'ui_confirm',
  'ui_back',
  'ui_error',
  'type_tick',
]);
const GESTURES = ['pointerdown', 'pointerup', 'mousedown', 'keydown', 'touchend'] as const;

type AudioCtor = new (options?: AudioContextOptions) => AudioContext;

function audioCtor(): AudioCtor | null {
  if (typeof AudioContext !== 'undefined') return AudioContext;
  const legacy = (globalThis as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  return legacy ?? null;
}

/** False while the browser would refuse to start audio (no user gesture yet). */
function hasUserActivation(): boolean {
  if (typeof navigator === 'undefined' || !('userActivation' in navigator)) return true;
  const ua = navigator.userActivation;
  return ua.hasBeenActive || ua.isActive;
}

function finite(x: unknown, fallback: number): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : fallback;
}

function wallMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** Volume sliders are perceptual: half the slider is roughly half as loud. */
function curve(v: number): number {
  return v * v;
}

function openCutoff(ctx: BaseAudioContext): number {
  return Math.min(20000, ctx.sampleRate / 2 - 100);
}

interface Graph {
  readonly master: GainNode;
  readonly duck: GainNode;
  readonly pauseLp: BiquadFilterNode;
  readonly music: GainNode;
  readonly sfx: GainNode;
  readonly amb: GainNode;
  readonly ui: GainNode;
  readonly sfxVerbIn: GainNode;
  readonly musicVerbIn: GainNode;
}

function gainInto(ctx: BaseAudioContext, dest: AudioNode, value = 1): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  g.connect(dest);
  return g;
}

function buildGraph(ctx: AudioContext): Graph {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.25;
  comp.connect(ctx.destination);
  const master = gainInto(ctx, comp, 0);
  const pauseLp = ctx.createBiquadFilter();
  pauseLp.type = 'lowpass';
  pauseLp.frequency.value = openCutoff(ctx);
  pauseLp.Q.value = 0.5;
  pauseLp.connect(master);
  const duck = gainInto(ctx, pauseLp);
  const music = gainInto(ctx, duck, 0);
  const sfx = gainInto(ctx, duck, 0);
  const amb = gainInto(ctx, duck, 0);
  const ui = gainInto(ctx, master, 0);
  return {
    master,
    duck,
    pauseLp,
    music,
    sfx,
    amb,
    ui,
    sfxVerbIn: reverbInto(ctx, sfx, makeImpulse(ctx, 2, 1.5, 0.7, 0x51f7), 220),
    musicVerbIn: reverbInto(ctx, music, makeImpulse(ctx, 5, 4.5, 0.55, 0x3a5c), 160),
  };
}

interface LoopHost {
  changed(entry: LoopEntry, what: 'gain' | 'pan'): void;
  release(entry: LoopEntry, fade: number): void;
}

/** A loop request. It may wait (before unlock) and binds to a live LoopVoice when audio runs. */
class LoopEntry implements LoopHandle {
  voice: LoopVoice | null = null;
  fromOverride = false;
  /** Mix trim for the synthesized version (override files play untrimmed). */
  trim = 1;
  fadeInEnd = 0;
  stopped = false;
  failed = false;

  constructor(
    private readonly host: LoopHost,
    readonly cue: LoopCue,
    public gain: number,
    public pan: number,
  ) {}

  setGain(g: number): void {
    if (this.stopped) return;
    const next = clamp(finite(g, this.gain), 0, 1);
    if (Math.abs(next - this.gain) < 1e-4) return;
    this.gain = next;
    this.host.changed(this, 'gain');
  }

  setPan(p: number): void {
    if (this.stopped) return;
    const next = clamp(finite(p, this.pan), -1, 1);
    if (Math.abs(next - this.pan) < 1e-4) return;
    this.pan = next;
    this.host.changed(this, 'pan');
  }

  stop(fadeSeconds?: number): void {
    if (this.stopped) return;
    this.stopped = true;
    this.host.release(this, clamp(finite(fadeSeconds, LOOP_FADE_OUT), 0, 30));
  }
}

const NOOP_LOOP: LoopHandle = Object.freeze({
  setGain: () => undefined,
  setPan: () => undefined,
  stop: () => undefined,
});

interface PulseState {
  level: number;
  pan: number;
  /** Next thump time (AudioContext seconds), or -1 when idle. */
  next: number;
  last: number;
}

export class AudioEngine {
  private readonly supported: boolean;
  private ctx: AudioContext | null = null;
  private graph: Graph | null = null;
  private kit: Kit | null = null;
  private music: MusicEngine | null = null;
  private overrides: OverrideMap = new Map();
  private overridesSettled = false;
  private createFailures = 0;
  private started = false;
  private firstRunning = -1;
  private readonly volumes = { master: 1, music: 1, sfx: 1 };
  private paused = false;
  private musicWanted: MusicTrack | 'none' = 'none';
  private musicApplied: MusicTrack | 'none' = 'none';
  private tensionWanted = 0;
  private alertWanted = false;
  private readonly voices: Voice[] = [];
  private readonly loops: LoopEntry[] = [];
  private readonly lastPlayed = new Map<SfxCue, number>();
  private readonly pulses: readonly [PulseState, PulseState] = [
    { level: 0, pan: -0.6, next: -1, last: -1 },
    { level: 0, pan: 0.6, next: -1, last: -1 },
  ];
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastUpdateMs = 0;
  private gestureHandler: (() => void) | null = null;
  private readonly loopHost: LoopHost = {
    changed: (entry, what) => this.applyLoop(entry, what),
    release: (entry, fade) => this.releaseLoop(entry, fade),
  };
  private readonly onVoiceDone = (v: Voice): void => {
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
  };

  constructor() {
    this.supported = typeof window !== 'undefined' && audioCtor() !== null;
  }

  /** True once the AudioContext exists and is running. */
  get ready(): boolean {
    return this.ctx !== null && this.graph !== null && this.ctx.state === 'running';
  }

  /** Create/resume the AudioContext. Called on the first user input; safe to call repeatedly. */
  unlock(): void {
    if (!this.supported) return;
    try {
      if (!this.ctx) {
        // Creating a context before a real gesture only earns a console warning and a suspended
        // context (gamepad buttons don't count as gestures); wait for a key, click, or touch.
        if (!hasUserActivation()) {
          this.armGestures();
          return;
        }
        if (!this.create()) return;
      }
      const ctx = this.ctx;
      if (!ctx) return;
      if (ctx.state === 'running') {
        this.disarmGestures();
      } else if (ctx.state !== 'closed') {
        void ctx.resume().catch(() => undefined);
        this.armGestures();
      }
    } catch {
      // Audio never takes the game down.
    }
  }

  setVolumes(v: { master: number; music: number; sfx: number }): void {
    if (!this.supported || typeof v !== 'object' || v === null) return;
    this.volumes.master = clamp(finite(v.master, this.volumes.master), 0, 1);
    this.volumes.music = clamp(finite(v.music, this.volumes.music), 0, 1);
    this.volumes.sfx = clamp(finite(v.sfx, this.volumes.sfx), 0, 1);
    this.applyVolumes(0.05);
  }

  play(cue: SfxCue, opts?: SfxOptions): void {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return;
    try {
      const now = ctx.currentTime;
      const last = this.lastPlayed.get(cue);
      if (last !== undefined && now >= last && now - last < RETRIGGER) return;
      this.lastPlayed.set(cue, now);
      const level = clamp(finite(opts?.gain, 1), 0, 1);
      if (level <= 0.0005) return;
      const pan = clamp(finite(opts?.pan, 0), -1, 1);
      const detune = clamp(finite(opts?.detune, 0), -2400, 2400);
      this.spawn(cue, now + 0.003, level, pan, detune);
    } catch {
      // Audio never takes the game down.
    }
  }

  /** Start an ambience/weather loop with a short fade-in. */
  loop(cue: LoopCue, opts?: { gain?: number; pan?: number }): LoopHandle {
    if (!this.supported) return NOOP_LOOP;
    try {
      if (typeof LOOPS[cue] !== 'function') return NOOP_LOOP;
      const entry = new LoopEntry(
        this.loopHost,
        cue,
        clamp(finite(opts?.gain, 1), 0, 1),
        clamp(finite(opts?.pan, 0), -1, 1),
      );
      if (this.loops.length >= MAX_LOOPS) this.loops[0].stop(0.3);
      this.loops.push(entry);
      if (this.started && this.ready) this.bindLoop(entry);
      return entry;
    } catch {
      return NOOP_LOOP;
    }
  }

  /** Stop every loop (scene changes). */
  stopAllLoops(fadeSeconds?: number): void {
    if (!this.supported) return;
    const fade = clamp(finite(fadeSeconds, LOOP_FADE_OUT), 0, 30);
    for (let i = this.loops.length - 1; i >= 0; i--) this.loops[i].stop(fade);
  }

  setMusic(track: MusicTrack | 'none'): void {
    if (!this.supported) return;
    this.musicWanted = typeof track === 'string' && isMusicTrack(track) ? track : 'none';
    this.syncMusic();
  }

  /** 0..1 — fades the pulsing tension layer in over the scene pad. */
  setTension(level: number): void {
    if (!this.supported) return;
    this.tensionWanted = clamp(finite(level, 0), 0, 1);
    this.syncMusic();
  }

  /** Driving percussion layer on/off (ALERT, the Port gangway timer). */
  setAlert(on: boolean): void {
    if (!this.supported) return;
    this.alertWanted = on === true;
    this.syncMusic();
  }

  /**
   * Per-player suspicion heartbeat: a low servo-thump whose rate rises with level (0 = silent,
   * 1 = fast), panned to that player's side. Called every frame.
   */
  setSuspicionPulse(slot: 0 | 1, level: number, pan: number): void {
    if (!this.supported) return;
    const p = this.pulses[slot === 1 ? 1 : 0];
    p.level = clamp(finite(level, 0), 0, 1);
    p.pan = clamp(finite(pan, p.pan), -1, 1);
  }

  /** Duck everything while paused. */
  setPaused(paused: boolean): void {
    if (!this.supported) return;
    const next = paused === true;
    if (next === this.paused) return;
    this.paused = next;
    this.applyPause(0.25);
  }

  /** Called every rendered frame with the frame delta in seconds. */
  update(dt: number): void {
    if (!this.ctx) return;
    this.lastUpdateMs = wallMs();
    // Look far enough ahead to cover a few slow frames, so nothing scheduled arrives late.
    const frame = clamp(finite(dt, 0), 0, 0.5);
    this.pump(Math.max(FRAME_HORIZON, frame * 3), Math.max(PULSE_LOOKAHEAD, frame * 1.5));
  }

  // -------------------------------------------------------------------------------------------

  private create(): boolean {
    const Ctor = audioCtor();
    if (!Ctor || this.createFailures >= 3) return false;
    let ctx: AudioContext | null = null;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
      const kit = new Kit(ctx);
      const graph = buildGraph(ctx);
      const music = new MusicEngine(ctx, kit, graph.music, graph.musicVerbIn, (t) => this.overrides.get(t));
      this.ctx = ctx;
      this.kit = kit;
      this.graph = graph;
      this.music = music;
      ctx.onstatechange = (): void => {
        if (ctx && ctx.state === 'running') this.disarmGestures();
      };
      this.applyVolumes(0);
      this.applyPause(0);
      this.loadOverrides(ctx);
      this.startTimer();
      return true;
    } catch {
      this.createFailures++;
      if (ctx) void ctx.close().catch(() => undefined);
      this.ctx = null;
      this.kit = null;
      this.graph = null;
      this.music = null;
      return false;
    }
  }

  private loadOverrides(ctx: AudioContext): void {
    loadAudioOverrides(ctx).then(
      (map) => {
        this.overrides = map;
        this.overridesSettled = true;
        if (map.size > 0) this.adoptOverrides();
      },
      () => {
        this.overridesSettled = true;
      },
    );
  }

  /** Overrides that arrive after music or loops started: swap them in. */
  private adoptOverrides(): void {
    const ctx = this.ctx;
    if (!ctx || !this.started) return;
    try {
      const now = ctx.currentTime;
      if (this.music && this.musicApplied !== 'none' && this.overrides.has(this.musicApplied)) {
        this.music.setTrack(this.musicApplied, now, MUSIC_CROSSFADE, true);
      }
      for (const e of this.loops) {
        if (e.voice && !e.fromOverride && this.overrides.has(e.cue)) {
          e.voice.setLevel(0, now, 0.5);
          e.voice.stop(now + 0.6);
          e.voice = null;
        }
      }
    } catch {
      // Keep the synth versions.
    }
  }

  private startTimer(): void {
    if (this.timer !== null || typeof setInterval !== 'function') return;
    this.timer = setInterval(() => {
      if (wallMs() - this.lastUpdateMs > TIMER_MS) this.pump(TIMER_HORIZON);
    }, TIMER_MS);
  }

  private armGestures(): void {
    if (this.gestureHandler || typeof window === 'undefined') return;
    const handler = (): void => {
      this.unlock();
    };
    this.gestureHandler = handler;
    for (const type of GESTURES) window.addEventListener(type, handler, { capture: true, passive: true });
  }

  private disarmGestures(): void {
    const handler = this.gestureHandler;
    if (!handler || typeof window === 'undefined') return;
    for (const type of GESTURES) window.removeEventListener(type, handler, { capture: true });
    this.gestureHandler = null;
  }

  /** Schedules music, loop events, and suspicion thumps up to `horizon` seconds ahead. */
  private pump(horizon: number, pulseAhead = PULSE_LOOKAHEAD): void {
    const ctx = this.ctx;
    const music = this.music;
    if (!ctx || !music || !this.graph || ctx.state !== 'running') return;
    try {
      const now = ctx.currentTime;
      if (!this.started) {
        if (this.firstRunning < 0) this.firstRunning = now;
        if (!this.overridesSettled && now - this.firstRunning < OVERRIDE_WAIT) return;
        this.started = true;
      }
      this.syncMusic();
      for (let i = 0; i < this.loops.length; i++) {
        const e = this.loops[i];
        if (!e.voice && !e.failed) this.bindLoop(e);
      }
      const until = now + horizon;
      music.schedule(now, until);
      for (let i = 0; i < this.loops.length; i++) {
        const lv = this.loops[i].voice;
        if (lv) lv.tick(now, until);
      }
      this.schedulePulses(now, pulseAhead);
    } catch {
      // Audio never takes the game down.
    }
  }

  private syncMusic(): void {
    const ctx = this.ctx;
    const music = this.music;
    if (!ctx || !music || !this.started || ctx.state !== 'running') return;
    try {
      const now = ctx.currentTime;
      if (this.musicApplied !== this.musicWanted) {
        music.setTrack(this.musicWanted, now, MUSIC_CROSSFADE);
        this.musicApplied = this.musicWanted;
      }
      music.setTension(this.tensionWanted, now);
      music.setAlert(this.alertWanted, now);
    } catch {
      // Audio never takes the game down.
    }
  }

  private spawn(cue: SfxCue, time: number, level: number, pan: number, detune: number): void {
    const ctx = this.ctx;
    const g = this.graph;
    const kit = this.kit;
    if (!ctx || !g || !kit) return;
    const buffer = this.overrides.get(cue);
    const build = SFX[cue];
    if (!buffer && typeof build !== 'function') return;
    while (this.voices.length >= MAX_VOICES) {
      const oldest = this.voices.shift();
      if (oldest) oldest.kill(ctx.currentTime);
    }
    const ui = UI_CUES.has(cue);
    const v = new Voice({
      ctx,
      kit,
      time,
      dest: ui ? g.ui : g.sfx,
      wet: ui ? null : g.sfxVerbIn,
      level: buffer ? level : level * sfxTrim(cue),
      pan,
      detune,
      onDone: this.onVoiceDone,
    });
    this.voices.push(v);
    try {
      if (buffer) v.out(v.play(buffer, time, { rate: Math.pow(2, detune / 1200) }));
      else build(v);
    } catch {
      v.stop(ctx.currentTime);
      this.onVoiceDone(v);
    }
  }

  private bindLoop(e: LoopEntry): void {
    const ctx = this.ctx;
    const g = this.graph;
    const kit = this.kit;
    if (!ctx || !g || !kit || e.voice || e.failed) return;
    const now = ctx.currentTime;
    let lv: LoopVoice | null = null;
    try {
      lv = new LoopVoice({ ctx, kit, time: now + 0.01, dest: g.amb, wet: g.sfxVerbIn, level: 0, pan: e.pan });
      const buffer = this.overrides.get(e.cue);
      if (buffer) lv.bed.out(lv.bed.play(buffer, lv.t, { loop: true }));
      else lv.start(LOOPS[e.cue]);
      e.trim = buffer ? 1 : loopTrim(e.cue);
      lv.setLevel(e.gain * e.trim, now, LOOP_FADE_IN);
      e.voice = lv;
      e.fromOverride = buffer !== undefined;
      e.fadeInEnd = now + LOOP_FADE_IN;
    } catch {
      e.failed = true;
      if (lv) lv.stop(now);
    }
  }

  private applyLoop(e: LoopEntry, what: 'gain' | 'pan'): void {
    const ctx = this.ctx;
    const lv = e.voice;
    if (!ctx || !lv) return;
    try {
      const now = ctx.currentTime;
      // Never cut the fade-in short: aim the new level at the end of it.
      if (what === 'gain') lv.setLevel(e.gain * e.trim, now, Math.max(0.05, e.fadeInEnd - now));
      else lv.setPan(e.pan, now, 0.05);
    } catch {
      // Audio never takes the game down.
    }
  }

  private releaseLoop(e: LoopEntry, fade: number): void {
    const i = this.loops.indexOf(e);
    if (i >= 0) this.loops.splice(i, 1);
    const lv = e.voice;
    e.voice = null;
    const ctx = this.ctx;
    if (!lv || !ctx) return;
    try {
      const now = ctx.currentTime;
      lv.setLevel(0, now, Math.max(0.02, fade));
      lv.stop(now + fade + 0.05);
    } catch {
      // Audio never takes the game down.
    }
  }

  private schedulePulses(now: number, ahead: number): void {
    for (let s = 0; s < this.pulses.length; s++) {
      const p = this.pulses[s];
      if (this.paused || p.level < PULSE_MIN) {
        p.next = -1;
        continue;
      }
      const k = (p.level - PULSE_MIN) / (1 - PULSE_MIN);
      const interval = PULSE_SLOW * Math.pow(PULSE_FAST / PULSE_SLOW, k);
      if (p.next < 0) p.next = now + 0.03;
      else if (p.last >= 0) p.next = Math.min(p.next, p.last + interval);
      if (p.next < now) p.next = now + 0.005;
      if (p.next < now + ahead) {
        this.spawn('suspicion_thump', p.next, 0.55 + 0.45 * k, p.pan, 0);
        p.last = p.next;
        p.next += interval;
      }
    }
  }

  private applyVolumes(ramp: number): void {
    const ctx = this.ctx;
    const g = this.graph;
    if (!ctx || !g) return;
    try {
      const now = ctx.currentTime;
      const sfx = curve(this.volumes.sfx);
      rampParam(g.master.gain, curve(this.volumes.master) * MASTER_TRIM, now, ramp);
      rampParam(g.music.gain, curve(this.volumes.music) * MUSIC_TRIM, now, ramp);
      rampParam(g.sfx.gain, sfx * SFX_TRIM, now, ramp);
      rampParam(g.amb.gain, sfx * AMB_TRIM, now, ramp);
      rampParam(g.ui.gain, sfx * UI_TRIM, now, ramp);
    } catch {
      // Audio never takes the game down.
    }
  }

  private applyPause(ramp: number): void {
    const ctx = this.ctx;
    const g = this.graph;
    if (!ctx || !g) return;
    try {
      const now = ctx.currentTime;
      rampParam(g.duck.gain, this.paused ? PAUSE_DUCK : 1, now, ramp);
      const f = g.pauseLp.frequency;
      f.cancelScheduledValues(now);
      f.setValueAtTime(f.value, now);
      f.setTargetAtTime(this.paused ? PAUSE_CUTOFF : openCutoff(ctx), now, Math.max(0.01, ramp / 3));
    } catch {
      // Audio never takes the game down.
    }
  }
}
