/**
 * QA hooks on `window.__exodus` (only with ?qa=1, ?bench=1, or ?debug=1). Used by the Playwright screenshot
 * runner, the palette test, the shimmer test, and the benchmark.
 */
import type { Game } from './game';
import { emptyIntent } from './input/intents';
import { EPILOGUE, MAIN, countOffPalette, type PaletteData } from './render/palettes';

export interface ShimmerResult {
  frames: number;
  identicalInCell: number;
  shiftedCompared: number;
  /** Pixels that differ after compensating the whole-texel shift (static edges must not change). */
  mismatched: number;
  /** Frames inside one texel cell that weren't identical, and how many pixels differed in total. */
  inCellFailures: number;
  inCellPixels: number;
  comparedPixels: number;
  /** Frames skipped because the camera moved to the next coarse depth step. */
  depthSteps: number;
}

export interface ExodusQa {
  ready(): boolean;
  frames(): number;
  scene(): string;
  /** Count of final low-res pixels (world + UI) outside the active palette(s). */
  paletteCheck(palette?: 'main' | 'epilogue' | 'both'): { off: number; total: number };
  /** PNG data URL of the final low-res frame. */
  lowResPng(): string;
  stats(): Record<string, number>;
  /** Pan the camera across a static scene in sub-texel steps and compare frames. */
  shimmer(steps: number, stepTexels: number, opts?: { vignette?: boolean; fog?: boolean }): ShimmerResult;
  runTicks(n: number): void;
  renderNow(): void;
  /** Start sampling every frame; with `move`, both players wander the stop on scripted sticks. */
  benchStart(move: boolean): void;
  /** Stop sampling: per-frame samples of the frame interval, CPU time, draw calls, triangles, lights, heap. */
  benchStop(): BenchSamples;
  game: Game;
}

export interface BenchSamples {
  intervalMs: number[];
  cpuMs: number[];
  calls: number[];
  triangles: number[];
  lights: number[];
  heapMb: number[];
}

declare global {
  interface Window {
    __exodus?: ExodusQa;
  }
}

export function installQaHooks(game: Game): void {
  const pick = (p?: 'main' | 'epilogue' | 'both'): PaletteData[] =>
    p === 'epilogue' ? [EPILOGUE] : p === 'both' ? [MAIN, EPILOGUE] : [MAIN];
  window.__exodus = {
    game,
    ready: () => game.frames > 3 && !game.scenes.transitioning && game.scenes.current !== null,
    frames: () => game.frames,
    scene: () => game.scenes.current?.id ?? '',
    paletteCheck: (p) => {
      game.renderNow();
      const px = game.pipeline.readLowRes(true);
      return { off: countOffPalette(px, pick(p)), total: px.length / 4 };
    },
    lowResPng: () => {
      game.renderNow();
      const px = game.pipeline.readLowRes(true);
      const c = document.createElement('canvas');
      c.width = game.pipeline.W;
      c.height = game.pipeline.H;
      const ctx = c.getContext('2d')!;
      const img = ctx.createImageData(c.width, c.height);
      img.data.set(px);
      ctx.putImageData(img, 0, 0);
      return c.toDataURL('image/png');
    },
    stats: () => {
      const s = game.pipeline.stats();
      return { ...s, fps: game.fps, frameMs: game.frameMs, tickMs: game.tickMs };
    },
    shimmer: (steps, stepTexels, opts) =>
      shimmerTest(game, steps, stepTexels, opts?.vignette ?? false, opts?.fog ?? false),
    runTicks: (n) => game.runTicks(n),
    renderNow: () => game.renderNow(),
    benchStart: (move) => {
      const s: BenchSamples = { intervalMs: [], cpuMs: [], calls: [], triangles: [], lights: [], heapMb: [] };
      bench = s;
      let t = 0;
      const sticks = [emptyIntent(), emptyIntent()];
      game.onFrame = (g, dt) => {
        t += dt;
        if (move) {
          // Two players wander in slow loops, now and then breaking into a run.
          sticks.forEach((it, i) => {
            const a = t * (0.35 + i * 0.13) + i * 2.1;
            it.move.x = Math.cos(a) * 0.9;
            it.move.y = Math.sin(a * 1.3) * 0.9;
            it.sprint = Math.sin(t * 0.7 + i) > 0.6;
            g.input.setOverride(i as 0 | 1, it);
          });
        }
        const st = g.pipeline.stats();
        s.intervalMs.push(dt * 1000);
        s.cpuMs.push(g.frameMs);
        s.calls.push(st.calls);
        s.triangles.push(st.triangles);
        s.lights.push(Number(g.scenes.current?.debugInfo?.().lights ?? 0));
        const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        s.heapMb.push(mem ? mem.usedJSHeapSize / (1024 * 1024) : 0);
      };
    },
    benchStop: () => {
      game.onFrame = null;
      game.input.setOverride(0, null);
      game.input.setOverride(1, null);
      return bench ?? { intervalMs: [], cpuMs: [], calls: [], triangles: [], lights: [], heapMb: [] };
    },
  };
}

let bench: BenchSamples | null = null;

function shimmerTest(
  game: Game,
  steps: number,
  stepTexels: number,
  vignette: boolean,
  fog: boolean,
): ShimmerResult {
  const view = game.scenes.current?.world();
  if (!view) throw new Error('shimmer test needs a world scene');
  const rig = view.rig;
  const scene = game.scenes.current as unknown as { freeze?: boolean; qaStatic?: boolean };
  scene.freeze = true;
  scene.qaStatic = true;
  const prevVignette = game.pipeline.vignette;
  if (!vignette) game.pipeline.vignette = 0;
  // Vignette and fog are screen-anchored (centered on the view), so the strict rigid-shift check turns them off.
  const sceneFog = view.scene.fog as { density?: number } | null;
  const prevDensity = sceneFog?.density;
  if (!fog && sceneFog && prevDensity !== undefined) sceneFog.density = 0;
  const W = game.pipeline.W;
  const H = game.pipeline.H;
  const x0 = rig.focus.x;
  const z0 = rig.focus.z;
  let prev: Uint8Array | null = null;
  let prevO = { x: 0, y: 0, d: 0 };
  const result: ShimmerResult = {
    frames: 0,
    identicalInCell: 0,
    shiftedCompared: 0,
    mismatched: 0,
    comparedPixels: 0,
    inCellFailures: 0,
    inCellPixels: 0,
    depthSteps: 0,
  };
  const border = 8;
  for (let i = 0; i < steps; i++) {
    rig.focus.x = x0 + i * stepTexels * rig.texel;
    rig.focus.z = z0 + i * stepTexels * rig.texel * 0.61;
    rig.apply();
    game.renderNow();
    const img = game.pipeline.readLowRes(false);
    const o = { x: rig.texelOrigin.x, y: rig.texelOrigin.y, d: rig.depthIndex };
    if (prev && o.d !== prevO.d) {
      result.depthSteps++;
    } else if (prev) {
      const dx = o.x - prevO.x;
      const dy = o.y - prevO.y;
      if (dx === 0 && dy === 0) {
        let diff = 0;
        for (let k = 0; k < img.length; k += 4) {
          if (img[k] !== prev[k] || img[k + 1] !== prev[k + 1] || img[k + 2] !== prev[k + 2]) diff++;
        }
        if (diff === 0) result.identicalInCell++;
        else {
          result.inCellFailures++;
          result.inCellPixels += diff;
        }
      } else {
        result.shiftedCompared++;
        // new(px, py) = old(px + dx, py - dy), top-left coordinates.
        for (let py = border; py < H - border; py++) {
          for (let px = border; px < W - border; px++) {
            const ox = px + dx;
            const oy = py - dy;
            if (ox < border || oy < border || ox >= W - border || oy >= H - border) continue;
            const a = (py * W + px) * 4;
            const b = (oy * W + ox) * 4;
            result.comparedPixels++;
            if (img[a] !== prev[b] || img[a + 1] !== prev[b + 1] || img[a + 2] !== prev[b + 2])
              result.mismatched++;
          }
        }
      }
    }
    prev = img;
    prevO = o;
    result.frames++;
  }
  game.pipeline.vignette = prevVignette;
  if (sceneFog && prevDensity !== undefined) sceneFog.density = prevDensity;
  return result;
}
