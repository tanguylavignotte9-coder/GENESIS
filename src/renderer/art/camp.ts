import type { Texture } from 'pixi.js';
import type { Rgb } from '../color';
import { PixelCanvas } from './pixel-canvas';

const STONE: Rgb = [120, 116, 108];
const LOG: Rgb = [92, 60, 34];
const FLAME: Rgb = [250, 170, 40];
const FLAME_CORE: Rgb = [255, 235, 120];
const ASH: Rgb = [80, 76, 72];
const THATCH: Rgb = [150, 120, 70];
const DOOR: Rgb = [45, 32, 22];

/** Sizes in map tiles. */
export const FIRE_TILES = 0.9;
export const HUT_TILES = 1.5;

/** Campfire: a ring of stones with logs, flames if lit, grey ashes otherwise. */
export function drawFire(lit: boolean): Texture {
  const canvas = new PixelCanvas(9, 9);
  for (const [x, y] of [[1, 6], [2, 7], [4, 8], [6, 7], [7, 6], [1, 5], [7, 5]] as const) canvas.set(x, y, STONE, 1);
  for (let x = 2; x < 7; x++) canvas.set(x, 6, LOG, x % 2 === 0 ? 1 : 0.8);
  if (!lit) {
    for (let x = 3; x < 6; x++) canvas.set(x, 5, ASH);
    return canvas.toTexture();
  }
  for (let y = 1; y < 6; y++) {
    const half = Math.floor((y + 1) / 2);
    for (let x = 4 - half; x <= 4 + half; x++) canvas.set(x, y, Math.abs(x - 4) < half - 0 && y > 2 ? FLAME_CORE : FLAME);
  }
  return canvas.toTexture();
}

/** Hut of branches and foliage: a cone with a dark doorway. */
export function drawHut(): Texture {
  const canvas = new PixelCanvas(12, 11);
  for (let y = 0; y < 11; y++) {
    const half = Math.floor(y / 2) + 1;
    for (let x = 6 - half; x < 6 + half; x++) canvas.set(x, y, THATCH, x < 6 ? 1.1 : 0.8 + ((x + y) % 3 === 0 ? -0.1 : 0));
  }
  for (let y = 7; y < 11; y++) for (let x = 5; x < 7; x++) canvas.set(x, y, DOOR);
  return canvas.toTexture();
}
