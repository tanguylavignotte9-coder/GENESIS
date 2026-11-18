import { fillTemplate } from '../../core/text';
import { describeLocation } from '../world/places';
import type { Building } from './buildings';
import type { WantReason } from './camps';
import type { Recipe } from './catalog';
import type { ProductionSystem } from './production-system';

export const SITE_STARTED = 'production.site';
export const BUILDING_DONE = 'production.building';
export const FIRST_ITEM = 'production.firstItem';

const VOWELS = /^[aeiouyàâéèêëîïôöûüœ]/i;

/** "une hutte", "un fumoir" */
export function withIndefinite(name: string, feminine: boolean): string {
  return `${feminine ? 'une' : 'un'} ${name.toLowerCase()}`;
}

/** "La hutte", "Le feu de camp", "L’abri sommaire" (start of a sentence). */
export function withDefinite(name: string, feminine: boolean): string {
  const lower = name.toLowerCase();
  if (VOWELS.test(lower)) return `L’${lower}`;
  return `${feminine ? 'La' : 'Le'} ${lower}`;
}

/** "Ka", "Ka et Lo", "Ka, Lo et Mi" */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

function placeOf(sys: ProductionSystem, tile: number): { x: number; y: number; label: string } {
  const x = tile % sys.size;
  const y = Math.floor(tile / sys.size);
  return { x, y, label: describeLocation(sys.world.landmasses, sys.world.landmassNames, x, y, sys.size) };
}

/** Someone opens a site: who, what, and why (the collective need it answers). */
export function publishSiteStarted(sys: ProductionSystem, building: Building, person: number, reason: WantReason, recipe: Recipe | null): number {
  const def = sys.typeOf(building).def;
  const reasons = sys.params.texts.reasons;
  const why = fillTemplate(reasons[reason], { recette: recipe?.def.name.toLowerCase() ?? '', n: String(Math.max(1, Math.round(1 / Math.max(def.wantPerMember, 1e-6)))) });
  return sys.journal.publish({
    tick: sys.tick,
    type: SITE_STARTED,
    text: fillTemplate(sys.params.texts.siteStarted, { nom: sys.people.name(person), un_batiment: withIndefinite(def.name, def.feminine), raison: why }),
    place: placeOf(sys, building.tile),
    actors: [{ kind: 'human', id: person }],
    // A fire, shelters or a cache rebuilt after the camp moved are caused by the move.
    causes: reason !== 'station' && reason !== 'perMember' && sys.camps[building.camp]!.settleEvent >= 0 ? [sys.camps[building.camp]!.settleEvent] : [],
    details: { building: def.id, reason },
  });
}

/** A building is finished: the journal names its builders; its cause is the opening of the site. */
export function publishBuildingDone(sys: ProductionSystem, building: Building): void {
  if (building.builders.length === 0) return;
  const def = sys.typeOf(building).def;
  const place = placeOf(sys, building.tile);
  sys.journal.publish({
    tick: sys.tick,
    type: BUILDING_DONE,
    text: fillTemplate(sys.params.texts.buildingDone, {
      le_batiment: withDefinite(def.name, def.feminine),
      e: def.feminine ? 'e' : '',
      lieu: place.label,
      noms: listNames(building.builders.map((person) => sys.people.name(person))),
    }),
    place,
    actors: building.builders.map((person) => ({ kind: 'human', id: person })),
    causes: building.startEvent >= 0 ? [building.startEvent] : [],
    details: { building: def.id, id: building.id },
  });
}

/** The first object of its kind ever made by the tribe. */
export function publishFirstItem(sys: ProductionSystem, person: number, item: number, tile: number): void {
  const def = sys.catalog.items[item]!;
  sys.journal.publish({
    tick: sys.tick,
    type: FIRST_ITEM,
    text: fillTemplate(sys.params.texts.firstItem, { nom: sys.people.name(person), un_objet: withIndefinite(def.name, def.feminine) }),
    place: placeOf(sys, tile),
    actors: [{ kind: 'human', id: person }],
    causes: [],
    details: { item: def.id },
  });
}
