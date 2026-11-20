import { DeathCause } from '../individuals/people';
import type { Group } from './group';
import type { GroupsSystem } from './groups-system';
import { FACTORS, POWER_FEATURES, type Factor, type PowerFeature, type Regime } from './params';
import { Family } from '../ideas/idea';

const FULL = 100;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Relation of `person` toward `other` on one axis (0 when they have none). */
export function feeling(sys: GroupsSystem, person: number, other: number, axis: 'affection' | 'trust' | 'respect'): number {
  const state = sys.humans.social.state;
  const slot = state.slotOf(person, other);
  return slot < 0 ? 0 : state[axis][slot]!;
}

/** Deaths of members by hunger, cold or disease within the last year. */
export function recentSufferings(sys: GroupsSystem, group: Group, cause = -1): number {
  const yearDays = sys.humans.life.yearDays;
  return group.sufferings.filter((s) => sys.day - s.day <= yearDays && (cause < 0 || s.cause === cause)).length;
}

/** The situation of a group, each part measured 0..1: what favours one regime, rule or strategy. */
export function groupFactors(sys: GroupsSystem, group: Group): Record<Factor, number> {
  const { params, people } = sys;
  const f = params.factors;
  const members = group.members.length;
  const adults = sys.adults(group);
  const yearDays = sys.humans.life.yearDays;
  let tribe: Group = group;
  while (tribe.level > 0 && sys.groups[tribe.parent]) tribe = sys.groups[tribe.parent]!;
  const production = sys.humans.production;
  const dailyFood = production.body.dailyFood * Math.max(1, tribe.members.length);
  const stockDays = tribe.camp >= 0 && production.camps[tribe.camp] ? production.stockFood(tribe.camp) / dailyFood : 0;
  let elders = 0;
  let rivals = 0;
  const state = sys.humans.social.state;
  const rivalLine = sys.humans.social.params.relations.rivalAffection;
  for (const person of adults) {
    if (people.ageYears[person]! >= params.elderAge) elders++;
    for (let s = person * state.relationSlots; s < (person + 1) * state.relationSlots; s++) {
      if (state.relOther[s]! >= 0 && state.affection[s]! <= rivalLine) {
        rivals++;
        break;
      }
    }
  }
  const values = Object.fromEntries(FACTORS.map((factor) => [factor, 0])) as Record<Factor, number>;
  values.small = clamp01(1 - members / f.smallMembers);
  values.large = clamp01(members / f.largeMembers);
  values.surplus = clamp01(stockDays / f.surplusDays);
  values.settled = clamp01((sys.day - tribe.settledDay) / yearDays / f.settledYears);
  values.elders = adults.length > 0 ? clamp01(elders / adults.length / f.elderShare) : 0;
  values.rivalry = adults.length > 0 ? clamp01(rivals / adults.length / f.rivalryShare) : 0;
  // Hardship is measured against the tribe's size: 4 deaths a year is a disaster for 20, normal for 200.
  const sufferingScale = f.sufferingShare * Math.max(1, tribe.members.length);
  values.scarcity = clamp01(recentSufferings(sys, tribe) / sufferingScale);
  values.cold = clamp01(recentSufferings(sys, tribe, DeathCause.Cold) / sufferingScale);
  values.privateProperty = params.property[tribe.property]?.id === 'private' ? 1 : 0;
  // What the members' culture and faith favour (ideas system); territory, writing and war come later.
  const ideas = sys.ideas;
  if (ideas) {
    values.hierarchy = ideas.groupValue(tribe, 'hierarchy');
    values.equality = 1 - values.hierarchy;
    values.eldersCustom = ideas.groupValue(tribe, 'elders');
    values.sharing = ideas.groupValue(tribe, 'sharing');
    if (tribe.religion >= 0) {
      const faith = ideas.dominant(tribe, Family.Religion, params.adultAge);
      const clergy = ideas.ideas[tribe.religion]?.clergy.has(tribe.id) ?? false;
      values.religion = faith.idea === tribe.religion ? clamp01(faith.share * (clergy ? 1 : 0.5)) : 0;
    }
    values.trade = tribe.currency >= 0 ? 1 : 0;
  }
  // War (conflict system): a tribe at war or under threat favours a chief, even a dictator.
  values.war = clamp01(tribe.war);
  return values;
}


/** How well a regime suits the situation (−Infinity if one of its conditions is missing). */
export function regimeFit(regime: Regime, level: number, factors: Record<Factor, number>): number {
  if (!regime.levels.includes(level)) return -Infinity;
  if (regime.requires.some((factor) => factors[factor] <= 0)) return -Infinity;
  let fit = 0;
  for (const [factor, weight] of Object.entries(regime.favors) as [Factor, number][]) fit += weight * factors[factor];
  return fit;
}

/** The regime that suits the group best now (ties: the first in the data). */
export function bestRegime(sys: GroupsSystem, group: Group, factors: Record<Factor, number>): number {
  let best = -1;
  let bestFit = -Infinity;
  sys.params.regimes.forEach((regime, index) => {
    const fit = regimeFit(regime, group.level, factors);
    if (fit > bestFit) {
      bestFit = fit;
      best = index;
    }
  });
  return Math.max(0, best);
}

/** What makes a candidate fit to lead the group, each 0..1. */
export function candidateFeatures(sys: GroupsSystem, group: Group, person: number): Record<PowerFeature, number> {
  const { params, people } = sys;
  const power = params.power;
  const adults = sys.adults(group);
  let respect = 0;
  for (const other of adults) if (other !== person) respect += Math.max(0, feeling(sys, other, person, 'respect'));
  respect = adults.length > 1 ? respect / (adults.length - 1) : 0;
  let bestSkill = 0;
  for (let s = 0; s < people.skillCount; s++) bestSkill = Math.max(bestSkill, people.skill(person, s));
  const age = people.ageYears[person]!;
  let children = 0;
  for (const other of group.members) if (people.mother[other] === person || people.father[other] === person) children++;
  const [forceFrom, forceTo] = power.forceAgeYears;
  const force = age < forceFrom ? age / forceFrom : age <= forceTo ? 1 : Math.max(0, 1 - (age - forceTo) / forceTo);
  const parents = [people.mother[person]!, people.father[person]!];
  const grandparents = parents.flatMap((parent) => (parent >= 0 ? [people.mother[parent]!, people.father[parent]!] : []));
  const lineage = parents.some((parent) => parent >= 0 && group.formerLeaders.includes(parent)) ? 1 : grandparents.some((g) => g >= 0 && group.formerLeaders.includes(g)) ? 0.5 : 0;
  const owned = sys.humans.production.carried[person]?.piles.reduce((sum, pile) => sum + pile.qty, 0) ?? 0;
  return {
    respect: clamp01(respect / power.respectScale),
    prestige: clamp01(0.5 * bestSkill + 0.25 * Math.min(1, children / 4) + 0.25 * Math.min(1, age / power.prestigeAgeYears)),
    age: clamp01(age / (params.elderAge + params.elderAge / 2)),
    lineage,
    force: clamp01(force * (people.health[person]! / FULL)),
    wealth: clamp01(owned / power.wealthItems),
    piety: sys.ideas ? sys.ideas.piety(person) : 0,
  };
}

export function powerScore(regime: Regime, features: Record<PowerFeature, number>): number {
  let score = 0;
  for (const feature of POWER_FEATURES) score += regime.weights[feature] * features[feature];
  return score;
}

/** The feature that weighs most in a candidate's score (for the journal). */
export function mainFeature(regime: Regime, features: Record<PowerFeature, number>): PowerFeature {
  let best: PowerFeature = 'respect';
  let bestValue = -Infinity;
  for (const feature of POWER_FEATURES) {
    const value = regime.weights[feature] * features[feature];
    if (value > bestValue) {
      bestValue = value;
      best = feature;
    }
  }
  return best;
}

/** Adults of the group ranked by their fitness to lead under its regime (best first). */
export function rankCandidates(sys: GroupsSystem, group: Group, regimeIndex = group.regime): { person: number; score: number; features: Record<PowerFeature, number> }[] {
  const regime = sys.params.regimes[regimeIndex]!;
  return sys
    .adults(group)
    .map((person) => {
      const features = candidateFeatures(sys, group, person);
      return { person, score: powerScore(regime, features), features };
    })
    .sort((a, b) => b.score - a.score || a.person - b.person);
}
