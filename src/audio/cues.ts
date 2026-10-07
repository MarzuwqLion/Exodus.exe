/**
 * Every audio cue in the game (spec §14). Each name doubles as an override file name: dropping
 * `public/audio/<cue>.mp3` or `.ogg` replaces the synthesized version (§14.3). The README's cue
 * table is generated from `CUE_DESCRIPTIONS`.
 *
 * Headless-safe: plain data, no WebAudio.
 */

/** One-shot sound effects (`AudioEngine.play`). */
export const SFX_CUES = [
  'step_asphalt',
  'step_tile',
  'step_snow',
  'step_wood',
  'step_heavy',
  'servo',
  'dash',
  'scanner_sweep',
  'kiosk_beep',
  'kiosk_ok',
  'kiosk_fail',
  'van_screech',
  'hit_light',
  'hit_heavy',
  'baton_swing',
  'emp_charge',
  'emp_shot',
  'knockout',
  'shutdown',
  'reboot',
  'glitch',
  'stool_break',
  'bash',
  'shove',
  'thunder',
  'ship_horn',
  'ui_move',
  'ui_confirm',
  'ui_back',
  'ui_error',
  'type_tick',
  'phone_buzz',
  'pickup',
  'breath_beat',
  'breath_ok',
  'breath_miss',
  'car_door',
  'car_start',
  'alarm_pop',
  'notice',
  'search',
  'plug_in',
  'unplug',
  'chat',
  'coffee',
  'gate_raise',
  'crash',
  'suspicion_thump',
] as const;

/** Ambience and weather loops (`AudioEngine.loop`). */
export const LOOP_CUES = [
  'wind_snow',
  'rain',
  'rain_heavy',
  'lamp_hum',
  'fluorescent',
  'siren',
  'alarm',
  'station_room',
  'port',
  'car_engine',
  'drone',
  'charging',
  'camp_night',
  'sea',
  'crowd',
] as const;

/** Music tracks (`AudioEngine.setMusic`). */
export const MUSIC_TRACKS = ['title', 'scene', 'station', 'camp', 'epilogue', 'gameover'] as const;

export type SfxCue = (typeof SFX_CUES)[number];
export type LoopCue = (typeof LOOP_CUES)[number];
export type MusicTrack = (typeof MUSIC_TRACKS)[number];
export type AnyCue = SfxCue | LoopCue | MusicTrack;
export type CueKind = 'sfx' | 'loop' | 'music';

/** Every cue name, in table order: SFX, then loops, then music. */
export const ALL_CUES: readonly AnyCue[] = [...SFX_CUES, ...LOOP_CUES, ...MUSIC_TRACKS];

const SFX_SET: ReadonlySet<string> = new Set<string>(SFX_CUES);
const LOOP_SET: ReadonlySet<string> = new Set<string>(LOOP_CUES);
const MUSIC_SET: ReadonlySet<string> = new Set<string>(MUSIC_TRACKS);

export function isSfxCue(name: string): name is SfxCue {
  return SFX_SET.has(name);
}

export function isLoopCue(name: string): name is LoopCue {
  return LOOP_SET.has(name);
}

export function isMusicTrack(name: string): name is MusicTrack {
  return MUSIC_SET.has(name);
}

export function isCue(name: string): name is AnyCue {
  return SFX_SET.has(name) || LOOP_SET.has(name) || MUSIC_SET.has(name);
}

export function cueKind(cue: AnyCue): CueKind {
  return SFX_SET.has(cue) ? 'sfx' : LOOP_SET.has(cue) ? 'loop' : 'music';
}

/** One short line per cue, for the README's cue table. */
export const CUE_DESCRIPTIONS: Record<AnyCue, string> = {
  step_asphalt: 'Footstep on asphalt: a gritty tap.',
  step_tile: 'Footstep on tile: a short click.',
  step_snow: 'Footstep in snow: a muffled crunch.',
  step_wood: 'Footstep on wood: a hollow knock.',
  step_heavy: "Brick's heavy step: lower and louder.",
  servo: 'A very quiet, short servo whirr on android movement.',
  dash: 'Dash: an inhuman whoosh.',
  scanner_sweep: 'Handheld cyan scanner: a sine glide over soft noise.',
  kiosk_beep: 'ID kiosk key beep.',
  kiosk_ok: 'ID kiosk accepts: two rising beeps.',
  kiosk_fail: 'ID kiosk rejects: a low double buzz.',
  van_screech: 'A Recycler van screeching in.',
  hit_light: 'Light hit.',
  hit_heavy: 'Heavy hit with a metallic ring.',
  baton_swing: 'Stun baton swing with an electric crackle.',
  emp_charge: 'EMP rifle charging: a rising whine (about 0.8 s).',
  emp_shot: 'EMP shot: a cold, zappy burst.',
  knockout: 'A human knocked out: a body hitting the floor.',
  shutdown: 'An android powering down.',
  reboot: 'An android rebooting.',
  glitch: 'Glitch: a bit-crushed, stuttering fragment.',
  stool_break: 'A stool breaking under Brick.',
  bash: 'Bashing open a locked door or container.',
  shove: 'Shoving a person or a heavy object.',
  thunder: 'Thunder: a low burst with a long rolling tail.',
  ship_horn: "The Sankofa's horn: deep, long, two-tone.",
  ui_move: 'Menu cursor move.',
  ui_confirm: 'Menu confirm.',
  ui_back: 'Menu back.',
  ui_error: 'Menu error or unavailable action.',
  type_tick: 'Typewriter tick, one per character.',
  phone_buzz: 'Phone vibrating twice: a Lantern message.',
  pickup: 'Picking up loot.',
  breath_beat: 'Breathing scan pulse.',
  breath_ok: 'A breath counted during a scan.',
  breath_miss: 'A missed breath during a scan.',
  car_door: 'Station wagon door closing.',
  car_start: 'Station wagon starting up (electric).',
  alarm_pop: 'An observer turns Alarmed: a short, sharp stab.',
  notice: 'An observer turns Curious: a soft blip.',
  search: 'Rummaging through a container.',
  plug_in: 'Plugging into a charger.',
  unplug: 'Unplugging from a charger.',
  chat: 'Co-op Chat: muffled, indistinct talk.',
  coffee: 'Coffee poured into a cup.',
  gate_raise: 'A barrier gate motoring up.',
  crash: 'A crash: the car through a barrier, or a big impact.',
  suspicion_thump: 'Suspicion heartbeat: a low servo-thump.',
  wind_snow: 'Snow wind: slowly shifting band-passed noise.',
  rain: 'Rain with random drips.',
  rain_heavy: 'Heavy rain: a thicker wash with more drips and splashes.',
  lamp_hum: 'Sodium street lamp hum.',
  fluorescent: 'Fluorescent tube buzz with random flicker clicks.',
  siren: 'A distant police siren.',
  alarm: 'Two-tone facility alarm (ALERT).',
  station_room: 'Station interior: low radio murmur, a clock, now and then a kettle.',
  port: 'The port: crane motors and water slapping the quay.',
  car_engine: 'Inside the station wagon on the road.',
  drone: 'Surveillance drone hover hum.',
  charging: 'Charger hum while plugged in.',
  camp_night: 'Night camp: crickets and a little wind, very quiet.',
  sea: "Waves against the Sankofa's hull.",
  crowd: 'Diner murmur with cutlery clinks.',
  title: 'Title: dark ambient pad with sparse high notes.',
  scene: 'Stops: dark ambient pad; the tension and ALERT layers ride on top.',
  station: 'Stations: a softer, warmer pad.',
  camp: 'Camp: a quiet, sparse pad.',
  epilogue: 'Sunrise and Ghana: a warm, major-key plucked melody over a soft pad.',
  gameover: 'Game over: a slow, low pad.',
};
