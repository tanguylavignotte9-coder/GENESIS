import { HUMAN_DEATH } from '../individuals/individuals-system';
import type { IdeasSystem } from './ideas-system';
import { Family, Idea } from './idea';
import { ENVIRONMENTS, type EnvironmentId, type NeedId } from './params';
import { IDEA_EVENTS, publishIdeaEvent } from './texts';

const FULL = 100;
/** Species a hunter can approach and tame (for husbandry), and big trees (for a canoe). */
const DOMESTICABLE = ['goat', 'aurochs', 'boar', 'horse'];
const BIG_TREE_KIND = 'tree';

/**
 * Knowledge as ideas (design: « Apparition, prérequis et écriture »). A piece of knowledge appears
 * when someone has the need, the surroundings allow it and their character lends itself to it (a
 * curious mind, practice in the domain), once its prerequisites are known. It is then taught to
 * children, pupils and whoever watches the work, and lost when its last holders die without pupils.
 */

/** What the surroundings of a camp offer, as a bit field over ENVIRONMENTS (surveyed every few days). */
export function surveyCamp(sys: IdeasSystem, camp: number): number {
  const cached = sys.environment.get(camp);
  const params = sys.params.knowledge;
  if (cached && sys.day - cached.day < params.environmentEveryDays) return cached.mask;
  const humans = sys.humans;
  const production = humans.production;
  const center = humans.camps[camp]?.center ?? -1;
  let mask = 0;
  if (center >= 0) {
    const size = humans.size;
    const cx = center % size;
    const cy = Math.floor(center / size);
    const r = params.environmentTiles;
    const items = production.catalog.itemIndex;
    const flint = items.get('flint') ?? -1;
    const stone = items.get('stone') ?? -1;
    const clay = items.get('clay') ?? -1;
    const set = (env: EnvironmentId): void => {
      mask |= 1 << ENVIRONMENTS.indexOf(env);
    };
    let fibers = 0;
    let cereals = 0;
    let flax = 0;
    let bigTrees = 0;
    let water = 0;
    for (let y = Math.max(0, cy - r); y <= Math.min(size - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(size - 1, cx + r); x++) {
        const tile = y * size + x;
        if (humans.world.water[tile] !== 0) {
          water++;
          if (humans.world.water[tile] === 1) set('river');
          continue;
        }
        // Terrain (sampled one tile in two: enough to know whether it is there).
        if ((x + y) % 2 === 0) {
          if (flint >= 0 && production.terrainOffers(tile, flint)) set('flint');
          if (stone >= 0 && production.terrainOffers(tile, stone)) set('stone');
          if (clay >= 0 && production.terrainOffers(tile, clay)) set('clay');
        }
        const plant = humans.flora.speciesAt(tile);
        if (!plant) continue;
        const produce = plant.produce?.resource;
        if (produce === 'plant_fiber') fibers++;
        else if (produce === 'wild_cereals') cereals++;
        else if (produce === 'flax') flax++;
        if (plant.kind === BIG_TREE_KIND) bigTrees++;
      }
    }
    if (fibers > 0) set('fibers');
    if (cereals > 0) set('wild_cereals');
    if (flax > 0) set('flax');
    if (water > 0) set('water');
    if (water > 0 && bigTrees > 0) set('big_trees');
    let game = 0;
    let tame = 0;
    const fauna = humans.fauna;
    fauna.grid.forEachNear(cx + 0.5, cy + 0.5, r, (slot) => {
      const species = fauna.params.species[fauna.store.species[slot]!]!;
      if ((species.diet['meat'] ?? 0) === 0) game++;
      if (DOMESTICABLE.includes(species.id)) tame++;
    });
    if (game > 0) set('game');
    if (tame > 0) set('domesticable');
    const stock = production.stockOf(camp);
    for (const id of ['hide', 'leather']) if (stock.count(items.get(id) ?? -1) > 0) set('hides');
    if (stock.count(items.get('sinew') ?? -1) > 0) set('sinew');
  }
  sys.environment.set(camp, { day: sys.day, mask });
  return mask;
}

/** How pressing a need is for a person today, 0..1. */
export function needOf(sys: IdeasSystem, person: number, need: NeedId): number {
  const humans = sys.humans;
  const people = humans.people;
  const camp = people.camp[person]!;
  const params = sys.params.knowledge;
  const tribe = sys.groups?.tribeOf(person) ?? null;
  const members = tribe?.members.length ?? humans.campMembers(camp).length;
  const hunger = people.hunger[person]! / FULL;
  switch (need) {
    case 'hunger':
      return Math.max(hunger, sys.recentHunger(camp));
    case 'cold':
      return Math.max(people.cold[person]! / FULL, sys.winterCold(camp));
    case 'meat':
      return Math.max(0.3, hunger);
    case 'tools':
      return 0.6;
    case 'carry':
      return 0.4;
    case 'winter':
      return sys.winterCold(camp) > 0 ? Math.min(1, 0.4 + sys.recentHunger(camp)) : 0.1;
    case 'crossing':
      return 0.3;
    case 'famine':
      return Math.min(1, Math.max(sys.recentHunger(camp), members / params.famineMembers - 0.5));
    case 'shelter': {
      const settled = humans.camps[camp] ? (sys.day - humans.camps[camp]!.settledDay) / (humans.life.yearDays * 10) : 0;
      return Math.min(1, 0.2 + settled);
    }
    case 'drought':
      return sys.droughtAt(camp) ? 1 : 0;
    case 'accounting': {
      const daily = humans.production.body.dailyFood * Math.max(1, members);
      return Math.min(1, humans.production.stockFood(camp) / daily / 30);
    }
    case 'game_scarce':
      return Math.max(0.1, 1 - sys.gameAround(camp) / 20);
    case 'sickness':
      return Math.min(1, 0.3 + (humans.life.state.disease[person]! >= 0 ? 0.5 : 0) + hunger * 0.3);
    case 'prestige':
      return Math.min(1, members / params.prestigeMembers);
    case 'comfort':
      return 0.3;
    default:
      return 0;
  }
}

/** Aptitude of a person for a discovery in a domain: curiosity, application, practice. */
function aptitude(sys: IdeasSystem, person: number, skill: number): number {
  const params = sys.params.knowledge;
  let traits = 1;
  for (const [trait, weight] of Object.entries(params.aptitudeTraits)) traits *= Math.max(0, 1 + weight * (2 * sys.humans.social.trait(person, trait) - 1));
  const practice = skill >= 0 ? sys.humans.people.skill(person, skill) : 0;
  return traits * (0.2 + params.skillWeight * practice);
}

/** Every day, every adult may discover something they lack, if need, surroundings and character meet. */
export function discoveries(sys: IdeasSystem): void {
  const { humans, holdings, rng } = sys;
  const people = humans.people;
  const params = sys.params.knowledge;
  const catalog = sys.catalog.knowledge;
  for (let p = 0; p < people.count; p++) {
    if (people.alive[p] === 0 || people.ageYears[p]! < params.minDiscoverAge) continue;
    const known = holdings.known[p]!;
    for (let k = 0; k < catalog.length; k++) {
      if ((known & (1 << k)) !== 0 || (sys.requiredMask[k]! & known) !== sys.requiredMask[k]) continue;
      const def = catalog[k]!;
      const chance = params.discoveryPerDay * def.discovery.chance;
      // Cheap draw first: most days nothing happens.
      if (rng.nextFloat() >= chance * 2) continue;
      const env = sys.environmentMask[k]!;
      if (env !== 0 && (surveyCamp(sys, people.camp[p]!) & env) !== env) continue;
      // What one's own people already know is learnt from them, not discovered again.
      if (campKnows(sys, people.camp[p]!, k)) continue;
      const need = needOf(sys, p, def.discovery.need);
      const odds = need * aptitude(sys, p, sys.skillOf[k]!) / 2;
      if (rng.nextFloat() >= odds) continue;
      discover(sys, p, k, need);
    }
  }
}

function campKnows(sys: IdeasSystem, camp: number, k: number): boolean {
  for (const p of sys.humans.campMembers(camp)) if (sys.holdings.knows(p, k)) return true;
  return false;
}

function discover(sys: IdeasSystem, person: number, k: number, need: number): void {
  const def = sys.catalog.knowledge[k]!;
  const people = sys.humans.people;
  const tribe = sys.groups?.tribeOf(person) ?? null;
  const elsewhere = sys.ideas.some((idea) => idea.family === Family.Knowledge && idea.knowledge === k && idea.founder >= 0);
  const envText = def.discovery.environment.map((env) => sys.params.environmentTexts[env]).join('');
  const needText = need > 0 ? sys.params.needTexts[def.discovery.need] : '';
  const event = publishIdeaEvent(
    sys,
    IDEA_EVENTS.discovery,
    elsewhere ? sys.params.texts.discoveryAgain : sys.params.texts.discovery,
    { nom: people.names[person]!, savoir: def.the, besoin: needText, milieu: envText },
    person,
    [],
    { knowledge: def.id },
  );
  const idea = sys.addIdea(Family.Knowledge, def.name, -1, person, event, tribe?.id ?? -1);
  idea.knowledge = k;
  idea.reason = `${needText}${envText}`;
  sys.learn(person, k, idea.id, -1);
}

/**
 * Teaching and watching: each day a learner progresses in what their parents or guardian know, in
 * what was shown to them by someone they talked with, and in what they saw someone of the camp do.
 */
export function learning(sys: IdeasSystem): void {
  const { humans, holdings } = sys;
  const people = humans.people;
  const params = sys.params.knowledge;
  const catalog = sys.catalog.knowledge;
  const guardian = humans.life.state.guardian;
  for (let p = 0; p < people.count; p++) {
    if (people.alive[p] === 0 || people.ageYears[p]! < params.minLearnAge) continue;
    const child = humans.life.isChild(p);
    const speed = (child ? params.childLearning : 1) * aptitudeToLearn(sys, p);
    const teachers = sys.teachersOf(p, [people.mother[p]!, people.father[p]!, guardian[p]!]);
    const watched = sys.practisedInCamp(people.camp[p]!);
    const strangers = sys.metToday.get(p);
    const known = holdings.known[p]!;
    for (let k = 0; k < catalog.length; k++) {
      if ((known & (1 << k)) !== 0) continue;
      // One cannot learn a craft whose foundations one lacks.
      if ((sys.requiredMask[k]! & known) !== sys.requiredMask[k]) continue;
      let gain = 0;
      let from = -1;
      for (const teacher of teachers) {
        if (holdings.knows(teacher, k)) {
          gain = params.teachPerDay;
          from = teacher;
          break;
        }
      }
      if (gain === 0) {
        const watchedTeacher = watched[sys.skillOf[k]!] ?? -1;
        if (watchedTeacher >= 0 && holdings.knows(watchedTeacher, k)) {
          gain = params.observePerDay;
          from = watchedTeacher;
        }
      }
      if (gain === 0 && strangers) {
        for (const stranger of strangers) {
          if (holdings.knows(stranger, k)) {
            gain = params.contactPerDay * sys.understanding(p, stranger);
            from = stranger;
            break;
          }
        }
      }
      if (gain <= 0) continue;
      const at = p * holdings.knowledgeCount + k;
      holdings.learning[at] = holdings.learning[at]! + gain * speed;
      if (holdings.learning[at]! >= 1) sys.learn(p, k, holdings.source[from * holdings.knowledgeCount + k]!, from);
    }
  }
}

function aptitudeToLearn(sys: IdeasSystem, person: number): number {
  let factor = 1;
  for (const [trait, weight] of Object.entries(sys.params.knowledge.aptitudeTraits)) factor *= Math.max(0.2, 1 + 0.5 * weight * (2 * sys.humans.social.trait(person, trait) - 1));
  return factor;
}

/**
 * Deaths of holders (read in the journal): a discovery whose last holder is gone is lost — told in
 * the journal, with whether others still know the same craft elsewhere.
 */
export function readDeaths(sys: IdeasSystem, events: readonly { type: string; details: Record<string, string | number>; id: number }[]): void {
  const { holdings } = sys;
  for (const event of events) {
    if (event.type !== HUMAN_DEATH) continue;
    const dead = Number(event.details['person']);
    if (dead >= holdings.count) continue;
    const known = holdings.known[dead]!;
    if (known === 0) continue;
    for (let k = 0; k < sys.catalog.knowledge.length; k++) {
      if ((known & (1 << k)) === 0) continue;
      const source = holdings.source[dead * holdings.knowledgeCount + k]!;
      checkLoss(sys, dead, k, source, event.id);
    }
  }
}

function checkLoss(sys: IdeasSystem, dead: number, k: number, source: number, deathEvent: number): void {
  const { holdings, humans } = sys;
  const people = humans.people;
  const def = sys.catalog.knowledge[k]!;
  const camp = people.camp[dead]!;
  let inCamp = false;
  let anywhere = false;
  let sameSource = false;
  for (let p = 0; p < people.count; p++) {
    if (people.alive[p] === 0 || !holdings.knows(p, k)) continue;
    anywhere = true;
    if (people.camp[p] === camp) inCamp = true;
    if (holdings.source[p * holdings.knowledgeCount + k] === source) sameSource = true;
    if (inCamp && sameSource) return;
  }
  const idea = sys.ideas[source];
  if (!sameSource && idea && idea.alive) {
    idea.endedDay = sys.day;
    idea.holders = 0;
  }
  if (inCamp) return;
  const tribe = sys.groups?.tribeOfCamp(camp) ?? null;
  const vars = { savoir: capitalizeFirst(def.the), nom: people.names[dead]!, e: people.female[dead] === 1 ? 'e' : '', tribu: tribe?.name ?? 'la tribu' };
  const event = publishIdeaEvent(sys, IDEA_EVENTS.lost, anywhere ? sys.params.texts.lostHere : sys.params.texts.lost, vars, dead, [deathEvent], { knowledge: def.id });
  if (idea && !sameSource) idea.endEvent = event;
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export { Idea };
