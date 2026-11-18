import type { Rng } from '../../core/rng';
import type { HumanParams } from './params';

/**
 * Provisional names made of random syllables ("Kalomi", "Tuna"). Real languages come later.
 * Names are unique within a world.
 */
export class NameGenerator {
  private readonly used = new Set<string>();

  constructor(
    private readonly params: HumanParams['names'],
    private readonly rng: Rng,
  ) {}

  next(): string {
    for (;;) {
      const count = this.rng.nextIntInclusive(this.params.minSyllables, this.params.maxSyllables);
      let name = '';
      for (let k = 0; k < count; k++) name += this.params.syllables[this.rng.nextIntInclusive(0, this.params.syllables.length - 1)]!;
      name = name.charAt(0).toUpperCase() + name.slice(1);
      if (this.used.has(name)) {
        // Rare collision: add one more syllable rather than looping forever on short names.
        name += this.params.syllables[this.rng.nextIntInclusive(0, this.params.syllables.length - 1)]!;
        if (this.used.has(name)) continue;
      }
      this.used.add(name);
      return name;
    }
  }
}
