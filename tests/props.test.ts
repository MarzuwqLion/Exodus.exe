import { describe, expect, it } from 'vitest';
import { Kit } from '../src/models/kit';
import {
  BILLBOARD_FACE,
  PROPS,
  PROP_BUDGET,
  PROP_IDS,
  propCategory,
  vint,
  vrand,
  type PropId,
} from '../src/models/props';
import {
  PARKED_CAR_VARIANTS,
  drone,
  parkedCar,
  recyclerVan,
  stationWagon,
  vanLightBar,
  yardTruck,
} from '../src/models/vehicles';
import { SANKOFA_NAME_ANCHOR, SANKOFA_LENGTH, sankofa, shipDeck } from '../src/models/ship';
import {
  BILLBOARD_CANVAS,
  BILLBOARD_LINES,
  billboardCanvas,
  billboardLayout,
  menuBoardCanvas,
  shipNameCanvas,
  signCanvas,
  textBitmap,
} from '../src/models/signs';
import { C, E, EPILOGUE, MAIN, rgbToInt, type PaletteData } from '../src/render/palettes';

const RED = new Set<number>([C.red0, C.red1, C.red2]);
const CYAN = new Set<number>([C.cyan0, C.cyan1, C.cyan2]);

/** Reserved colors a model may use (§4.5): the scanner kit and drones may use cyan; red only for Recycler
 *  gear (the van light bar while on). Everything else must use neither. */
type Reserved = 'none' | 'cyan' | 'red';

const PROP_RESERVED: Partial<Record<PropId, Reserved>> = {
  idKiosk: 'cyan',
  scannerArch: 'cyan',
  scannerTowerHead: 'cyan',
};

function build(fn: (k: Kit) => void): Kit {
  const k = new Kit();
  fn(k);
  return k;
}

/** Every vertex color in both sinks, as 0xRRGGBB. */
function colorsOf(k: Kit, sink: 'solid' | 'glow' | 'both' = 'both'): Set<number> {
  const out = new Set<number>();
  const sinks = sink === 'solid' ? [k.solid] : sink === 'glow' ? [k.glowSink] : [k.solid, k.glowSink];
  for (const s of sinks) {
    for (let i = 0; i < s.col.length; i += 3) {
      out.add(
        rgbToInt(Math.round(s.col[i] * 255), Math.round(s.col[i + 1] * 255), Math.round(s.col[i + 2] * 255)),
      );
    }
  }
  return out;
}

function allFinite(k: Kit): boolean {
  for (const s of [k.solid, k.glowSink]) {
    for (const arr of [s.pos, s.nrm, s.col]) {
      for (const v of arr) if (!Number.isFinite(v)) return false;
    }
  }
  return k.lights.every(
    (l) =>
      Number.isFinite(l.x) &&
      Number.isFinite(l.y) &&
      Number.isFinite(l.z) &&
      l.intensity > 0 &&
      l.range > 0 &&
      (l.flicker ?? 0) >= 0 &&
      (l.flicker ?? 0) <= 1,
  );
}

/** Lowest vertex y. */
function minY(k: Kit): number {
  let m = Infinity;
  for (const s of [k.solid, k.glowSink]) for (let i = 1; i < s.pos.length; i += 3) m = Math.min(m, s.pos[i]);
  return m;
}

/** A cheap fingerprint of a model's geometry and colors. */
function signature(k: Kit): string {
  let h = 0;
  for (const s of [k.solid, k.glowSink]) {
    for (let i = 0; i < s.pos.length; i++) h = (Math.imul(h, 31) + Math.round(s.pos[i] * 1000)) | 0;
    for (let i = 0; i < s.col.length; i++) h = (Math.imul(h, 31) + Math.round(s.col[i] * 255)) | 0;
  }
  // Variants may differ only in their lights (a flickering lamp), so lights count too.
  for (const l of k.lights)
    h = (Math.imul(h, 31) + Math.round((l.flicker ?? 0) * 100 + l.intensity * 10)) | 0;
  return `${k.triangles}:${h}`;
}

/** The shared checks for any model: builds, has triangles, within budget, finite, on palette, color rules. */
function audit(name: string, k: Kit, budget: number, palette: PaletteData, reserved: Reserved): void {
  expect(k.triangles, `${name} has triangles`).toBeGreaterThan(0);
  expect(k.triangles, `${name} triangle budget`).toBeLessThanOrEqual(budget);
  expect(allFinite(k), `${name} has finite positions, normals, colors, and lights`).toBe(true);
  const colors = colorsOf(k);
  for (const c of colors) {
    expect(palette.set.has(c), `${name} uses off-palette color #${c.toString(16).padStart(6, '0')}`).toBe(
      true,
    );
  }
  const usesRed = [...colors].some((c) => RED.has(c));
  const usesCyan = [...colors].some((c) => CYAN.has(c));
  expect(usesRed && reserved !== 'red', `${name} must not use alarm red`).toBe(false);
  expect(usesCyan && reserved !== 'cyan', `${name} must not use scanner cyan`).toBe(false);
}

describe('props registry', () => {
  it('has the props the spec asks for', () => {
    const required: PropId[] = [
      'chargingBay',
      'evCharger',
      'idKiosk',
      'shelf',
      'register',
      'counter',
      'boothSeat',
      'dinerTable',
      'boothSet',
      'stool',
      'chair',
      'coffeeMachine',
      'menuBoard',
      'wallTv',
      'gasPump',
      'canopy',
      'lockers',
      'partsBin',
      'vendingMachine',
      'securityCamera',
      'mechanicBench',
      'grill',
      'fridge',
      'sinkCounter',
      'trashCan',
      'boxes',
      'mopBucket',
      'restroomSign',
      'corkboard',
      'dumpster',
      'trashBags',
      'pallet',
      'jerseyBarrier',
      'trafficCone',
      'streetlamp',
      'powerPole',
      'billboard',
      'wreckedCar',
      'fenceSegment',
      'snowbank',
      'bench',
      'newsBox',
      'hydrant',
      'mailbox',
      'bollard',
      'puddle',
      'checkpointBooth',
      'scannerArch',
      'floodlightTower',
      'scannerTowerBase',
      'scannerTowerHead',
      'barrierArm',
      'boothConsole',
      'millBuilding',
      'tripleDecker',
      'snowPlowedLot',
      'overpass',
      'soundWall',
      'tollBooth',
      'pineTree',
      'pineStand',
      'feedStore',
      'tobaccoBarn',
      'waterTower',
      'palmetto',
      'liveOak',
      'swampWater',
      'stripMall',
      'stiltHouse',
      'kitchenTable',
      'kitchenChairs',
      'stove',
      'kitchenCounter',
      'beaconWindow',
      'floorLamp',
      'tableLamp',
      'feedSacks',
      'feedShelf',
      'officeDesk',
      'foldingTable',
      'foldingChairs',
      'coffeeUrn',
      'piano',
      'framedPhoto',
      'rug',
      'bookshelf',
      'radio',
      'wallClock',
      'container',
      'containerStack',
      'gantryCrane',
      'terminalGate',
      'bollardMooring',
      'gangway',
      'shipDeckRail',
      'solarPanelRow',
      'coopBuilding',
      'shadeTree',
      'lateriteRoad',
      'quayCrane',
    ];
    for (const id of required) expect(PROPS[id], id).toBeDefined();
    for (const id of PROP_IDS) {
      const d = PROPS[id];
      expect(d.variants, id).toBeGreaterThanOrEqual(1);
      expect(d.footprint[0] > 0 && d.footprint[1] > 0 && d.height > 0, id).toBe(true);
    }
  });

  it.each(PROP_IDS)('%s builds every variant within budget, on palette, and by the color rules', (id) => {
    const d = PROPS[id];
    const budget = PROP_BUDGET[propCategory(d)];
    const palette = d.tags.includes('epilogue') ? EPILOGUE : MAIN;
    const reserved = PROP_RESERVED[id] ?? 'none';
    const seen = new Set<string>();
    for (let v = 0; v < d.variants; v++) {
      let k = new Kit();
      expect(() => {
        k = build((kit) => d.build(kit, v));
      }, `${id} variant ${v} builds`).not.toThrow();
      audit(`${id}#${v}`, k, budget, palette, reserved);
      seen.add(signature(k));
    }
    expect(seen.size, `${id} variants are all distinct`).toBe(d.variants);
  });

  it('keeps props standing on their origin (pivot-origin parts excepted)', () => {
    const pivots = new Set<PropId>(['securityCameraHead', 'scannerTowerHead', 'barrierArm']);
    for (const id of PROP_IDS) {
      if (pivots.has(id)) continue;
      const k = build((kit) => PROPS[id].build(kit, 0));
      expect(minY(k), id).toBeGreaterThan(-0.12);
    }
  });

  it('is deterministic and tolerates out-of-range variants', () => {
    for (const id of PROP_IDS) {
      const a = build((k) => PROPS[id].build(k, 3));
      const b = build((k) => PROPS[id].build(k, 3));
      expect(signature(a), id).toBe(signature(b));
      expect(() => build((k) => PROPS[id].build(k, 1000 + PROPS[id].variants))).not.toThrow();
      expect(() => build((k) => PROPS[id].build(k, -2))).not.toThrow();
    }
    expect(vrand(5, 1)).toBe(vrand(5, 1));
    expect(vrand(5, 1)).not.toBe(vrand(6, 1));
    expect(vint(-7, 3)).toBe(1);
  });

  it('routes lamps and screens to the glow sink with lights where the spec asks', () => {
    const lit: PropId[] = [
      'streetlamp',
      'canopy',
      'floodlightTower',
      'tableLamp',
      'floorLamp',
      'vendingMachine',
    ];
    for (const id of lit) {
      const k = build((kit) => PROPS[id].build(kit, 0));
      expect(k.glowSink.triangles, id).toBeGreaterThan(0);
      expect(k.lights.length, id).toBeGreaterThan(0);
    }
    const lamp = build((k) => PROPS.streetlamp.build(k, 0)).lights[0];
    expect(lamp.color).toBe(C.amber2);
    // the Station beacon: amber glow and a light tagged 'beacon'
    const window = build((k) => PROPS.beaconWindow.build(k, 0));
    const beacon = window.lights.find((l) => l.tag === 'beacon');
    expect(beacon?.color).toBe(C.amber1);
    expect(colorsOf(window, 'glow').has(C.amber1)).toBe(true);
    // the security camera's lens is never cyan; signs and lamps never red or cyan
    expect([...colorsOf(build((k) => PROPS.securityCamera.build(k, 0)))].some((c) => CYAN.has(c))).toBe(
      false,
    );
    // traffic cones are amber
    expect(colorsOf(build((k) => PROPS.trafficCone.build(k, 0))).has(C.amber1)).toBe(true);
  });

  it('keeps the billboard face anchor on the billboard', () => {
    const k = build((kit) => PROPS.billboard.build(kit, 0));
    expect(BILLBOARD_FACE.w).toBe(8);
    expect(BILLBOARD_FACE.y + BILLBOARD_FACE.h / 2).toBeLessThan(PROPS.billboard.height);
    expect(k.triangles).toBeGreaterThan(0);
  });
});

describe('vehicles', () => {
  it('builds the party wagon in every configuration', () => {
    const configs = [{}, { doorRust: false }, { hatchOpen: true }, { lights: false }];
    const sigs = new Set<string>();
    for (const opts of configs) {
      const k = build((kit) => stationWagon(kit, opts));
      audit(`stationWagon ${JSON.stringify(opts)}`, k, 600, MAIN, 'none');
      sigs.add(signature(k));
    }
    expect(sigs.size).toBe(configs.length);
    const wagon = build((k) => stationWagon(k, {}));
    const glow = colorsOf(wagon, 'glow');
    expect(glow.has(C.fog2), 'emissive headlights').toBe(true);
    expect(glow.has(C.amber0), 'dim amber taillights').toBe(true);
    expect(colorsOf(wagon, 'solid').has(C.rust1), 'the rusty door').toBe(true);
    expect(wagon.lights.some((l) => l.tag === 'headlight')).toBe(true);
  });

  it('builds the Recycler van, with red only on the light bar while it is on', () => {
    audit('recyclerVan', build(recyclerVan), 600, MAIN, 'none');
    const off = build((k) => vanLightBar(k, false));
    audit('vanLightBar off', off, 150, MAIN, 'none');
    expect(off.glowSink.triangles).toBe(0);
    const on = build((k) => vanLightBar(k, true));
    audit('vanLightBar on', on, 150, MAIN, 'red');
    expect(colorsOf(on, 'glow').has(C.red1)).toBe(true);
    expect(on.lights.some((l) => l.tag === 'alarm' && l.color === C.red1)).toBe(true);
  });

  it('builds distinct parked cars, the yard truck, and the drone', () => {
    const sigs = new Set<string>();
    for (let v = 0; v < PARKED_CAR_VARIANTS; v++) {
      const k = build((kit) => parkedCar(kit, v));
      audit(`parkedCar#${v}`, k, 600, MAIN, 'none');
      expect(k.glowSink.triangles, 'parked cars sit dark').toBe(0);
      sigs.add(signature(k));
    }
    expect(sigs.size).toBe(PARKED_CAR_VARIANTS);
    for (let v = 0; v < 3; v++)
      audit(
        `yardTruck#${v}`,
        build((k) => yardTruck(k, v)),
        600,
        MAIN,
        'none',
      );
    const d = build(drone);
    audit('drone', d, 150, MAIN, 'cyan');
    expect(colorsOf(d, 'glow').has(C.cyan1), 'cyan lens').toBe(true);
  });
});

describe('ship', () => {
  it('builds the Sankofa within budget with warm deck lights', () => {
    const k = build(sankofa);
    audit('sankofa', k, 2500, MAIN, 'none');
    expect(colorsOf(k, 'glow').has(C.amber2)).toBe(true);
    expect(k.lights.length).toBeGreaterThanOrEqual(4);
    // bow east: the hull reaches farther toward +x than the superstructure does
    let maxX = -Infinity;
    let minX = Infinity;
    for (let i = 0; i < k.solid.pos.length; i += 3) {
      maxX = Math.max(maxX, k.solid.pos[i]);
      minX = Math.min(minX, k.solid.pos[i]);
    }
    expect(maxX - minX).toBeCloseTo(SANKOFA_LENGTH, 0);
    expect(maxX).toBeCloseTo(SANKOFA_LENGTH / 2, 0);
  });

  it('exposes a name anchor on the south hull at the stern quarter', () => {
    const a = SANKOFA_NAME_ANCHOR;
    expect(a.x - a.w / 2).toBeGreaterThan(-SANKOFA_LENGTH / 2);
    expect(a.x).toBeLessThan(0);
    expect(a.z).toBeGreaterThan(6);
    expect(a.normal).toEqual([0, 0, 1]);
  });

  it('builds the voyage deck in the epilogue palette', () => {
    const k = build(shipDeck);
    audit('shipDeck', k, 1200, EPILOGUE, 'none');
    expect(k.lights.some((l) => l.tag === 'mast' && l.color === E.sun1)).toBe(true);
  });
});

describe('signs', () => {
  it('returns null canvases in Node', () => {
    expect(signCanvas(['HELLO'], { fg: C.fog2, bg: C.night1 })).toBeNull();
    expect(billboardCanvas(BILLBOARD_LINES[0])).toBeNull();
    expect(shipNameCanvas()).toBeNull();
    expect(menuBoardCanvas()).toBeNull();
  });

  it('rasterizes pixel text with padding, scale, and border', () => {
    const bmp = textBitmap(['AB'], { pad: 2 });
    expect(bmp.width).toBe(5 + 1 + 5 + 4);
    expect(bmp.height).toBe(8 + 4);
    expect(bmp.data.some((v) => v === 1)).toBe(true);
    // 'A' row 0 is '.###.': the top-left text pixel is at (pad + 1, pad)
    expect(bmp.data[2 * bmp.width + 3]).toBe(1);
    expect(bmp.data[2 * bmp.width + 2]).toBe(0);
    const big = textBitmap(['A'], { pad: 0, scale: 2, border: C.slate1, width: 20, height: 20 });
    expect(big.width).toBe(20);
    expect(big.data[0]).toBe(2);
    expect(big.data.filter((v) => v === 1).length).toBe(
      4 * textBitmap(['A'], { pad: 0 }).data.filter((v) => v === 1).length,
    );
  });

  it('fits every billboard line on the billboard canvas', () => {
    for (const text of BILLBOARD_LINES) {
      const { lines, scale } = billboardLayout(text);
      expect(lines.join(' ').replace(/\s+/g, ' ')).toBe(text);
      const bmp = textBitmap(lines, {
        scale,
        width: BILLBOARD_CANVAS.width,
        height: BILLBOARD_CANVAS.height,
      });
      expect(bmp.width).toBe(192);
      // every text pixel stays inside the padded area
      for (let y = 0; y < bmp.height; y++) {
        for (let x = 0; x < bmp.width; x++) {
          if (bmp.data[y * bmp.width + x] !== 1) continue;
          expect(x >= 1 && x < bmp.width - 1 && y >= 1 && y < bmp.height - 1).toBe(true);
        }
      }
    }
  });
});
