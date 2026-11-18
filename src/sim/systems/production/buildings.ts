import type { BuildingType } from './catalog';

export const BuildState = { Site: 0, Done: 1, Abandoned: 2 } as const;
export type BuildStateCode = (typeof BuildState)[keyof typeof BuildState];

/** A structure placed on the map, from the campfire to the field: first a site, then the building. */
export interface Building {
  id: number;
  type: number;
  camp: number;
  tile: number;
  state: BuildStateCode;
  /** Quantity delivered for each material of the type (sites), and on its way (promised by a builder). */
  delivered: number[];
  incoming: number[];
  /** Hours of work done (sites). */
  work: number;
  /** People who worked on it. */
  builders: number[];
  /** 0..1, from the builders' skill. */
  quality: number;
  /** Hours of fire left (campfire). */
  fuel: number;
  /** People who sleep here (shelters). */
  residents: number[];
  /** Field: units sown (0 = fallow), days of growth so far, ripe crop left to harvest. */
  sown: number;
  growth: number;
  grain: number;
  straw: number;
  /** Journal event of the site's start (cause of its completion), -1 for starting buildings. */
  startEvent: number;
}

export function newBuilding(id: number, type: BuildingType, camp: number, tile: number, state: BuildStateCode): Building {
  return {
    id,
    type: type.index,
    camp,
    tile,
    state,
    delivered: type.materials.map(() => 0),
    incoming: type.materials.map(() => 0),
    work: 0,
    builders: [],
    quality: 0.5,
    fuel: 0,
    residents: [],
    sown: 0,
    growth: 0,
    grain: 0,
    straw: 0,
    startEvent: -1,
  };
}

/** Index of the first material still missing on a site, or -1 when everything is there. */
export function missingMaterial(building: Building, type: BuildingType): number {
  return type.materials.findIndex((need, k) => building.delivered[k]! < need.qty - 1e-6);
}

/** Index of the first material nobody is bringing yet (-1 if all are there or on their way). */
export function unclaimedMaterial(building: Building, type: BuildingType): number {
  return type.materials.findIndex((need, k) => building.delivered[k]! + building.incoming[k]! < need.qty - 1e-6);
}

/** Share of the site done (materials count for half, work for the other half). */
export function siteProgress(building: Building, type: BuildingType): number {
  if (building.state !== BuildState.Site) return 1;
  const needed = type.materials.reduce((sum, need) => sum + need.qty, 0);
  const brought = type.materials.reduce((sum, need, k) => sum + Math.min(need.qty, building.delivered[k]!), 0);
  const materials = needed > 0 ? brought / needed : 1;
  const work = Math.min(1, building.work / type.def.workHours);
  return needed > 0 ? (materials + work) / 2 : work;
}
