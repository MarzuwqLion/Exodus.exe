/**
 * The run's flow between scenes (spec §12.1): map → drive (maybe a road event) → stop, Station, checkpoint,
 * or the Port → camp → map, ten legs, autosaving at every camp and Station. The run state lives here; scenes
 * read it through `game.flow` and call back when they finish.
 */
import type { LanternMessage } from '../content/schema';
import { TUNING } from '../content/tuning';
import { freshSeed } from '../core/rng';
import type { MemberId, RunState, Slot } from '../core/types';
import type { Game } from '../game';
import { lanternFor, legMessages, stationRevealedMessage } from '../run/lantern';
import { currentNode } from '../run/map';
import {
  allAndroidsLost,
  applyPortOutcome,
  applyStopOutcome,
  beginLeg,
  endLeg,
  missedTheShip,
  newRun,
  noteJune,
  sailing,
  stopConfigForRun,
  withRng,
} from '../run/run';
import { keeperForColumn, rollCompromised } from '../run/station';
import type { StopOutcome } from '../sim/types';
import { LanternPhone } from '../ui/phone';

export type RunEnding = 'ghana' | 'sailed-without' | 'missed' | 'lost';

/** Run flag: the party is camped at a Station (saved, so Continue reopens the right camp). */
const STATION_CAMP = 'camp-at-station';

export class RunFlow {
  /** Lantern's texts, carried from scene to scene. */
  readonly phone = new LanternPhone();
  /** The leg's road event is still to come (the drive scene shows it). */
  pendingEvent = false;

  constructor(
    readonly game: Game,
    public run: RunState,
  ) {}

  /** A new run from Boston: player 1 plays Wren; player 2 (if joined) Brick. */
  static begin(game: Game, seed: number = game.config.seed ?? freshSeed()): RunFlow {
    const control: Record<Slot, MemberId | null> = { 0: 'wren', 1: game.input.isJoined(1) ? 'brick' : null };
    const flow = new RunFlow(game, newRun(seed, { control }));
    game.flow = flow;
    flow.save();
    return flow;
  }

  /** Pick up a saved run where it left off (at the map, or at camp). */
  static resume(game: Game, run: RunState): RunFlow {
    const flow = new RunFlow(game, run);
    game.flow = flow;
    return flow;
  }

  save(): void {
    this.game.save.run = this.run;
    this.game.persist();
  }

  say(msgs: readonly (LanternMessage | null)[]): void {
    for (const m of msgs) if (m) this.phone.push(m.text);
  }

  /** Where a resumed run should open. */
  open(): void {
    if (this.run.phase === 'camp') this.game.goto('camp', { station: this.run.flags.includes(STATION_CAMP) });
    else this.showMap();
  }

  showMap(): void {
    this.run.phase = 'map';
    this.game.goto('map');
  }

  /** The players chose the next town. */
  go(toId: string): void {
    const plan = beginLeg(this.run, toId);
    this.say(legMessages(this.run, plan.to, plan.walking));
    this.pendingEvent = plan.event;
    if (plan.walking) this.arrive();
    else this.game.goto('drive', undefined, 'wipe');
  }

  /** The drive (or the walk) is over: what's at the end of the road. */
  arrive(): void {
    const run = this.run;
    this.pendingEvent = false;
    if (missedTheShip(run)) return this.end('missed');
    const node = currentNode(run.map);
    run.phase = node.type === 'checkpoint' ? 'checkpoint' : node.type === 'port' ? 'port' : 'stop';
    switch (node.type) {
      case 'checkpoint':
        this.game.goto('checkpoint');
        return;
      case 'port':
        this.game.goto('port');
        return;
      case 'station': {
        const keeper = keeperForColumn(node.column);
        const compromised = withRng(run, (rng) => rollCompromised(run.heat, rng));
        if (!keeper || compromised) {
          this.game.goto('runstop', { compromised: true });
          return;
        }
        this.game.goto('runstation');
        return;
      }
      default:
        this.game.goto('runstop');
    }
  }

  /** The stop config for the scene at the current node. */
  stopConfig(o: { compromised?: boolean; bust?: boolean } = {}): ReturnType<typeof stopConfigForRun> {
    return stopConfigForRun(this.run, o);
  }

  /** A stop, Station, compromised Station, or checkpoint bust is over. */
  stopEnded(outcome: StopOutcome, atStation = false): void {
    const run = this.run;
    if (outcome.end === 'allLost') return this.end('lost');
    const lostBefore = run.stats.lostLog.length;
    applyStopOutcome(run, outcome, currentNode(run.map).name);
    noteJune(run);
    if (run.stats.lostLog.length > lostBefore) this.say([lanternFor(run, 'member-lost')]);
    if (allAndroidsLost(run)) return this.end('lost');
    this.toCamp(atStation);
  }

  toCamp(atStation: boolean): void {
    this.run.phase = 'camp';
    // Remembered so a run resumed at camp reopens in the keeper's light (a long rest there is free).
    this.run.flags = this.run.flags.filter((f) => f !== STATION_CAMP);
    if (atStation) this.run.flags.push(STATION_CAMP);
    this.save();
    this.game.goto('camp', { station: atStation });
  }

  /** Camp is over: close out the leg and go back to the map. */
  campDone(atStation: boolean): void {
    const run = this.run;
    run.flags = run.flags.filter((f) => f !== STATION_CAMP);
    const { deadBattery, revealed } = endLeg(run, atStation);
    if (deadBattery.length > 0) this.say([lanternFor(run, 'member-lost')]);
    if (allAndroidsLost(run)) return this.end('lost');
    if (missedTheShip(run)) return this.end('missed');
    for (const s of revealed) this.say([stationRevealedMessage(run, s)]);
    if (sailing(run).slack <= 0) this.say([lanternFor(run, 'slack-zero')]);
    if (activeLowBattery(run)) this.say([lanternFor(run, 'low-battery')]);
    this.save();
    this.showMap();
  }

  /** The Port is over (spec §11.5): who made it aboard decides the ending. */
  portEnded(outcome: StopOutcome): void {
    if (outcome.end === 'allLost') return this.end('lost');
    const aboard = applyPortOutcome(this.run, outcome);
    if (!aboard.some((id) => id !== 'june')) return this.end('sailed-without');
    this.sailed(aboard);
  }

  /** The Sankofa sails with these members aboard (at least one android): the voyage, then Ghana (§16). */
  sailed(aboard: MemberId[]): void {
    void aboard;
    this.end('ghana');
  }

  /** The run is over, one way or another. The save slot is cleared. */
  end(kind: RunEnding): void {
    this.run.phase = 'ended';
    this.game.save.run = null;
    this.game.persist();
    this.game.goto('ending', { kind });
  }
}

function activeLowBattery(run: RunState): boolean {
  return run.party.some(
    (m) => m.kind === 'android' && m.status === 'active' && m.battery < TUNING.charging.lowBattery * 2,
  );
}
