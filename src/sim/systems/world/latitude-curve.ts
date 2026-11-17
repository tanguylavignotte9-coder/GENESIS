/** A value that varies with latitude (0 = equator, 1 = pole), given as points and linearly interpolated. */
export interface LatitudePoint {
  latitude: number;
  value: number;
}

export function valueAtLatitude(points: readonly LatitudePoint[], latitude: number): number {
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1];
    const b = points[k];
    if (a && b && latitude <= b.latitude) {
      const t = (latitude - a.latitude) / Math.max(b.latitude - a.latitude, Number.EPSILON);
      return a.value + t * (b.value - a.value);
    }
  }
  return points.at(-1)?.value ?? 0;
}

/** Latitudes must increase from 0 to 1. Returns a French problem description, or null. */
export function latitudeCurveProblem(points: readonly LatitudePoint[], key: string): string | null {
  const latitudes = points.map((point) => point.latitude);
  const increasing = latitudes.every((value, index) => index === 0 || value > (latitudes[index - 1] ?? value));
  if (increasing && latitudes[0] === 0 && latitudes.at(-1) === 1) return null;
  return `« ${key} » : les latitudes doivent être croissantes, de 0 à 1.`;
}
