/**
 * Optional audio overrides (spec §14.3). A file `public/audio/<cue>.mp3` or `.ogg` replaces the
 * synthesized cue: one-shots play the file, loops and music tracks loop it.
 *
 * The list of files that exist comes from the `virtual:audio-overrides` module (built by a small
 * plugin in vite.config.ts), so the game never requests a file that isn't there: a 404 would log
 * a console error. That module is imported dynamically, on unlock, so this file and the engine
 * import cleanly in Node and Vitest, where the module doesn't exist.
 */
import { type AnyCue, isCue } from './cues';

export type OverrideMap = Map<AnyCue, AudioBuffer>;

/** The part of an AudioContext the loader needs. */
export interface OverrideDecoder {
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
}

/** The part of a fetch Response the loader needs. */
export interface OverrideResponse {
  readonly ok: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type OverrideFetch = (url: string) => Promise<OverrideResponse>;

/** Where `public/audio/` ends up, relative to the page (Vite `base: './'`). */
export const OVERRIDE_BASE_URL = './audio/';

const AUDIO_EXT = /\.(mp3|ogg)$/i;

/** `"rain.ogg"` → `"rain"`; null for other extensions or names that aren't cues. */
export function cueFromFileName(file: string): AnyCue | null {
  const m = AUDIO_EXT.exec(file);
  if (!m) return null;
  const name = file.slice(0, m.index);
  return isCue(name) ? name : null;
}

function prefersOgg(): boolean {
  try {
    if (typeof document === 'undefined') return true;
    return document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"') !== '';
  } catch {
    return true;
  }
}

/**
 * Fetches and decodes the listed files, keyed by cue. Only files in `files` whose names are cues
 * are requested. When a cue has both formats, the one this browser prefers is tried first. Every
 * problem is reported in a single `console.warn`; nothing throws.
 */
export async function loadOverrideBuffers(
  decoder: OverrideDecoder,
  files: readonly unknown[],
  fetchFile: OverrideFetch,
  baseUrl = OVERRIDE_BASE_URL,
): Promise<OverrideMap> {
  const result: OverrideMap = new Map();
  const problems: string[] = [];
  const byCue = new Map<AnyCue, string[]>();
  for (const file of files) {
    if (typeof file !== 'string' || !AUDIO_EXT.test(file)) continue;
    const cue = cueFromFileName(file);
    if (!cue) {
      problems.push(`${file} (no cue by that name)`);
      continue;
    }
    const list = byCue.get(cue);
    if (list) list.push(file);
    else byCue.set(cue, [file]);
  }
  const oggFirst = prefersOgg();
  const rank = (file: string): number => (/\.ogg$/i.test(file) === oggFirst ? 0 : 1);
  await Promise.all(
    [...byCue].map(async ([cue, list]) => {
      list.sort((a, b) => rank(a) - rank(b));
      for (const file of list) {
        try {
          const res = await fetchFile(baseUrl + encodeURIComponent(file));
          if (!res.ok) continue;
          const buffer = await decoder.decodeAudioData(await res.arrayBuffer());
          result.set(cue, buffer);
          return;
        } catch {
          // Try the other format, if there is one.
        }
      }
      problems.push(`${list.join(' / ')} (could not be loaded or decoded)`);
    }),
  );
  if (problems.length > 0) {
    console.warn(`Audio overrides skipped: ${problems.join('; ')}. The synthesized versions play instead.`);
  }
  return result;
}

/** Loads every override present in `public/audio/`. Resolves to an empty map when there are none. */
export async function loadAudioOverrides(decoder: OverrideDecoder): Promise<OverrideMap> {
  let files: readonly unknown[];
  try {
    const mod = await import('virtual:audio-overrides');
    files = Array.isArray(mod.default) ? mod.default : [];
  } catch {
    // No list outside Vite (tests, tools): nothing to load.
    return new Map();
  }
  if (files.length === 0 || typeof fetch !== 'function') return new Map();
  return loadOverrideBuffers(decoder, files, (url) => fetch(url));
}
