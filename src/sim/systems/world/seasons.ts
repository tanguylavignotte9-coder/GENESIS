import type { ClimateParams } from './climate-params';
import { rowLatitude } from './grid';
import { valueAtLatitude } from './latitude-curve';

/**
 * Seasonal signal of a hemisphere: +1 at the height of summer, -1 at the depth of winter.
 * Seasons are opposite in the southern hemisphere (bottom half of the map).
 */
export function seasonSignal(dayOfYear: number, daysPerYear: number, northern: boolean, params: ClimateParams): number {
  const phase = (2 * Math.PI * (dayOfYear + 0.5 - params.seasonalTemperature.warmestDayOfYear)) / daysPerYear;
  return (northern ? 1 : -1) * Math.cos(phase);
}

/** Per-row seasonal settings, computed once per world. */
export interface SeasonRows {
  northern: Uint8Array;
  temperatureAmplitude: Float32Array;
  humidityAmplitude: Float32Array;
  /** Extra hours of daylight at midsummer, by row. */
  daylightDeviation: Float32Array;
}

export function buildSeasonRows(size: number, params: ClimateParams): SeasonRows {
  const rows: SeasonRows = {
    northern: new Uint8Array(size),
    temperatureAmplitude: new Float32Array(size),
    humidityAmplitude: new Float32Array(size),
    daylightDeviation: new Float32Array(size),
  };
  for (let y = 0; y < size; y++) {
    const latitude = rowLatitude(y, size);
    rows.northern[y] = y < size / 2 ? 1 : 0;
    rows.temperatureAmplitude[y] = valueAtLatitude(params.seasonalTemperature.amplitudeByLatitude, latitude);
    rows.humidityAmplitude[y] = valueAtLatitude(params.seasonalHumidity.amplitudeByLatitude, latitude);
    rows.daylightDeviation[y] = valueAtLatitude(params.daylight.deviationByLatitude, latitude);
  }
  return rows;
}
