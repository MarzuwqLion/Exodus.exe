/**
 * A scripted full run, headless (spec §18, the M6 exit): Boston to the Port with every stop played live by
 * the cautious stop bots, road events and camp decided like a careful player (runpolicy.ts), checkpoints
 * answered like a person (a bust plays the checkpoint compound live), Stations giving their care, and the
 * Port crossed by the Port bot. Nothing is sampled: every scene of the run is simulated.
 */
import type { EventStep, RoadEvent } from '../content/schema';
import { TUNING } from '../content/tuning';
import { Rng, hashSeed } from '../core/rng';
import type { AndroidState, MemberId, RunState } from '../core/types';
import { campEffects, pickCampConversation } from '../run/camp';
import { applyBustCost, checkpointStress } from '../run/checkpoint';
import { choiceAvailable, pickEvent, resolveChoice } from '../run/events';
import { juneLeavesAtStation } from '../run/june';
import { currentNode, nextNodes } from '../run/map';
import {
  allAndroidsLost,
  applyPortOutcome,
  applyStopOutcome,
  beginLeg,
  endLeg,
  missedTheShip,
  newRun,
  stopConfigForRun,
  withRng,
} from '../run/run';
import { applyTrade, canTrade, rollCompromised, stationCare, type StationTrade } from '../run/station';
import type { StopOutcome } from '../sim/types';
import { runCheckpointBots } from './checkpointbots';
import { playPort } from './portbots';
import { playStop } from './runner';
import { bestChoice, competentRoute, sensibleCamp } from './runpolicy';

export type FullRunEnd = 'ghana' | 'sailed-without' | 'missed' | 'lost' | 'timeout';

export interface FullRun {
  end: FullRunEnd;
  run: RunState;
  aboard: MemberId[];
  /** One line per leg: where the party went and what happened there. */
  log: string[];
}

function playEvent(run: RunState, rng: Rng): string | null {
  const picked = pickEvent(run, rng);
  if (!picked) return null;
  let step: EventStep | undefined = picked.event as RoadEvent;
  for (let guard = 0; step && guard < 4; guard++) {
    const choices = step.choices.filter((c) => choiceAvailable(run, c));
    if (choices.length === 0) break;
    const { outcome } = resolveChoice(run, rng, bestChoice(run, choices), picked.ctx);
    step = outcome.next;
  }
  return picked.event.title;
}

export function playFullRun(seed: number): FullRun {
  const run = newRun(seed);
  const rng = new Rng(hashSeed('fullrun', seed));
  const log: string[] = [];
  const done = (end: FullRunEnd, aboard: MemberId[] = []): FullRun => ({ end, run, aboard, log });
  const stop = (out: StopOutcome | null, where: string): FullRunEnd | null => {
    if (!out) return 'timeout';
    if (out.end === 'allLost') return 'lost';
    applyStopOutcome(run, out, where);
    return null;
  };
  for (let legs = 0; legs < TUNING.run.columns + 2; legs++) {
    const to = competentRoute(run, nextNodes(run.map), rng, false);
    const plan = beginLeg(run, to.id);
    const event = plan.event ? playEvent(run, rng) : null;
    const node = currentNode(run.map);
    const line = (what: string): void => {
      log.push(
        `day ${run.day} ${node.type} ${node.name}${plan.walking ? ' (walked)' : ''}` +
          `${event ? ` [${event}]` : ''}: ${what} · Heat ${run.heat.toFixed(1)}`,
      );
    };
    if (missedTheShip(run)) return done('missed');
    if (node.type === 'port') {
      const out = playPort(stopConfigForRun(run), rng.int(0, 1_000_000));
      if (!out) return done('timeout');
      if (out.end === 'allLost') return done('lost');
      const aboard = applyPortOutcome(run, out);
      line(`aboard: ${aboard.join(', ') || 'nobody'}`);
      return done(aboard.some((id) => id !== 'june') ? 'ghana' : 'sailed-without', aboard);
    }
    // A careful player always pulls a unit back from its factory reset.
    for (const id of run.pendingResets) {
      const a = run.party.find((m) => m.id === id) as AndroidState | undefined;
      if (a && a.status !== 'lost') a.integrity = TUNING.integrity.resetTo;
    }
    run.pendingResets = [];
    let atStation = false;
    if (node.type === 'checkpoint') {
      checkpointStress(run);
      let result = runCheckpointBots(run, 'human', rng.int(0, 1_000_000)).result;
      if (result === 'papers' && run.resources.papers > 0) {
        run.resources.papers -= 1;
        result = 'pass';
      }
      if (result === 'pass') {
        run.stats.checkpointsPassed += 1;
        line('passed the checkpoint');
      } else {
        applyBustCost(run);
        const end = stop(
          playStop(stopConfigForRun(run, { bust: true }), 'cautious', rng.int(0, 1e6)),
          node.name,
        );
        if (end) return done(end);
        line('busted, and got through the gate');
      }
    } else if (node.type === 'station') {
      if (withRng(run, (r) => rollCompromised(run.heat, r))) {
        const cfg = stopConfigForRun(run, { compromised: true });
        const end = stop(playStop(cfg, 'cautious', rng.int(0, 1e6)), node.name);
        if (end) return done(end);
        line('compromised: took the bag and left');
      } else {
        atStation = true;
        stationCare(run.party);
        const used = new Set<StationTrade>();
        if (run.resources.papers === 0 && canTrade(run.resources, 'partsForPapers', used))
          applyTrade(run.resources, 'partsForPapers');
        withRng(run, (r) => juneLeavesAtStation(run.party, r));
        line('the keeper took them in');
      }
    } else {
      const end = stop(playStop(stopConfigForRun(run), 'cautious', rng.int(0, 1e6)), node.name);
      if (end) return done(end);
      const r = run.resources;
      line(
        `Cells ${Math.round(r.cells)} car ${Math.round(r.carBattery)} Parts ${r.parts} Papers ${r.papers}`,
      );
    }
    if (allAndroidsLost(run)) return done('lost');
    sensibleCamp(run, atStation, rng, { car: 30, battery: 45, restBelow: 60 });
    const conv = pickCampConversation(run, rng);
    if (conv) campEffects(run, conv.effects, rng);
    endLeg(run, atStation);
    if (allAndroidsLost(run)) return done('lost');
    if (missedTheShip(run)) return done('missed');
  }
  return done('missed');
}
