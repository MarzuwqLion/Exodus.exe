/**
 * Input manager: turns keyboard, mouse, and gamepads into one PlayerIntent per slot (spec §3.2, §7).
 *
 * - Edges (presses) accumulate between simulation ticks and are handed to exactly one tick.
 * - Solo: player 1 reads every device not owned by player 2 ("merged"); their primary device is the last
 *   one they used (for glyphs and rumble). When player 2 joins, player 1 is pinned to their primary device.
 * - Bots and tests can inject intents per slot with `setOverride`.
 */
import { TUNING } from '../content/tuning';
import { radialDeadZone } from '../core/math';
import type { PlayerIntent, Slot } from '../core/types';
import { BTN, GamepadManager, type RumbleKind } from './gamepad';
import { resolveGlyphDevice, type GlyphDevice } from './glyphs';
import { clearEdges, copyIntent, emptyIntent } from './intents';
import { KeyboardMouse } from './keyboard';
import type { GlyphStyle } from '../core/types';

export type DeviceId = 'kb1' | 'kb2' | `pad${number}`;

const BLEND_HOLD = 0.25;

interface DeviceBlend {
  down: boolean;
  time: number;
}

/** Key bindings for the two keyboard layouts (spec §7.3). */
const KB1 = {
  up: ['KeyW'],
  down: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  interact: ['KeyE'],
  blend: ['KeyQ'],
  ability: ['KeyF'],
  sprint: ['ShiftLeft'],
  dash: ['Space'],
  ping: ['KeyR'],
  pause: ['Escape'],
  overlay: ['Tab'],
  dleft: ['KeyZ'],
  dright: ['KeyC'],
  confirm: ['KeyE', 'Space'],
  cancel: ['Escape'],
};

const KB2 = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  interact: ['Enter', 'NumpadEnter'],
  blend: ['Slash'],
  ability: ['Period'],
  sprint: ['ShiftRight'],
  dash: ['ControlRight'],
  attack: ['Comma'],
  ping: ['Semicolon'],
  pause: ['Backspace'],
  overlay: ['Quote'],
  dleft: ['BracketLeft'],
  dright: ['BracketRight'],
  confirm: ['Enter', 'NumpadEnter'],
  cancel: ['Backspace'],
};

export class InputManager {
  readonly kb = new KeyboardMouse();
  readonly pads = new GamepadManager();
  /** Device owned by each slot; slot 0 in solo is the primary device of a merged set. */
  readonly device: Record<Slot, DeviceId | null> = { 0: null, 1: null };
  /** True when a slot's controller disconnected (the game pauses). */
  readonly disconnected: Record<Slot, boolean> = { 0: false, 1: false };
  /** Resolves a mouse position (canvas CSS px) into an aim vector for a slot; set by gameplay scenes. */
  aimResolver: ((slot: Slot, mx: number, my: number) => { x: number; y: number } | null) | null = null;

  private pending: Record<Slot, PlayerIntent> = { 0: emptyIntent(), 1: emptyIntent() };
  private out: PlayerIntent = emptyIntent();
  private overrides: Record<Slot, PlayerIntent | null> = { 0: null, 1: null };
  private blend = new Map<DeviceId, DeviceBlend>();
  private overlayHold: Record<Slot, number> = { 0: 0, 1: 0 };
  private dropQueue: Slot[] = [];
  private joinQueue: DeviceId[] = [];
  private anyPress: DeviceId | null = null;
  private stickTmp = { x: 0, y: 0 };

  attach(target: Window, canvas: HTMLCanvasElement): void {
    this.kb.attach(target, canvas);
    this.pads.attach(target);
  }

  get playerCount(): number {
    return (this.device[0] ? 1 : 0) + (this.device[1] ? 1 : 0);
  }

  isJoined(slot: Slot): boolean {
    return this.device[slot] !== null;
  }

  /** Assign a device to the first free slot. Returns the slot, or null if both are taken. */
  join(device: DeviceId): Slot | null {
    if (this.device[0] === null) {
      this.device[0] = device;
      return 0;
    }
    if (this.device[1] === null && this.device[0] !== device) {
      this.device[1] = device;
      return 1;
    }
    return null;
  }

  /** Drop a slot. If player 1 drops while player 2 is in, player 2 becomes player 1. */
  drop(slot: Slot): void {
    if (slot === 0) {
      this.device[0] = this.device[1];
      this.device[1] = null;
      this.disconnected[0] = this.disconnected[1];
      this.disconnected[1] = false;
    } else {
      this.device[1] = null;
      this.disconnected[1] = false;
    }
    this.pending[0] = emptyIntent();
    this.pending[1] = emptyIntent();
  }

  setOverride(slot: Slot, intent: PlayerIntent | null): void {
    this.overrides[slot] = intent;
  }

  hasOverride(slot: Slot): boolean {
    return this.overrides[slot] !== null;
  }

  /** Poll devices once per rendered frame and fold edges into the pending intents. */
  poll(frameDt: number): void {
    this.pads.poll(frameDt);
    for (const idx of this.pads.takeDisconnects()) {
      const id: DeviceId = `pad${idx}`;
      for (const s of [0, 1] as Slot[]) if (this.device[s] === id) this.disconnected[s] = true;
    }
    // Reconnect: a pad with the same index came back.
    for (const s of [0, 1] as Slot[]) {
      const d = this.device[s];
      if (this.disconnected[s] && d && d.startsWith('pad')) {
        const st = this.pads.pads.get(Number(d.slice(3)));
        if (st?.connected) this.disconnected[s] = false;
      }
    }

    const p2 = this.device[1];
    const solo = p2 === null;

    // Detect joins (a Start-like press on a device player 1 isn't using as primary) and any-press.
    const kbPress = this.kb.takeAnyPress();
    if (kbPress) {
      const dev: DeviceId = KB2.pause.includes(kbPress) || isKb2Key(kbPress) ? 'kb2' : 'kb1';
      this.anyPress = dev;
    }
    const padPress = this.pads.anyPressed();
    if (padPress) this.anyPress = `pad${padPress.index}`;
    if (solo && this.device[0]) {
      // Player 2 joins with Start on a pad player 1 isn't using, or Backspace for the arrow-key layout.
      const p1 = this.device[0];
      const queue = (id: DeviceId): void => {
        if (!this.joinQueue.includes(id)) this.joinQueue.push(id);
      };
      if (this.kb.wasPressed('Backspace') && p1 !== 'kb2') queue('kb2');
      for (const st of this.pads.pads.values()) {
        const id: DeviceId = `pad${st.index}`;
        if (st.connected && st.pressed[BTN.Start] && p1 !== id) queue(id);
      }
    }

    for (const slot of [0, 1] as Slot[]) {
      const dev = this.device[slot];
      if (!dev) continue;
      const cur = this.out;
      clearIntent(cur);
      if (slot === 0 && solo) {
        // Merged: read every device; the most recently active one becomes primary.
        const devices: DeviceId[] = ['kb1', 'kb2'];
        for (const st of this.pads.pads.values()) if (st.connected) devices.push(`pad${st.index}`);
        let primaryActive: DeviceId | null = null;
        for (const d of devices) {
          if (this.joinQueue.includes(d)) continue;
          const active = this.readDevice(d, cur, slot, frameDt);
          if (active) primaryActive = d;
        }
        if (primaryActive && primaryActive !== this.device[0]) this.device[0] = primaryActive;
      } else {
        this.readDevice(dev, cur, slot, frameDt);
      }
      this.fold(slot, cur);

      // Hold Back (overlay) for 2 s to drop out, unless you're the only player.
      if (cur.overlayHeld && this.playerCount > 1) {
        this.overlayHold[slot] += frameDt;
        if (this.overlayHold[slot] >= TUNING.input.dropHoldSeconds) {
          this.overlayHold[slot] = -999;
          this.dropQueue.push(slot);
        }
      } else if (!cur.overlayHeld) {
        this.overlayHold[slot] = 0;
      }
    }

    this.kb.consumeEdges();
    this.pads.consumeEdges();
  }

  /** Hand the accumulated intent for a slot to one simulation tick, then clear its edges. */
  consume(slot: Slot, out: PlayerIntent = emptyIntent()): PlayerIntent {
    const o = this.overrides[slot];
    if (o) {
      copyIntent(o, out);
      clearEdges(o);
      return out;
    }
    copyIntent(this.pending[slot], out);
    clearEdges(this.pending[slot]);
    return out;
  }

  /** Peek without consuming (UI hints). */
  peek(slot: Slot): PlayerIntent {
    return this.overrides[slot] ?? this.pending[slot];
  }

  takeJoinRequest(): DeviceId | null {
    return this.joinQueue.shift() ?? null;
  }

  takeDropRequest(): Slot | null {
    return this.dropQueue.shift() ?? null;
  }

  /** The device that pressed anything since the last call (title screen "press any button"). */
  takeAnyPress(): DeviceId | null {
    const d = this.anyPress;
    this.anyPress = null;
    return d;
  }

  glyphDevice(slot: Slot, setting: GlyphStyle): GlyphDevice {
    const d = this.device[slot];
    if (!d) return setting === 'playstation' ? 'playstation' : 'xbox';
    if (d === 'kb1' || d === 'kb2') return resolveGlyphDevice(d, 'xbox', setting);
    const st = this.pads.pads.get(Number(d.slice(3)));
    return resolveGlyphDevice('pad', st?.style ?? 'xbox', setting);
  }

  rumble(slot: Slot, kind: RumbleKind): void {
    const d = this.device[slot];
    if (d && d.startsWith('pad')) this.pads.rumble(Number(d.slice(3)), kind);
  }

  /** Reads one device into `cur` (OR-ing buttons, summing movement). Returns true if it had any activity. */
  private readDevice(dev: DeviceId, cur: PlayerIntent, slot: Slot, frameDt: number): boolean {
    if (dev === 'kb1' || dev === 'kb2') return this.readKeyboard(dev, cur, slot, frameDt);
    const st = this.pads.pads.get(Number(dev.slice(3)));
    if (!st || !st.connected) return false;
    const stick = radialDeadZone(st.axes[0], st.axes[1], TUNING.input.deadZone, this.stickTmp);
    let active = stick.x !== 0 || stick.y !== 0;
    if (Math.abs(stick.x) > Math.abs(cur.move.x)) cur.move.x = stick.x;
    if (Math.abs(stick.y) > Math.abs(cur.move.y)) cur.move.y = stick.y;
    const aim = radialDeadZone(st.axes[2], st.axes[3], TUNING.input.deadZone, { x: 0, y: 0 });
    if (aim.x !== 0 || aim.y !== 0) {
      cur.aim = aim;
      active = true;
    }
    const d = st.down;
    const p = st.pressed;
    cur.sprint ||= d[BTN.LB];
    cur.dash ||= p[BTN.B];
    cur.interact ||= p[BTN.A];
    cur.interactHeld ||= d[BTN.A];
    cur.ability ||= p[BTN.Y];
    cur.attack ||= p[BTN.RT];
    cur.attackHeld ||= d[BTN.RT];
    cur.ping ||= p[BTN.RB];
    cur.pause ||= p[BTN.Start];
    cur.overlayHeld ||= d[BTN.Back];
    cur.dpad.up ||= p[BTN.Up];
    cur.dpad.down ||= p[BTN.Down];
    cur.dpad.left ||= p[BTN.Left];
    cur.dpad.right ||= p[BTN.Right];
    cur.confirm ||= p[BTN.A];
    cur.cancel ||= p[BTN.B];
    this.readBlend(dev, d[BTN.X], cur, frameDt);
    for (let b = 0; b < 16; b++) if (d[b]) active = true;
    void slot;
    return active;
  }

  private readKeyboard(dev: 'kb1' | 'kb2', cur: PlayerIntent, slot: Slot, frameDt: number): boolean {
    const kb = this.kb;
    const map = dev === 'kb1' ? KB1 : KB2;
    const down = (codes: readonly string[]): boolean => codes.some((c) => kb.isDown(c));
    const pressed = (codes: readonly string[]): boolean => codes.some((c) => kb.wasPressed(c));
    let mx = (down(map.right) ? 1 : 0) - (down(map.left) ? 1 : 0);
    let my = (down(map.down) ? 1 : 0) - (down(map.up) ? 1 : 0);
    const sprint = down(map.sprint);
    if (mx !== 0 || my !== 0) {
      const len = Math.sqrt(mx * mx + my * my);
      const mag = sprint ? 1 : TUNING.input.keyboardWalk;
      mx = (mx / len) * mag;
      my = (my / len) * mag;
      if (Math.abs(mx) > Math.abs(cur.move.x)) cur.move.x = mx;
      if (Math.abs(my) > Math.abs(cur.move.y)) cur.move.y = my;
    }
    cur.sprint ||= sprint;
    cur.dash ||= pressed(map.dash);
    cur.interact ||= pressed(map.interact);
    cur.interactHeld ||= down(map.interact);
    cur.ability ||= pressed(map.ability);
    cur.ping ||= pressed(map.ping);
    cur.pause ||= pressed(map.pause);
    cur.overlayHeld ||= down(map.overlay);
    cur.dpad.up ||= pressed(map.up);
    cur.dpad.down ||= pressed(map.down);
    cur.dpad.left ||= pressed(map.dleft);
    cur.dpad.right ||= pressed(map.dright);
    cur.confirm ||= pressed(map.confirm);
    cur.cancel ||= pressed(map.cancel);
    if (dev === 'kb1') {
      cur.attack ||= kb.mousePressedEdge;
      cur.attackHeld ||= kb.mouseDown;
      if (this.aimResolver && kb.mouse.inside && performance.now() - kb.lastMouseMove < 4000) {
        const aim = this.aimResolver(slot, kb.mouse.x, kb.mouse.y);
        if (aim) cur.aim = aim;
      }
    } else {
      cur.attack ||= pressed(KB2.attack);
      cur.attackHeld ||= down(KB2.attack);
    }
    this.readBlend(dev, down(map.blend), cur, frameDt);
    const all = [
      ...map.up,
      ...map.down,
      ...map.left,
      ...map.right,
      ...map.interact,
      ...map.blend,
      ...map.ability,
      ...map.dash,
      ...map.pause,
    ];
    return down(all) || (dev === 'kb1' && kb.mouseDown);
  }

  private readBlend(dev: DeviceId, isDown: boolean, cur: PlayerIntent, frameDt: number): void {
    let b = this.blend.get(dev);
    if (!b) {
      b = { down: false, time: 0 };
      this.blend.set(dev, b);
    }
    if (isDown) {
      b.time = b.down ? b.time + frameDt : 0;
      b.down = true;
      if (b.time >= BLEND_HOLD) cur.blendHeld = true;
    } else {
      if (b.down && b.time < BLEND_HOLD) cur.blendTap = true;
      b.down = false;
      b.time = 0;
    }
  }

  /** OR the frame's edges into the pending intent; copy held state. */
  private fold(slot: Slot, cur: PlayerIntent): void {
    const p = this.pending[slot];
    p.move.x = cur.move.x;
    p.move.y = cur.move.y;
    p.aim = cur.aim ? { x: cur.aim.x, y: cur.aim.y } : null;
    p.sprint = cur.sprint;
    p.interactHeld = cur.interactHeld;
    p.blendHeld = cur.blendHeld;
    p.attackHeld = cur.attackHeld;
    p.overlayHeld = cur.overlayHeld;
    p.dash ||= cur.dash;
    p.interact ||= cur.interact;
    p.blendTap ||= cur.blendTap;
    p.ability ||= cur.ability;
    p.attack ||= cur.attack;
    p.ping ||= cur.ping;
    p.pause ||= cur.pause;
    p.dpad.up ||= cur.dpad.up;
    p.dpad.down ||= cur.dpad.down;
    p.dpad.left ||= cur.dpad.left;
    p.dpad.right ||= cur.dpad.right;
    p.confirm ||= cur.confirm;
    p.cancel ||= cur.cancel;
  }
}

function clearIntent(it: PlayerIntent): void {
  clearEdges(it);
  it.move.x = 0;
  it.move.y = 0;
  it.aim = null;
  it.sprint = false;
  it.interactHeld = false;
  it.blendHeld = false;
  it.attackHeld = false;
  it.overlayHeld = false;
}

function isKb2Key(code: string): boolean {
  return Object.values(KB2).some((codes) => codes.includes(code));
}
