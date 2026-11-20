const INITIAL_CAPACITY = 256;

/** Herds, packs and families: who leads, how many, and where the herd migrates. */
export class GroupStore {
  count = 0;
  leader = new Int32Array(INITIAL_CAPACITY);
  species = new Uint8Array(INITIAL_CAPACITY);
  size = new Int32Array(INITIAL_CAPACITY);
  adultMales = new Int32Array(INITIAL_CAPACITY);
  migrating = new Uint8Array(INITIAL_CAPACITY);
  migrateX = new Int16Array(INITIAL_CAPACITY);
  migrateY = new Int16Array(INITIAL_CAPACITY);
  migrationDaysLeft = new Int16Array(INITIAL_CAPACITY);
  /** 1 while the herd is in its winter quarters (it will come back in spring). */
  away = new Uint8Array(INITIAL_CAPACITY);
  /** Territorial species: the den the pack holds (tile coordinates; -1 = none yet). */
  denX = new Int16Array(INITIAL_CAPACITY).fill(-1);
  denY = new Int16Array(INITIAL_CAPACITY).fill(-1);
  /** 1 when a stronger pack holds the place: the pack yields and does not raise young there. */
  contested = new Uint8Array(INITIAL_CAPACITY);

  add(species: number, leader: number): number {
    if (this.count === this.leader.length) this.grow(this.count * 2);
    const id = this.count++;
    this.species[id] = species;
    this.leader[id] = leader;
    this.size[id] = 0;
    this.adultMales[id] = 0;
    this.migrating[id] = 0;
    this.away[id] = 0;
    this.denX[id] = -1;
    this.denY[id] = -1;
    this.contested[id] = 0;
    return id;
  }

  private grow(capacity: number): void {
    const resize = <T extends Int32Array | Uint8Array | Int16Array>(old: T, next: T): T => {
      next.set(old);
      return next;
    };
    this.leader = resize(this.leader, new Int32Array(capacity));
    this.species = resize(this.species, new Uint8Array(capacity));
    this.size = resize(this.size, new Int32Array(capacity));
    this.adultMales = resize(this.adultMales, new Int32Array(capacity));
    this.migrating = resize(this.migrating, new Uint8Array(capacity));
    this.migrateX = resize(this.migrateX, new Int16Array(capacity));
    this.migrateY = resize(this.migrateY, new Int16Array(capacity));
    this.migrationDaysLeft = resize(this.migrationDaysLeft, new Int16Array(capacity));
    this.away = resize(this.away, new Uint8Array(capacity));
    this.denX = resize(this.denX, new Int16Array(capacity).fill(-1));
    this.denY = resize(this.denY, new Int16Array(capacity).fill(-1));
    this.contested = resize(this.contested, new Uint8Array(capacity));
  }
}
