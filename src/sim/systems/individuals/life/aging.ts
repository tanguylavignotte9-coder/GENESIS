import type { AgeCurve, LifeParams } from './params';

const FULL = 100;

/**
 * Strength of the body (1 = an adult in their prime): it grows through childhood and declines
 * with age, down to a floor. Speed, endurance and physical work follow it.
 */
export function vigorAt(params: LifeParams, age: number): number {
  const { aging, stages } = params;
  if (age < stages.adultAge) return aging.childVigor + (1 - aging.childVigor) * Math.max(0, Math.min(1, age / stages.adultAge));
  if (age <= aging.declineFromAge) return 1;
  return Math.max(aging.minVigor, 1 - aging.declinePerYear * (age - aging.declineFromAge));
}

/** Share of an adult's food a body needs at this age: a child eats less, and so does a frail old body. */
export function appetiteAt(params: LifeParams, age: number): number {
  const { aging, stages } = params;
  if (age < stages.adultAge) return aging.childAppetite + (1 - aging.childAppetite) * Math.max(0, Math.min(1, age / stages.adultAge));
  return 1 - aging.elderAppetite * (1 - vigorAt(params, age));
}

/** 0..1 along a fertility curve [starts, full from, declines from, ends]. */
export function fertilityAt(curve: AgeCurve, age: number): number {
  const [start, full, decline, end] = curve;
  if (age < start || age >= end) return 0;
  if (age < full) return full > start ? (age - start) / (full - start) : 1;
  if (age <= decline) return 1;
  return end > decline ? (end - age) / (end - decline) : 0;
}

/**
 * Chance of dying of old age today (Gompertz law: it doubles every `doublingYears`), higher when the
 * body is already weak.
 */
export function oldAgeDeathPerDay(params: LifeParams, age: number, health: number, daysPerYear: number): number {
  const rules = params.oldAge;
  if (age < rules.fromAge) return 0;
  const perYear = Math.min(1, rules.deathPerYearAtReference * Math.pow(2, (age - rules.referenceAge) / rules.doublingYears));
  const frailty = 1 + rules.frailtyEffect * (1 - Math.max(0, Math.min(FULL, health)) / FULL);
  return Math.min(1, 1 - Math.pow(1 - Math.min(0.999, perYear), 1 / daysPerYear)) * frailty;
}

/** How hard diseases strike at this age (interpolated between the points of the data). */
export function vulnerabilityAt(params: LifeParams, age: number): number {
  const points = params.ageVulnerability;
  const first = points[0]!;
  if (age <= first[0]) return first[1];
  for (let k = 1; k < points.length; k++) {
    const [a, va] = points[k - 1]!;
    const [b, vb] = points[k]!;
    if (age <= b) return b > a ? va + ((vb - va) * (age - a)) / (b - a) : vb;
  }
  return points[points.length - 1]![1];
}

/** Chance over a day from a chance per year. */
export function perDay(perYear: number, daysPerYear: number): number {
  return 1 - Math.pow(1 - Math.max(0, Math.min(0.999999, perYear)), 1 / daysPerYear);
}
