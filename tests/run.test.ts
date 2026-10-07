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
