import type { Rng } from '../../core/rng';
import { classifyBiome, type BiomeTable } from './biomes';
import { generateHumidity, generateTemperature, sweepMoisture } from './climate';
import { generateElevation } from './elevation';
import { boxBlur } from './grid';

const METERS_PER_KM = 1000;
import { accumulateFlow, computeDrainage, computeSurfaceWater, countRiverMouths } from './hydrology';
import { labelLandmasses, type LandmassMap } from './landmasses';
import { computeOceanMask, distanceToOcean } from './ocean';
import type { WorldgenParams } from './params';
import { nameLandmasses } from './places';

/**
 * The generated map. Every field is a compact typed array of size × size tiles,
 * indexed by y * size + x (y = 0 is the north pole row).
 */
export interface World {
  size: number;
  /** Meters. Negative under the sea; for lakes, the water surface. */
  elevation: Float32Array;
  /** Mean annual temperature, °C. */
  temperature: Float32Array;
  /** 0 (arid) to 1 (saturated). */
  humidity: Float32Array;
  /** 1 for ocean tiles. */
  ocean: Uint8Array;
  /** Index into `biomes.biomes`. */
  biome: Uint8Array;
  /** Water.None / Water.River / Water.Lake. */
  water: Uint8Array;
  /** Downstream tile of each land tile (-1 for ocean tiles and map-border outlets). */
  flowTo: Int32Array;
  biomes: BiomeTable;
  riverCount: number;
  lakeCount: number;
  landmasses: LandmassMap;
  /** Descriptive name of each landmass (same order as landmasses.list). */
  landmassNames: string[];
}

export function generateWorld(params: WorldgenParams, biomes: BiomeTable, rng: Rng): World {
  const size = params.size;
  const elevation = generateElevation(size, params.elevation, rng);
  const ocean = computeOceanMask(elevation, size);

  const drainage = computeDrainage(elevation, ocean, size, params.hydrology.fillEpsilonMeters);
  const temperature = generateTemperature(elevation, size, params.temperature, rng);
  const airMoisture = sweepMoisture(smoothedRelief(elevation, size, params.humidity.reliefSmoothing), ocean, size, params.humidity);
  const humidity = generateHumidity(airMoisture, size, params.humidity, rng);

  const runoff = computeRunoff(humidity, elevation, ocean, params.hydrology.runoffPerKmOfAltitude);
  const flow = accumulateFlow(drainage, runoff);
  const { water, lakeCount } = computeSurfaceWater(elevation, drainage, flow, ocean, size, params.hydrology);
  applyFilledElevation(elevation, drainage.filled, ocean);

  const coastDistance = distanceToOcean(ocean, size, params.beachMaxDistance);
  const biome = new Uint8Array(size * size);
  for (let i = 0; i < biome.length; i++) {
    biome[i] = classifyBiome(biomes.biomes, ocean[i] === 1, {
      altitude: elevation[i] ?? 0,
      temperature: temperature[i] ?? 0,
      humidity: humidity[i] ?? 0,
      coastal: (coastDistance[i] ?? 0) <= params.beachMaxDistance,
    });
  }

  const landmasses = labelLandmasses(ocean, size, params.continentMinShare);
  return {
    size,
    elevation,
    temperature,
    humidity,
    ocean,
    biome,
    water,
    flowTo: drainage.flowTo,
    biomes,
    riverCount: countRiverMouths(water, drainage.flowTo),
    lakeCount,
    landmasses,
    landmassNames: nameLandmasses(landmasses, size),
  };
}

/** Winds only "feel" large landforms: the moisture sweep uses a smoothed copy of the relief. */
function smoothedRelief(elevation: Float32Array, size: number, radius: number): Float32Array {
  const relief = Float32Array.from(elevation, (value) => Math.max(0, value));
  boxBlur(relief, size, radius);
  return relief;
}

/** Water feeding the rivers: land only, humidity², larger in the mountains (relief rain, snowmelt). */
function computeRunoff(humidity: Float32Array, elevation: Float32Array, ocean: Uint8Array, perKm: number): Float32Array {
  const runoff = new Float32Array(humidity.length);
  for (let i = 0; i < humidity.length; i++) {
    if (ocean[i] === 1) continue;
    const altitudeKm = Math.max(0, elevation[i] ?? 0) / METERS_PER_KM;
    const wetness = humidity[i] ?? 0;
    runoff[i] = wetness * wetness * (1 + perKm * altitudeKm);
  }
  return runoff;
}

/** Land takes the filled surface: basins become lake surfaces or flat dry basins, so water always runs downhill. */
function applyFilledElevation(elevation: Float32Array, filled: Float64Array, ocean: Uint8Array): void {
  for (let i = 0; i < elevation.length; i++) if (ocean[i] === 0) elevation[i] = filled[i] ?? 0;
}
