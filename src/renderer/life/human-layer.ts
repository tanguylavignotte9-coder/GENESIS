import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { HumanFlag, type HumansSnapshot, type Roster } from '../../shared/messages';
import { CHILD_SCALE, drawHuman, HUMAN_TILES } from '../art/human';
import { tileHash } from '../color';
import type { TileRect } from '../map/map-view';
import { VIEW } from '../view-settings';

const SPREAD = 0.5;
const CHILD_AGE = 14;
const VARIANTS = 64;
const RING_COLOR = 0x7fd4ff;
const RING_RADIUS = 0.75;

/** Humans, drawn with the procedural art of renderer/art (their buildings are in the building layer). */
export class HumanLayer {
  readonly container = new Container();
  private readonly peopleLayer = new Container();
  private readonly ring = new Graphics();
  private readonly pool: Sprite[] = [];
  private readonly textures = new Map<string, Texture>();
  private roster: Roster | null = null;
  private humans: HumansSnapshot | null = null;
  /** Person whose sheet is open / who is followed (-1 = none). */
  selected = -1;
  sleepActionCode = -1;

  constructor() {
    this.ring.circle(0, 0, RING_RADIUS).stroke({ color: RING_COLOR, width: 0.1 });
    this.ring.visible = false;
    this.container.addChild(this.peopleLayer, this.ring);
  }

  setRoster(roster: Roster): void {
    this.roster = roster;
    this.humans = null;
    this.selected = -1;
    this.sleepActionCode = roster.actionNames.indexOf('Dormir');
  }

  setHumans(humans: HumansSnapshot): void {
    this.humans = humans;
  }

  get snapshot(): HumansSnapshot | null {
    return this.humans;
  }

  /** Tile coordinates of a person's sprite, or null if unknown or dead. */
  positionOf(person: number): { x: number; y: number } | null {
    const humans = this.humans;
    if (!humans || person < 0 || person >= humans.x.length || (humans.flags[person]! & HumanFlag.Alive) === 0) return null;
    return this.spot(person, humans.x[person]!, humans.y[person]!);
  }

  /** Living person nearest to a point (tile coordinates), within `maxTiles`, or -1. */
  pick(tileX: number, tileY: number, maxTiles: number): number {
    const humans = this.humans;
    if (!humans) return -1;
    let best = -1;
    let bestDistance = maxTiles * maxTiles;
    for (let p = 0; p < humans.x.length; p++) {
      if ((humans.flags[p]! & HumanFlag.Alive) === 0) continue;
      const spot = this.spot(p, humans.x[p]!, humans.y[p]!);
      const d = (spot.x - tileX) ** 2 + (spot.y - tileY) ** 2;
      if (d < bestDistance) {
        best = p;
        bestDistance = d;
      }
    }
    return best;
  }

  update(visible: TileRect, pixelsPerTile: number): void {
    const humans = this.humans;
    const roster = this.roster;
    let used = 0;
    if (humans && roster && pixelsPerTile >= VIEW.animalMinPixelsPerTile) {
      for (let p = 0; p < humans.x.length; p++) {
        const x = humans.x[p]!;
        const y = humans.y[p]!;
        if ((humans.flags[p]! & HumanFlag.Alive) === 0) continue;
        if (x < visible.minX - 1 || x > visible.maxX + 1 || y < visible.minY - 1 || y > visible.maxY + 1) continue;
        const asleep = humans.action[p] === this.sleepActionCode && (humans.flags[p]! & HumanFlag.Working) !== 0;
        const texture = this.texture(roster.female[p] === 1, Math.floor(tileHash(p, 7, 3) * VARIANTS), asleep);
        const sprite = this.sprite(used++);
        const spot = this.spot(p, x, y);
        const child = roster.ageYears[p]! < CHILD_AGE ? CHILD_SCALE : 1;
        sprite.texture = texture;
        sprite.scale.set((HUMAN_TILES * child) / (asleep ? texture.height : texture.width));
        sprite.position.set(spot.x, spot.y);
        sprite.visible = true;
      }
    }
    for (let k = used; k < this.pool.length; k++) this.pool[k]!.visible = false;
    const selected = this.positionOf(this.selected);
    this.ring.visible = selected !== null && pixelsPerTile >= VIEW.animalMinPixelsPerTile;
    if (selected) this.ring.position.set(selected.x, selected.y);
  }

  private spot(person: number, x: number, y: number): { x: number; y: number } {
    return { x: x + 0.5 + (tileHash(person, 1, 8) - 0.5) * SPREAD, y: y + 0.5 + (tileHash(person, 2, 8) - 0.5) * SPREAD };
  }

  private texture(female: boolean, variant: number, asleep: boolean): Texture {
    const key = `${female ? 1 : 0}:${variant}:${asleep ? 1 : 0}`;
    let texture = this.textures.get(key);
    if (!texture) {
      texture = drawHuman({ female, variant, asleep });
      this.textures.set(key, texture);
    }
    return texture;
  }

  private sprite(index: number): Sprite {
    let sprite = this.pool[index];
    if (!sprite) {
      sprite = new Sprite();
      sprite.anchor.set(0.5, 0.8);
      this.pool.push(sprite);
      this.peopleLayer.addChild(sprite);
    }
    return sprite;
  }
}
