import type { Journal } from '../../core/journal';
import { localDayOfYear } from '../flora/fitness';
import { Sex } from './animal-store';
import type { FaunaSystem } from './fauna-system';
import { publishMigrations, type MigrationStart } from './fauna-events';
import { holdTerritories } from './territory';

/** Local days of the year when migratory herds leave: toward the equator in autumn, back in spring. */
const SEASONS_BEFORE_AUTUMN = 2;

/**
 * Daily herd upkeep: sizes and adult males, new leaders, splitting herds that grew too big,
 * lone animals joining a herd of their species, seasonal migrations.
 */
export function maintainGroups(fauna: FaunaSystem, dayOfYear: number, journal: Journal, tick: number): void {
  const { store, groups } = fauna;
  groups.size.fill(0, 0, groups.count);
  groups.adultMales.fill(0, 0, groups.count);
  const leaderAlive = new Uint8Array(groups.count);
  const daughterOf = new Int32Array(groups.count).fill(-1);
  for (let slot = 0; slot < store.slots; slot++) {
    if (store.alive[slot] === 0) continue;
    const group = store.group[slot]!;
    if (groups.leader[group] === slot) leaderAlive[group] = 1;
  }
  for (let slot = 0; slot < store.slots; slot++) {
    if (store.alive[slot] === 0) continue;
    let group = store.group[slot]!;
    if (leaderAlive[group] === 0) {
      groups.leader[group] = slot;
      leaderAlive[group] = 1;
    }
    const species = fauna.speciesOf(slot);
    if (groups.size[group]! >= species.maxGroupSize) group = splitOff(fauna, slot, group, daughterOf);
    groups.size[group] = groups.size[group]! + 1;
    if (store.sex[slot] === Sex.Male && store.ageDays[slot]! >= species.adultAgeYears * fauna.daysPerYear) {
      groups.adultMales[group] = groups.adultMales[group]! + 1;
    }
  }
  disperse(fauna);
  joinLoners(fauna);
  holdTerritories(fauna);
  publishMigrations(fauna, updateMigrations(fauna, dayOfYear), journal, tick);
}

/** A herd that is too big: the animal leaves and joins (or founds) today's daughter herd. */
function splitOff(fauna: FaunaSystem, slot: number, group: number, daughterOf: Int32Array): number {
  const { store, groups } = fauna;
  let daughter = group < daughterOf.length ? daughterOf[group]! : -1;
  if (daughter < 0) {
    daughter = groups.add(groups.species[group]!, slot);
    if (group < daughterOf.length) daughterOf[group] = daughter;
  }
  store.group[slot] = daughter;
  return daughter;
}

/** Lone animals of social species look for a herd of their species nearby. */
function joinLoners(fauna: FaunaSystem): void {
  const { store, groups, params } = fauna;
  for (let slot = 0; slot < store.slots; slot++) {
    if (store.alive[slot] === 0) continue;
    const group = store.group[slot]!;
    const species = fauna.speciesOf(slot);
    if (groups.size[group] !== 1 || species.groupSize[1] <= 1 || store.ownerCamp[slot]! >= 0) continue;
    // A lone disperser of a territorial species pairs with another loner, never with a pack.
    const territorial = species.territoryTiles > 0;
    let target = -1;
    fauna.grid.forEachNear(store.x[slot]!, store.y[slot]!, params.behavior.lonerJoinRadius, (other) => {
      if (target >= 0 || other === slot || store.species[other] !== store.species[slot] || store.ownerCamp[other]! >= 0) return;
      const otherGroup = store.group[other]!;
      if (otherGroup !== group && groups.size[otherGroup]! < species.maxGroupSize && (!territorial || groups.size[otherGroup] === 1)) target = otherGroup;
    });
    if (target < 0) continue;
    groups.size[group] = 0;
    store.group[slot] = target;
    groups.size[target] = groups.size[target]! + 1;
    if (store.sex[slot] === Sex.Male && store.ageDays[slot]! >= species.adultAgeYears * fauna.daysPerYear) {
      groups.adultMales[target] = groups.adultMales[target]! + 1;
    }
  }
}

/** Starts and ends seasonal migrations; returns the herds that left today. */
function updateMigrations(fauna: FaunaSystem, dayOfYear: number): MigrationStart[] {
  const { store, groups, params } = fauna;
  const autumn = SEASONS_BEFORE_AUTUMN * (fauna.daysPerYear / 4);
  const starts: MigrationStart[] = [];
  for (let group = 0; group < groups.count; group++) {
    const leader = groups.leader[group]!;
    if (groups.size[group]! <= 0 || leader < 0 || store.alive[leader] === 0) continue;
    const species = params.species[groups.species[group]!]!;
    if (!species.migratory) continue;
    const x = store.x[leader]!;
    const y = store.y[leader]!;
    if (groups.migrating[group] === 1) {
      groups.migrationDaysLeft[group] = groups.migrationDaysLeft[group]! - 1;
      const arrived = Math.abs(groups.migrateX[group]! - x) + Math.abs(groups.migrateY[group]! - y) <= 2;
      if (arrived || groups.migrationDaysLeft[group]! <= 0) groups.migrating[group] = 0;
      continue;
    }
    const northern = y < fauna.size / 2;
    const day = localDayOfYear(dayOfYear, northern, fauna.daysPerYear);
    // Autumn: toward the equator (south in the north). Spring: back toward the pole, if it had left.
    const towardEquator = day === autumn;
    if (!(towardEquator && groups.away[group] === 0) && !(day === 0 && groups.away[group] === 1)) continue;
    groups.away[group] = towardEquator ? 1 : 0;
    const step = (northern === towardEquator ? 1 : -1) * species.migrationTiles;
    groups.migrating[group] = 1;
    groups.migrateX[group] = x;
    groups.migrateY[group] = Math.max(0, Math.min(fauna.size - 1, y + step));
    groups.migrationDaysLeft[group] = params.behavior.migrationMaxDays;
    starts.push({ group, species: groups.species[group]!, x, y, animals: groups.size[group]!, south: step > 0 });
  }
  return starts;
}

/**
 * Territorial species: a young adult of a pack (not its eldest of its sex) may leave to look for a
 * mate and free land; alone, it settles away from the packs (their territories push it off).
 */
function disperse(fauna: FaunaSystem): void {
  const { store, groups } = fauna;
  for (let slot = 0; slot < store.slots; slot++) {
    if (store.alive[slot] === 0 || store.ownerCamp[slot]! >= 0) continue;
    const species = fauna.speciesOf(slot);
    if (species.dispersalPerYear <= 0) continue;
    const group = store.group[slot]!;
    const adultDays = species.adultAgeYears * fauna.daysPerYear;
    const age = store.ageDays[slot]!;
    if (groups.size[group]! < 3 || age < adultDays || age > adultDays + fauna.daysPerYear || groups.leader[group] === slot) continue;
    if (fauna.rng.nextFloat() >= species.dispersalPerYear / fauna.daysPerYear) continue;
    groups.size[group] = groups.size[group]! - 1;
    const own = groups.add(store.species[slot]!, slot);
    store.group[slot] = own;
    groups.size[own] = 1;
  }
}
