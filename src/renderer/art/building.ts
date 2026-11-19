import type { Texture } from 'pixi.js';
import type { Rgb } from '../color';
import { PixelCanvas } from './pixel-canvas';

/**
 * Procedural pixel art of every building type, of construction sites and of the camp's open heap.
 * The only place where buildings are drawn: replacing it by real sprites touches nothing else.
 */

const STONE: Rgb = [120, 116, 108];
const LOG: Rgb = [92, 60, 34];
const FLAME: Rgb = [250, 170, 40];
const FLAME_CORE: Rgb = [255, 235, 120];
const ASH: Rgb = [80, 76, 72];
const THATCH: Rgb = [150, 120, 70];
const DOOR: Rgb = [45, 32, 22];
const HIDE: Rgb = [176, 132, 90];
const CLAY: Rgb = [170, 100, 70];
const MUD: Rgb = [150, 118, 82];
const SOIL: Rgb = [110, 80, 52];
const SPROUT: Rgb = [110, 160, 70];
const RIPE: Rgb = [214, 182, 90];
const WATER: Rgb = [70, 120, 190];
const GOODS: Rgb[] = [[190, 60, 70], [160, 120, 60], [120, 140, 70], [200, 170, 110]];

export interface BuildingLook {
  /** Building id of data/buildings.json ("hut"…). */
  id: string;
  /** Its function, for the types without a drawing of their own. */
  function: string;
  lit: boolean;
  /** Field: 0 fallow, 1 growing, 2 ripe. */
  crop: number;
  /** Storage: 0..1 of its room in use. */
  fill: number;
}

/** Size of each drawing, in map tiles (width). */
export function buildingTiles(look: BuildingLook): number {
  switch (look.id) {
    case 'campfire':
      return 0.9;
    case 'field':
    case 'pen':
      return 1;
    case 'lean_to':
      return 1.2;
    case 'earth_house':
    case 'granary':
      return 1.7;
    default:
      return 1.5;
  }
}

/** The finished building. */
export function drawBuilding(look: BuildingLook): Texture {
  switch (look.id) {
    case 'campfire':
      return fire(look.lit);
    case 'hut':
      return cone(THATCH, true);
    case 'hide_tent':
      return cone(HIDE, false);
    case 'lean_to':
      return leanTo();
    case 'storage_cache':
      return cache(look.fill);
    case 'field':
      return field(look.crop);
    case 'pen':
      return fence(LOG);
    case 'granary':
      return granary(look.fill);
    case 'earth_house':
      return house(MUD);
    case 'kiln':
    case 'bread_oven':
      return dome(look.id === 'kiln' ? CLAY : STONE);
    case 'irrigation_canal':
      return canal();
    case 'stone_wall':
      return fence(STONE);
    case 'palisade':
      return fence(LOG);
    case 'megalithic_tomb':
      return dolmen();
    default:
      return look.function === 'workshop' ? shed() : house(THATCH);
  }
}

/** A construction site: stakes in the ground and a pile of materials (the progress bar is drawn apart). */
export function drawSite(): Texture {
  const canvas = new PixelCanvas(12, 11);
  for (const x of [1, 10]) for (let y = 2; y < 11; y++) canvas.set(x, y, LOG, y % 3 === 0 ? 0.8 : 1);
  for (let x = 1; x < 11; x++) canvas.set(x, 3, LOG, 0.9);
  for (let x = 3; x < 9; x++) canvas.set(x, 10, STONE, (x % 2) * 0.2 + 0.9);
  for (let x = 4; x < 8; x++) canvas.set(x, 9, LOG, 1.1);
  return canvas.toTexture();
}

/** The camp's common goods piled by the fire when there is no cache. */
export function drawHeap(): Texture {
  const canvas = new PixelCanvas(8, 5);
  for (let y = 0; y < 5; y++) {
    const half = Math.min(4, y + 1);
    for (let x = 4 - half; x < 4 + half; x++) canvas.set(x, y, GOODS[(x * 3 + y) % GOODS.length]!, y === 0 ? 1.15 : 1);
  }
  return canvas.toTexture();
}

/** The belongings of someone who died far from the camp, lying on the ground: a bundle of hide and a tool. */
export function drawBelongings(): Texture {
  const canvas = new PixelCanvas(6, 4);
  for (let y = 1; y < 4; y++) for (let x = 1; x < 5; x++) canvas.set(x, y, GOODS[(x + y) % GOODS.length]!, y === 1 ? 1.15 : 0.9);
  for (let x = 0; x < 6; x++) canvas.set(x, 3 - Math.floor(x / 3), LOG, 0.7);
  return canvas.toTexture();
}

function fire(lit: boolean): Texture {
  const canvas = new PixelCanvas(9, 9);
  for (const [x, y] of [[1, 6], [2, 7], [4, 8], [6, 7], [7, 6], [1, 5], [7, 5]] as const) canvas.set(x, y, STONE, 1);
  for (let x = 2; x < 7; x++) canvas.set(x, 6, LOG, x % 2 === 0 ? 1 : 0.8);
  if (!lit) {
    for (let x = 3; x < 6; x++) canvas.set(x, 5, ASH);
    return canvas.toTexture();
  }
  for (let y = 1; y < 6; y++) {
    const half = Math.floor((y + 1) / 2);
    for (let x = 4 - half; x <= 4 + half; x++) canvas.set(x, y, Math.abs(x - 4) < half && y > 2 ? FLAME_CORE : FLAME);
  }
  return canvas.toTexture();
}

/** Hut (thatch) or tent (hides): a cone with a dark doorway. */
function cone(color: Rgb, thatch: boolean): Texture {
  const canvas = new PixelCanvas(12, 11);
  for (let y = 0; y < 11; y++) {
    const half = Math.floor(y / 2) + 1;
    for (let x = 6 - half; x < 6 + half; x++) {
      const stripe = thatch ? ((x + y) % 3 === 0 ? -0.1 : 0) : y % 4 === 0 ? -0.15 : 0;
      canvas.set(x, y, color, (x < 6 ? 1.1 : 0.8) + stripe);
    }
  }
  for (let y = 7; y < 11; y++) for (let x = 5; x < 7; x++) canvas.set(x, y, DOOR);
  if (!thatch) for (const x of [5, 6]) canvas.set(x, 0, LOG);
  return canvas.toTexture();
}

function leanTo(): Texture {
  const canvas = new PixelCanvas(10, 7);
  for (let y = 0; y < 7; y++) for (let x = y; x < 10; x++) canvas.set(x, y, THATCH, x === y ? 1.2 : 0.9 + ((x + y) % 2) * 0.1);
  for (let y = 4; y < 7; y++) for (let x = 7; x < 9; x++) canvas.set(x, y, DOOR);
  return canvas.toTexture();
}

/** Ring of stones covered with branches; goods show when it fills up. */
function cache(fill: number): Texture {
  const canvas = new PixelCanvas(12, 8);
  for (let x = 1; x < 11; x++) {
    canvas.set(x, 7, STONE, 0.9 + (x % 2) * 0.15);
    canvas.set(x, 6, STONE, 1 - (x % 3) * 0.08);
  }
  for (let y = 3; y < 6; y++) for (let x = 2; x < 10; x++) canvas.set(x, y, LOG, (x + y) % 2 === 0 ? 1 : 0.8);
  const goods = Math.round(fill * 6);
  for (let k = 0; k < goods; k++) canvas.set(3 + k, 2, GOODS[k % GOODS.length]!);
  return canvas.toTexture();
}

function field(crop: number): Texture {
  const canvas = new PixelCanvas(12, 12);
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      const furrow = y % 3 === 0;
      const color = crop === 2 && !furrow ? RIPE : crop === 1 && !furrow ? SPROUT : SOIL;
      canvas.set(x, y, color, furrow ? 0.8 : 1 + ((x * 7 + y) % 3) * 0.05);
    }
  }
  return canvas.toTexture();
}

function fence(color: Rgb): Texture {
  const canvas = new PixelCanvas(12, 8);
  for (let x = 0; x < 12; x++) for (const y of [3, 6]) canvas.set(x, y, color, 0.9);
  for (let x = 0; x < 12; x += 3) for (let y = 1; y < 8; y++) canvas.set(x, y, color, 1.1);
  return canvas.toTexture();
}

function granary(fill: number): Texture {
  const canvas = new PixelCanvas(12, 12);
  for (let y = 0; y < 5; y++) {
    const half = y + 2;
    for (let x = 6 - half; x < 6 + half; x++) canvas.set(x, y, THATCH, x < 6 ? 1.1 : 0.85);
  }
  for (let y = 5; y < 10; y++) for (let x = 2; x < 10; x++) canvas.set(x, y, MUD, x < 6 ? 1.05 : 0.85);
  for (const x of [3, 8]) for (let y = 10; y < 12; y++) canvas.set(x, y, LOG);
  if (fill > 0.5) canvas.set(6, 7, RIPE);
  return canvas.toTexture();
}

function house(wall: Rgb): Texture {
  const canvas = new PixelCanvas(14, 11);
  for (let y = 0; y < 4; y++) for (let x = 3 - y; x < 11 + y; x++) canvas.set(x, y, THATCH, x < 7 ? 1.1 : 0.85);
  for (let y = 4; y < 11; y++) for (let x = 1; x < 13; x++) canvas.set(x, y, wall, x < 7 ? 1.05 : 0.85);
  for (let y = 7; y < 11; y++) for (let x = 6; x < 8; x++) canvas.set(x, y, DOOR);
  return canvas.toTexture();
}

function dome(color: Rgb): Texture {
  const canvas = new PixelCanvas(11, 9);
  for (let y = 0; y < 9; y++) {
    const half = Math.min(5, Math.round(Math.sqrt(Math.max(0, 25 - (8 - y) ** 2 / 2.6))));
    for (let x = 5 - half; x <= 5 + half; x++) canvas.set(x, y, color, x < 5 ? 1.1 : 0.85);
  }
  for (let y = 6; y < 9; y++) for (let x = 4; x < 7; x++) canvas.set(x, y, DOOR);
  return canvas.toTexture();
}

function shed(): Texture {
  const canvas = new PixelCanvas(12, 10);
  for (let x = 0; x < 12; x++) for (let y = 0; y < 3; y++) canvas.set(x, y, LOG, 1.1 - y * 0.1);
  for (const x of [1, 10]) for (let y = 3; y < 10; y++) canvas.set(x, y, LOG, 0.9);
  for (let x = 3; x < 9; x++) for (let y = 5; y < 9; y++) canvas.set(x, y, HIDE, (x + y) % 2 === 0 ? 1 : 0.85);
  return canvas.toTexture();
}

function canal(): Texture {
  const canvas = new PixelCanvas(12, 4);
  for (let x = 0; x < 12; x++) {
    canvas.set(x, 0, SOIL);
    canvas.set(x, 1, WATER, 1.1);
    canvas.set(x, 2, WATER, 0.9);
    canvas.set(x, 3, SOIL);
  }
  return canvas.toTexture();
}

function dolmen(): Texture {
  const canvas = new PixelCanvas(12, 9);
  for (let x = 0; x < 12; x++) for (let y = 0; y < 3; y++) canvas.set(x, y, STONE, 1.1 - y * 0.08);
  for (const x0 of [1, 9]) for (let x = x0; x < x0 + 2; x++) for (let y = 3; y < 9; y++) canvas.set(x, y, STONE, 0.85);
  return canvas.toTexture();
}
