import { Graphics } from 'pixi.js';
import type { GroupsFacts } from '../../shared/messages';
import { drawCampTie, drawTerritory, ideaColor, tribeColor } from '../art/tribe';

/** Layers of the political view, each one shown or hidden by the spectator. */
export const POLITICAL_LAYERS = [
  { id: 'territory', label: 'Territoires' },
  { id: 'culture', label: 'Cultures' },
  { id: 'language', label: 'Langues' },
  { id: 'religion', label: 'Religions' },
  { id: 'ties', label: 'Alliances et guerres' },
] as const;
export type PoliticalLayerId = (typeof POLITICAL_LAYERS)[number]['id'];

/** Radius of a tribe's land: a little more for a bigger tribe (tile units). */
function landRadius(members: number): number {
  return 6 + Math.sqrt(Math.max(1, members)) * 1.8;
}

const TIE_COLORS = { alliance: 0x6cc070, war: 0xe05050, truce: 0xc0c0c0, tribute: 0xe0b040 } as const;

/**
 * Political view (P): over the map, the lands of the tribes, the cultures, languages and
 * religions they share (one colour per idea), and the alliances, wars, truces and tributes
 * between their camps. Redrawn only when the groups or the chosen layers change.
 */
export class PoliticalLayer {
  readonly graphics = new Graphics();
  readonly shown = new Set<PoliticalLayerId>();
  private facts: GroupsFacts | null = null;
  private dirty = true;

  setGroups(facts: GroupsFacts): void {
    this.facts = facts;
    this.dirty = true;
  }

  clear(): void {
    this.facts = null;
    this.dirty = true;
  }

  toggle(layer: PoliticalLayerId, on: boolean): void {
    if (on) this.shown.add(layer);
    else this.shown.delete(layer);
    this.dirty = true;
  }

  update(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const g = this.graphics;
    g.clear();
    const tribes = (this.facts?.groups ?? []).filter((group) => group.level === 0 && group.campX >= 0);
    // One ring per layer, the widest inside: several layers stay readable together.
    const rings = ['territory', 'culture', 'language', 'religion'] as const;
    for (const tribe of tribes) {
      const x = tribe.campX + 0.5;
      const y = tribe.campY + 0.5;
      const radius = landRadius(tribe.members);
      let k = 0;
      for (const layer of rings) {
        if (!this.shown.has(layer)) continue;
        const id = layer === 'territory' ? tribe.id : tribe[layer];
        if (layer !== 'territory' && id < 0) continue;
        const color = layer === 'territory' ? tribeColor(id) : ideaColor(id * 4 + rings.indexOf(layer));
        drawTerritory(g, x, y, Math.max(2, radius - k * 1.6), color, layer === 'territory' ? 0.8 : 0.7);
        k++;
      }
    }
    if (!this.shown.has('ties')) return;
    const camps = new Map(tribes.map((tribe) => [tribe.id, { x: tribe.campX + 0.5, y: tribe.campY + 0.5 }]));
    const drawn = new Set<string>();
    for (const tribe of tribes) {
      for (const known of tribe.known) {
        const a = camps.get(tribe.id);
        const b = camps.get(known.group);
        const key = `${Math.min(tribe.id, known.group)}:${Math.max(tribe.id, known.group)}`;
        if (!a || !b || drawn.has(key)) continue;
        drawn.add(key);
        const r = known.relation;
        if (r.war) drawCampTie(g, a.x, a.y, b.x, b.y, TIE_COLORS.war, 0.6, false);
        else if (r.tribute !== 0) drawCampTie(g, a.x, a.y, b.x, b.y, TIE_COLORS.tribute, 0.5, false);
        else if (r.truce) drawCampTie(g, a.x, a.y, b.x, b.y, TIE_COLORS.truce, 0.4, true);
        else if (known.allied) drawCampTie(g, a.x, a.y, b.x, b.y, TIE_COLORS.alliance, 0.5, false);
      }
    }
  }
}
