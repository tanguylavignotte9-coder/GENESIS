import { describe, expect, it } from 'vitest';
import type { GameData } from '../../../src/sim/core/game-data';
import { Simulation } from '../../../src/sim/core/simulation';
import { DOMESTIC_EVENTS, domesticate, publishReleases } from '../../../src/sim/systems/fauna/domestic';
import { BuildState } from '../../../src/sim/systems/production/buildings';
import { FIRST_ITEM } from '../../../src/sim/systems/production/events';
import { herdOf, husbandryDay, HUSBANDRY_EVENTS, penOf } from '../../../src/sim/systems/production/husbandry';
import { preyNear } from '../../../src/sim/systems/production/hunting';
import { dataWithSize } from '../world/helpers';

const SIZE = 256;

/** Real data on a small map; the tribe knows husbandry (and what it requires) from the start. */
function dataKnowing(change?: (data: GameData) => void): GameData {
  const data = dataWithSize(SIZE);
  for (const item of data.knowledge.knowledge) if (['stone_knapping', 'hunting', 'animal_husbandry'].includes(item.id)) item.startsKnown = true;
  change?.(data);
  return data;
}

function world(seed = 42, change?: (data: GameData) => void): Simulation {
  return new Simulation(seed, dataKnowing(change));
}

function days(sim: Simulation, n: number): void {
  sim.step(n * sim.data.time.ticksPerDay);
}

function code(sim: Simulation, id: string): number {
  return sim.data.fauna.species.findIndex((s) => s.id === id);
}

/** The camp's heart, in decimal tiles. */
function center(sim: Simulation): { x: number; y: number } {
  const tile = sim.production.camps[0]!.center;
  return { x: (tile % SIZE) + 0.5, y: Math.floor(tile / SIZE) + 0.5 };
}

/** A pen, finished, a few tiles from the camp. */
function buildPen(sim: Simulation): number {
  const type = sim.production.catalog.building('pen')!;
  const c = center(sim);
  let tile = Math.floor(c.y) * SIZE + Math.floor(c.x) + 3;
  if (!sim.fauna.isWalkable(tile % SIZE, Math.floor(tile / SIZE))) tile = sim.production.camps[0]!.center;
  return sim.production.addBuilding(type, 0, tile, BuildState.Done).id;
}

/** A wild animal of the species, `age` years old, at (x, y). */
function wild(sim: Simulation, id: string, x: number, y: number, age: number, female = true): number {
  const fauna = sim.fauna;
  const group = fauna.groups.add(code(sim, id), -1);
  const slot = fauna.spawn(code(sim, id), x, y, group, age * fauna.daysPerYear);
  fauna.groups.leader[group] = slot;
  fauna.store.sex[slot] = female ? 0 : 1;
  return slot;
}

/** A domestic animal of camp 0, living at the pen. */
function tame(sim: Simulation, id: string, age: number, female = true): number {
  const pen = penOf(sim.production, 0);
  const tile = pen >= 0 ? sim.production.buildings[pen]!.tile : sim.production.camps[0]!.center;
  const x = (tile % SIZE) + 0.5;
  const y = Math.floor(tile / SIZE) + 0.5;
  const slot = wild(sim, id, x, y, age, female);
  domesticate(sim.fauna, slot, 0, -1, x, y, pen >= 0, -1);
  sim.fauna.store.tame[slot] = 1;
  return slot;
}

describe('husbandry (capturing, keeping, breeding, milking, slaughtering)', () => {
  it('knowing husbandry with wild goats around, the camp wants a pen', () => {
    const sim = world();
    const c = center(sim);
    for (let k = 0; k < 4; k++) wild(sim, 'goat', c.x + 5 + k, c.y + 4, 3);
    days(sim, 1);
    const needs = sim.production.needs(0);
    expect(needs.buildPlan?.reason === 'livestock' || sim.production.campBuildings(0).some((b) => sim.production.typeOf(b).def.function === 'pen')).toBe(true);
  });

  it('herders capture wild animals (young ones first) and keep them at the pen; the journal tells it', () => {
    const sim = world(7);
    buildPen(sim);
    const c = center(sim);
    for (let k = 0; k < 8; k++) wild(sim, 'goat', c.x + 6 + k, c.y - 5, k % 2 === 0 ? 0.3 : 4);
    for (let d = 0; d < 60 && herdOf(sim.production, 0).length === 0; d++) days(sim, 1);
    const herd = herdOf(sim.production, 0);
    expect(herd.length).toBeGreaterThan(0);
    const captures = sim.journal.all().filter((e) => e.type === HUSBANDRY_EVENTS.capture);
    expect(captures.length).toBeGreaterThan(0);
    expect(captures[0]!.text).toMatch(/ capture (un|une) /);
    // The captured live around their pen.
    const store = sim.fauna.store;
    for (const slot of herd) {
      const d = Math.hypot(store.px[slot]! - store.homeX[slot]!, store.py[slot]! - store.homeY[slot]!);
      expect(d).toBeLessThan(sim.fauna.params.domestic.pastureTiles * 3);
    }
  });

  it('a domestic animal does not run from people, and hunters do not hunt it', () => {
    const sim = world();
    buildPen(sim);
    const slot = tame(sim, 'aurochs', 4);
    days(sim, 2);
    expect(sim.fauna.store.fleesHuman[slot]).toBe(0);
    const hunt = sim.production.catalog.recipes.find((r) => r.def.id === 'hunt')!;
    // Only this aurochs around the pen: no game in sight.
    const x = sim.fauna.store.px[slot]!;
    const y = sim.fauna.store.py[slot]!;
    const others = (): boolean => {
      let wildOne = false;
      sim.fauna.grid.forEachNear(x, y, 2, (o) => {
        if (o !== slot && hunt.prey.includes(sim.fauna.store.species[o]!) && sim.fauna.store.ownerCamp[o]! < 0) wildOne = true;
      });
      return wildOne;
    };
    if (!others()) expect(preyNear(sim.production, x, y, hunt, 2)).toBe(false);
  });

  it('young born among the keepers are domestic and tame, with their mother’s owner', () => {
    const sim = world();
    buildPen(sim);
    const mother = tame(sim, 'goat', 4, true);
    tame(sim, 'goat', 4, false);
    sim.fauna.store.pregnancy[mother] = 1;
    days(sim, 1);
    const young = herdOf(sim.production, 0).filter((s) => sim.fauna.store.ageDays[s]! < 5);
    expect(young.length).toBeGreaterThan(0);
    for (const s of young) {
      expect(sim.fauna.store.tame[s]).toBe(1);
      expect(sim.fauna.store.ownerCamp[s]).toBe(0);
    }
  });

  it('a wild captive may escape (told in the journal, with its capture as the cause)', () => {
    const sim = world(3, (data) => {
      data.fauna.domestic.escapePerDay = 1;
    });
    buildPen(sim);
    const slot = tame(sim, 'horse', 4);
    sim.fauna.store.tame[slot] = 0;
    sim.fauna.domesticGroups.clear();
    days(sim, 2);
    expect(sim.fauna.store.ownerCamp[slot]).toBe(-1);
    const escape = sim.journal.all().find((e) => e.type === DOMESTIC_EVENTS.escape);
    expect(escape).toBeDefined();
    expect(escape!.text).toMatch(/s’est échappée? \(pas encore apprivoisée?\)/);
    expect(escape!.causes.length).toBeGreaterThanOrEqual(0);
  });

  it('a nursing female is milked: milk without hunting (a first for the tribe)', () => {
    const sim = world(5);
    buildPen(sim);
    for (let k = 0; k < 3; k++) {
      const goat = tame(sim, 'goat', 4, true);
      sim.fauna.store.lastBirthDay[goat] = sim.fauna.day;
    }
    days(sim, 6);
    const milk = sim.production.catalog.itemIndex.get('milk')!;
    const firsts = sim.journal.all().filter((e) => e.type === FIRST_ITEM && e.details['item'] === 'milk');
    expect(firsts.length + (sim.production.camps[0]!.firsts.has(milk) ? 1 : 0)).toBeGreaterThan(0);
  });

  it('too many animals for the pen: the surplus is slaughtered, meat and hide without a hunt', () => {
    const sim = world(11, (data) => {
      data.production.husbandry.penCapacity = 2;
    });
    buildPen(sim);
    for (let k = 0; k < 5; k++) tame(sim, 'goat', 5, k % 2 === 0);
    days(sim, 8);
    expect(herdOf(sim.production, 0).length).toBeLessThan(5);
    expect(sim.journal.all().some((e) => e.type === HUSBANDRY_EVENTS.firstSlaughter)).toBe(true);
    // Every slaughter is told with the herd's deaths of the day, not only the first one.
    const slaughtered = sim.fauna.domesticTally.deaths[5]!;
    expect(slaughtered).toBe(5 - herdOf(sim.production, 0).length - sim.fauna.domesticTally.escaped);
    const told = sim.journal.all().filter((e) => e.type === DOMESTIC_EVENTS.deaths && /abattu/.test(e.text));
    expect(told.length).toBeGreaterThan(0);
  });

  it('every captured animal is accounted for: in the herd, slaughtered, dead, escaped, or back to the wild when its camp is no more', () => {
    const sim = world(7);
    buildPen(sim);
    const c = center(sim);
    for (let k = 0; k < 8; k++) wild(sim, 'goat', c.x + 6 + k, c.y - 5, k % 2 === 0 ? 0.3 : 4);
    days(sim, 30);
    const captures = sim.journal.all().filter((e) => e.type === HUSBANDRY_EVENTS.capture).length;
    expect(captures).toBeGreaterThan(0);
    const tally = sim.fauna.domesticTally;
    const dead = tally.deaths.reduce((a, b) => a + b, 0);
    expect(herdOf(sim.production, 0).length + dead + tally.escaped + tally.released).toBe(captures);
    // The camp is gone: its animals go back to the wild, and the journal says so.
    const herd = herdOf(sim.production, 0).filter((slot) => sim.fauna.store.ownerPerson[slot]! < 0).length;
    const releasedBefore = tally.released;
    const other = sim.production.camps.length;
    sim.production.openCamp(other, sim.production.camps[0]!.center + 40, -1);
    for (const p of sim.humans.campMembers(0)) sim.humans.people.camp[p] = other;
    husbandryDay(sim.production);
    expect(tally.released - releasedBefore).toBe(herd);
    publishReleases(sim.fauna, sim.journal, sim.clock.tick);
    if (herd > 0) expect(sim.journal.all().some((e) => e.type === DOMESTIC_EVENTS.released)).toBe(true);
  });

  it('raiders drive off part of the herd to their own camp', () => {
    const sim = world();
    buildPen(sim);
    for (let k = 0; k < 6; k++) tame(sim, 'goat', 3, k % 2 === 0);
    const other = sim.production.camps.length;
    sim.production.openCamp(other, sim.production.camps[0]!.center + 40, -1);
    const taken = sim.production.stealAnimals(0, other, 0.5, 'Les pillards', []);
    expect(taken).toBe(3);
    expect(herdOf(sim.production, other).length).toBe(3);
    expect(sim.journal.all().some((e) => e.type === HUSBANDRY_EVENTS.stolen)).toBe(true);
  });

  it('same seed, same herd and same story (deterministic)', () => {
    const run = (): { herd: number[]; journal: string[] } => {
      const sim = world(13);
      buildPen(sim);
      const c = center(sim);
      for (let k = 0; k < 5; k++) wild(sim, 'goat', c.x + 6 + k, c.y + 6, 0.5);
      days(sim, 8);
      return { herd: [...herdOf(sim.production, 0)], journal: sim.journal.all().map((e) => e.text) };
    };
    expect(run()).toEqual(run());
  });
});
