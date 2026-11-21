import type { Journal } from '../../core/journal';
import { fillTemplate } from '../../core/text';
import { describeLocation } from '../world/places';
import { State } from './animal-store';
import type { FaunaSystem } from './fauna-system';
import { foodValueAt } from './food';
import type { AnimalSpecies } from './params';

/**
 * Domestic animals stay animals of the fauna, each one simulated, with an owner: the camp that
 * keeps it and, under family or private property, a person. They live around their home (the pen
 * of their camp, or its centre while there is no pen), graze the pasture around it, drink at the
 * trough the herders keep, breed like any animal (their young are born tame), fall ill, can be
 * killed by a predator, and may escape: the less tame, the hungrier, the more so without a pen.
 */

export const DOMESTIC_EVENTS = {
  escape: 'fauna.domestic.escape',
  deaths: 'fauna.domestic.deaths',
} as const;

/** Words for a tamed animal in a sentence: « Une chèvre … échappée », « Un chien … échappé ». */
export function genderOf(species: AnimalSpecies): { Un: string; un: string; e: string; animal: string } {
  return species.tameFeminine ? { Un: 'Une', un: 'une', e: 'e', animal: species.tameName } : { Un: 'Un', un: 'un', e: '', animal: species.tameName };
}

/** Plural of a tamed animal's name (« bœufs », « chevaux », « chèvres »). */
export function plural(name: string): string {
  if (name.endsWith('al')) return `${name.slice(0, -2)}aux`;
  if (name.endsWith('s') || name.endsWith('x')) return name;
  return `${name}s`;
}

/** Herd of a camp's animals of one species (key of `FaunaSystem.domesticGroups`). */
export function herdKey(camp: number, species: number): number {
  return camp * 256 + species;
}

/** The animal becomes domestic: kept by `camp`, owned by `owner` (-1: in common), living at (homeX, homeY). */
export function domesticate(fauna: FaunaSystem, slot: number, camp: number, owner: number, homeX: number, homeY: number, penned: boolean, event: number, tame?: number): void {
  const { store, groups } = fauna;
  if (tame !== undefined) store.tame[slot] = tame;
  store.ownerCamp[slot] = camp;
  store.ownerPerson[slot] = owner;
  store.homeX[slot] = homeX;
  store.homeY[slot] = homeY;
  store.penned[slot] = penned ? 1 : 0;
  store.captureEvent[slot] = event;
  store.fleesHuman[slot] = 0;
  store.state[slot] = State.Follow;
  store.targetX[slot] = homeX;
  store.targetY[slot] = homeY;
  // It leaves its wild herd for the camp's herd of its species.
  const old = store.group[slot]!;
  groups.size[old] = Math.max(0, groups.size[old]! - 1);
  if (groups.leader[old] === slot) groups.leader[old] = -1;
  const key = herdKey(camp, store.species[slot]!);
  let herd = fauna.domesticGroups.get(key);
  if (herd === undefined || groups.species[herd] !== store.species[slot]) {
    herd = groups.add(store.species[slot]!, slot);
    fauna.domesticGroups.set(key, herd);
  }
  store.group[slot] = herd;
  groups.size[herd] = groups.size[herd]! + 1;
}

/** The animal goes back to the wild (escaped, or its people are gone): a herd of its own. */
export function releaseToWild(fauna: FaunaSystem, slot: number): void {
  const { store, groups } = fauna;
  store.ownerCamp[slot] = -1;
  store.ownerPerson[slot] = -1;
  store.penned[slot] = 0;
  store.tame[slot] = 0;
  const old = store.group[slot]!;
  groups.size[old] = Math.max(0, groups.size[old]! - 1);
  if (groups.leader[old] === slot) groups.leader[old] = -1;
  const own = groups.add(store.species[slot]!, slot);
  store.group[slot] = own;
  groups.size[own] = 1;
  store.state[slot] = State.Rest;
}

/** The keepers' new home for the camp's animals (a pen built, the camp moved). */
export function rehome(fauna: FaunaSystem, camp: number, homeX: number, homeY: number, penned: boolean): void {
  const { store } = fauna;
  for (let slot = 0; slot < store.slots; slot++) {
    if (store.alive[slot] !== 1 || store.ownerCamp[slot] !== camp) continue;
    store.homeX[slot] = homeX;
    store.homeY[slot] = homeY;
    store.penned[slot] = penned ? 1 : 0;
  }
}

/** Distance from the animal to its home (tiles). */
function awayFromHome(fauna: FaunaSystem, slot: number): number {
  const { store } = fauna;
  const dx = store.px[slot]! - store.homeX[slot]!;
  const dy = store.py[slot]! - store.homeY[slot]!;
  return Math.sqrt(dx * dx + dy * dy);
}

/** May the animal drink here (water, or the trough at its home)? */
export function troughHere(fauna: FaunaSystem, slot: number): boolean {
  return fauna.store.isDomestic(slot) && awayFromHome(fauna, slot) <= fauna.params.domestic.pastureTiles;
}

/**
 * What a domestic animal wants (after fleeing a predator, which comes first): drink at its home,
 * graze the pasture around it (never beyond), go back home when it strayed, else rest.
 */
export function thinkDomestic(fauna: FaunaSystem, slot: number, species: AnimalSpecies): void {
  const { store, params } = fauna;
  const pasture = params.domestic.pastureTiles;
  const away = awayFromHome(fauna, slot);
  if (away > pasture) {
    setGoal(fauna, slot, State.Follow, store.homeX[slot]!, store.homeY[slot]!);
    return;
  }
  if (store.thirst[slot]! > params.needs.seekWaterAbove) {
    store.state[slot] = State.Drink;
    return;
  }
  if (store.hunger[slot]! > params.needs.seekFoodAbove) {
    const code = store.species[slot]!;
    if (foodValueAt(fauna, code, store.x[slot]!, store.y[slot]!) >= species.foodPerDay / 4) {
      store.state[slot] = State.Eat;
      return;
    }
    let best = 0;
    let bx = 0;
    let by = 0;
    const r = Math.max(1, Math.floor(pasture));
    for (let s = 0; s < params.behavior.forageSamples; s++) {
      const tx = Math.floor(store.homeX[slot]!) + fauna.rng.nextIntInclusive(-r, r);
      const ty = Math.floor(store.homeY[slot]!) + fauna.rng.nextIntInclusive(-r, r);
      if (!fauna.isWalkable(tx, ty)) continue;
      const value = foodValueAt(fauna, code, tx, ty);
      if (value > best) {
        best = value;
        bx = tx;
        by = ty;
      }
    }
    if (best > 0) {
      setGoal(fauna, slot, State.Forage, bx + 0.5, by + 0.5);
      return;
    }
    // Nothing left to graze: it waits at home for its keepers to bring fodder.
  }
  if (fauna.rng.nextFloat() < params.behavior.wanderChance) {
    const r = Math.max(1, Math.floor(pasture / 2));
    setGoal(fauna, slot, State.Wander, store.homeX[slot]! + fauna.rng.nextIntInclusive(-r, r), store.homeY[slot]! + fauna.rng.nextIntInclusive(-r, r));
    return;
  }
  store.state[slot] = State.Rest;
}

function setGoal(fauna: FaunaSystem, slot: number, state: number, x: number, y: number): void {
  const { store } = fauna;
  store.state[slot] = state;
  store.targetX[slot] = Math.max(0.5, Math.min(fauna.size - 0.5, x));
  store.targetY[slot] = Math.max(0.5, Math.min(fauna.size - 0.5, y));
  store.fleesHuman[slot] = 0;
}

/** Daily: a domestic animal grows tamer, or escapes (the wilder, the hungrier, without a pen: the likelier). */
export function liveDomesticDay(fauna: FaunaSystem, slot: number): boolean {
  const { store, params } = fauna;
  const d = params.domestic;
  store.tame[slot] = Math.min(1, store.tame[slot]! + d.tamePerDay);
  const hunger = store.hunger[slot]! / 100;
  const chance = d.escapePerDay * (1 - store.tame[slot]!) * (1 + d.hungerEscape * hunger) * (store.penned[slot] === 1 ? 1 : d.noPenEscape) + (hunger >= 1 ? d.starvingEscape : 0);
  if (fauna.rng.nextFloat() >= chance) return false;
  const camp = store.ownerCamp[slot]!;
  const why = hunger >= 1 ? d.texts.starving : store.penned[slot] === 1 ? d.texts.wild : d.texts.noPen;
  fauna.escapes.push({ slot, camp, species: store.species[slot]!, why, cause: store.captureEvent[slot]! });
  releaseToWild(fauna, slot);
  return true;
}

/** Escapes of the day, told in the journal (one line per animal, its capture as the cause). */
export function publishEscapes(fauna: FaunaSystem, journal: Journal, tick: number): void {
  const d = fauna.params.domestic;
  for (const escape of fauna.escapes) {
    const species = fauna.params.species[escape.species]!;
    const x = fauna.store.x[escape.slot]!;
    const y = fauna.store.y[escape.slot]!;
    const place = describeLocation(fauna.world, x, y);
    journal.publish({
      tick,
      type: DOMESTIC_EVENTS.escape,
      text: fillTemplate(fillTemplate(d.texts.escape, { raison: escape.why }), { ...genderOf(species), peuple: fauna.keeperName(escape.camp), lieu: place }),
      place: { x, y, label: place },
      actors: [{ kind: 'animal', id: escape.slot }],
      causes: escape.cause >= 0 ? [escape.cause] : [],
      details: { camp: escape.camp, species: species.id },
    });
  }
  fauna.escapes.length = 0;
}

/** Deaths of the day among a camp's animals, told together (cause names in French). */
export function publishDomesticDeaths(fauna: FaunaSystem, journal: Journal, tick: number, causeNames: readonly string[]): void {
  const d = fauna.params.domestic;
  for (const [key, counts] of fauna.domesticDeaths) {
    const camp = Math.floor(key / 256);
    const species = fauna.params.species[key % 256]!;
    const parts: string[] = [];
    let total = 0;
    counts.forEach((n, cause) => {
      if (n <= 0) return;
      total += n;
      parts.push(`${n} ${causeNames[cause] ?? '?'}`);
    });
    if (total === 0) continue;
    journal.publish({
      tick,
      type: DOMESTIC_EVENTS.deaths,
      text: fillTemplate(total > 1 ? d.texts.deathsMany : d.texts.deathsOne, { ...genderOf(species), n: String(total), animaux: plural(species.tameName), peuple: fauna.keeperName(camp), causes: parts.join(', ') }),
      place: null,
      actors: [],
      causes: [],
      details: { camp, species: species.id },
    });
  }
  fauna.domesticDeaths.clear();
}
