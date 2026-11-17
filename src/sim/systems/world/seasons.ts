import type { ClimateParams } from './climate-params';
import type { ClimateState } from './climate-state';
import { rowLatitude } from './grid';
import { valueAtLatitude } from './latitude-curve';
import type { World } from './world';

const FULL_SNOW = 100;

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
}

export function buildSeasonRows(size: number, params: ClimateParams): SeasonRows {
  const rows: SeasonRows = {
    northern: new Uint8Array(size),
    temperatureAmplitude: new Float32Array(size),
    humidityAmplitude: new Float32Array(size),
  };
  for (let y = 0; y < size; y++) {
    const latitude = rowLatitude(y, size);
    rows.northern[y] = y < size / 2 ? 1 : 0;
    rows.temperatureAmplitude[y] = valueAtLatitude(params.seasonalTemperature.amplitudeByLatitude, latitude);
    rows.humidityAmplitude[y] = valueAtLatitude(params.seasonalHumidity.amplitudeByLatitude, latitude);
  }
  return rows;
}

/** Recomputes the temperature, humidity and snow of every tile for a day of the year. */
export function updateDailyClimate(
  world: World,
  state: ClimateState,
  rows: SeasonRows,
  params: ClimateParams,
  dayOfYear: number,
  daysPerYear: number,
): void {
  const size = world.size;
  const snowStart = params.snow.startCelsius;
  const snowSpan = snowStart - params.snow.fullCelsius;
  const signals = [seasonSignal(dayOfYear, daysPerYear, false, params), seasonSignal(dayOfYear, daysPerYear, true, params)];
  // Effects of each active anomaly, indexed like state.anomalyIndex (0 = none).
  const count = state.anomalies.length + 1;
  const offset = new Float64Array(count);
  const winterOffset = new Float64Array(count);
  const humidityShift = new Float64Array(count);
  state.anomalies.forEach((anomaly, k) => {
    const type = params.anomalies.types[anomaly.type];
    if (!type) return;
    offset[k + 1] = type.temperatureOffsetCelsius;
    winterOffset[k + 1] = type.winterTemperatureOffsetCelsius;
    humidityShift[k + 1] = type.humidityFactor - 1;
  });

  const { temperature: meanTemperature, humidity: meanHumidity, ocean } = world;
  const { temperature: outTemperature, humidity: outHumidity, snow, anomalyIndex, anomalyWeight } = state;
  for (let y = 0; y < size; y++) {
    const signal = signals[rows.northern[y]!]!;
    const winter = signal < 0 ? -signal : 0;
    const seasonalTemperature = rows.temperatureAmplitude[y]! * signal;
    const seasonalHumidity = 1 + rows.humidityAmplitude[y]! * signal;
    const rowStart = y * size;
    for (let i = rowStart; i < rowStart + size; i++) {
      let temperature = meanTemperature[i]! + seasonalTemperature;
      let humidity = meanHumidity[i]! * seasonalHumidity;
      const k = anomalyIndex[i]!;
      if (k !== 0) {
        const weight = anomalyWeight[i]!;
        temperature += weight * (offset[k]! + winter * winterOffset[k]!);
        humidity *= 1 + weight * humidityShift[k]!;
      }
      outTemperature[i] = temperature;
      outHumidity[i] = humidity < 0 ? 0 : humidity > 1 ? 1 : humidity;
      const snowShare = ocean[i] === 1 ? 0 : (snowStart - temperature) / snowSpan;
      snow[i] = snowShare <= 0 ? 0 : snowShare >= 1 ? FULL_SNOW : Math.round(snowShare * FULL_SNOW);
    }
  }
}
