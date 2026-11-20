import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/sim/core/simulation';
import type { GameData } from '../../../src/sim/core/game-data';
import { scission } from '../../../src/sim/systems/groups/tribes';
import { CONFLICT_EVENTS } from '../../../src/sim/systems/conflict/texts';
import { HUMAN_DEATH } from '../../../src/sim/systems/individuals/individuals-system';
import { DeathCause } from '../../../src/sim/systems/individuals/people';
import { battle, muster } from '../../../src/sim/systems/conflict/combat';
import { GROUP_EVENTS } from '../../../src/sim/systems/groups/texts';
import { civilWars } from '../../../src/sim/systems/conflict/civil-war';
import { ambitionTarget } from '../../../src/sim/systems/individuals/social/ambitions';
import { feel } from '../../../src/sim/systems/individuals/social/relations';
import { dataWithSize } from '../world/helpers';

const SIZE = 320;
const ANGER = 2;

function world(seed = 42, change?: (data: GameData) => void): Simulation {
  const data = dataWithSize(SIZE);
  change?.(data);
  return new Simulation(seed, data);
}

function day(simulation: Simulation, days = 1): void {
  simulation.step(days * simulation.data.time.ticksPerDay);
}

function adults(simulation: Simulation): number[] {
  const people = simulation.humans.people;
  return [...Array(people.count).keys()].filter((p) => people.alive[p] === 1 && people.ageYears[p]! >= 18 && people.ageYears[p]! < 45);
}

/** Splits the first households of the starting tribe into a tribe of their own. */
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

describe('brawls and feuds', () => {
  it('a quarrel between two angry, hot-tempered enemies turns to blows, and the one hit bears a grudge', () => {
    const simulation = world(31, (data) => {
      data.conflict.brawl.escalateChance = 1;
      data.conflict.brawl.fistDamage = 5;
    });
    const { humans, conflict } = simulation;
    const [a, b] = adults(simulation);
    const social = humans.social;
    const temper = humans.params.traits.findIndex((t) => t.id === 'temper');
    humans.people.traits[a! * humans.people.traitCount + temper] = 1;
    social.state.emotions[a! * 5 + ANGER] = 100;
    feel(social, a!, b!, { affection: -80, trust: -50, respect: 0 }, 'quarrel');
    social.quarrelLog.push(a!, b!);
    conflict.runStep(simulation.hour, simulation.clock.tick);
    const brawl = simulation.journal.all().find((event) => event.type === CONFLICT_EVENTS.brawl);
    expect(brawl).toBeDefined();
    expect(brawl!.text).toMatch(/tourne aux coups/);
    expect(conflict.counts.brawls).toBe(1);
  });

  it('a murder starts a feud: the victim’s kin swear revenge, the group judges the murderer', () => {
    const simulation = world(37, (data) => {
      data.conflict.feud.avengeChance = 1;
    });
    const { humans, conflict } = simulation;
    const people = humans.people;
    const victim = adults(simulation).find((p) => people.spouse[p]! >= 0)!;
    const killer = adults(simulation).find((p) => p !== victim && people.spouse[victim] !== p && humans.social.kinOf(p, victim) === 0)!;
    const temper = humans.params.traits.findIndex((t) => t.id === 'temper');
    people.traits[people.spouse[victim]! * people.traitCount + temper] = 1;
    conflict.currentFight = 'brawl';
    humans.interactions.attack({ attacker: { kind: 'human', id: killer }, target: { kind: 'human', id: victim }, damage: 500, attackerName: people.names[killer]!, tick: simulation.clock.tick, motive: 'fight', context: 'au cours d’une rixe' });
    conflict.noteKill(killer, victim);
    const death = simulation.journal.all().find((event) => event.type === HUMAN_DEATH && Number(event.details['person']) === victim)!;
    expect(people.deathCause[victim]).toBe(DeathCause.Violence);
    expect(death.text).toMatch(new RegExp(`tuée? par ${people.names[killer]}`));
    day(simulation, 1);
    const feud = simulation.journal.all().find((event) => event.type === CONFLICT_EVENTS.feud);
    expect(feud).toBeDefined();
    expect(feud!.causes).toContain(death.id);
    expect(ambitionTarget(humans.social, people.spouse[victim]!, 'avenge')).toBe(killer);
    const judged = simulation.journal.all().filter((event) => event.type === CONFLICT_EVENTS.exile || event.type === CONFLICT_EVENTS.spared);
    expect(judged).toHaveLength(1);
  });

  it('a big animal that fights back wounds or kills its hunter (it does not eat him)', () => {
    const simulation = world(41);
    const { humans, interactions, fauna } = simulation;
    const [hunter] = adults(simulation);
    const aurochs = fauna.params.species.findIndex((s) => s.id === 'aurochs');
    let slot = 0;
    while (fauna.store.species[slot] !== aurochs || fauna.store.alive[slot] !== 1) slot++;
    interactions.attack({ attacker: { kind: 'animal', id: slot }, target: { kind: 'human', id: hunter! }, damage: 500, attackerName: 'aurochs', tick: simulation.clock.tick, motive: 'defense', context: ' qu’il chassait' });
    const death = simulation.journal.all().find((event) => event.type === HUMAN_DEATH)!;
    expect(death.text).toMatch(/aurochs qu’(il|elle) chassait/);
    expect(humans.people.deathCause[hunter!]).toBe(DeathCause.Predator);
  });

  it('a heavy wound may leave someone crippled, with less vigour', () => {
    const simulation = world(43, (data) => {
      data.life.wounds.crippleChance = 1;
      data.life.wounds.crippleDamage = 10;
    });
    const { humans, interactions } = simulation;
    const [a, b] = adults(simulation);
    const before = humans.life.vigor(b!);
    interactions.attack({ attacker: { kind: 'human', id: a! }, target: { kind: 'human', id: b! }, damage: 99, attackerName: humans.people.names[a!]!, tick: simulation.clock.tick, motive: 'fight', context: 'lors d’une rixe' });
    expect(humans.life.state.crippled[b!]).toBe(1);
    expect(humans.life.vigor(b!)).toBeLessThan(before);
    expect(simulation.journal.all().some((event) => event.type === 'life.crippled')).toBe(true);
  });
});

describe('battles', () => {
  it('morale breaks a troop before it is wiped out, and walls help the defenders', () => {
    let wallsWin = 0;
    let openWin = 0;
    let wiped = 0;
    for (let seed = 1; seed <= 6; seed++) {
      for (const walls of [true, false]) {
        const simulation = world(50 + seed);
        const { conflict } = simulation;
        const fighters = adults(simulation).slice(0, 12);
        const attackers = fighters.slice(0, 6);
        const defenders = fighters.slice(6, 12);
        const sides = [muster(conflict, attackers, -1, 1, false), muster(conflict, defenders, -1, walls ? 2.2 : 1, false)] as [ReturnType<typeof muster>, ReturnType<typeof muster>];
        conflict.currentFight = 'battle';
        const result = battle(conflict, sides, ['en attaquant', 'en défendant'], [], false);
        if (result.winner === 1) (walls ? wallsWin++ : openWin++);
        if (result.winner >= 0 && result.killed[1 - result.winner]!.length === 6) wiped++;
      }
    }
    expect(wallsWin).toBeGreaterThanOrEqual(openWin);
    expect(wiped).toBeLessThan(6);
  });
});

describe('raids, wars and diplomacy', () => {
  it('a hungry tribe raids its neighbour: its fighters gather, march, fight near the enemy camp and come back', () => {
    const simulation = world(19, (data) => {
      data.groups.scission.minMembers = 2;
      data.conflict.raid.baseChance = 1;
      data.conflict.raid.everyDays = 1;
      data.conflict.raid.minParty = 2;
      data.conflict.raid.joinChance = 1;
      data.conflict.raid.gatherHours = 2;
      data.conflict.war.declareChance = 0;
    });
    const { groups, conflict } = simulation;
    day(simulation, 1);
    splitOff(simulation, 4);
    day(simulation, 1);
    const [big, small] = groups.tribes();
    big!.known.get(small!.id)!.opinion = -60;
    small!.known.get(big!.id)!.opinion = -60;
    let raid = false;
    let battle = false;
    for (let d = 0; d < 30 && !battle; d++) {
      day(simulation, 1);
      raid ||= simulation.journal.all().some((event) => event.type === CONFLICT_EVENTS.raid);
      if (raid && conflict.expeditions.some((x) => x.state === 1)) {
        const marching = conflict.expeditions.find((x) => x.state === 1)!;
        expect(marching.members.some((p) => conflict.warCall(p) > 0)).toBe(true);
      }
      battle = simulation.journal.all().some((event) => event.type === CONFLICT_EVENTS.battle);
    }
    expect(raid).toBe(true);
    expect(battle).toBe(true);
    const event = simulation.journal.all().find((e) => e.type === CONFLICT_EVENTS.raid)!;
    expect(event.text).toMatch(/part razzier/);
  });

  it('a tribe weary of war sends an emissary who walks to the enemy; the war goes on until an answer', () => {
    const simulation = world(19, (data) => {
      data.groups.scission.minMembers = 2;
      data.conflict.raid.baseChance = 0;
      data.conflict.war.declareChance = 0;
      data.conflict.diplomacy.understandFloor = 1;
    });
    const { groups, conflict } = simulation;
    day(simulation, 1);
    splitOff(simulation, 4);
    day(simulation, 1);
    const [big, small] = groups.tribes();
    const relation = conflict.relation(big!.id, small!.id);
    relation.state = 'war';
    relation.weariness[0] = 500;
    relation.weariness[1] = 500;
    let answered = false;
    for (let d = 0; d < 30 && !answered; d++) {
      day(simulation, 1);
      answered = simulation.journal.all().some((event) => [CONFLICT_EVENTS.peace, CONFLICT_EVENTS.truce, CONFLICT_EVENTS.tribute].includes(event.type as never));
    }
    expect(simulation.journal.all().some((event) => event.type === CONFLICT_EVENTS.envoy)).toBe(true);
    expect(answered).toBe(true);
    expect(relation.state).not.toBe('war');
  });

  it('a failed contest in a tribe without legitimacy may turn to civil war', () => {
    const simulation = world(23, (data) => {
      data.conflict.civilWar.chance = 1;
      data.conflict.civilWar.angerTrait = 0;
      data.conflict.civilWar.maxLegitimacy = 100;
    });
    const { groups, conflict, humans } = simulation;
    day(simulation, 1);
    const tribe = groups.tribes()[0]!;
    const challenger = adults(simulation).find((p) => !tribe.leaders.includes(p))!;
    for (const p of tribe.members) groups.approval[p * 3] = 20;
    const contested = simulation.journal.publish({ tick: simulation.clock.tick, type: GROUP_EVENTS.contested, text: 'essai', place: null, actors: [], causes: [], details: { group: tribe.id, challenger, supporters: tribe.members.length, adults: tribe.members.length } });
    civilWars(conflict, [simulation.journal.get(contested)!]);
    const war = simulation.journal.all().find((event) => event.type === CONFLICT_EVENTS.civilWar);
    expect(war).toBeDefined();
    expect(war!.causes).toContain(contested);
    void humans;
  });

  it('a camp that knows a threat wants a palisade when it can build one', () => {
    const simulation = world(29);
    const { humans, ideas } = simulation;
    const polished = simulation.data.knowledge.knowledge.findIndex((item) => item.id === 'polished_stone');
    for (const p of adults(simulation)) ideas.learn(p, polished, -1, -1);
    // The wood for it is at hand (stock).
    humans.production.storeInCamp(0, humans.production.catalog.itemIndex.get('wood')!, 80, 1);
    // Once the more pressing needs are met (fire, shelters…), the threat calls for a palisade.
    const types = humans.production.catalog.buildings;
    let planned = false;
    for (let d = 0; d < 40 && !planned; d++) {
      humans.production.setThreat(0, 1);
      day(simulation, 1);
      const plan = humans.production.needs(0).buildPlan;
      planned = humans.production.campBuildings(0).some((b) => types[b.type]!.def.function === 'defense') || (plan !== null && types[plan.type]!.def.function === 'defense');
    }
    expect(planned).toBe(true);
  });

  it('same seed, same conflicts', () => {
    const a = world(61);
    const b = world(61);
    day(a, 20);
    day(b, 20);
    expect(JSON.stringify(a.conflict.counts)).toBe(JSON.stringify(b.conflict.counts));
    expect(a.journal.all().map((event) => event.text)).toEqual(b.journal.all().map((event) => event.text));
  });
});
