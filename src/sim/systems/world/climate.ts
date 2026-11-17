import type { Rng } from '../../core/rng';
import { boxBlur, rowLatitude } from './grid';
import { Noise2D } from './noise';
import type { HumidityParams, TemperatureParams, WindDirection } from './params';

const METERS_PER_KM = 1000;

/** Mean annual temperature (°C) from latitude and altitude (water surface counts as 0 m). */
export function temperatureAt(latitude: number, altitudeMeters: number, params: TemperatureParams): number {
  const base = params.equatorCelsius - (params.equatorCelsius - params.poleCelsius) * Math.pow(latitude, params.latitudeExponent);
  return base - (Math.max(0, altitudeMeters) / METERS_PER_KM) * params.lapseRateCelsiusPerKm;
}

export function generateTemperature(elevation: Float32Array, size: number, params: TemperatureParams, rng: Rng): Float32Array {
  const noise = new Noise2D(rng);
  const temperature = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const latitude = rowLatitude(y, size);
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const jitter = params.noiseCelsius * noise.fbm((x / size) * params.noiseFrequency, (y / size) * params.noiseFrequency, 3);
      temperature[i] = temperatureAt(latitude, elevation[i] ?? 0, params) + jitter;
    }
  }
  return temperature;
}

export function windDirectionAt(latitude: number, params: HumidityParams): WindDirection {
  for (const band of params.windBands) if (latitude <= band.untilLatitude) return band.direction;
  return params.windBands.at(-1)?.direction ?? 'fromWest';
}

const BLEND_SAMPLES = 9;

/** Share (0..1) of westerly wind at a latitude, smoothed over `windBandBlend` around band limits. */
export function westerlyWeight(latitude: number, params: HumidityParams): number {
  let westerly = 0;
  for (let k = 0; k < BLEND_SAMPLES; k++) {
    const offset = ((2 * k) / (BLEND_SAMPLES - 1) - 1) * params.windBandBlend;
    const sample = Math.min(1, Math.abs(latitude + offset));
    if (windDirectionAt(sample, params) === 'fromWest') westerly++;
  }
  return westerly / BLEND_SAMPLES;
}

/** Large-scale circulation multiplier (wet equator, dry subtropics…), linearly interpolated. */
export function latitudeFactor(latitude: number, params: HumidityParams): number {
  const points = params.latitudeFactors;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1];
    const b = points[k];
    if (a && b && latitude <= b.latitude) {
      const t = (latitude - a.latitude) / Math.max(b.latitude - a.latitude, Number.EPSILON);
      return a.factor + t * (b.factor - a.factor);
    }
  }
  return points.at(-1)?.factor ?? 1;
}

/**
 * Prevailing winds carry moisture along each row. Over water the air recharges; over land it rains
 * a little on every tile and a lot where the ground climbs. Behind a mountain range the air is dry:
 * this is the rain shadow. Returns the moisture carried by the air over each tile (0..1).
 * Near the limit between two wind bands, both directions are blended.
 */
export function sweepMoisture(
  elevation: Float32Array,
  isWater: Uint8Array,
  size: number,
  params: HumidityParams,
): Float32Array {
  const airMoisture = new Float32Array(size * size);
  const row = new Float32Array(size);
  for (let y = 0; y < size; y++) {
    const west = westerlyWeight(rowLatitude(y, size), params);
    if (west > 0) {
      sweepRow(elevation, isWater, size, y, true, params, row);
      for (let x = 0; x < size; x++) airMoisture[y * size + x] = west * (row[x] ?? 0);
    }
    if (west < 1) {
      sweepRow(elevation, isWater, size, y, false, params, row);
      for (let x = 0; x < size; x++) airMoisture[y * size + x] = (airMoisture[y * size + x] ?? 0) + (1 - west) * (row[x] ?? 0);
    }
  }
  return airMoisture;
}

function sweepRow(
  elevation: Float32Array,
  isWater: Uint8Array,
  size: number,
  y: number,
  fromWest: boolean,
  params: HumidityParams,
  out: Float32Array,
): void {
  let moisture = 1;
  let previousAltitude = 0;
  for (let step = 0; step < size; step++) {
    const x = fromWest ? step : size - 1 - step;
    const i = y * size + x;
    const altitude = Math.max(0, elevation[i] ?? 0);
    if (isWater[i] === 1) {
      moisture += (1 - moisture) * params.oceanEvaporation;
    } else {
      const climb = Math.max(0, altitude - previousAltitude);
      const share = Math.min(1, params.landRainPerTile + params.orographicRainPerMeter * climb);
      moisture -= moisture * share * (1 - params.rainRecycling);
    }
    out[x] = moisture;
    previousAltitude = altitude;
  }
}

/** Final humidity 0..1: air moisture × latitude circulation, smoothed and slightly varied. */
export function generateHumidity(
  airMoisture: Float32Array,
  size: number,
  params: HumidityParams,
  rng: Rng,
): Float32Array {
  const noise = new Noise2D(rng);
  const humidity = Float32Array.from(airMoisture);
  boxBlur(humidity, size, params.blurRadius);
  for (let y = 0; y < size; y++) {
    const factor = latitudeFactor(rowLatitude(y, size), params);
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const jitter = params.noiseAmplitude * noise.fbm((x / size) * params.noiseFrequency, (y / size) * params.noiseFrequency, 3);
      humidity[i] = clamp01((humidity[i] ?? 0) * factor + jitter);
    }
  }
  return humidity;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
