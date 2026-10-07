/**
 * Lantern (spec §12.8): which message goes out when. Each trigger picks an unseen message whose conditions
 * fit the run (the most specific first), and remembers it. Some messages repeat (leg starts can come more
 * than once with different texts; the generic Station message covers any Station without its own).
 */
import { LANTERN_MESSAGES } from '../content/lantern';
import type { LanternMessage, LanternTrigger } from '../content/schema';
import { STATION_KEEPERS } from '../content/conversations';
import { TUNING } from '../content/tuning';
import type { MapNode, RunState } from '../core/types';
import { conditionsMet } from './events';

/** Triggers whose messages may come back (a different text each time where there is one). */
const REPEATABLE: ReadonlySet<LanternTrigger> = new Set([
  'leg-start',
  'station-revealed',
  'alert',
  'member-lost',
]);

/**
 * The message for a trigger right now, or null. Messages with conditions are preferred over generic ones,
 * so a keeper's own Station message wins over the generic beacon line.
 */
export function lanternFor(run: RunState, trigger: LanternTrigger): LanternMessage | null {
  const fits = LANTERN_MESSAGES.filter((m) => m.trigger === trigger && conditionsMet(run, m.conditions));
  const unseen = fits.filter((m) => !run.lanternSeen.includes(m.id));
  const pool = unseen.length > 0 ? unseen : REPEATABLE.has(trigger) ? fits : [];
  if (pool.length === 0) return null;
  const pick = [...pool].sort((a, b) => (b.conditions ? 1 : 0) - (a.conditions ? 1 : 0))[0];
  if (!run.lanternSeen.includes(pick.id)) run.lanternSeen.push(pick.id);
  return pick;
}

/** A Station's beacon showed: flag its keeper so their own message can go out. */
export function stationRevealedMessage(run: RunState, station: MapNode): LanternMessage | null {
  const keeper = STATION_KEEPERS.find((k) => k.column === station.column);
  if (keeper) {
    const flag = `station-${keeper.id}`;
    if (!run.flags.includes(flag)) run.flags.push(flag);
  }
  const msg = lanternFor(run, 'station-revealed');
  // Each keeper's message only once; afterwards the generic line.
  if (keeper) run.flags = run.flags.filter((f) => f !== `station-${keeper.id}`);
  return msg;
}

/** Messages for setting out on a leg: departure, regions, checkpoints ahead, the clock, Heat. */
export function legMessages(run: RunState, to: MapNode, walking: boolean): LanternMessage[] {
  const out: LanternMessage[] = [];
  const add = (t: LanternTrigger): void => {
    const m = lanternFor(run, t);
    if (m) out.push(m);
  };
  if (run.leg === 1) add('departure');
  if (walking) add('walking');
  if (to.column === TUNING.run.checkpointColumns[0]) add('before-checkpoint-1');
  if (to.column === TUNING.run.checkpointColumns[1]) add('before-checkpoint-2');
  if (to.region === 'corridor') add('region-corridor');
  if (to.region === 'piedmont') add('region-piedmont');
  if (to.region === 'lowcountry') add('region-lowcountry');
  if (to.type === 'port') add('port-approach');
  if (run.day >= 12) add('day-12');
  if (run.heat >= 2) add('high-heat');
  return out.slice(0, 2);
}
