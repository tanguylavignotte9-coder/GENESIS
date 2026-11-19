import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/sim/core/simulation';
import { updateAmbitions } from '../../../src/sim/systems/individuals/social/ambitions';
import { memoryWeight, remember, stir } from '../../../src/sim/systems/individuals/social/feelings';
import { COUPLE_FORMED, FALLING_OUT, MOURNING } from '../../../src/sim/systems/individuals/social/milestones';
import { knows, tellNews } from '../../../src/sim/systems/individuals/social/news';
import { AMBITIONS, EMOTIONS, MEMORY_KINDS } from '../../../src/sim/systems/individuals/social/params';
import { affectionFor, feel, relationSlot } from '../../../src/sim/systems/individuals/social/relations';
import { AMBITION_SLOTS, EMOTION_INDEX, Kin } from '../../../src/sim/systems/individuals/social/state';
import { relationReasons } from '../../../src/sim/systems/individuals/social/texts';
import { dataWithSize } from '../world/helpers';

const SIZE = 256;
const data = dataWithSize(SIZE);
const hourTicks = data.time.ticksPerDay / 24;

function world(seed = 42): Simulation {
  return new Simulation(seed, dataWithSize(SIZE));
}

/** Two living adults of the tribe who are not family. */
function twoStrangers(simulation: Simulation): [number, number] {
  const { people, social } = simulation.humans;
  for (let a = 0; a < people.count; a++) {
    for (let b = a + 1; b < people.count; b++) {
      if (people.ageYears[a]! >= 18 && people.ageYears[b]! >= 18 && social.kinOf(a, b) === 0) return [a, b];
    }
  }
  throw new Error('no strangers');
}

/** Puts `b` next to `a`. */
function sideBySide(simulation: Simulation, a: number, b: number): void {
  const { people } = simulation.humans;
  people.placeAt(b, people.px[a]! + 1, people.py[a]!);
}

describe('relations', () => {
  it('the starting tribe knows each other: family ties with their feelings, and only the relations that count', () => {
    const simulation = world();
    const { people, social } = simulation.humans;
    const child = Array.from({ length: people.count }, (_, p) => p).find((p) => people.mother[p]! >= 0)!;
    const mother = people.mother[child]!;
    const slot = social.state.slotOf(child, mother);
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(social.state.kin[slot]! & Kin.Parent).toBeTruthy();
    expect(social.state.affection[slot]).toBeGreaterThanOrEqual(data.social.relations.kin.parent.affection - data.social.relations.startingSpread);
    for (let p = 0; p < people.count; p++) {
      let used = 0;
      for (let k = p * social.state.relationSlots; k < (p + 1) * social.state.relationSlots; k++) if (social.state.relOther[k]! >= 0) used++;
      expect(used).toBeLessThanOrEqual(data.social.relations.slots);
    }
  });

  it('keeps the main reasons of a relation ("Lo a nourri Ka (hiver de l’an 1)")', () => {
    const simulation = world();
    const { social } = simulation.humans;
    const [a, b] = twoStrangers(simulation);
    feel(social, a, b, { affection: 10, trust: 5, respect: 0 }, 'fed');
    feel(social, a, b, { affection: 2, trust: 0, respect: 0 }, 'chat');
    const reasons = relationReasons(social, social.state.slotOf(a, b)).map((reason) => reason.text);
    const fed = reasons.find((text) => text.includes(`${social.name(b)} a nourri ${social.name(a)}`));
    expect(fed).toContain('an 1');
  });

  it('a chat brings two people closer on both sides, and they tell each other the news', () => {
    const simulation = world();
    const { social } = simulation.humans;
    const [a, b] = twoStrangers(simulation);
    const before = [affectionFor(social, a, b), affectionFor(social, b, a)];
    const fact = social.news.add('food', a, -1, simulation.humans.tileOf(a), 0, -1);
    social.state.newsFact[a * social.state.newsSlots] = fact.id;
    fact.knowers++;
    social.params.conversation.frictionChance = 0;
    social.talk(a, b, 'chat');
    expect(affectionFor(social, a, b)).toBeGreaterThan(before[0]!);
    expect(affectionFor(social, b, a)).toBeGreaterThan(before[1]!);
    expect(knows(social, b, fact.id)).toBe(true);
  });

  it('quarrels make a friendship fall apart, told in the journal with its reason', () => {
    const simulation = world();
    const { social } = simulation.humans;
    const [a, b] = twoStrangers(simulation);
    feel(social, a, b, { affection: 60, trust: 40, respect: 20 }, 'chat');
    feel(social, b, a, { affection: 60, trust: 40, respect: 20 }, 'chat');
    for (let k = 0; k < 10; k++) social.talk(a, b, 'argue');
    const event = simulation.journal.all().find((e) => e.type === FALLING_OUT);
    expect(event).toBeDefined();
    expect(event!.text).toContain('disputes');
    expect(memoryWeight(social, b, 'quarrel', a)).toBeGreaterThan(0);
  });
});

describe('limited knowledge and grief', () => {
  it('a death is known by the witnesses only; grief starts when one learns it, from someone who tells it', () => {
    const simulation = world();
    const { humans } = simulation;
    const { people, social } = humans;
    const child = Array.from({ length: people.count }, (_, p) => p).find((p) => people.mother[p]! >= 0 && people.father[p]! >= 0)!;
    const mother = people.mother[child]!;
    const witnessPerson = Array.from({ length: people.count }, (_, p) => p).find((p) => p !== child && p !== mother && social.kinOf(p, child) === 0)!;
    // The child dies far from the mother, under the eyes of one person only.
    for (let p = 0; p < people.count; p++) {
      people.placeAt(p, 10 + (p % 5) + 0.5, 10 + 0.5);
    }
    people.placeAt(child, 200 + 0.5, 200 + 0.5);
    people.placeAt(witnessPerson, 201 + 0.5, 200 + 0.5);
    humans['rebuildGrid']();
    people.alive[child] = 0;
    social.onDeath(child, 1, -1);
    const deathFact = [...social.news.facts.values()].find((f) => f.kind === 'death' && f.subject === child)!;
    expect(knows(social, witnessPerson, deathFact.id)).toBe(true);
    expect(knows(social, mother, deathFact.id)).toBe(false);
    expect(memoryWeight(social, mother, 'grief', child)).toBe(0);
    tellNews(social, witnessPerson, mother);
    expect(knows(social, mother, deathFact.id)).toBe(true);
    expect(memoryWeight(social, mother, 'grief', child)).toBeGreaterThan(0);
    expect(social.state.emotion(mother, EMOTION_INDEX.sadness)).toBeGreaterThan(20);
    const mourning = simulation.journal.all().find((e) => e.type === MOURNING && e.details['person'] === mother);
    expect(mourning?.text).toContain(`par ${social.name(witnessPerson)}`);
  });

  it('news loses details when retold, never more than "heard from far"', () => {
    const simulation = world();
    const { social } = simulation.humans;
    const [a, b] = twoStrangers(simulation);
    const fact = social.news.add('danger', a, -1, 0, 0, -1);
    social.params.news.detailLossChance = 1;
    social.state.newsFact[a * social.state.newsSlots] = fact.id;
    social.state.newsDetail[a * social.state.newsSlots] = 2;
    fact.knowers++;
    tellNews(social, a, b);
    const slot = Array.from({ length: social.state.newsSlots }, (_, k) => b * social.state.newsSlots + k).find((k) => social.state.newsFact[k] === fact.id)!;
    expect(social.state.newsDetail[slot]).toBe(2);
  });
});

describe('emotions, memories and personality', () => {
  it('memories fade with time; emotions calm down but a strong grief keeps sadness up', () => {
    const simulation = world();
    const { social } = simulation.humans;
    const [a, b] = twoStrangers(simulation);
    // No consolation in this test (it would ease the sadness for a while).
    social.params.conversation.consoleSadnessRelief = 0;
    social.params.conversation.confideSadnessRelief = 0;
    remember(social, a, 'grief', b, 1);
    const start = memoryWeight(social, a, 'grief', b);
    simulation.step(10 * data.time.ticksPerDay);
    const later = memoryWeight(social, a, 'grief', b);
    expect(later).toBeLessThan(start);
    expect(later).toBeGreaterThan(0);
    expect(social.state.emotion(a, EMOTION_INDEX.sadness)).toBeGreaterThanOrEqual(later * data.social.memories.feelShare - 1);
    stir(social, a, 'anger', 80);
    simulation.step(24 * hourTicks);
    expect(social.state.emotion(a, EMOTION_INDEX.anger)).toBeLessThan(80);
  });

  it('great events shape the personality a little, never beyond the limit from birth', () => {
    const simulation = world();
    const { social, people } = simulation.humans;
    const [a, b] = twoStrangers(simulation);
    const prudence = social.traitIndex('prudence');
    const born = people.trait(a, prudence);
    for (let k = 0; k < 50; k++) {
      social.state.memKind.fill(-1, a * social.state.memorySlots, (a + 1) * social.state.memorySlots);
      remember(social, a, 'attacked', b, 1);
    }
    const now = people.trait(a, prudence);
    expect(now).toBeGreaterThan(born);
    expect(now - born).toBeLessThanOrEqual(data.social.memories.maxTraitDrift + 1e-6);
  });
});

describe('couples', () => {
  it('a courtship that is welcome becomes a couple, told in the journal', () => {
    const simulation = world();
    const { social, people } = simulation.humans;
    const [a, b] = twoStrangers(simulation);
    people.spouse[a] = -1;
    people.spouse[b] = -1;
    people.female[a] = 0;
    people.female[b] = 1;
    people.ageYears[a] = 25;
    people.ageYears[b] = 24;
    social.state.sameSex[a] = 0;
    social.state.sameSex[b] = 0;
    social.params.conversation.frictionChance = 0;
    feel(social, a, b, { affection: 60, trust: 30, respect: 10 }, 'chat');
    feel(social, b, a, { affection: 40, trust: 30, respect: 10 }, 'chat');
    for (let k = 0; k < 5 && people.spouse[a] !== b; k++) social.talk(a, b, 'seduce');
    expect(people.spouse[a]).toBe(b);
    expect(people.spouse[b]).toBe(a);
    const event = simulation.journal.all().find((e) => e.type === COUPLE_FORMED);
    expect(event?.text).toContain(social.name(a));
  });

  it('someone who cannot be drawn to the suitor turns them down', () => {
    const simulation = world();
    const { social, people } = simulation.humans;
    const [a, b] = twoStrangers(simulation);
    people.female[a] = 0;
    people.female[b] = 0;
    social.state.sameSex[b] = 0;
    social.talk(a, b, 'seduce');
    expect(people.spouse[a]).not.toBe(b);
    expect(memoryWeight(social, a, 'rejected', b)).toBeGreaterThan(0);
  });
});

describe('sharing', () => {
  it('someone carrying food gives it to a hungry relative, who is grateful', () => {
    const simulation = world();
    const { social, people } = simulation.humans;
    const { production } = simulation;
    const child = Array.from({ length: people.count }, (_, p) => p).find((p) => people.mother[p]! >= 0)!;
    const mother = people.mother[child]!;
    sideBySide(simulation, mother, child);
    simulation.humans['rebuildGrid']();
    production.carried[mother]!.put(production.catalog.item('berries'), 10, 0.5, mother);
    people.hunger[mother] = 10;
    people.hunger[child] = 80;
    const inputs = new Float64Array(100);
    social.fillInputs(mother, inputs, 0);
    expect(social.giftTarget(mother)).toBe(child);
    expect(social.give(mother, child)).toBe(true);
    expect(production.carriedFood(child)).toBeGreaterThan(0);
    expect(memoryWeight(social, child, 'fed', mother)).toBeGreaterThan(0);
    expect(relationReasons(social, social.state.slotOf(child, mother)).some((reason) => reason.text.includes('a nourri'))).toBe(true);
  });
});

describe('ambitions', () => {
  it('everybody has 1 to 3 ambitions born of the situation; a found partner ends the search', () => {
    const simulation = world();
    simulation.step(2 * data.time.ticksPerDay);
    const { social, people } = simulation.humans;
    for (let p = 0; p < people.count; p++) {
      if (people.alive[p] === 0) continue;
      let n = 0;
      for (let k = p * AMBITION_SLOTS; k < (p + 1) * AMBITION_SLOTS; k++) if (social.state.ambition[k]! >= 0) n++;
      expect(n).toBeLessThanOrEqual(data.social.ambitions.max);
    }
    const [a, b] = twoStrangers(simulation);
    people.spouse[a] = -1;
    const partner = AMBITIONS.indexOf('findPartner');
    social.state.ambition.fill(-1, a * AMBITION_SLOTS, (a + 1) * AMBITION_SLOTS);
    social.params.ambitions.kinds.makeFriends.weight = 0;
    social.params.ambitions.kinds.excelSkill.weight = 0;
    updateAmbitions(social, a);
    expect(Array.from(social.state.ambition.slice(a * AMBITION_SLOTS, (a + 1) * AMBITION_SLOTS))).toContain(partner);
    people.spouse[a] = b;
    people.spouse[b] = a;
    updateAmbitions(social, a);
    expect(Array.from(social.state.ambition.slice(a * AMBITION_SLOTS, (a + 1) * AMBITION_SLOTS))).not.toContain(partner);
  });
});

describe('social life over time', () => {
  it('people talk, relations change, and the same seed gives the same social history', () => {
    const run = (): string => {
      const simulation = world(5);
      simulation.step(6 * data.time.ticksPerDay);
      const s = simulation.humans.social.state;
      let sum = 0;
      for (let k = 0; k < s.affection.length; k++) sum += s.affection[k]! * (k % 7);
      return `${sum.toFixed(3)}|${simulation.journal.size}|${Array.from(s.memKind).join('')}`;
    };
    const first = run();
    expect(first).toEqual(run());
    const simulation = world(5);
    const talks = new Set<string>();
    for (let h = 0; h < 6 * 24; h++) {
      simulation.step(hourTicks);
      const { people, actions } = simulation.humans;
      for (let p = 0; p < people.count; p++) if (people.alive[p] === 1) talks.add(actions[people.action[p]!]!.def.behavior);
    }
    expect(talks.has('converse')).toBe(true);
  });

  it('a relation slot is made for anyone one talks to (even a stranger)', () => {
    const simulation = world();
    const { social } = simulation.humans;
    const [a, b] = twoStrangers(simulation);
    const slot = social.state.slotOf(a, b);
    if (slot >= 0) social.state.relOther[slot] = -1;
    expect(relationSlot(social, a, b, true)).toBeGreaterThanOrEqual(0);
  });

  it('declares every emotion and memory kind in the data', () => {
    for (const id of EMOTIONS) expect(data.social.emotions[id].name).not.toBe('');
    for (const kind of MEMORY_KINDS) expect(data.social.memories.kinds[kind].halfLifeDays).toBeGreaterThan(0);
  });
});
