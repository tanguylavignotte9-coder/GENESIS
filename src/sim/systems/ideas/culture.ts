import type { Group } from '../groups/group';
import type { IdeasSystem } from './ideas-system';
import { Family } from './idea';
import { findSplits, gap, inheritVector, meanOf, noise, wander, type VectorFamily } from './drift';
import { peopleNameIn } from './language';
import { IDEA_EVENTS, listWords, publishIdeaEvent } from './texts';

/**
 * Cultures: values and customs shared by a population (sharing, hierarchy, hospitality, bravery,
 * the place of the elders). Each person holds their own values, learnt from their parents, shaped
 * by what they live (famines, hunting, the way they are ruled, the strangers they meet) and by the
 * people they talk to. A tribe living apart drifts away; beyond a threshold, a new culture is born.
 */

export function valueIndex(sys: IdeasSystem, id: string): number {
  return sys.params.values.findIndex((value) => value.id === id);
}

export function cultureFamily(sys: IdeasSystem): VectorFamily {
  const h = sys.holdings;
  return { family: Family.Culture, params: sys.params.culture, dims: h.valueCount, holderOf: (p) => h.culture[p]!, vector: h.values };
}

/** A person of a starting tribe: the tribe's culture, with values of their own around its mean. */
export function startCulture(sys: IdeasSystem, person: number, culture: number): void {
  const h = sys.holdings;
  const mean = sys.ideas[culture]!.mean;
  h.culture[person] = culture;
  h.cultureStrength[person] = 1;
  for (let v = 0; v < h.valueCount; v++) h.values[person * h.valueCount + v] = clamp01(mean[v]! + sys.params.culture.personSpread * noise(sys.rng));
}

export function inheritCulture(sys: IdeasSystem, child: number, parents: readonly number[]): void {
  const h = sys.holdings;
  const family = cultureFamily(sys);
  inheritVector(family, child, parents, sys.rng);
  h.culture[child] = parents.length > 0 ? h.culture[parents[0]!]! : -1;
  h.cultureStrength[child] = 1;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** What a person's life teaches them, value by value (target 0..1, or -1: nothing to learn here). */
function lessons(sys: IdeasSystem, person: number, tribe: Group | null, out: number[]): void {
  const humans = sys.humans;
  const groups = sys.groups;
  out.fill(-1);
  if (!tribe || !groups) return;
  const params = groups.params;
  const set = (id: string, target: number): void => {
    const v = valueIndex(sys, id);
    if (v >= 0) out[v] = clamp01(target);
  };
  const property = params.property[tribe.property]?.id;
  set('sharing', property === 'common' ? 0.75 : property === 'private' ? 0.25 : 0.5);
  const decision = params.regimes[tribe.regime]?.decision;
  set('hierarchy', decision === 'chief' ? 0.75 : decision === 'council' ? 0.5 : 0.25);
  if (tribe.known.size > 0) {
    let opinion = 0;
    for (const view of tribe.known.values()) opinion += view.opinion;
    set('hospitality', 0.5 + opinion / tribe.known.size / 200);
  }
  const hunting = humans.params.skills.findIndex((skill) => skill.id === 'hunting');
  if (hunting >= 0) set('bravery', 0.3 + 0.6 * Math.min(1, humans.people.skill(person, hunting) * 2));
  let elders = 0;
  let adults = 0;
  for (const p of tribe.members) {
    if (humans.people.ageYears[p]! < params.adultAge) continue;
    adults++;
    if (humans.people.ageYears[p]! >= params.elderAge) elders++;
  }
  if (adults > 0) set('elders', 0.25 + 0.55 * Math.min(1, elders / adults / params.factors.elderShare));
}

/** Every day: values drift a little and follow, slowly, what each one lives. */
export function cultureDay(sys: IdeasSystem): void {
  const h = sys.holdings;
  const people = sys.humans.people;
  const family = cultureFamily(sys);
  const pull = sys.params.culture.experiencePerYear / sys.yearDays;
  const targets = new Array<number>(h.valueCount).fill(-1);
  for (let p = 0; p < people.count; p++) {
    if (people.alive[p] === 0 || h.ready[p] === 0) continue;
    wander(family, p, sys.yearDays, sys.rng);
    if (people.ageYears[p]! < (sys.groups?.params.adultAge ?? 0)) continue;
    lessons(sys, p, sys.groups?.tribeOf(p) ?? null, targets);
    for (let v = 0; v < h.valueCount; v++) {
      const target = targets[v]!;
      if (target < 0) continue;
      const at = p * h.valueCount + v;
      h.values[at] = h.values[at]! + (target - h.values[at]!) * pull;
    }
  }
}

/** A tribe whose values drifted far from the rest of its culture becomes a culture of its own. */
export function cultureSplits(sys: IdeasSystem): void {
  findSplits(sys, cultureFamily(sys), (tribe, ideaId, carriers) => {
    const h = sys.holdings;
    const old = sys.ideas[ideaId]!;
    const family = cultureFamily(sys);
    const here = meanOf(family, carriers);
    const before = old.mean.length > 0 ? old.mean : here;
    const language = sys.holdings.motherTongue(carriers[0]!);
    const name = peopleNameIn(sys, language);
    // The two values that changed most say how this people now lives.
    const changes = sys.params.values
      .map((value, v) => ({ value, delta: here[v]! - (before[v] ?? 0.5) }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 2)
      .map(({ value, delta }) => `${delta > 0 ? value.high : value.low}`);
    const event = publishIdeaEvent(
      sys,
      IDEA_EVENTS.culture,
      sys.params.texts.cultureBorn,
      { tribu: capitalize(tribe.name), mere: old.name, nom: name, valeurs: listWords(changes) },
      tribe.leaders[0] ?? -1,
      [tribe.foundedEvent],
      { from: old.id, gap: Math.round(gap(here, before) * 100) },
    );
    const idea = sys.addIdea(Family.Culture, name, old.id, -1, event, tribe.id);
    idea.language = language;
    idea.mean = here;
    for (const p of carriers) h.culture[p] = idea.id;
  });
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
