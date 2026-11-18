import { BufferImageSource, Sprite, Texture } from 'pixi.js';
import type { ClimateState } from '../../sim/systems/world/climate-state';

/** Darkness of a full night (display setting). */
const NIGHT_DARKNESS = 0.6;
const NIGHT_TINT = [8, 12, 40] as const;
/** Redraw when the hour changed by more than this (game hours). */
const REFRESH_HOURS = 0.05;

/**
 * Night over the map: one darkness value per row, since the length of the day depends on the
 * latitude (and the season). A 1-pixel-wide texture stretched over the whole map.
 */
export class NightLayer {
  readonly sprite = new Sprite();
  private lastHour = -1;
  private size = 1;

  setSize(size: number): void {
    this.size = size;
    this.lastHour = -1;
  }

  update(climate: ClimateState | null, hour: number): void {
    if (!climate || Math.abs(hour - this.lastHour) < REFRESH_HOURS) return;
    this.lastHour = hour;
    const pixels = new Uint8Array(this.size * 4);
    for (let y = 0; y < this.size; y++) {
      const light = climate.daylightAt(y * this.size, hour);
      pixels[y * 4] = NIGHT_TINT[0];
      pixels[y * 4 + 1] = NIGHT_TINT[1];
      pixels[y * 4 + 2] = NIGHT_TINT[2];
      pixels[y * 4 + 3] = Math.round((1 - light) * NIGHT_DARKNESS * 255);
    }
    const source = new BufferImageSource({ resource: pixels, width: 1, height: this.size, format: 'rgba8unorm', alphaMode: 'no-premultiply-alpha' });
    source.scaleMode = 'linear';
    const previous = this.sprite.texture;
    this.sprite.texture = new Texture({ source });
    if (previous !== Texture.EMPTY) previous.destroy(true);
    this.sprite.scale.set(this.size, 1);
  }
}
