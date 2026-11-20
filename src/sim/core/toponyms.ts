/**
 * Names that peoples gave to the places they lived in (rivers, mountains, regions, islands), in
 * their own language. A shared register of the world, like the journal: the ideas system names a
 * place when a tribe settles near it, every system reads the names to tell where things happen.
 */
export interface PlaceName {
  name: string;
  /** Language (idea id) the name comes from, day it was given, tribe (group id) that gave it. */
  language: number;
  day: number;
  tribe: number;
}

export class Toponyms {
  /** Key of a place ("r:3:5" region, "m:3:5" mountains, "v:12345" river, "i:7" island) → its name. */
  readonly names = new Map<string, PlaceName>();

  get(key: string): PlaceName | undefined {
    return this.names.get(key);
  }

  has(key: string): boolean {
    return this.names.has(key);
  }

  /** Gives a name to a place that has none (the first people to live there name it). */
  give(key: string, name: PlaceName): void {
    if (!this.names.has(key)) this.names.set(key, name);
  }
}
