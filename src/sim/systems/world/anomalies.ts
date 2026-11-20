import type { Journal } from '../../core/journal';
import type { Rng } from '../../core/rng';
import { fillPlace, type AnomalyParams, type AnomalyType } from './climate-params';
import type { ActiveAnomaly, ClimateState } from './climate-state';
import { describeLocation } from './places';
import type { World } from './world';

const CENTER_ATTEMPTS = 50;
/** Anomaly indices are stored in a Uint8Array (0 = none). */
const MAX_ANOMALIES = 255;
export const ANOMALY_START = 'climate.anomaly.start';
export const ANOMALY_END = 'climate.anomaly.end';

/**
 * Called at the start of each year: ends last year's anomalies (each end is caused by its start),
 * then rolls this year's ones with the seeded generator: each large landmass gets one roll per
 * `tilesPerRoll` tiles (at least one), so big continents see more abnormal years than islands.
 */
export function startAnomalyYear(world: World, state: ClimateState, params: AnomalyParams, rng: Rng, journal: Journal, tick: number): void {
  for (const anomaly of state.anomalies) {
    const type = params.types[anomaly.type];
    if (!type) continue;
    journal.publish({
      tick,
      type: ANOMALY_END,
      text: fillPlace(type.endText, anomaly.place),
      place: { x: anomaly.x, y: anomaly.y, label: anomaly.place },
      actors: [],
      causes: [anomaly.startEventId],
      details: { anomaly: type.id },
    });
  }
  state.anomalies = [];
  state.anomalyIndex.fill(0);
  state.anomalyWeight.fill(0);

  const rolls = world.landmasses.list.flatMap((mass) =>
    mass.tiles < params.minLandmassTiles ? [] : new Array<typeof mass>(Math.max(1, Math.round(mass.tiles / params.tilesPerRoll))).fill(mass),
  );
  for (const mass of rolls) {
    if (state.anomalies.length >= MAX_ANOMALIES) break;
    if (rng.nextFloat() >= params.chancePerRoll) continue;
    const typeIndex = pickType(params.types, rng);
    const type = params.types[typeIndex];
    if (!type) continue;
    const center = pickCenter(world, mass.id, mass, rng);
    const radius = rng.nextRange(params.radiusMin, params.radiusMax) * world.size;
    const place = describeLocation(world, center.x, center.y);
    // One abnormal year per region and per year: a second roll on the same region is lost.
    if (state.anomalies.some((other) => other.place === place)) continue;
    const startEventId = journal.publish({
      tick,
      type: ANOMALY_START,
      text: fillPlace(type.startText, place),
      place: { x: center.x, y: center.y, label: place },
      actors: [],
      causes: [],
      details: { anomaly: type.id },
    });
    const anomaly: ActiveAnomaly = { type: typeIndex, x: center.x, y: center.y, radius, place, landmass: mass.id, startEventId };
    state.anomalies.push(anomaly);
    paintAnomaly(state, world.size, anomaly, state.anomalies.length);
  }
  state.refreshAnomalyEffects();
}

function pickType(types: readonly AnomalyType[], rng: Rng): number {
  const total = types.reduce((sum, type) => sum + type.weight, 0);
  let roll = rng.nextFloat() * total;
  for (let k = 0; k < types.length; k++) {
    roll -= types[k]?.weight ?? 0;
    if (roll < 0) return k;
  }
  return types.length - 1;
}

/** A random tile of the landmass (falls back to its centroid). */
function pickCenter(
  world: World,
  id: number,
  box: { minX: number; minY: number; maxX: number; maxY: number; centroidX: number; centroidY: number },
  rng: Rng,
): { x: number; y: number } {
  for (let attempt = 0; attempt < CENTER_ATTEMPTS; attempt++) {
    const x = rng.nextIntInclusive(box.minX, box.maxX);
    const y = rng.nextIntInclusive(box.minY, box.maxY);
    if (world.landmasses.idOf[y * world.size + x] === id) return { x, y };
  }
  return { x: Math.round(box.centroidX), y: Math.round(box.centroidY) };
}

/** Marks the tiles of the region; strength fades smoothly from the center to the edge. */
function paintAnomaly(state: ClimateState, size: number, anomaly: ActiveAnomaly, index: number): void {
  const r = anomaly.radius;
  const x0 = Math.max(0, Math.floor(anomaly.x - r));
  const x1 = Math.min(size - 1, Math.ceil(anomaly.x + r));
  const y0 = Math.max(0, Math.floor(anomaly.y - r));
  const y1 = Math.min(size - 1, Math.ceil(anomaly.y + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - anomaly.x, y - anomaly.y) / r;
      if (d >= 1) continue;
      const t = 1 - d;
      const weight = t * t * (3 - 2 * t);
      const i = y * size + x;
      if (weight > (state.anomalyWeight[i] ?? 0)) {
        state.anomalyWeight[i] = weight;
        state.anomalyIndex[i] = index;
      }
    }
  }
}
