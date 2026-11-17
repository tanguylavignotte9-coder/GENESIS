import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js';
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
  sprite: Sprite | null;
  built: boolean;
}

/**
 * Pixel-art map split into square chunks (one small texture each, one pixel per tile).
 * Chunks are built lazily when they first become visible, a few per frame.
 */
export class MapView {
  readonly container = new Container();
  private world: WorldSnapshot | null = null;
  private palette: Palette | null = null;
  private chunks: Chunk[] = [];
  private chunksPerSide = 0;

  setWorld(world: WorldSnapshot): void {
    this.clear();
    this.world = world;
    this.palette = buildPalette(world);
    this.chunksPerSide = Math.ceil(world.size / VIEW.chunkTiles);
    this.chunks = Array.from({ length: this.chunksPerSide * this.chunksPerSide }, () => ({ sprite: null, built: false }));
  }

  /** Shows the chunks inside `visible`, building at most `VIEW.chunksPerFrame` new ones. */
  update(visible: TileRect): void {
    if (!this.world) return;
    const first = (value: number): number => Math.max(0, Math.floor(value / VIEW.chunkTiles));
    const last = (value: number): number => Math.min(this.chunksPerSide - 1, Math.floor(value / VIEW.chunkTiles));
    const x0 = first(visible.minX);
    const x1 = last(visible.maxX);
    const y0 = first(visible.minY);
    const y1 = last(visible.maxY);
    let budget: number = VIEW.chunksPerFrame;
    for (let cy = 0; cy < this.chunksPerSide; cy++) {
      for (let cx = 0; cx < this.chunksPerSide; cx++) {
        const chunk = this.chunks[cy * this.chunksPerSide + cx];
        if (!chunk) continue;
        const inView = cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
        if (inView && !chunk.built && budget > 0) {
          this.build(chunk, cx, cy);
          budget--;
        }
        if (chunk.sprite) chunk.sprite.visible = inView;
      }
    }
  }

  private build(chunk: Chunk, cx: number, cy: number): void {
    const world = this.world;
    const palette = this.palette;
    if (!world || !palette) return;
    const width = Math.min(VIEW.chunkTiles, world.size - cx * VIEW.chunkTiles);
    const height = Math.min(VIEW.chunkTiles, world.size - cy * VIEW.chunkTiles);
    const pixels = new Uint8Array(width * height * BYTES_PER_PIXEL);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        writeTileColor(world, palette, cx * VIEW.chunkTiles + x, cy * VIEW.chunkTiles + y, pixels, (y * width + x) * BYTES_PER_PIXEL);
      }
    }
    const source = new BufferImageSource({ resource: pixels, width, height, format: 'rgba8unorm', autoGenerateMipmaps: true });
    source.magFilter = 'nearest'; // crisp pixel art when zoomed in
    source.minFilter = 'linear'; // smooth (no shimmering) when zoomed out
    source.mipmapFilter = 'linear';
    const sprite = new Sprite(new Texture({ source }));
    sprite.position.set(cx * VIEW.chunkTiles, cy * VIEW.chunkTiles);
    this.container.addChild(sprite);
    chunk.sprite = sprite;
    chunk.built = true;
  }

  private clear(): void {
    for (const chunk of this.chunks) chunk.sprite?.destroy({ texture: true, textureSource: true });
    this.chunks = [];
    this.container.removeChildren();
  }
}
