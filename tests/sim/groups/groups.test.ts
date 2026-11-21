import type { Group } from '../../../src/sim/systems/groups/group';
import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/sim/core/simulation';
import type { GameData } from '../../../src/sim/core/game-data';
import { scission, tribeRelations } from '../../../src/sim/systems/groups/tribes';
import { GROUP_EVENTS } from '../../../src/sim/systems/groups/texts';
import { regimeFit, groupFactors } from '../../../src/sim/systems/groups/power';
import { LEVEL_COUNT } from '../../../src/sim/systems/groups/params';
import { dataWithSize } from '../world/helpers';

const SIZE = 320;

function world(seed = 42, change?: (data: GameData) => void): Simulation {
  const data = dataWithSize(SIZE);
  change?.(data);
  return new Simulation(seed, data);
}

function day(simulation: Simulation, days = 1): void {
  simulation.step(days * simulation.data.time.ticksPerDay);
}

describe('groups at the start', () => {
  it('the starting tribe is a level-0 group with households, a regime that suits a small band, and leaders', () => {
    const simulation = world();
    const { groups } = simulation;
    const tribes = groups.tribes();
    expect(tribes).toHaveLength(1);
    const tribe = tribes[0]!;
    expect(tribe.members).toHaveLength(simulation.humans.people.count);
    expect(['band', 'elders', 'chiefdom']).toContain(simulation.data.groups.regimes[tribe.regime]!.id);
    expect(tribe.leaders.length).toBeGreaterThan(0);
    expect(tribe.name).toMatch(/^la tribu des [A-Z]/);
    const families = groups.groups.filter((group) => group.level === 2 && group.alive);
    expect(families.length).toBeGreaterThan(3);
    // Nobody belongs to two households; everyone has a tribe and a household; no clan yet.
    for (let p = 0; p < simulation.humans.people.count; p++) {
      expect(groups.groupOf(p, 0)).toBe(tribe);
      expect(groups.groupOf(p, 2)).not.toBeNull();
      expect(groups.groupOf(p, 1)).toBeNull();
      expect(families.filter((family) => family.members.includes(p))).toHaveLength(1);
    }
    const founded = simulation.journal.all().find((event) => event.type === GROUP_EVENTS.founded);
    expect(founded?.text).toMatch(/se forme/);
    expect(simulation.journal.all().some((event) => event.type === GROUP_EVENTS.leader && event.causes.includes(founded!.id))).toBe(true);
  });

  it('regimes needing religion, writing, trade, a territory or war cannot appear yet', () => {
    const simulation = world();
    const tribe = simulation.groups.tribes()[0]!;
    const factors = groupFactors(simulation.groups, tribe);
    for (const regime of simulation.data.groups.regimes) {
      if (regime.requires.length > 0) expect(regimeFit(regime, 0, factors)).toBe(-Infinity);
    }
  });
});

describe('group life', () => {
  it('births join the tribe and the household of whoever raises them', () => {
    const simulation = world(7);
    day(simulation, 120);
    const { groups, humans } = simulation;
    const guardian = humans.life.state.guardian;
    for (let p = humans.startingCount; p < humans.people.count; p++) {
      // Born since this morning's group life: they will be counted tomorrow.
      if (humans.people.alive[p] === 0 || humans.life.state.birthDay[p] === simulation.date.absoluteDay) continue;
      expect(groups.groupOf(p, 0)).not.toBeNull();
      const raiser = guardian[p]!;
      if (raiser >= 0 && humans.people.alive[raiser] === 1 && humans.people.ageYears[p]! < simulation.data.groups.adultAge) expect(groups.groupOf(p, 2)).toBe(groups.groupOf(raiser, 2));
    }
  });

  it('a duty given by the leaders weighs on the camp need one answers, unless one does not obey', () => {
    const simulation = world();
    const { groups } = simulation;
    const person = groups.adults(groups.tribes()[0]!)[0]!;
    groups.duty[person] = 1;
    groups.obeys[person] = 1;
    expect(groups.dutyFactor(person, 1)).toBeGreaterThan(1);
    expect(groups.dutyFactor(person, 0)).toBeLessThan(1);
    groups.obeys[person] = 0;
    expect(groups.dutyFactor(person, 1)).toBe(1);
  });

  it('a clan leaves its tribe: a new tribe, a new camp elsewhere, its members follow, told with its causes', () => {
    const simulation = world();
    const { groups, humans } = simulation;
    day(simulation, 1);
    const tribe = groups.tribes()[0]!;
    // A clan of a few households (as if it had formed over the generations).
    // Households until the clan is big enough to leave (their sizes vary from world to world).
    const families: Group[] = [];
    for (const family of groups.childrenOf(tribe).filter((group) => group.level === 2)) {
      if (families.reduce((n, f) => n + f.members.length, 0) >= 8) break;
      families.push(family);
    }
    const founder = families[0]!.members[0]!;
    const clan = groups.addGroup(1, tribe.id, founder, 0, -1);
    for (const family of families) {
      family.parent = clan.id;
      for (const person of family.members) groups.setMember(person, clan);
    }
    clan.members = families.flatMap((family) => family.members);
    clan.leaders = [founder];
    const leaving = [...clan.members];
    expect(scission(groups, tribe, clan, 'essai', [tribe.leaderEvent])).toBe(true);
    const created = groups.tribes().find((group) => group !== tribe)!;
    expect(created).toBeDefined();
    expect(created.camp).toBeGreaterThan(tribe.camp);
    for (const person of leaving) {
      expect(humans.people.camp[person]).toBe(created.camp);
      expect(groups.groupOf(person, 0)).toBe(created);
      expect(groups.groupOf(person, 1)).toBe(clan);
    }
    const event = simulation.journal.all().find((e) => e.type === GROUP_EVENTS.scission)!;
    expect(event.text).toMatch(/quitte la tribu des/);
    expect(event.causes).toContain(tribe.leaderEvent);
    expect(created.known.has(tribe.id) && tribe.known.has(created.id)).toBe(true);
    // The world goes on: people walk to the new camp, the groups stay consistent.
    day(simulation, 5);
    for (let p = 0; p < humans.people.count; p++) {
      if (humans.people.alive[p] === 0) continue;
      expect(groups.groupOf(p, 0)!.camp).toBe(humans.people.camp[p]);
    }
  });

  it('when discontent outgrows legitimacy, an ambitious member contests or overthrows the leader', () => {
    const simulation = world(3, (data) => {
      data.groups.politics.actChance = 1;
      data.groups.politics.ambitionTrait = 0;
      data.groups.politics.everyDays = 1;
    });
    const { groups } = simulation;
    const tribe = groups.tribes()[0]!;
    for (let d = 0; d < 20; d++) {
      for (const person of tribe.members) groups.grievance[person] = 100;
      for (const person of tribe.members) groups.approval[person * LEVEL_COUNT] = 0;
      day(simulation, 1);
    }
    const types = simulation.journal.all().map((event) => event.type);
    expect(types.includes(GROUP_EVENTS.contested) || types.includes(GROUP_EVENTS.overthrown) || types.includes(GROUP_EVENTS.scission)).toBe(true);
  });
});

/** A clan of the first households of the tribe, then its departure (as in the scission test). */
function splitOff(simulation: Simulation, households: number): void {
  const { groups } = simulation;
  const tribe = groups.tribes()[0]!;
  const families = groups.childrenOf(tribe).filter((group) => group.level === 2).slice(0, households);
  const founder = families[0]!.members[0]!;
  const clan = groups.addGroup(1, tribe.id, founder, 0, -1);
  for (const family of families) {
    family.parent = clan.id;
    for (const person of family.members) groups.setMember(person, clan);
  }
  clan.members = families.flatMap((family) => family.members);
  clan.leaders = [founder];
  expect(scission(groups, tribe, clan, 'essai', [])).toBe(true);
}

describe('tribes together', () => {
  it('a small tribe in hardship that thinks well of a bigger one joins it and becomes one of its clans', () => {
    const simulation = world(5, (data) => {
      data.groups.fusion.chance = 1;
      data.groups.fusion.minOpinion = -100;
      data.groups.scission.minMembers = 2;
    });
    const { groups, humans } = simulation;
    day(simulation, 1);
    splitOff(simulation, 2);
    const [big, small] = groups.tribes();
    for (let k = 0; k < 4; k++) small!.sufferings.push({ day: groups.day, cause: 1, event: -1 });
    small!.known.get(big!.id)!.opinion = 50;
    big!.known.get(small!.id)!.opinion = 0;
    const movers = [...small!.members];
    tribeRelations(groups, small!);
    expect(small!.alive).toBe(false);
    const fusion = simulation.journal.all().find((event) => event.type === GROUP_EVENTS.fusion)!;
    expect(fusion.text).toMatch(/rejoint la tribu des/);
    for (const person of movers) {
      expect(humans.people.camp[person]).toBe(big!.camp);
      expect(groups.groupOf(person, 0)).toBe(big);
      expect(groups.groupOf(person, 1)?.parent).toBe(big!.id);
    }
    day(simulation, 3);
    expect(groups.tribes()).toEqual([big]);
  });
});

describe('determinism', () => {
  it('same seed => same groups, same leaders, same political journal', () => {
    const run = (): string => {
      const simulation = world(11);
      day(simulation, 60);
      const { groups, journal } = simulation;
      return JSON.stringify([groups.groups.map((g) => [g.level, g.name, g.regime, g.leaders, Math.round(g.legitimacy * 100)]), journal.all().filter((e) => e.type.startsWith('groups.')).map((e) => e.text)]);
    };
    expect(run()).toBe(run());
  });
});

describe('succession and blame', () => {
  it('when a chief dies and a rival claimant has a real following, the succession is disputed', async () => {
    const { successionCrisis } = await import('../../../src/sim/systems/groups/succession');
    const { rankCandidates } = await import('../../../src/sim/systems/groups/power');
    const { feel } = await import('../../../src/sim/systems/individuals/social/relations');
    const simulation = world(31);
    const { groups, humans } = simulation;
    day(simulation, 1);
    const tribe = groups.tribes()[0]!;
    tribe.regime = groups.params.regimes.findIndex((regime) => regime.id === 'chiefdom');
    const chief = rankCandidates(groups, tribe)[0]!.person;
    tribe.leaders = [chief];
    tribe.formerLeaders.push(chief);
    humans.die(chief, 5, simulation.clock.tick);
    day(simulation, 1);
    tribe.leaders = [];
    const claimants = rankCandidates(groups, tribe).map((candidate) => candidate.person);
    const [heir, rival] = claimants;
    const ambition = humans.params.traits.findIndex((trait) => trait.id === 'ambition');
    humans.people.traits[rival! * humans.people.traitCount + ambition] = 1;
    // Most adults love the rival and distrust the heir.
    for (const person of groups.adults(tribe)) {
      if (claimants.slice(0, 3).includes(person)) continue;
      feel(humans.social, person, rival!, { affection: 80, trust: 80, respect: 0 }, 'chat');
      for (const other of claimants.slice(0, 3)) if (other !== rival) feel(humans.social, person, other, { affection: -60, trust: -60, respect: 0 }, 'quarrel');
    }
    expect(successionCrisis(groups, tribe)).toBe(true);
    const event = simulation.journal.all().find((e) => e.type === GROUP_EVENTS.succession)!;
    expect(event).toBeDefined();
    expect(tribe.leaders).toEqual([rival]);
  });

  it('deaths of hunger under a chief’s authority cost the chief the trust of the bereaved', async () => {
    const simulation = world(37);
    const { groups, humans } = simulation;
    day(simulation, 1);
    const tribe = groups.tribes()[0]!;
    const leader = tribe.leaders[0]!;
    const victim = tribe.members.find((p) => p !== leader && humans.people.spouse[p]! >= 0 && humans.people.spouse[p] !== leader && !tribe.leaders.includes(humans.people.spouse[p]!))!;
    const widow = humans.people.spouse[victim]!;
    const state = humans.social.state;
    const trustBefore = state.slotOf(widow, leader) >= 0 ? state.trust[state.slotOf(widow, leader)]! : 0;
    humans.die(victim, 1, simulation.clock.tick);
    day(simulation, 1);
    const slot = state.slotOf(widow, leader);
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(state.trust[slot]!).toBeLessThan(trustBefore);
  });
});
