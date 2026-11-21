import type { Rng } from '../../../core/rng';
import type { LifeCycle } from './life-cycle';
import type { LifeParams } from './params';

const FULL = 100;

/**
 * Individual strength (design, "Le combat"): every person is born with their own build, partly
 * from their parents, and their strength now follows age, health and training (physical work,
 * hunting, fighting). Women are a little less strong on average, with a wide overlap: the spread
 * between people is larger than the gap between the sexes.
 */

/** A bell-shaped draw (sum of three uniforms), mean 0, standard deviation 1. */
function bell(rng: Rng): number {
  return (rng.nextFloat() + rng.nextFloat() + rng.nextFloat() - 1.5) / 0.5;
}

/** Build of a newborn (1 = average), from the parents' builds (-1 = unknown) and its own share. */
export function inheritedBuild(params: LifeParams, rng: Rng, mother: number, father: number): number {
  const s = params.strength;
  const known = [mother, father].filter((b) => b > 0);
  const parents = known.length > 0 ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const own = 1 + s.spread * bell(rng);
  return clampBuild(params, s.heritability * parents + (1 - s.heritability) * own);
}

/** Build of a member of the starting tribe (no known parents). */
export function startingBuild(params: LifeParams, rng: Rng): number {
  return clampBuild(params, 1 + params.strength.spread * bell(rng));
}

function clampBuild(params: LifeParams, value: number): number {
  return Math.max(params.strength.minBuild, Math.min(params.strength.maxBuild, value));
}

/** Factor of the sexes on the build (adjustable gap, 0 = none). */
export function sexFactor(params: LifeParams, female: boolean): number {
  return female ? 1 - params.strength.femaleGap : 1;
}

/**
 * Strength now (1 = an average man in his prime, untrained): build, sex, training, then the
 * body's vigour (age, disease, pregnancy, crippling) and health.
 */
export function strengthNow(life: LifeCycle, person: number): number {
  const { people, params, state } = life;
  const s = params.strength;
  const health = 1 - s.healthEffect * (1 - people.health[person]! / FULL);
  const trained = 1 + s.trainingEffect * (state.training[person]! - s.restTraining);
  return state.build[person]! * sexFactor(params, people.female[person] === 1) * trained * life.vigor(person) * health;
}

/** Hours of effort (`weight`: 1 for physical work, more for a fight) build up training, slower near the top. */
export function train(life: LifeCycle, person: number, hours: number, weight: number): void {
  const { state, params } = life;
  const level = state.training[person]!;
  state.training[person] = Math.min(1, level + params.strength.trainingPerHour * hours * weight * (1 - level));
}

/** Once a day, training fades a little without effort (down to the level of everyday life). */
export function restTraining(life: LifeCycle, person: number): void {
  const { state, params } = life;
  const s = params.strength;
  const level = state.training[person]!;
  if (level > s.restTraining) state.training[person] = Math.max(s.restTraining, level - s.fadePerDay);
}

/** Whether a skill is physical work (it trains the body). */
export function isPhysical(params: LifeParams, skillId: string): boolean {
  return params.strength.physicalSkills.includes(skillId);
}
