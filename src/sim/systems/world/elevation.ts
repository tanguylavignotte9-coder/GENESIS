import type { Rng } from '../../core/rng';
import { Noise2D } from './noise';
import type { ElevationParams } from './params';

/**
 * Elevation in meters (negative under the sea level).
 * The coastline comes from a "shape" field: continental plateaus (with warped coasts) + islands + fractal
 * detail, pushed down near the map edges; the sea level is chosen so that `oceanFraction` of the map is
 * under it. Altitudes on land = gentle lowlands + ridged mountain chains inside "mountain belts".
 */

interface Blob {
  x: number;
  y: number;
  radius: number;
  strength: number;
}

const HISTOGRAM_BINS = 4096;
const PLACEMENT_ATTEMPTS = 40;
const WARP_OCTAVES = 3;
const ABYSS_QUANTILE = 0.05;

export function generateElevation(size: number, params: ElevationParams, rng: Rng): Float32Array {
  const blobs = placeBlobs(params, rng);
  const warpX = new Noise2D(rng);
  const warpY = new Noise2D(rng);
  const detail = new Noise2D(rng);
  const belts = new Noise2D(rng);
  const ridges = new Noise2D(rng);

  // 1. Shape: decides where the coasts are.
  const shape = new Float32Array(size * size);
  // 2. Mountain potential (0..1): ridged chains, only inside mountain belts.
  const mountain = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      const wf = params.coastWarpFrequency;
      const wu = u + params.coastWarpStrength * warpX.fbm(u * wf, v * wf, WARP_OCTAVES);
      const wv = v + params.coastWarpStrength * warpY.fbm(u * wf, v * wf, WARP_OCTAVES);
      const noise = detail.fbm(u * params.detailFrequency, v * params.detailFrequency, params.detailOctaves);
      shape[i] = landMask(blobs, wu, wv, params.continentShelf) + params.detailWeight * noise - edgePenalty(u, v, params.edgeFalloffWidth);

      const bf = params.mountainBeltFrequency;
      const belt = smoothstep(params.mountainBeltThreshold, params.mountainBeltThreshold + params.mountainBeltWidth, belts.fbm(u * bf, v * bf, WARP_OCTAVES));
      if (belt > 0) {
        const ridge = ridges.ridged(wu * params.ridgeFrequency, wv * params.ridgeFrequency, params.ridgeOctaves);
        mountain[i] = belt * Math.pow(ridge, params.ridgeSharpness);
      }
    }
  }
  return toMeters(shape, mountain, params);
}

function placeBlobs(params: ElevationParams, rng: Rng): Blob[] {
  const blobs: Blob[] = [];
  const continents = rng.nextIntInclusive(params.continentCountMin, params.continentCountMax);
  const margin = params.continentMargin;
  for (let i = 0; i < continents; i++) {
    const radius = rng.nextRange(params.continentRadiusMin, params.continentRadiusMax);
    let x = 0;
    let y = 0;
    // Try to keep continents apart (separate land masses); accept overlap if no room is found.
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      x = rng.nextRange(margin, 1 - margin);
      y = rng.nextRange(margin, 1 - margin);
      if (blobs.every((other) => Math.hypot(other.x - x, other.y - y) >= params.continentSpacing * (other.radius + radius))) break;
    }
    blobs.push({ x, y, radius, strength: 1 });
  }
  const islands = rng.nextIntInclusive(params.islandCountMin, params.islandCountMax);
  const edge = params.edgeFalloffWidth;
  for (let i = 0; i < islands; i++) {
    blobs.push({
      x: rng.nextRange(edge, 1 - edge),
      y: rng.nextRange(edge, 1 - edge),
      radius: rng.nextRange(params.islandRadiusMin, params.islandRadiusMax),
      strength: params.islandStrength,
    });
  }
  return blobs;
}

/**
 * Continental plateau: 0 outside a blob, rising smoothly over the outer `shelf` part of its radius,
 * then flat (= strength) inside. The strongest blob wins.
 */
function landMask(blobs: readonly Blob[], u: number, v: number, shelf: number): number {
  let best = 0;
  for (const blob of blobs) {
    const dx = u - blob.x;
    const dy = v - blob.y;
    const d2 = (dx * dx + dy * dy) / (blob.radius * blob.radius);
    if (d2 >= 1) continue;
    const t = Math.min(1, (1 - Math.sqrt(d2)) / shelf);
    const value = blob.strength * t * t * (3 - 2 * t);
    if (value > best) best = value;
  }
  return best;
}

/** Grows from 0 (inside) to 2 (on the border) within `width` of the map edges, so borders are ocean. */
function edgePenalty(u: number, v: number, width: number): number {
  if (width <= 0) return 0;
  const d = Math.min(u, v, 1 - u, 1 - v);
  if (d >= width) return 0;
  const t = 1 - d / width;
  return 2 * t * t;
}

/**
 * Sets the sea level at the `oceanFraction` quantile of the shape, then builds altitudes:
 * gentle lowlands rising inland, plus mountain chains that grow away from the coast.
 */
function toMeters(shape: Float32Array, mountain: Float32Array, params: ElevationParams): Float32Array {
  let min = Infinity;
  let max = -Infinity;
  for (const value of shape) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const seaLevel = quantile(shape, min, max, params.oceanFraction);
  // Depth is measured against the deepest few percent (not the absolute minimum at the map edges).
  const abyss = quantile(shape, min, max, ABYSS_QUANTILE);
  const landSpan = Math.max(max - seaLevel, Number.EPSILON);
  const seaSpan = Math.max(seaLevel - abyss, Number.EPSILON);
  const meters = new Float32Array(shape.length);
  for (let i = 0; i < shape.length; i++) {
    const value = shape[i] ?? 0;
    if (value < seaLevel) {
      const depth = Math.min(1, (seaLevel - value) / seaSpan);
      meters[i] = -Math.pow(depth, params.oceanDepthExponent) * params.maxOceanDepthMeters;
      continue;
    }
    const inland = (value - seaLevel) / landSpan;
    const lowland = Math.pow(inland, params.lowlandExponent) * params.lowlandMaxMeters;
    const chain = (mountain[i] ?? 0) * smoothstep(0, params.mountainCoastRamp, inland) * params.mountainMaxMeters;
    meters[i] = lowland + chain;
  }
  return meters;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / Math.max(edge1 - edge0, Number.EPSILON)));
  return t * t * (3 - 2 * t);
}

/** Approximate quantile using a histogram (fast and deterministic). */
function quantile(values: Float32Array, min: number, max: number, fraction: number): number {
  const bins = new Uint32Array(HISTOGRAM_BINS);
  const scale = (HISTOGRAM_BINS - 1) / Math.max(max - min, Number.EPSILON);
  for (const value of values) {
    const bin = Math.floor((value - min) * scale);
    bins[bin] = (bins[bin] ?? 0) + 1;
  }
  const target = fraction * values.length;
  let cumulated = 0;
  for (let bin = 0; bin < HISTOGRAM_BINS; bin++) {
    cumulated += bins[bin] ?? 0;
    if (cumulated >= target) return min + (bin + 1) / scale;
  }
  return max;
}
