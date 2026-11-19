/** Plants and grass, one value per tile in compact typed arrays (at most one plant per tile). */
export class FloraState {
  /** 0 = no plant, k + 1 = species k. */
  readonly species: Uint8Array;
  readonly ageDays: Uint16Array;
  /** Size, 0..255 (255 = fully grown). */
  readonly growth: Uint8Array;
  /** 0..255 */
  readonly health: Uint8Array;
  /** Part of this season's produce (berries…) already eaten or picked, in 1/EATEN_SCALE units (a bite counts what it is). */
  readonly eaten: Uint16Array;
  /** Grass cover of the ground (not individuals): amount that grows and gets grazed. */
  readonly grass: Uint8Array;

  constructor(tileCount: number) {
    this.species = new Uint8Array(tileCount);
    this.ageDays = new Uint16Array(tileCount);
    this.growth = new Uint8Array(tileCount);
    this.health = new Uint8Array(tileCount);
    this.eaten = new Uint16Array(tileCount);
    this.grass = new Uint8Array(tileCount);
  }

  clear(index: number): void {
    this.species[index] = 0;
    this.ageDays[index] = 0;
    this.growth[index] = 0;
    this.health[index] = 0;
    this.eaten[index] = 0;
  }
}

export const BYTE_MAX = 255;
/** Fixed point of `eaten` (hundredths of a unit; technical). */
export const EATEN_SCALE = 100;
const EATEN_MAX = 65535;

/** Marks `units` more as taken from a tile (never beyond what the array can hold). */
export function addEaten(state: FloraState, index: number, units: number): void {
  state.eaten[index] = Math.min(EATEN_MAX, state.eaten[index]! + Math.round(units * EATEN_SCALE));
}
export const AGE_MAX_DAYS = 65535;
