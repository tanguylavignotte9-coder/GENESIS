/** An abnormal year in progress over a circular region. */
export interface ActiveAnomaly {
  /** Index into ClimateParams.anomalies.types. */
  type: number;
  x: number;
  y: number;
  /** Radius in tiles. */
  radius: number;
  place: string;
  /** Journal id of the event that announced it (cause of its end). */
  startEventId: number;
}

/**
 * Climate "of the moment", updated once per game day (compact typed arrays, one value per tile).
 */
export class ClimateState {
  /** °C right now. */
  readonly temperature: Float32Array;
  /** 0..1 right now. */
  readonly humidity: Float32Array;
  /** Snow cover, 0..100 %. */
  readonly snow: Uint8Array;
  /** 0 = no anomaly, k + 1 = anomalies[k]. */
  readonly anomalyIndex: Uint8Array;
  /** Strength of the anomaly on the tile, 0..1 (1 at its center). */
  readonly anomalyWeight: Float32Array;
  anomalies: ActiveAnomaly[] = [];

  constructor(tileCount: number) {
    this.temperature = new Float32Array(tileCount);
    this.humidity = new Float32Array(tileCount);
    this.snow = new Uint8Array(tileCount);
    this.anomalyIndex = new Uint8Array(tileCount);
    this.anomalyWeight = new Float32Array(tileCount);
  }
}
