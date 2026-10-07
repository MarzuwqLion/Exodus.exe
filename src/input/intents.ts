/** PlayerIntent helpers (spec §3.4). */
import type { PlayerIntent } from '../core/types';

export function emptyIntent(): PlayerIntent {
  return {
    move: { x: 0, y: 0 },
    aim: null,
    sprint: false,
    dash: false,
    interact: false,
    interactHeld: false,
    blendTap: false,
    blendHeld: false,
    ability: false,
    attack: false,
    attackHeld: false,
    ping: false,
    pause: false,
    overlayHeld: false,
    dpad: { up: false, down: false, left: false, right: false },
    confirm: false,
    cancel: false,
  };
}

export function copyIntent(src: PlayerIntent, out: PlayerIntent = emptyIntent()): PlayerIntent {
  out.move.x = src.move.x;
  out.move.y = src.move.y;
  out.aim = src.aim ? { x: src.aim.x, y: src.aim.y } : null;
  out.sprint = src.sprint;
  out.dash = src.dash;
  out.interact = src.interact;
  out.interactHeld = src.interactHeld;
  out.blendTap = src.blendTap;
  out.blendHeld = src.blendHeld;
  out.ability = src.ability;
  out.attack = src.attack;
  out.attackHeld = src.attackHeld;
  out.ping = src.ping;
  out.pause = src.pause;
  out.overlayHeld = src.overlayHeld;
  out.dpad.up = src.dpad.up;
  out.dpad.down = src.dpad.down;
  out.dpad.left = src.dpad.left;
  out.dpad.right = src.dpad.right;
  out.confirm = src.confirm;
  out.cancel = src.cancel;
  return out;
}

/** Clears the one-shot (edge) fields, keeping held state. */
export function clearEdges(it: PlayerIntent): void {
  it.dash = false;
  it.interact = false;
  it.blendTap = false;
  it.ability = false;
  it.attack = false;
  it.ping = false;
  it.pause = false;
  it.dpad.up = false;
  it.dpad.down = false;
  it.dpad.left = false;
  it.dpad.right = false;
  it.confirm = false;
  it.cancel = false;
}

/** True if any button-like field is set (used for "press any button"). */
export function anyPressed(it: PlayerIntent): boolean {
  return (
    it.dash ||
    it.interact ||
    it.blendTap ||
    it.ability ||
    it.attack ||
    it.ping ||
    it.pause ||
    it.confirm ||
    it.cancel ||
    it.dpad.up ||
    it.dpad.down ||
    it.dpad.left ||
    it.dpad.right
  );
}

/**
 * Converts stick movement into discrete menu steps with key-repeat, so menus work with the stick,
 * the D-pad, WASD, or arrows alike.
 */
export class MenuNav {
  private heldDir = 0;
  private heldTime = 0;

  /** Returns -1/0/1 for vertical and horizontal steps this tick. */
  step(it: PlayerIntent, dt: number): { dx: number; dy: number } {
    let dx = it.dpad.left ? -1 : it.dpad.right ? 1 : 0;
    let dy = it.dpad.up ? -1 : it.dpad.down ? 1 : 0;
    const sx = Math.abs(it.move.x) > 0.55 ? Math.sign(it.move.x) : 0;
    const sy = Math.abs(it.move.y) > 0.55 ? Math.sign(it.move.y) : 0;
    // Encode the stick direction: prefer the dominant axis.
    const dir = Math.abs(it.move.y) >= Math.abs(it.move.x) ? sy * 2 : sx;
    if (dir === 0) {
      this.heldDir = 0;
      this.heldTime = 0;
    } else if (dir !== this.heldDir) {
      this.heldDir = dir;
      this.heldTime = 0;
      if (Math.abs(dir) === 2) dy = dir / 2;
      else dx = dir;
    } else {
      this.heldTime += dt;
      if (this.heldTime > 0.42) {
        this.heldTime -= 0.12;
        if (Math.abs(dir) === 2) dy = dir / 2;
        else dx = dir;
      }
    }
    return { dx, dy };
  }
}
