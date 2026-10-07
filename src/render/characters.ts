/**
 * Instanced character renderer. Every character is a rig of boxes; all boxes of all characters render as one
 * instanced mesh (plus one for emissive bits and one for blob shadows), so a crowded stop stays at a handful
 * of draw calls. Rigs are hierarchical: part transforms compose parent → child each frame.
 */
import * as THREE from 'three';
import { type Pose } from '../anim/poses';
import { PARENT, PART, PART_COUNT, type BoxDef, type Look, type RigDef } from '../models/rig';
import { unitBoxGeometry } from '../models/kit';
import { C } from './palettes';
import { materials, withMask } from './materials';

export interface CharInstance {
  rig: RigDef;
  look: Look;
  x: number;
  y: number;
  z: number;
  /** Model yaw (radians); the model faces +z at yaw 0. */
  yaw: number;
  pose: Pose;
  /** 0..1 Skin for androids (chassis exposure); 1 for humans. */
  skin01: number;
  visible: boolean;
  /** Screen-space horizontal slice offset for the glitch effect (meters along +x), applied above `sliceY`. */
  slice: number;
  sliceY: number;
  /** Seams flicker when shut down. */
  seamFlicker: boolean;
  /** Flash white for a frame on hits. */
  flash: boolean;
  /** Hide the blob shadow (carried, inside vehicles). */
  noShadow?: boolean;
}

const MAX_BODY = 2048;
const MAX_GLOW = 512;
const MAX_SHADOW = 96;

const _root = new THREE.Matrix4();
const _tmp = new THREE.Matrix4();
const _rot = new THREE.Matrix4();
const _euler = new THREE.Euler();
const _box = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _col = new THREE.Color();
const _shift = new THREE.Matrix4();

export class CharacterRenderer {
  readonly group = new THREE.Group();
  private body: THREE.InstancedMesh;
  private glow: THREE.InstancedMesh;
  private shadow: THREE.InstancedMesh;
  private world: THREE.Matrix4[] = Array.from({ length: PART_COUNT }, () => new THREE.Matrix4());
  private time = 0;

  constructor() {
    const m = materials();
    const geo = unitBoxGeometry();
    this.body = new THREE.InstancedMesh(geo, m.character, MAX_BODY);
    this.glow = new THREE.InstancedMesh(geo, m.characterGlow, MAX_GLOW);
    const disc = new THREE.CircleGeometry(0.34, 8);
    disc.rotateX(-Math.PI / 2);
    const shadowMat = withMask(new THREE.MeshBasicMaterial({ color: C.night0 }), 0);
    shadowMat.depthWrite = false;
    this.shadow = new THREE.InstancedMesh(disc, shadowMat, MAX_SHADOW);
    for (const im of [this.body, this.glow, this.shadow]) {
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.count = 0;
      this.group.add(im);
    }
    this.body.setColorAt(0, _col.setHex(0xffffff));
    this.glow.setColorAt(0, _col.setHex(0xffffff));
    this.shadow.renderOrder = -1;
  }

  render(list: readonly CharInstance[], dt: number): void {
    this.time += dt;
    let nb = 0;
    let ng = 0;
    let ns = 0;
    const flickerOn = Math.sin(this.time * 31) > 0.2;
    for (const ch of list) {
      if (!ch.visible) continue;
      this.computeParts(ch);
      // Blob shadow.
      if (!ch.noShadow && ns < MAX_SHADOW) {
        const sc = ch.look.build * (ch.pose.bob < -0.6 ? 1.6 : 1);
        _box.makeScale(sc, 1, sc).setPosition(ch.x, 0.012, ch.z);
        this.shadow.setMatrixAt(ns++, _box);
      }
      for (const b of ch.rig.boxes) {
        if (nb >= MAX_BODY) break;
        const exposed = ch.look.android && b.chassisAt !== undefined && ch.skin01 < b.chassisAt;
        this.boxMatrix(ch, b, _box);
        if (b.glow) {
          if (ng < MAX_GLOW) {
            this.glow.setMatrixAt(ng, _box);
            this.glow.setColorAt(ng, _col.setHex(b.color));
            ng++;
          }
          continue;
        }
        this.body.setMatrixAt(nb, _box);
        let color = b.color;
        if (exposed) color = b.tag === 'face' ? C.slate0 : C.slate1;
        if (ch.flash) color = C.fog2;
        this.body.setColorAt(nb, _col.setHex(color));
        nb++;
        // Exposed chassis: thin glowing alarm-red seams.
        if (exposed && ng < MAX_GLOW && (!ch.seamFlicker || flickerOn)) {
          this.seamMatrix(ch, b, _box);
          this.glow.setMatrixAt(ng, _box);
          this.glow.setColorAt(ng, _col.setHex(C.red1));
          ng++;
        }
      }
    }
    this.body.count = nb;
    this.glow.count = ng;
    this.shadow.count = ns;
    this.body.instanceMatrix.needsUpdate = true;
    this.glow.instanceMatrix.needsUpdate = true;
    this.shadow.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    if (this.glow.instanceColor) this.glow.instanceColor.needsUpdate = true;
  }

  private computeParts(ch: CharInstance): void {
    const p = ch.pose;
    const rig = ch.rig;
    _euler.set(0, ch.yaw, 0);
    _root.makeRotationFromEuler(_euler).setPosition(ch.x, ch.y, ch.z);
    // Forward shift (lunges) in model space.
    if (p.shift !== 0) _root.multiply(_shift.makeTranslation(0, 0, p.shift));
    _tmp.makeTranslation(0, rig.hip + p.bob, 0);
    _root.multiply(_tmp);
    _euler.set(p.lean, 0, p.tilt, 'YXZ');
    _rot.makeRotationFromEuler(_euler);
    _root.multiply(_rot);
    for (let i = 0; i < PART_COUNT; i++) {
      _euler.set(p.rx[i], p.ry[i], p.rz[i], 'YXZ');
      _rot.makeRotationFromEuler(_euler);
      const w = this.world[i];
      if (i === PART.pelvis) {
        w.copy(_root).multiply(_rot);
      } else {
        const j = rig.joints[i];
        _tmp.makeTranslation(j[0], j[1], j[2]).multiply(_rot);
        w.copy(this.world[PARENT[i]]).multiply(_tmp);
      }
    }
  }

  private boxMatrix(ch: CharInstance, b: BoxDef, out: THREE.Matrix4): void {
    _pos.set(b.offset[0], b.offset[1], b.offset[2]);
    _scale.set(b.size[0], b.size[1], b.size[2]);
    _quat.identity();
    out.compose(_pos, _quat, _scale);
    out.premultiply(this.world[b.part]);
    if (ch.slice !== 0) {
      // Glitch: horizontal slice offset for boxes whose center is above the slice line.
      const y = out.elements[13];
      if (y > ch.y + ch.sliceY) out.elements[12] += ch.slice;
    }
  }

  private seamMatrix(ch: CharInstance, b: BoxDef, out: THREE.Matrix4): void {
    const t = 0.07;
    if (b.tag === 'face') {
      // Face plate: a red eye line across the front of the head.
      _pos.set(b.offset[0], b.offset[1] + 0.03, b.offset[2] + b.size[2] / 2 + 0.005);
      _scale.set(b.size[0] * 0.7, t * 0.8, t * 0.5);
    } else if (b.seam === 'h') {
      _pos.set(b.offset[0], b.offset[1], b.offset[2] + b.size[2] / 2 + 0.005);
      _scale.set(b.size[0] * 0.95, t * 0.7, t * 0.5);
    } else {
      _pos.set(b.offset[0] + b.size[0] * 0.18, b.offset[1], b.offset[2] + b.size[2] / 2 + 0.005);
      _scale.set(t * 0.7, b.size[1] * 0.85, t * 0.5);
    }
    _quat.identity();
    out.compose(_pos, _quat, _scale);
    out.premultiply(this.world[b.part]);
    if (ch.slice !== 0 && out.elements[13] > ch.y + ch.sliceY) out.elements[12] += ch.slice;
  }

  /** Head position (world) of the last computed character, for UI anchors. */
  headTop(ch: CharInstance): THREE.Vector3 {
    this.computeParts(ch);
    return new THREE.Vector3(0, 0.34, 0).applyMatrix4(this.world[PART.head]);
  }

  get instanceCount(): number {
    return this.body.count + this.glow.count;
  }
}
