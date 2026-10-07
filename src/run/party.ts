/** Starting party and resources (spec §9.1), plus small helpers over MemberState. */
import { TUNING } from '../content/tuning';
import type { AndroidId, AndroidState, HumanState, MemberState, Resources } from '../core/types';

export function newAndroid(id: AndroidId): AndroidState {
  const S = TUNING.start;
  return {
    id,
    kind: 'android',
    hull: S.hull,
    skin: S.skin,
    battery: S.battery,
    integrity: S.integrity[id],
    status: 'active',
  };
}

export function newJune(trust: number = TUNING.start.june.trust): HumanState {
  const S = TUNING.start.june;
  return { id: 'june', kind: 'human', health: S.health, hunger: S.hunger, trust, status: 'active' };
}

export function startingParty(): MemberState[] {
  return [newAndroid('wren'), newAndroid('brick'), newAndroid('vesper')];
}

export function startingResources(): Resources {
  return { ...TUNING.start.resources };
}

export function isActive(m: MemberState): boolean {
  return m.status === 'active';
}

export function activeAndroids(party: readonly MemberState[]): AndroidState[] {
  return party.filter((m): m is AndroidState => m.kind === 'android' && m.status === 'active');
}

export function livingAndroids(party: readonly MemberState[]): AndroidState[] {
  return party.filter((m): m is AndroidState => m.kind === 'android' && m.status !== 'lost');
}

export function juneOf(party: readonly MemberState[]): HumanState | undefined {
  return party.find((m): m is HumanState => m.kind === 'human');
}

export function clamp100(v: number): number {
  return Math.max(0, Math.min(100, v));
}
