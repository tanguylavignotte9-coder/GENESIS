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

const BLADE_COLOR = 0xd8d8e0;
const BATTLE_GLOW = 0xc83030;

/** Where a battle took place: two crossed blades on a red mark, fading with the hours (`fade` 0..1). */
export function drawBattleMark(graphics: Graphics, x: number, y: number, fade: number): void {
  const alpha = Math.max(0.15, 1 - fade);
  graphics.circle(x, y, 0.7).fill({ color: BATTLE_GLOW, alpha: 0.35 * alpha });
  graphics.moveTo(x - 0.45, y - 0.45).lineTo(x + 0.45, y + 0.45).stroke({ width: 0.12, color: BLADE_COLOR, alpha });
  graphics.moveTo(x + 0.45, y - 0.45).lineTo(x - 0.45, y + 0.45).stroke({ width: 0.12, color: BLADE_COLOR, alpha });
}

/** A tribe's land (political view): a soft disc of its colour around its camp (tile units). */
export function drawTerritory(graphics: Graphics, x: number, y: number, radius: number, color: number, alpha: number): void {
  graphics.circle(x, y, radius).fill({ color, alpha: alpha * 0.35 });
  graphics.circle(x, y, radius).stroke({ color, alpha, width: 0.25 });
}

/** A tie between two camps (political view): alliance, war, truce or tribute (tile units). */
export function drawCampTie(graphics: Graphics, ax: number, ay: number, bx: number, by: number, color: number, width: number, dashed: boolean): void {
  if (!dashed) {
    graphics.moveTo(ax, ay).lineTo(bx, by).stroke({ color, width, alpha: 0.9 });
    return;
  }
  const length = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.floor(length / 2));
  for (let k = 0; k < steps; k += 2) {
    const t0 = k / steps;
    const t1 = Math.min(1, (k + 1) / steps);
    graphics.moveTo(ax + (bx - ax) * t0, ay + (by - ay) * t0).lineTo(ax + (bx - ax) * t1, ay + (by - ay) * t1);
  }
  graphics.stroke({ color, width, alpha: 0.9 });
}

/** Colour of a shared idea (a culture, a language, a religion), stable from its id. */
export function ideaColor(id: number): number {
  const hue = (id * 137.508) % 360;
  const s = 0.65;
  const l = 0.55;
  const k = (n: number): number => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}
