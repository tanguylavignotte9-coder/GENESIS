import type { Graphics } from 'pixi.js';

const RAIN_COLOR = 0x9fc4ff;
const SNOW_COLOR = 0xffffff;

/** A raindrop falling (tile units): a short slanted streak. */
export function drawRaindrop(graphics: Graphics, x: number, y: number, size: number): void {
  graphics.moveTo(x, y).lineTo(x - size * 0.25, y + size).stroke({ color: RAIN_COLOR, width: size * 0.08, alpha: 0.55 });
}

/** A snowflake drifting (tile units). */
export function drawSnowflake(graphics: Graphics, x: number, y: number, size: number): void {
  graphics.circle(x, y, size * 0.12).fill({ color: SNOW_COLOR, alpha: 0.8 });
}
