/** The contract every game scene implements (rendering side). */
import type * as THREE from 'three';
import type { SceneLike } from '../core/scenes';
import type { CameraRig } from '../render/camera';
import type { UiSurface } from '../ui/surface';

export interface WorldView {
  scene: THREE.Scene;
  rig: CameraRig;
  /** 0 = main palette, 1 = epilogue palette (dithered crossfade between). */
  lutMix?: number;
  /** Primary palette for the whole scene. */
  palette?: 'main' | 'epilogue';
  /** Full-screen lightning flash this frame. */
  flash?: boolean;
}

export interface GameScene extends SceneLike {
  readonly id: string;
  /** The 3D world to render, or null for screens that are pure UI over black. */
  world(): WorldView | null;
  /** Draw this scene's UI into the low-res UI layer. */
  drawUi(ui: UiSurface): void;
  /** Player 2 may join right now (not during checkpoints or cinematics). */
  allowJoin(): boolean;
  /** The pause menu may open. */
  pausable(): boolean;
  /** Called when the scene is replaced (free GPU resources). */
  dispose?(): void;
  /** Debug/QA hooks. */
  debugInfo?(): Record<string, string | number>;
}
