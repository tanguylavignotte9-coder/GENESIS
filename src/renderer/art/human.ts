import type { Texture } from 'pixi.js';
import type { Rgb } from '../color';
import { PixelCanvas } from './pixel-canvas';

const SKINS: Rgb[] = [[235, 196, 160], [201, 150, 110], [160, 110, 75], [110, 74, 50]];
const HAIRS: Rgb[] = [[40, 30, 25], [95, 60, 35], [150, 110, 60], [30, 25, 25]];
const CLOTHES: Rgb[] = [[120, 85, 55], [140, 105, 70], [95, 70, 50], [150, 120, 85]];
const SHADE = 0.75;

export interface HumanLook {
  female: boolean;
  /** Any integer: picks skin, hair and clothes. */
  variant: number;
  asleep: boolean;
}

/** Width of a standing adult, in map tiles (children are drawn smaller). */
export const HUMAN_TILES = 0.55;
export const CHILD_SCALE = 0.7;

/** Procedural pixel-art human: standing (6×10) or lying asleep (10×6). */
export function drawHuman(look: HumanLook): Texture {
  const skin = SKINS[look.variant % SKINS.length]!;
  const hair = HAIRS[Math.floor(look.variant / SKINS.length) % HAIRS.length]!;
  const cloth = CLOTHES[Math.floor(look.variant / (SKINS.length * HAIRS.length)) % CLOTHES.length]!;
  if (look.asleep) return lying(skin, hair, cloth, look.female);
  const canvas = new PixelCanvas(6, 10);
  for (let x = 1; x < 5; x++) canvas.set(x, 0, hair);
  for (let y = 1; y < 3; y++) for (let x = 1; x < 5; x++) canvas.set(x, y, skin, x === 4 ? 0.9 : 1);
  if (look.female) for (let y = 1; y < 5; y++) canvas.set(0, y, hair), canvas.set(5, y, hair, SHADE);
  else canvas.set(1, 1, hair);
  for (let y = 3; y < 7; y++) for (let x = 1; x < 5; x++) canvas.set(x, y, cloth, x === 4 ? SHADE : 1);
  canvas.set(0, 4, skin, 0.9);
  canvas.set(5, 4, skin, SHADE);
  for (let y = 7; y < 10; y++) {
    canvas.set(1, y, skin, 0.85);
    canvas.set(3, y, skin, SHADE);
    if (look.female && y === 7) canvas.set(2, y, cloth);
  }
  return canvas.toTexture();
}

function lying(skin: Rgb, hair: Rgb, cloth: Rgb, female: boolean): Texture {
  const canvas = new PixelCanvas(10, 6);
  // A sleeper under a hide blanket, head on the left.
  for (let y = 2; y < 5; y++) canvas.set(0, y, hair);
  for (let y = 2; y < 5; y++) canvas.set(1, y, skin);
  if (female) canvas.set(0, 5, hair);
  for (let y = 2; y < 6; y++) for (let x = 2; x < 10; x++) canvas.set(x, y, cloth, y === 2 ? 1.1 : y === 5 ? SHADE : 1);
  return canvas.toTexture();
}
