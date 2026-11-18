import type { FloraParams, PlantSpecies } from './params';

/** 1 inside [min, max], falling linearly to 0 at `tolerance` outside. */
function rangeFit(value: number, min: number, max: number, tolerance: number): number {
  if (value < min) return Math.max(0, 1 - (min - value) / tolerance);
  if (value > max) return Math.max(0, 1 - (value - max) / tolerance);
  return 1;
}

/** How well a species fits a tile's annual climate, 0..1. */
export function speciesFitness(species: PlantSpecies, meanCelsius: number, meanHumidity: number, params: FloraParams): number {
  return (
    rangeFit(meanCelsius, species.temperature[0], species.temperature[1], params.fitnessToleranceCelsius) *
    rangeFit(meanHumidity, species.humidity[0], species.humidity[1], params.fitnessToleranceHumidity)
  );
}

/** Day of the year as felt locally: the southern half of the map is half a year ahead/behind. */
export function localDayOfYear(dayOfYear: number, northern: boolean, daysPerYear: number): number {
  return northern ? dayOfYear : (dayOfYear + daysPerYear / 2) % daysPerYear;
}
