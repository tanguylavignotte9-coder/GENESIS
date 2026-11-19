import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { BuildingsSnapshot, BuildingView, LifeTables } from '../../shared/messages';
import { buildingTiles, drawBelongings, drawBuilding, drawHeap, drawSite, type BuildingLook } from '../art/building';
import type { TileRect } from '../map/map-view';
import { VIEW } from '../view-settings';

const SITE = 0;
const ABANDONED = 2;
const ABANDONED_TINT = 0x8a8a8a;
const BAR_WIDTH = 1;
const BAR_HEIGHT = 0.12;
const BAR_BACK = 0x202020;
const BAR_FILL = 0xe0c060;
const SELECT_COLOR = 0x7fd4ff;
const HEAP_TILES = 0.7;
const BELONGINGS_TILES = 0.45;
/** Heap drawn bigger as goods pile up (bulk per extra tile of size, display only). */
const HEAP_BULK_PER_TILE = 150;
const FILL_STEPS = 4;

/** Buildings, construction sites (with their progress) and the open heaps of the camps' stocks. */
export class BuildingLayer {
  readonly container = new Container();
  private readonly sprites: Sprite[] = [];
  private readonly bars = new Graphics();
  private readonly ring = new Graphics();
  private readonly textures = new Map<string, Texture>();
  private readonly site: Texture;
  private readonly heap: Texture;
  private readonly belongings: Texture;
  private tables: LifeTables | null = null;
  private snapshot: BuildingsSnapshot | null = null;
  /** Building whose panel is open (-1 = none). */
  selected = -1;

  constructor() {
    this.site = drawSite();
    this.heap = drawHeap();
    this.belongings = drawBelongings();
    this.container.addChild(this.bars, this.ring);
  }

  setTables(tables: LifeTables): void {
    this.tables = tables;
    this.textures.clear();
  }

  setBuildings(snapshot: BuildingsSnapshot): void {
    this.snapshot = snapshot;
  }

  get buildings(): readonly BuildingView[] {
    return this.snapshot?.buildings ?? [];
  }

  /** Building under a point (tile coordinates), or -1; the most recent wins when two overlap. */
  pick(tileX: number, tileY: number): number {
    let best = -1;
    let bestDistance = VIEW.buildingPickTiles ** 2;
    for (const building of this.buildings) {
      const d = (building.x + 0.5 - tileX) ** 2 + (building.y + 0.4 - tileY) ** 2;
      if (d <= bestDistance) {
        best = building.id;
        bestDistance = d;
      }
    }
    return best;
  }

  update(visible: TileRect): void {
    const tables = this.tables;
    const snapshot = this.snapshot;
    this.bars.clear();
    this.ring.clear();
    let used = 0;
    if (tables && snapshot) {
      for (const building of snapshot.buildings) {
        if (building.x < visible.minX - 2 || building.x > visible.maxX + 2 || building.y < visible.minY - 2 || building.y > visible.maxY + 2) continue;
        const type = tables.buildings[building.type];
        if (!type) continue;
        const look: BuildingLook = { id: type.id, function: type.function, lit: building.lit, crop: building.crop, fill: Math.round(building.fill * FILL_STEPS) / FILL_STEPS };
        const sprite = this.sprite(used++);
        const site = building.state === SITE;
        const texture = site ? this.site : this.texture(look);
        const tiles = site ? Math.min(1.2, buildingTiles(look)) : buildingTiles(look);
        sprite.texture = texture;
        sprite.scale.set(tiles / texture.width);
        sprite.position.set(building.x + 0.5, building.y + 0.5);
        sprite.tint = building.state === ABANDONED ? ABANDONED_TINT : 0xffffff;
        sprite.visible = true;
        if (site) {
          const left = building.x + 0.5 - BAR_WIDTH / 2;
          const top = building.y + 0.75;
          this.bars.rect(left, top, BAR_WIDTH, BAR_HEIGHT).fill(BAR_BACK);
          this.bars.rect(left, top, BAR_WIDTH * building.progress, BAR_HEIGHT).fill(BAR_FILL);
        }
        if (building.id === this.selected) this.ring.circle(building.x + 0.5, building.y + 0.3, tiles * 0.6).stroke({ color: SELECT_COLOR, width: 0.08 });
      }
      for (const heap of snapshot.heaps) {
        if (heap.x < visible.minX - 2 || heap.x > visible.maxX + 2 || heap.y < visible.minY - 2 || heap.y > visible.maxY + 2) continue;
        const sprite = this.sprite(used++);
        sprite.texture = this.heap;
        const tiles = HEAP_TILES * Math.min(2, 1 + heap.bulk / HEAP_BULK_PER_TILE);
        sprite.scale.set(tiles / this.heap.width);
        sprite.position.set(heap.x + 0.95, heap.y + 0.9);
        sprite.tint = 0xffffff;
        sprite.visible = true;
      }
      for (const lying of snapshot.belongings) {
        if (lying.x < visible.minX - 1 || lying.x > visible.maxX + 1 || lying.y < visible.minY - 1 || lying.y > visible.maxY + 1) continue;
        const sprite = this.sprite(used++);
        sprite.texture = this.belongings;
        sprite.scale.set(BELONGINGS_TILES / this.belongings.width);
        sprite.position.set(lying.x, lying.y + 0.15);
        sprite.tint = 0xffffff;
        sprite.visible = true;
      }
    }
    for (let k = used; k < this.sprites.length; k++) this.sprites[k]!.visible = false;
  }

  private texture(look: BuildingLook): Texture {
    const key = `${look.id}:${look.lit ? 1 : 0}:${look.crop}:${look.fill}`;
    let texture = this.textures.get(key);
    if (!texture) {
      texture = drawBuilding(look);
      this.textures.set(key, texture);
    }
    return texture;
  }

  private sprite(index: number): Sprite {
    let sprite = this.sprites[index];
    if (!sprite) {
      sprite = new Sprite();
      sprite.anchor.set(0.5, 0.8);
      this.sprites.push(sprite);
      this.container.addChildAt(sprite, this.container.children.length - 2);
    }
    return sprite;
  }
}
