import { describe, expect, it } from 'vitest';
import { defaultRawData, parseGameData, type GameData } from '../../../src/sim/core/game-data';
import { Simulation } from '../../../src/sim/core/simulation';
import { BuildState } from '../../../src/sim/systems/production/buildings';
import { BUILDING_DONE, FIRST_ITEM, SITE_STARTED } from '../../../src/sim/systems/production/events';
import { campOwner, Inventory } from '../../../src/sim/systems/production/inventory';
import { qualityFor } from '../../../src/sim/systems/production/jobs';
import { spoil, spoilFactor } from '../../../src/sim/systems/production/spoilage';
import { CAMP_MOVED } from '../../../src/sim/systems/individuals/camp-move';
import { dataWithSize } from '../world/helpers';

const SIZE = 320;
const hourTicks = (data: GameData): number => data.time.ticksPerDay / 24;

/** Real data on a small map, with some knowledge known from the start. */
function dataKnowing(...known: string[]): GameData {
  const data = dataWithSize(SIZE);
  for (const item of data.knowledge.knowledge) if (known.includes(item.id)) item.startsKnown = true;
  return data;
}

describe('production data (eras 0 and 1)', () => {
  const data = dataWithSize(SIZE);

  it('lists every knowledge, recipe and building of the design document', () => {
    expect(data.knowledge.knowledge).toHaveLength(23);
    const recipes = data.recipes.recipes.map((recipe) => recipe.id);
    for (const id of ['gather', 'collect_branches', 'collect_stones', 'light_fire', 'knap_knife', 'make_spear', 'hunt', 'butcher', 'cook', 'smoke_meat', 'tan', 'sew_clothing', 'weave_basket', 'fish', 'make_bow', 'dig_canoe', 'polish_axe', 'fell_tree', 'sow', 'harvest_field', 'grind', 'bake_bread', 'brew', 'make_jar', 'milk_shear', 'weave_cloth', 'mold_bricks', 'cut_block']) {
      expect(recipes).toContain(id);
    }
    expect(data.buildings.buildings.map((building) => building.id)).toEqual([
      'campfire', 'lean_to', 'hut', 'hide_tent', 'storage_cache', 'smokehouse', 'field', 'pen', 'granary', 'earth_house', 'kiln', 'bread_oven', 'loom_workshop', 'irrigation_canal', 'palisade', 'stone_wall', 'megalithic_tomb', 'sanctuary',
    ]);
  });

  it('the starting knowledge is a workshop variable (gathering, fire and huts by default)', () => {
    expect(data.knowledge.knowledge.filter((item) => item.startsKnown).map((item) => item.id)).toEqual(['gathering', 'fire', 'huts']);
  });

  it('refuses a recipe naming an object that does not exist, with a clear French message', () => {
    const raw = defaultRawData();
    const recipes = raw.recipes as { recipes: { outputs: { item: string }[] }[] };
    recipes.recipes[0]!.outputs[0]!.item = 'licorne';
    expect(() => parseGameData(raw)).toThrow(/l'objet « licorne » n'existe pas/);
  });
});

describe('objects in piles', () => {
  it('merge by item and owner, keep a mean quality, give the best quality first', () => {
    const inventory = new Inventory();
    inventory.put(0, 2, 0.2, campOwner(0));
    inventory.put(0, 2, 0.6, campOwner(0));
    inventory.put(0, 1, 0.9, 5);
    expect(inventory.piles).toHaveLength(2);
    expect(inventory.count(0)).toBe(5);
    expect(inventory.take(0, 1).quality).toBeCloseTo(0.9);
    expect(inventory.piles[0]!.quality).toBeCloseTo(0.4);
  });

  it('food spoils by kind and temperature: berries fast, roots slowly, slower in the cold', () => {
    const data = dataWithSize(SIZE);
    const ids = data.items.items.map((item) => item.id);
    const halfLife = Float64Array.from(data.items.items, (item) => item.halfLifeDays);
    const berries = ids.indexOf('berries');
    const roots = ids.indexOf('roots');
    const pile = (): Inventory => {
      const inventory = new Inventory();
      inventory.put(berries, 10, 0.5, 0);
      inventory.put(roots, 10, 0.5, 0);
      return inventory;
    };
    const warm = pile();
    const cold = pile();
    spoil(warm, 3, spoilFactor(25, data.production.spoilage), halfLife, 0.05);
    spoil(cold, 3, spoilFactor(0, data.production.spoilage), halfLife, 0.05);
    expect(warm.count(berries)).toBeLessThan(warm.count(roots) / 2);
    expect(cold.count(berries)).toBeGreaterThan(warm.count(berries));
  });
});

describe('the camp', () => {
  it('starts with a campfire and 6 huts owned by the production system, families sleeping together', () => {
    const simulation = new Simulation(42, dataWithSize(SIZE));
    const { production } = simulation;
    const types = production.campBuildings(0).map((b) => production.typeOf(b).def.id);
    expect(types.filter((id) => id === 'hut')).toHaveLength(6);
    expect(types).toContain('campfire');
    const people = simulation.humans.people;
    const housed = Array.from({ length: people.count }, (_, p) => production.bedOf[p]!).filter((bed) => bed >= 0);
    expect(housed.length).toBeGreaterThanOrEqual(people.count - 6);
    for (let p = 0; p < people.count; p++) {
      const spouse = people.spouse[p]!;
      if (spouse >= 0 && production.bedOf[p]! >= 0 && production.bedOf[spouse]! >= 0) expect(production.bedOf[p]).toBe(production.bedOf[spouse]);
    }
  });

  it('people put their harvest in the common stock', () => {
    const data = dataWithSize(SIZE);
    const simulation = new Simulation(42, data);
    let deposited = false;
    for (let h = 0; h < 72 && !deposited; h++) {
      simulation.step(hourTicks(data));
      deposited = simulation.production.stockFood(0) > 0;
    }
    expect(deposited).toBe(true);
  });

  it('a hungry child with empty hands goes and eats from the common stock', () => {
    const data = dataWithSize(SIZE);
    const simulation = new Simulation(42, data);
    const { production, humans } = simulation;
    const people = humans.people;
    const child = Array.from({ length: people.count }, (_, p) => p).find((p) => people.ageYears[p]! < 10)!;
    production.storeInCamp(0, production.catalog.item('roots'), 30, 0.5);
    production.carried[child] = new Inventory();
    people.thirst[child] = 0;
    people.fatigue[child] = 0;
    people.hunger[child] = 90;
    humans.think(child);
    expect(humans.actions[people.action[child]!]!.def.behavior).toBe('eat');
    for (let k = 0; k < 40 && people.hunger[child]! > 30; k++) simulation.step(hourTicks(data) / 4);
    expect(people.hunger[child]).toBeLessThan(30);
    expect(production.stockOf(0).count(production.catalog.item('roots'))).toBeLessThan(30);
  });
});

describe('recipes', () => {
  it('cannot be used without their knowledge: nobody knaps a knife in a tribe that does not know how', () => {
    const data = dataWithSize(SIZE);
    const simulation = new Simulation(42, data);
    const flint = simulation.production.catalog.item('flint');
    simulation.production.storeInCamp(0, flint, 10, 0.5);
    simulation.step(3 * data.time.ticksPerDay);
    expect(simulation.production.catalog.recipes.length).toBeGreaterThan(0);
    const knife = simulation.production.catalog.item('stone_knife');
    expect(simulation.production.stockOf(0).count(knife)).toBe(0);
    expect(simulation.journal.all().some((event) => event.type === FIRST_ITEM)).toBe(false);
  });

  it('are really performed: with the knowledge, flint becomes knives, the first one is written in the journal', () => {
    const data = dataKnowing('stone_knapping');
    const simulation = new Simulation(42, data);
    const { production } = simulation;
    production.storeInCamp(0, production.catalog.item('flint'), 10, 0.5);
    simulation.step(2 * data.time.ticksPerDay);
    const knife = production.catalog.item('stone_knife');
    let knives = production.stockOf(0).count(knife);
    for (const inventory of production.carried) knives += inventory.count(knife);
    expect(knives).toBeGreaterThan(0);
    const first = simulation.journal.all().find((event) => event.type === FIRST_ITEM);
    expect(first?.text).toContain('couteau de pierre');
  });

  it('skill speeds work up, improves quality and grows with practice; the trade is the most practised activity', () => {
    const data = dataKnowing('stone_knapping');
    const simulation = new Simulation(42, data);
    const { production, humans } = simulation;
    const crafting = data.humans.skills.findIndex((skill) => skill.id === 'crafting');
    const recipe = production.catalog.recipe('knap_knife')!;
    const qualities = (level: number): number => {
      humans.people.skills[0 * humans.people.skillCount + crafting] = level;
      let sum = 0;
      for (let k = 0; k < 50; k++) sum += production.carried.length > 0 ? qualityFor(production, 0, recipe) : 0;
      return sum / 50;
    };
    expect(qualities(1)).toBeGreaterThan(qualities(0) + 0.3);
    humans.people.skills[crafting] = 0;
    humans.practise(0, crafting, 20);
    expect(humans.people.skill(0, crafting)).toBeGreaterThan(0.1);
    expect(humans.people.trade(0, data.humans.skillLearning.professionMinHours)).toBe(crafting);
  });
});


describe('construction', () => {
  it('a missing shelter becomes a visible site that several people build, then the journal tells it with its cause', () => {
    const data = dataWithSize(SIZE);
    data.production.startingBuildings = data.production.startingBuildings.filter((start) => start.building === 'campfire');
    const simulation = new Simulation(42, data);
    const { production } = simulation;
    let sawSite = false;
    for (let d = 0; d < 6 && !simulation.journal.all().some((event) => event.type === BUILDING_DONE && event.details['building'] === 'hut'); d++) {
      for (let h = 0; h < 24; h++) {
        simulation.step(hourTicks(data));
        if (production.buildings.some((b) => b.state === BuildState.Site && production.typeOf(b).def.id === 'hut')) sawSite = true;
      }
    }
    expect(sawSite).toBe(true);
    const done = simulation.journal.all().find((event) => event.type === BUILDING_DONE && event.details['building'] === 'hut');
    expect(done).toBeDefined();
    expect(done!.actors.length).toBeGreaterThan(1);
    const cause = simulation.journal.get(done!.causes[0]!);
    expect(cause?.type).toBe(SITE_STARTED);
    expect(cause?.text).toContain('dormir');
  });
});

describe('hunting', () => {
  it('a hunter with a spear kills game through the interaction mechanism and brings back a carcass', () => {
    const data = dataKnowing('stone_knapping', 'hunting');
    const simulation = new Simulation(42, data);
    const { production, fauna } = simulation;
    const spear = production.catalog.item('spear');
    production.storeInCamp(0, spear, 3, 0.6);
    const hunted = (): number => fauna.deaths.reduce((sum, causes) => sum + causes[5]!, 0);
    const carcass = production.catalog.item('carcass');
    let brought = 0;
    for (let d = 0; d < 6 && hunted() === 0; d++) simulation.step(data.time.ticksPerDay);
    for (const inventory of [...production.carried, production.stockOf(0)]) brought += inventory.count(carcass);
    // The carcass may already be butchered (and its meat eaten): its bones and hide remain.
    for (const id of ['meat', 'hide', 'bone', 'sinew']) {
      const item = production.catalog.item(id);
      for (const inventory of [...production.carried, production.stockOf(0)]) brought += inventory.count(item);
    }
    expect(hunted()).toBeGreaterThan(0);
    expect(brought).toBeGreaterThan(0);
  });
});

describe('moving the camp', () => {
  it('when most adults must go far for food, they move together: old buildings abandoned, a new fire is built', () => {
    const data = dataWithSize(SIZE);
    const simulation = new Simulation(42, data);
    const { humans, production } = simulation;
    const people = humans.people;
    const camp = humans.camps[0]!;
    // Food is only found far away, to the east.
    const far = camp.center + data.humans.campMove.forageFarTiles + 10;
    for (let p = 0; p < people.count; p++) {
      people.forageDistance[p] = data.humans.campMove.forageFarTiles * 3;
      people.farFood[p] = far;
    }
    camp.settledDay = -data.humans.campMove.minDaysBetweenMoves;
    simulation.step(data.time.ticksPerDay + 1);
    const move = simulation.journal.all().find((event) => event.type === CAMP_MOVED);
    expect(move).toBeDefined();
    expect(move!.text).toContain('tuiles vers');
    expect(camp.center).not.toBe(production.campBuildings(0)[0]!.tile);
    expect(production.campBuildings(0).filter((b) => b.state === BuildState.Abandoned).length).toBeGreaterThanOrEqual(7);
    for (let d = 0; d < 3 && !production.fireOf(0); d++) simulation.step(data.time.ticksPerDay);
    expect(production.fireOf(0)).not.toBeNull();
  });
});

describe('determinism', () => {
  it('same seed => same stock, same buildings, same journal', () => {
    const run = (): string => {
      const data = dataKnowing('stone_knapping', 'hunting', 'cooking');
      const simulation = new Simulation(9, data);
      simulation.step(3 * data.time.ticksPerDay);
      const { production } = simulation;
      const stock = production.stockOf(0).piles.map((pile) => `${pile.item}:${pile.qty.toFixed(4)}:${pile.quality.toFixed(4)}`).join(',');
      const buildings = production.buildings.map((b) => `${b.type}@${b.tile}:${b.state}:${b.work.toFixed(3)}`).join(',');
      return `${stock}|${buildings}|${simulation.journal.size}`;
    };
    expect(run()).toEqual(run());
  });
});
