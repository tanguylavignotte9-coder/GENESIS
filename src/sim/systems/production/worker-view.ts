/**
 * What the production system may read about people (owned by the individuals system). Production
 * never writes into people: it answers their requests and changes only its own data (objects,
 * stocks, buildings, jobs).
 */
export interface WorkerView {
  readonly count: number;
  alive(person: number): boolean;
  camp(person: number): number;
  /** Tile under the person's feet. */
  x(person: number): number;
  y(person: number): number;
  /** Free position of the person (decimal tiles). */
  px(person: number): number;
  py(person: number): number;
  /** Bit field of the knowledge the person has. */
  knowledge(person: number): number;
  /** Skill level 0..1 (index in the humans' skill list). */
  skill(person: number, skill: number): number;
  ageYears(person: number): number;
  /** Strength of the body (1 = an adult in their prime): physical work goes slower when it is low. */
  vigor(person: number): number;
  name(person: number): string;
  female(person: number): boolean;
  /** Spouse, parents and children (living or not). */
  family(person: number): number[];
}
