import type { Texture } from 'pixi.js';
import type { PlantSpecies } from '../../sim/systems/flora/params';
import { tileHash, type Rgb } from '../color';
import { color, PixelCanvas } from './pixel-canvas';

const TRUNK: Rgb = [92, 62, 38];
/** Light comes from the north-west: lit and shadowed sides. */
const LIGHT = 1.18;
const SHADOW = 0.72;

/** Procedural pixel-art texture of a plant species (one per species, drawn once). */
export function drawPlant(species: PlantSpecies, seed: number): { texture: Texture; tiles: number } {
  const leaf = color(species.color);
  const accent = species.accentColor ? color(species.accentColor) : null;
  switch (species.shape) {
    case 'round':
      return { texture: roundTree(leaf, accent ?? TRUNK, seed), tiles: 1.5 };
    case 'conifer':
      return { texture: conifer(leaf, seed), tiles: 1.5 };
    case 'umbrella':
      return { texture: umbrellaTree(leaf, seed), tiles: 1.6 };
    case 'bush':
      return { texture: bush(leaf, accent, seed), tiles: 0.9 };
    case 'grass':
      return { texture: stalks(leaf, accent, seed), tiles: 0.7 };
  }
}

/** Shade of a canopy pixel: lit toward the top-left, dark toward the bottom-right, with a dither. */
function canopyShade(dx: number, dy: number, radius: number, x: number, y: number, seed: number): number {
  const side = (-dx - dy) / (2 * radius);
  const noise = (tileHash(x, y, seed) - 0.5) * 0.18;
  return Math.max(SHADOW, Math.min(LIGHT, 1 + side * 0.35 + noise));
}

function roundTree(leaf: Rgb, trunk: Rgb, seed: number): Texture {
  const canvas = new PixelCanvas(12, 15);
  for (let y = 10; y < 15; y++) for (let x = 5; x < 7; x++) canvas.set(x, y, trunk, x === 5 ? 1.1 : 0.8);
  const cx = 5.5;
  const cy = 5.5;
  const r = 5.6;
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const bump = (tileHash(x, y, seed + 7) - 0.5) * 1.2;
      if (dx * dx + dy * dy <= (r + bump) * (r + bump)) canvas.set(x, y, leaf, canopyShade(dx, dy, r, x, y, seed));
    }
  }
  return canvas.toTexture();
}

function conifer(leaf: Rgb, seed: number): Texture {
  const canvas = new PixelCanvas(11, 15);
  for (let y = 12; y < 15; y++) canvas.set(5, y, TRUNK, 0.9);
  for (let y = 0; y < 13; y++) {
    const tier = y % 4;
    const half = Math.min(5, Math.floor(y / 2.4) + tier * 0.5);
    for (let x = Math.round(5 - half); x <= Math.round(5 + half); x++) {
      canvas.set(x, y, leaf, canopyShade(x - 5, y - 6, 6, x, y, seed));
    }
  }
  return canvas.toTexture();
}

function umbrellaTree(leaf: Rgb, seed: number): Texture {
  const canvas = new PixelCanvas(14, 13);
  for (let y = 5; y < 13; y++) canvas.set(7 - (y < 8 ? 1 : 0), y, TRUNK, 0.9);
  for (let y = 0; y < 5; y++) {
    const half = 7 - Math.abs(y - 1.5) * 1.3;
    for (let x = Math.round(7 - half); x < Math.round(7 + half); x++) canvas.set(x, y, leaf, canopyShade(x - 7, y - 2, 6, x, y, seed));
  }
  return canvas.toTexture();
}

function bush(leaf: Rgb, accent: Rgb | null, seed: number): Texture {
  const canvas = new PixelCanvas(9, 7);
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 9; x++) {
      const dx = (x - 4) / 4.4;
      const dy = (y - 4) / 3.4;
      if (dx * dx + dy * dy <= 1) canvas.set(x, y, leaf, canopyShade(x - 4, y - 4, 4, x, y, seed));
    }
  }
  if (accent) {
    for (const [x, y] of [[2, 3], [5, 2], [6, 4], [3, 5]] as const) if (canvas.isSet(x, y)) canvas.set(x, y, accent);
  }
  return canvas.toTexture();
}

function stalks(leaf: Rgb, accent: Rgb | null, seed: number): Texture {
  const canvas = new PixelCanvas(7, 7);
  for (const x of [1, 3, 5]) {
    const top = 1 + Math.floor(tileHash(x, 0, seed) * 3);
    for (let y = top; y < 7; y++) canvas.set(x + (y < 3 && x !== 3 ? (x < 3 ? -1 : 1) : 0), y, leaf, y < 4 ? 1.1 : 0.85);
    if (accent) canvas.set(x + (x !== 3 ? (x < 3 ? -1 : 1) : 0), top, accent);
  }
  return canvas.toTexture();
}
