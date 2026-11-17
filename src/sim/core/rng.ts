/**
 * Seeded pseudo-random number generator (sfc32, seeded through splitmix32).
 *
 * This is the ONLY source of randomness allowed in the simulation:
 * same seed => same sequence, on every machine.
 */

const UINT32_RANGE = 4294967296; // 2^32
const WARM_UP_DRAWS = 12; // discard first outputs so close seeds diverge quickly

export function isValidSeed(seed: number): boolean {
  return Number.isInteger(seed) && seed >= 0 && seed < UINT32_RANGE;
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    if (!isValidSeed(seed)) {
      throw new RangeError(`Graine invalide : ${seed} (entier attendu entre 0 et ${UINT32_RANGE - 1}).`);
    }
    const expand = splitmix32(seed);
    this.a = expand();
    this.b = expand();
    this.c = expand();
    this.d = expand();
    for (let i = 0; i < WARM_UP_DRAWS; i++) this.nextUint32();
  }

  /** Next integer in [0, 2^32). */
  nextUint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Next float in [0, 1). */
  nextFloat(): number {
    return this.nextUint32() / UINT32_RANGE;
  }
}

/** Expands a 32-bit seed into a stream of well-mixed 32-bit values. */
function splitmix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) | 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}
