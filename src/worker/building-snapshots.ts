import type { Simulation } from '../sim/core/simulation';
import { BuildState, siteProgress } from '../sim/systems/production/buildings';
import type { BuildingDetails, BuildingsSnapshot } from '../shared/messages';
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

export function describeBuilding(simulation: Simulation, requestId: number, id: number): BuildingDetails | null {
  const { production, humans } = simulation;
  const building = production.buildings[id];
  if (!building) return null;
  const type = production.typeOf(building);
  const def = type.def;
  const names = (people: readonly number[]): string[] => people.map((person) => humans.people.names[person] ?? '?');
  const isStore = def.storage > 0 || (def.function === 'fire' && production.storageOf(building.camp).capacity === 0);
  const camp = production.camps[building.camp];
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
    sleeps: def.sleeps,
    quality: building.quality,
    fuel: building.fuel,
    fuelMax: def.fuelMaxHours,
    stock: isStore && camp && building.state === BuildState.Done ? itemLines(camp.stock) : null,
    capacity: production.storageOf(building.camp).capacity,
    crop: def.function === 'field' ? { sown: building.sown, growth: building.growth, growthDays: production.params.crop.growthDays, grain: building.grain } : null,
  };
}
