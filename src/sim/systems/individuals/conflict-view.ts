/**
 * What the individuals read of the conflict system (step 11): whether one is called to a war party
 * or sent as an emissary, and where that mission takes one now. The conflict system implements it
 * and attaches itself to the individuals system.
 */
export interface ConflictView {
  /** How strongly the person answers a call to arms now (0..1; 0 when not called, or once deserted). */
  warCall(person: number): number;
  /** An emissary's errand (0..1). */
  envoyCall(person: number): number;
  /** Tile the person's mission takes them to now (-1: none): the gathering place, the enemy camp, home. */
  missionTarget(person: number): number;
}
