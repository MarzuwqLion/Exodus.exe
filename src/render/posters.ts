/**
 * Wanted posters on the corkboards (spec §10.3, §11.6): at Heat 2 and above, diners and gas stations pin up
 * low-res faces of the androids still with the party. Built per stop from the layout and the party.
 */
import * as THREE from 'three';
import type { MemberState } from '../core/types';
import { PARTY_LOOKS } from '../models/looks';
import { POSTER_H, POSTER_W, wantedPosterCanvas } from '../models/posters';
import type { ParsedLayout } from '../sim/layout';
import { isSouthWall } from './level';
import { MASK, pixelTexture, withMask } from './materials';

/** Poster size on the board in meters (one canvas pixel is about one screen texel). */
const W = 0.3;
const H = (W * POSTER_H) / POSTER_W;

export function buildWantedPosters(L: ParsedLayout, party: readonly MemberState[]): THREE.Group {
  const group = new THREE.Group();
  const wanted = party.filter((m) => m.kind === 'android' && m.status !== 'lost');
  if (wanted.length === 0) return group;
  const geo = new THREE.PlaneGeometry(W, H);
  const mats = wanted.map((m) => {
    const canvas = wantedPosterCanvas(PARTY_LOOKS[m.id]);
    // Paper reads as itself under any light: unlit, but fogged like the room.
    const mat = new THREE.MeshBasicMaterial();
    if (canvas) mat.map = pixelTexture(canvas);
    return withMask(mat, MASK.surface);
  });
  const G = L.grid;
  for (let y = 0; y < G.h; y++) {
    for (let x = 0; x < G.w; x++) {
      if (G.charAt(x, y) !== 'Q' || isSouthWall(L, x, y)) continue;
      mats.forEach((mat, i) => {
        const p = new THREE.Mesh(geo, mat);
        // On the corkboard (level.ts: 1.4–2.2 m up the wall's face).
        p.position.set(x + 0.5 + (i - (mats.length - 1) / 2) * (W + 0.03), 1.8, y + 1.06);
        group.add(p);
      });
    }
  }
  return group;
}
