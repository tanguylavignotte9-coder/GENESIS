import type { Group } from '../groups/group';
import { Water } from '../world/hydrology';
import { placeKeys, regionOctant, riverMouth, riverNear } from '../world/places';
import type { IdeasSystem } from './ideas-system';
import { LANGUAGE_SLOTS } from './holdings';
import { Family, type Idea } from './idea';
import { daughterPhonology, newPhonology, peopleName, personName, word } from './phonology';
import { findSplits, inheritVector, noise, wander, type VectorFamily } from './drift';
import { IDEA_EVENTS, publishIdeaEvent } from './texts';

/**
 * Languages (simulated in depth): each has its own sounds and makes the names of its people, of
 * the tribes and of the places they live in. Everyone speaks their mother tongue in their own way
 * (a small vector of pronunciation habits) that drifts and is pulled by conversation; a tribe that
 * lives apart ends up speaking a daughter language (a few sound changes). Two tribes of different
 * languages understand each other badly, unless someone speaks both: children of mixed couples,
 * spouses, people who often meet strangers.
 */

const NAME_TRIES = 12;
const MOUNTAIN_BIOME = 'mountain';
/** Tiles around a camp within which a river is named by those who live there. */
const RIVER_NAMING_TILES = 4;

export function languageFamily(sys: IdeasSystem): VectorFamily {
  const h = sys.holdings;
  return { family: Family.Language, params: sys.params.language, dims: h.dialectCount, holderOf: (p) => h.language[p * LANGUAGE_SLOTS]!, vector: h.dialect };
}

/** A new language (a first one, or the daughter of `parent`). */
export function newLanguage(sys: IdeasSystem, parent: number, founder: number, event: number, tribe: number): Idea {
  const mother = parent >= 0 ? sys.ideas[parent]! : null;
  const phonology = mother?.phonology ? daughterPhonology(mother.phonology, sys.params.language, sys.rng) : newPhonology(sys.params.language, sys.rng);
  const name = word(phonology, sys.rng, 2).toLowerCase();
  const idea = sys.addIdea(Family.Language, name, parent, founder, event, tribe);
  idea.phonology = phonology;
  idea.generation = mother ? mother.generation + 1 : 0;
  idea.mean = new Array<number>(sys.params.language.dims).fill(0.5);
  return idea;
}

/** A name for a person, unique in the world, in the given language. */
export function personNameIn(sys: IdeasSystem, language: number, female: boolean): string {
  const phonology = sys.ideas[language]?.phonology;
  if (!phonology) return '?';
  const syllables = sys.params.language.nameSyllables;
  let name = personName(phonology, sys.rng, female, syllables);
  for (let k = 0; k < NAME_TRIES && sys.usedNames.has(name); k++) name = personName(phonology, sys.rng, female, syllables);
  while (sys.usedNames.has(name)) name += word(phonology, sys.rng, 1).toLowerCase();
  sys.usedNames.add(name);
  return name;
}

/** A people's name in the language ("Tamuki"). */
export function peopleNameIn(sys: IdeasSystem, language: number): string {
  const phonology = sys.ideas[language]?.phonology;
  return phonology ? peopleName(phonology, sys.rng) : '?';
}

/** A person of a starting tribe speaks its language (fluently, or as well as a child of their age can). */
export function startLanguageOf(sys: IdeasSystem, person: number, language: number): void {
  const h = sys.holdings;
  const base = person * LANGUAGE_SLOTS;
  h.language[base] = language;
  h.fluency[base] = childFluency(sys, person);
  for (let d = 0; d < h.dialectCount; d++) h.dialect[person * h.dialectCount + d] = 0.5 + sys.params.language.childNoise * noise(sys.rng);
}

function childFluency(sys: IdeasSystem, person: number): number {
  return Math.min(1, sys.humans.people.ageYears[person]! / sys.params.language.childFluencyYears);
}

/** A newborn's mother tongue is its mother's; a father of another language will teach it his. */
export function inheritLanguage(sys: IdeasSystem, child: number, parents: readonly number[]): void {
  const h = sys.holdings;
  const mother = parents[0] ?? -1;
  const language = mother >= 0 ? h.motherTongue(mother) : sys.startLanguages[0] ?? -1;
  h.language[child * LANGUAGE_SLOTS] = language;
  h.fluency[child * LANGUAGE_SLOTS] = 0;
  const speakers = parents.filter((p) => h.motherTongue(p) === language);
  inheritVector(languageFamily(sys), child, speakers.length > 0 ? speakers : parents, sys.rng);
}

/** Every day: children learn to speak, spouses learn each other's language, everyone's speech drifts a little. */
export function languageDay(sys: IdeasSystem): void {
  const h = sys.holdings;
  const people = sys.humans.people;
  const params = sys.params.language;
  const family = languageFamily(sys);
  for (let p = 0; p < people.count; p++) {
    if (people.alive[p] === 0 || h.ready[p] === 0) continue;
    const base = p * LANGUAGE_SLOTS;
    if (h.fluency[base]! < 1) h.fluency[base] = Math.max(h.fluency[base]!, childFluency(sys, p));
    wander(family, p, sys.yearDays, sys.rng);
    const curious = 0.5 + sys.humans.social.trait(p, 'curiosity');
    // At home: the spouse's language, and a child the language of each parent.
    const home: number[] = [];
    if (people.spouse[p]! >= 0 && people.alive[people.spouse[p]!] === 1) home.push(people.spouse[p]!);
    if (sys.humans.life.isChild(p)) for (const parent of [people.mother[p]!, people.father[p]!]) if (parent >= 0 && people.alive[parent] === 1) home.push(parent);
    for (const other of home) learnLanguage(sys, p, h.motherTongue(other), params.homeLearnPerDay * curious * (sys.humans.life.isChild(p) ? 2 : 1));
    for (const stranger of sys.metToday.get(p) ?? []) learnLanguage(sys, p, h.motherTongue(stranger), params.contactLearnPerDay * curious);
  }
}

function learnLanguage(sys: IdeasSystem, person: number, language: number, amount: number): void {
  const h = sys.holdings;
  if (language < 0 || h.motherTongue(person) === language) return;
  // A sister language is half understood already: it is learnt faster.
  const slot = h.languageSlot(person, language, true);
  if (slot < 0) return;
  const head = intelligibility(sys, h.motherTongue(person), language);
  h.fluency[slot] = Math.min(1, Math.max(h.fluency[slot]!, head * 0.5) + amount * (1 + head));
}

/**
 * How well two languages understand each other: 1 for the same, then less for each generation
 * that separates them from their common ancestor (0 without one).
 */
export function intelligibility(sys: IdeasSystem, a: number, b: number): number {
  if (a === b) return a >= 0 ? 1 : 0;
  if (a < 0 || b < 0) return 0;
  const ancestors = new Map<number, number>();
  let at: Idea | undefined = sys.ideas[a];
  let steps = 0;
  while (at) {
    ancestors.set(at.id, steps++);
    at = at.parent >= 0 ? sys.ideas[at.parent] : undefined;
  }
  at = sys.ideas[b];
  steps = 0;
  while (at) {
    const other = ancestors.get(at.id);
    if (other !== undefined) return sys.params.language.kinshipIntelligibility ** Math.max(1, other + steps - 1);
    steps++;
    at = at.parent >= 0 ? sys.ideas[at.parent] : undefined;
  }
  return 0;
}

/** How well two people understand each other: the best language they share (fluency and kinship). */
export function understanding(sys: IdeasSystem, a: number, b: number): number {
  const h = sys.holdings;
  let best = 0;
  for (let s = a * LANGUAGE_SLOTS; s < (a + 1) * LANGUAGE_SLOTS; s++) {
    const la = h.language[s]!;
    if (la < 0) continue;
    for (let t = b * LANGUAGE_SLOTS; t < (b + 1) * LANGUAGE_SLOTS; t++) {
      const lb = h.language[t]!;
      if (lb < 0) continue;
      best = Math.max(best, Math.min(h.fluency[s]!, h.fluency[t]!) * intelligibility(sys, la, lb));
    }
  }
  return best;
}

/** The best go-between of two tribes: who speaks both their languages best (-1 none) and how well. */
export function interpreterOf(sys: IdeasSystem, a: Group, b: Group, adultAge: number): { person: number; skill: number } {
  const la = sys.dominant(a, Family.Language, adultAge).idea;
  const lb = sys.dominant(b, Family.Language, adultAge).idea;
  let person = -1;
  let skill = 0;
  for (const p of [...a.members, ...b.members]) {
    if (p >= sys.holdings.count) continue;
    const both = Math.min(sys.holdings.fluencyIn(p, la) * 1, sys.holdings.fluencyIn(p, lb));
    if (both > skill) {
      skill = both;
      person = p;
    }
  }
  return { person, skill };
}

/** How well two tribes understand each other: their main languages, or their best interpreter. */
export function tribeUnderstanding(sys: IdeasSystem, a: Group, b: Group): number {
  const adultAge = sys.groups?.params.adultAge ?? 16;
  const la = sys.dominant(a, Family.Language, adultAge).idea;
  const lb = sys.dominant(b, Family.Language, adultAge).idea;
  const direct = intelligibility(sys, la, lb);
  if (direct >= 1) return 1;
  return Math.max(direct, interpreterOf(sys, a, b, adultAge).skill);
}

/** A tribe whose speech drifted far from the other speakers of its language now speaks a daughter language. */
export function languageSplits(sys: IdeasSystem): void {
  findSplits(sys, languageFamily(sys), (tribe, ideaId, carriers) => {
    const h = sys.holdings;
    const old = sys.ideas[ideaId]!;
    const idea = newLanguage(sys, old.id, -1, -1, tribe.id);
    const event = publishIdeaEvent(sys, IDEA_EVENTS.language, sys.params.texts.languageBorn, { tribu: capitalize(tribe.name), mere: `le ${old.name}`, nom: idea.name }, tribe.leaders[0] ?? -1, [tribe.foundedEvent], {
      language: idea.id,
      from: old.id,
    });
    idea.event = event;
    for (const p of carriers) h.language[p * LANGUAGE_SLOTS] = idea.id;
  });
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The people of a camp name the places they live in, in their language, if nobody did before:
 * their region, the mountains in sight, the river they drink from.
 */
export function nameNewPlaces(sys: IdeasSystem, camp: number): void {
  const humans = sys.humans;
  const center = humans.camps[camp]?.center ?? -1;
  if (center < 0) return;
  const tribe = sys.groups?.tribeOfCamp(camp) ?? null;
  const members = humans.campMembers(camp);
  if (members.length === 0) return;
  const language = tribe ? sys.dominant(tribe, Family.Language, 0).idea : sys.holdings.motherTongue(members[0]!);
  const phonology = sys.ideas[language]?.phonology;
  if (!phonology) return;
  const world = humans.world;
  const size = world.size;
  const x = center % size;
  const y = Math.floor(center / size);
  const id = world.landmasses.idOf[center] ?? -1;
  const mass = world.landmasses.list[id];
  if (!mass) return;
  const given = { language, day: sys.day, tribe: tribe?.id ?? -1 };
  const name = (): string => word(phonology, sys.rng, sys.rng.nextIntInclusive(2, 3));
  const toponyms = sys.toponyms;
  const regionKey = mass.isContinent ? placeKeys.region(id, regionOctant(mass, x, y)) : placeKeys.island(id);
  if (!toponyms.has(regionKey)) toponyms.give(regionKey, { ...given, name: name() });
  const river = riverNear(world, x, y, RIVER_NAMING_TILES);
  if (river >= 0 && world.water[river] === Water.River) {
    const key = placeKeys.river(riverMouth(world, river));
    if (!toponyms.has(key)) toponyms.give(key, { ...given, name: name() });
  }
  // Mountains in sight of the camp.
  const r = sys.params.knowledge.environmentTiles;
  const mountain = world.biomes.biomes.findIndex((biome) => biome.id === MOUNTAIN_BIOME);
  for (let dy = -r; dy <= r && mountain >= 0; dy += 2) {
    for (let dx = -r; dx <= r; dx += 2) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || world.biome[ny * size + nx] !== mountain) continue;
      const there = world.landmasses.idOf[ny * size + nx] ?? -1;
      const theirMass = world.landmasses.list[there];
      if (!theirMass) continue;
      const key = placeKeys.mountains(there, theirMass.isContinent ? regionOctant(theirMass, nx, ny) : 0);
      if (!toponyms.has(key)) toponyms.give(key, { ...given, name: name() });
    }
  }
}
