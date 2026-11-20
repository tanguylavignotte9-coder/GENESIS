import { Container, Graphics, Text } from 'pixi.js';
import type { GroupsFacts } from '../../shared/messages';
import { drawTribeBanner, tribeColor, tribeLabelStyle } from '../art/tribe';

/** Lift of the name above the camp's heart, in screen pixels. */
const LABEL_LIFT_PIXELS = 18;
const BANNER_MIN_PIXELS_PER_TILE = 4;

/** Each tribe recognizable on the map: a banner of its color at its camp, and its name above. */
export class TribeLayer {
  readonly container = new Container();
  private readonly banners = new Graphics();
  private readonly labels = new Map<number, Text>();
  private facts: GroupsFacts | null = null;

  constructor() {
    this.container.addChild(this.banners);
  }

  setGroups(facts: GroupsFacts): void {
    this.facts = facts;
  }

  clear(): void {
    this.facts = null;
  }

  update(pixelsPerTile: number): void {
    this.banners.clear();
    const shown = new Set<number>();
    for (const group of this.facts?.groups ?? []) {
      if (group.level !== 0 || group.campX < 0) continue;
      const x = group.campX + 0.5;
      const y = group.campY + 0.5;
      const color = tribeColor(group.id);
      if (pixelsPerTile >= BANNER_MIN_PIXELS_PER_TILE) drawTribeBanner(this.banners, x + 0.6, y, color);
      let label = this.labels.get(group.id);
      if (!label) {
        label = new Text({ text: '', style: tribeLabelStyle(color) });
        label.anchor.set(0.5, 1);
        this.labels.set(group.id, label);
        this.container.addChild(label);
      }
      const text = `${group.name.charAt(0).toUpperCase()}${group.name.slice(1)} (${group.members})`;
      if (label.text !== text) label.text = text;
      label.scale.set(1 / pixelsPerTile);
      label.position.set(x, y - Math.max(1.3, LABEL_LIFT_PIXELS / pixelsPerTile));
      label.visible = true;
      shown.add(group.id);
    }
    for (const [id, label] of this.labels) if (!shown.has(id)) label.visible = false;
  }
}
