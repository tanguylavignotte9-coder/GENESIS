import { Container, Sprite, type Texture } from 'pixi.js';
import type { PlantSpecies } from '../../sim/systems/flora/params';
import type { FloraSnapshot } from '../../shared/messages';
import { tileHash } from '../color';
import type { TileRect } from '../map/map-view';
import { VIEW } from '../view-settings';
import { drawPlant } from '../art/plant';

const GROWTH_MAX = 255;
const MIN_SCALE = 0.35;
/** Plants stand on the lower part of their tile. */
const GROUND_Y = 0.85;
const JITTER = 0.25;

interface PlantChunk {
  container: Container | null;
  version: number;
}

/**
 * Trees, shrubs and useful plants drawn one by one when zoomed in, chunk by chunk
 * (only visible chunks exist; they are rebuilt when the plants change).
 */
export class PlantLayer {
  readonly container = new Container({ sortableChildren: true });
  private textures: { texture: Texture; tiles: number }[] = [];
  private flora: FloraSnapshot | null = null;
  private version = 0;
  private chunks: PlantChunk[] = [];
  private chunksPerSide = 0;
  private size = 0;

  setSpecies(species: readonly PlantSpecies[], size: number): void {
    this.clear();
    this.textures.forEach((entry) => entry.texture.destroy(true));
    this.textures = species.map((plant, k) => drawPlant(plant, k + 1));
    this.size = size;
    this.chunksPerSide = Math.ceil(size / VIEW.chunkTiles);
    this.chunks = Array.from({ length: this.chunksPerSide * this.chunksPerSide }, () => ({ container: null, version: -1 }));
    this.flora = null;
  }

  setFlora(flora: FloraSnapshot): void {
    this.flora = flora;
    this.version++;
  }

  update(visible: TileRect, pixelsPerTile: number): void {
    const show = pixelsPerTile >= VIEW.plantMinPixelsPerTile && this.flora !== null;
    this.container.visible = show;
    const first = (value: number): number => Math.max(0, Math.floor(value / VIEW.chunkTiles) - 1);
    const last = (value: number): number => Math.min(this.chunksPerSide - 1, Math.floor(value / VIEW.chunkTiles));
    let budget: number = VIEW.plantChunksPerFrame;
    this.chunks.forEach((chunk, index) => {
      const cx = index % this.chunksPerSide;
      const cy = (index - cx) / this.chunksPerSide;
      const inView = show && cx >= first(visible.minX) && cx <= last(visible.maxX) && cy >= first(visible.minY) && cy <= last(visible.maxY);
      if (!inView) {
        this.drop(chunk);
        return;
      }
      if (chunk.version !== this.version && budget > 0) {
        budget--;
        this.build(chunk, cx, cy);
      }
    });
  }

  private build(chunk: PlantChunk, cx: number, cy: number): void {
    const flora = this.flora;
    if (!flora) return;
    this.drop(chunk);
    const container = new Container();
    const x0 = cx * VIEW.chunkTiles;
    const y0 = cy * VIEW.chunkTiles;
    for (let y = y0; y < Math.min(this.size, y0 + VIEW.chunkTiles); y++) {
      for (let x = x0; x < Math.min(this.size, x0 + VIEW.chunkTiles); x++) {
        const code = flora.species[y * this.size + x]!;
        const art = code === 0 ? undefined : this.textures[code - 1];
        if (!art) continue;
        const growth = flora.growth[y * this.size + x]! / GROWTH_MAX;
        const sprite = new Sprite(art.texture);
        const width = art.tiles * (MIN_SCALE + (1 - MIN_SCALE) * growth);
        sprite.anchor.set(0.5, 1);
        sprite.scale.set(width / art.texture.width);
        sprite.position.set(x + 0.5 + (tileHash(x, y, 9) - 0.5) * JITTER, y + GROUND_Y + (tileHash(x, y, 11) - 0.5) * JITTER);
        container.addChild(sprite);
      }
    }
    chunk.container = container;
    chunk.version = this.version;
    // Chunks further south are drawn on top, so trees overlap the ones behind them.
    container.zIndex = cy;
    this.container.addChild(container);
  }

  private drop(chunk: PlantChunk): void {
    if (!chunk.container) return;
    chunk.container.destroy({ children: true });
    chunk.container = null;
    chunk.version = -1;
  }

  private clear(): void {
    this.chunks.forEach((chunk) => this.drop(chunk));
  }
}
