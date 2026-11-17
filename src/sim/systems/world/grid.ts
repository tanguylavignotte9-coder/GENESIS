/** Helpers for the square tile grid (index = y * size + x). */

/** 8 neighbours: dx, dy and distance. Fixed order => deterministic results. */
export const NEIGHBOR_DX = [1, -1, 0, 0, 1, -1, 1, -1] as const;
export const NEIGHBOR_DY = [0, 0, 1, -1, 1, 1, -1, -1] as const;
export const NEIGHBOR_DISTANCE = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2] as const;
/** The first 4 neighbours are the orthogonal ones. */
export const ORTHOGONAL_COUNT = 4;
export const ALL_NEIGHBORS_COUNT = 8;

/** Latitude of a row: 0 at the equator (middle row), 1 at the poles (top and bottom rows). */
export function rowLatitude(y: number, size: number): number {
  return Math.abs((2 * y) / (size - 1) - 1);
}

/** Separable box blur, in place. */
export function boxBlur(field: Float32Array, size: number, radius: number): void {
  if (radius <= 0) return;
  const tmp = new Float32Array(field.length);
  blurPass(field, tmp, size, radius, 1, size);
  blurPass(tmp, field, size, radius, size, 1);
}

/** Blurs along one axis: `step` moves along the line, `lineStep` jumps between lines. */
function blurPass(src: Float32Array, dst: Float32Array, size: number, radius: number, step: number, lineStep: number): void {
  for (let line = 0; line < size; line++) {
    const base = line * lineStep;
    let sum = 0;
    let count = 0;
    for (let i = 0; i <= radius && i < size; i++) {
      sum += src[base + i * step] ?? 0;
      count++;
    }
    for (let i = 0; i < size; i++) {
      dst[base + i * step] = sum / count;
      const add = i + radius + 1;
      const remove = i - radius;
      if (add < size) {
        sum += src[base + add * step] ?? 0;
        count++;
      }
      if (remove >= 0) {
        sum -= src[base + remove * step] ?? 0;
        count--;
      }
    }
  }
}
