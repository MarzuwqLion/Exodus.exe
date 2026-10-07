/** Launch configuration from URL parameters (spec §3.6, §17.6). Headless: takes the query string. */
import { REGIONS, WEATHERS, type Region, type Weather } from './types';

export const SCENE_NAMES = [
  'boot',
  'title',
  'join',
  'intro',
  'tutorial',
  'map',
  'drive',
  'depot',
  'diner',
  'gas',
  'station',
  'checkpoint',
  'port',
  'camp',
  'voyage',
  'ending',
  'gameover',
  // QA-only scenes
  'street',
  'lot',
  'compromised',
  'run',
] as const;
export type SceneName = (typeof SCENE_NAMES)[number];

export interface LaunchConfig {
  debug: boolean;
  seed: number | null;
  scene: SceneName | null;
  bench: boolean;
  region: Region | null;
  weather: Weather | null;
  /** Screenshot/QA mode: deterministic timing, instant transitions, exposes window.__exodus hooks. */
  qa: boolean;
  /** Players for scene jumps and QA (1 or 2). */
  players: 1 | 2;
  /** QA overrides. */
  skin: number | null;
  integrity: number | null;
  heat: number | null;
  day: number | null;
  alert: boolean;
  variant: number | null;
  /** Seconds of simulation to fast-forward after a scene jump (QA). */
  time: number | null;
  /** Pixel snapping (F7 toggles at runtime). */
  snap: boolean;
  /** Extra QA variant tag (e.g. 'compromised', 'bust', 'allLost', 'shipSailed', 'june'). */
  tag: string | null;
  /** Hide the HUD (QA shimmer/palette tests). */
  nohud: boolean;
}

function num(v: string | null): number | null {
  if (v === null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function flag(params: URLSearchParams, name: string): boolean {
  const v = params.get(name);
  return v !== null && v !== '0' && v !== 'false';
}

export function parseConfig(search: string): LaunchConfig {
  const params = new URLSearchParams(search);
  const scene = params.get('scene');
  const region = params.get('region');
  const weather = params.get('weather');
  const seed = num(params.get('seed'));
  const players = num(params.get('players'));
  return {
    debug: flag(params, 'debug'),
    seed: seed === null ? null : Math.floor(Math.abs(seed)),
    scene: (SCENE_NAMES as readonly string[]).includes(scene ?? '') ? (scene as SceneName) : null,
    bench: flag(params, 'bench'),
    region: (REGIONS as readonly string[]).includes(region ?? '') ? (region as Region) : null,
    weather: (WEATHERS as readonly string[]).includes(weather ?? '') ? (weather as Weather) : null,
    qa: flag(params, 'qa'),
    players: players === 2 ? 2 : 1,
    skin: num(params.get('skin')),
    integrity: num(params.get('integrity')),
    heat: num(params.get('heat')),
    day: num(params.get('day')),
    alert: flag(params, 'alert'),
    variant: num(params.get('variant')),
    time: num(params.get('time')),
    snap: params.get('snap') !== '0',
    tag: params.get('tag'),
    nohud: flag(params, 'nohud'),
  };
}
