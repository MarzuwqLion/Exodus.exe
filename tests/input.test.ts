import { describe, expect, it } from 'vitest';
import { FixedLoop } from '../src/core/loop';
import { SceneManager, TRANSITION_FRAMES, type SceneLike } from '../src/core/scenes';
import { detectStyle } from '../src/input/gamepad';
import { glyphLabel } from '../src/input/glyphs';
import { MenuNav, emptyIntent } from '../src/input/intents';
import { InputManager } from '../src/input/manager';

describe('InputManager (keyboard)', () => {
  it('maps WASD to a natural walking pace and Shift to full tilt', () => {
    const im = new InputManager();
    im.join('kb1');
    im.kb.simulate('KeyW', true);
    im.poll(1 / 60);
    let it = im.consume(0);
    expect(it.move.y).toBeCloseTo(-0.72);
    expect(it.sprint).toBe(false);
    im.kb.simulate('ShiftLeft', true);
    im.poll(1 / 60);
    it = im.consume(0);
    expect(it.move.y).toBeCloseTo(-1);
    expect(it.sprint).toBe(true);
  });

  it('hands a press to exactly one tick', () => {
    const im = new InputManager();
    im.join('kb1');
    im.kb.simulate('KeyE', true);
    im.poll(1 / 60);
    // A frame with no tick in between: the edge must survive.
    im.poll(1 / 60);
    expect(im.consume(0).interact).toBe(true);
    expect(im.consume(0).interact).toBe(false);
    expect(im.consume(0).interactHeld).toBe(true);
  });

  it('distinguishes a blend tap from a hold', () => {
    const im = new InputManager();
    im.join('kb1');
    im.kb.simulate('KeyQ', true);
    im.poll(1 / 60);
    im.kb.simulate('KeyQ', false);
    im.poll(1 / 60);
    const tap = im.consume(0);
    expect(tap.blendTap).toBe(true);
    expect(tap.blendHeld).toBe(false);

    im.kb.simulate('KeyQ', true);
    for (let i = 0; i < 30; i++) im.poll(1 / 60);
    const hold = im.consume(0);
    expect(hold.blendHeld).toBe(true);
    expect(hold.blendTap).toBe(false);
    im.kb.simulate('KeyQ', false);
    im.poll(1 / 60);
    const release = im.consume(0);
    expect(release.blendHeld).toBe(false);
    expect(release.blendTap).toBe(false);
  });

  it('lets player 2 join on the arrow-key layout with Backspace and keeps the layouts apart', () => {
    const im = new InputManager();
    im.join('kb1');
    im.kb.simulate('Backspace', true);
    im.poll(1 / 60);
    const dev = im.takeJoinRequest();
    expect(dev).toBe('kb2');
    expect(im.join(dev!)).toBe(1);
    im.kb.simulate('Backspace', false);
    im.kb.simulate('ArrowLeft', true);
    im.kb.simulate('KeyD', true);
    im.poll(1 / 60);
    expect(im.consume(0).move.x).toBeGreaterThan(0);
    expect(im.consume(1).move.x).toBeLessThan(0);
  });

  it('drops a player after holding Back for two seconds, and promotes player 2', () => {
    const im = new InputManager();
    im.join('kb1');
    im.join('kb2');
    im.kb.simulate('Tab', true);
    for (let i = 0; i < 130; i++) im.poll(1 / 60);
    expect(im.takeDropRequest()).toBe(0);
    im.drop(0);
    expect(im.device[0]).toBe('kb2');
    expect(im.device[1]).toBeNull();
  });

  it('uses injected intents for bots', () => {
    const im = new InputManager();
    im.join('kb1');
    const bot = emptyIntent();
    bot.move.x = 0.5;
    bot.interact = true;
    im.setOverride(0, bot);
    const a = im.consume(0);
    expect(a.move.x).toBe(0.5);
    expect(a.interact).toBe(true);
    expect(im.consume(0).interact).toBe(false);
  });
});

describe('glyphs and menus', () => {
  it('detects PlayStation pads', () => {
    expect(detectStyle('054c-0ce6-DualSense Wireless Controller')).toBe('playstation');
    expect(detectStyle('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('xbox');
    expect(glyphLabel('A', 'playstation')).toBe('CROSS');
    expect(glyphLabel('A', 'kb1')).toBe('E');
  });

  it('menu nav steps once, then repeats while held', () => {
    const nav = new MenuNav();
    const it = emptyIntent();
    it.move.y = 1;
    expect(nav.step(it, 1 / 60).dy).toBe(1);
    let steps = 0;
    for (let i = 0; i < 60; i++) steps += nav.step(it, 1 / 60).dy;
    expect(steps).toBeGreaterThanOrEqual(3);
    it.move.y = 0;
    expect(nav.step(it, 1 / 60).dy).toBe(0);
  });
});

describe('FixedLoop and SceneManager', () => {
  it('ticks at a fixed rate regardless of frame rate', () => {
    let ticks = 0;
    const loop = new FixedLoop({ tick: () => ticks++, frame: () => undefined });
    let t = 0;
    for (let i = 0; i < 144; i++) {
      loop.advance(t);
      t += 1000 / 144;
    }
    expect(ticks).toBeGreaterThanOrEqual(58);
    expect(ticks).toBeLessThanOrEqual(61);
  });

  it('dissolves out, swaps, and dissolves in', () => {
    const log: string[] = [];
    const mk = (name: string): SceneLike => ({
      enter: () => log.push('enter ' + name),
      exit: () => log.push('exit ' + name),
      tick: () => undefined,
      frame: () => undefined,
    });
    const sm = new SceneManager<SceneLike>();
    sm.go(() => mk('a'));
    expect(log).toEqual(['enter a']);
    sm.go(() => mk('b'));
    for (let i = 0; i < TRANSITION_FRAMES - 1; i++) sm.tick(1 / 60);
    expect(sm.coverage).toBeGreaterThan(0.8);
    expect(log).toEqual(['enter a']);
    sm.tick(1 / 60);
    expect(log).toEqual(['enter a', 'exit a', 'enter b']);
    expect(sm.coverage).toBe(1);
    for (let i = 0; i < TRANSITION_FRAMES; i++) sm.tick(1 / 60);
    expect(sm.coverage).toBe(0);
    expect(sm.transitioning).toBe(false);
  });
});
