import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/sim/core/simulation';
import type { GameData } from '../../../src/sim/core/game-data';
import { Family } from '../../../src/sim/systems/ideas/idea';
import { IDEA_EVENTS } from '../../../src/sim/systems/ideas/texts';
import { LANGUAGE_SLOTS } from '../../../src/sim/systems/ideas/holdings';
import { languageSplits, intelligibility } from '../../../src/sim/systems/ideas/language';
import { cultureSplits } from '../../../src/sim/systems/ideas/culture';
import { barter } from '../../../src/sim/systems/ideas/trade';
import { religionTalk } from '../../../src/sim/systems/ideas/religion';
import { scission } from '../../../src/sim/systems/groups/tribes';
import { discoveries } from '../../../src/sim/systems/ideas/knowledge';
import { dataWithSize } from '../world/helpers';
import { describeIdeas, describePersonIdeas } from '../../../src/sim/systems/ideas/describe';

const SIZE = 320;

function world(seed = 42, change?: (data: GameData) => void): Simulation {
  const data = dataWithSize(SIZE);
  change?.(data);
  return new Simulation(seed, data);
}

function day(simulation: Simulation, days = 1): void {
  simulation.step(days * simulation.data.time.ticksPerDay);
}

function knowledgeIndex(simulation: Simulation, id: string): number {
  return simulation.data.knowledge.knowledge.findIndex((item) => item.id === id);
}

/** Splits the first households of the starting tribe into a tribe of their own (as the groups tests do). */
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

describe('the ideas of the starting tribe', () => {
  it('everyone speaks the tribe’s language, holds its culture, and knows only gathering, fire and huts', () => {
    const simulation = world();
    const { ideas, humans } = simulation;
    const people = humans.people;
    const language = ideas.holdings.motherTongue(0);
    const culture = ideas.holdings.culture[0]!;
    expect(ideas.ideas[language]!.family).toBe(Family.Language);
    expect(ideas.ideas[culture]!.family).toBe(Family.Culture);
    for (let p = 0; p < people.count; p++) {
      expect(ideas.holdings.motherTongue(p)).toBe(language);
      expect(ideas.holdings.culture[p]).toBe(culture);
      const known = simulation.data.knowledge.knowledge.filter((_, k) => ideas.holdings.knows(p, k)).map((item) => item.id);
      expect(known.sort()).toEqual(['fire', 'gathering', 'huts']);
      expect(ideas.holdings.religion[p]).toBe(-1);
    }
    // Names come from the language: unique, and the tribe is named after a people.
    expect(new Set(people.names.slice(0, people.count)).size).toBe(people.count);
    expect(simulation.groups.tribes()[0]!.name).toMatch(/^la tribu des [A-Z]/);
  });
});

describe('knowledge', () => {
  it('a newborn knows nothing; children learn what their parents know by being taught', () => {
    const simulation = world(7);
    const { ideas, humans } = simulation;
    const people = humans.people;
    const fire = knowledgeIndex(simulation, 'fire');
    // A child of the starting tribe who has not learnt the fire yet.
    const child = [...Array(people.count).keys()].find((p) => people.ageYears[p]! >= 5 && people.ageYears[p]! < 10 && people.mother[p]! >= 0)!;
    expect(child).toBeDefined();
    const h = ideas.holdings;
    h.known[child] = h.known[child]! & ~(1 << fire);
    h.learning[child * h.knowledgeCount + fire] = 0;
    day(simulation, 40);
    expect(h.knows(child, fire)).toBe(true);
    expect(h.teacher[child * h.knowledgeCount + fire]).toBeGreaterThanOrEqual(0);
  });

  it('with the need and an able mind, someone works a new piece of knowledge out step by step (journal: the breakthrough, then the discovery it caused)', () => {
    const simulation = world(3, (data) => {
      data.ideas.knowledge.discoveryPerDay = 0.05;
      data.ideas.knowledge.ponder.abandonPerDay = 0;
      data.ideas.knowledge.ponder.idleAbandonPerDay = 0;
    });
    const h = simulation.ideas.holdings;
    let seenPondering = false;
    for (let d = 0; d < 200 && !simulation.journal.all().some((event) => event.type === IDEA_EVENTS.discovery); d++) {
      day(simulation, 1);
      for (let p = 0; p < simulation.humans.people.count && !seenPondering; p++) {
        if (h.ponder[p]! < 0) continue;
        seenPondering = true;
        const facts = describePersonIdeas(simulation.ideas, p)!.pondering!;
        expect(facts.knowledge.length).toBeGreaterThan(0);
        expect(facts.conditions.some((c) => c.label.startsWith('Besoin'))).toBe(true);
      }
    }
    expect(seenPondering).toBe(true);
    const discovery = simulation.journal.all().find((event) => event.type === IDEA_EVENTS.discovery);
    expect(discovery).toBeDefined();
    expect(discovery!.text).toMatch(/découvre/);
    const lead = simulation.journal.get(discovery!.causes[0]!)!;
    expect(lead.type).toBe(IDEA_EVENTS.breakthrough);
    expect(lead.actors[0]).toEqual(discovery!.actors[0]);
    expect(lead.tick).toBeLessThan(discovery!.tick);
    const idea = simulation.ideas.ideas.find((other) => other.event === discovery!.id)!;
    expect(idea.family).toBe(Family.Knowledge);
    expect(simulation.ideas.holdings.knows(idea.founder, idea.knowledge)).toBe(true);
    expect(h.ponder[idea.founder]).toBe(-1);
  });

  it('one gets closer faster on the days one practises the craft; one may give up', () => {
    const simulation = world(3, (data) => {
      data.ideas.knowledge.discoveryPerDay = 0;
      data.ideas.knowledge.ponder.abandonPerDay = 0;
      data.ideas.knowledge.ponder.idleAbandonPerDay = 0;
    });
    day(simulation, 1);
    const { ideas, humans } = simulation;
    const h = ideas.holdings;
    const k = knowledgeIndex(simulation, 'pottery');
    const person = [...Array(humans.people.count).keys()].find((p) => humans.people.ageYears[p]! >= 20 && humans.people.alive[p] === 1)!;
    const skill = ideas.skillOf[k]!;
    // Pottery needs what the camp may lack: here only the effect of practice is measured.
    ideas.environmentMask[k] = 0;
    ideas.requiredMask[k] = 0;
    const progressOneDay = (practise: boolean): number => {
      h.ponder[person] = k;
      h.ponderProgress[person] = 0;
      h.ponderLead[person] = -1;
      humans.life.state.lastSkill[person] = practise ? skill : -1;
      humans.life.state.lastSkillStep[person] = practise ? ideas.lastHumanStep : -1;
      discoveries(ideas);
      return h.ponderProgress[person]!;
    };
    const idle = progressOneDay(false);
    const working = progressOneDay(true);
    expect(idle).toBeGreaterThan(0);
    expect(working).toBeGreaterThan(3 * idle);
    // Discouraged for sure: the search stops.
    simulation.data.ideas.knowledge.ponder.idleAbandonPerDay = 1;
    progressOneDay(false);
    expect(h.ponder[person]).toBe(-1);
  });

  it('knowledge whose last holder dies without a pupil is lost', () => {
    const simulation = world(5, (data) => {
      data.ideas.knowledge.teachPerDay = 0;
      data.ideas.knowledge.observePerDay = 0;
    });
    const { ideas, humans } = simulation;
    const k = knowledgeIndex(simulation, 'pottery');
    const holder = 0;
    const idea = ideas.addIdea(Family.Knowledge, 'Poterie', -1, holder, -1, -1);
    idea.knowledge = k;
    ideas.learn(holder, k, idea.id, -1);
    humans.die(holder, 5, simulation.clock.tick);
    day(simulation, 1);
    const lost = simulation.journal.all().find((event) => event.type === IDEA_EVENTS.lost);
    expect(lost).toBeDefined();
    expect(lost!.text).toMatch(/poterie/i);
    expect(idea.alive).toBe(false);
  });
});

describe('languages and cultures', () => {
  it('a tribe that speaks apart ends up with a daughter language and a culture of its own', () => {
    const simulation = world(11, (data) => {
      data.groups.scission.minMembers = 2;
    });
    const { ideas, groups } = simulation;
    day(simulation, 1);
    splitOff(simulation, 3);
    const [, split] = groups.tribes();
    const h = ideas.holdings;
    const before = h.motherTongue(split!.members[0]!);
    // Centuries apart, compressed: their speech and their values drift far from the others'.
    for (const p of split!.members) {
      for (let d = 0; d < h.dialectCount; d++) h.dialect[p * h.dialectCount + d] = 0.95;
      for (let v = 0; v < h.valueCount; v++) h.values[p * h.valueCount + v] = 0.95;
    }
    ideas.params.language.minMembers = 2;
    ideas.params.culture.minMembers = 2;
    languageSplits(ideas);
    cultureSplits(ideas);
    const after = h.motherTongue(split!.members[0]!);
    expect(after).not.toBe(before);
    expect(ideas.ideas[after]!.parent).toBe(before);
    expect(intelligibility(ideas, before, after)).toBeGreaterThan(0);
    expect(intelligibility(ideas, before, after)).toBeLessThan(1);
    const types = simulation.journal.all().map((event) => event.type);
    expect(types).toContain(IDEA_EVENTS.language);
    expect(types).toContain(IDEA_EVENTS.culture);
    // Their children get names in the new language.
    expect(ideas.childName(split!.members[0]!, true).length).toBeGreaterThan(1);
  });

  it('a spouse of another language becomes bilingual living with their partner', () => {
    const simulation = world(13);
    const { ideas, humans } = simulation;
    const people = humans.people;
    const a = [...Array(people.count).keys()].find((p) => people.spouse[p]! >= 0)!;
    const b = people.spouse[a]!;
    const foreign = ideas.addIdea(Family.Language, 'zorak', -1, -1, -1, -1);
    foreign.phonology = ideas.ideas[ideas.holdings.motherTongue(a)]!.phonology;
    ideas.holdings.language[b * LANGUAGE_SLOTS] = foreign.id;
    expect(ideas.understanding(a, b)).toBeLessThan(0.5);
    day(simulation, 20);
    expect(ideas.holdings.fluencyIn(a, foreign.id)).toBeGreaterThan(0.15);
    expect(ideas.understanding(a, b)).toBeGreaterThan(0.15);
  });
});

describe('religions', () => {
  it('a spiritual person who loses someone dear may begin to revere the ancestors: a religion is born', () => {
    const simulation = world(17, (data) => {
      data.ideas.religion.griefChance = 1;
    });
    const { humans } = simulation;
    const people = humans.people;
    const spirituality = humans.params.traits.findIndex((trait) => trait.id === 'spirituality');
    for (let p = 0; p < people.count; p++) people.traits[p * people.traitCount + spirituality] = 1;
    const dead = [...Array(people.count).keys()].find((p) => people.spouse[p]! >= 0)!;
    humans.die(dead, 5, simulation.clock.tick);
    day(simulation, 1);
    const birth = simulation.journal.all().find((event) => event.type === IDEA_EVENTS.religion);
    expect(birth).toBeDefined();
    expect(birth!.text).toMatch(/ancêtres/);
    expect(birth!.causes.length).toBeGreaterThan(0);
    const religion = simulation.ideas.ideas.find((idea) => idea.family === Family.Religion)!;
    expect(religion.founder).toBeGreaterThanOrEqual(0);
  });
});

describe('believing or not (the choice of each person)', () => {
  /** Everyone of the tribe believes in a new faith; `doubter` has a critical, curious, unspiritual mind. */
  function faithful(seed: number, change?: (data: GameData) => void): { simulation: Simulation; doubter: number; religion: number } {
    const simulation = world(seed, change);
    const { humans, ideas } = simulation;
    const people = humans.people;
    day(simulation, 1);
    const trait = (id: string): number => humans.params.traits.findIndex((t) => t.id === id);
    const religion = ideas.addIdea(Family.Religion, 'Essai', -1, 0, -1, -1).id;
    ideas.ideas[religion]!.mean = [0.8, 0.2, 0.2];
    for (let p = 0; p < people.count; p++) {
      ideas.holdings.religion[p] = religion;
      ideas.holdings.piety[p] = 0.6;
      people.traits[p * people.traitCount + trait('independence')] = 0.4;
      people.traits[p * people.traitCount + trait('spirituality')] = 0.7;
    }
    const doubter = [...Array(people.count).keys()].find((p) => people.ageYears[p]! >= 20 && !simulation.groups.tribes()[0]!.leaders.includes(p))!;
    people.traits[doubter * people.traitCount + trait('independence')] = 1;
    people.traits[doubter * people.traitCount + trait('curiosity')] = 1;
    people.traits[doubter * people.traitCount + trait('spirituality')] = 0;
    return { simulation, doubter, religion };
  }

  it('a critical mind among believers loses faith in the end, and the journal says why', () => {
    // The hold of the believers around is measured by the next test: here, a tolerant culture.
    const { simulation, doubter } = faithful(24, (data) => {
      data.ideas.religion.pressurePerYear = 0;
    });
    const h = simulation.ideas.holdings;
    day(simulation, 110);
    expect(h.religion[doubter]).toBe(-1);
    expect(h.lostFaith[doubter]).toBe(1);
    const lost = simulation.journal.all().find((event) => event.type === IDEA_EVENTS.faithLost && event.actors.some((actor) => actor.id === doubter));
    expect(lost).toBeDefined();
    expect(lost!.text).toMatch(/ne croit plus aux /);
    expect(describePersonIdeas(simulation.ideas, doubter)!.faithNote).toMatch(/perdu la foi/);
    // The others, who do not doubt, keep their faith.
    const others = [...Array(simulation.humans.people.count).keys()].filter((p) => p !== doubter && simulation.humans.people.alive[p] === 1);
    expect(others.filter((p) => h.religion[p]! >= 0).length).toBeGreaterThan(others.length * 0.8);
  });

  it('where unbelief is frowned upon, the believers around hold a doubter in the faith much longer', () => {
    const tolerant = faithful(23, (data) => {
      data.ideas.religion.pressurePerYear = 0;
    });
    const pressing = faithful(23, (data) => {
      data.ideas.religion.pressurePerYear = 5;
    });
    day(tolerant.simulation, 30);
    day(pressing.simulation, 30);
    expect(tolerant.simulation.ideas.holdings.piety[tolerant.doubter]).toBeLessThan(pressing.simulation.ideas.holdings.piety[pressing.doubter]!);
  });

  it('a doubter is hard to win over, and someone who believes clings to their faith', () => {
    const simulation = world(29);
    const { ideas, humans } = simulation;
    day(simulation, 1);
    const people = humans.people;
    const trait = (id: string): number => humans.params.traits.findIndex((t) => t.id === id);
    const religion = ideas.addIdea(Family.Religion, 'Essai', -1, 0, -1, -1).id;
    const other = ideas.addIdea(Family.Religion, 'Autre', -1, 0, -1, -1).id;
    const [speaker, open, doubter, believer] = [0, 1, 2, 3];
    ideas.holdings.religion[speaker] = religion;
    ideas.holdings.piety[speaker] = 1;
    for (const p of [open, doubter, believer]) people.traits[p * people.traitCount + trait('spirituality')] = 0.9;
    people.traits[doubter * people.traitCount + trait('spirituality')] = 0;
    people.traits[doubter * people.traitCount + trait('independence')] = 1;
    ideas.holdings.religion[believer] = other;
    ideas.holdings.piety[believer] = 0.3;
    const wins = { open: 0, doubter: 0, believer: 0 };
    const tries = 400;
    for (let k = 0; k < tries; k++) {
      for (const [name, p] of [
        ['open', open],
        ['doubter', doubter],
        ['believer', believer],
      ] as const) {
        ideas.holdings.religion[p] = p === believer ? other : -1;
        ideas.holdings.piety[p] = p === believer ? 0.3 : 0;
        religionTalk(ideas, speaker, p);
        if (ideas.holdings.religion[p] === religion) wins[name]++;
      }
    }
    expect(wins.open).toBeGreaterThan(wins.believer * 2);
    expect(wins.open).toBeGreaterThan(wins.doubter * 2);
  });
});

describe('exchanges', () => {
  it('two people of different tribes who meet may barter what each lacks', () => {
    const simulation = world(19, (data) => {
      data.groups.scission.minMembers = 2;
      data.ideas.trade.tradeChance = 1;
      data.ideas.trade.misunderstanding = 0;
    });
    const { ideas, groups, humans, production } = simulation;
    day(simulation, 1);
    splitOff(simulation, 3);
    day(simulation, 1);
    const [big, small] = groups.tribes();
    big!.known.get(small!.id)!.opinion = 100;
    small!.known.get(big!.id)!.opinion = 100;
    const a = big!.members.find((p) => humans.people.ageYears[p]! >= 20)!;
    const b = small!.members.find((p) => humans.people.ageYears[p]! >= 20)!;
    const items = production.catalog.itemIndex;
    const basket = items.get('basket')!;
    const knife = items.get('stone_knife')!;
    const hospitality = ideas.params.values.findIndex((value) => value.id === 'hospitality');
    ideas.holdings.values[a * ideas.holdings.valueCount + hospitality] = 1;
    ideas.holdings.values[b * ideas.holdings.valueCount + hospitality] = 1;
    production.carried[a]!.put(basket, 3, 0.5, a);
    production.carried[b]!.put(knife, 3, 0.5, b);
    // They meet: several encounters, until they strike a deal (each may hesitate).
    for (let k = 0; k < 20 && !simulation.journal.all().some((event) => event.type === IDEA_EVENTS.trade); k++) barter(ideas, a, b, big!, small!);
    const trade = simulation.journal.all().find((event) => event.type === IDEA_EVENTS.trade);
    expect(trade).toBeDefined();
    expect(trade!.text).toMatch(/troc/);
  });
});

describe('legibility and determinism', () => {
  it('the ideas panel and the character sheet describe what people carry', () => {
    const simulation = world(23);
    day(simulation, 2);
    const facts = describeIdeas(simulation.ideas);
    expect(facts.ideas.some((idea) => idea.family === Family.Language && idea.alive)).toBe(true);
    expect(facts.places.length).toBeGreaterThan(0);
    const sheet = describePersonIdeas(simulation.ideas, 0)!;
    expect(sheet.languages[0]!.fluency).toBeGreaterThan(0);
    expect(sheet.knowledge.length).toBe(3);
  });

  it('same seed => same names, same ideas, same journal of ideas', () => {
    const run = (): string => {
      const simulation = world(29, (data) => {
        data.ideas.knowledge.discoveryPerDay = 0.01;
      });
      day(simulation, 40);
      const { ideas, journal } = simulation;
      return JSON.stringify([
        simulation.humans.people.names.slice(0, simulation.humans.people.count),
        ideas.ideas.map((idea) => [idea.family, idea.name, idea.holders]),
        journal.all().filter((event) => event.type.startsWith('ideas.')).map((event) => event.text),
      ]);
    };
    expect(run()).toBe(run());
  });
});

describe('the knowledge tree (view K)', () => {
  it('shows, for a tribe, what it knows, what someone is working out (and who), what is within reach and what is not', async () => {
    const { describeKnowledgeTree } = await import('../../../src/sim/systems/ideas/knowledge-tree');
    const simulation = world(3);
    day(simulation, 1);
    const { ideas, humans, data } = simulation;
    const pottery = knowledgeIndex(simulation, 'pottery');
    const person = [...Array(humans.people.count).keys()].find((p) => humans.people.ageYears[p]! >= 20)!;
    ideas.holdings.ponder[person] = pottery;
    ideas.holdings.ponderProgress[person] = 0.3;
    const recipes = data.recipes.recipes.map((r) => ({ id: r.id, name: r.name, knowledge: r.knowledge ? [r.knowledge] : [] }));
    const buildings = data.buildings.buildings.map((b) => ({ id: b.id, name: b.name, knowledge: b.knowledge }));
    const before = simulation.journal.size;
    const tree = describeKnowledgeTree(ideas, -1, recipes, buildings)!;
    const node = (id: string) => tree.nodes.find((n) => n.id === id)!;
    expect(node('k:gathering').state).toBe('known');
    expect(node('k:pottery').state).toBe('pondering');
    expect(node('k:pottery').ponderers).toEqual([{ person, name: humans.people.names[person], progress: 30 }]);
    expect(node('k:pottery').explain.some((line) => line.startsWith('Besoin'))).toBe(true);
    // A recipe or a building is linked to its knowledge.
    const fired = tree.nodes.find((n) => n.kind === 'recipe' && n.requires.includes('k:pottery'));
    expect(fired?.state).toBe('out');
    expect(node('b:hut').requires.length).toBeGreaterThan(0);
    // Something needing a knowledge nobody has is out of reach, and says what is missing.
    const far = tree.nodes.find((n) => n.kind === 'knowledge' && n.requires.some((r) => node(r).state !== 'known'))!;
    expect(far.state).toBe('out');
    expect(far.explain.some((line) => line.includes('✗'))).toBe(true);
    // Looking changes nothing.
    expect(simulation.journal.size).toBe(before);
  });
});
