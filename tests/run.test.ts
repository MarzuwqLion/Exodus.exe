/** Run-level systems (spec §9.5 June, §11.6 Heat, §12): pure functions over party and resources. */
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/content/tuning';
import { Rng } from '../src/core/rng';
import type { MemberState } from '../src/core/types';
import {
  activeJune,
  adjustTrust,
  juneCamp,
  juneLeavesAtStation,
  juneLeg,
  kioskHeat,
  recruitJune,
  stationRevealColumns,
} from '../src/run/june';
import { juneOf, startingParty, startingResources } from '../src/run/party';
import { ROAD_EVENTS } from '../src/content/events';
import type { AndroidState } from '../src/core/types';
import {
  longRest,
  moveCells,
  patchSkin,
  pickCampConversation,
  repairHull,
  reviveCarried,
} from '../src/run/camp';
import { answerDelta, checkpointResult, startCheckpoint, startingSuspicion } from '../src/run/checkpoint';
import { choiceAvailable, eligibleEvents, pickEvent, resolveChoice } from '../src/run/events';
import {
  addRumor,
  currentNode,
  generateMap,
  nextNodes,
  revealAhead,
  rumorMods,
  shownType,
  validateMap,
} from '../src/run/map';
import { MemoryStore, defaultSave, loadSave, writeSave } from '../src/core/save';
import {
  addHeat,
  applyPortOutcome,
  applyStopOutcome,
  beginLeg,
  endLeg,
  missedTheShip,
  newRun,
} from '../src/run/run';
import type { StopOutcome } from '../src/sim/types';

function withJune(trust = 50): MemberState[] {
  const party = startingParty();
  expect(recruitJune(party, trust)).toBe(true);
  return party;
}

describe('June (spec §9.5)', () => {
  it('joins once, with the Trust the event gives, and only if the car has room', () => {
    const party = withJune(65);
    expect(juneOf(party)?.trust).toBe(65);
    expect(recruitJune(party, 50)).toBe(false);
    expect(party).toHaveLength(4);
  });

  it('gets hungrier each leg and eats a Ration at camp (free at a Station)', () => {
    const party = withJune();
    const j = activeJune(party)!;
    const h0 = j.hunger;
    juneLeg(party);
    expect(j.hunger).toBe(h0 + TUNING.run.juneHungerPerLeg);
    const res = startingResources();
    res.rations = 1;
    const meal = juneCamp(party, res, false);
    expect(meal.ate).toBe(true);
    expect(res.rations).toBe(0);
    expect(j.hunger).toBe(Math.max(0, h0 + TUNING.run.juneHungerPerLeg - TUNING.run.rationHunger));
    j.hunger = 60;
    const free = juneCamp(party, res, true);
    expect(free.ate).toBe(true);
    expect(res.rations).toBe(0);
    expect(j.hunger).toBe(60 - TUNING.run.rationHunger);
  });

  it("starving costs Health; at 0 Health she leaves to find help (she doesn't die)", () => {
    const party = withJune();
    const j = activeJune(party)!;
    const res = startingResources();
    res.rations = 0;
    j.hunger = 100;
    j.health = TUNING.run.juneStarveHealth * 2;
    expect(juneCamp(party, res, false)).toEqual({ ate: false, starving: true, left: false });
    expect(j.health).toBe(TUNING.run.juneStarveHealth);
    expect(juneCamp(party, res, false).left).toBe(true);
    expect(j.status).toBe('left');
    expect(activeJune(party)).toBeUndefined();
  });

  it('Trust moves with events, stays within 0–100, and below 20 she may leave at a Station', () => {
    const party = withJune(30);
    adjustTrust(party, -50);
    expect(activeJune(party)!.trust).toBe(0);
    adjustTrust(party, 15);
    const rng = new Rng(3);
    let left = false;
    for (let i = 0; i < 20 && !left; i++) left = juneLeavesAtStation(party, rng);
    expect(left).toBe(true);
    const happy = withJune(80);
    for (let i = 0; i < 50; i++) expect(juneLeavesAtStation(happy, rng)).toBe(false);
  });

  it('every two logged kiosk sessions add 1 Heat', () => {
    expect(kioskHeat(0, 1)).toBe(0);
    expect(kioskHeat(1, 2)).toBe(1);
    expect(kioskHeat(0, 4)).toBe(2);
    expect(kioskHeat(3, 4)).toBe(1);
  });

  it('as a conductor she reveals Stations two columns ahead instead of one', () => {
    expect(stationRevealColumns(startingParty())).toBe(1);
    expect(stationRevealColumns(withJune())).toBe(2);
  });
});

describe('the map (spec §12.2)', () => {
  it('every generated map is valid: Boston to the Port, checkpoints at 4 and 8, three Stations, no crossings', () => {
    for (let seed = 0; seed < 500; seed++) expect(validateMap(generateMap(seed)), `seed ${seed}`).toEqual([]);
  });

  it('is the same for the same seed', () => {
    expect(JSON.stringify(generateMap(42))).toBe(JSON.stringify(generateMap(42)));
  });

  it('a Station looks ordinary until the party is a column away (two with June)', () => {
    const run = newRun(9);
    const stations = run.map.nodes.filter((n) => n.type === 'station');
    for (const s of stations) {
      expect(shownType(s) === 'station').toBe(s.revealed);
      if (s.column > 1) expect(s.revealed).toBe(false);
    }
    const s = stations.find((x) => x.column > 2)!;
    const before = run.map.nodes.find((n) => n.column === s.column - 1)!;
    run.map.current = before.id;
    revealAhead(run.map, run.party);
    expect(s.revealed).toBe(true);
    expect(shownType(s)).toBe('station');
    // With June, two columns ahead.
    const run2 = newRun(9);
    recruitJune(run2.party, 50);
    const twoBefore = run2.map.nodes.find((n) => n.column === s.column - 2)!;
    run2.map.current = twoBefore.id;
    revealAhead(run2.map, run2.party);
    expect(run2.map.nodes.find((n) => n.id === s.id)!.revealed).toBe(true);
  });

  it('rumors change the stops they are about', () => {
    const run = newRun(3);
    const node = run.map.nodes.find((n) => n.column === 2 && n.type !== 'station')!;
    addRumor(run.rumors, 'cells-cache', node);
    addRumor(run.rumors, 'sympathetic-staff', node);
    expect(rumorMods(run.rumors, node.id).sort()).toEqual(['cellsCache', 'sympatheticStaff']);
    expect(addRumor(run.rumors, 'cells-cache', node)).toBeNull();
  });
});

describe('the sailing clock and legs (spec §12.3, §12.4)', () => {
  it('a leg costs a day, its distance in car battery, and the tuned Battery per android', () => {
    const run = newRun(5);
    const to = nextNodes(run.map)[0];
    const car = run.resources.carBattery;
    const bat = (run.party[0] as AndroidState).battery;
    const plan = beginLeg(run, to.id);
    expect(plan.walking).toBe(false);
    expect(run.day).toBe(2);
    expect(run.leg).toBe(1);
    expect(run.resources.carBattery).toBe(car - to.distance);
    expect((run.party[0] as AndroidState).battery).toBe(bat - TUNING.battery.perLeg);
  });

  it('without enough charge the party walks: 15 Battery each and a day extra', () => {
    const run = newRun(5);
    run.resources.carBattery = 3;
    const to = nextNodes(run.map)[0];
    const bat = (run.party[0] as AndroidState).battery;
    const plan = beginLeg(run, to.id);
    expect(plan.walking).toBe(true);
    expect(plan.event).toBe(false);
    expect(run.day).toBe(3);
    expect(run.resources.carBattery).toBe(3);
    expect((run.party[0] as AndroidState).battery).toBe(bat - TUNING.battery.walkPerLeg);
  });

  it('with no delays the party reaches the Port on Day 11 (3 days of slack)', () => {
    const run = newRun(8);
    while (currentNode(run.map).type !== 'port') {
      run.resources.carBattery = 100;
      beginLeg(run, nextNodes(run.map)[0].id);
    }
    expect(run.day).toBe(11);
    expect(missedTheShip(run)).toBe(false);
  });

  it('Day 14 anywhere but the Port: the ship has sailed', () => {
    const run = newRun(8);
    run.day = 13;
    run.resources.carBattery = 100;
    beginLeg(run, nextNodes(run.map)[0].id);
    expect(missedTheShip(run)).toBe(true);
  });
});

function outcome(run: ReturnType<typeof newRun>, over: Partial<StopOutcome> = {}): StopOutcome {
  return {
    end: 'left',
    seconds: 100,
    alert: false,
    resources: { ...run.resources },
    party: run.party,
    carried: [],
    lost: [],
    juneArrested: false,
    knockouts: 0,
    juneKioskUses: 0,
    cellsGathered: 10,
    rumorsSeen: 0,
    aboard: [],
    resetsResolved: [],
    flagsSet: [],
    ...over,
  };
}

describe('Heat (spec §11.6)', () => {
  it('rises with ALERT and knockouts, decays a little each quiet leg, more at a Station, and caps at 3', () => {
    const run = newRun(4);
    applyStopOutcome(run, outcome(run, { alert: true, knockouts: 2 }), 'Quincy');
    expect(run.heat).toBe(TUNING.heat.alert + 2 * TUNING.heat.knockout);
    endLeg(run, false);
    expect(run.heat).toBe(2);
    run.alertThisLeg = false; // a new leg
    applyStopOutcome(run, outcome(run), 'Quincy');
    endLeg(run, true);
    expect(run.heat).toBe(2 - TUNING.heat.decayPerLeg - TUNING.heat.stationDecay);
    addHeat(run, 10);
    expect(run.heat).toBe(TUNING.heat.max);
  });

  it("every two of June's logged kiosk sessions add 1 Heat", () => {
    const run = newRun(4);
    applyStopOutcome(run, outcome(run, { juneKioskUses: 2 }), 'Quincy');
    expect(run.heat).toBe(1);
  });

  it('an android still at 0 Battery when camp ends is lost; one at 0 Integrity resets at the next stop', () => {
    const run = newRun(4);
    const [w, b] = run.party as AndroidState[];
    w.battery = 0;
    b.integrity = 0;
    const r = endLeg(run, false);
    expect(r.deadBattery).toEqual(['wren']);
    expect(w.status).toBe('lost');
    expect(run.pendingResets).toEqual(['brick']);
  });
});

describe('camp (spec §12.5)', () => {
  it('Cells move to the car or an android in steps of 5, and back', () => {
    const run = newRun(1);
    run.resources.cells = 23;
    run.resources.carBattery = 90;
    expect(moveCells(run, 'car', 20)).toBe(10);
    expect(run.resources.carBattery).toBe(100);
    expect(run.resources.cells).toBe(13);
    const w = run.party[0] as AndroidState;
    w.battery = 50;
    expect(moveCells(run, 'wren', 7)).toBe(5);
    expect(w.battery).toBe(55);
    expect(moveCells(run, 'wren', -10)).toBe(-10);
    expect(w.battery).toBe(45);
    expect(run.resources.cells).toBe(18);
  });

  it('Parts repair Hull, patches restore Skin, 2 Parts revive a carried unit', () => {
    const run = newRun(1);
    const [w, b] = run.party as AndroidState[];
    w.hull = 50;
    w.skin = 40;
    expect(repairHull(run, 'wren')).toBe(true);
    expect(w.hull).toBe(75);
    expect(patchSkin(run, 'wren')).toBe(true);
    expect(w.skin).toBe(75);
    b.status = 'shutdown';
    b.hull = 0;
    run.carried = ['brick'];
    run.resources.parts = 2;
    expect(reviveCarried(run, 'brick')).toBe(true);
    expect(b.status).toBe('active');
    expect(b.hull).toBe(TUNING.shutdown.reviveHull);
    expect(run.resources.parts).toBe(0);
  });

  it('a long rest: +15 Integrity, +10 Hull, and a day (not at a Station)', () => {
    const run = newRun(1);
    const w = run.party[0] as AndroidState;
    w.integrity = 50;
    w.hull = 50;
    longRest(run, false);
    expect(w.integrity).toBe(65);
    expect(w.hull).toBe(60);
    expect(run.day).toBe(2);
    longRest(run, true);
    expect(run.day).toBe(2);
  });

  it('a camp conversation fits the party, and unheard ones come first', () => {
    const run = newRun(1);
    const rng = new Rng(4);
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const c = pickCampConversation(run, rng)!;
      expect(c.requires.every((id) => run.party.some((m) => m.id === id))).toBe(true);
      expect(seen.has(c.id)).toBe(false);
      seen.add(c.id);
    }
  });
});

describe('road events (spec §12.7)', () => {
  it('only events that fit the leg can fire, and once-per-run events fire once', () => {
    const run = newRun(2);
    run.resources.carBattery = 100;
    beginLeg(run, nextNodes(run.map)[0].id);
    const node = currentNode(run.map);
    for (const e of eligibleEvents(run)) {
      if (e.regions) expect(e.regions).toContain(node.region);
      const [lo, hi] = e.columns ?? [1, 9];
      expect(node.column).toBeGreaterThanOrEqual(lo);
      expect(node.column).toBeLessThanOrEqual(hi);
    }
    const picked = pickEvent(run, new Rng(3))!;
    if (picked.event.oncePerRun) expect(eligibleEvents(run).map((e) => e.id)).not.toContain(picked.event.id);
  });

  it('choices need their members and resources; outcomes apply their effects', () => {
    const run = newRun(2);
    const kid = ROAD_EVENTS.find((e) => e.id === 'kid-at-the-pump')!;
    const kneel = kid.choices.find((c) => c.requires?.member === 'wren')!;
    expect(choiceAvailable(run, kneel)).toBe(true);
    (run.party[0] as AndroidState).status = 'lost';
    expect(choiceAvailable(run, kneel)).toBe(false);
    const conductor = ROAD_EVENTS.find((e) => e.id === 'the-conductor')!;
    resolveChoice(run, new Rng(1), conductor.choices[0], { featured: null });
    expect(run.party.some((m) => m.id === 'june' && m.status === 'active')).toBe(true);
    expect(run.stats.juneFate).toBe('with-party');
  });
});

describe('checkpoints (spec §11.1–11.2)', () => {
  it('answers: Robotic +20, Wrong +25, Human −10, soothing −20; too fast (under 0.7 s) and too slow (over 6 s) cost more', () => {
    expect(answerDelta('human', 2)).toBe(-10);
    expect(answerDelta('robotic', 2)).toBe(20);
    expect(answerDelta('wrong', 2)).toBe(25);
    expect(answerDelta('soothing', 2)).toBe(-20);
    expect(answerDelta('human', 0.3)).toBe(-10 + TUNING.checkpoint.tooFastPenalty);
    expect(answerDelta('human', 7)).toBe(-10 + TUNING.checkpoint.tooSlowPenalty);
  });

  it('two questions per android, one fewer for the one June vouches for; only Wren gets soothing answers', () => {
    const run = newRun(6);
    const s = startCheckpoint(run, new Rng(2));
    expect(s.questions).toHaveLength(6);
    expect(new Set(s.questions.map((q) => q.question.id)).size).toBe(6);
    for (const q of s.questions) if (q.member !== 'wren') expect(q.answers).not.toContain('soothing');
    recruitJune(run.party, 50);
    const v = startCheckpoint(run, new Rng(2), 'brick');
    expect(v.vouched).toBe('brick');
    expect(v.questions.filter((q) => q.member === 'brick')).toHaveLength(1);
  });

  it('the guard starts warier with Heat and late in the run; the meter decides it', () => {
    expect(startingSuspicion(0, 3)).toBe(0);
    expect(startingSuspicion(2, 3)).toBe(20);
    expect(startingSuspicion(0, 10)).toBe(6);
    expect(checkpointResult(69)).toBe('pass');
    expect(checkpointResult(70)).toBe('papers');
    expect(checkpointResult(100)).toBe('bust');
  });
});

describe('saving and continuing (spec §12.1)', () => {
  it('a run mid-way survives the save slot and continues exactly as it would have', () => {
    const run = newRun(12);
    recruitJune(run.party, 60);
    for (let i = 0; i < 3; i++) {
      run.resources.carBattery = 100;
      beginLeg(run, nextNodes(run.map)[0].id);
      applyStopOutcome(run, outcome(run, { alert: i === 1 }), currentNode(run.map).id);
      endLeg(run, false);
    }
    addRumor(run.rumors, 'patrols', nextNodes(run.map)[0]);
    const store = new MemoryStore();
    const data = defaultSave();
    data.run = run;
    expect(writeSave(store, data)).toBe(true);
    const loaded = loadSave(store);
    expect(loaded.message).toBeNull();
    const back = loaded.data.run!;
    expect(back).toEqual(run);
    // The seeded stream continues where it left off.
    for (const r of [run, back]) {
      r.resources.carBattery = 100;
      beginLeg(r, nextNodes(r.map)[0].id);
    }
    expect(back).toEqual(run);
  });
});

describe('the Port outcome (spec §11.5)', () => {
  it('whoever is aboard sails; anyone left on the quay is lost', () => {
    const run = newRun(4);
    recruitJune(run.party, 60);
    const out = outcome(run, { aboard: ['wren', 'june'], end: 'left' });
    const sailed = applyPortOutcome(run, out);
    expect(sailed).toEqual(['wren', 'june']);
    expect(run.party.find((m) => m.id === 'brick')!.status).toBe('lost');
    expect(run.party.find((m) => m.id === 'vesper')!.status).toBe('lost');
    expect(run.stats.unitsLost).toBe(2);
    expect(run.stats.lostLog.map((l) => l.how)).toEqual(['left on the quay', 'left on the quay']);
    expect(run.stats.juneFate).toBe('sailed');
    expect(run.phase).toBe('voyage');
  });

  it('June left ashore stays behind', () => {
    const run = newRun(4);
    recruitJune(run.party, 60);
    const sailed = applyPortOutcome(run, outcome(run, { aboard: ['wren', 'brick', 'vesper'] }));
    expect(sailed).toEqual(['wren', 'brick', 'vesper']);
    expect(run.stats.juneFate).toBe('left');
  });
});
