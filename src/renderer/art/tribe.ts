import { Graphics, TextStyle } from 'pixi.js';

/** Colors given to the tribes, in order of their id (display only). */
const TRIBE_COLORS = [0xe0b040, 0x5fb0e8, 0xe06a5a, 0x7fd07a, 0xc08ae8, 0xf0a060, 0x60d0c0, 0xe878b0, 0xb0b0b0, 0xa0c050];
const POLE_COLOR = 0x5a4632;
const LABEL_FONT_PIXELS = 13;
const LABEL_STROKE = 0x101418;

export function tribeColor(id: number): number {
  return TRIBE_COLORS[id % TRIBE_COLORS.length]!;
}

/** "#e0b040" for the HUD. */
export function tribeColorCss(id: number): string {
  return `#${tribeColor(id).toString(16).padStart(6, '0')}`;
}

/** The tribe's banner planted at the heart of its camp (tile units; x, y: foot of the pole). */
export function drawTribeBanner(graphics: Graphics, x: number, y: number, color: number): void {
  graphics.rect(x - 0.03, y - 1.1, 0.06, 1.1).fill(POLE_COLOR);
  graphics.poly([x + 0.03, y - 1.1, x + 0.55, y - 0.95, x + 0.03, y - 0.78]).fill(color);
}

/** Style of the tribe's name above its camp (drawn at a fixed size on screen). */
export function tribeLabelStyle(color: number): TextStyle {
  return new TextStyle({ fontFamily: 'system-ui, Segoe UI, sans-serif', fontSize: LABEL_FONT_PIXELS, fontWeight: '600', fill: color, stroke: { color: LABEL_STROKE, width: 3 } });
}
