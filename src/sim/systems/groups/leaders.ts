import type { Group } from './group';
import type { GroupsSystem } from './groups-system';
import { mainFeature, rankCandidates } from './power';
import { genderVars, GROUP_EVENTS, listNames, nameOf, publishGroupEvent, titleOf } from './texts';

/**
 * The group's regime designates its leaders among the adult members: by respect, prestige, age,
 * lineage, force or wealth, each weighed by the regime (data/groups.json). A chief keeps the power
 * until death or overthrow; a band or a council is reviewed now and then. `announce`: told in the
 * journal (not for households).
 */
export function designateLeaders(sys: GroupsSystem, group: Group, causes: readonly number[], announce: boolean): void {
  const regime = sys.params.regimes[group.regime]!;
  const ranked = rankCandidates(sys, group);
  const count = Math.min(regime.leaders, ranked.length);
  const chosen = ranked.slice(0, count);
  const leaders = chosen.map((candidate) => candidate.person);
  const same = leaders.length === group.leaders.length && leaders.every((leader) => group.leaders.includes(leader));
  group.leadersSince = sys.day;
  if (same) return;
  const previous = group.leaders[0] ?? -1;
  group.leaders = leaders;
  for (const leader of leaders) if (!group.formerLeaders.includes(leader)) group.formerLeaders.push(leader);
  if (!announce || leaders.length === 0) return;
  const { texts, featureTexts } = sys.params;
  if (leaders.length === 1) {
    const leader = leaders[0]!;
    const features = chosen[0]!.features;
    const inherited = regime.hereditary && features.lineage >= 1 && previous >= 0 && previous !== leader;
    const vars = { ...genderVars(sys, leader), nom: nameOf(sys, leader), groupe: group.name, role: titleOf(sys, leader, group), ancien: previous >= 0 ? nameOf(sys, previous) : '' };
    const reason = fillGender(featureTexts[mainFeature(regime, features)], vars.e, vars.ne);
    group.leaderEvent = publishGroupEvent(sys, GROUP_EVENTS.leader, inherited ? texts.leaderInherited : texts.leaderChosen, { ...vars, raison: reason }, group, [leader], causes);
    return;
  }
  const reasons = [...new Set(chosen.map((candidate) => mainFeature(regime, candidate.features)))].map((feature) => fillGender(featureTexts[feature], '', ''));
  group.leaderEvent = publishGroupEvent(
    sys,
    GROUP_EVENTS.leader,
    texts.councilChosen,
    { groupe: group.name, noms: listNames(leaders.map((leader) => nameOf(sys, leader))), raison: listNames(reasons) },
    group,
    leaders,
    causes,
  );
}

function fillGender(text: string, e: string, ne: string): string {
  return text.replace(/\{e\}/g, e).replace(/\{ne\}/g, ne);
}
