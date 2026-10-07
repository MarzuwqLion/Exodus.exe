import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/bus';
import { parseConfig } from '../src/core/config';
import { angleDiff, dir8, radialDeadZone, springStep, wrapAngle } from '../src/core/math';
import { fbm, makeNoise2D } from '../src/core/noise';
import { Rng, hashSeed } from '../src/core/rng';
import { MemoryStore, SAVE_KEY, defaultSave, loadSave, parseSave, writeSave } from '../src/core/save';
import { Easing, Tweens } from '../src/core/tween';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('differs across seeds and stays in [0, 1)', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    let same = 0;
    for (let i = 0; i < 1000; i++) {
      const x = a.next();
      const y = b.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      if (x === y) same++;
    }
    expect(same).toBe(0);
  });

  it('resumes from a saved state', () => {
    const a = new Rng(99);
    a.next();
    a.next();
    const resumed = new Rng(a.state);
    expect(resumed.next()).toBe(a.next());
  });

  it('int() is inclusive and roughly uniform', () => {
    const r = new Rng(7);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 8000; i++) counts[r.int(0, 3)]++;
    for (const c of counts) expect(c).toBeGreaterThan(1700);
  });

  it('weighted() respects weights and skips zero weights', () => {
    const r = new Rng(3);
    const items = [
      { id: 'a', w: 1 },
      { id: 'b', w: 3 },
      { id: 'c', w: 0 },
    ];
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 4000; i++) counts[r.weighted(items, (it) => it.w)!.id]++;
    expect(counts.c).toBe(0);
    expect(counts.b / counts.a).toBeGreaterThan(2.4);
    expect(counts.b / counts.a).toBeLessThan(3.7);
    expect(r.weighted(items, () => 0)).toBeUndefined();
  });

  it('hashSeed is stable and sensitive to every part', () => {
    expect(hashSeed('a', 1)).toBe(hashSeed('a', 1));
    expect(hashSeed('a', 1)).not.toBe(hashSeed('a', 2));
    expect(hashSeed('a', 1)).not.toBe(hashSeed('b', 1));
  });
});

describe('noise', () => {
  it('is deterministic and bounded', () => {
    const n1 = makeNoise2D(5);
    const n2 = makeNoise2D(5);
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37;
      const y = i * 0.11;
      expect(n1(x, y)).toBe(n2(x, y));
      expect(Math.abs(n1(x, y))).toBeLessThanOrEqual(1.5);
      expect(Math.abs(fbm(n1, x, y))).toBeLessThanOrEqual(1.5);
    }
  });
});

describe('math', () => {
  it('wraps and diffs angles', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
  });

  it('snaps to 8 directions', () => {
    expect(dir8(0)).toBe(0);
    expect(dir8(Math.PI / 2)).toBe(2);
    expect(dir8(Math.PI)).toBe(4);
    expect(dir8(-Math.PI / 2)).toBe(6);
    expect(dir8(0.3)).toBe(0);
    expect(dir8(0.5)).toBe(1);
  });

  it('applies a radial dead zone with rescaling', () => {
    const out = { x: 0, y: 0 };
    radialDeadZone(0.15, 0.1, 0.2, out);
    expect(out).toEqual({ x: 0, y: 0 });
    radialDeadZone(1, 0, 0.2, out);
    expect(out.x).toBeCloseTo(1);
    radialDeadZone(0.6, 0, 0.2, out);
    expect(out.x).toBeCloseTo(0.5);
  });

  it('critically damped spring converges without overshoot', () => {
    const vel = { v: 0 };
    let x = 0;
    let max = 0;
    for (let i = 0; i < 600; i++) {
      x = springStep(x, 10, vel, 6, 1 / 60);
      max = Math.max(max, x);
    }
    expect(x).toBeCloseTo(10, 3);
    expect(max).toBeLessThanOrEqual(10.0001);
  });
});

describe('tween and bus', () => {
  it('tweens to completion and fires done once', () => {
    const t = new Tweens();
    let v = -1;
    let done = 0;
    t.add(
      1,
      (x) => (v = x),
      Easing.linear,
      () => done++,
    );
    t.step(0.5);
    expect(v).toBeCloseTo(0.5);
    t.step(0.6);
    t.step(0.6);
    expect(v).toBe(1);
    expect(done).toBe(1);
    expect(t.active).toBe(0);
  });

  it('delivers typed events and unsubscribes', () => {
    const bus = new EventBus<{ ping: number }>();
    const got: number[] = [];
    const off = bus.on('ping', (n) => got.push(n));
    bus.emit('ping', 1);
    off();
    bus.emit('ping', 2);
    expect(got).toEqual([1]);
  });
});

describe('config', () => {
  it('parses URL parameters', () => {
    const c = parseConfig('?debug=1&seed=42&scene=depot&region=corridor&weather=storm&players=2');
    expect(c.debug).toBe(true);
    expect(c.seed).toBe(42);
    expect(c.scene).toBe('depot');
    expect(c.region).toBe('corridor');
    expect(c.weather).toBe('storm');
    expect(c.players).toBe(2);
    expect(c.snap).toBe(true);
  });

  it('ignores invalid values', () => {
    const c = parseConfig('?scene=nowhere&region=mars&seed=abc');
    expect(c.scene).toBeNull();
    expect(c.region).toBeNull();
    expect(c.seed).toBeNull();
    expect(c.debug).toBe(false);
  });
});

describe('save', () => {
  it('round-trips meta and settings', () => {
    const store = new MemoryStore();
    const data = defaultSave();
    data.meta.cores = 7;
    data.meta.unlocked = ['field-kit'];
    data.settings.largeText = true;
    expect(writeSave(store, data)).toBe(true);
    const loaded = loadSave(store);
    expect(loaded.message).toBeNull();
    expect(loaded.data.meta.cores).toBe(7);
    expect(loaded.data.meta.unlocked).toEqual(['field-kit']);
    expect(loaded.data.settings.largeText).toBe(true);
  });

  it('discards a corrupted save with a message instead of crashing', () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, '{not json');
    const loaded = loadSave(store);
    expect(loaded.message).toMatch(/damaged/);
    expect(loaded.data.run).toBeNull();
    // The cleared save was written back.
    expect(parseSave(store.getItem(SAVE_KEY)).message).toBeNull();
  });

  it('migrates a version 0 save', () => {
    const v0 = JSON.stringify({
      cores: 5,
      meta: { unlocked: ['old-route', 'bogus'] },
      settings: { dither: false },
    });
    const loaded = parseSave(v0);
    expect(loaded.data.version).toBe(1);
    expect(loaded.data.meta.cores).toBe(5);
    expect(loaded.data.meta.unlocked).toEqual(['old-route']);
    expect(loaded.data.settings.dither).toBe(false);
  });

  it('drops a damaged run but keeps meta', () => {
    const text = JSON.stringify({
      version: 1,
      run: { version: 1, seed: 'x' },
      meta: { cores: 2 },
      settings: {},
    });
    const loaded = parseSave(text);
    expect(loaded.data.run).toBeNull();
    expect(loaded.data.meta.cores).toBe(2);
    expect(loaded.message).toMatch(/discarded/);
  });

  it('rejects unknown future versions', () => {
    const loaded = parseSave(JSON.stringify({ version: 99, meta: {}, settings: {} }));
    expect(loaded.message).toMatch(/unknown version/);
  });
});
