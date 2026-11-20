import { feel } from '../individuals/social/relations';
import type { Group } from './group';
import type { GroupsSystem } from './groups-system';
import { hasPowerAmbition, meanApproval, offerPowerAmbitions } from './ambitions';
import { designateLeaders } from './leaders';
import { bestOption, capitalize, optionScore } from './membership';
import { approvalTarget } from './opinion';
import { bestRegime, candidateFeatures, groupFactors, powerScore, regimeFit } from './power';
import { DUTIES, LEVEL_COUNT } from './params';
import { factorReason, genderVars, GROUP_EVENTS, nameOf, publishGroupEvent } from './texts';
import { successionCrisis } from './succession';
import { scission, tribeRelations } from './tribes';

/**
 * Every few days (each group on its own day), its political life: the leaders are designated or
 * reviewed, they reform the regime or the rules when the situation changed, fix the strategy and
 * hand out the duties; when discontent outgrows legitimacy, an ambitious member acts: contests the
 * leader, overthrows them, or leads their clan away.
 */
export function runPolitics(sys: GroupsSystem): void {
  const every = sys.params.politics.everyDays;
  for (const group of [...sys.groups]) {
    if (!group.alive || group.level === 2 || group.members.length === 0 || (sys.day + group.id) % every !== 0) continue;
    groupPolitics(sys, group);
  }
  // Households: their elders lead them (no story in the journal).
  for (const group of sys.groups) {
    if (group.alive && group.level === 2 && group.members.length > 0 && group.leaders.length === 0) designateLeaders(sys, group, [], false);
  }
}

function groupPolitics(sys: GroupsSystem, group: Group): void {
  const { params } = sys;
  const yearDays = sys.humans.life.yearDays;
  const regime = params.regimes[group.regime]!;
  if (group.leaders.length === 0) {
    // The leader is dead: a disputed succession when another claimant has a real following.
    if (!successionCrisis(sys, group)) designateLeaders(sys, group, [group.leaderEvent], true);
  }
  else if (!regime.hereditary && sys.day - group.leadersSince >= params.politics.reviewYears * yearDays) designateLeaders(sys, group, [group.leaderEvent], true);
  if (!group.alive) return;
  const factors = groupFactors(sys, group);
  if (sys.rng.nextFloat() < params.politics.reformChance) reform(sys, group, factors, [group.leaderEvent]);
  if (group.level === 0) {
    leadTribe(sys, group, factors);
    offerPowerAmbitions(sys, group);
  }
  challenge(sys, group);
  if (group.level === 0 && group.alive) loyaltySplits(sys, group);
  if (group.level === 0 && group.alive) tribeRelations(sys, group);
}

/** The leaders change the regime when another one now suits the situation much better. */
function reform(sys: GroupsSystem, group: Group, factors: ReturnType<typeof groupFactors>, causes: readonly number[]): boolean {
  const { params } = sys;
  const best = bestRegime(sys, group, factors);
  if (best === group.regime) return false;
  const gain = regimeFit(params.regimes[best]!, group.level, factors) - regimeFit(params.regimes[group.regime]!, group.level, factors);
  if (gain < params.power.regimeInertia && Number.isFinite(gain)) return false;
  const before = params.regimes[group.regime]!;
  const after = params.regimes[best]!;
  const leader = group.leaders[0] ?? -1;
  group.regime = best;
  group.regimeEvent = publishGroupEvent(
    sys,
    GROUP_EVENTS.regime,
    params.texts.regimeChanged,
    { groupe: capitalize(group.name), ancien: before.name.toLowerCase(), nouveau: after.name.toLowerCase(), raison: factorReason(params, after.favors, factors) },
    group,
    leader >= 0 ? [leader] : [],
    causes,
    { from: before.id, to: after.id },
  );
  designateLeaders(sys, group, [group.regimeEvent], true);
  return true;
}

/** The tribe's leaders fix the strategy and the rules that suit them and the moment, and hand out the duties. */
function leadTribe(sys: GroupsSystem, tribe: Group, factors: ReturnType<typeof groupFactors>): void {
  const { params } = sys;
  const leader = tribe.leaders[0] ?? -1;
  if (leader >= 0) {
    const vars = (rule: string, reason: string): Record<string, string> => ({ nom: nameOf(sys, leader), groupe: tribe.name, regle: rule, strategie: rule, raison: reason });
    // A rule changes only if another one is clearly better (the custom in force has its weight).
    const keep = (options: Parameters<typeof bestOption>[1], current: number): number => {
      const best = bestOption(sys, options, leader, factors);
      return optionScore(sys, options[best]!, leader, factors) - optionScore(sys, options[current]!, leader, factors) >= params.power.ruleInertia ? best : current;
    };
    const strategy = keep(params.strategies, tribe.strategy);
    if (strategy !== tribe.strategy) {
      tribe.strategy = strategy;
      const chosen = params.strategies[strategy]!;
      publishGroupEvent(sys, GROUP_EVENTS.strategy, params.texts.strategyChanged, vars(chosen.name.toLowerCase(), factorReason(params, chosen.favors, factors)), tribe, [leader], [tribe.leaderEvent]);
    }
    const property = keep(params.property, tribe.property);
    if (property !== tribe.property) {
      tribe.property = property;
      const chosen = params.property[property]!;
      publishGroupEvent(sys, GROUP_EVENTS.rule, params.texts.ruleChanged, vars(chosen.name.toLowerCase(), factorReason(params, chosen.favors ?? {}, factors)), tribe, [leader], [tribe.leaderEvent]);
    }
    const inheritance = keep(params.inheritance, tribe.inheritance);
    if (inheritance !== tribe.inheritance) {
      tribe.inheritance = inheritance;
      const chosen = params.inheritance[inheritance]!;
      publishGroupEvent(sys, GROUP_EVENTS.rule, params.texts.ruleChanged, vars(`héritage ${chosen.name.toLowerCase()}`, params.causeTexts.review), tribe, [leader], [tribe.leaderEvent]);
    }
  }
  const strategy = params.strategies[tribe.strategy]!;
  if (tribe.camp >= 0) sys.humans.production.applyCampPolicy(tribe.camp, { food: strategy.food, wood: strategy.wood, build: strategy.build, craft: strategy.craft });
  handOutDuties(sys, tribe);
}

/** Skills that serve each duty (ids of data/humans.json → skills). */
const DUTY_SKILLS: Record<(typeof DUTIES)[number], readonly string[]> = {
  food: ['gathering', 'hunting', 'fishing'],
  wood: ['woodcutting', 'survival'],
  build: ['construction'],
  craft: ['crafting', 'pottery'],
};

/**
 * Duties: the camp's needs (food, wood, building, crafting) are shared out among the adults in
 * proportion to their urgency, each going to whom does it best. Whether one obeys depends on the
 * legitimacy of the power, one's relation with the leaders and one's character.
 */
function handOutDuties(sys: GroupsSystem, tribe: Group): void {
  const { params, people } = sys;
  const adults = sys.adults(tribe);
  for (const person of tribe.members) sys.duty[person] = -1;
  if (tribe.leaders.length === 0 || tribe.camp < 0 || adults.length === 0) return;
  const needs = sys.humans.production.needs(tribe.camp);
  const urgency = [needs.food, needs.wood, needs.build, needs.craft];
  const total = urgency.reduce((sum, value) => sum + value, 0);
  const skillIds = sys.humans.params.skills.map((skill) => skill.id);
  // A selfish leader spares his own family the chores.
  const leader = tribe.leaders[0]!;
  const favoured = sys.humans.social.trait(leader, 'generosity') < params.duties.favoritism ? adults.filter((p) => p === leader || sys.humans.social.kinOf(leader, p) !== 0) : [];
  if (total > 0) {
    const quotas = urgency.map((value) => Math.round((value / total) * (adults.length - favoured.length)));
    const free = new Set(adults.filter((p) => !favoured.includes(p)));
    DUTIES.forEach((duty, d) => {
      const skills = DUTY_SKILLS[duty].map((id) => skillIds.indexOf(id)).filter((k) => k >= 0);
      const level = (person: number): number => skills.reduce((best, k) => Math.max(best, people.practice[person * people.skillCount + k]! >= params.duties.minSkillHours ? people.skill(person, k) : 0), 0);
      const ranked = [...free].sort((a, b) => level(b) - level(a) || a - b);
      for (const person of ranked.slice(0, quotas[d]!)) {
        sys.duty[person] = d;
        free.delete(person);
      }
    });
  }
  if (favoured.length > 1) {
    // Those who toil while the leader's family is spared resent it.
    for (const person of adults) {
      if (sys.duty[person]! >= 0 && !favoured.includes(person)) sys.grievance[person] = Math.min(100, sys.grievance[person]! + params.duties.unfairGrievance);
    }
  }
  const o = params.obedience;
  for (const person of adults) {
    let chance = o.base + (o.legitimacy * (tribe.legitimacy - 50)) / 100;
    const relation = approvalTarget(sys, tribe, person) - 50;
    chance += (o.relation * relation) / 100;
    for (const [trait, weight] of Object.entries(o.traits)) chance += weight * (2 * sys.humans.social.trait(person, trait) - 1);
    sys.obeys[person] = sys.isLeader(person, tribe) || sys.rng.nextFloat() < chance ? 1 : 0;
  }
}

/**
 * When discontent outgrows legitimacy (or legitimacy is low), the most able of the ambitious acts:
 * the leader of a clan that rejects the tribe's power may lead it away; otherwise they contest the
 * leader before everyone: with enough support they take the power, else they lose face.
 */
function challenge(sys: GroupsSystem, group: Group): void {
  const { params, rng } = sys;
  const p = params.politics;
  if (group.leaders.length === 0) return;
  if (group.discontent - group.legitimacy < p.gap && group.legitimacy >= p.minLegitimacy) {
    rivalChallenge(sys, group);
    return;
  }
  const regime = params.regimes[group.regime]!;
  let challenger = -1;
  let best = -Infinity;
  for (const person of sys.adults(group)) {
    if (sys.isLeader(person, group)) continue;
    const ambition = sys.humans.social.trait(person, 'ambition');
    if (ambition < p.ambitionTrait && !hasPowerAmbition(sys, person)) continue;
    if (rng.nextFloat() >= p.actChance * ambition) continue;
    const score = powerScore(regime, candidateFeatures(sys, group, person));
    if (score > best) {
      best = score;
      challenger = person;
    }
  }
  if (challenger < 0) return;
  const discontent = params.causeTexts.discontent.replace('{m}', String(Math.round(group.discontent))).replace('{l}', String(Math.round(group.legitimacy)));
  if (group.level === 0) {
    const clan = sys.groupOf(challenger, 1);
    if (clan && sys.isLeader(challenger, clan) && meanApproval(sys, clan, 0) < params.scission.approvalBelow && rng.nextFloat() < params.scission.chance) {
      if (scission(sys, group, clan, `${params.causeTexts.rejected}, ${discontent}`, [group.leaderEvent])) return;
    }
  }
  contest(sys, group, challenger, discontent);
}

/**
 * A clan whose members follow their own leader much more than the tribe's leaders may leave with
 * them, if that leader is ambitious: big bands split this way, without any hardship.
 */
function loyaltySplits(sys: GroupsSystem, tribe: Group): void {
  const { params, rng } = sys;
  const s = params.scission;
  for (const clan of sys.childrenOf(tribe).filter((group) => group.level === 1)) {
    const leader = clan.leaders[0];
    if (leader === undefined || !tribe.alive) continue;
    if (sys.humans.social.trait(leader, 'ambition') < params.politics.ambitionTrait && !hasPowerAmbition(sys, leader)) continue;
    if (meanApproval(sys, clan, 1) - meanApproval(sys, clan, 0) < s.loyaltyGap || rng.nextFloat() >= s.loyaltyChance) continue;
    if (scission(sys, tribe, clan, params.causeTexts.loyalty.replace('{nom}', nameOf(sys, leader)), [clan.leaderEvent, tribe.leaderEvent])) return;
  }
}

/**
 * Without any crisis, an ambitious member who feels much more able than the chief (an ageing or
 * weakened chief, a rising hunter…) may defy them: the tribe follows whom it prefers.
 */
function rivalChallenge(sys: GroupsSystem, group: Group): void {
  const { params, rng } = sys;
  const p = params.politics;
  const regime = params.regimes[group.regime]!;
  const chief = group.leaders[0]!;
  const chiefScore = powerScore(regime, candidateFeatures(sys, group, chief));
  let rival = -1;
  let best = chiefScore + p.rivalMargin;
  for (const person of sys.adults(group)) {
    if (sys.isLeader(person, group)) continue;
    const ambition = sys.humans.social.trait(person, 'ambition');
    if (ambition < p.ambitionTrait) continue;
    const score = powerScore(regime, candidateFeatures(sys, group, person));
    if (score > best) {
      best = score;
      rival = person;
    }
  }
  if (rival < 0 || rng.nextFloat() >= p.rivalChance * sys.humans.social.trait(rival, 'ambition')) return;
  contest(sys, group, rival, params.causeTexts.rival.replace('{nom}', nameOf(sys, rival)).replace('{chef}', nameOf(sys, chief)));
}

export function contest(sys: GroupsSystem, group: Group, challenger: number, reason: string): void {
  const { params } = sys;
  const adults = sys.adults(group).filter((person) => person !== challenger && !sys.isLeader(person, group));
  const supporters = adults.filter((person) => approvalTarget(sys, group, person, [challenger]) > sys.approval[person * LEVEL_COUNT + group.level]!);
  const chief = group.leaders[0]!;
  const vars = { ...genderVars(sys, challenger), nom: nameOf(sys, challenger), chef: nameOf(sys, chief), groupe: group.name, raison: reason, soutiens: String(supporters.length), total: String(adults.length + group.leaders.length) };
  const social = sys.humans.social;
  if (supporters.length >= params.politics.supportShare * (adults.length + group.leaders.length)) {
    // The least supported leader gives way (the only one, for a chief).
    let fallen = chief;
    if (group.leaders.length > 1) {
      let lowest = Infinity;
      for (const leader of group.leaders) {
        const support = adults.reduce((sum, person) => sum + approvalTarget(sys, group, person, [leader]), 0);
        if (support < lowest) {
          lowest = support;
          fallen = leader;
        }
      }
    }
    vars.chef = nameOf(sys, fallen);
    const event = publishGroupEvent(sys, GROUP_EVENTS.overthrown, params.texts.overthrown, vars, group, [challenger, fallen, ...supporters], [group.leaderEvent]);
    group.leaders = [...group.leaders.filter((leader) => leader !== fallen), challenger];
    if (!group.formerLeaders.includes(challenger)) group.formerLeaders.push(challenger);
    group.leaderEvent = event;
    group.leadersSince = sys.day;
    for (const person of supporters) feel(social, person, challenger, { affection: 0, trust: 0, respect: params.politics.challengerRespect }, 'rallied', event);
    feel(social, fallen, challenger, { affection: -params.politics.challengerRespect, trust: -params.politics.challengerRespect, respect: 0 }, 'contested', event);
    // A new chief may reshape the regime at once.
    reform(sys, group, groupFactors(sys, group), [event]);
    return;
  }
  const event = publishGroupEvent(sys, GROUP_EVENTS.contested, params.texts.contested, vars, group, [challenger, chief], [group.leaderEvent]);
  for (const person of adults) if (!supporters.includes(person)) feel(social, person, challenger, { affection: 0, trust: 0, respect: params.politics.failedRespect }, 'contested', event);
}
