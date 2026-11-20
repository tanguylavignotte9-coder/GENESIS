import type { Journal, JournalEvent } from '../../core/journal';
import type { KnowledgeCatalog } from '../../core/knowledge';
import type { Rng } from '../../core/rng';
import type { Toponyms } from '../../core/toponyms';
import type { GroupsSystem } from '../groups/groups-system';
import type { Group } from '../groups/group';
import type { IdeaView } from '../individuals/idea-view';
import type { IndividualsSystem } from '../individuals/individuals-system';
import { LANGUAGE_SLOTS, PersonIdeas } from './holdings';
import { Family, Idea, type FamilyId } from './idea';
import { ENVIRONMENTS, type IdeasParams } from './params';
import { discoveries, learning, readDeaths } from './knowledge';
import { cultureDay, cultureFamily, cultureSplits, startCulture, inheritCulture, valueIndex } from './culture';
import { languageDay, languageFamily, languageSplits, nameNewPlaces, newLanguage, personNameIn, peopleNameIn, startLanguageOf, understanding, inheritLanguage, tribeUnderstanding } from './language';
import { readSorrows, religionDay, religionFamily, religionSplits, religionTalk, inheritReligion, clergyCheck, worshipWanted } from './religion';
import { currencyCheck, encounters, tokenTalk } from './trade';
import { conform } from './drift';
import { IDEA_EVENTS, publishIdeaEvent } from './texts';

const FULL = 100;
const HUNGRY = 70;

/**
 * The ideas system (step 10). One mechanism for every idea: knowledge, cultures, languages,
 * religions and goods of exchange are carried by people with a strength, passed on by relations
 * (parents, teachers, conversations, encounters, marriages), drift apart when populations no longer
 * talk, and are lost when nobody carries them. Discoveries, splits and losses are told in the
 * journal with their causes. The individuals read what people know and how their culture weighs
 * on their choices (IdeaView); the groups adopt the culture, language and religion of their members.
 */
export class IdeasSystem implements IdeaView {
  readonly ideas: Idea[] = [];
  holdings: PersonIdeas;
  humans!: IndividualsSystem;
  groups: GroupsSystem | null = null;
  /** Language and culture of each starting camp. */
  readonly startLanguages: number[] = [];
  readonly startCultures: number[] = [];
  /** Names already given (a name is unique in the world). */
  readonly usedNames = new Set<string>();
  /** What the surroundings of each camp offer (bit field over ENVIRONMENTS) and when it was looked at. */
  readonly environment = new Map<number, { day: number; mask: number }>();
  /** Per knowledge: prerequisites (all needed), surroundings needed (all), skill of its domain. */
  requiredMask: Uint32Array;
  environmentMask: Uint32Array;
  skillOf: Int16Array;
  /** Per action of data/humans.json: [value index, strength] pairs of the cultural values that weigh on it. */
  actionValues: number[][] = [];
  /** Today: who talked with whom, whom one met from another tribe (read from the social log and encounters). */
  talkedToday = new Map<number, number[]>();
  metToday = new Map<number, number[]>();
  /** Per camp: who practised each skill since yesterday (index = skill). */
  private practised = new Map<number, Int32Array>();
  private hungerToday = new Map<number, number>();
  /** First trades and interpreters already told, by pair of tribes ("a:b"). */
  readonly toldPairs = new Set<string>();
  /** How badly each tribe takes unbelief, and shares of its faithful (recomputed every day). */
  readonly pressureToday = new Map<number, number>();
  readonly shareToday = new Map<number, number>();
  journalRead = 0;
  lastHumanStep = 0;
  lastEncounter = -1;
  day = 0;
  tick = 0;

  constructor(
    public params: IdeasParams,
    readonly catalog: KnowledgeCatalog,
    readonly rng: Rng,
    readonly journal: Journal,
    readonly toponyms: Toponyms,
    readonly yearDays: number,
  ) {
    this.holdings = new PersonIdeas(0, catalog.knowledge.length, params.values.length, params.language.dims, params.religion.beliefs.length);
    this.requiredMask = new Uint32Array(0);
    this.environmentMask = new Uint32Array(0);
    this.skillOf = new Int16Array(0);
    this.journalRead = journal.size;
  }

  /** Derived tables (after a live change of the variables). */
  refreshParams(params: IdeasParams): void {
    this.params = params;
    const knowledge = this.catalog.knowledge;
    const ids = knowledge.map((item) => item.id);
    this.requiredMask = Uint32Array.from(knowledge, (item) => item.requires.reduce((mask, id) => (mask | (1 << ids.indexOf(id))) >>> 0, 0));
    this.environmentMask = Uint32Array.from(knowledge, (item) => item.discovery.environment.reduce((mask, env) => mask | (1 << ENVIRONMENTS.indexOf(env)), 0));
    if (this.humans) {
      const skills = this.humans.params.skills.map((skill) => skill.id);
      this.skillOf = Int16Array.from(knowledge, (item) => skills.indexOf(item.discovery.skill));
      this.actionValues = this.humans.params.actions.map((action) => params.values.flatMap((value, v) => (value.actions[action.id] !== undefined ? [v, value.actions[action.id]!] : [])));
    }
  }

  // ----- creation ---------------------------------------------------------------------------

  /** The people of the starting tribes exist: each tribe gets its culture; everyone their ideas. */
  attach(humans: IndividualsSystem): void {
    this.humans = humans;
    this.refreshParams(this.params);
    this.holdings.ensure(humans.people.capacity);
    const people = humans.people;
    for (let p = 0; p < people.count; p++) {
      if (people.alive[p] === 0) continue;
      const camp = people.camp[p]!;
      startLanguageOf(this, p, this.startingLanguage(camp));
      startCulture(this, p, this.startingCulture(camp));
      this.startKnowledge(p, camp);
      this.holdings.ready[p] = 1;
    }
  }

  attachGroups(groups: GroupsSystem): void {
    this.groups = groups;
    for (const camp of this.humans.camps) nameNewPlaces(this, camp.id);
    this.recount();
  }

  addIdea(family: FamilyId, name: string, parent: number, founder: number, event: number, tribe: number): Idea {
    const idea = new Idea(this.ideas.length, family, name, parent, founder, this.day, event, tribe);
    this.ideas.push(idea);
    return idea;
  }

  private startingLanguage(camp: number): number {
    while (this.startLanguages.length <= camp) this.startLanguages.push(newLanguage(this, -1, -1, -1, -1).id);
    return this.startLanguages[camp]!;
  }

  private startingCulture(camp: number): number {
    while (this.startCultures.length <= camp) {
      const index = this.startCultures.length;
      const language = this.startingLanguage(index);
      const idea = this.addIdea(Family.Culture, peopleNameIn(this, language), -1, -1, -1, -1);
      idea.language = language;
      const spread = this.params.culture.startSpread;
      idea.mean = this.params.values.map(() => Math.max(0, Math.min(1, 0.5 + spread * (this.rng.nextFloat() * 2 - 1))));
      this.startCultures.push(idea.id);
    }
    return this.startCultures[camp]!;
  }

  /** What the starting tribe knows: one idea per piece of knowledge and camp ("known from all times"). */
  private startKnowledge(person: number, camp: number): void {
    this.catalog.knowledge.forEach((item, k) => {
      if (!item.startsKnown) return;
      let idea = this.ideas.find((other) => other.family === Family.Knowledge && other.knowledge === k && other.founder < 0 && other.reason === `camp:${camp}`);
      if (!idea) {
        idea = this.addIdea(Family.Knowledge, item.name, -1, -1, -1, -1);
        idea.knowledge = k;
        idea.reason = `camp:${camp}`;
      }
      this.learn(person, k, idea.id, -1);
    });
  }

  /** The person now knows knowledge `k` (from discovery `source`, taught by `teacher`, -1 = oneself). */
  learn(person: number, k: number, source: number, teacher: number): void {
    const h = this.holdings;
    const at = person * h.knowledgeCount + k;
    h.known[person] = (h.known[person]! | (1 << k)) >>> 0;
    h.learning[at] = 1;
    h.source[at] = source;
    h.teacher[at] = teacher;
    h.learntDay[at] = this.day;
    if (teacher >= 0 && this.groups) {
      // Something learnt from a stranger is new to one's tribe: told once.
      const mine = this.groups.tribeOf(person);
      const theirs = this.groups.tribeOf(teacher);
      if (mine && theirs && mine !== theirs && !this.tribeKnows(mine, k, person)) this.learnedAbroad(person, teacher, k, mine, theirs);
    }
  }

  private tribeKnows(tribe: Group, k: number, except: number): boolean {
    return tribe.members.some((p) => p !== except && this.holdings.knows(p, k));
  }

  private learnedAbroad(person: number, teacher: number, k: number, mine: Group, theirs: Group): void {
    const def = this.catalog.knowledge[k]!;
    const people = this.humans.people;
    publishIdeaEvent(this, IDEA_EVENTS.learnedAbroad, this.params.texts.learnedAbroad, { nom: people.names[person]!, savoir: def.the, maitre: people.names[teacher]!, autre: theirs.name, tribu: mine.name }, person, [], { knowledge: def.id }, [teacher]);
  }

  /** A newborn: its mother's language, its parents' culture, values and faith; knowledge comes later. */
  private welcome(child: number): void {
    const people = this.humans.people;
    const mother = people.mother[child]!;
    const father = people.father[child]!;
    const parents = [mother, father].filter((p) => p >= 0 && p < this.holdings.count && this.holdings.ready[p] === 1);
    inheritLanguage(this, child, parents);
    inheritCulture(this, child, parents);
    inheritReligion(this, child, parents);
    this.holdings.ready[child] = 1;
  }

  // ----- IdeaView (read by the individuals) -------------------------------------------------

  knowledge(person: number): number {
    return person < this.holdings.count ? this.holdings.known[person]! : 0;
  }

  actionFactor(person: number, action: number): number {
    const weights = this.actionValues[action];
    if (!weights || weights.length === 0 || person >= this.holdings.count) return 1;
    const h = this.holdings;
    let factor = 1;
    for (let k = 0; k < weights.length; k += 2) {
      const value = h.values[person * h.valueCount + weights[k]!]!;
      factor *= Math.max(0, 1 + weights[k + 1]! * (2 * value - 1));
    }
    return factor;
  }

  startingName(camp: number, female: boolean): string {
    return personNameIn(this, this.startingLanguage(camp), female);
  }

  childName(mother: number, female: boolean): string {
    const language = mother >= 0 && mother < this.holdings.count ? this.holdings.motherTongue(mother) : -1;
    return personNameIn(this, language >= 0 ? language : this.startingLanguage(0), female);
  }

  // ----- read by the groups -----------------------------------------------------------------

  /** Name of a new tribe: a people's name in its founder's language ("Tamuki"). */
  tribeNameOf(founder: number): string {
    const language = founder < this.holdings.count ? this.holdings.motherTongue(founder) : -1;
    return peopleNameIn(this, language >= 0 ? language : this.startingLanguage(0));
  }

  /** A person's own cultural value (0..1, 0.5 if unknown): "bravery", "hierarchy"… */
  personValue(person: number, value: string): number {
    const v = valueIndex(this, value);
    const h = this.holdings;
    if (v < 0 || person >= h.count || h.ready[person] === 0) return 0.5;
    return h.values[person * h.valueCount + v]!;
  }

  /** Mean of a cultural value among the adults of a group (0.5 if unknown). */
  groupValue(group: Group, value: string): number {
    const v = valueIndex(this, value);
    if (v < 0) return 0.5;
    const h = this.holdings;
    let sum = 0;
    let n = 0;
    for (const p of group.members) {
      if (p >= h.count || h.ready[p] === 0) continue;
      sum += h.values[p * h.valueCount + v]!;
      n++;
    }
    return n > 0 ? sum / n : 0.5;
  }

  /** The idea of a family most carried by a group's members, and the share of its adults who carry it. */
  dominant(group: Group, family: FamilyId, adultAge: number): { idea: number; share: number } {
    const counts = new Map<number, number>();
    let adults = 0;
    const people = this.humans.people;
    for (const p of group.members) {
      if (people.ageYears[p]! < adultAge || p >= this.holdings.count) continue;
      adults++;
      const idea = this.heldIdea(p, family);
      if (idea >= 0) counts.set(idea, (counts.get(idea) ?? 0) + 1);
    }
    let best = -1;
    let bestCount = 0;
    for (const [idea, count] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
      if (count > bestCount) {
        best = idea;
        bestCount = count;
      }
    }
    return { idea: best, share: adults > 0 ? bestCount / adults : 0 };
  }

  /** Idea of a family a person carries (-1 none); knowledge has many and returns -1. */
  heldIdea(person: number, family: FamilyId): number {
    const h = this.holdings;
    if (person >= h.count) return -1;
    switch (family) {
      case Family.Culture:
        return h.culture[person]!;
      case Family.Language:
        return h.motherTongue(person);
      case Family.Religion:
        return h.religion[person]!;
      case Family.Currency: {
        const item = h.token[person]!;
        if (item < 0 || h.tokenTrust[person]! < this.params.trade.currencyStrength) return -1;
        const tribe = this.groups?.tribeOf(person);
        return this.ideas.find((idea) => idea.family === Family.Currency && idea.item === item && idea.alive && (tribe ? idea.tribes.includes(tribe.id) : true))?.id ?? -1;
      }
      default:
        return -1;
    }
  }

  /** Fervour of a person (0..1), more for a shaman or priest. */
  piety(person: number): number {
    if (person >= this.holdings.count) return 0;
    const religion = this.ideas[this.holdings.religion[person]!];
    const clergy = religion ? [...religion.clergy.values()].includes(person) : false;
    return Math.min(1, this.holdings.piety[person]! + (clergy ? 0.3 : 0));
  }

  /** How well two tribes understand each other (0..1): their languages, or a bilingual member. */
  tribesUnderstand(a: Group, b: Group): number {
    return tribeUnderstanding(this, a, b);
  }

  /** Building a camp wants for its faith (id of data/buildings.json), or null. */
  worshipWanted(camp: number): string | null {
    return worshipWanted(this, camp);
  }

  understanding(a: number, b: number): number {
    return understanding(this, a, b);
  }

  // ----- daily life of the ideas ------------------------------------------------------------

  /** Once a day (after the groups): births, deaths, yesterday's conversations, learning, drift, splits. */
  dailyUpdate(day: number, tick: number): void {
    this.day = day;
    this.tick = tick;
    const humans = this.humans;
    this.holdings.ensure(humans.people.capacity);
    for (let p = 0; p < humans.people.count; p++) if (humans.people.alive[p] === 1 && this.holdings.ready[p] === 0) this.welcome(p);
    const events = this.journal.since(this.journalRead);
    this.journalRead = this.journal.size;
    readDeaths(this, events);
    readSorrows(this, events);
    this.readTalks();
    this.practised.clear();
    this.hungerToday.clear();
    learning(this);
    discoveries(this);
    cultureDay(this);
    languageDay(this);
    religionDay(this);
    this.metToday.clear();
    this.lastHumanStep = humans.step;
    this.recount();
    if (day % this.params.everyDays === 0) this.periodic(events);
  }

  /** Every few days: splits of cultures, languages and religions, clergy, goods of exchange, place names. */
  private periodic(events: readonly JournalEvent[]): void {
    cultureSplits(this);
    languageSplits(this);
    religionSplits(this);
    clergyCheck(this);
    currencyCheck(this);
    for (const camp of this.humans.camps) if (this.humans.campMembers(camp.id).length > 0) nameNewPlaces(this, camp.id);
    void events;
  }

  /** Living carriers of each idea (knowledge: of each discovery). */
  private recount(): void {
    const h = this.holdings;
    const people = this.humans.people;
    const counts = new Int32Array(this.ideas.length);
    for (let p = 0; p < people.count && p < h.count; p++) {
      if (people.alive[p] === 0 || h.ready[p] === 0) continue;
      for (const id of [h.culture[p]!, h.motherTongue(p), h.religion[p]!]) if (id >= 0) counts[id] = counts[id]! + 1;
      if (h.known[p] === 0) continue;
      for (let k = 0; k < h.knowledgeCount; k++) {
        const source = h.source[p * h.knowledgeCount + k]!;
        if (source >= 0 && (h.known[p]! & (1 << k)) !== 0) counts[source] = counts[source]! + 1;
      }
    }
    for (const idea of this.ideas) if (idea.family !== Family.Currency) idea.holders = counts[idea.id]!;
  }

  /** Yesterday's conversations: who taught whom, influences of values, words, faith and goods. */
  private readTalks(): void {
    const log = this.humans.social.talkLog;
    this.talkedToday.clear();
    const culture = cultureFamily(this);
    const language = languageFamily(this);
    const religion = religionFamily(this);
    for (let k = 0; k + 1 < log.length; k += 2) {
      const a = log[k]!;
      const b = log[k + 1]!;
      if (a >= this.holdings.count || b >= this.holdings.count) continue;
      for (const [x, y] of [
        [a, b],
        [b, a],
      ] as const) {
        const list = this.talkedToday.get(x);
        if (list) {
          if (!list.includes(y)) list.push(y);
        } else this.talkedToday.set(x, [y]);
      }
      conform(culture, a, b);
      if (this.holdings.motherTongue(a) === this.holdings.motherTongue(b)) conform(language, a, b);
      if (this.holdings.religion[a] === this.holdings.religion[b] && this.holdings.religion[a]! >= 0) conform(religion, a, b);
      religionTalk(this, a, b);
      tokenTalk(this, a, b);
    }
  }

  /** Living teachers among `candidates` (parents, guardian) and those one talked with yesterday. */
  teachersOf(person: number, candidates: readonly number[]): number[] {
    const people = this.humans.people;
    const out: number[] = [];
    for (const c of candidates) if (c >= 0 && people.alive[c] === 1 && people.camp[c] === people.camp[person] && !out.includes(c)) out.push(c);
    for (const c of this.talkedToday.get(person) ?? []) if (people.alive[c] === 1 && !out.includes(c)) out.push(c);
    return out;
  }

  /** Who of the camp practised each skill since yesterday (index = skill, -1 none). */
  practisedInCamp(camp: number): Int32Array {
    let seen = this.practised.get(camp);
    if (seen) return seen;
    const humans = this.humans;
    seen = new Int32Array(humans.params.skills.length).fill(-1);
    const state = humans.life.state;
    for (const p of humans.campMembers(camp)) {
      const skill = state.lastSkill[p]!;
      if (skill >= 0 && state.lastSkillStep[p]! >= this.lastHumanStep && seen[skill]! < 0) seen[skill] = p;
    }
    this.practised.set(camp, seen);
    return seen;
  }

  /** Share of a camp's members who went hungry today (0..1). */
  recentHunger(camp: number): number {
    const cached = this.hungerToday.get(camp);
    if (cached !== undefined) return cached;
    const members = this.humans.campMembers(camp);
    let hungry = 0;
    for (const p of members) if (this.humans.people.hunger[p]! >= HUNGRY) hungry++;
    const share = members.length > 0 ? hungry / members.length : 0;
    this.hungerToday.set(camp, share);
    return share;
  }

  /** How harsh an ordinary winter is at the camp (0 mild … 1 bitter). */
  winterCold(camp: number): number {
    const center = this.humans.camps[camp]?.center ?? -1;
    if (center < 0) return 0;
    const coldest = this.humans.climate.coldestAt(center);
    return Math.max(0, Math.min(1, (this.params.knowledge.winterCelsius - coldest) / (FULL / 5)));
  }

  droughtAt(camp: number): boolean {
    const center = this.humans.camps[camp]?.center ?? -1;
    return center >= 0 && this.humans.climate.anomalyIdAt(center) === 'drought';
  }

  /** Game animals around the camp (as surveyed). */
  gameAround(camp: number): number {
    const center = this.humans.camps[camp]?.center ?? -1;
    if (center < 0) return 0;
    const size = this.humans.size;
    let game = 0;
    const fauna = this.humans.fauna;
    fauna.grid.forEachNear((center % size) + 0.5, Math.floor(center / size) + 0.5, this.params.knowledge.environmentTiles, (slot) => {
      if ((fauna.params.species[fauna.store.species[slot]!]!.diet['meat'] ?? 0) === 0) game++;
    });
    return game;
  }

  /** Several times a day: who meets whom from another tribe (trade, languages, watching strangers). */
  runStep(hour: number): void {
    const per = this.params.trade.encountersPerDay;
    if (per <= 0 || !this.groups) return;
    const slot = Math.floor((hour / 24) * per);
    if (slot === this.lastEncounter) return;
    this.lastEncounter = slot;
    encounters(this);
  }

  /** Languages a person speaks (any fluency). */
  languagesOf(person: number): number[] {
    const out: number[] = [];
    for (let s = person * LANGUAGE_SLOTS; s < (person + 1) * LANGUAGE_SLOTS; s++) if (this.holdings.language[s]! >= 0) out.push(this.holdings.language[s]!);
    return out;
  }
}
