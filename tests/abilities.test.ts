/**
 * Every ability and tell (spec §9.2–9.5): Soothe, Heave, Takedown, Patch; Wren's warmth, Brick's weight,
 * Vesper's threat assessment; Vesper's combo and quick dash; June's legal kiosk; low power.
 */
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/content/tuning';
import { DEPOT_A } from '../src/content/layouts/depot';
import { TEST_LOT } from '../src/content/layouts/test';
import type { MemberId, PlayerIntent, Slot } from '../src/core/types';
import { emptyIntent } from '../src/input/intents';
import { newJune, startingParty, startingResources } from '../src/run/party';
import { abilityReady, searchTime } from '../src/sim/actions';
import type { NpcRole } from '../src/sim/layout';
import { newNpc } from '../src/sim/npc';
import { StopSim, type StopConfig } from '../src/sim/stop';
import type { MemberActor, NpcActor } from '../src/sim/types';

function cfg(over: Partial<StopConfig> = {}): StopConfig {
  return {
    layout: TEST_LOT,
    seed: 5,
    region: 'newengland',
    weather: 'clear',
    heat: 0,
    day: 3,
    party: startingParty(),
    control: { 0: 'wren', 1: null },
    resources: startingResources(),
    noPatrol: true,
    ...over,
  };
}

function intent(extra: Partial<PlayerIntent> = {}, mx = 0, my = 0): PlayerIntent {
  const it = emptyIntent();
  it.move.x = mx;
  it.move.y = my;
  return Object.assign(it, extra);
}

function run(
  sim: StopSim,
  ticks: number,
  f: (t: number) => Partial<Record<Slot, PlayerIntent | null>>,
): void {
  for (let t = 0; t < ticks; t++) sim.step(f(t));
}

function place(sim: StopSim, id: MemberId, x: number, y: number, facing = 0): MemberActor {
  const m = sim.member(id)!;
  m.x = x;
  m.y = y;
  m.vx = 0;
  m.vy = 0;
  m.facing = facing;
  return m;
}

/** A person who stands still (a mechanic with no bench) facing `facing`; never a sympathizer. */
function addNpc(sim: StopSim, x: number, y: number, facing: number, role: NpcRole = 'mechanic'): NpcActor {
  const n = newNpc(sim, role, x, y);
  n.facing = facing;
  n.obs.sympathizer = false;
  sim.npcs.push(n);
  return n;
}

const EAST = 0;
const WEST = Math.PI;

describe('Wren (spec §9.2)', () => {
  it('Soothe: the nearest human within 4 m loses 40 awareness of everyone and ignores the party for 8 s', () => {
    const sim = new StopSim(cfg());
    const w = place(sim, 'wren', 18.5, 9.5);
    const n = addNpc(sim, 20.5, 9.5, WEST);
    n.obs.awareness.wren = 50;
    n.obs.awareness.brick = 30;
    sim.step({ 0: intent({ ability: true }) });
    expect(n.obs.awareness.wren).toBeLessThanOrEqual(10 + 1);
    expect(n.obs.awareness.brick).toBe(0);
    expect(n.ignoreT).toBeGreaterThan(TUNING.abilities.soothe.ignoreSeconds - 0.1);
    expect(w.abilityCd).toBeGreaterThan(TUNING.abilities.soothe.cooldown - 0.1);
  });

  it('Soothe is unusable while Wren herself is Suspicious or worse', () => {
    const sim = new StopSim(cfg());
    const w = sim.member('wren')!;
    w.suspicion = TUNING.awareness.suspicious;
    expect(abilityReady(sim, w)).toBe('Too suspicious');
  });

  it("her Blends work 30% better than anyone else's", () => {
    expect(TUNING.blend.wrenMult).toBeCloseTo(1.3);
  });

  it('unblinking warmth: still within 3 m of a human for over 3 s, her stillness builds at double rate', () => {
    const near = new StopSim(cfg());
    place(near, 'wren', 18.5, 9.5);
    addNpc(near, 20.5, 9.5, WEST);
    const far = new StopSim(cfg());
    place(far, 'wren', 18.5, 9.5);
    run(near, 60 * 3.5, () => ({ 0: intent() }));
    run(far, 60 * 3.5, () => ({ 0: intent() }));
    const wn = near.member('wren')!;
    const wf = far.member('wren')!;
    expect(wn.rate).toBeGreaterThan(0);
    expect(wf.rate).toBe(0);
    run(near, 60 * 1.5, () => ({ 0: intent() }));
    run(far, 60 * 1.5, () => ({ 0: intent() }));
    expect(wn.rate).toBeGreaterThan(wf.rate * 1.9);
  });
});

describe('Brick (spec §9.3)', () => {
  it('searches lockers and bins 50% faster, and pries open locked containers', () => {
    const sim = new StopSim(cfg({ layout: DEPOT_A, control: { 0: 'brick', 1: null } }));
    const locker = sim.containers.find((c) => c.kind === 'locker')!;
    const b = sim.member('brick')!;
    const w = sim.member('wren')!;
    expect(searchTime(b, locker)).toBeCloseTo(searchTime(w, locker) / TUNING.search.brickSpeedMult);
  });

  it('Heave shoves a vending machine one tile, blocking it for 15 s, then it goes home', () => {
    const sim = new StopSim(cfg({ layout: DEPOT_A, control: { 0: 'brick', 1: null } }));
    const h = sim.heavies[0];
    expect(h).toBeDefined();
    // Stand on a free side of the machine, facing it, with a free tile beyond.
    const sides: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const side = sides.find(
      ([dx, dy]) => sim.grid.walkable(h.tx + dx, h.ty + dy) && sim.grid.walkable(h.tx - dx, h.ty - dy),
    )!;
    expect(side).toBeDefined();
    const facing = Math.atan2(-side[1], -side[0]);
    place(sim, 'brick', h.tx + side[0] + 0.5, h.ty + side[1] + 0.5, facing);
    const tx = h.tx;
    const ty = h.ty;
    sim.step({ 0: intent({ ability: true }) });
    expect([h.tx, h.ty]).toEqual([tx - side[0], ty - side[1]]);
    expect(h.blockedT).toBeGreaterThan(TUNING.abilities.heave.blockSeconds - 0.1);
    expect(sim.grid.walkable(h.tx, h.ty)).toBe(false);
  });

  it('Heave bashes a locked container open instantly, loudly', () => {
    const sim = new StopSim(cfg({ layout: DEPOT_A, control: { 0: 'brick', 1: null } }));
    const c = sim.containers.find((k) => k.kind === 'locker')!;
    c.locked = true;
    const b = place(sim, 'brick', c.access.x, c.access.y, Math.atan2(c.cy - c.access.y, c.cx - c.access.x));
    const heard: number[] = [];
    const orig = sim.noise.bind(sim);
    sim.noise = (x, y, r, level, member) => {
      heard.push(r);
      orig(x, y, r, level, member);
    };
    sim.step({ 0: intent({ ability: true }) });
    expect(c.searched).toBe(true);
    expect(heard).toContain(TUNING.abilities.heave.bashHearing);
    expect(b.abilityCd).toBeGreaterThan(0);
  });

  it('his footsteps carry 3 m walking and 9 m running', () => {
    const sim = new StopSim(cfg({ control: { 0: 'brick', 1: null } }));
    place(sim, 'brick', 18.5, 9.5);
    const heard: number[] = [];
    const orig = sim.noise.bind(sim);
    sim.noise = (x, y, r, level, member) => {
      heard.push(r);
      orig(x, y, r, level, member);
    };
    run(sim, 60, () => ({ 0: intent({}, 0.7, 0) }));
    expect(heard).toContain(TUNING.tells.brickWalkHearing);
    heard.length = 0;
    run(sim, 60, () => ({ 0: intent({ sprint: true }, -1, 0) }));
    expect(heard).toContain(TUNING.tells.brickSprintHearing);
  });

  it('sitting on a stool or chair breaks it (+25 for anyone who sees it); booths are safe', () => {
    const diner = new StopSim(cfg({ layout: STOOL_LOT, control: { 0: 'brick', 1: null } }));
    const b = place(diner, 'brick', 3.5, 2.5);
    diner.step({ 0: intent({ blendTap: true }) });
    expect(b.mode).toBe('free');
    expect(b.blend).toBeNull();
    const booth = new StopSim(cfg({ layout: STOOL_LOT, control: { 0: 'brick', 1: null } }));
    const b2 = place(booth, 'brick', 9.5, 2.5);
    booth.step({ 0: intent({ blendTap: true }) });
    expect(b2.mode).toBe('blend');
    expect(b2.blend).toBe('sit');
  });
});

/** A small room with a chair (c) and a booth (b) for the stool test. */
const STOOL_LOT = {
  ...TEST_LOT,
  id: 'stool-lot',
  grid: [
    '##############################',
    '#............#,,,,,,,,,,,,,,,#',
    '#...c.....b..#,,,,,,,,,,,,,,,#',
    '#............D,,,,,,,,,,,,,,,#',
    '#............#,,,,,,,,,,,,,,,#',
    '#............#,,,,,,,,,,,,,,,#',
    '######W#W#####,,,,,,,,,,,,,,,#',
    ',,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
    ',,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
    ',,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
    'XXXX,,,,,,,,,,,,,,,,,,,,,,,,,#',
    'XXXX,,,,,,,,,,,,,,,,,,,,,,,,,#',
    'XXXX,,,,,,,,,,,,,,,,,,,,,,,,,,',
    ',,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
  ],
};

describe('Vesper (spec §9.4)', () => {
  it('Takedown knocks out an unaware human within 1.5 m', () => {
    const sim = new StopSim(cfg({ control: { 0: 'vesper', 1: null } }));
    const n = addNpc(sim, 20.5, 9.5, EAST);
    const v = place(sim, 'vesper', 19.3, 9.5, EAST);
    sim.step({ 0: intent({ ability: true }) });
    expect(n.mode).toBe('ko');
    expect(v.abilityCd).toBeGreaterThan(TUNING.abilities.takedown.cooldown - 0.1);
  });

  it('Takedown works on an aware human only from behind', () => {
    const front = new StopSim(cfg({ control: { 0: 'vesper', 1: null } }));
    const n1 = addNpc(front, 20.5, 9.5, WEST);
    n1.obs.state = 'suspicious';
    place(front, 'vesper', 19.3, 9.5, EAST);
    front.step({ 0: intent({ ability: true }) });
    expect(n1.mode).not.toBe('ko');
    const back = new StopSim(cfg({ control: { 0: 'vesper', 1: null } }));
    const n2 = addNpc(back, 20.5, 9.5, EAST);
    n2.obs.state = 'suspicious';
    place(back, 'vesper', 19.3, 9.5, EAST);
    back.step({ 0: intent({ ability: true }) });
    expect(n2.mode).toBe('ko');
  });

  it('anyone who finds the body becomes Alarmed (ALERT)', () => {
    const sim = new StopSim(cfg({ control: { 0: 'vesper', 1: null } }));
    const n = addNpc(sim, 20.5, 9.5, EAST);
    place(sim, 'vesper', 19.3, 9.5, EAST);
    sim.step({ 0: intent({ ability: true }) });
    expect(n.mode).toBe('ko');
    place(sim, 'vesper', 26.5, 12.5, EAST);
    const finder = addNpc(sim, 24.5, 9.5, WEST);
    run(sim, 30, () => ({ 0: intent() }));
    expect(finder.obs.state).toBe('alarmed');
    expect(sim.alert.on).toBe(true);
  });

  it('threat assessment: her head snaps toward a human within 5 m (+10); the party AI keeps her composed', () => {
    const player = new StopSim(cfg({ control: { 0: 'vesper', 1: null } }));
    const v = place(player, 'vesper', 18.5, 9.5);
    addNpc(player, 21.5, 9.5, WEST);
    player.step({ 0: intent() });
    expect(v.headSnapT).toBeGreaterThan(0);
    const ai = new StopSim(cfg());
    const va = place(ai, 'vesper', 18.5, 9.5);
    addNpc(ai, 21.5, 9.5, WEST);
    ai.step({ 0: intent() });
    expect(va.headSnapT).toBe(0);
  });

  it('parade rest: idle, her stillness builds 25% faster', () => {
    const sv = new StopSim(cfg({ control: { 0: 'vesper', 1: null } }));
    place(sv, 'vesper', 18.5, 9.5);
    const sb = new StopSim(cfg({ control: { 0: 'brick', 1: null } }));
    place(sb, 'brick', 18.5, 9.5);
    run(sv, 60 * 5, () => ({ 0: intent() }));
    run(sb, 60 * 5, () => ({ 0: intent() }));
    const v = sv.member('vesper')!;
    const b = sb.member('brick')!;
    expect(v.rate).toBeCloseTo(b.rate * TUNING.tells.vesperStillMult, 1);
  });

  it('fights best: a three-hit combo and a dash that recharges 30% faster', () => {
    expect(TUNING.combat.vesperComboHits).toBe(3);
    const sim = new StopSim(cfg({ control: { 0: 'vesper', 1: null } }));
    const v = place(sim, 'vesper', 18.5, 9.5);
    sim.step({ 0: intent({ dash: true }, 1, 0) });
    expect(v.dashCd).toBeCloseTo(TUNING.movement.dashCooldown * TUNING.combat.vesperDashRecharge, 1);
    const sw = new StopSim(cfg());
    const w = place(sw, 'wren', 18.5, 9.5);
    sw.step({ 0: intent({ dash: true }, 1, 0) });
    expect(w.dashCd).toBeGreaterThan(v.dashCd);
  });
});

describe('June (spec §9.5)', () => {
  const withJune = (): StopConfig =>
    cfg({ party: [...startingParty(), newJune()], control: { 0: 'june', 1: null } });

  it('Patch repairs 20 Skin (or Hull) on an adjacent android over 4 s, with no suspicion and no Parts', () => {
    const sim = new StopSim(withJune());
    const j = place(sim, 'june', 18.5, 9.5);
    const w = place(sim, 'wren', 19.5, 9.5);
    if (w.state.kind !== 'android') throw new Error('android expected');
    w.state.skin = 50;
    const parts = sim.resources.parts;
    sim.step({ 0: intent({ ability: true }) });
    let maxRate = 0;
    run(sim, 60 * (TUNING.abilities.patch.seconds + 0.5), () => {
      maxRate = Math.max(maxRate, j.rate);
      return { 0: intent({ interactHeld: true }) };
    });
    expect(w.state.skin).toBeCloseTo(50 + TUNING.abilities.patch.amount, 0);
    expect(maxRate).toBe(0);
    expect(sim.resources.parts).toBe(parts);
    expect(j.abilityCd).toBeGreaterThan(TUNING.abilities.patch.cooldown - 5);
  });

  it('uses ID kiosks legally: no suspicion, no Papers, but every session is logged', () => {
    const sim = new StopSim(withJune());
    const sd = new StopSim({ ...withJune(), layout: DEPOT_A });
    void sim;
    const k = sd.kiosks[0];
    const j = place(sd, 'june', k.x, k.y + 1);
    const papers = sd.resources.papers;
    run(sd, 90, () => ({ 0: intent({ interact: true, interactHeld: true }) }));
    expect(sd.juneKioskUses).toBe(1);
    expect(sd.credits).toBeGreaterThan(0);
    expect(sd.resources.papers).toBe(papers);
    expect(j.rate).toBe(0);
  });

  it('has no tells and no dash', () => {
    const sim = new StopSim(withJune());
    const j = place(sim, 'june', 18.5, 9.5);
    addNpc(sim, 20.5, 9.5, WEST);
    run(sim, 60 * 6, () => ({ 0: intent() }));
    expect(j.rate).toBe(0);
    sim.step({ 0: intent({ dash: true }, 1, 0) });
    expect(j.mode).not.toBe('dash');
  });
});

describe('low power (spec §9.1)', () => {
  it('below 15 Battery: half speed, no sprint, no dash, no ability', () => {
    const party = startingParty();
    const w0 = party[0];
    if (w0.kind !== 'android') throw new Error('android expected');
    w0.battery = 10;
    const sim = new StopSim(cfg({ party }));
    const w = place(sim, 'wren', 16.5, 9.5);
    sim.step({ 0: intent() });
    expect(w.lowPower).toBe(true);
    expect(abilityReady(sim, w)).toBe('Low battery');
    const x0 = w.x;
    run(sim, 60, () => ({ 0: intent({ sprint: true }, 1, 0) }));
    expect(w.x - x0).toBeLessThan(TUNING.movement.briskSpeed * TUNING.movement.lowPowerSpeedMult + 0.2);
    sim.step({ 0: intent({ dash: true }, 1, 0) });
    expect(w.mode).not.toBe('dash');
  });
});
