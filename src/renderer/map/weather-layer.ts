import { Graphics } from 'pixi.js';
import { drawRaindrop, drawSnowflake } from '../art/weather';
import type { TileRect } from './map-view';

/** At most this many drops or flakes on screen (fluid at x1 whatever the zoom). */
const MAX_PARTICLES = 320;
/** Drops per visible tile under the rain (the cap above wins when zoomed out). */
const PER_TILE = 0.6;
/** Below this zoom, the weather is not drawn (too small to see). */
const MIN_PIXELS_PER_TILE = 3;
/** Fall speeds, tiles per real second. */
const RAIN_SPEED = 9;
const SNOW_SPEED = 1.6;
const DROP_SIZE = 0.7;

/** A fixed pseudo-random number in 0..1 for particle `k` (its place in the sky). */
function scatter(k: number, salt: number): number {
  const v = Math.sin(k * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Rain and snow over the map (M): a few hundred drops or flakes over the visible regions where it
 * rains or snows, moved every frame. Purely a display: nothing is simulated here.
 */
export class WeatherLayer {
  readonly graphics = new Graphics();
  enabled = true;
  private regions: Uint8Array | null = null;
  private regionTiles = 1;
  private size = 1;
  private rain = -1;
  private snow = -1;

  setWorld(size: number, regionTiles: number, weatherIds: readonly string[]): void {
    this.size = size;
    this.regionTiles = Math.max(1, regionTiles);
    this.rain = weatherIds.indexOf('rain');
    this.snow = weatherIds.indexOf('snow');
    this.regions = null;
  }

  setRegions(regions: Uint8Array): void {
    this.regions = regions;
  }

  update(visible: TileRect, pixelsPerTile: number, nowMs: number): void {
    const g = this.graphics;
    g.clear();
    const regions = this.regions;
    if (!this.enabled || !regions || pixelsPerTile < MIN_PIXELS_PER_TILE) return;
    const minX = Math.max(0, Math.floor(visible.minX));
    const minY = Math.max(0, Math.floor(visible.minY));
    const maxX = Math.min(this.size, Math.ceil(visible.maxX));
    const maxY = Math.min(this.size, Math.ceil(visible.maxY));
    const width = maxX - minX;
    const height = maxY - minY;
    if (width <= 0 || height <= 0) return;
    const perSide = Math.ceil(this.size / this.regionTiles);
    const count = Math.min(MAX_PARTICLES, Math.round(width * height * PER_TILE));
    const seconds = nowMs / 1000;
    for (let k = 0; k < count; k++) {
      const x = minX + scatter(k, 1) * width;
      const baseY = scatter(k, 2) * height;
      const region = Math.floor(Math.min(this.size - 1, minY + baseY) / this.regionTiles) * perSide + Math.floor(x / this.regionTiles);
      const code = regions[region] ?? 0;
      if (code === this.rain) {
        const y = minY + ((baseY + seconds * RAIN_SPEED * (0.8 + scatter(k, 3) * 0.4)) % height);
        drawRaindrop(g, x + (y - minY) * 0.05, y, DROP_SIZE);
      } else if (code === this.snow) {
        const y = minY + ((baseY + seconds * SNOW_SPEED * (0.7 + scatter(k, 3) * 0.6)) % height);
        drawSnowflake(g, x + Math.sin(seconds * 1.5 + k) * 0.4, y, DROP_SIZE * (0.8 + scatter(k, 4) * 0.6));
      }
    }
  }
}
