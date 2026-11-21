import type { Texture } from 'pixi.js';
import type { PlantSpecies } from '../../sim/systems/flora/params';
import { tileHash, type Rgb } from '../color';
import { color, PixelCanvas } from './pixel-canvas';

const TRUNK: Rgb = [92, 62, 38];
const PALE_TRUNK: Rgb = [226, 222, 210];
const DEFAULT_ACCENT: Rgb = [200, 60, 60];
/** Light comes from the north-west: lit and shadowed sides. */
const LIGHT = 1.18;
const SHADOW = 0.72;

/** The drawing of a species: without its produce, with it (berries, ears… only when there are some to pick). */
export interface PlantArt {
  bare: Texture;
  fruit: Texture;
  /** Width on the map, in tiles. */
  tiles: number;
}

/** Draws one shape: `accent` is null when the fruit/flower accent must not be drawn. */
type Painter = (leaf: Rgb, accent: Rgb | null, seed: number) => PixelCanvas;

/** Each species has its own silhouette (`shape` in data/plants.json). */
const PAINTERS: Record<PlantSpecies['shape'], { paint: Painter; tiles: number }> = {
  round: { paint: (leaf, _accent, seed) => roundTree(leaf, TRUNK, seed), tiles: 1.5 },
  slender: { paint: slenderTree, tiles: 1.3 },
  conifer: { paint: (leaf, _accent, seed) => conifer(leaf, seed), tiles: 1.5 },
  broad: { paint: broadTree, tiles: 1.8 },
  umbrella: { paint: (leaf, _accent, seed) => umbrellaTree(leaf, seed), tiles: 1.6 },
  bush: { paint: bush, tiles: 0.9 },
  bramble: { paint: bramble, tiles: 0.95 },
  berry_bush: { paint: berryBush, tiles: 0.7 },
  fig: { paint: figBush, tiles: 1.05 },
  feathery: { paint: featheryBush, tiles: 1 },
  creeping: { paint: creepingBush, tiles: 0.85 },
  umbel: { paint: umbel, tiles: 0.65 },
  vine: { paint: vine, tiles: 0.7 },
  rosette: { paint: rosette, tiles: 0.55 },
  nettle: { paint: nettle, tiles: 0.65 },
  reed: { paint: reed, tiles: 0.75 },
  ears: { paint: ears, tiles: 0.65 },
  flax: { paint: flax, tiles: 0.6 },
  grass: { paint: stalks, tiles: 0.7 },
};

/**
 * Procedural pixel-art textures of a plant species (drawn once). A species with a seasonal harvest
 * shows its accent (berries, figs, ears…) only on the "fruit" texture; one without shows it always
 * (birch bark, tamarisk flowers).
 */
export function drawPlant(species: PlantSpecies, seed: number): PlantArt {
  const leaf = color(species.color);
  const accent = species.accentColor ? color(species.accentColor) : DEFAULT_ACCENT;
  const painter = PAINTERS[species.shape];
  const withFruit = painter.paint(leaf, accent, seed).toTexture();
  const bare = species.produce ? painter.paint(leaf, null, seed).toTexture() : withFruit;
  return { bare, fruit: withFruit, tiles: painter.tiles };
}

/** Shade of a canopy pixel: lit toward the top-left, dark toward the bottom-right, with a dither. */
function canopyShade(dx: number, dy: number, radius: number, x: number, y: number, seed: number): number {
  const side = (-dx - dy) / (2 * radius);
  const noise = (tileHash(x, y, seed) - 0.5) * 0.18;
  return Math.max(SHADOW, Math.min(LIGHT, 1 + side * 0.35 + noise));
}

/** A filled ellipse of leaves. */
function blob(canvas: PixelCanvas, leaf: Rgb, cx: number, cy: number, rx: number, ry: number, seed: number, rough = 0.15): void {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const bump = (tileHash(x, y, seed + 7) - 0.5) * rough;
      if (dx * dx + dy * dy <= 1 + bump) canvas.set(x, y, leaf, canopyShade(x - cx, y - cy, Math.max(rx, ry), x, y, seed));
    }
  }
}

/** Accent dots placed on leaves only. */
function dots(canvas: PixelCanvas, accent: Rgb | null, points: readonly (readonly [number, number])[]): void {
  if (!accent) return;
  for (const [x, y] of points) if (canvas.isSet(x, y)) canvas.set(x, y, accent);
}

function roundTree(leaf: Rgb, trunk: Rgb, seed: number): PixelCanvas {
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
  return canvas;
}

/** Birch: a thin pale trunk with dark marks and a narrow, airy crown. */
function slenderTree(leaf: Rgb, accent: Rgb | null, seed: number): PixelCanvas {
  const canvas = new PixelCanvas(9, 16);
  const bark = accent ?? PALE_TRUNK;
  for (let y = 5; y < 16; y++) canvas.set(4, y, y % 3 === 0 ? TRUNK : bark, 1);
  blob(canvas, leaf, 4, 4.5, 3.6, 4.6, seed, 0.5);
  for (let y = 7; y < 12; y += 2) canvas.set(4, y, bark, 1);
  return canvas;
}

/** Kapok: a tall straight trunk with buttress roots and a wide flat crown. */
function broadTree(leaf: Rgb, _accent: Rgb | null, seed: number): PixelCanvas {
  const canvas = new PixelCanvas(16, 16);
  for (let y = 6; y < 16; y++) for (let x = 7; x < 9; x++) canvas.set(x, y, TRUNK, x === 7 ? 1.1 : 0.8);
  canvas.set(5, 15, TRUNK, 0.8);
  canvas.set(6, 15, TRUNK, 0.9);
  canvas.set(6, 14, TRUNK, 0.9);
  canvas.set(9, 14, TRUNK, 0.8);
  canvas.set(10, 15, TRUNK, 0.8);
  blob(canvas, leaf, 7.5, 3.2, 7.4, 3.2, seed, 0.3);
  blob(canvas, leaf, 4, 5, 3, 1.6, seed + 1);
  blob(canvas, leaf, 11.5, 5, 3, 1.6, seed + 2);
  return canvas;
}

function conifer(leaf: Rgb, seed: number): PixelCanvas {
  const canvas = new PixelCanvas(11, 15);
  for (let y = 12; y < 15; y++) canvas.set(5, y, TRUNK, 0.9);
  for (let y = 0; y < 13; y++) {
    const tier = y % 4;
    const half = Math.min(5, Math.floor(y / 2.4) + tier * 0.5);
    for (let x = Math.round(5 - half); x <= Math.round(5 + half); x++) {
      canvas.set(x, y, leaf, canopyShade(x - 5, y - 6, 6, x, y, seed));
    }
  }
  return canvas;
}

function umbrellaTree(leaf: Rgb, seed: number): PixelCanvas {
  const canvas = new PixelCanvas(14, 13);
  for (let y = 5; y < 13; y++) canvas.set(7 - (y < 8 ? 1 : 0), y, TRUNK, 0.9);
  for (let y = 0; y < 5; y++) {
    const half = 7 - Math.abs(y - 1.5) * 1.3;
    for (let x = Math.round(7 - half); x < Math.round(7 + half); x++) canvas.set(x, y, leaf, canopyShade(x - 7, y - 2, 6, x, y, seed));
  }
  return canvas;
}

function bush(leaf: Rgb, accent: Rgb | null, seed: number): PixelCanvas {
  const canvas = new PixelCanvas(9, 7);
  blob(canvas, leaf, 4, 4, 4.4, 3.4, seed, 0);
  dots(canvas, accent, [[2, 3], [5, 2], [6, 4], [3, 5]]);
  return canvas;
}

/** Bramble: a tangle of arching thorny canes, black-purple berries in clusters. */
function bramble(leaf: Rgb, accent: Rgb | null, seed: number): PixelCanvas {
  const canvas = new PixelCanvas(11, 8);
  blob(canvas, leaf, 5, 5, 4.8, 2.8, seed, 0.9);
  const cane: Rgb = [120, 70, 60];
  for (const [x, y] of [[0, 4], [1, 3], [2, 2], [3, 2], [7, 1], [8, 1], [9, 2], [10, 3], [5, 1]] as const) canvas.set(x, y, cane, 1);
  for (let x = 1; x < 10; x += 3) canvas.set(x, 7, cane, 0.8);
  dots(canvas, accent, [[2, 4], [3, 4], [6, 3], [7, 5], [8, 4], [4, 6], [5, 5]]);
  return canvas;
}

/** Bilberry: a low, rounded mat of tiny leaves with small blue berries. */
function berryBush(leaf: Rgb, accent: Rgb | null, seed: number): PixelCanvas {
  const canvas = new PixelCanvas(9, 5);
  blob(canvas, leaf, 4, 3.2, 4.3, 2, seed, 0.6);
  dots(canvas, accent, [[1, 3], [3, 2], [5, 3], [6, 2], [7, 3], [4, 4]]);
  return canvas;
}

/** Wild fig: a big shrub with a few twisted grey stems, broad lobed leaves and pear-shaped figs. */
function figBush(leaf: Rgb, accent: Rgb | null, seed: number): PixelCanvas {
  const canvas = new PixelCanvas(12, 11);
  const stem: Rgb = [140, 128, 110];
  for (let y = 7; y < 11; y++) {
    canvas.set(5, y, stem, 1);
    canvas.set(y < 9 ? 7 : 6, y, stem, 0.85);
  }
  blob(canvas, leaf, 3.5, 4.5, 3.2, 2.6, seed);
  blob(canvas, leaf, 8, 4, 3.4, 2.8, seed + 3);
  blob(canvas, leaf, 6, 2, 2.6, 2, seed + 5);
  if (accent) {
    for (const [x, y] of [[2, 5], [5, 4], [8, 5], [9, 3], [4, 2]] as const) {
      canvas.set(x, y, accent, 1);
      canvas.set(x, y + 1, accent, 0.8);
    }
  }
  return canvas;
}

/** Tamarisk: a feathery cloud of thin pink-tipped twigs. */
function featheryBush(leaf: Rgb, accent: Rgb | null, seed: number): PixelCanvas {
  const canvas = new PixelCanvas(10, 10);
  for (let x = 0; x < 10; x++) {
    const top = 1 + Math.floor(Math.abs(x - 4.5) * 0.8 + tileHash(x, 1, seed) * 2);
    for (let y = top; y < 10; y++) if ((x + y) % 2 === 0 || y > 7) canvas.set(x, y, leaf, y < 4 ? 1.15 : 0.85);
    if (accent && x % 2 === 1) canvas.set(x, top, accent);
  }
  return canvas;
}

/** Dwarf willow: low creeping branches hugging the ground with small round leaves. */
function creepingBush(leaf: Rgb, _accent: Rgb | null, seed: number): PixelCanvas {
  const canvas = new PixelCanvas(11, 5);
  const wood: Rgb = [110, 90, 70];
  for (let x = 0; x < 11; x++) canvas.set(x, 4, wood, 0.9);
  blob(canvas, leaf, 2.5, 2.8, 2.4, 1.4, seed);
  blob(canvas, leaf, 6, 2.4, 2.6, 1.6, seed + 1);
  blob(canvas, leaf, 9, 3, 1.8, 1.2, seed + 2);
  return canvas;
}

/** Wild carrot: thin feathery stems topped by a flat white flower umbel (when roots are ready). */
function umbel(leaf: Rgb, accent: Rgb | null, _seed: number): PixelCanvas {
  const canvas = new PixelCanvas(7, 8);
  for (let y = 2; y < 8; y++) canvas.set(3, y, leaf, 1);
  for (const [x, y] of [[1, 6], [2, 5], [4, 5], [5, 6], [1, 7], [5, 7]] as const) canvas.set(x, y, leaf, 0.85);
  if (accent) for (let x = 1; x < 6; x++) canvas.set(x, x === 1 || x === 5 ? 2 : 1, accent);
  else canvas.set(3, 1, leaf, 1.1);
  return canvas;
}

/** Wild yam: a twining vine with heart-shaped leaves. */
function vine(leaf: Rgb, _accent: Rgb | null, seed: number): PixelCanvas {
  const canvas = new PixelCanvas(8, 8);
  const stem: Rgb = [90, 110, 50];
  for (let y = 0; y < 8; y++) canvas.set(3 + (y % 4 < 2 ? 0 : 1), y, stem, 1);
  for (const [cx, cy] of [[1.5, 1.5], [6, 3], [1.5, 5], [6, 6.3]] as const) blob(canvas, leaf, cx, cy, 1.4, 1.1, seed, 0);
  return canvas;
}

/** Dandelion: a flat rosette of toothed leaves, a yellow flower head in season. */
function rosette(leaf: Rgb, accent: Rgb | null, _seed: number): PixelCanvas {
  const canvas = new PixelCanvas(7, 5);
  for (let x = 0; x < 7; x++) canvas.set(x, 4, leaf, x % 2 === 0 ? 1.1 : 0.85);
  for (const [x, y] of [[1, 3], [2, 3], [4, 3], [5, 3], [0, 3], [6, 3]] as const) canvas.set(x, y, leaf, 0.95);
  canvas.set(3, 3, leaf, 1);
  canvas.set(3, 2, leaf, 1);
  if (accent) {
    canvas.set(3, 1, accent);
    canvas.set(2, 1, accent, 0.9);
    canvas.set(4, 1, accent, 0.9);
    canvas.set(3, 0, accent, 1.1);
  }
  return canvas;
}

/** Nettle: upright square stems with opposite, pointed dark leaves. */
function nettle(leaf: Rgb, _accent: Rgb | null, _seed: number): PixelCanvas {
  const canvas = new PixelCanvas(7, 9);
  for (const x of [2, 4]) for (let y = x === 2 ? 1 : 2; y < 9; y++) canvas.set(x, y, leaf, 0.8);
  for (const y of [2, 4, 6]) {
    canvas.set(1, y, leaf, 1.15);
    canvas.set(3, y + 1, leaf, 1.05);
    canvas.set(5, y + 1, leaf, 1.1);
    canvas.set(0, y + 1, leaf, 0.9);
    canvas.set(6, y + 2, leaf, 0.9);
  }
  return canvas;
}

/** Reed: tall straight stems with brown plumes. */
function reed(leaf: Rgb, accent: Rgb | null, seed: number): PixelCanvas {
  const canvas = new PixelCanvas(7, 11);
  for (const x of [0, 2, 3, 5, 6]) {
    const top = 2 + Math.floor(tileHash(x, 3, seed) * 3);
    for (let y = top; y < 11; y++) canvas.set(x, y, leaf, y < 5 ? 1.1 : 0.85);
    if (accent && x !== 3) {
      canvas.set(x, top - 1, accent);
      canvas.set(x, top - 2, accent, 0.85);
    }
  }
  return canvas;
}

/** Wild wheat: a tuft of stalks bearing golden ears when ripe. */
function ears(leaf: Rgb, accent: Rgb | null, seed: number): PixelCanvas {
  const canvas = new PixelCanvas(7, 9);
  for (const x of [1, 3, 5]) {
    const top = 2 + Math.floor(tileHash(x, 0, seed) * 2);
    for (let y = top; y < 9; y++) canvas.set(x, y, leaf, y < 5 ? 1.1 : 0.85);
    if (accent) for (let y = top - 2; y < top + 1; y++) canvas.set(x, y, accent, y === top - 2 ? 1.1 : 0.95);
  }
  canvas.set(0, 7, leaf, 0.8);
  canvas.set(6, 6, leaf, 0.8);
  return canvas;
}

/** Wild flax: very thin stems with small sky-blue flowers. */
function flax(leaf: Rgb, accent: Rgb | null, seed: number): PixelCanvas {
  const canvas = new PixelCanvas(7, 8);
  for (const x of [1, 3, 5]) {
    const top = 1 + Math.floor(tileHash(x, 2, seed) * 2);
    for (let y = top; y < 8; y++) canvas.set(x + (y < 4 ? (x - 3) / 2 : 0), y, leaf, 0.9);
    if (accent) canvas.set(x + (x - 3) / 2, top - 1, accent);
  }
  return canvas;
}

function stalks(leaf: Rgb, accent: Rgb | null, seed: number): PixelCanvas {
  const canvas = new PixelCanvas(7, 7);
  for (const x of [1, 3, 5]) {
    const top = 1 + Math.floor(tileHash(x, 0, seed) * 3);
    for (let y = top; y < 7; y++) canvas.set(x + (y < 3 && x !== 3 ? (x < 3 ? -1 : 1) : 0), y, leaf, y < 4 ? 1.1 : 0.85);
    if (accent) canvas.set(x + (x !== 3 ? (x < 3 ? -1 : 1) : 0), top, accent);
  }
  return canvas;
}
