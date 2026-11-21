import { distance, DIRECTION_COUNT, DIRECTIONS_X, DIRECTIONS_Y } from '../../core/motion';
import type { FaunaSystem } from './fauna-system';

/** A yielding pack settles its new den this many territory radii away from the stronger one. */
const YIELD_DISTANCE = 1.25;

/**
 * Daily, for the territorial species (wolves): each pack holds a den, where its leader stood when
 * the pack was founded. A pack whose den lies within the territory of a stronger pack (more
 * members; with as many, the older one) yields: it is chased off and goes to settle further away,
 * and it raises no young that season. This spreads the packs over the land and limits their
 * number to the room there is, without any count of the population.
 */
export function holdTerritories(fauna: FaunaSystem): void {
  const { groups, store } = fauna;
  const packs: number[] = [];
  for (let group = 0; group < groups.count; group++) {
    groups.contested[group] = 0;
    if (groups.size[group] === 0) continue;
    const species = fauna.params.species[groups.species[group]!]!;
    if (species.territoryTiles <= 0) continue;
    const leader = groups.leader[group]!;
    if (groups.denX[group]! < 0 && leader >= 0 && store.alive[leader] === 1) {
      groups.denX[group] = store.x[leader]!;
      groups.denY[group] = store.y[leader]!;
    }
    if (groups.denX[group]! >= 0) {
      followTheGame(fauna, group);
      packs.push(group);
    }
  }
  for (let i = 0; i < packs.length; i++) {
    for (let j = i + 1; j < packs.length; j++) {
      const a = packs[i]!;
      const b = packs[j]!;
      if (groups.species[a] !== groups.species[b]) continue;
      const radius = fauna.params.species[groups.species[a]!]!.territoryTiles;
      if (distance(groups.denX[a]!, groups.denY[a]!, groups.denX[b]!, groups.denY[b]!) >= radius) continue;
      // The older pack wins a tie (lower id).
      const weaker = groups.size[b]! <= groups.size[a]! ? b : a;
      const stronger = weaker === a ? b : a;
      if (groups.contested[weaker] === 1) continue;
      groups.contested[weaker] = 1;
      yieldDen(fauna, weaker, stronger, radius);
    }
  }
}

/**
 * A hungry pack whose territory has been emptied of game does not starve by its den: when its
 * leader, roaming in search of prey, stands among enough game (as much as it takes to raise young)
 * far from a den around which there is too little, the pack settles its den there.
 */
function followTheGame(fauna: FaunaSystem, group: number): void {
  const { groups, store, params } = fauna;
  const leader = groups.leader[group]!;
  if (leader < 0 || store.alive[leader] !== 1 || store.hunger[leader]! <= params.needs.seekFoodAbove) return;
  const species = fauna.params.species[groups.species[group]!]!;
  const need = species.breedingMinPrey;
  if (need <= 0) return;
  const x = store.x[leader]!;
  const y = store.y[leader]!;
  if (distance(x, y, groups.denX[group]!, groups.denY[group]!) <= species.territoryTiles) return;
  const code = groups.species[group]!;
  if (fauna.preyWithin(code, x, y, species.preyCheckRadius, need) < need) return;
  if (fauna.preyWithin(code, groups.denX[group]!, groups.denY[group]!, species.preyCheckRadius, need) >= need) return;
  groups.denX[group] = x;
  groups.denY[group] = y;
}

/** The weaker pack picks a new den beyond the stronger pack's territory, on walkable land. */
function yieldDen(fauna: FaunaSystem, weaker: number, stronger: number, radius: number): void {
  const { groups } = fauna;
  const sx = groups.denX[stronger]!;
  const sy = groups.denY[stronger]!;
  const dx = groups.denX[weaker]! - sx;
  const dy = groups.denY[weaker]! - sy;
  const length = Math.sqrt(dx * dx + dy * dy);
  // Away from the stronger den (any direction when both dens coincide), then turning until land is found.
  let first = 0;
  if (length > 0) {
    let best = -Infinity;
    for (let k = 0; k < DIRECTION_COUNT; k++) {
      const dot = (DIRECTIONS_X[k]! * dx + DIRECTIONS_Y[k]! * dy) / length;
      if (dot > best) {
        best = dot;
        first = k;
      }
    }
  } else first = fauna.rng.nextIntInclusive(0, DIRECTION_COUNT - 1);
  const reach = radius * YIELD_DISTANCE;
  for (let turn = 0; turn < DIRECTION_COUNT; turn++) {
    const k = (first + (turn % 2 === 0 ? turn / 2 : DIRECTION_COUNT - (turn + 1) / 2)) % DIRECTION_COUNT;
    const x = Math.round(sx + DIRECTIONS_X[k]! * reach);
    const y = Math.round(sy + DIRECTIONS_Y[k]! * reach);
    if (!fauna.isWalkable(x, y)) continue;
    groups.denX[weaker] = x;
    groups.denY[weaker] = y;
    return;
  }
}

/**
 * May this female raise young (territorial species)? Only the pack's dominant female (its eldest
 * adult female) breeds, and only on the land her pack holds.
 */
export function holdsTerritory(fauna: FaunaSystem, slot: number): boolean {
  const { groups, store } = fauna;
  const group = store.group[slot]!;
  if (groups.contested[group] === 1 || groups.denX[group]! < 0 || !isDominantFemale(fauna, slot)) return false;
  const radius = fauna.speciesOf(slot).territoryTiles;
  return distance(store.x[slot]!, store.y[slot]!, groups.denX[group]!, groups.denY[group]!) <= radius;
}

/** No adult female of her pack is older than her (pack mates are near: a short look around). */
function isDominantFemale(fauna: FaunaSystem, slot: number): boolean {
  const { store } = fauna;
  const group = store.group[slot]!;
  const age = store.ageDays[slot]!;
  const adultDays = fauna.speciesOf(slot).adultAgeYears * fauna.daysPerYear;
  let dominant = true;
  fauna.grid.forEachNear(store.px[slot]!, store.py[slot]!, fauna.params.behavior.mateRadius, (other) => {
    if (!dominant || other === slot || store.group[other] !== group || store.sex[other] !== store.sex[slot]) return;
    const otherAge = store.ageDays[other]!;
    if (otherAge >= adultDays && (otherAge > age || (otherAge === age && other < slot))) dominant = false;
  });
  return dominant;
}

/** A pack leader far from its den heads back to its territory (null: it is home). */
export function denTarget(fauna: FaunaSystem, slot: number, out: { x: number; y: number }): boolean {
  const { groups, store } = fauna;
  const group = store.group[slot]!;
  const radius = fauna.speciesOf(slot).territoryTiles;
  if (radius <= 0 || groups.leader[group] !== slot || groups.denX[group]! < 0) return false;
  const x = groups.denX[group]! + 0.5;
  const y = groups.denY[group]! + 0.5;
  if (distance(store.px[slot]!, store.py[slot]!, x, y) <= radius * HOME_SHARE) return false;
  out.x = x;
  out.y = y;
  return true;
}

/** Beyond this share of its territory radius, a leader with nothing else to do goes back toward its den. */
const HOME_SHARE = 0.6;
