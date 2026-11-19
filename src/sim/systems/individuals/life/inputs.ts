/** Inputs the brain gets from the life cycle (all 0..1), appended after the social inputs. */
export const LIFE_INPUTS = [
  /** A small child carried by its mother or guardian. */
  'infant',
  /** A child who walks on its own (not yet an adult). */
  'child',
  /** Young enough to play. */
  'young',
  /** How far a child is from its guardian. */
  'guardianAway',
  /** Other children nearby to play with. */
  'playmates',
  /** Ill with a disease. */
  'sick',
] as const;
