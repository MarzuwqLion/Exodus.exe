/**
 * The game shell: owns the renderer pipeline, input, audio, UI surface, save data, the fixed-step loop, the
 * scene manager, and the pause menu. Scenes are created through the registry in `scenes/registry.ts`.
 *
 * Every tick, the shell consumes one PlayerIntent per joined slot (scenes read `game.intents`), handles
 * player 2 joining and anyone dropping out, controller disconnects, and pausing (spec §7.2).
 */
import * as THREE from 'three';
import { AudioEngine } from './audio/engine';
import type { LaunchConfig, SceneName } from './core/config';
import { FixedLoop } from './core/loop';
import { loadSave, writeSave, type KeyValueStore, MemoryStore } from './core/save';
import { SceneManager } from './core/scenes';
import type { PlayerIntent, SaveData, Slot } from './core/types';
import { TUNING } from './content/tuning';
import type { RumbleKind } from './input/gamepad';
import { emptyIntent } from './input/intents';
import { InputManager } from './input/manager';
import { CameraRig } from './render/camera';
import { Pipeline } from './render/pipeline';
import { C } from './render/palettes';
import type { RunFlow } from './scenes/runflow';
import type { GameScene } from './scenes/scene';
import { VerticalMenu, drawControls, settingsItems } from './ui/menus';
import { UiSurface } from './ui/surface';

export type SceneFactory = (game: Game, params?: Record<string, unknown>) => GameScene;

type PausePage = 'main' | 'party' | 'controls' | 'settings';

interface PauseState {
  slot: Slot;
  page: PausePage;
  menu: VerticalMenu;
  /** Paused for a controller disconnect. */
  disconnect: Slot | null;
}

export class Game {
  readonly pipeline: Pipeline;
  readonly input = new InputManager();
  readonly audio = new AudioEngine();
  readonly ui: UiSurface;
  readonly scenes = new SceneManager<GameScene>();
  readonly loop: FixedLoop;
  readonly store: KeyValueStore;
  save: SaveData;
  saveMessage: string | null;
  /** This tick's intents per slot (null when the slot isn't joined). */
  readonly intents: Record<Slot, PlayerIntent | null> = { 0: null, 1: null };
  /** Seconds since start (render clock). */
  time = 0;
  frames = 0;
  ticks = 0;
  debug: boolean;
  /** Per-frame timing for the debug overlay and the benchmark. */
  frameMs = 0;
  tickMs = 0;
  fps = 60;
  pause: PauseState | null = null;
  /** The run in progress (its flow between scenes), if any. */
  flow: RunFlow | null = null;
  private registry = new Map<string, SceneFactory>();
  private blackScene = new THREE.Scene();
  private blackRig = new CameraRig();
  private lastFrameT = -1;
  private lastTickCost = 0;
  private hidden = false;
  private cursorHidden = false;
  private overlay: HTMLDivElement | null = null;
  private intentBuf: Record<Slot, PlayerIntent> = { 0: emptyIntent(), 1: emptyIntent() };
  readonly isQa: boolean;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly config: LaunchConfig,
  ) {
    this.isQa = config.qa || config.bench;
    this.pipeline = new Pipeline(canvas, { preserveDrawingBuffer: this.isQa });
    this.ui = new UiSurface(this.pipeline.uiCanvas);
    this.debug = config.debug;
    this.store = this.isQa ? new MemoryStore() : safeLocalStorage();
    const loaded = loadSave(this.store);
    this.save = loaded.data;
    this.saveMessage = loaded.message;
    this.blackScene.fog = new THREE.FogExp2(0x000000, 0.01);
    this.scenes.instant = this.isQa;
    this.pipeline.renderer.setClearColor(C.night0, 0);
    this.applySettings();
    this.loop = new FixedLoop({
      tick: (dt) => this.tick(dt),
      frame: (alpha, frameDt) => this.frame(alpha, frameDt),
    });
  }

  register(name: string, factory: SceneFactory): void {
    this.registry.set(name, factory);
  }

  has(name: string): boolean {
    return this.registry.has(name);
  }

  /** Change scene with a transition. */
  goto(
    name: SceneName | string,
    params?: Record<string, unknown>,
    style: 'dissolve' | 'wipe' = 'dissolve',
  ): void {
    const f = this.registry.get(name);
    if (!f) throw new Error(`Unknown scene: ${name}`);
    this.scenes.go(() => {
      this.scenes.current?.dispose?.();
      return f(this, params);
    }, style);
  }

  persist(): void {
    if (this.isQa) return;
    writeSave(this.store, this.save);
  }

  /** Push settings to every subsystem. */
  applySettings(): void {
    const s = this.save.settings;
    this.ui.setLargeText(s.largeText);
    this.pipeline.dither = s.dither ? TUNING.render.ditherStrength : 0;
    this.audio.setVolumes({ master: s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume });
    this.input.pads.rumbleEnabled = s.rumble;
  }

  toggleFullscreen(): void {
    const s = this.save.settings;
    try {
      if (!document.fullscreenElement) {
        void document.documentElement.requestFullscreen?.().catch(() => undefined);
        s.fullscreen = true;
      } else {
        void document.exitFullscreen?.().catch(() => undefined);
        s.fullscreen = false;
      }
    } catch {
      // Fullscreen can be refused (iframes, permissions): ignore.
    }
    this.persist();
  }

  rumble(slot: Slot, kind: RumbleKind): void {
    if (this.save.settings.rumble) this.input.rumble(slot, kind);
  }

  start(): void {
    this.input.attach(window, this.canvas);
    const unlock = (): void => this.audio.unlock();
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('resize', () => this.pipeline.resize());
    document.addEventListener('fullscreenchange', () => {
      this.save.settings.fullscreen = !!document.fullscreenElement;
      this.pipeline.resize();
    });
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.visibilityState === 'hidden';
      if (this.hidden) this.autoPause();
      else this.loop.resetClock();
    });
    this.canvas.addEventListener('webglcontextlost', () => this.showOverlay('Restoring graphics'));
    this.canvas.addEventListener('webglcontextrestored', () => this.showOverlay(null));
    const step = (t: number): void => {
      requestAnimationFrame(step);
      if (this.hidden) return;
      const dt = this.lastFrameT < 0 ? 1 / 60 : Math.min(0.25, (t - this.lastFrameT) / 1000);
      this.lastFrameT = t;
      this.input.poll(dt);
      this.updateCursor();
      this.loop.advance(t);
    };
    requestAnimationFrame(step);
  }

  /** Render one frame synchronously without advancing the simulation (QA hooks). */
  renderNow(frameDt = 0): void {
    this.frame(1, frameDt);
  }

  /** Run simulation ticks synchronously (QA fast-forward, bench setup). */
  runTicks(n: number): void {
    this.loop.runTicks(n);
  }

  /** Pause when the tab is hidden (spec §3.6). */
  private autoPause(): void {
    const scene = this.scenes.current;
    if (this.pause || !scene?.pausable()) return;
    this.openPause(0, null);
  }

  private openPause(slot: Slot, disconnect: Slot | null): void {
    this.pause = { slot, page: 'main', menu: this.pauseMenu(), disconnect };
    this.audio.setPaused(true);
    this.audio.play('ui_confirm');
  }

  private closePause(): void {
    this.pause = null;
    this.audio.setPaused(false);
    this.audio.play('ui_back');
  }

  private pauseMenu(): VerticalMenu {
    return new VerticalMenu([
      { label: 'Resume', act: () => this.closePause() },
      { label: 'Party', act: () => this.setPausePage('party') },
      { label: 'Controls', act: () => this.setPausePage('controls') },
      { label: 'Settings', act: () => this.setPausePage('settings') },
      { label: 'Fullscreen', act: () => this.toggleFullscreen() },
      {
        label: 'Quit to title',
        act: () => {
          this.pause = null;
          this.audio.setPaused(false);
          this.goto('title');
        },
      },
    ]);
  }

  private setPausePage(page: PausePage): void {
    if (!this.pause) return;
    this.pause.page = page;
    if (page === 'settings') {
      this.pause.menu = new VerticalMenu(
        settingsItems(
          this.save.settings,
          () => {
            this.applySettings();
            this.persist();
          },
          () => this.toggleFullscreen(),
        ),
      );
    } else if (page === 'main') this.pause.menu = this.pauseMenu();
  }

  private readIntents(): void {
    for (const s of [0, 1] as Slot[]) {
      const joined = this.input.isJoined(s) || this.input.hasOverride(s);
      this.intents[s] = joined ? this.input.consume(s, this.intentBuf[s]) : null;
    }
  }

  private tick(dt: number): void {
    const t0 = performance.now();
    this.ticks++;
    this.readIntents();
    const scene = this.scenes.current;
    // Controller disconnects pause the game (spec §7.2).
    for (const s of [0, 1] as Slot[]) {
      if (this.input.disconnected[s] && !this.pause && scene?.pausable()) this.openPause(s, s);
    }
    if (this.pause) {
      this.pauseTick(dt);
      this.lastTickCost += performance.now() - t0;
      return;
    }
    // Joins (player 2 presses Start) and drops (hold Back for 2 s).
    if (scene && scene.allowJoin() && this.input.playerCount < 2) {
      const dev = this.input.takeJoinRequest();
      if (dev) {
        const slot = this.input.join(dev);
        if (slot !== null) {
          this.audio.play('ui_confirm');
          scene.onJoin?.(slot);
        }
      }
    }
    const drop = this.input.takeDropRequest();
    if (drop !== null && this.input.playerCount > 1) {
      scene?.onDrop?.(drop);
      this.input.drop(drop);
      this.audio.play('ui_back');
    }
    // Either player can pause.
    if (scene?.pausable() && !this.scenes.transitioning) {
      for (const s of [0, 1] as Slot[]) {
        if (this.intents[s]?.pause) {
          this.openPause(s, null);
          break;
        }
      }
    }
    if (!this.pause) {
      this.scenes.tick(dt);
      this.flow?.addPlayTime(dt);
    }
    this.lastTickCost += performance.now() - t0;
  }

  private pauseTick(dt: number): void {
    const p = this.pause!;
    if (p.disconnect !== null) {
      // The other player can press Start to drop the disconnected slot and continue.
      if (!this.input.disconnected[p.disconnect]) {
        this.closePause();
        return;
      }
      const other: Slot = p.disconnect === 0 ? 1 : 0;
      if (this.intents[other]?.pause && this.input.isJoined(other)) {
        this.scenes.current?.onDrop?.(p.disconnect);
        this.input.drop(p.disconnect);
        this.closePause();
      }
      return;
    }
    // Only the player who paused can unpause (unless they dropped).
    if (!this.input.isJoined(p.slot)) p.slot = 0;
    const it = this.intents[p.slot];
    if (p.page === 'main' && it?.pause) {
      this.closePause();
      return;
    }
    if (p.page === 'party' || p.page === 'controls') {
      if (it?.cancel || it?.confirm || it?.pause) this.setPausePage('main');
      return;
    }
    const r = p.menu.update(it, dt);
    if (r === 'move') this.audio.play('ui_move');
    else if (r === 'act') this.audio.play('ui_confirm');
    else if (r === 'back') {
      if (p.page === 'main') this.closePause();
      else this.setPausePage('main');
    }
  }

  private frame(_alpha: number, frameDt: number): void {
    const t0 = performance.now();
    this.time += frameDt;
    this.frames++;
    this.audio.update(frameDt);
    this.scenes.frame(this.pause ? 1 : _alpha, this.pause ? 0 : frameDt);
    const scene = this.scenes.current;
    const view = scene?.world() ?? null;
    this.ui.begin();
    scene?.drawUi(this.ui);
    if (this.pause) this.drawPause();
    this.drawDebug();
    this.ui.end();
    const rig = view?.rig ?? this.blackRig;
    if (view?.palette) this.pipeline.setPrimaryPalette(view.palette);
    else this.pipeline.setPrimaryPalette('main');
    this.pipeline.render({
      scene: view?.scene ?? this.blackScene,
      camera: rig.camera,
      subTexel: rig.subTexel,
      texelOrigin: rig.texelOrigin,
      lutMix: view?.lutMix ?? 0,
      coverage: this.scenes.coverage,
      wipe: this.scenes.style === 'wipe',
      flash: !!view?.flash && !this.save.settings.reduceFlashing,
      ui: true,
    });
    this.frameMs = performance.now() - t0 + this.lastTickCost;
    this.tickMs = this.lastTickCost;
    this.lastTickCost = 0;
    if (frameDt > 0) this.fps = this.fps * 0.95 + (1 / frameDt) * 0.05;
  }

  private drawPause(): void {
    const ui = this.ui;
    const p = this.pause!;
    // Dim the world with a dark dither of night pixels.
    ui.ctx.fillStyle = '#0e1013';
    for (let y = 0; y < ui.height; y += 2) {
      for (let x = (y / 2) % 2; x < ui.width; x += 2) ui.ctx.fillRect(x, y, 1, 1);
    }
    const cx = Math.floor(ui.width / 2);
    if (p.disconnect !== null) {
      ui.panel(cx - 110, ui.height / 2 - 20, 220, 40, C.night0, C.slate1);
      ui.text(`Reconnect controller for Player ${p.disconnect + 1}`, cx, ui.height / 2 - 12, C.fog2, {
        align: 'center',
      });
      const other = p.disconnect === 0 ? 2 : 1;
      if (this.input.playerCount > 1)
        ui.text(`Player ${other}: press Start to continue alone`, cx, ui.height / 2 + 2, C.fog0, {
          align: 'center',
        });
      return;
    }
    if (p.page === 'controls') {
      ui.panel(8, 8, ui.width - 16, ui.height - 16, C.night0, C.slate1);
      ui.text('Controls', 18, 16, C.fog2);
      drawControls(ui, 22, 34);
      return;
    }
    if (p.page === 'party') {
      ui.panel(cx - 140, 30, 280, ui.height - 60, C.night0, C.slate1);
      ui.text('Party', cx - 128, 38, C.fog2);
      const lines = this.scenes.current?.partyLines?.() ?? ['No party here.'];
      lines.forEach((l, i) => ui.text(l, cx - 128, 54 + i * 10, C.fog1, { shadow: null }));
      return;
    }
    const w = p.page === 'settings' ? 220 : 140;
    const items = p.menu.items.length;
    const h = items * 12 + 30;
    const top = Math.floor((ui.height - h) / 2);
    ui.panel(cx - w / 2, top, w, h, C.night0, C.slate1);
    ui.text(p.page === 'settings' ? 'Settings' : 'Paused', cx, top + 6, C.fog2, { align: 'center' });
    p.menu.draw(ui, cx - w / 2 + 12, top + 22, w - 24);
  }

  private drawDebug(): void {
    if (!this.debug) return;
    const ui = this.ui;
    const st = this.pipeline.stats();
    const lines = [
      `fps ${Math.round(this.fps)}  frame ${this.frameMs.toFixed(1)}ms  tick ${this.tickMs.toFixed(2)}ms`,
      `calls ${st.calls}  tris ${st.triangles}`,
    ];
    const info = this.scenes.current?.debugInfo?.() ?? {};
    for (const [k, v] of Object.entries(info)) lines.push(`${k} ${v}`);
    let y = ui.height - 4 - lines.length * 10;
    for (const l of lines) {
      ui.text(l, ui.width - 4, y, C.fog2, { align: 'right' });
      y += 10;
    }
  }

  private updateCursor(): void {
    const idle = performance.now() - this.input.kb.lastMouseMove > TUNING.render.cursorHideSeconds * 1000;
    if (idle !== this.cursorHidden) {
      this.cursorHidden = idle;
      document.body.classList.toggle('hide-cursor', idle);
    }
  }

  private showOverlay(text: string | null): void {
    if (!text) {
      this.overlay?.remove();
      this.overlay = null;
      return;
    }
    if (!this.overlay) {
      this.overlay = document.createElement('div');
      Object.assign(this.overlay.style, {
        position: 'fixed',
        inset: '0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#d8dcda',
        background: '#0e1013',
        font: '16px monospace',
      });
      document.body.appendChild(this.overlay);
    }
    this.overlay.textContent = text;
  }

  /** Which slots are joined. */
  get slots(): Slot[] {
    const s: Slot[] = [];
    if (this.input.isJoined(0)) s.push(0);
    if (this.input.isJoined(1)) s.push(1);
    return s;
  }
}

function safeLocalStorage(): KeyValueStore {
  try {
    const k = '__exodus_probe';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    return new MemoryStore();
  }
}
