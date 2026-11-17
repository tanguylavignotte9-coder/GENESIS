import type { Simulation } from '../sim/core/simulation';
import type { ClimateSnapshot } from '../shared/messages';

const PERCENT = 100;
const INT8_MIN = -128;
const INT8_MAX = 127;

/** Quantized copy of the climate of the day, ready to be transferred to the display. */
export function snapshotClimate(simulation: Simulation): { snapshot: ClimateSnapshot; transfer: ArrayBuffer[] } {
  const { climate, data } = simulation;
  const count = climate.temperature.length;
  const temperature = new Int8Array(count);
  const humidity = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    temperature[i] = Math.max(INT8_MIN, Math.min(INT8_MAX, Math.round(climate.temperature[i] ?? 0)));
    humidity[i] = Math.round((climate.humidity[i] ?? 0) * PERCENT);
  }
  const snapshot: ClimateSnapshot = {
    version: simulation.climateVersion,
    temperature,
    humidity,
    snow: climate.snow.slice(),
    anomaly: climate.anomalyIndex.slice(),
    anomalyNames: climate.anomalies.map((anomaly) => data.climate.anomalies.types[anomaly.type]?.name ?? '?'),
  };
  const transfer = [snapshot.temperature, snapshot.humidity, snapshot.snow, snapshot.anomaly].map((array) => array.buffer as ArrayBuffer);
  return { snapshot, transfer };
}
