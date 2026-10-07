/**
 * Save data: one slot in localStorage (spec §12.1). Saves carry a version and a migration path;
 * a corrupted save is discarded with a clear message, never a crash (spec §3.4).
 */
import type { MetaState, PerkId, RunState, SaveData, Settings } from './types';

export const SAVE_KEY = 'exodus.save';
export const SAVE_VERSION = 1;

/** The subset of Storage the save system needs (localStorage in the browser, a Map in tests). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStore implements KeyValueStore {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

export function defaultSettings(): Settings {
  return {
    masterVolume: 0.8,
    musicVolume: 0.7,
    sfxVolume: 0.8,
    fullscreen: false,
    screenShake: true,
    rumble: true,
    reduceFlashing: false,
    largeText: false,
    tips: true,
    dither: true,
    glyphStyle: 'auto',
  };
}

export function defaultMeta(): MetaState {
  return { cores: 0, coresEarned: 0, unlocked: [], tutorialDone: false, runs: 0, wins: 0, tipsShown: [] };
}

export function defaultSave(): SaveData {
  return { version: 1, run: null, meta: defaultMeta(), settings: defaultSettings() };
}

export interface LoadResult {
  data: SaveData;
  /** Shown on the title screen when something had to be discarded. */
  message: string | null;
}

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

const PERKS: readonly PerkId[] = [
  'spare-cells',
  'forged-papers',
  'field-kit',
  'network-contacts',
  'old-route',
];

/**
 * Migrations from older save versions. Each entry upgrades version N to N + 1.
 * Version 0 was the pre-release shape: `{ meta, settings, run }` with no version and `cores` at the top level.
 */
const MIGRATIONS: Record<number, (raw: Json) => Json> = {
  0: (raw) => {
    const meta = isObj(raw.meta) ? raw.meta : {};
    if (isNum(raw.cores) && !isNum(meta.cores)) meta.cores = raw.cores;
    return { version: 1, run: raw.run ?? null, meta, settings: raw.settings ?? {} };
  },
};

function migrate(raw: Json): Json | null {
  let version = isNum(raw.version) ? raw.version : 0;
  let cur = raw;
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return null;
    cur = step(cur);
    version = isNum(cur.version) ? cur.version : version + 1;
  }
  return version === SAVE_VERSION ? cur : null;
}

function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!isObj(raw)) return d;
  const out: Settings = { ...d };
  const nums = ['masterVolume', 'musicVolume', 'sfxVolume'] as const;
  for (const k of nums) if (isNum(raw[k])) out[k] = Math.min(1, Math.max(0, raw[k]));
  const bools = [
    'fullscreen',
    'screenShake',
    'rumble',
    'reduceFlashing',
    'largeText',
    'tips',
    'dither',
  ] as const;
  for (const k of bools) if (typeof raw[k] === 'boolean') out[k] = raw[k];
  if (raw.glyphStyle === 'auto' || raw.glyphStyle === 'xbox' || raw.glyphStyle === 'playstation') {
    out.glyphStyle = raw.glyphStyle;
  }
  return out;
}

function sanitizeMeta(raw: unknown): MetaState {
  const d = defaultMeta();
  if (!isObj(raw)) return d;
  return {
    cores: isNum(raw.cores) ? Math.max(0, Math.floor(raw.cores)) : d.cores,
    coresEarned: isNum(raw.coresEarned) ? Math.max(0, Math.floor(raw.coresEarned)) : d.coresEarned,
    unlocked: Array.isArray(raw.unlocked)
      ? raw.unlocked.filter((p): p is PerkId => (PERKS as readonly unknown[]).includes(p))
      : [],
    tutorialDone: raw.tutorialDone === true,
    runs: isNum(raw.runs) ? raw.runs : 0,
    wins: isNum(raw.wins) ? raw.wins : 0,
    tipsShown: Array.isArray(raw.tipsShown)
      ? raw.tipsShown.filter((t): t is string => typeof t === 'string')
      : [],
  };
}

/** Structural validation of a saved run. Anything off means the run is discarded (meta survives). */
export function isValidRun(raw: unknown): raw is RunState {
  if (!isObj(raw)) return false;
  if (raw.version !== 1) return false;
  const numsOk = ['seed', 'rngState', 'day', 'leg', 'column', 'heat'].every((k) => isNum(raw[k]));
  if (!numsOk) return false;
  const res = raw.resources;
  if (!isObj(res)) return false;
  if (!['cells', 'carBattery', 'parts', 'skinPatches', 'papers', 'rations'].every((k) => isNum(res[k])))
    return false;
  if (!Array.isArray(raw.party) || raw.party.length === 0) return false;
  for (const m of raw.party) {
    if (!isObj(m) || typeof m.id !== 'string' || (m.kind !== 'android' && m.kind !== 'human')) return false;
    if (m.kind === 'android' && !['hull', 'skin', 'battery', 'integrity'].every((k) => isNum(m[k])))
      return false;
    if (m.kind === 'human' && !['health', 'hunger', 'trust'].every((k) => isNum(m[k]))) return false;
  }
  if (!isObj(raw.control)) return false;
  const map = raw.map;
  if (!isObj(map) || !Array.isArray(map.nodes) || typeof map.current !== 'string') return false;
  if (!map.nodes.some((n) => isObj(n) && n.id === map.current)) return false;
  if (!Array.isArray(raw.rumors) || !Array.isArray(raw.flags)) return false;
  if (!isObj(raw.stats)) return false;
  for (const k of ['carried', 'pendingResets', 'nextStopMods', 'lanternSeen'] as const) {
    if (!Array.isArray(raw[k])) return false;
  }
  return true;
}

export function parseSave(text: string | null): LoadResult {
  if (text === null) return { data: defaultSave(), message: null };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { data: defaultSave(), message: 'Your save file was damaged and has been cleared.' };
  }
  if (!isObj(raw))
    return { data: defaultSave(), message: 'Your save file was damaged and has been cleared.' };
  const migrated = migrate(raw);
  if (!migrated)
    return {
      data: defaultSave(),
      message: 'Your save file was from an unknown version and has been cleared.',
    };
  const data: SaveData = {
    version: 1,
    run: null,
    meta: sanitizeMeta(migrated.meta),
    settings: sanitizeSettings(migrated.settings),
  };
  let message: string | null = null;
  if (migrated.run !== null && migrated.run !== undefined) {
    if (isValidRun(migrated.run)) data.run = migrated.run;
    else message = 'Your saved run was damaged and has been discarded. Unlocks were kept.';
  }
  return { data, message };
}

export function loadSave(store: KeyValueStore): LoadResult {
  let text: string | null;
  try {
    text = store.getItem(SAVE_KEY);
  } catch {
    return { data: defaultSave(), message: 'Saving is unavailable in this browser.' };
  }
  const result = parseSave(text);
  if (result.message) {
    try {
      store.setItem(SAVE_KEY, JSON.stringify(result.data));
    } catch {
      // Storage may be full or blocked; the in-memory data still works.
    }
  }
  return result;
}

export function writeSave(store: KeyValueStore, data: SaveData): boolean {
  try {
    store.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
