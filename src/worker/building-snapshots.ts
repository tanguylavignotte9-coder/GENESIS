import type { Simulation } from '../sim/core/simulation';
import { BuildState, siteProgress } from '../sim/systems/production/buildings';
import type { BuildingDetails, BuildingsSnapshot } from '../shared/messages';
import { Gait } from '../sim/core/motion';
import { itemLines } from './human-snapshots';

/** Every building and site (positions, state, progress), and the open heaps of the camps' stocks. */
export function snapshotBuildings(simulation: Simulation): BuildingsSnapshot {
  const { production } = simulation;
  const size = simulation.world.size;
  const fills = new Map<number, number>();
  for (const camp of production.camps) {
    if (!camp) continue;
    const { capacity } = production.storageOf(camp.id);
    fills.set(camp.id, capacity > 0 ? Math.min(1, production.foodBulk(camp.stock) / capacity) : 0);
  }
  const buildings = production.buildings.map((building) => {
    const type = production.typeOf(building);
    return {
      id: building.id,
      type: building.type,
      x: building.tile % size,
      y: Math.floor(building.tile / size),
      state: building.state,
      progress: siteProgress(building, type),
      lit: building.fuel > 0,
      fill: type.def.storage > 0 && building.state === BuildState.Done ? (fills.get(building.camp) ?? 0) : 0,
      crop: building.grain >= 1 ? 2 : building.sown > 0 ? 1 : 0,
    };
  });
  const heaps = production.camps.flatMap((camp) => {
    if (!camp || camp.stock.isEmpty || production.storageOf(camp.id).capacity > 0) return [];
    const tile = production.stockTile(camp.id);
    return [{ x: tile % size, y: Math.floor(tile / size), bulk: camp.stock.bulk(production.catalog.bulk) }];
  });
  const belongings = production.ground.map((pile) => ({ x: pile.x, y: pile.y }));
  return { buildings, heaps, belongings };
}

/**
 * Closed buildings (hut, granary, workshop…) by tile: a person standing still on that tile is inside
 * (asleep in her hut, at work in the smokehouse) and is not drawn on the map.
 */
export function enclosedTiles(simulation: Simulation): Map<number, number> {
  const { production } = simulation;
  const tiles = new Map<number, number>();
  for (const building of production.buildings) {
    if (building.state === BuildState.Done && production.typeOf(building).def.enclosed) tiles.set(building.tile, building.id);
  }
  return tiles;
}

/** The closed building a person is in, or -1. */
export function buildingOf(simulation: Simulation, tiles: Map<number, number>, person: number): number {
  const { people } = simulation.humans;
  if (people.alive[person] === 0 || people.gait[person] !== Gait.Still || tiles.size === 0) return -1;
  const tile = Math.floor(people.py[person]!) * simulation.world.size + Math.floor(people.px[person]!);
  return tiles.get(tile) ?? -1;
}

export function describeBuilding(simulation: Simulation, requestId: number, id: number): BuildingDetails | null {
  const { production, humans } = simulation;
  const building = production.buildings[id];
  if (!building) return null;
  const type = production.typeOf(building);
  const def = type.def;
  const names = (people: readonly number[]): string[] => people.map((person) => humans.people.names[person] ?? '?');
  const isStore = def.storage > 0 || (def.function === 'fire' && production.storageOf(building.camp).capacity === 0);
  const camp = production.camps[building.camp];
  const occupants: BuildingDetails['occupants'] = [];
  if (def.enclosed && building.state === BuildState.Done) {
    const tiles = new Map([[building.tile, building.id]]);
    const { people, actions } = humans;
    for (let person = 0; person < people.count; person++) {
      if (buildingOf(simulation, tiles, person) !== building.id) continue;
      occupants.push({ person, name: people.names[person] ?? '?', doing: actions[people.action[person]!]?.def.label ?? '' });
    }
  }
  return {
    requestId,
    building: id,
    type: building.type,
    description: def.description,
    state: building.state,
    progress: siteProgress(building, type),
    materials: type.materials.map((need, k) => ({
      name: need.items.map((item) => production.catalog.items[item]!.name).join(' ou '),
      delivered: building.delivered[k]!,
      needed: need.qty,
    })),
    workDone: building.work,
    workNeeded: def.workHours,
    builders: names(building.builders),
    residents: names(building.residents),
    occupants,
    sleeps: def.sleeps,
    quality: building.quality,
    fuel: building.fuel,
    fuelMax: def.fuelMaxHours,
    stock: isStore && camp && building.state === BuildState.Done ? itemLines(camp.stock) : null,
    capacity: production.storageOf(building.camp).capacity,
    crop: def.function === 'field' ? { sown: building.sown, growth: building.growth, growthDays: production.params.crop.growthDays, grain: building.grain } : null,
  };
}
