/**
 * The game shell: owns the renderer pipeline, input, UI surface, save data, the fixed-step loop, and the scene
 * manager. Scenes are created through the registry in `scenes/registry.ts`.
 */
import * as THREE from 'three';
import type { LaunchConfig, SceneName } from './core/config';
import { FixedLoop } from './core/loop';
import { loadSave, writeSave, type KeyValueStore, MemoryStore } from './core/save';
import { SceneManager } from './core/scenes';
import type { SaveData, Slot } from './core/types';
import { TUNING } from './content/tuning';
import { InputManager } from './input/manager';
import { CameraRig } from './render/camera';
import { Pipeline } from './render/pipeline';
import { C } from './render/palettes';
import type { GameScene } from './scenes/scene';
import { UiSurface } from './ui/surface';

export type SceneFactory = (game: Game, params?: Record<string, unknown>) => GameScene;

export class Game {
  readonly pipeline: Pipeline;
  readonly input = new InputManager();
  readonly ui: UiSurface;
  readonly scenes = new SceneManager<GameScene>();
  readonly loop: FixedLoop;
  readonly store: KeyValueStore;
  save: SaveData;
  saveMessage: string | null;
  /** Seconds since start (render clock). */
  time = 0;
  frames = 0;
  ticks = 0;
  debug: boolean;
  /** Per-frame timing for the debug overlay and the benchmark. */
  frameMs = 0;
  tickMs = 0;
  fps = 60;
  private registry = new Map<string, SceneFactory>();
  private blackScene = new THREE.Scene();
  private blackRig = new CameraRig();
  private lastFrameT = -1;
  private lastTickCost = 0;
  private hidden = false;
  private cursorHidden = false;
  private overlay: HTMLDivElement | null = null;
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
    this.ui.setLargeText(this.save.settings.largeText);
    this.pipeline.dither = this.save.settings.dither ? TUNING.render.ditherStrength : 0;
    this.blackScene.fog = new THREE.FogExp2(0x000000, 0.01);
    this.scenes.instant = this.isQa;
    this.pipeline.renderer.setClearColor(C.night0, 0);
    this.loop = new FixedLoop({
      tick: (dt) => this.tick(dt),
      frame: (alpha, frameDt) => this.frame(alpha, frameDt),
    });
  }

  register(name: string, factory: SceneFactory): void {
    this.registry.set(name, factory);
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

  start(): void {
    this.input.attach(window, this.canvas);
    window.addEventListener('resize', () => this.pipeline.resize());
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.visibilityState === 'hidden';
      if (this.hidden) this.onHidden();
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

  /** Hook for pausing when the tab is hidden (the pause menu wires in here). */
  onHidden: () => void = () => undefined;

  private tick(dt: number): void {
    const t0 = performance.now();
    this.ticks++;
    this.scenes.tick(dt);
    this.lastTickCost += performance.now() - t0;
  }

  private frame(_alpha: number, frameDt: number): void {
    const t0 = performance.now();
    this.time += frameDt;
    this.frames++;
    this.scenes.frame(_alpha, frameDt);
    const scene = this.scenes.current;
    const view = scene?.world() ?? null;
    this.ui.begin();
    scene?.drawUi(this.ui);
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
      ui.text(l, 4, y, C.fog2);
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
