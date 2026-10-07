/** Every stop layout, by kind (two variants per stop type, spec §10.1). */
import type { LayoutDef } from '../../sim/layout';
import { CHECKPOINT } from './checkpoint';
import { DEPOT_A, DEPOT_B } from './depot';
import { DINER_A, DINER_B } from './diner';
import { GAS_A, GAS_B } from './gas';
import { STATION_CHURCH, STATION_FEEDSTORE, STATION_KITCHEN, compromised } from './station';
import { TEST_LOT } from './test';

export const STOP_LAYOUTS = {
  depot: [DEPOT_A, DEPOT_B],
  diner: [DINER_A, DINER_B],
  gas: [GAS_A, GAS_B],
  station: [STATION_KITCHEN, STATION_FEEDSTORE, STATION_CHURCH],
  compromised: [compromised(STATION_KITCHEN), compromised(STATION_FEEDSTORE), compromised(STATION_CHURCH)],
  checkpoint: [CHECKPOINT],
  test: [TEST_LOT],
} as const satisfies Record<string, readonly LayoutDef[]>;

export type StopLayoutKind = keyof typeof STOP_LAYOUTS;

export function allLayouts(): LayoutDef[] {
  return Object.values(STOP_LAYOUTS).flat();
}

export function layoutFor(kind: StopLayoutKind, variant: number): LayoutDef {
  const list: readonly LayoutDef[] = STOP_LAYOUTS[kind];
  return list[((variant % list.length) + list.length) % list.length];
}
