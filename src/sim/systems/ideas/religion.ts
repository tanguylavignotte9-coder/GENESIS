import type { JournalEvent } from '../../core/journal';
import { HUMAN_DEATH } from '../individuals/individuals-system';
import { EPIDEMIC_START } from '../individuals/life/disease';
import { FAMINE } from '../individuals/life/life-cycle';
import { feel } from '../individuals/social/relations';
import { ANOMALY_START } from '../world/anomalies';
import type { IdeasSystem } from './ideas-system';
import { Family, type Idea } from './idea';
import { findSplits, inheritVector, meanOf, noise, wander, type VectorFamily } from './drift';
import { word } from './phonology';
import { IDEA_EVENTS, publishIdeaEvent } from './texts';

/**
 * Religions: none at the start. One is born when someone deeply spiritual needs to explain a death
 * or a catastrophe, or has a revelation (charisma and fervour): a belief about the sacred (spirits,
 * ancestors, forces of nature) with its rite. It spreads by conversation (the fervent win over the
 * spiritual), from parents to children; it cools where nobody shares it. Its faithful may get a
 * shaman, then a priest; they want a sanctuary, or a megalithic tomb for their ancestors. Tribes
 * that live apart believe differently in the end: a schism.
 */

const BELIEF_STRONG = 0.8;
const BELIEF_WEAK = 0.2;
const MIN_PIETY = 0.05;
const CONVERT_PIETY = 0.3;
const ANCESTORS = 'ancestors';
const PRIEST_FACTOR = 3;
/** Kinds of abnormal years that are catastrophes (abundance is not). */
const CATASTROPHES = ['drought', 'harsh_winter'];

export function religionFamily(sys: IdeasSystem): VectorFamily {
  const h = sys.holdings;
  return { family: Family.Religion, params: sys.params.religion, dims: h.beliefCount, holderOf: (p) => h.religion[p]!, vector: h.beliefs };
}

/** "le culte d’Aruk": how the journal names a religion. */
export function religionLabel(idea: Idea): string {
  return cultLabel(idea.name);
}

function cultLabel(name: string): string {
  return /^[aeiouyéAEIOUYÉ]/.test(name) ? `le culte d’${name}` : `le culte de ${name}`;
}

/** How much someone's character leans to the sacred: 0 below a middle spirituality, 1 at the most. */
function spiritual(sys: IdeasSystem, person: number): number {
  const s = sys.humans.social.trait(person, 'spirituality');
  return Math.max(0, (s - 0.4) / 0.6) ** 2;
}

function beliefIndex(sys: IdeasSystem, id: string): number {
  return sys.params.religion.beliefs.findIndex((belief) => belief.id === id);
}

/**
 * A religion is born of `founder`: what they now revere (the belief `belief` above the others,
 * with their own nuances), told in the journal with its cause.
 */
function found(sys: IdeasSystem, founder: number, belief: number, reason: string, causes: readonly number[], parent = -1): Idea {
  const h = sys.holdings;
  const people = sys.humans.people;
  const params = sys.params.religion;
  const language = sys.ideas[h.motherTongue(founder)];
  const name = language?.phonology ? word(language.phonology, sys.rng, sys.rng.nextIntInclusive(2, 3)) : 'Sans-nom';
  const def = params.beliefs[belief]!;
  const tribe = sys.groups?.tribeOf(founder) ?? null;
  const label = cultLabel(name);
  const event = publishIdeaEvent(sys, IDEA_EVENTS.religion, sys.params.texts.religionBorn, { nom: people.names[founder]!, croyance: def.name, raison: reason, religion: label, rite: def.rite }, founder, causes, { belief: def.id });
  const idea = sys.addIdea(Family.Religion, name, parent, founder, event, tribe?.id ?? -1);
  idea.language = language?.id ?? -1;
  idea.reason = reason;
  h.religion[founder] = idea.id;
  h.piety[founder] = Math.max(0.6, sys.humans.social.trait(founder, 'spirituality'));
  for (let b = 0; b < h.beliefCount; b++) h.beliefs[founder * h.beliefCount + b] = clamp01((b === belief ? BELIEF_STRONG : BELIEF_WEAK) + 0.1 * noise(sys.rng));
  idea.mean = Array.from({ length: h.beliefCount }, (_, b) => h.beliefs[founder * h.beliefCount + b]!);
  idea.holders = 1;
  return idea;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Deaths and catastrophes of yesterday, as the journal tells them: grief and fear may turn to faith. */
export function readSorrows(sys: IdeasSystem, events: readonly JournalEvent[]): void {
  const params = sys.params.religion;
  const humans = sys.humans;
  const people = humans.people;
  const h = sys.holdings;
  for (const event of events) {
    if (event.type === HUMAN_DEATH) {
      const dead = Number(event.details['person']);
      if (dead < 0 || dead >= people.count) continue;
      for (const p of humans.campMembers(people.camp[dead]!)) {
        if (p === dead || p >= h.count || h.ready[p] === 0 || humans.life.isChild(p)) continue;
        const close = humans.social.kinOf(p, dead) !== 0 || affection(sys, p, dead) >= humans.social.params.relations.friendAffection;
        if (!close) continue;
        // The faithful find comfort in their faith; others may turn to the dead.
        if (h.religion[p]! >= 0) h.piety[p] = Math.min(1, h.piety[p]! + 0.05);
        else if (sys.rng.nextFloat() < params.griefChance * spiritual(sys, p)) found(sys, p, beliefIndex(sys, ANCESTORS), `après la mort de ${people.names[dead]!}`, [event.id]);
      }
      continue;
    }
    const catastrophe = catastropheOf(sys, event);
    if (!catastrophe) continue;
    for (const camp of catastrophe.camps) {
      for (const p of humans.campMembers(camp)) {
        if (p >= h.count || h.ready[p] === 0 || humans.life.isChild(p) || h.religion[p]! >= 0) continue;
        if (sys.rng.nextFloat() < params.catastropheChance * spiritual(sys, p)) found(sys, p, beliefIndex(sys, catastrophe.belief), catastrophe.reason, [event.id]);
      }
    }
  }
}

function affection(sys: IdeasSystem, a: number, b: number): number {
  const state = sys.humans.social.state;
  const slot = state.slotOf(a, b);
  return slot < 0 ? 0 : state.affection[slot]!;
}

/** The camps struck by an epidemic, a famine or a terrible year, and what it makes one revere. */
function catastropheOf(sys: IdeasSystem, event: JournalEvent): { camps: number[]; belief: string; reason: string } | null {
  if (event.type === EPIDEMIC_START) return { camps: [Number(event.details['camp'])], belief: 'spirits', reason: 'pendant une épidémie' };
  if (event.type === FAMINE) return { camps: [Number(event.details['camp'])], belief: 'nature', reason: 'pendant une famine' };
  if (event.type === ANOMALY_START && CATASTROPHES.includes(String(event.details['anomaly']))) {
    const camps = sys.humans.camps.filter((camp) => sys.humans.campMembers(camp.id).length > 0 && sys.humans.climate.anomalyIdAt(camp.center) === event.details['anomaly']).map((camp) => camp.id);
    return camps.length > 0 ? { camps, belief: 'nature', reason: 'quand le ciel s’est fait cruel' } : null;
  }
  return null;
}

/** A newborn shares the faith of its most fervent parent, a little less ardently. */
export function inheritReligion(sys: IdeasSystem, child: number, parents: readonly number[]): void {
  const h = sys.holdings;
  const believers = parents.filter((p) => h.religion[p]! >= 0).sort((a, b) => h.piety[b]! - h.piety[a]! || a - b);
  const parent = believers[0];
  if (parent === undefined) return;
  h.religion[child] = h.religion[parent]!;
  h.piety[child] = h.piety[parent]! * sys.params.religion.childPiety;
  inheritVector(religionFamily(sys), child, [parent], sys.rng);
}

/** Two people talked: the fervent may win the other over; two faithful grow fonder of each other. */
export function religionTalk(sys: IdeasSystem, a: number, b: number): void {
  const h = sys.holdings;
  const params = sys.params.religion;
  for (const [speaker, listener] of [
    [a, b],
    [b, a],
  ] as const) {
    const faith = h.religion[speaker]!;
    if (faith < 0) continue;
    if (h.religion[listener] === faith) {
      h.piety[listener] = Math.min(1, h.piety[listener]! + 0.01);
      if (speaker < listener) feel(sys.humans.social, listener, speaker, { affection: params.faithAffection, trust: params.faithAffection / 2, respect: 0 }, 'faith');
      continue;
    }
    const resistance = h.religion[listener]! >= 0 ? h.piety[listener]! : 0;
    const chance = params.spreadPerTalk * h.piety[speaker]! * (0.3 + spiritual(sys, listener)) * (1 - resistance);
    if (sys.rng.nextFloat() >= chance) continue;
    h.religion[listener] = faith;
    h.piety[listener] = CONVERT_PIETY;
    const dims = h.beliefCount;
    for (let d = 0; d < dims; d++) h.beliefs[listener * dims + d] = h.beliefs[speaker * dims + d]!;
  }
}

/** Every day: beliefs drift, fervour cools where nobody shares it, a prophet may arise. */
export function religionDay(sys: IdeasSystem): void {
  const h = sys.holdings;
  const people = sys.humans.people;
  const params = sys.params.religion;
  const family = religionFamily(sys);
  const cool = params.pietyDecayPerYear / sys.yearDays;
  for (let p = 0; p < people.count; p++) {
    if (people.alive[p] === 0 || h.ready[p] === 0) continue;
    const faith = h.religion[p]!;
    if (faith >= 0) {
      wander(family, p, sys.yearDays, sys.rng);
      const shared = (sys.talkedToday.get(p) ?? []).some((other) => h.religion[other] === faith);
      if (!shared) h.piety[p] = h.piety[p]! * (1 - cool);
      if (h.piety[p]! < MIN_PIETY) h.religion[p] = -1;
    }
    if (sys.humans.life.isChild(p)) continue;
    const social = sys.humans.social;
    if (social.trait(p, 'spirituality') < params.prophetTraits || social.trait(p, 'sociability') < params.prophetTraits) continue;
    if (sys.rng.nextFloat() >= params.prophetChance) continue;
    // A revelation: a new faith (a schism if one already believed otherwise).
    const belief = sys.rng.nextIntInclusive(0, params.beliefs.length - 1);
    found(sys, p, belief, faith >= 0 ? 'après une révélation qui l’éloigne de sa foi' : 'après une révélation', [], faith);
  }
}

/** A tribe whose faithful no longer believe like the others: a schism, a religion of their own. */
export function religionSplits(sys: IdeasSystem): void {
  findSplits(sys, religionFamily(sys), (tribe, ideaId, carriers) => {
    const h = sys.holdings;
    const old = sys.ideas[ideaId]!;
    const here = meanOf(religionFamily(sys), carriers);
    const main = here.indexOf(Math.max(...here));
    const language = sys.ideas[sys.dominant(tribe, Family.Language, 0).idea];
    const name = language?.phonology ? word(language.phonology, sys.rng, 2) : 'Sans-nom';
    const label = cultLabel(name);
    const event = publishIdeaEvent(sys, IDEA_EVENTS.schism, sys.params.texts.schism, { religion: religionLabel(old), tribu: tribe.name, nouvelle: label, croyance: sys.params.religion.beliefs[main]?.name ?? '' }, tribe.leaders[0] ?? -1, [old.event], { from: old.id });
    const idea = sys.addIdea(Family.Religion, name, old.id, -1, event, tribe.id);
    idea.language = language?.id ?? -1;
    idea.mean = here;
    idea.reason = 'schisme';
    for (const p of carriers) h.religion[p] = idea.id;
  });
}

/** Every few days: tribes with enough faithful get a shaman (later a priest), the most fervent and charismatic. */
export function clergyCheck(sys: IdeasSystem): void {
  const groups = sys.groups;
  if (!groups) return;
  const h = sys.holdings;
  const params = sys.params.religion;
  const people = sys.humans.people;
  for (const tribe of groups.tribes()) {
    const counts = new Map<number, number[]>();
    for (const p of tribe.members) {
      if (p >= h.count || h.religion[p]! < 0 || sys.humans.life.isChild(p)) continue;
      const list = counts.get(h.religion[p]!) ?? [];
      list.push(p);
      counts.set(h.religion[p]!, list);
    }
    for (const [faith, faithful] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
      const idea = sys.ideas[faith]!;
      const current = idea.clergy.get(tribe.id);
      if (current !== undefined && people.alive[current] === 1 && h.religion[current] === faith && groups.tribeOf(current) === tribe) continue;
      if (faithful.length < params.clergyMembers) {
        idea.clergy.delete(tribe.id);
        continue;
      }
      let best = -1;
      let bestScore = -Infinity;
      for (const p of faithful) {
        const score = h.piety[p]! + sys.humans.social.trait(p, 'sociability') + sys.humans.social.trait(p, 'spirituality');
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
      if (best < 0) continue;
      idea.clergy.set(tribe.id, best);
      const priest = faithful.length >= params.clergyMembers * PRIEST_FACTOR;
      const female = people.female[best] === 1;
      const title = priest ? (female ? 'prêtresse' : 'prêtre') : female ? 'chamane' : 'chaman';
      publishIdeaEvent(sys, IDEA_EVENTS.clergy, sys.params.texts.clergy, { nom: people.names[best]!, titre: title, religion: religionLabel(idea), tribu: tribe.name }, best, [idea.event], { religion: idea.id });
    }
  }
}

/** The place of worship a camp's faithful want (megalithic tomb for a cult of the ancestors that can build in stone), or null. */
export function worshipWanted(sys: IdeasSystem, camp: number): string | null {
  const h = sys.holdings;
  const members = sys.humans.campMembers(camp);
  const counts = new Map<number, number>();
  for (const p of members) if (p < h.count && h.religion[p]! >= 0) counts.set(h.religion[p]!, (counts.get(h.religion[p]!) ?? 0) + 1);
  let faith = -1;
  let most = 0;
  for (const [idea, count] of counts) {
    if (count > most || (count === most && idea < faith)) {
      most = count;
      faith = idea;
    }
  }
  if (faith < 0 || most < sys.params.religion.worshipMembers) return null;
  const mean = sys.ideas[faith]!.mean;
  const ancestors = beliefIndex(sys, ANCESTORS);
  const stone = sys.catalog.knowledge.findIndex((item) => item.id === 'stone_building');
  const ancestral = ancestors >= 0 && mean.length > 0 && mean[ancestors] === Math.max(...mean);
  if (ancestral && stone >= 0 && members.some((p) => h.knows(p, stone))) return 'megalithic_tomb';
  return 'sanctuary';
}
