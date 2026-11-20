import { describe, expect, it } from 'vitest';
import { labelLandmasses } from '../../../src/sim/systems/world/landmasses';
import { describeGeography, directionOf, nameLandmasses, ofPlace } from '../../../src/sim/systems/world/places';

describe('place names', () => {
  it('finds compass directions (y grows toward the south)', () => {
    expect(directionOf(0, -1)).toBe('nord');
    expect(directionOf(0, 1)).toBe('sud');
    expect(directionOf(1, 0)).toBe('est');
    expect(directionOf(-1, 1)).toBe('sud-ouest');
    expect(directionOf(0.1, 0.1)).toBeNull();
  });

  it('applies French contractions', () => {
    expect(ofPlace('le grand continent')).toBe('du grand continent');
    expect(ofPlace("l'ouest")).toBe("de l'ouest");
    expect(ofPlace('une île du nord')).toBe("d'une île du nord");
  });

  it('describes where a tile lies on its landmass', () => {
    // 40×40 map: a big continent on the left, a smaller one on the right, a tiny island.
    const size = 40;
    const ocean = new Uint8Array(size * size).fill(1);
    const land = (x0: number, x1: number, y0: number, y1: number): void => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ocean[y * size + x] = 0;
    };
    land(2, 18, 2, 37);
    land(24, 36, 10, 30);
    land(38, 38, 2, 2);
    const map = labelLandmasses(ocean, size, 0.1);
    const names = nameLandmasses(map, size);
    expect(names[0]).toBe('le grand continent');
    expect(names[1]).toBe("le continent de l'est");
    expect(names[2]).toBe('une île du nord-est');
    expect(describeGeography(map, names, 10, 35, size)).toBe('le sud du grand continent');
    expect(describeGeography(map, names, 10, 20, size)).toBe('le centre du grand continent');
    expect(describeGeography(map, names, 35, 20, size)).toBe("l'est du continent de l'est");
    expect(describeGeography(map, names, 38, 2, size)).toBe('une île du nord-est');
    expect(describeGeography(map, names, 21, 20, size)).toBe('la haute mer');
  });
});
