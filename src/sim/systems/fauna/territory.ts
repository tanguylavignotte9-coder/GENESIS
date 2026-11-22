import { distance, DIRECTION_COUNT, DIRECTIONS_X, DIRECTIONS_Y } from '../../core/motion';
import { DeathCause, type FaunaSystem } from './fauna-system';
import type { AnimalSpecies } from './params';

/** A yielding group settles its new den this many territory radii away from the stronger one. */
const YIELD_DISTANCE = 1.25;
/** Beyond this share of its territory radius, a leader with nothing else to do goes back toward its den. */
const HOME_SHARE = 0.6;

/**
 * Territories of the social hunters (wolves, lions), daily (v1.4). Each group holds a den and a
 * radius around it. The radius follows the game the group perceives on its land: it grows until
 * the prey there weigh `preyKgPerPredatorKg` times the group (in nature, about 100 kg of prey for
 * 1 kg of carnivore), within the species' bounds, and shrinks when game abounds. Two groups whose
 * dens are too close dispute the place: the weaker (fewer; with as many, the younger) moves away
 * and raises no young that season. A lone animal or a small group caught on a stronger group's
 * land, within reach of its members, may be killed. The number of groups the land holds thus
 * follows the game, without any count of the population.
 */
export function holdTerritories(fauna: FaunaSystem): void {
  const { groups, store } = fauna;
  const groupsHeld: number[] = [];
  for (let group = 0; group < groups.count; group++) {
    groups.contested[group] = 0;
    if (groups.size[group] === 0) continue;
    const species = fauna.params.species[groups.species[group]!]!;
    if (species.territoryMaxTiles <= 0) continue;
    const leader = groups.leader[group]!;
    if (leader < 0 || store.alive[leader] !== 1 || store.ownerCamp[leader]! >= 0) continue;
    // A lone disperser holds no land: it looks for some.
    if (groups.size[group]! < 2) {
      groups.denX[group] = -1;
      continue;
    }
    if (groups.denX[group]! < 0) {
      groups.denX[group] = store.x[leader]!;
      groups.denY[group] = store.y[leader]!;
      groups.range[group] = species.territoryMinTiles;
    }
    sizeTerritory(fauna, group, species);
    if (groups.denX[group]! >= 0) groupsHeld.push(group);
  }
  for (let i = 0; i < groupsHeld.length; i++) {
    for (let j = i + 1; j < groupsHeld.length; j++) {
      const a = groupsHeld[i]!;
      const b = groupsHeld[j]!;
      if (groups.species[a] !== groups.species[b]) continue;
      const radius = Math.max(groups.range[a]!, groups.range[b]!);
      if (distance(groups.denX[a]!, groups.denY[a]!, groups.denX[b]!, groups.denY[b]!) >= radius * fauna.params.territory.overlapShare) continue;
      // The older group wins a tie (lower id).
      const weaker = groups.size[b]! <= groups.size[a]! ? b : a;
      const stronger = weaker === a ? b : a;
      if (groups.contested[weaker] === 1) continue;
      groups.contested[weaker] = 1;
      yieldDen(fauna, weaker, stronger, radius);
    }
  }
  punishIntruders(fauna);
}

/** Group mass (kg) of the members of a group, from a look around its leader. */
function groupMass(fauna: FaunaSystem, group: number, species: AnimalSpecies): number {
  return fauna.groups.size[group]! * species.massKg;
}

/** The radius moves toward the one where the group would find its due of game. */
function sizeTerritory(fauna: FaunaSystem, group: number, species: AnimalSpecies): void {
  const { groups, params } = fauna;
  const range = Math.max(1, groups.range[group]!);
  const code = groups.species[group]!;
  const need = groupMass(fauna, group, species) * params.territory.preyKgPerPredatorKg;
  const seen = fauna.preyMassWithin(code, groups.denX[group]!, groups.denY[group]!, range);
  // Game spread evenly: the mass grows as the area, so the right radius is range × √(need / seen).
  const wanted = seen > 0 ? range * Math.sqrt(need / seen) : species.territoryMaxTiles;
  const target = Math.max(species.territoryMinTiles, Math.min(species.territoryMaxTiles, wanted));
  groups.range[group] = range + (target - range) * params.territory.adjustShare;
  // Even at its widest the land holds too little: the group leaves it and roams to settle elsewhere.
  if (range >= species.territoryMaxTiles * 0.95 && seen < need * params.territory.abandonShare) groups.denX[group] = -1;
}

/** The weaker group picks a new den beyond the stronger group's territory, on walkable land. */
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
 * Intruders: an animal of a territorial species standing on the land of a stronger group of its
 * kind, with one of that group's adults within reach, may be killed by them (a disperser looking
 * for land, a small group driven off).
 */
function punishIntruders(fauna: FaunaSystem): void {
  const { store, groups, params } = fauna;
  const rules = params.territory;
  for (let slot = 0; slot < store.slots; slot++) {
    if (store.alive[slot] !== 1 || store.ownerCamp[slot]! >= 0 || fauna.isHunter[store.species[slot]!] !== 1) continue;
    const species = fauna.speciesOf(slot);
    if (species.territoryMaxTiles <= 0) continue;
    const own = store.group[slot]!;
    let resident = -1;
    fauna.hunterGrid.forEachNear(store.px[slot]!, store.py[slot]!, rules.fightTiles, (other) => {
      if (resident >= 0 || store.species[other] !== store.species[slot]) return;
      const group = store.group[other]!;
      if (group === own || groups.denX[group]! < 0 || groups.size[group]! <= groups.size[own]!) return;
      if (store.ageDays[other]! < species.adultAgeYears * fauna.daysPerYear) return;
      if (distance(store.px[slot]!, store.py[slot]!, store.px[other]!, store.py[other]!) > rules.fightTiles) return;
      // Only on that group's land.
      if (distance(store.x[slot]!, store.y[slot]!, groups.denX[group]!, groups.denY[group]!) > groups.range[group]!) return;
      resident = other;
    });
    if (resident >= 0 && fauna.rng.nextFloat() < rules.intruderRiskPerDay) fauna.kill(slot, DeathCause.Injury);
  }
}

/**
 * May this female raise young (territorial species)? Only on the land her group holds, unchallenged;
 * and, for the species where only the dominant breeds, if she is her group's eldest adult female.
 */
export function holdsTerritory(fauna: FaunaSystem, slot: number): boolean {
  const { groups, store } = fauna;
  const group = store.group[slot]!;
  if (groups.contested[group] === 1 || groups.denX[group]! < 0) return false;
  if (fauna.speciesOf(slot).dominantBreederOnly && !isDominantFemale(fauna, slot)) return false;
  return distance(store.x[slot]!, store.y[slot]!, groups.denX[group]!, groups.denY[group]!) <= groups.range[group]!;
}

/** No adult female of her group is older than her (group mates are near: a short look around). */
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

/** A group leader far from its den, with nothing else to do, heads back to its territory. */
export function denTarget(fauna: FaunaSystem, slot: number, out: { x: number; y: number }): boolean {
  const { groups, store } = fauna;
  const group = store.group[slot]!;
  if (groups.leader[group] !== slot || groups.denX[group]! < 0) return false;
  const x = groups.denX[group]! + 0.5;
  const y = groups.denY[group]! + 0.5;
  if (distance(store.px[slot]!, store.py[slot]!, x, y) <= groups.range[group]! * HOME_SHARE) return false;
  out.x = x;
  out.y = y;
  return true;
}

/**
 * Where a hungry hunter with no prey in sight goes looking: a group with a den, somewhere on its own
 * land; a lone animal without land, far in any direction (it looks for game and a free place).
 */
export function territorySearchSpot(fauna: FaunaSystem, slot: number, species: AnimalSpecies, out: { x: number; y: number }): boolean {
  const { groups, store, rng, params } = fauna;
  const group = store.group[slot]!;
  const k = rng.nextIntInclusive(0, DIRECTION_COUNT - 1);
  if (species.territoryMaxTiles > 0 && groups.denX[group]! >= 0) {
    const r = groups.range[group]! * (0.3 + 0.7 * rng.nextFloat());
    out.x = groups.denX[group]! + 0.5 + DIRECTIONS_X[k]! * r;
    out.y = groups.denY[group]! + 0.5 + DIRECTIONS_Y[k]! * r;
    return true;
  }
  const r = params.behavior.huntSearchTiles;
  if (r <= 0) return false;
  out.x = store.px[slot]! + DIRECTIONS_X[k]! * r;
  out.y = store.py[slot]! + DIRECTIONS_Y[k]! * r;
  return true;
}
