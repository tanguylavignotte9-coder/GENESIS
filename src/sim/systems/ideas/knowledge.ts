import { HUMAN_DEATH } from '../individuals/individuals-system';
import type { IdeasSystem } from './ideas-system';
import { Family, Idea } from './idea';
import { ENVIRONMENTS, type EnvironmentId, type NeedId } from './params';
import { IDEA_EVENTS, listWords, publishIdeaEvent } from './texts';
import type { PonderingFacts } from '../individuals/idea-view';

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
  if (!sys.displayRead) sys.environment.set(camp, { day: sys.day, mask });
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

/**
 * Discoveries are worked out step by step (design: « Découvertes progressives et visibles »). An
 * adult who has the need, the surroundings and the bent for a piece of knowledge her people lack may
 * start to think about it (one thing at a time). She then gets closer day after day, faster on the
 * days she practised the craft it belongs to (experimenting while she works) and the more pressing
 * the need; she may lose heart (more when the need is slight, or when she cannot experiment), or
 * succeed. A promising attempt (half way) is told in the journal; so is giving it up after that.
 */
export function discoveries(sys: IdeasSystem): void {
  const { humans, holdings, rng } = sys;
  const people = humans.people;
  const params = sys.params.knowledge;
  const catalog = sys.catalog.knowledge;
  for (let p = 0; p < people.count; p++) {
    if (people.alive[p] === 0 || people.ageYears[p]! < params.minDiscoverAge) continue;
    if (holdings.ponder[p]! >= 0) {
      ponderDay(sys, p);
      continue;
    }
    const known = holdings.known[p]!;
    for (let k = 0; k < catalog.length; k++) {
      if ((known & (1 << k)) !== 0 || (sys.requiredMask[k]! & known) !== sys.requiredMask[k]) continue;
      const def = catalog[k]!;
      const chance = params.discoveryPerDay * params.ponder.startFactor * def.discovery.chance;
      // Cheap draw first: most days nothing happens.
      if (rng.nextFloat() >= chance * 2) continue;
      if (!surroundingsAllow(sys, p, k)) continue;
      // What one's own people already know is learnt from them, not discovered again.
      if (campKnows(sys, people.camp[p]!, k)) continue;
      const need = needOf(sys, p, def.discovery.need);
      const odds = (need * aptitude(sys, p, sys.skillOf[k]!)) / 2;
      if (rng.nextFloat() >= odds) continue;
      holdings.ponder[p] = k;
      holdings.ponderProgress[p] = 0;
      holdings.ponderSince[p] = sys.day;
      holdings.ponderLead[p] = -1;
      break;
    }
  }
}

function surroundingsAllow(sys: IdeasSystem, person: number, k: number): boolean {
  const env = sys.environmentMask[k]!;
  return env === 0 || (surveyCamp(sys, sys.humans.people.camp[person]!) & env) === env;
}

/** Did the person work at the craft of knowledge `k` since yesterday (any work, for knowledge without a craft)? */
function practised(sys: IdeasSystem, person: number, k: number): boolean {
  const state = sys.humans.life.state;
  const skill = state.lastSkill[person]!;
  if (skill < 0 || state.lastSkillStep[person]! < sys.lastHumanStep) return false;
  const wanted = sys.skillOf[k]!;
  return wanted < 0 || skill === wanted;
}

/** One more day of trying to work knowledge out: progress, success, or giving up. */
function ponderDay(sys: IdeasSystem, person: number): void {
  const h = sys.holdings;
  const k = h.ponder[person]!;
  const params = sys.params.knowledge.ponder;
  const def = sys.catalog.knowledge[k]!;
  const camp = sys.humans.people.camp[person]!;
  // Learnt meanwhile, or someone of the camp found it or brought it: no need to search any more.
  if (h.knows(person, k) || campKnows(sys, camp, k)) {
    stopPondering(sys, person);
    return;
  }
  // Moved away from what made it possible (the clay, the game…): one cannot go on.
  if (!surroundingsAllow(sys, person, k)) {
    giveUp(sys, person, sys.params.texts.giveUp, 'loin de ce qui le rendait possible');
    return;
  }
  const need = needOf(sys, person, def.discovery.need);
  const working = practised(sys, person, k);
  const pace = (working ? params.practicePerDay : params.idlePerDay) * aptitude(sys, person, sys.skillOf[k]!) * (0.5 + need);
  h.ponderProgress[person] = Math.min(1, h.ponderProgress[person]! + pace);
  if (h.ponderProgress[person]! >= params.milestone && h.ponderLead[person]! < 0) {
    h.ponderLead[person] = publishIdeaEvent(
      sys,
      IDEA_EVENTS.breakthrough,
      sys.params.texts.breakthrough,
      { nom: sys.humans.people.names[person]!, savoir: def.the, pronom: sys.humans.people.female[person] === 1 ? 'elle' : 'il', besoin: sys.params.needTexts[def.discovery.need], milieu: envText(sys, k) },
      person,
      [],
      { knowledge: def.id },
    );
  }
  if (h.ponderProgress[person]! >= 1) {
    const lead = h.ponderLead[person]!;
    stopPondering(sys, person);
    discover(sys, person, k, need, lead >= 0 ? [lead] : []);
    return;
  }
  const abandon = params.abandonPerDay * (1 - Math.min(1, need)) + (working ? 0 : params.idleAbandonPerDay);
  if (sys.rng.nextFloat() < abandon) giveUp(sys, person, sys.params.texts.giveUp, need < 0.3 ? 'le besoin ne se faisait plus sentir' : 'découragé' + (sys.humans.people.female[person] === 1 ? 'e' : ''));
}

/** Gives up the search; told in the journal only after a promising attempt. */
function giveUp(sys: IdeasSystem, person: number, template: string, reason: string): void {
  const h = sys.holdings;
  const lead = h.ponderLead[person]!;
  const k = h.ponder[person]!;
  if (lead >= 0) {
    publishIdeaEvent(sys, IDEA_EVENTS.giveUp, template, { nom: sys.humans.people.names[person]!, savoir: sys.catalog.knowledge[k]!.the, jours: String(sys.day - h.ponderSince[person]!), raison: reason }, person, [lead], {
      knowledge: sys.catalog.knowledge[k]!.id,
    });
  }
  stopPondering(sys, person);
}

function stopPondering(sys: IdeasSystem, person: number): void {
  const h = sys.holdings;
  h.ponder[person] = -1;
  h.ponderProgress[person] = 0;
  h.ponderLead[person] = -1;
}

function envText(sys: IdeasSystem, k: number): string {
  return sys.catalog.knowledge[k]!.discovery.environment.map((env) => sys.params.environmentTexts[env]).join('');
}

/** What the person is working out, with the state of each condition, for her sheet and her brain. */
export function ponderingFacts(sys: IdeasSystem, person: number): PonderingFacts | null {
  const h = sys.holdings;
  if (person < 0 || person >= h.count || h.ponder[person]! < 0) return null;
  sys.displayRead = true;
  try {
    return readPondering(sys, person);
  } finally {
    sys.displayRead = false;
  }
}

function readPondering(sys: IdeasSystem, person: number): PonderingFacts {
  const h = sys.holdings;
  const k = h.ponder[person]!;
  const def = sys.catalog.knowledge[k]!;
  const need = Math.min(1, needOf(sys, person, def.discovery.need));
  const skill = sys.skillOf[k]!;
  const conditions: PonderingFacts['conditions'] = [];
  const required = def.requires.map((id) => sys.catalog.knowledge.find((item) => item.id === id)?.name ?? id);
  if (required.length > 0) conditions.push({ label: `Sait déjà : ${required.join(', ')}`, ok: true, value: -1 });
  conditions.push({ label: `Besoin : ${sys.params.needTexts[def.discovery.need]}`, ok: need > 0, value: need });
  const mask = surveyCamp(sys, sys.humans.people.camp[person]!);
  for (const env of def.discovery.environment) {
    const text = sys.params.environmentTexts[env].replace(/^,\s*(et\s+)?/, '');
    conditions.push({ label: `Milieu : ${text}`, ok: (mask & (1 << ENVIRONMENTS.indexOf(env))) !== 0, value: -1 });
  }
  conditions.push({ label: 'Aptitude (curiosité, application, savoir-faire)', ok: true, value: Math.min(1, aptitude(sys, person, skill) / 2) });
  const craft = skill >= 0 ? sys.humans.params.skills[skill]!.name.toLowerCase() : 'ses travaux';
  conditions.push({ label: `A expérimenté aujourd’hui (${craft})`, ok: practised(sys, person, k), value: -1 });
  return { knowledge: def.name, progress: h.ponderProgress[person]!, days: sys.day - h.ponderSince[person]!, conditions };
}

function campKnows(sys: IdeasSystem, camp: number, k: number): boolean {
  for (const p of sys.humans.campMembers(camp)) if (sys.holdings.knows(p, k)) return true;
  return false;
}
function discover(sys: IdeasSystem, person: number, k: number, need: number, causes: readonly number[]): void {
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
    causes,
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
 * Deaths of holders (read in the journal): a piece of knowledge nobody of the camp knows any more
 * is lost there — told once, with the last of its holders who died, and whether anyone in the
 * world still knows it. (Losing everything with the last members of a tribe is not told twice.)
 */
export function readDeaths(sys: IdeasSystem, events: readonly { type: string; details: Record<string, string | number>; id: number }[]): void {
  const { holdings, humans } = sys;
  const people = humans.people;
  const deaths = events.filter((event) => event.type === HUMAN_DEATH && Number(event.details['person']) < holdings.count && holdings.known[Number(event.details['person'])]! !== 0);
  if (deaths.length === 0) return;
  const told = new Set<string>();
  // The last to die carries the story.
  for (const event of [...deaths].reverse()) {
    const dead = Number(event.details['person']);
    const camp = people.camp[dead]!;
    const lostHere: number[] = [];
    const lostEverywhere: number[] = [];
    for (let k = 0; k < sys.catalog.knowledge.length; k++) {
      if (!holdings.knows(dead, k) || told.has(`${camp}:${k}`)) continue;
      const where = holders(sys, k, camp);
      if (where.inCamp) continue;
      endDiscovery(sys, holdings.source[dead * holdings.knowledgeCount + k]!);
      told.add(`${camp}:${k}`);
      if (where.anywhere) {
        if (humans.campMembers(camp).length > 0) lostHere.push(k);
      } else if (where.living > 0 && (humans.campMembers(camp).length > 0 || !sys.catalog.knowledge[k]!.startsKnown)) lostEverywhere.push(k);
    }
    const vars = { nom: people.names[dead]!, e: people.female[dead] === 1 ? 'e' : '', tribu: sys.groups?.tribeOfCamp(camp)?.name ?? 'la tribu' };
    const names = (list: number[]): string => listWords(list.map((k) => sys.catalog.knowledge[k]!.the));
    if (lostHere.length > 0) publishIdeaEvent(sys, IDEA_EVENTS.lost, sys.params.texts.lostHere, { ...vars, savoirs: names(lostHere) }, dead, [event.id], { knowledge: lostHere.map((k) => sys.catalog.knowledge[k]!.id).join(',') });
    if (lostEverywhere.length > 0) publishIdeaEvent(sys, IDEA_EVENTS.lost, sys.params.texts.lost, { ...vars, savoirs: names(lostEverywhere) }, dead, [event.id], { knowledge: lostEverywhere.map((k) => sys.catalog.knowledge[k]!.id).join(',') });
  }
}

/** Who still knows knowledge `k`: in the camp, anywhere, and how many people live at all. */
function holders(sys: IdeasSystem, k: number, camp: number): { inCamp: boolean; anywhere: boolean; living: number } {
  const people = sys.humans.people;
  let inCamp = false;
  let anywhere = false;
  let living = 0;
  for (let p = 0; p < people.count; p++) {
    if (people.alive[p] === 0) continue;
    living++;
    if (!sys.holdings.knows(p, k)) continue;
    anywhere = true;
    if (people.camp[p] === camp) inCamp = true;
  }
  return { inCamp, anywhere, living };
}

/** A discovery nobody carries any more has ended. */
function endDiscovery(sys: IdeasSystem, source: number): void {
  const idea = sys.ideas[source];
  if (!idea || !idea.alive) return;
  const h = sys.holdings;
  const people = sys.humans.people;
  for (let p = 0; p < people.count && p < h.count; p++) {
    if (people.alive[p] === 0) continue;
    for (let k = 0; k < h.knowledgeCount; k++) if (h.source[p * h.knowledgeCount + k] === source && h.knows(p, k)) return;
  }
  idea.endedDay = sys.day;
  idea.holders = 0;
}


export { Idea };
