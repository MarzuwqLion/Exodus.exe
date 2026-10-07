/**
 * Character looks (spec §5.2): the party's silhouettes, and seeded variety for every human NPC (proportions,
 * clothing color blocks, hats and hoods, about 8 hair shapes, and the full range of skin tones, distributed
 * evenly). Recyclers get reflective vests, red-lit batons, and cyan scanner wands.
 */
import { Rng } from '../core/rng';
import type { MemberId } from '../core/types';
import { C, SKIN_TONES } from '../render/palettes';
import type { NpcRole } from '../sim/layout';
import { defaultLook, type HatKind, type Look } from './rig';

export const PARTY_LOOKS: Record<MemberId, Look> = {
  // Wren: a long coat.
  wren: {
    ...defaultLook(),
    height: 0.98,
    shoulders: 0.95,
    build: 0.95,
    skin: C.skin3,
    hair: C.night1,
    hairStyle: 3,
    jacket: C.rust1,
    shirt: C.fog1,
    pants: C.night3,
    shoes: C.night1,
    coat: true,
    android: true,
  },
  // Brick: broad shoulders, a work cap.
  brick: {
    ...defaultLook(),
    height: 1.06,
    shoulders: 1.25,
    build: 1.18,
    skin: C.skin1,
    hair: C.night0,
    hairStyle: 7,
    jacket: C.moss0,
    shirt: C.concrete1,
    pants: C.slate0,
    shoes: C.rust0,
    hat: 'workcap',
    hatColor: C.amber0,
    android: true,
  },
  // Vesper: a hood and a tall collar.
  vesper: {
    ...defaultLook(),
    height: 1.02,
    shoulders: 0.98,
    build: 0.9,
    skin: C.skin4,
    hair: C.rust0,
    hairStyle: 5,
    jacket: C.slate1,
    shirt: C.night3,
    pants: C.night2,
    shoes: C.night0,
    hat: 'hood',
    hatColor: C.slate0,
    collar: true,
    android: true,
  },
  // June: scrubs under a rain jacket, a backpack.
  june: {
    ...defaultLook(),
    height: 0.96,
    shoulders: 0.94,
    build: 1,
    skin: C.skin0,
    hair: C.night0,
    hairStyle: 4,
    jacket: C.slate0,
    shirt: C.moss2,
    pants: C.moss2,
    shoes: C.fog0,
    backpack: true,
    android: false,
  },
};

const CLOTH = [
  C.slate0,
  C.slate1,
  C.night3,
  C.concrete0,
  C.concrete1,
  C.rust0,
  C.rust1,
  C.moss0,
  C.moss1,
  C.amber0,
  C.fog0,
  C.night2,
];
const PANTS = [C.night2, C.night3, C.slate0, C.concrete0, C.moss0, C.rust0];
const HAIR = [C.night0, C.night1, C.rust0, C.rust1, C.amber0, C.concrete2, C.fog1, C.skin1];

function pick<T>(r: Rng, list: readonly T[]): T {
  return list[Math.floor(r.next() * list.length)];
}

/** A seeded human look for an NPC role. */
export function npcLook(role: NpcRole, seed: number): Look {
  const r = new Rng(seed);
  const L: Look = {
    ...defaultLook(),
    height: 0.92 + r.next() * 0.16,
    shoulders: 0.9 + r.next() * 0.25,
    build: 0.88 + r.next() * 0.32,
    skin: pick(r, SKIN_TONES),
    hair: pick(r, HAIR),
    hairStyle: Math.floor(r.next() * 8),
    jacket: pick(r, CLOTH),
    shirt: pick(r, CLOTH),
    pants: pick(r, PANTS),
    shoes: r.chance(0.5) ? C.night1 : C.rust0,
  };
  const hats: HatKind[] = ['none', 'none', 'none', 'cap', 'beanie'];
  L.hat = pick(r, hats);
  L.hatColor = pick(r, CLOTH);
  switch (role) {
    case 'clerk':
      L.jacket = C.slate1;
      L.shirt = C.amber0;
      L.apron = r.chance(0.4);
      break;
    case 'guard':
      L.jacket = C.night3;
      L.shirt = C.slate0;
      L.pants = C.night2;
      L.hat = 'officer';
      L.hatColor = C.night2;
      L.build = Math.max(L.build, 1.05);
      break;
    case 'mechanic':
      L.jacket = C.moss0;
      L.shirt = C.moss0;
      L.pants = C.moss0;
      L.hat = 'cap';
      L.hatColor = C.rust0;
      break;
    case 'waitress':
      L.jacket = C.fog0;
      L.shirt = C.fog1;
      L.apron = true;
      L.hat = 'none';
      break;
    case 'cook':
      L.jacket = C.fog1;
      L.shirt = C.fog1;
      L.apron = true;
      L.hat = 'beanie';
      L.hatColor = C.fog2;
      break;
    case 'dockworker':
      L.jacket = pick(r, [C.amber0, C.moss1, C.slate1]);
      L.hat = 'cap';
      L.hatColor = C.amber1;
      break;
    case 'recycler':
    case 'gunner':
      L.jacket = C.slate0;
      L.shirt = C.slate0;
      L.pants = C.night2;
      L.vest = true;
      L.hat = 'cap';
      L.hatColor = C.night2;
      L.build = Math.max(L.build, 1.1);
      L.shoulders = Math.max(L.shoulders, 1.08);
      L.baton = role === 'recycler';
      L.wand = role === 'recycler';
      L.rifle = role === 'gunner';
      break;
    case 'mensah':
      L.jacket = C.night3;
      L.shirt = C.fog2;
      L.pants = C.night2;
      L.hat = 'officer';
      L.hatColor = C.fog2;
      L.skin = C.skin0;
      L.height = 1.0;
      break;
    case 'crew':
      L.jacket = C.night3;
      L.hat = 'beanie';
      L.hatColor = C.night2;
      break;
    default:
      break;
  }
  return L;
}
