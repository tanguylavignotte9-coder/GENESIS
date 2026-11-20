/**
 * Every class whose instances live in a saved world, under a stable key. A new class kept in the
 * simulation's state must be added here (saving refuses an undeclared class, and the save test
 * runs a world long enough to meet them all). Never rename a key: change SAVE_FORMAT_VERSION instead.
 */
import { AnimalStore } from '../../systems/fauna/animal-store';
import { Carrion } from '../../systems/fauna/carrion';
import { Census } from '../../systems/fauna/census';
import { FaunaSystem } from '../../systems/fauna/fauna-system';
import { FishStock } from '../../systems/fauna/fish';
import { GroupStore } from '../../systems/fauna/groups';
import { FloraState } from '../../systems/flora/flora-state';
import { FloraSystem } from '../../systems/flora/flora-system';
import { Camp } from '../../systems/individuals/camp';
import { IndividualsSystem } from '../../systems/individuals/individuals-system';
import { LifeCycle } from '../../systems/individuals/life/life-cycle';
import { LifeState } from '../../systems/individuals/life/state';
import { NameGenerator } from '../../systems/individuals/names';
import { Pathfinder } from '../../systems/individuals/pathfinding';
import { People } from '../../systems/individuals/people';
import { NewsBoard } from '../../systems/individuals/social/news';
import { SocialLife } from '../../systems/individuals/social/social-life';
import { SocialState } from '../../systems/individuals/social/state';
import { Terrain } from '../../systems/individuals/terrain';
import { CampState } from '../../systems/production/camps';
import { Catalog } from '../../systems/production/catalog';
import { Inventory } from '../../systems/production/inventory';
import { ProductionSystem } from '../../systems/production/production-system';
import { ClimateState } from '../../systems/world/climate-state';
import { MinHeap } from '../../systems/world/min-heap';
import { WeatherState } from '../../systems/world/weather';
import { SimClock } from '../clock';
import { Interactions } from '../interactions';
import { Journal } from '../journal';
import { Rng } from '../rng';
import { Simulation } from '../simulation';
import { SpatialGrid } from '../spatial-grid';
import type { ClassRegistry } from './graph';

export const SAVED_CLASSES: ClassRegistry = {
  Simulation,
  SimClock,
  Rng,
  Journal,
  Interactions,
  SpatialGrid,
  ClimateState,
  WeatherState,
  MinHeap,
  FloraSystem,
  FloraState,
  FaunaSystem,
  AnimalStore,
  GroupStore,
  Census,
  Carrion,
  FishStock,
  ProductionSystem,
  Catalog,
  CampState,
  Inventory,
  IndividualsSystem,
  People,
  Camp,
  Terrain,
  Pathfinder,
  NameGenerator,
  LifeCycle,
  LifeState,
  SocialLife,
  SocialState,
  NewsBoard,
};
