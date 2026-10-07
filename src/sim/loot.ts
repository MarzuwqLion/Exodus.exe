/** Loot tables per container kind (spec §10.2–10.4, §10.9). Rolled once per stop with the seeded RNG. */
import { TUNING } from '../content/tuning';
import type { Rng } from '../core/rng';
import type { Resources } from '../core/types';
import type { ContainerKind } from './layout';

export function rollLoot(kind: ContainerKind, rng: Rng): Partial<Resources> {
  const L = TUNING.loot;
  const out: Partial<Resources> = {};
  const add = (k: keyof Resources, n: number): void => {
    if (n > 0) out[k] = (out[k] ?? 0) + n;
  };
  const between = (r: readonly [number, number]): number => rng.int(r[0], r[1]);
  switch (kind) {
    case 'shelf':
      add('rations', between(L.shelf.rations as [number, number]));
      if (rng.chance(L.shelf.partsChance)) add('parts', 1);
      add('cells', rng.int(1, 3));
      break;
    case 'locker':
      add('parts', between(L.locker.parts as [number, number]));
      if (rng.chance(L.locker.skinChance)) add('skinPatches', 1);
      if (rng.chance(L.locker.papersChance)) add('papers', 1);
      add('cells', rng.int(2, 5));
      break;
    case 'register':
      if (rng.chance(L.register.papersChance)) add('papers', 1);
      add('cells', between(L.register.cells as [number, number]));
      break;
    case 'bench':
      add('parts', between(L.bench.parts as [number, number]));
      break;
    case 'wallet':
      if (rng.chance(L.wallet.papersChance)) add('papers', 1);
      add('cells', between(L.wallet.cells as [number, number]));
      break;
    case 'kitchen':
      add('rations', between(L.kitchen.rations as [number, number]));
      break;
    case 'office':
      if (rng.chance(L.office.papersChance)) add('papers', 1);
      add('parts', between(L.office.parts as [number, number]));
      add('cells', rng.int(1, 4));
      break;
    case 'partsAisle':
      add('parts', between(L.partsAisle.parts as [number, number]));
      if (rng.chance(L.partsAisle.skinChance)) add('skinPatches', 1);
      break;
    case 'garage':
      add('parts', between(L.garage.parts as [number, number]));
      add('cells', between(L.garage.cells as [number, number]));
      break;
    case 'store':
      add('rations', between(L.store.rations as [number, number]));
      if (rng.chance(L.store.papersChance)) add('papers', 1);
      add('cells', rng.int(1, 4));
      break;
    case 'supplyBag':
      add('cells', between(L.supplyBag.cells as [number, number]));
      add('parts', between(L.supplyBag.parts as [number, number]));
      add('papers', between(L.supplyBag.papers as [number, number]));
      break;
  }
  return out;
}

const NAMES: Record<keyof Resources, [string, string]> = {
  cells: ['Cell', 'Cells'],
  carBattery: ['car charge', 'car charge'],
  parts: ['Part', 'Parts'],
  skinPatches: ['Skin patch', 'Skin patches'],
  papers: ['Papers', 'Papers'],
  rations: ['Ration', 'Rations'],
};

export function resourceLabel(k: keyof Resources, n: number): string {
  return `${n > 0 ? '+' : ''}${n} ${NAMES[k][Math.abs(n) === 1 ? 0 : 1]}`;
}

/** "+12 Cells, +1 Part" */
export function lootText(loot: Partial<Resources>): string {
  const parts: string[] = [];
  for (const k of ['cells', 'parts', 'skinPatches', 'papers', 'rations'] as const) {
    const n = loot[k];
    if (n) parts.push(resourceLabel(k, n));
  }
  return parts.length ? parts.join(', ') : 'Nothing useful';
}
