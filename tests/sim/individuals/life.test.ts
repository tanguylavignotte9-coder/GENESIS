import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/sim/core/simulation';
import { HUMAN_DEATH } from '../../../src/sim/systems/individuals/individuals-system';
import { DeathCause } from '../../../src/sim/systems/individuals/people';
import { fertilityAt, oldAgeDeathPerDay, vigorAt, vulnerabilityAt } from '../../../src/sim/systems/individuals/life/aging';
import { BIRTH, considerConception, desireForChild, fertility } from '../../../src/sim/systems/individuals/life/birth';
import { diseaseDamagePerHour, EPIDEMIC_END, EPIDEMIC_START, infect, spreadDisease } from '../../../src/sim/systems/individuals/life/disease';
import { ADOPTION } from '../../../src/sim/systems/individuals/life/orphans';
import { BELONGINGS_FOUND, findBelongings, INHERITANCE } from '../../../src/sim/systems/individuals/life/heritage';
import { NEVER_DAY } from '../../../src/sim/systems/individuals/life/state';
import { memoryWeight } from '../../../src/sim/systems/individuals/social/feelings';
import { learn } from '../../../src/sim/systems/individuals/social/news';
import { Kin } from '../../../src/sim/systems/individuals/social/state';
import { dataWithSize } from '../world/helpers';

const SIZE = 256;
const data = dataWithSize(SIZE);
const dayTicks = data.time.ticksPerDay;

function world(seed = 42): Simulation {
  return new Simulation(seed, dataWithSize(SIZE));
}

/** A woman of the tribe with a living partner, young enough to have children. */
function couple(simulation: Simulation): { woman: number; man: number } {
  const { people } = simulation.humans;
  for (let p = 0; p < people.count; p++) {
    const man = people.spouse[p]!;
    if (people.female[p] === 1 && man >= 0 && people.ageYears[p]! >= 20 && people.ageYears[p]! <= 32 && people.ageYears[man]! <= 45) return { woman: p, man };
  }
  // None in this world: the youngest couple is made young (the scenario needs one).
  for (let p = 0; p < people.count; p++) {
    const man = people.spouse[p]!;
    if (people.female[p] !== 1 || man < 0 || people.ageYears[p]! > 45) continue;
    people.ageYears[p] = 26;
    people.ageYears[man] = 30;
    return { woman: p, man };
  }
  throw new Error('no young couple');
}

/** Everybody fed, healthy and rested (a controlled scenario). */
function wellFed(simulation: Simulation): void {
  const { people, life } = simulation.humans;
  for (let p = 0; p < people.count; p++) {
    people.hunger[p] = 0;
    people.health[p] = 100;
    life.state.nourishment[p] = 0;
  }
}

/** Gives birth now (the pregnancy is at term). */
function deliver(simulation: Simulation, mother: number, father: number): number {
  const { life, people } = simulation.humans;
  life.params.birth.stillbirth = 0;
  life.params.birth.motherDeath = 0;
  life.state.pregnantSince[mother] = life.day - life.params.pregnancy.days;
  life.state.pregnantBy[mother] = father;
  life.params.pregnancy.miscarriagePerDay = 0;
  const before = people.count;
  simulation.step(dayTicks);
  expect(people.count).toBe(before + 1);
  return before;
}

describe('ageing and the body', () => {
  const params = data.life;

  it('strength grows through childhood, holds in the prime of life, then declines with age', () => {
    expect(vigorAt(params, 2)).toBeLessThan(vigorAt(params, 10));
    expect(vigorAt(params, 25)).toBe(1);
    expect(vigorAt(params, 70)).toBeLessThan(vigorAt(params, 50));
    expect(vigorAt(params, 120)).toBeGreaterThanOrEqual(params.aging.minVigor);
  });

  it('the chance of dying of old age grows with age (and with weakness)', () => {
    const at = (age: number, health = 100): number => oldAgeDeathPerDay(params, age, health, 40);
    expect(at(20)).toBe(0);
    expect(at(70)).toBeGreaterThan(at(55));
    expect(at(85)).toBeGreaterThan(at(70));
    expect(at(70, 20)).toBeGreaterThan(at(70, 100));
  });

  it('diseases strike the very young and the old hardest', () => {
    expect(vulnerabilityAt(params, 0)).toBeGreaterThan(vulnerabilityAt(params, 25));
    expect(vulnerabilityAt(params, 75)).toBeGreaterThan(vulnerabilityAt(params, 25));
  });

  it('fertility depends on the age of both partners', () => {
    const [start, , , end] = params.fertility.femaleAges;
    expect(fertilityAt(params.fertility.femaleAges, start - 1)).toBe(0);
    expect(fertilityAt(params.fertility.femaleAges, 25)).toBe(1);
    expect(fertilityAt(params.fertility.femaleAges, end)).toBe(0);
  });

  it('everyone gets one day older every day', () => {
    const simulation = world();
    const { people } = simulation.humans;
    const before = people.ageYears[0]!;
    simulation.step(dayTicks * 4);
    expect(people.ageYears[0]! - before).toBeCloseTo(4 / 40, 3);
  });

  it('an old person walks slower and tires sooner than a young adult', () => {
    const simulation = world();
    const { people, life } = simulation.humans;
    people.ageYears[0] = 25;
    people.ageYears[1] = 75;
    expect(life.vigor(1)).toBeLessThan(life.vigor(0));
  });
});

describe('couples and births', () => {
  it('a well-fed couple who love each other may conceive; a starving woman does not', () => {
    const simulation = world();
    const { humans } = simulation;
    const { life, people } = humans;
    const { woman, man } = couple(simulation);
    wellFed(simulation);
    life.state.lastBirthDay[woman] = NEVER_DAY;
    people.placeAt(man, people.px[woman]!, people.py[woman]!);
    expect(fertility(life, woman, man)).toBeGreaterThan(0);
    expect(desireForChild(life, woman, man)).toBeGreaterThan(0);
    life.state.nourishment[woman] = 99;
    expect(fertility(life, woman, man)).toBe(0);
    life.state.nourishment[woman] = 0;
    life.params.fertility.conceptionPerYear = 1;
    let days = 0;
    while (!life.state.pregnant(woman) && days < 400) {
      considerConception(life, woman);
      days++;
    }
    expect(life.state.pregnant(woman)).toBe(true);
    expect(life.state.pregnantBy[woman]).toBe(man);
  });

  it('a couple without affection does not want a child', () => {
    const simulation = world();
    const { life, social } = simulation.humans;
    const { woman, man } = couple(simulation);
    const slot = social.state.slotOf(woman, man);
    social.state.affection[slot] = -40;
    expect(desireForChild(life, woman, man)).toBe(0);
  });

  it('a child is born: parents, a name, traits from both parents, a guardian, family ties and the joy of the parents', () => {
    const simulation = world();
    const { humans } = simulation;
    const { people, life, social } = humans;
    const { woman, man } = couple(simulation);
    wellFed(simulation);
    const child = deliver(simulation, woman, man);
    expect(people.mother[child]).toBe(woman);
    expect(people.father[child]).toBe(man);
    expect(people.alive[child]).toBe(1);
    expect(people.ageYears[child]).toBeLessThan(0.1);
    expect(people.names[child]).not.toBe('');
    expect(new Set(people.names.slice(0, people.count)).size).toBe(people.count);
    expect(life.state.guardian[child]).toBe(woman);
    expect(social.state.kin[social.state.slotOf(woman, child)]! & Kin.Child).toBeTruthy();
    expect(memoryWeight(social, woman, 'childBorn', child)).toBeGreaterThan(0);
    const birth = simulation.journal.all().find((event) => event.type === BIRTH)!;
    expect(birth.text).toContain(people.names[child]!);
    expect(birth.actors.map((actor) => actor.id)).toContain(woman);
    // A baby is carried by its mother and fed at the breast.
    simulation.step(dayTicks / 24);
    expect(life.carrier(child)).toBe(woman);
    expect(people.x[child]).toBe(people.x[woman]);
  });

  it('children resemble their parents (heredity with variation)', () => {
    const simulation = world();
    const { people } = simulation.humans;
    const { woman, man } = couple(simulation);
    wellFed(simulation);
    const n = people.traitCount;
    for (let t = 0; t < n; t++) {
      people.traits[woman * n + t] = 0.95;
      people.traits[man * n + t] = 0.9;
    }
    const child = deliver(simulation, woman, man);
    let mean = 0;
    for (let t = 0; t < n; t++) mean += people.trait(child, t) / n;
    expect(mean).toBeGreaterThan(0.6);
  });

  it('nursing feeds the baby and costs its mother hunger', () => {
    const simulation = world();
    const { people, life } = simulation.humans;
    const { woman, man } = couple(simulation);
    wellFed(simulation);
    const child = deliver(simulation, woman, man);
    people.hunger[child] = 60;
    people.hunger[woman] = 10;
    expect(life.nurse(child)).toBe(woman);
    life.nurseStep(child, 1);
    expect(people.hunger[child]).toBeLessThan(60);
    expect(people.hunger[woman]).toBeGreaterThan(10);
    // A mother starving for days has no milk.
    life.state.nourishment[woman] = 99;
    expect(life.nurse(child)).toBe(-1);
  });

  it('the population can grow past the size of the starting arrays', () => {
    const simulation = world();
    const { people, social, life } = simulation.humans;
    const { woman, man } = couple(simulation);
    const start = people.capacity;
    for (let k = 0; k <= start; k++) simulation.humans.bear(woman, man, k % 2 === 0);
    expect(people.count).toBeGreaterThan(start);
    expect(social.state.relOther.length).toBeGreaterThanOrEqual(people.capacity * social.state.relationSlots);
    expect(life.state.capacity).toBeGreaterThanOrEqual(people.capacity);
    expect(simulation.production.carried).toHaveLength(people.count);
    simulation.step(dayTicks / 4);
  });
});

describe('childhood', () => {
  it('a child near an adult at work learns a little of the skill by watching', () => {
    const simulation = world();
    const { humans } = simulation;
    const { people, life } = humans;
    const child = Array.from({ length: people.count }, (_, p) => p).find((p) => people.ageYears[p]! >= 5 && people.ageYears[p]! < 12)!;
    const adult = life.state.guardian[child]!;
    people.placeAt(adult, people.px[child]!, people.py[child]!);
    humans['rebuildGrid']();
    humans.practise(adult, 0, 0.1);
    const before = people.skill(child, 0);
    const practice = people.practice[child * people.skillCount]!;
    for (let h = 0; h < 10; h++) life.liveHour(child);
    expect(people.skill(child, 0)).toBeGreaterThan(before);
    // Watching is not practice: the trade does not come from it.
    expect(people.practice[child * people.skillCount]).toBe(practice);
  });

  it('a famine lived as a child marks the personality more than as an adult', () => {
    const simulation = world();
    const { people, social } = simulation.humans;
    const child = Array.from({ length: people.count }, (_, p) => p).find((p) => people.ageYears[p]! < 10)!;
    const adult = Array.from({ length: people.count }, (_, p) => p).find((p) => people.ageYears[p]! > 25)!;
    const generosity = social.traitIndex('generosity');
    const drift = (person: number): number => {
      const before = people.trait(person, generosity);
      social['state'].memKind.fill(-1, person * social.state.memorySlots, (person + 1) * social.state.memorySlots);
      social.liveHour(person, false);
      people.hunger[person] = 100;
      social.liveHour(person, false);
      return before - people.trait(person, generosity);
    };
    expect(drift(child)).toBeGreaterThan(drift(adult));
  });
});

describe('diseases', () => {
  it('a contagious disease passes to those close by; hunger and infancy make it worse', () => {
    const simulation = world();
    const { humans } = simulation;
    const { people, life } = humans;
    const sick = 0;
    const neighbour = 1;
    people.placeAt(neighbour, people.px[sick]!, people.py[sick]!);
    humans['rebuildGrid']();
    const fever = data.life.diseases.findIndex((disease) => disease.contagious);
    life.params.diseases[fever]!.transmitPerHour = 1;
    infect(life, sick, fever, -1);
    spreadDisease(life, sick);
    expect(life.state.disease[neighbour]).toBe(fever);
    expect(life.state.diseaseSource[neighbour]).toBe(sick);
    people.hunger[neighbour] = 0;
    people.ageYears[neighbour] = 25;
    const fed = diseaseDamagePerHour(life, neighbour);
    people.hunger[neighbour] = 100;
    expect(diseaseDamagePerHour(life, neighbour)).toBeGreaterThan(fed);
    people.hunger[neighbour] = 0;
    people.ageYears[neighbour] = 0.5;
    expect(diseaseDamagePerHour(life, neighbour)).toBeGreaterThan(fed);
  });

  it('the sick recover after a while and are immune for some years; a sick body does not heal', () => {
    const simulation = world();
    const { people, life } = simulation.humans;
    const person = Array.from({ length: people.count }, (_, p) => p).find((p) => people.ageYears[p]! >= 20 && people.ageYears[p]! < 40)!;
    infect(life, person, 0, -1);
    people.health[person] = 80;
    life.params.diseases[0]!.damagePerHour = 0;
    simulation.step(dayTicks / 4);
    expect(people.health[person]).toBeLessThanOrEqual(80);
    for (let d = 0; d < 20 && life.state.disease[person]! >= 0; d++) simulation.step(dayTicks);
    expect(life.state.disease[person]).toBe(-1);
    expect(life.state.immuneUntil[person * life.state.diseaseCount]).toBeGreaterThan(life.day);
  });

  it('many sick at once in the tribe is told as an epidemic, then its end with its toll', () => {
    const simulation = world();
    const { people, life } = simulation.humans;
    for (const disease of life.params.diseases) disease.transmitPerHour = 0;
    for (let p = 0; p < life.params.epidemic.minCases; p++) infect(life, p, 0, -1);
    const start = simulation.journal.all().find((event) => event.type === EPIDEMIC_START);
    expect(start).toBeDefined();
    expect(life.state.diseaseEvent[0]).toBe(start!.id);
    for (let d = 0; d < 20 && !simulation.journal.all().some((event) => event.type === EPIDEMIC_END); d++) simulation.step(dayTicks);
    const end = simulation.journal.all().find((event) => event.type === EPIDEMIC_END)!;
    expect(end.causes).toContain(start!.id);
    expect(people.count).toBeGreaterThan(0);
  });

  it('a death by disease names the disease and its epidemic among the causes', () => {
    const simulation = world();
    const { people, life } = simulation.humans;
    for (const disease of life.params.diseases) disease.transmitPerHour = 0;
    for (let p = 0; p < life.params.epidemic.minCases; p++) infect(life, p, 0, -1);
    life.params.diseases[0]!.damagePerHour = 500;
    simulation.step(dayTicks / 24);
    const death = simulation.journal.all().find((event) => event.type === HUMAN_DEATH && event.details['cause'] === DeathCause.Disease)!;
    expect(death.text).toContain(life.params.diseases[0]!.name);
    const epidemic = simulation.journal.all().find((event) => event.type === EPIDEMIC_START)!;
    expect(death.causes).toContain(epidemic.id);
    expect(people.alive[0]).toBe(0);
  });
});

describe('orphans and inheritance', () => {
  /** A child of the starting tribe with both parents. */
  function family(simulation: Simulation): { child: number; mother: number; father: number } {
    const { people } = simulation.humans;
    for (let p = 0; p < people.count; p++) {
      if (people.ageYears[p]! < 10 && people.mother[p]! >= 0 && people.father[p]! >= 0) return { child: p, mother: people.mother[p]!, father: people.father[p]! };
    }
    throw new Error('no family');
  }

  it('the other parent takes over; with both parents dead, someone who cared for them takes the child in', () => {
    const simulation = world();
    const { humans } = simulation;
    const { people, life, social } = humans;
    const { child, mother, father } = family(simulation);
    humans.die(mother, DeathCause.Hunger, simulation.clock.tick);
    expect(life.state.guardian[child]).toBe(father);
    const death = humans.die(father, DeathCause.Hunger, simulation.clock.tick);
    expect(life.state.guardian[child]).toBe(-1);
    // A friend of the father, who knows of the death and is generous, wants the child.
    const friend = Array.from({ length: people.count }, (_, p) => p).find((p) => people.alive[p] === 1 && p !== child && people.ageYears[p]! >= 25 && people.ageYears[p]! < 60)!;
    social.respectElder(friend, father, 0);
    social.state.affection[social.state.slotOf(friend, father)] = 90;
    learn(social, friend, [...social.news.facts.values()].find((fact) => fact.kind === 'death' && fact.subject === father)!, 0, -1);
    simulation.step(dayTicks);
    // One of the children of the dead (here or a brother or sister) is taken in, by someone alive.
    const adoption = simulation.journal.all().find((event) => event.type === ADOPTION);
    expect(adoption).toBeDefined();
    expect(adoption!.causes).toContain(death);
    const adopted = Number(adoption!.details['child']);
    expect(people.father[adopted]).toBe(father);
    expect(life.state.guardian[adopted]).toBeGreaterThanOrEqual(0);
    expect(people.alive[life.state.guardian[adopted]!]).toBe(1);
  });

  it('nobody takes in an orphan they do not care about', () => {
    const simulation = world();
    const { humans } = simulation;
    const { life } = humans;
    const { child, mother, father } = family(simulation);
    life.params.orphans.minWillingness = 100;
    humans.die(mother, DeathCause.Hunger, simulation.clock.tick);
    humans.die(father, DeathCause.Hunger, simulation.clock.tick);
    simulation.step(dayTicks * 2);
    expect(life.state.guardian[child]).toBe(-1);
    expect(life.orphans.some((orphan) => orphan.child === child)).toBe(true);
  });

  it('the objects of the dead go to the partner, as custom wants', () => {
    const simulation = world();
    const { humans, production } = simulation;
    const { people } = humans;
    const { woman, man } = couple(simulation);
    const knife = production.catalog.itemIndex.get('stone_knife')!;
    production.carried[man]!.put(knife, 1, 0.5, man);
    people.placeAt(man, humans.camps[0]!.centerX + 0.5, humans.camps[0]!.centerY + 0.5);
    humans.die(man, DeathCause.Predator, simulation.clock.tick);
    expect(production.hasItem(woman, knife)).toBe(true);
    const inheritance = simulation.journal.all().find((event) => event.type === INHERITANCE)!;
    expect(inheritance.text).toContain(people.names[woman]!);
  });

  it('far from the camp, the objects of the dead stay on the ground until someone passing by finds them', () => {
    const simulation = world();
    const { humans, production } = simulation;
    const { people } = humans;
    const { woman, man } = couple(simulation);
    const knife = production.catalog.itemIndex.get('stone_knife')!;
    production.carried[man]!.put(knife, 1, 0.5, man);
    const camp = humans.camps[0]!;
    let far = -1;
    for (let d = 25; d < 80 && far < 0; d++) if (humans.terrain.walkable(camp.center + d)) far = camp.center + d;
    const fx = (far % SIZE) + 0.3;
    const fy = Math.floor(far / SIZE) + 0.6;
    people.placeAt(man, fx, fy);
    const death = humans.die(man, DeathCause.Predator, simulation.clock.tick);
    // Nobody inherits: the knife lies where he fell.
    expect(production.hasItem(woman, knife)).toBe(false);
    expect(production.ground).toHaveLength(1);
    expect(production.ground[0]!.x).toBeCloseTo(fx);
    // Someone still far away sees nothing; passing close by, she finds and takes it.
    people.placeAt(woman, fx + data.production.ground.findTiles + 2, fy);
    findBelongings(humans.life, woman);
    expect(production.hasItem(woman, knife)).toBe(false);
    people.placeAt(woman, fx + 1, fy);
    findBelongings(humans.life, woman);
    expect(production.hasItem(woman, knife)).toBe(true);
    expect(production.ground).toHaveLength(0);
    const found = simulation.journal.all().find((event) => event.type === BELONGINGS_FOUND)!;
    expect(found.text).toContain(people.names[man]!);
    expect(found.causes).toContain(death);
  });

  it('the memory of the dead survives in those who knew them', () => {
    const simulation = world();
    const { humans } = simulation;
    const { social } = humans;
    const { woman, man } = couple(simulation);
    humans.die(man, DeathCause.OldAge, simulation.clock.tick);
    social.onLearn(woman, [...social.news.facts.values()].find((fact) => fact.kind === 'death' && fact.subject === man)!, 0, -1);
    expect(memoryWeight(social, woman, 'lostOne', man)).toBeGreaterThan(0);
  });
});

describe('determinism', () => {
  it('same seed, same births, diseases and deaths', () => {
    const run = (): string => {
      const simulation = world(7);
      simulation.step(dayTicks * 60);
      const { people, life } = simulation.humans;
      return JSON.stringify([people.count, people.living, life.births, life.conceptions, Array.from(life.state.disease.slice(0, people.count)), simulation.journal.size]);
    };
    expect(run()).toBe(run());
  });
});
