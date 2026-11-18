import type { ClimateParams } from './climate-params';
import { buildSeasonRows, seasonSignal, type SeasonRows } from './seasons';

const HOURS_PER_DAY = 24;
const NOON = 12;

/** An abnormal year in progress over a circular region. */
export interface ActiveAnomaly {
  /** Index into ClimateParams.anomalies.types. */
  type: number;
  x: number;
  y: number;
  /** Radius in tiles. */
  radius: number;
  place: string;
  /** Landmass the region was drawn on. */
  landmass: number;
  /** Journal id of the event that announced it (cause of its end). */
  startEventId: number;
}

/** What the climate needs to know about the map (a World or the display's copy of it). */
export interface ClimateMap {
  size: number;
  /** °C, mean annual. */
  temperature: Float32Array;
  /** 0..1, mean annual. */
  humidity: Float32Array;
  ocean: Uint8Array;
}

/**
 * Climate of the moment, evaluated ON DEMAND for any tile: annual mean + seasonal swing of its row
 * + effect of the abnormal year covering it. Nothing is recomputed per tile per day: each day only
 * the two hemispheric season signals change. The same code serves the simulation and the display.
 */
export class ClimateState {
  /** 0 = no anomaly, k + 1 = anomalies[k]. */
  readonly anomalyIndex: Uint8Array;
  /** Strength of the anomaly on the tile, 0..1 (1 at its center). */
  readonly anomalyWeight: Float32Array;
  anomalies: ActiveAnomaly[] = [];
  dayOfYear = 0;

  private rows: SeasonRows;
  /** Season signal per hemisphere: [south, north], +1 = height of summer. */
  private readonly signals = new Float64Array(2);
  /** Effects of each active anomaly, indexed like anomalyIndex (0 = none). */
  private offset = new Float64Array(1);
  private winterOffset = new Float64Array(1);
  private humidityShift = new Float64Array(1);
  private snowStart: number;
  private snowSpan: number;

  constructor(
    private readonly map: ClimateMap,
    readonly params: ClimateParams,
    private readonly daysPerYear: number,
  ) {
    const count = map.size * map.size;
    this.anomalyIndex = new Uint8Array(count);
    this.anomalyWeight = new Float32Array(count);
    this.rows = buildSeasonRows(map.size, params);
    this.snowStart = params.snow.startCelsius;
    this.snowSpan = params.snow.startCelsius - params.snow.fullCelsius;
    this.setDay(0);
  }

  /** Recomputes what is derived from the parameters (after a live change in the variables workshop). */
  refreshParams(): void {
    this.rows = buildSeasonRows(this.map.size, this.params);
    this.snowStart = this.params.snow.startCelsius;
    this.snowSpan = this.params.snow.startCelsius - this.params.snow.fullCelsius;
    this.setDay(this.dayOfYear);
    this.refreshAnomalyEffects();
  }

  /** Moves the climate to a day of the year (O(1)). */
  setDay(dayOfYear: number): void {
    this.dayOfYear = dayOfYear;
    this.signals[0] = seasonSignal(dayOfYear, this.daysPerYear, false, this.params);
    this.signals[1] = seasonSignal(dayOfYear, this.daysPerYear, true, this.params);
  }

  /** Call after changing `anomalies` (and the anomaly fields). */
  refreshAnomalyEffects(): void {
    const count = this.anomalies.length + 1;
    this.offset = new Float64Array(count);
    this.winterOffset = new Float64Array(count);
    this.humidityShift = new Float64Array(count);
    this.anomalies.forEach((anomaly, k) => {
      const type = this.params.anomalies.types[anomaly.type];
      if (!type) return;
      this.offset[k + 1] = type.temperatureOffsetCelsius;
      this.winterOffset[k + 1] = type.winterTemperatureOffsetCelsius;
      this.humidityShift[k + 1] = type.humidityFactor - 1;
    });
  }

  /** Name of the abnormal year covering the tile, if any ("Sécheresse"). */
  anomalyNameAt(index: number): string | null {
    const anomaly = this.anomalies[this.anomalyIndex[index]! - 1];
    return anomaly ? (this.params.anomalies.types[anomaly.type]?.name ?? null) : null;
  }

  /** Replaces the abnormal years (used by the display, which receives them from the simulation). */
  setAnomalies(anomalies: ActiveAnomaly[], anomalyIndex: Uint8Array, anomalyWeight: Float32Array): void {
    this.anomalies = anomalies;
    this.anomalyIndex.set(anomalyIndex);
    this.anomalyWeight.set(anomalyWeight);
    this.refreshAnomalyEffects();
  }

  /** Season signal of the tile's hemisphere: +1 at the height of summer, -1 in deep winter. */
  seasonAt(index: number): number {
    return this.signals[this.rows.northern[(index / this.map.size) | 0]!]!;
  }

  /** Hours of daylight today on the tile's row (longer in summer, extreme near the poles). */
  dayLengthAt(index: number): number {
    const y = (index / this.map.size) | 0;
    const signal = this.signals[this.rows.northern[y]!]!;
    const hours = this.params.daylight.equinoxHours + this.rows.daylightDeviation[y]! * signal;
    return hours < 0 ? 0 : hours > HOURS_PER_DAY ? HOURS_PER_DAY : hours;
  }

  /** Light on the tile at an hour of the day (0..24): 0 = night, 1 = full day, in between at dawn and dusk. */
  daylightAt(index: number, hour: number): number {
    const length = this.dayLengthAt(index);
    const sunrise = NOON - length / 2;
    const sunset = NOON + length / 2;
    const twilight = Math.max(this.params.daylight.twilightHours, Number.EPSILON);
    const rise = (hour - sunrise) / twilight + 0.5;
    const fall = (sunset - hour) / twilight + 0.5;
    const light = Math.min(rise, fall);
    return light <= 0 ? 0 : light >= 1 ? 1 : light;
  }

  /** °C right now. */
  temperatureAt(index: number): number {
    const y = (index / this.map.size) | 0;
    const signal = this.signals[this.rows.northern[y]!]!;
    let temperature = this.map.temperature[index]! + this.rows.temperatureAmplitude[y]! * signal;
    const k = this.anomalyIndex[index]!;
    if (k !== 0) {
      const winter = signal < 0 ? -signal : 0;
      temperature += this.anomalyWeight[index]! * (this.offset[k]! + winter * this.winterOffset[k]!);
    }
    return temperature;
  }

  /** 0..1 right now. */
  humidityAt(index: number): number {
    const y = (index / this.map.size) | 0;
    const signal = this.signals[this.rows.northern[y]!]!;
    let humidity = this.map.humidity[index]! * (1 + this.rows.humidityAmplitude[y]! * signal);
    const k = this.anomalyIndex[index]!;
    if (k !== 0) humidity *= 1 + this.anomalyWeight[index]! * this.humidityShift[k]!;
    return humidity < 0 ? 0 : humidity > 1 ? 1 : humidity;
  }

  /** Snow cover right now, 0..1 (never on the ocean). */
  snowAt(index: number): number {
    if (this.map.ocean[index] === 1) return 0;
    const share = (this.snowStart - this.temperatureAt(index)) / this.snowSpan;
    return share <= 0 ? 0 : share >= 1 ? 1 : share;
  }
}
