import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { HumanFlag, type HumansSnapshot, type Roster } from '../../shared/messages';
import { CHILD_SCALE, drawHuman, HUMAN_TILES, type HumanView } from '../art/human';
import { tileHash } from '../color';
import type { TileRect } from '../map/map-view';
import { VIEW } from '../view-settings';
import { Glide, type GlidePoint } from './glide';

const CHILD_AGE = 14;
const RUN = 2;
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
  private readonly glide = new Glide();
  private readonly point: GlidePoint = { x: 0, y: 0, gait: 0, headingX: 1, headingY: 0 };
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
    this.glide.clear();
    this.selected = -1;
    this.sleepActionCode = roster.actionNames.indexOf('Dormir');
  }

  /** The roster changed (births, deaths, ages): keep the positions and the selection. */
  updateRoster(roster: Roster): void {
    this.roster = roster;
  }

  /**
   * New positions from the simulation; `stepMs` = real duration of one human step at the current
   * pace, `stepHours` its duration in game hours.
   */
  setHumans(humans: HumansSnapshot, now: number, stepMs: number, stepHours: number): void {
    this.humans = humans;
    for (let p = 0; p < humans.x.length; p++) {
      if ((humans.flags[p]! & HumanFlag.Alive) === 0) {
        this.glide.forget(p);
        continue;
      }
      this.glide.set(p, humans.x[p]!, humans.y[p]!, humans.vx[p]!, humans.vy[p]!, humans.gait[p]!, now, stepMs, stepHours);
    }
  }

  get snapshot(): HumansSnapshot | null {
    return this.humans;
  }

  /** Tile coordinates of a person's sprite, or null if unknown or dead. */
  positionOf(person: number): { x: number; y: number } | null {
    const humans = this.humans;
    if (!humans || person < 0 || person >= humans.x.length || (humans.flags[person]! & HumanFlag.Alive) === 0) return null;
    const point = this.glide.at(person, performance.now(), this.point);
    return { x: point.x, y: point.y };
  }

  /** Living person nearest to a point (tile coordinates), within `maxTiles`, or -1. */
  pick(tileX: number, tileY: number, maxTiles: number): number {
    const humans = this.humans;
    if (!humans) return -1;
    let best = -1;
    let bestDistance = maxTiles * maxTiles;
    const now = performance.now();
    for (let p = 0; p < humans.x.length; p++) {
      if ((humans.flags[p]! & HumanFlag.Alive) === 0) continue;
      const spot = this.glide.at(p, now, this.point);
      const d = (spot.x - tileX) ** 2 + (spot.y - tileY) ** 2;
      if (d < bestDistance) {
        best = p;
        bestDistance = d;
      }
    }
    return best;
  }

  update(visible: TileRect, pixelsPerTile: number, now: number): void {
    const humans = this.humans;
    const roster = this.roster;
    let used = 0;
    const point = this.point;
    if (humans && roster && pixelsPerTile >= VIEW.animalMinPixelsPerTile) {
      for (let p = 0; p < humans.x.length; p++) {
        const x = humans.x[p]!;
        const y = humans.y[p]!;
        if ((humans.flags[p]! & HumanFlag.Alive) === 0) continue;
        if (x < visible.minX - 1 || x > visible.maxX + 1 || y < visible.minY - 1 || y > visible.maxY + 1) continue;
        const asleep = humans.action[p] === this.sleepActionCode && (humans.flags[p]! & HumanFlag.Working) !== 0;
        this.glide.at(p, now, point);
        // Walking or running: two strides in turn (quicker when running), with a small bounce on the first.
        const running = point.gait === RUN;
        const frameMs = running ? VIEW.runFrameMs : VIEW.walkFrameMs;
        const stride = point.gait !== 0 && !asleep ? 1 + ((Math.floor(now / frameMs) + p) % 2) : 0;
        // Looking where one goes: from the front, the back, or the side (mirrored to the left).
        const across = Math.abs(point.headingX) >= Math.abs(point.headingY);
        const view: HumanView = across ? 'side' : point.headingY > 0 ? 'front' : 'back';
        const armed = !asleep && (humans.flags[p]! & HumanFlag.Fighting) !== 0;
        const texture = this.texture(roster.female[p] === 1, Math.floor(tileHash(p, 7, 3) * VARIANTS), asleep, view, stride, running, armed);
        const sprite = this.sprite(used++);
        const child = roster.ageYears[p]! < CHILD_AGE ? CHILD_SCALE : 1;
        const scale = (HUMAN_TILES * child * (armed ? 8 / 6 : 1)) / (asleep ? texture.height : texture.width);
        sprite.texture = texture;
        sprite.scale.set(view === 'side' && point.headingX < 0 && !asleep ? -scale : scale, scale);
        const bounce = stride === 1 ? (running ? VIEW.runBounceTiles : VIEW.walkBounceTiles) : 0;
        sprite.position.set(point.x, point.y - bounce);
        sprite.visible = true;
      }
    }
    for (let k = used; k < this.pool.length; k++) this.pool[k]!.visible = false;
    const selected = this.positionOf(this.selected);
    this.ring.visible = selected !== null && pixelsPerTile >= VIEW.animalMinPixelsPerTile;
    if (selected) this.ring.position.set(selected.x, selected.y);
  }

  private texture(female: boolean, variant: number, asleep: boolean, view: HumanView, stride: number, running: boolean, armed: boolean): Texture {
    const key = `${female ? 1 : 0}:${variant}:${asleep ? 1 : 0}:${view}:${stride}:${running ? 1 : 0}:${armed ? 1 : 0}`;
    let texture = this.textures.get(key);
    if (!texture) {
      texture = drawHuman({ female, variant, asleep, view, stride, running, armed });
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
