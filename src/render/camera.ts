/**
 * Pixel-stable orthographic camera (spec §4.2, §4.3).
 *
 * Yaw 0 (north is up the screen), pitch ~55° down. Each frame the camera position is expressed along its own
 * right and up axes and snapped to whole texels; the leftover sub-texel amount is handed to the final pass,
 * which offsets the upscaled image by whole screen pixels. Shake moves the image in whole texels only.
 *
 * World axes: x east, z south (grid rows), y up. A sim point (x, y) maps to world (x, 0, y).
 */
import * as THREE from 'three';
import { TUNING } from '../content/tuning';
import { DEG, springStep } from '../core/math';
import { FOG } from './materials';

export class CameraRig {
  readonly camera: THREE.OrthographicCamera;
  readonly W = TUNING.render.width;
  readonly H = TUNING.render.height;
  readonly M = TUNING.render.margin;
  pitch = TUNING.render.pitchDeg * DEG;
  /** Pixel snapping (F7 toggles). */
  snap = true;
  /** Current smoothed focus on the ground plane. */
  readonly focus = { x: 0, z: 0 };
  zoom = 1;
  /** Shake amplitude in texels (decays); set by `kick`. */
  shakeEnabled = true;
  private shakeAmp = 0;
  private shakeT = 0;
  private shakeOffset = { x: 0, y: 0 };
  /** Leftover sub-texel amounts for the final pass. */
  readonly subTexel = { x: 0, y: 0 };
  readonly texelOrigin = { x: 0, y: 0 };
  private vx = { v: 0 };
  private vz = { v: 0 };
  private vzoom = { v: 0 };
  private look = { x: 0, z: 0 };
  /** Unsnapped camera position (for UI projection). */
  private trueCam = new THREE.Vector3();
  private readonly right = new THREE.Vector3(1, 0, 0);
  private readonly up = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly distance = 40;
  /** The camera slides along its view axis in coarse steps only (orthographic: depth never changes the image). */
  private readonly depthStep = 8;
  /** Which depth step the camera is on (a change re-rounds depth math; QA ignores those frames). */
  depthIndex = 0;

  constructor() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -60, 160);
    this.updateBasis();
    this.apply();
  }

  /** World units per texel at the current zoom. */
  get texel(): number {
    return TUNING.render.worldPerTexel * this.zoom;
  }

  private updateBasis(): void {
    const p = this.pitch;
    this.up.set(0, Math.cos(p), -Math.sin(p));
    this.fwd.set(0, -Math.sin(p), -Math.cos(p));
  }

  /** Jump straight to a focus point (scene start). */
  teleport(x: number, z: number, zoom = this.zoom): void {
    this.focus.x = x;
    this.focus.z = z;
    this.zoom = zoom;
    this.vx.v = this.vz.v = this.vzoom.v = 0;
    this.look.x = this.look.z = 0;
    this.apply();
  }

  /**
   * Critically damped follow toward a focus point, with a small look-ahead in the movement direction.
   * `moveX/moveZ` is the normalized movement direction of the followed player(s) (0 when still or in combat).
   */
  follow(x: number, z: number, dt: number, targetZoom = 1, moveX = 0, moveZ = 0): void {
    const la = TUNING.render.lookAhead;
    this.look.x += (moveX * la - this.look.x) * Math.min(1, dt * 2.5);
    this.look.z += (moveZ * la - this.look.z) * Math.min(1, dt * 2.5);
    const omega = TUNING.render.followOmega;
    this.focus.x = springStep(this.focus.x, x + this.look.x, this.vx, omega, dt);
    this.focus.z = springStep(this.focus.z, z + this.look.z, this.vz, omega, dt);
    this.zoom = springStep(this.zoom, targetZoom, this.vzoom, 3, dt);
    this.updateShake(dt);
    this.apply();
  }

  /** Screen shake in whole texels. */
  kick(amount: number): void {
    if (!this.shakeEnabled) return;
    this.shakeAmp = Math.max(this.shakeAmp, amount);
  }

  private updateShake(dt: number): void {
    if (this.shakeAmp <= 0.05) {
      this.shakeAmp = 0;
      this.shakeOffset.x = this.shakeOffset.y = 0;
      return;
    }
    this.shakeT += dt;
    this.shakeAmp *= Math.pow(0.0008, dt);
    const a = this.shakeAmp;
    // Deterministic jitter (rendering only).
    this.shakeOffset.x = Math.round(Math.sin(this.shakeT * 71.3) * a);
    this.shakeOffset.y = Math.round(Math.cos(this.shakeT * 53.7) * a);
  }

  /** Recompute the snapped camera transform and frustum from focus and zoom. */
  apply(): void {
    this.updateBasis();
    const t = this.texel;
    const cam = this.camera;
    cam.left = -(this.W / 2 + this.M) * t;
    cam.right = (this.W / 2 + this.M) * t;
    cam.top = (this.H / 2 + this.M) * t;
    cam.bottom = -(this.H / 2 + this.M) * t;
    cam.updateProjectionMatrix();

    // True position: back off from the focus along the view direction.
    const c = this.trueCam.set(this.focus.x, 0, this.focus.z).addScaledVector(this.fwd, -this.distance);
    const cR = c.dot(this.right);
    const cU = c.dot(this.up);
    const cF = c.dot(this.fwd);
    this.depthIndex = Math.round(cF / this.depthStep);
    let sR = cR;
    let sU = cU;
    let sF = cF;
    if (this.snap) {
      sR = Math.round(cR / t) * t;
      sU = Math.round(cU / t) * t;
      sF = this.depthIndex * this.depthStep;
    }
    this.subTexel.x = this.snap ? (cR - sR) / t : 0;
    this.subTexel.y = this.snap ? (cU - sU) / t : 0;
    this.texelOrigin.x = Math.round(sR / t);
    this.texelOrigin.y = Math.round(sU / t);
    // Rebuild the position purely from the snapped components, so every frame inside one texel cell gets a
    // bit-identical camera (no float noise from the continuous position).
    const kx = sR + this.shakeOffset.x * t;
    const ku = sU + this.shakeOffset.y * t;
    const pos = cam.position.set(0, 0, 0);
    pos.addScaledVector(this.right, kx).addScaledVector(this.up, ku).addScaledVector(this.fwd, sF);
    cam.up.copy(this.up);
    cam.lookAt(pos.x + this.fwd.x, pos.y + this.fwd.y, pos.z + this.fwd.z);
    cam.updateMatrixWorld(true);
    // Fog is measured from the snapped focus (it moves in whole texels with the image, never within a cell):
    // radially on the ground, and in depth past the plane through that point. Both derive from (sR, sU, sF).
    const sinP = Math.sin(this.pitch);
    const cosP = Math.cos(this.pitch);
    FOG.uFogFocus.value.set(sR, -sU / sinP);
    FOG.uFogPlane.value = (cosP * sU - sinP * sF) / sinP;
  }

  /** Project a world point to low-res screen coordinates (top-left origin), using the true camera. */
  worldToLow(x: number, y: number, z: number, out: { x: number; y: number }): { x: number; y: number } {
    const t = this.texel;
    const dx = x - this.trueCam.x;
    const dy = y - this.trueCam.y;
    const dz = z - this.trueCam.z;
    const sx = dx * this.right.x + dy * this.right.y + dz * this.right.z;
    const sy = dx * this.up.x + dy * this.up.y + dz * this.up.z;
    out.x = this.W / 2 + sx / t;
    out.y = this.H / 2 - sy / t;
    return out;
  }

  /** Unproject a low-res screen point onto the ground plane (y = 0). */
  lowToGround(lx: number, ly: number, out: { x: number; z: number }): { x: number; z: number } {
    const t = this.texel;
    const sx = (lx - this.W / 2) * t;
    const sy = (this.H / 2 - ly) * t;
    const qx = this.trueCam.x + this.right.x * sx + this.up.x * sy;
    const qy = this.trueCam.y + this.right.y * sx + this.up.y * sy;
    const qz = this.trueCam.z + this.right.z * sx + this.up.z * sy;
    const s = qy / -this.fwd.y;
    out.x = qx + this.fwd.x * s;
    out.z = qz + this.fwd.z * s;
    return out;
  }

  /** Visible ground extent at a zoom (meters), for framing and the sim leash. */
  static viewExtent(zoom: number): { width: number; depth: number } {
    const t = TUNING.render.worldPerTexel * zoom;
    const p = TUNING.render.pitchDeg * DEG;
    return { width: TUNING.render.width * t, depth: (TUNING.render.height * t) / Math.sin(p) };
  }
}
