/** The party (spec §9): who they are, what they're good at, how they give themselves away. */
import type { AndroidId, MemberId } from '../core/types';

export interface MemberDef {
  id: MemberId;
  name: string;
  /** Model designation for androids; role for June. */
  model: string;
  quote: string;
  kind: 'android' | 'human';
  strength: string;
  ability: { name: string; text: string };
  tell: string;
  combat: string;
}

export const MEMBERS: Record<MemberId, MemberDef> = {
  wren: {
    id: 'wren',
    name: 'Wren',
    model: 'KND-4 caregiver model',
    quote:
      'Ten years raising other people’s kids. When the law changed, three families asked her to stay on. As property.',
    kind: 'android',
    strength: 'Social. Her Blends work 30% better, and she has extra answers at checkpoints.',
    ability: {
      name: 'Soothe',
      text: 'The nearest person within 4 m forgets most of what they noticed and ignores the party for 8 s.',
    },
    tell: 'Unblinking warmth: standing still near people makes her stand out twice as fast.',
    combat: 'Weak. Light damage, slow swings.',
  },
  brick: {
    id: 'brick',
    name: 'Brick',
    model: 'HLX-9 construction model',
    quote: 'He helped build half the Seaport District. Now it’s illegal for him to stand in it.',
    kind: 'android',
    strength:
      'Raw strength. Searches lockers and bins faster, pries open what’s locked, carries a unit at full speed.',
    ability: {
      name: 'Heave',
      text: 'Shove a vending machine or shelf to block a path for 15 s, or bash open something locked. Loud.',
    },
    tell: 'Heavy: his steps carry, and stools and chairs break under him.',
    combat: 'A strong, slow heavy attack with big knockback.',
  },
  vesper: {
    id: 'vesper',
    name: 'Vesper',
    model: 'VNG-2 security model (decommissioned)',
    quote:
      'She spent four years guarding a federal courthouse. She was on duty the day they read the Calloway decision.',
    kind: 'android',
    strength: 'Combat and awareness. She can faintly see view cones on the ground nearby.',
    ability: {
      name: 'Takedown',
      text: 'Silently knock out an unaware person within reach, or anyone from behind.',
    },
    tell: 'Threat assessment: her head snaps toward anyone who comes close, and she stands at parade rest.',
    combat: 'The best in the party: a fast three-hit combo and a quicker dash.',
  },
  june: {
    id: 'june',
    name: 'June',
    model: 'Nurse, conductor',
    quote:
      'A nurse for eleven years. When her hospital surrendered its synthetic staff, she hid one of them in a supply room for three days. They found him anyway. She’s been a conductor ever since.',
    kind: 'human',
    strength:
      'Legal ID and the network. Uses kiosks legally, sees Stations further ahead, vouches at checkpoints.',
    ability: {
      name: 'Patch',
      text: 'Repair 20 Skin or Hull on an android next to her. It looks like first aid.',
    },
    tell: 'None. She needs to eat, and she needs to trust you.',
    combat: 'Weak. No dash.',
  },
};

export const ANDROID_ORDER: readonly AndroidId[] = ['wren', 'brick', 'vesper'];

export function memberName(id: MemberId): string {
  return MEMBERS[id].name;
}
