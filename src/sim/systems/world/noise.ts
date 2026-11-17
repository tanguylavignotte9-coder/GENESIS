import type { Rng } from '../../core/rng';

/**
 * Seeded 2D gradient noise (Perlin style) and fractal sums.
 * Uses only + - * and floor, so results are identical on every machine.
 */

const TABLE_SIZE = 256;
const TABLE_MASK = TABLE_SIZE - 1;
const DIAGONAL = Math.SQRT1_2;
const GRADIENTS_X = [1, -1, 0, 0, DIAGONAL, -DIAGONAL, DIAGONAL, -DIAGONAL];
const GRADIENTS_Y = [0, 0, 1, -1, DIAGONAL, DIAGONAL, -DIAGONAL, -DIAGONAL];
const GRADIENT_MASK = 7;
/** Brings the theoretical output range (about ±0.71) to about ±1. */
const OUTPUT_SCALE = Math.SQRT2;
const LACUNARITY = 2;
const GAIN = 0.5;

export class Noise2D {
  private readonly perm = new Uint8Array(TABLE_SIZE * 2);

  constructor(rng: Rng) {
    const table = new Uint8Array(TABLE_SIZE);
    for (let i = 0; i < TABLE_SIZE; i++) table[i] = i;
    for (let i = TABLE_SIZE - 1; i > 0; i--) {
      const j = rng.nextUint32() % (i + 1);
      const tmp = table[i] ?? 0;
      table[i] = table[j] ?? 0;
      table[j] = tmp;
    }
    for (let i = 0; i < TABLE_SIZE * 2; i++) this.perm[i] = table[i & TABLE_MASK] ?? 0;
  }

  /** Noise value at (x, y), roughly in [-1, 1]. */
  sample(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & TABLE_MASK;
    const Y = yi & TABLE_MASK;
    const u = fade(xf);
    const v = fade(yf);
    const n00 = this.dot(X, Y, xf, yf);
    const n10 = this.dot(X + 1, Y, xf - 1, yf);
    const n01 = this.dot(X, Y + 1, xf, yf - 1);
    const n11 = this.dot(X + 1, Y + 1, xf - 1, yf - 1);
    const nx0 = n00 + u * (n10 - n00);
    const nx1 = n01 + u * (n11 - n01);
    return (nx0 + v * (nx1 - nx0)) * OUTPUT_SCALE;
  }

  /** Fractal sum of `octaves` layers, normalized to roughly [-1, 1]. */
  fbm(x: number, y: number, octaves: number): number {
    let sum = 0;
    let amplitude = 1;
    let frequency = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amplitude * this.sample(x * frequency, y * frequency);
      norm += amplitude;
      amplitude *= GAIN;
      frequency *= LACUNARITY;
    }
    return sum / norm;
  }

  /** Ridged fractal noise in [0, 1]: sharp crests, good for mountain chains. */
  ridged(x: number, y: number, octaves: number): number {
    let sum = 0;
    let amplitude = 1;
    let frequency = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      const ridge = 1 - Math.abs(this.sample(x * frequency, y * frequency));
      sum += amplitude * ridge * ridge;
      norm += amplitude;
      amplitude *= GAIN;
      frequency *= LACUNARITY;
    }
    return sum / norm;
  }

  private dot(ix: number, iy: number, dx: number, dy: number): number {
    const g = (this.perm[(this.perm[ix] ?? 0) + iy] ?? 0) & GRADIENT_MASK;
    return (GRADIENTS_X[g] ?? 0) * dx + (GRADIENTS_Y[g] ?? 0) * dy;
  }
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
