import { describe, expect, it } from 'vitest';
import biomesJson from '../../../data/biomes.json';
import climateJson from '../../../data/climate.json';
import worldgenJson from '../../../data/worldgen.json';
import { parseBiomeTable } from '../../../src/sim/systems/world/biomes';
import { parseClimateParams } from '../../../src/sim/systems/world/climate-params';
import { parseWorldgenParams } from '../../../src/sim/systems/world/params';

function messageOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return (error as Error).message;
  }
  return '';
}

describe('world data files', () => {
  it('data/worldgen.json and data/biomes.json are valid', () => {
    expect(() => parseWorldgenParams(worldgenJson)).not.toThrow();
    expect(() => parseBiomeTable(biomesJson)).not.toThrow();
    expect(() => parseClimateParams(climateJson)).not.toThrow();
  });

  it('requires the {lieu} placeholder in journal sentences', () => {
    const types = climateJson.anomalies.types.map((type, k) => (k === 0 ? { ...type, startText: 'Une sécheresse.' } : type));
    const broken = { ...climateJson, anomalies: { ...climateJson.anomalies, types } };
    expect(messageOf(() => parseClimateParams(broken))).toContain('« anomalies.types[0].startText » doit être un texte contenant {lieu}');
  });

  it('explains nested errors in French with the path of the value', () => {
    const broken = { ...worldgenJson, elevation: { ...worldgenJson.elevation, oceanFraction: 2 } };
    expect(messageOf(() => parseWorldgenParams(broken))).toContain('« elevation.oceanFraction » doit être un nombre compris entre 0.05 et 0.95');
  });

  it('rejects inconsistent min/max values', () => {
    const broken = { ...worldgenJson, elevation: { ...worldgenJson.elevation, continentCountMin: 9 } };
    expect(messageOf(() => parseWorldgenParams(broken))).toContain('continentCountMin');
  });

  it('requires a catch-all biome at the end of each domain', () => {
    const biomes = biomesJson.biomes.filter((biome) => biome.id !== 'prairie');
    expect(messageOf(() => parseBiomeTable({ ...biomesJson, biomes }))).toContain('biome par défaut');
  });

  it('rejects a badly written color', () => {
    const biomes = biomesJson.biomes.map((biome) => (biome.id === 'desert' ? { ...biome, color: 'jaune' } : biome));
    expect(messageOf(() => parseBiomeTable({ ...biomesJson, biomes }))).toContain('« biomes[11].color » doit être une couleur au format #rrggbb');
  });
});
