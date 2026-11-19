import type { Texture } from 'pixi.js';
import type { Rgb } from '../color';
import { PixelCanvas } from './pixel-canvas';

const SKINS: Rgb[] = [[235, 196, 160], [201, 150, 110], [160, 110, 75], [110, 74, 50]];
const HAIRS: Rgb[] = [[40, 30, 25], [95, 60, 35], [150, 110, 60], [30, 25, 25]];
const CLOTHES: Rgb[] = [[120, 85, 55], [140, 105, 70], [95, 70, 50], [150, 120, 85]];
const SHADE = 0.75;

/** Which side of the person is seen: walking toward the viewer, away from them, or across (facing right). */
export type HumanView = 'front' | 'back' | 'side';

export interface HumanLook {
  female: boolean;
  /** Any integer: picks skin, hair and clothes. */
  variant: number;
  asleep: boolean;
  view: HumanView;
  /** Animation: 0 standing, 1 and 2 the two strides. */
  stride: number;
  /** Running: longer strides, arms pumping, body leaning forward. */
  running: boolean;
}

/** Width of a standing adult, in map tiles (children are drawn smaller). */
export const HUMAN_TILES = 0.55;
export const CHILD_SCALE = 0.7;

interface Palette {
  skin: Rgb;
  hair: Rgb;
  cloth: Rgb;
}

function paletteOf(variant: number): Palette {
  return {
    skin: SKINS[variant % SKINS.length]!,
    hair: HAIRS[Math.floor(variant / SKINS.length) % HAIRS.length]!,
    cloth: CLOTHES[Math.floor(variant / (SKINS.length * HAIRS.length)) % CLOTHES.length]!,
  };
}

/**
 * Procedural pixel-art human: seen from the front, the back or the side (facing right; the layer
 * mirrors it for the left), standing, walking or running (6×10), or lying asleep (10×6).
 */
export function drawHuman(look: HumanLook): Texture {
  const colors = paletteOf(look.variant);
  if (look.asleep) return lying(colors, look.female);
  if (look.view === 'side') return side(colors, look);
  return facing(colors, look);
}

/** Front or back: the face shows from the front, the hair covers the head from the back. */
function facing({ skin, hair, cloth }: Palette, look: HumanLook): Texture {
  const canvas = new PixelCanvas(6, 10);
  const back = look.view === 'back';
  for (let x = 1; x < 5; x++) canvas.set(x, 0, hair);
  for (let y = 1; y < 3; y++) for (let x = 1; x < 5; x++) canvas.set(x, y, back ? hair : skin, x === 4 ? 0.9 : 1);
  if (look.female) for (let y = 1; y < 5; y++) canvas.set(0, y, hair), canvas.set(5, y, hair, SHADE);
  else if (!back) canvas.set(1, 1, hair);
  if (back && look.female) for (let x = 1; x < 5; x++) canvas.set(x, 3, hair, 0.9);
  for (let y = back && look.female ? 4 : 3; y < 7; y++) for (let x = 1; x < 5; x++) canvas.set(x, y, cloth, x === 4 ? SHADE : 1);
  // Arms swing with the stride (higher and wider when running).
  const swing = look.running ? 2 : 1;
  canvas.set(0, look.stride === 1 ? 4 + swing : 4, skin, 0.9);
  canvas.set(5, look.stride === 2 ? 4 + swing : 4, skin, SHADE);
  if (look.running && look.stride !== 0) canvas.set(look.stride === 1 ? 5 : 0, 3, skin, SHADE);
  // Legs: side by side when standing; one forward, one back when walking.
  const feet = look.stride === 1 ? [0, 4] : look.stride === 2 ? [2, 2] : [1, 3];
  for (let y = 7; y < 10; y++) {
    const last = y === 9;
    canvas.set(last ? feet[0]! : 1, y, skin, 0.85);
    canvas.set(last ? feet[1]! : 3, y, skin, SHADE);
    if (look.female && y === 7) canvas.set(2, y, cloth);
  }
  return canvas.toTexture();
}

/** Profile, facing right: legs and arms scissor with the stride; a runner leans forward. */
function side({ skin, hair, cloth }: Palette, look: HumanLook): Texture {
  const canvas = new PixelCanvas(6, 10);
  const lean = look.running && look.stride !== 0 ? 1 : 0;
  // Head: hair on top and at the back, face toward the right, a nose.
  for (let x = 1 + lean; x < 4 + lean; x++) canvas.set(x, 0, hair);
  canvas.set(1 + lean, 1, hair);
  canvas.set(1 + lean, 2, hair, SHADE);
  for (let y = 1; y < 3; y++) for (let x = 2 + lean; x < 4 + lean; x++) canvas.set(x, y, skin);
  canvas.set(4 + lean, 2, skin, 0.9);
  if (look.female) for (let y = 1; y < 5; y++) canvas.set(lean, y, hair, SHADE);
  // Body.
  for (let y = 3; y < 7; y++) for (let x = 1; x < 4; x++) canvas.set(x + (y < 5 ? lean : 0), y, cloth, x === 1 ? SHADE : 1);
  // Arm: forward or back with the stride.
  const reach = look.running ? 2 : 1;
  const arm = look.stride === 1 ? 3 + reach : look.stride === 2 ? Math.max(0, 1 - reach + 1) : 2;
  canvas.set(arm, 5, skin, 0.9);
  // Legs: apart (walking, wider when running) or together.
  const stride = look.running ? 2 : 1;
  const front = look.stride === 0 ? 2 : look.stride === 1 ? 2 + stride : 2;
  const rear = look.stride === 0 ? 2 : look.stride === 1 ? 2 - stride : 2;
  for (let y = 7; y < 10; y++) {
    const spread = y === 7 ? 0 : y === 8 ? 0.5 : 1;
    canvas.set(Math.round(2 + (front - 2) * spread), y, skin, 0.85);
    canvas.set(Math.round(2 + (rear - 2) * spread), y, skin, SHADE);
  }
  if (look.stride === 2) {
    // Passing step: one leg lifted.
    canvas.set(3, 8, skin, SHADE);
  }
  return canvas.toTexture();
}

function lying({ skin, hair, cloth }: Palette, female: boolean): Texture {
  const canvas = new PixelCanvas(10, 6);
  // A sleeper under a hide blanket, head on the left.
  for (let y = 2; y < 5; y++) canvas.set(0, y, hair);
  for (let y = 2; y < 5; y++) canvas.set(1, y, skin);
  if (female) canvas.set(0, 5, hair);
  for (let y = 2; y < 6; y++) for (let x = 2; x < 10; x++) canvas.set(x, y, cloth, y === 2 ? 1.1 : y === 5 ? SHADE : 1);
  return canvas.toTexture();
}
