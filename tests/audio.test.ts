import { describe, expect, it, vi } from 'vitest';

// The override list is a Vite virtual module. The engine imports it lazily (so plain imports work
// in Node), and this mock lets the loader run end to end.
vi.mock('virtual:audio-overrides', () => ({ default: [] }));

import {
  ALL_CUES,
  CUE_DESCRIPTIONS,
  LOOP_CUES,
  MUSIC_TRACKS,
  SFX_CUES,
  cueKind,
  isCue,
  type AnyCue,
} from '../src/audio/cues';
import { AudioEngine } from '../src/audio/engine';
import { hashString, mulberry32 } from '../src/audio/music';
import { cueFromFileName, loadAudioOverrides, loadOverrideBuffers } from '../src/audio/override';

describe('AudioEngine in Node', () => {
  it('constructs without an AudioContext', () => {
    expect(typeof AudioContext).toBe('undefined');
    const engine = new AudioEngine();
    expect(engine.ready).toBe(false);
  });

  it('makes every method a safe no-op', () => {
    const engine = new AudioEngine();
    expect(() => {
      engine.unlock();
      engine.unlock();
      engine.setVolumes({ master: 0.5, music: 0.2, sfx: 1 });
      engine.setVolumes({ master: Number.NaN, music: -3, sfx: 7 });
      for (const cue of SFX_CUES) {
        engine.play(cue);
        engine.play(cue, { pan: -1, gain: 0.5, detune: 100 });
        engine.play(cue, { pan: Number.NaN, gain: Number.POSITIVE_INFINITY, detune: Number.NaN });
      }
      const handles = LOOP_CUES.map((cue) => engine.loop(cue, { gain: 0.5, pan: 0.2 }));
      for (const h of handles) {
        h.setGain(0.3);
        h.setPan(-0.4);
        h.setGain(Number.NaN);
        h.stop();
        h.stop(2);
        h.setGain(1);
      }
      engine.loop('rain').stop(0);
      engine.loop('wind_snow');
      engine.stopAllLoops();
      engine.stopAllLoops(0.2);
      for (const track of MUSIC_TRACKS) engine.setMusic(track);
      engine.setMusic('none');
      engine.setTension(0);
      engine.setTension(0.7);
      engine.setTension(Number.NaN);
      engine.setAlert(true);
      engine.setAlert(false);
      engine.setSuspicionPulse(0, 0.9, -0.5);
      engine.setSuspicionPulse(1, 0.2, 0.5);
      engine.setSuspicionPulse(1, Number.NaN, Number.NaN);
      engine.setPaused(true);
      engine.setPaused(false);
      for (let i = 0; i < 120; i++) engine.update(1 / 60);
      engine.update(0);
      engine.update(Number.NaN);
    }).not.toThrow();
    expect(engine.ready).toBe(false);
  });
});

describe('cue list', () => {
  it('has a description for every cue, and nothing else', () => {
    expect(Object.keys(CUE_DESCRIPTIONS).sort()).toEqual([...ALL_CUES].sort());
    for (const cue of ALL_CUES) {
      const line = CUE_DESCRIPTIONS[cue];
      expect(line.trim().length).toBeGreaterThan(0);
      expect(line).not.toMatch(/[\n|]/);
    }
  });

  it('uses unique snake_case names across SFX, loops, and music', () => {
    expect(ALL_CUES.length).toBe(SFX_CUES.length + LOOP_CUES.length + MUSIC_TRACKS.length);
    expect(new Set(ALL_CUES).size).toBe(ALL_CUES.length);
    for (const cue of ALL_CUES) expect(cue).toMatch(/^[a-z_]+$/);
  });

  it('lists every cue the spec calls for', () => {
    expect(SFX_CUES.length).toBe(48);
    expect(LOOP_CUES.length).toBe(15);
    expect(MUSIC_TRACKS).toEqual(['title', 'scene', 'station', 'camp', 'epilogue', 'gameover']);
  });

  it('classifies cues', () => {
    expect(cueKind('thunder')).toBe('sfx');
    expect(cueKind('rain')).toBe('loop');
    expect(cueKind('epilogue')).toBe('music');
    expect(isCue('station_room')).toBe(true);
    expect(isCue('station_rooms')).toBe(false);
  });
});

describe('audio overrides', () => {
  it('maps file names to cues', () => {
    expect(cueFromFileName('rain.ogg')).toBe('rain');
    expect(cueFromFileName('title.MP3')).toBe('title');
    expect(cueFromFileName('ui_move.mp3')).toBe('ui_move');
    expect(cueFromFileName('mystery.ogg')).toBeNull();
    expect(cueFromFileName('rain.wav')).toBeNull();
    expect(cueFromFileName('README.txt')).toBeNull();
  });

  it('fetches only listed files with cue names, prefers one format, and warns once', async () => {
    const fetched: string[] = [];
    const decoded = { duration: 1 } as unknown as AudioBuffer;
    const decoder = {
      decodeAudioData: (data: ArrayBuffer): Promise<AudioBuffer> =>
        data.byteLength > 0 ? Promise.resolve(decoded) : Promise.reject(new Error('corrupt')),
    };
    const fetchFile = (url: string) => {
      fetched.push(url);
      const bytes = url.includes('thunder') ? 0 : 8;
      return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(bytes)) });
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const map = await loadOverrideBuffers(
      decoder,
      ['rain.ogg', 'rain.mp3', 'title.mp3', 'thunder.ogg', 'mystery.ogg', 'notes.txt'],
      fetchFile,
    );
    // rain: the first format decodes, so the second is never requested.
    expect(fetched.filter((u) => u.includes('rain'))).toHaveLength(1);
    expect(fetched).toContain('./audio/title.mp3');
    expect(fetched).toContain('./audio/thunder.ogg');
    expect(fetched.some((u) => u.includes('mystery') || u.includes('notes'))).toBe(false);
    expect(map.get('rain')).toBe(decoded);
    expect(map.get('title')).toBe(decoded);
    expect(map.has('thunder')).toBe(false);
    expect([...map.keys()].every((k: AnyCue) => isCue(k))).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('loads nothing when the override folder is empty', async () => {
    const decodeAudioData = vi.fn(() => Promise.reject(new Error('unused')));
    const map = await loadAudioOverrides({ decodeAudioData });
    expect(map.size).toBe(0);
    expect(decodeAudioData).not.toHaveBeenCalled();
  });
});

describe('music generator', () => {
  it('is seeded and reproducible', () => {
    const a = mulberry32(hashString('title'));
    const b = mulberry32(hashString('title'));
    const c = mulberry32(hashString('scene'));
    const seqA = Array.from({ length: 32 }, a);
    const seqB = Array.from({ length: 32 }, b);
    const seqC = Array.from({ length: 32 }, c);
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    for (const x of seqA) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
