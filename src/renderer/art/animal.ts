import type { Texture } from 'pixi.js';
import type { AnimalSpecies } from '../../sim/systems/fauna/params';
import { color, PixelCanvas } from './pixel-canvas';

const DARK = 0.65;
const LIGHT = 1.15;

/** Frames of an animal: standing, then the walking strides. */
export interface AnimalArt {
  frames: Texture[];
  /** Sprite width in map tiles. */
  tiles: number;
}

export const ANIMAL_FRAMES = 3;

const COLLAR: [number, number, number] = [196, 42, 36];
const PATCH: [number, number, number] = [236, 230, 218];

/**
 * Every frame of an animal (standing, two strides). A domestic animal (a herd's ox, goat, dog…) wears
 * a red collar and a pied coat with pale patches, so that it is told apart from wild ones at a glance.
 */
export function drawAnimal(species: AnimalSpecies, domestic = false): AnimalArt {
  const frames: Texture[] = [];
  for (let stride = 0; stride < ANIMAL_FRAMES; stride++) frames.push(drawAnimalFrame(species, stride, domestic));
  return { frames, tiles: 0.32 * species.size };
}

/**
 * Procedural pixel-art animal seen from the side, facing right. Hunters get pointed ears,
 * small species a rounder body. `stride` 0 = standing, 1 and 2 = legs moving.
 */
function drawAnimalFrame(species: AnimalSpecies, stride: number, domestic: boolean): Texture {
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
    // A small animal hops: hind and fore paws apart, then together.
    canvas.set(stride === 1 ? 2 : stride === 2 ? 4 : 3, 6, body, DARK);
    canvas.set(stride === 1 ? 7 : stride === 2 ? 5 : 6, 6, body, DARK);
    canvas.set(1, 4, [240, 240, 235]);
  } else {
    for (let y = 2; y < 5; y++) for (let x = 1; x < 8; x++) canvas.set(x, y, body, y === 2 ? LIGHT : y === 4 ? 0.9 : 1);
    for (const x of [1, 2, 6, 7]) canvas.set(x, 5, body, DARK);
    // Hooves: straight when standing, diagonal pairs forward and back when walking.
    const hooves = stride === 1 ? [0, 2, 6, 8] : stride === 2 ? [1, 3, 5, 7] : [1, 2, 6, 7];
    for (const x of hooves) canvas.set(x, 6, body, DARK);
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
    if (domestic) {
      for (const [x, y] of [[2, 3], [3, 3], [3, 4], [5, 2], [6, 3]] as const) canvas.set(x, y, PATCH);
      canvas.set(7, 2, COLLAR);
      canvas.set(7, 1, COLLAR, 1.1);
    }
  }
  if (small && domestic) {
    canvas.set(6, 3, COLLAR);
    canvas.set(4, 4, PATCH);
  }
  return canvas.toTexture();
}
