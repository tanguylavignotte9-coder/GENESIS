/** Typed messages exchanged between the display (renderer) and the simulation worker. */

/** Display -> simulation. */
export type ToSimMessage = { type: 'start'; seed: number };

/** Simulation -> display. */
export type FromSimMessage =
  | { type: 'status'; seed: number; tick: number }
  | { type: 'error'; message: string };
