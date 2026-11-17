import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js';
import type { ClimateState } from '../../sim/systems/world/climate-state';
import type { WorldSnapshot } from '../../shared/messages';
import { VIEW } from '../view-settings';
import { buildPalette, writeTileColor, type Palette } from './tile-colors';

const BYTES_PER_PIXEL = 4;

/** Visible area in tile coordinates. */
export interface TileRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Chunk {
  cx: number;
  cy: number;
  width: number;
  height: number;
  sprite: Sprite | null;
  /** Climate version drawn in this chunk (-1 = never drawn). */
  drawnVersion: number;
}

/**
 * Pixel-art map split into square chunks (one small texture each, one pixel per tile).
 * Chunks are drawn lazily when visible, a few per frame, and redrawn when the season changes.
 */
export class MapView {
  readonly container = new Container();
  private world: WorldSnapshot | null = null;
  private climate: ClimateState | null = null;
  private climateVersion = 0;
  private palette: Palette | null = null;
  private chunks: Chunk[] = [];
  private chunksPerSide = 0;

  setWorld(world: WorldSnapshot): void {
    this.clear();
    this.world = world;
    this.climate = null;
    this.climateVersion = 0;
    this.palette = buildPalette(world);
    this.chunksPerSide = Math.ceil(world.size / VIEW.chunkTiles);
    for (let cy = 0; cy < this.chunksPerSide; cy++) {
      for (let cx = 0; cx < this.chunksPerSide; cx++) {
        const width = Math.min(VIEW.chunkTiles, world.size - cx * VIEW.chunkTiles);
        const height = Math.min(VIEW.chunkTiles, world.size - cy * VIEW.chunkTiles);
        this.chunks.push({ cx, cy, width, height, sprite: null, drawnVersion: -1 });
      }
    }
  }

  /** The climate changed (new day or new year): chunks will be redrawn progressively. */
  setClimate(climate: ClimateState): void {
    this.climate = climate;
    this.climateVersion++;
  }

  /** Shows the chunks inside `visible`, (re)drawing at most `VIEW.chunksPerFrame` of them. */
  update(visible: TileRect): void {
    if (!this.world) return;
    const version = this.climateVersion;
    const first = (value: number): number => Math.max(0, Math.floor(value / VIEW.chunkTiles));
    const last = (value: number): number => Math.min(this.chunksPerSide - 1, Math.floor(value / VIEW.chunkTiles));
    const x0 = first(visible.minX);
    const x1 = last(visible.maxX);
    const y0 = first(visible.minY);
    const y1 = last(visible.maxY);
    let budget: number = VIEW.chunksPerFrame;
    for (const chunk of this.chunks) {
      const inView = chunk.cx >= x0 && chunk.cx <= x1 && chunk.cy >= y0 && chunk.cy <= y1;
      if (inView && chunk.drawnVersion !== version && budget > 0) {
        this.draw(chunk, version);
        budget--;
      }
      if (chunk.sprite) chunk.sprite.visible = inView;
    }
  }

  private draw(chunk: Chunk, version: number): void {
    const world = this.world;
    const palette = this.palette;
    if (!world || !palette) return;
    const { width, height } = chunk;
    // New buffer each time: the previous texture may still be in use until it is destroyed.
    const pixels = new Uint8Array(width * height * BYTES_PER_PIXEL);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tileX = chunk.cx * VIEW.chunkTiles + x;
        const tileY = chunk.cy * VIEW.chunkTiles + y;
        writeTileColor(world, this.climate, palette, tileX, tileY, pixels, (y * width + x) * BYTES_PER_PIXEL);
      }
    }
    chunk.drawnVersion = version;
    // A fresh texture per redraw: updating a buffer texture in place did not reach the screen reliably.
    const texture = new Texture({ source: createSource(pixels, width, height) });
    if (chunk.sprite) {
      const previous = chunk.sprite.texture;
      chunk.sprite.texture = texture;
      previous.destroy(true);
      return;
    }
    const sprite = new Sprite(texture);
    sprite.position.set(chunk.cx * VIEW.chunkTiles, chunk.cy * VIEW.chunkTiles);
    this.container.addChild(sprite);
    chunk.sprite = sprite;
  }

  private clear(): void {
    for (const chunk of this.chunks) chunk.sprite?.destroy({ texture: true, textureSource: true });
    this.chunks = [];
    this.container.removeChildren();
  }
}

function createSource(pixels: Uint8Array, width: number, height: number): BufferImageSource {
  const source = new BufferImageSource({ resource: pixels, width, height, format: 'rgba8unorm', autoGenerateMipmaps: true });
  source.magFilter = 'nearest'; // crisp pixel art when zoomed in
  source.minFilter = 'linear'; // smooth (no shimmering) when zoomed out
  source.mipmapFilter = 'linear';
  return source;
}
