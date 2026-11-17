import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../../src/sim/core/game-data';
import { classifyBiome } from '../../../src/sim/systems/world/biomes';
import { latitudeFactor, sweepMoisture, temperatureAt, westerlyWeight } from '../../../src/sim/systems/world/climate';

const data = loadGameData();
const { temperature, humidity } = data.worldgen;

describe('temperature', () => {
  it('is warmer at the equator than at the poles', () => {
    expect(temperatureAt(0, 0, temperature)).toBeGreaterThan(temperatureAt(0.5, 0, temperature));
    expect(temperatureAt(0.5, 0, temperature)).toBeGreaterThan(temperatureAt(1, 0, temperature));
  });

  it('is colder in the mountains', () => {
    const lowland = temperatureAt(0.3, 0, temperature);
    const mountain = temperatureAt(0.3, 3000, temperature);
    expect(lowland - mountain).toBeCloseTo((3000 / 1000) * temperature.lapseRateCelsiusPerKm, 5);
  });
});

describe('humidity', () => {
  /** A strip of 64 rows × 64 tiles: ocean on the west, land on the east, optional mountain ridge. */
  function strip(withMountain: boolean): { moisture: Float32Array; size: number } {
    const size = 64;
    const elevation = new Float32Array(size * size);
    const water = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        if (x < 16) water[i] = 1;
        else elevation[i] = withMountain && x >= 28 && x < 36 ? 400 * (x < 32 ? x - 27 : 36 - x) : 50;
      }
    }
    const westerliesOnly = { ...humidity, windBands: [{ untilLatitude: 1, direction: 'fromWest' as const }] };
    return { moisture: sweepMoisture(elevation, water, size, westerliesOnly), size };
  }

  it('is high near the sea and decreases inland', () => {
    const { moisture, size } = strip(false);
    const row = 10 * size;
    expect(moisture[row + 17]).toBeGreaterThan(moisture[row + 60] ?? 1);
  });

  it('creates a rain shadow behind a mountain range', () => {
    const flat = strip(false);
    const mountain = strip(true);
    const row = 10 * flat.size;
    const before = mountain.moisture[row + 26] ?? 0;
    const behind = mountain.moisture[row + 40] ?? 0;
    expect(behind).toBeLessThan(before * 0.6);
    expect(behind).toBeLessThan((flat.moisture[row + 40] ?? 0) * 0.6);
  });

  it('follows the prevailing winds: trade winds from the east near the equator, westerlies at mid-latitudes', () => {
    expect(westerlyWeight(0.05, humidity)).toBe(0);
    expect(westerlyWeight(0.5, humidity)).toBe(1);
  });

  it('is lower in the subtropics than at the equator (large-scale circulation)', () => {
    expect(latitudeFactor(0.28, humidity)).toBeLessThan(latitudeFactor(0, humidity));
  });
});

describe('biomes', () => {
  const biomes = data.biomes.biomes;
  const idOf = (isOcean: boolean, altitude: number, temp: number, hum: number, coastal = false): string =>
    biomes[classifyBiome(biomes, isOcean, { altitude, temperature: temp, humidity: hum, coastal })]?.id ?? '';

  it('defines the 14 expected biomes', () => {
    expect(biomes.map((biome) => biome.id).sort()).toEqual(
      [
        'beach', 'deep_ocean', 'desert', 'ice', 'marsh', 'mountain', 'ocean', 'prairie', 'savanna',
        'snowy_peak', 'taiga', 'temperate_forest', 'tropical_forest', 'tundra',
      ].sort(),
    );
  });

  it('classifies typical climates', () => {
    expect(idOf(true, -3000, 10, 1)).toBe('deep_ocean');
    expect(idOf(true, -50, 10, 1)).toBe('ocean');
    expect(idOf(false, 3500, -10, 0.5)).toBe('snowy_peak');
    expect(idOf(false, 2000, 10, 0.5)).toBe('mountain');
    expect(idOf(false, 300, -20, 0.5)).toBe('ice');
    expect(idOf(false, 5, 15, 0.5, true)).toBe('beach');
    expect(idOf(false, 300, -8, 0.5)).toBe('tundra');
    expect(idOf(false, 50, 15, 0.9)).toBe('marsh');
    expect(idOf(false, 300, 0, 0.5)).toBe('taiga');
    expect(idOf(false, 300, 25, 0.75)).toBe('tropical_forest');
    expect(idOf(false, 300, 25, 0.4)).toBe('savanna');
    expect(idOf(false, 300, 25, 0.1)).toBe('desert');
    expect(idOf(false, 300, 12, 0.6)).toBe('temperate_forest');
    expect(idOf(false, 300, 12, 0.4)).toBe('prairie');
  });
});
