import type { Texture } from 'pixi.js';
import type { AnimalSpecies } from '../../sim/systems/fauna/params';
import { color, PixelCanvas } from './pixel-canvas';

const DARK = 0.65;
const LIGHT = 1.15;

/**
 * Procedural pixel-art animal seen from the side, facing right. Hunters get pointed ears,
 * small species a rounder body. `tiles` is the sprite width in map tiles.
 */
export function drawAnimal(species: AnimalSpecies): { texture: Texture; tiles: number } {
  const body = color(species.color);
  const hunter = species.prey.length > 0;
  const small = species.size <= 2;
  const canvas = new PixelCanvas(10, 7);
  if (small) {
    for (let y = 3; y < 6; y++) for (let x = 2; x < 7; x++) canvas.set(x, y, body, y === 3 ? LIGHT : 1);
    canvas.set(7, 3, body, 1);
    canvas.set(7, 2, body, LIGHT);
    canvas.set(7, 1, body, LIGHT);
    canvas.set(8, 3, body, DARK);
    canvas.set(3, 6, body, DARK);
    canvas.set(6, 6, body, DARK);
    canvas.set(1, 4, [240, 240, 235]);
  } else {
    for (let y = 2; y < 5; y++) for (let x = 1; x < 8; x++) canvas.set(x, y, body, y === 2 ? LIGHT : y === 4 ? 0.9 : 1);
    for (const x of [1, 2, 6, 7]) for (let y = 5; y < 7; y++) canvas.set(x, y, body, DARK);
    canvas.set(8, 1, body, 1);
    canvas.set(9, 1, body, 1);
    canvas.set(8, 2, body, 1);
    canvas.set(9, 2, body, DARK);
    canvas.set(0, 2, body, DARK);
    if (hunter) {
      canvas.set(8, 0, body, LIGHT);
      canvas.set(0, 3, body, DARK);
    } else {
      canvas.set(8, 0, body, DARK);
    }
  }
  return { texture: canvas.toTexture(), tiles: 0.32 * species.size };
}
