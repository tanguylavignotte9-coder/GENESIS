import { Container, Graphics, Sprite } from 'pixi.js';
import type { AnimalSpecies } from '../../sim/systems/fauna/params';
import type { FaunaSnapshot } from '../../shared/messages';
import type { TileRect } from '../map/map-view';
import { VIEW } from '../view-settings';
import { drawAnimal, type AnimalArt } from '../art/animal';
import { Glide, type GlidePoint } from './glide';

const RUN = 2;
/** Below this horizontal speed (tiles per hour) the animal keeps the side it faced (technical). */
const FACING_MIN_SPEED = 0.1;
const RING_RADIUS = 0.9;
const RING_COLOR = 0xffe27a;

/**
 * Small animal sprites (pooled), drawn when zoomed in; they glide from tile to tile and move their
 * legs while walking. The followed animal gets a ring.
 */
export class AnimalLayer {
  readonly container = new Container();
  private art: AnimalArt[] = [];
  /** Domestic animals: red collar and pied coat. */
  private domesticArt: AnimalArt[] = [];
  private readonly pool: Sprite[] = [];
  private fauna: FaunaSnapshot | null = null;
  /** Glide slot of each living animal (by uid); slots of the dead are reused. */
  private slots = new Map<number, number>();
  private seen = new Map<number, number>();
  private freeSlots: number[] = [];
  private nextSlot = 0;
  private readonly glide = new Glide(16384);
  private readonly point: GlidePoint = { x: 0, y: 0, gait: 0, headingX: 1, headingY: 0 };
  /** Side each animal faces (by glide slot): 1 right, -1 left. */
  private facing = new Int8Array(16384).fill(1);
  private readonly ring = new Graphics();
  followedUid = -1;

  constructor() {
    this.ring.circle(0, 0, RING_RADIUS).stroke({ color: RING_COLOR, width: 0.12 });
    this.ring.visible = false;
    this.container.addChild(this.ring);
  }

  setSpecies(species: readonly AnimalSpecies[]): void {
    [...this.art, ...this.domesticArt].forEach((entry) => entry.frames.forEach((texture) => texture.destroy(true)));
    this.art = species.map((animal) => drawAnimal(animal));
    this.domesticArt = species.map((animal) => drawAnimal(animal, true));
    this.fauna = null;
    this.slots.clear();
    this.freeSlots = [];
    this.nextSlot = 0;
    this.glide.clear();
  }

  /**
   * New positions from the simulation; `stepMs` = real duration of one animal step at the current
   * pace, `stepHours` its duration in game hours.
   */
  setFauna(fauna: FaunaSnapshot, now: number, stepMs: number, stepHours: number): void {
    const next = this.seen;
    next.clear();
    for (let k = 0; k < fauna.count; k++) {
      const uid = fauna.uid[k]!;
      let slot = this.slots.get(uid);
      if (slot === undefined) slot = this.freeSlots.pop() ?? this.nextSlot++;
      next.set(uid, slot);
      this.glide.set(slot, fauna.x[k]!, fauna.y[k]!, fauna.vx[k]!, fauna.vy[k]!, fauna.gait[k]!, now, stepMs, stepHours);
      if (slot >= this.facing.length) {
        const grown = new Int8Array(this.facing.length * 2).fill(1);
        grown.set(this.facing);
        this.facing = grown;
      }
      const vx = fauna.vx[k]!;
      if (vx > FACING_MIN_SPEED || vx < -FACING_MIN_SPEED) this.facing[slot] = vx < 0 ? -1 : 1;
    }
    for (const [uid, slot] of this.slots) {
      if (next.has(uid)) continue;
      this.glide.forget(slot);
      this.freeSlots.push(slot);
    }
    this.seen = this.slots;
    this.slots = next;
    this.fauna = fauna;
  }

  /** Position (tile coordinates, sprite center) of an animal, or null if it is gone. */
  positionOf(uid: number): { x: number; y: number } | null {
    const slot = this.slots.get(uid);
    if (slot === undefined) return null;
    const point = this.glide.at(slot, performance.now(), this.point);
    return { x: point.x, y: point.y };
  }

  /** Index (in the snapshot) of the animal nearest to a point, within `maxTiles`, or -1. */
  pick(tileX: number, tileY: number, maxTiles: number): number {
    const fauna = this.fauna;
    if (!fauna) return -1;
    let best = -1;
    let bestDistance = maxTiles * maxTiles;
    const now = performance.now();
    for (let k = 0; k < fauna.count; k++) {
      if (Math.abs(fauna.x[k]! - tileX) > maxTiles + 1 || Math.abs(fauna.y[k]! - tileY) > maxTiles + 1) continue;
      const slot = this.slots.get(fauna.uid[k]!);
      if (slot === undefined) continue;
      const spot = this.glide.at(slot, now, this.point);
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

  update(visible: TileRect, pixelsPerTile: number, now: number): void {
    const fauna = this.fauna;
    let used = 0;
    const point = this.point;
    if (fauna && pixelsPerTile >= VIEW.animalMinPixelsPerTile) {
      const frame = Math.floor(now / VIEW.walkFrameMs);
      const runFrame = Math.floor(now / VIEW.runFrameMs);
      for (let k = 0; k < fauna.count; k++) {
        const x = fauna.x[k]!;
        const y = fauna.y[k]!;
        if (x < visible.minX - 1 || x > visible.maxX + 1 || y < visible.minY - 1 || y > visible.maxY + 1) continue;
        const art = (fauna.domestic[k] === 1 ? this.domesticArt : this.art)[fauna.species[k]!];
        const uid = fauna.uid[k]!;
        const slot = this.slots.get(uid);
        if (!art || slot === undefined) continue;
        this.glide.at(slot, now, point);
        const running = point.gait === RUN;
        const stride = point.gait !== 0 ? 1 + (((running ? runFrame : frame) + uid) % 2) : 0;
        const texture = art.frames[stride]!;
        const sprite = this.sprite(used++);
        sprite.texture = texture;
        const scale = art.tiles / texture.width;
        sprite.scale.set(scale * this.facing[slot]!, scale);
        const bounce = stride === 1 ? (running ? VIEW.runBounceTiles : VIEW.walkBounceTiles) : 0;
        sprite.position.set(point.x, point.y - bounce);
        sprite.visible = true;
      }
    }
    for (let k = used; k < this.pool.length; k++) this.pool[k]!.visible = false;
    const followed = this.followedUid >= 0 ? this.positionOf(this.followedUid) : null;
    this.ring.visible = followed !== null && pixelsPerTile >= VIEW.animalMinPixelsPerTile;
    if (followed) this.ring.position.set(followed.x, followed.y);
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
