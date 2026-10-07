import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/content/tuning';
import { DEG } from '../src/core/math';
import { Kit } from '../src/models/kit';
import { buildRig, defaultLook } from '../src/models/rig';
import { CameraRig } from '../src/render/camera';
import {
  C,
  EPILOGUE,
  MAIN,
  buildLut,
  countOffPalette,
  hexToRgb,
  nearestIndex,
  rgbToInt,
} from '../src/render/palettes';
import { NUM_FONT, TEXT_FONT, measure, wrap } from '../src/ui/font';

describe('palettes and quantization', () => {
  it('has the spec palette sizes', () => {
    expect(MAIN.rgb.length).toBe(32);
    expect(EPILOGUE.rgb.length).toBe(21);
  });

  it('maps every palette color to itself', () => {
    for (const p of [MAIN, EPILOGUE]) {
      p.rgb.forEach(([r, g, b], i) => {
        const j = nearestIndex(p, r, g, b);
        expect(rgbToInt(...p.rgb[j])).toBe(rgbToInt(r, g, b));
        void i;
      });
    }
  });

  it('never maps ordinary muted colors to the reserved red or cyan', () => {
    const reserved = new Set([C.red0, C.red1, C.red2, C.cyan0, C.cyan1, C.cyan2]);
    // Brick under sodium light, dark teal-gray fog, rusty browns, wet slate.
    const samples = [0x5a3a30, 0x6e3b35, 0x2f4a4a, 0x355a58, 0x4a3129, 0x3e5a5a, 0x7a4a40, 0x203030];
    for (const hex of samples) {
      const [r, g, b] = hexToRgb(hex);
      const out = rgbToInt(...MAIN.rgb[nearestIndex(MAIN, r, g, b)]);
      expect(reserved.has(out as never)).toBe(false);
    }
    // Strongly red and cyan inputs still reach them.
    const [rr, rg, rb] = hexToRgb(0xe03048);
    expect(rgbToInt(...MAIN.rgb[nearestIndex(MAIN, rr, rg, rb)])).toBe(C.red1);
    const [cr, cg, cb] = hexToRgb(0x40e0d0);
    expect(rgbToInt(...MAIN.rgb[nearestIndex(MAIN, cr, cg, cb)])).toBe(C.cyan1);
  });

  it('builds a lookup table that only contains palette colors', () => {
    const lut = buildLut(MAIN, 16);
    expect(lut.length).toBe(16 * 16 * 16 * 4);
    expect(countOffPalette(lut, [MAIN])).toBe(0);
  });
});

describe('geometry kit', () => {
  function outwardFraction(k: Kit, center: THREE.Vector3): number {
    const pos = k.solid.pos;
    const nrm = k.solid.nrm;
    let ok = 0;
    const tris = pos.length / 9;
    for (let t = 0; t < tris; t++) {
      const cx = (pos[t * 9] + pos[t * 9 + 3] + pos[t * 9 + 6]) / 3;
      const cy = (pos[t * 9 + 1] + pos[t * 9 + 4] + pos[t * 9 + 7]) / 3;
      const cz = (pos[t * 9 + 2] + pos[t * 9 + 5] + pos[t * 9 + 8]) / 3;
      const d =
        (cx - center.x) * nrm[t * 9] + (cy - center.y) * nrm[t * 9 + 1] + (cz - center.z) * nrm[t * 9 + 2];
      if (d > 0) ok++;
    }
    return ok / tris;
  }

  it('builds primitives with outward-facing triangles', () => {
    const cases: [string, (k: Kit) => void, THREE.Vector3][] = [
      ['box', (k) => k.box(1, 1, 1, C.slate0), new THREE.Vector3(0, 0.5, 0)],
      ['cylinder', (k) => k.cylinder(0.5, 1, 7, C.slate0), new THREE.Vector3(0, 0.5, 0)],
      ['bevelBox', (k) => k.bevelBox(1, 1, 1, 0.2, C.slate0), new THREE.Vector3(0, 0.5, 0)],
      ['cone', (k) => k.cone(0.5, 1, 6, C.slate0), new THREE.Vector3(0, 0.2, 0)],
      ['wedge', (k) => k.wedge(1, 1, 1, C.slate0), new THREE.Vector3(0, 0.3, -0.2)],
      ['gable', (k) => k.gable(1, 1, 1, C.slate0), new THREE.Vector3(0, 0.3, 0)],
    ];
    for (const [name, build, center] of cases) {
      const k = new Kit();
      build(k);
      expect(k.triangles, name).toBeGreaterThan(0);
      expect(outwardFraction(k, center), name).toBe(1);
    }
  });

  it('applies the transform stack and routes glow geometry', () => {
    const k = new Kit();
    k.at({ x: 10, ry: Math.PI / 2 }, () => {
      k.box(1, 1, 1, C.slate0);
      k.glow(() => k.box(0.2, 0.2, 0.2, C.amber2, { y: 1 }));
      k.light({ x: 0, y: 2, z: 1, color: C.amber2, intensity: 5, range: 6 });
    });
    const out = k.build();
    expect(out.solid).not.toBeNull();
    expect(out.glow).not.toBeNull();
    expect(out.lights[0].x).toBeCloseTo(11);
    expect(out.lights[0].z).toBeCloseTo(0);
    out.solid!.computeBoundingBox();
    expect(out.solid!.boundingBox!.min.x).toBeCloseTo(9.5);
  });
});

describe('camera snapping', () => {
  it('snaps to whole texels and reports the sub-texel remainder', () => {
    const rig = new CameraRig();
    rig.teleport(3.217, -1.093);
    expect(Number.isInteger(rig.texelOrigin.x)).toBe(true);
    expect(Number.isInteger(rig.texelOrigin.y)).toBe(true);
    expect(Math.abs(rig.subTexel.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(rig.subTexel.y)).toBeLessThanOrEqual(0.5);
  });

  it('keeps an identical camera inside one texel cell', () => {
    const rig = new CameraRig();
    rig.teleport(0, 0);
    const p0 = rig.camera.position.clone();
    const o0 = { ...rig.texelOrigin };
    // Find a move that stays inside the cell.
    rig.teleport(rig.texel * 0.1 * Math.sign(-rig.subTexel.x || 1), 0);
    if (rig.texelOrigin.x === o0.x && rig.texelOrigin.y === o0.y) {
      expect(rig.camera.position.equals(p0)).toBe(true);
    }
  });

  it('projects and unprojects the ground consistently', () => {
    const rig = new CameraRig();
    rig.teleport(5, 2);
    const low = rig.worldToLow(6.5, 0, 4, { x: 0, y: 0 });
    const back = rig.lowToGround(low.x, low.y, { x: 0, z: 0 });
    expect(back.x).toBeCloseTo(6.5, 5);
    expect(back.z).toBeCloseTo(4, 5);
    const center = rig.worldToLow(5, 0, 2, { x: 0, y: 0 });
    expect(center.x).toBeCloseTo(TUNING.render.width / 2, 3);
    expect(center.y).toBeCloseTo(TUNING.render.height / 2, 3);
  });
});

describe('character scale', () => {
  it('puts a standing character at 22–28 texels tall in the low-res buffer', () => {
    const rig = buildRig(defaultLook());
    const p = TUNING.render.pitchDeg * DEG;
    const t = TUNING.render.worldPerTexel;
    // Height on screen: the vertical extent foreshortened by the pitch, plus the body's depth.
    const px = (rig.top * Math.cos(p) + 0.27 * Math.sin(p)) / t;
    expect(px).toBeGreaterThanOrEqual(22);
    expect(px).toBeLessThanOrEqual(28);
  });
});

describe('bitmap fonts', () => {
  it('covers printable ASCII and the extra glyphs', () => {
    for (let c = 32; c <= 126; c++) {
      expect(TEXT_FONT.glyphs.has(String.fromCharCode(c)), String.fromCharCode(c)).toBe(true);
    }
    for (const ch of ['◆', '·', '—', '…']) expect(TEXT_FONT.glyphs.has(ch)).toBe(true);
    for (const ch of '0123456789+-/:') expect(NUM_FONT.glyphs.has(ch)).toBe(true);
  });

  it('keeps glyphs inside a 5×7 cell (plus one descender row)', () => {
    for (const [ch, g] of TEXT_FONT.glyphs) {
      expect(g.rows.length, ch).toBeLessThanOrEqual(8);
      expect(g.w, ch).toBeLessThanOrEqual(5);
    }
  });

  it('measures and wraps text', () => {
    expect(measure(TEXT_FONT, 'A')).toBe(5);
    expect(measure(TEXT_FONT, 'AA')).toBe(11);
    const lines = wrap(TEXT_FONT, 'Leave tonight. Take 95 south. Don’t stop in Providence.', 80);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(measure(TEXT_FONT, l)).toBeLessThanOrEqual(80);
  });
});
