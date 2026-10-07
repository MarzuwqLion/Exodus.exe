/**
 * HUD portraits (spec §13.3): "a tiny head portrait, rendered from the 3D head into a small render target".
 * Each party member's rig is rendered once, head and shoulders, facing the camera, into a few-pixel target;
 * the pixels are quantized to the main palette and outlined in night, then cached as a canvas the HUD draws.
 * An android whose Skin is gone gets its own portrait with the chassis showing.
 */
import * as THREE from 'three';
import { newPose, samplePose } from '../anim/poses';
import type { MemberId } from '../core/types';
import { PARTY_LOOKS } from '../models/looks';
import { buildRig } from '../models/rig';
import { CharacterRenderer, type CharInstance } from './characters';
import { C, MAIN, nearestColor } from './palettes';

let renderer: THREE.WebGLRenderer | null = null;
const cache = new Map<string, HTMLCanvasElement | null>();

/** The game registers its renderer once; until then (and headless), portraits fall back to the HUD's own. */
export function setPortraitRenderer(r: THREE.WebGLRenderer): void {
  renderer = r;
}

/** The member's portrait at `size` pixels square (cached), or null if it can't be rendered here. */
export function portraitFor(id: MemberId, size: number, chassis: boolean): HTMLCanvasElement | null {
  const key = `${id}:${size}:${chassis ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const c = renderer ? render(renderer, id, size, chassis) : null;
  cache.set(key, c);
  return c;
}

function render(
  r: THREE.WebGLRenderer,
  id: MemberId,
  size: number,
  chassis: boolean,
): HTMLCanvasElement | null {
  const look = PARTY_LOOKS[id];
  if (!look || typeof document === 'undefined') return null;
  const scene = new THREE.Scene();
  const chars = new CharacterRenderer();
  const rig = buildRig(look);
  const inst: CharInstance = {
    rig,
    look,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0.35,
    pose: newPose(),
    skin01: chassis ? 0 : 1,
    visible: true,
    slice: 0,
    sliceY: 1.1,
    seamFlicker: false,
    flash: false,
    noShadow: true,
  };
  samplePose(inst.pose, 'idle', { phase: 0, speed: 0, t: 0, seed: 0.2 });
  chars.render([inst], 0);
  scene.add(chars.group);
  scene.add(new THREE.HemisphereLight(0xc8d0d8, 0x30343a, 2.2));
  const key = new THREE.DirectionalLight(0xffe0c0, 2.4);
  key.position.set(0.8, 1.6, 2);
  scene.add(key);
  // Head and shoulders: frame the top 0.62 m of the figure, looking at its face.
  const top = rig.top;
  const half = 0.31;
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 10);
  cam.position.set(0, top - half + 0.04, 3);
  cam.lookAt(0, top - half + 0.04, 0);
  const target = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true });
  const prevTarget = r.getRenderTarget();
  const prevClear = new THREE.Color();
  r.getClearColor(prevClear);
  const prevAlpha = r.getClearAlpha();
  try {
    r.setRenderTarget(target);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.render(scene, cam);
    const px = new Uint8Array(size * size * 4);
    r.readRenderTargetPixels(target, 0, 0, size, size, px);
    return toCanvas(px, size);
  } catch {
    return null;
  } finally {
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevClear, prevAlpha);
    target.dispose();
  }
}

/** Palette-quantized pixels (flipped upright) with a one-pixel night outline around the silhouette. */
function toCanvas(px: Uint8Array, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size + 2;
  canvas.height = size + 2;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size + 2, size + 2);
  const covered = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < size && y < size && px[((size - 1 - y) * size + x) * 4 + 3] > 8;
  const outline = [(C.night0 >> 16) & 255, (C.night0 >> 8) & 255, C.night0 & 255];
  for (let y = -1; y <= size; y++) {
    for (let x = -1; x <= size; x++) {
      const o = ((y + 1) * (size + 2) + (x + 1)) * 4;
      if (covered(x, y)) {
        const i = ((size - 1 - y) * size + x) * 4;
        const [r, g, b] = nearestColor(MAIN, px[i], px[i + 1], px[i + 2]);
        img.data.set([r, g, b, 255], o);
      } else if (covered(x - 1, y) || covered(x + 1, y) || covered(x, y - 1) || covered(x, y + 1)) {
        img.data.set([outline[0], outline[1], outline[2], 255], o);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
