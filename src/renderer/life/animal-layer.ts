import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { AnimalSpecies } from '../../sim/systems/fauna/params';
import type { FaunaSnapshot } from '../../shared/messages';
import { tileHash } from '../color';
import type { TileRect } from '../map/map-view';
import { VIEW } from '../view-settings';
import { drawAnimal } from './animal-sprites';

/** Animals of a herd are spread a little around their tile so they do not overlap exactly. */
const SPREAD = 0.6;
const RING_RADIUS = 0.9;
const RING_COLOR = 0xffe27a;

/** Small animal sprites (pooled), drawn when zoomed in; the followed animal gets a ring. */
export class AnimalLayer {
  readonly container = new Container();
  private textures: { texture: Texture; tiles: number }[] = [];
  private readonly pool: Sprite[] = [];
  private fauna: FaunaSnapshot | null = null;
  /** Last known x of each animal, to face the way it walks. */
  private facing = new Map<number, number>();
  private previousX = new Map<number, number>();
  private readonly ring = new Graphics();
  followedUid = -1;

  constructor() {
    this.ring.circle(0, 0, RING_RADIUS).stroke({ color: RING_COLOR, width: 0.12 });
    this.ring.visible = false;
    this.container.addChild(this.ring);
  }

  setSpecies(species: readonly AnimalSpecies[]): void {
    this.textures.forEach((entry) => entry.texture.destroy(true));
    this.textures = species.map((animal) => drawAnimal(animal));
    this.fauna = null;
    this.facing.clear();
    this.previousX.clear();
  }

  setFauna(fauna: FaunaSnapshot): void {
    const nextX = new Map<number, number>();
    for (let k = 0; k < fauna.count; k++) {
      const uid = fauna.uid[k]!;
      const x = fauna.x[k]!;
      const before = this.previousX.get(uid);
      if (before !== undefined && before !== x) this.facing.set(uid, x < before ? -1 : 1);
      nextX.set(uid, x);
    }
    for (const uid of this.facing.keys()) if (!nextX.has(uid)) this.facing.delete(uid);
    this.previousX = nextX;
    this.fauna = fauna;
  }

  /** Position (tile coordinates, sprite center) of an animal, or null if it is gone. */
  positionOf(uid: number): { x: number; y: number } | null {
    const fauna = this.fauna;
    if (!fauna) return null;
    for (let k = 0; k < fauna.count; k++) if (fauna.uid[k] === uid) return this.spot(uid, fauna.x[k]!, fauna.y[k]!);
    return null;
  }

  /** Index (in the snapshot) of the animal nearest to a point, within `maxTiles`, or -1. */
  pick(tileX: number, tileY: number, maxTiles: number): number {
    const fauna = this.fauna;
    if (!fauna) return -1;
    let best = -1;
    let bestDistance = maxTiles * maxTiles;
    for (let k = 0; k < fauna.count; k++) {
      const spot = this.spot(fauna.uid[k]!, fauna.x[k]!, fauna.y[k]!);
      const d = (spot.x - tileX) ** 2 + (spot.y - tileY) ** 2;
      if (d < bestDistance) {
        best = k;
        bestDistance = d;
      }
    }
    return best;
  }

  get snapshot(): FaunaSnapshot | null {
    return this.fauna;
  }

  update(visible: TileRect, pixelsPerTile: number): void {
    const fauna = this.fauna;
    let used = 0;
    if (fauna && pixelsPerTile >= VIEW.animalMinPixelsPerTile) {
      for (let k = 0; k < fauna.count; k++) {
        const x = fauna.x[k]!;
        const y = fauna.y[k]!;
        if (x < visible.minX - 1 || x > visible.maxX + 1 || y < visible.minY - 1 || y > visible.maxY + 1) continue;
        const art = this.textures[fauna.species[k]!];
        if (!art) continue;
        const sprite = this.sprite(used++);
        const uid = fauna.uid[k]!;
        const spot = this.spot(uid, x, y);
        sprite.texture = art.texture;
        const scale = art.tiles / art.texture.width;
        sprite.scale.set(scale * (this.facing.get(uid) ?? 1), scale);
        sprite.position.set(spot.x, spot.y);
        sprite.visible = true;
      }
    }
    for (let k = used; k < this.pool.length; k++) this.pool[k]!.visible = false;
    const followed = this.followedUid >= 0 ? this.positionOf(this.followedUid) : null;
    this.ring.visible = followed !== null && pixelsPerTile >= VIEW.animalMinPixelsPerTile;
    if (followed) this.ring.position.set(followed.x, followed.y);
  }

  private spot(uid: number, x: number, y: number): { x: number; y: number } {
    return { x: x + 0.5 + (tileHash(uid, 1, 5) - 0.5) * SPREAD, y: y + 0.5 + (tileHash(uid, 2, 5) - 0.5) * SPREAD };
  }

  private sprite(index: number): Sprite {
    let sprite = this.pool[index];
    if (!sprite) {
      sprite = new Sprite();
      sprite.anchor.set(0.5, 0.7);
      this.pool.push(sprite);
      this.container.addChildAt(sprite, this.container.children.length - 1);
    }
    return sprite;
  }
}
