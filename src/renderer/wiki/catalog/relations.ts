/**
 * The links between generated pages: what an entry needs, where it comes from, what it is used for.
 * Everything is read from the data (never written by hand), so a new species, recipe or building
 * gets its links on its own.
 */
import type { Block } from '../model';
import { at, isRecord, label, link, links, list, str, strings, type CatalogContext, type Entry } from './context';

type Line = [labelKey: string, value: string];

function lines(ctx: CatalogContext, heading: string, items: readonly Line[]): Block[] {
  const shown = items.filter(([, value]) => value !== '' && value !== '—');
  if (shown.length === 0) return [];
  return [{ kind: 'heading', text: label(ctx, heading) }, { kind: 'list', items: shown.map(([key, value]) => `**${label(ctx, key)}** ${value}`) }];
}

function ids(entries: readonly Entry[]): string[] {
  return entries.map((entry) => str(entry, 'id'));
}

/** Keys of a record whose value is a non-zero number (habitat weights, trait effects…). */
function positiveKeys(value: unknown): string[] {
  return isRecord(value) ? Object.entries(value).filter(([, v]) => typeof v === 'number' && v !== 0).map(([k]) => k) : [];
}

function parts(entry: Entry, field: string): Entry[] {
  const value = entry[field];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function recipes(ctx: CatalogContext): Entry[] {
  return list(ctx.raw.recipes, 'recipes');
}

function recipeItems(recipe: Entry, field: 'inputs' | 'outputs'): string[] {
  return field === 'outputs' ? parts(recipe, field).map((part) => str(part, 'item')) : parts(recipe, field).flatMap((part) => strings(part['items']));
}

function sourceSpecies(recipe: Entry): string[] {
  const source = recipe['source'];
  return isRecord(source) ? strings(source['species']) : [];
}

function sourceKind(recipe: Entry): string {
  const source = recipe['source'];
  return isRecord(source) ? str(source, 'kind') : '';
}

function factorNames(ctx: CatalogContext, entry: Entry): string {
  return factorTexts(ctx, positiveKeys(entry['favors']));
}

function factorTexts(ctx: CatalogContext, keys: readonly string[]): string {
  const factors = at(ctx.raw.groups, 'factorTexts');
  return keys
    .map((key) => (isRecord(factors) && typeof factors[key] === 'string' ? factors[key] : key))
    .join(' · ');
}

function animal(ctx: CatalogContext, entry: Entry): Block[] {
  const id = str(entry, 'id');
  const species = list(ctx.raw.fauna, 'species');
  const hunters = ids(species.filter((other) => strings(other['prey']).includes(id)));
  const human = recipes(ctx).filter((recipe) => sourceSpecies(recipe).includes(id));
  return lines(ctx, 'heading.links', [
    ['rel.habitat', links(ctx, 'biome', positiveKeys(entry['habitat']))],
    ['rel.prey', links(ctx, 'animal', strings(entry['prey']))],
    ['rel.predators', links(ctx, 'animal', hunters)],
    ['rel.carcass', links(ctx, 'ressource', parts(entry, 'carcass').map((part) => str(part, 'resource')))],
    ['rel.humanWork', links(ctx, 'recette', ids(human))],
  ]);
}

function plantProduce(plant: Entry): string[] {
  return isRecord(plant['produce']) ? [str(plant['produce'], 'resource')] : [];
}

function plant(ctx: CatalogContext, entry: Entry): Block[] {
  const produce = plantProduce(entry);
  const eaters = list(ctx.raw.fauna, 'species').filter((animal) => produce.some((resource) => positiveKeys(animal['diet']).includes(resource)));
  return lines(ctx, 'heading.links', [
    ['rel.produce', links(ctx, 'ressource', produce)],
    ['rel.materials', links(ctx, 'ressource', parts(entry, 'materials').map((part) => str(part, 'resource')))],
    ['rel.eatenBy', links(ctx, 'animal', ids(eaters))],
  ]);
}

function biome(ctx: CatalogContext, entry: Entry): Block[] {
  const id = str(entry, 'id');
  const animals = list(ctx.raw.fauna, 'species').filter((animal) => positiveKeys(animal['habitat']).includes(id));
  const terrain = list(ctx.raw.production, 'terrainSources').filter((source) => strings(source['biomes']).includes(id));
  return lines(ctx, 'heading.links', [
    ['rel.animalsHere', links(ctx, 'animal', ids(animals))],
    ['rel.terrainItems', links(ctx, 'objet', terrain.map((source) => str(source, 'item')))],
  ]);
}

function sameAs(ctx: CatalogContext, page: string): string {
  const title = ctx.titles.get(page);
  return title === undefined ? '' : link(ctx, page, title);
}

function resource(ctx: CatalogContext, entry: Entry): Block[] {
  const id = str(entry, 'id');
  const plants = list(ctx.raw.flora, 'species').filter((plant) => plantProduce(plant).includes(id) || parts(plant, 'materials').some((part) => part['resource'] === id));
  const animals = list(ctx.raw.fauna, 'species').filter((animal) => parts(animal, 'carcass').some((part) => part['resource'] === id));
  const eaters = list(ctx.raw.fauna, 'species').filter((animal) => positiveKeys(animal['diet']).includes(id));
  return lines(ctx, 'heading.links', [
    ['rel.fromPlants', links(ctx, 'plante', ids(plants))],
    ['rel.fromAnimals', links(ctx, 'animal', ids(animals))],
    ['rel.eatenBy', links(ctx, 'animal', ids(eaters))],
    ['rel.sameItem', sameAs(ctx, `objet:${id}`)],
  ]);
}

function textOf(ctx: CatalogContext, path: string, key: string): string {
  const texts = at(ctx.raw.ideas, path);
  return isRecord(texts) && typeof texts[key] === 'string' ? texts[key] : key;
}

/** "le silex affleure près du camp" (the journal's phrase without its joining ", et "). */
function environmentText(ctx: CatalogContext, key: string): string {
  return textOf(ctx, 'environmentTexts', key).replace(/^\s*,?\s*(et\s+)?/, '');
}

function knowledge(ctx: CatalogContext, entry: Entry): Block[] {
  const id = str(entry, 'id');
  const all = list(ctx.raw.knowledge, 'knowledge');
  const discovery = isRecord(entry['discovery']) ? entry['discovery'] : {};
  const need = str(discovery, 'need');
  const skill = str(discovery, 'skill');
  const buildings = list(ctx.raw.buildings, 'buildings').filter((building) => strings(building['knowledge']).includes(id));
  return [
    ...lines(ctx, 'heading.requires', [
      ['rel.requiresKnowledge', links(ctx, 'savoir', strings(entry['requires']))],
      ['rel.startsKnown', label(ctx, entry['startsKnown'] === true ? 'word.yes' : 'word.no')],
      ['rel.need', need ? textOf(ctx, 'needTexts', need) : ''],
      ['rel.environment', strings(discovery['environment']).map((key) => environmentText(ctx, key)).join(' ; ')],
      ['rel.skill', skill ? links(ctx, 'competence', [skill]) : ''],
    ]),
    ...lines(ctx, 'heading.unlocks', [
      ['rel.knowledgeAfter', links(ctx, 'savoir', ids(all.filter((other) => strings(other['requires']).includes(id))))],
      ['rel.recipes', links(ctx, 'recette', ids(recipes(ctx).filter((recipe) => recipe['knowledge'] === id)))],
      ['rel.buildings', links(ctx, 'batiment', ids(buildings))],
    ]),
  ];
}

function recipe(ctx: CatalogContext, entry: Entry): Block[] {
  const knowledgeId = str(entry, 'knowledge');
  const skill = str(entry, 'skill');
  const station = str(entry, 'station');
  const species = sourceSpecies(entry);
  const kind = sourceKind(entry);
  const sourceName = kind ? label(ctx, `source.${kind}`) : '';
  return [
    ...lines(ctx, 'heading.requires', [
      ['rel.requiresKnowledge', knowledgeId ? links(ctx, 'savoir', [knowledgeId]) : label(ctx, 'rel.noKnowledge')],
      ['rel.skill', skill ? links(ctx, 'competence', [skill]) : ''],
      ['rel.station', station ? links(ctx, 'batiment', [station]) : ''],
      ['rel.source', sourceName ? `${sourceName}${species.length > 0 ? ` (${links(ctx, 'animal', species)})` : ''}` : ''],
      ['rel.inputs', links(ctx, 'objet', recipeItems(entry, 'inputs'))],
      ['rel.tools', links(ctx, 'objet', strings(entry['tools']))],
    ]),
    ...lines(ctx, 'heading.gives', [['rel.outputs', links(ctx, 'objet', recipeItems(entry, 'outputs'))]]),
  ];
}

function item(ctx: CatalogContext, entry: Entry): Block[] {
  const id = str(entry, 'id');
  const all = recipes(ctx);
  const buildings = list(ctx.raw.buildings, 'buildings').filter((building) => parts(building, 'materials').some((part) => strings(part['items']).includes(id)));
  const terrain = list(ctx.raw.production, 'terrainSources').filter((source) => source['item'] === id);
  const weapons = at(ctx.raw.conflict, 'combat.weapons');
  const armor = at(ctx.raw.conflict, 'combat.armor');
  const uses: string[] = [];
  if (isRecord(weapons) && id in weapons) uses.push(label(ctx, 'rel.weapon'));
  if (isRecord(armor) && id in armor) uses.push(label(ctx, 'rel.armor'));
  if (strings(at(ctx.raw.ideas, 'trade.tokenItems')).includes(id)) uses.push(label(ctx, 'rel.token'));
  if (strings(at(ctx.raw.production, 'husbandry.feedItems')).includes(id)) uses.push(label(ctx, 'rel.feed'));
  const terrainBiomes = terrain.flatMap((source) => strings(source['biomes']));
  return [
    ...lines(ctx, 'heading.comesFrom', [
      ['rel.madeBy', links(ctx, 'recette', ids(all.filter((recipe) => recipeItems(recipe, 'outputs').includes(id))))],
      ['rel.terrain', terrain.length === 0 ? '' : terrainBiomes.length > 0 ? links(ctx, 'biome', terrainBiomes) : label(ctx, 'word.yes')],
      ['rel.sameResource', sameAs(ctx, `ressource:${id}`)],
    ]),
    ...lines(ctx, 'heading.usedFor', [
      ['rel.usedIn', links(ctx, 'recette', ids(all.filter((recipe) => recipeItems(recipe, 'inputs').includes(id))))],
      ['rel.toolFor', links(ctx, 'recette', ids(all.filter((recipe) => strings(recipe['tools']).includes(id))))],
      ['rel.buildingMaterial', links(ctx, 'batiment', ids(buildings))],
      ['rel.otherUses', uses.join(', ')],
    ]),
  ];
}

function building(ctx: CatalogContext, entry: Entry): Block[] {
  const id = str(entry, 'id');
  return [
    ...lines(ctx, 'heading.requires', [
      ['rel.requiresKnowledge', links(ctx, 'savoir', strings(entry['knowledge']))],
      ['rel.materials', links(ctx, 'objet', parts(entry, 'materials').flatMap((part) => strings(part['items'])))],
      ['rel.religion', entry['requiresReligion'] === true ? label(ctx, 'word.yes') : ''],
    ]),
    ...lines(ctx, 'heading.usedFor', [['rel.stationOf', links(ctx, 'recette', ids(recipes(ctx).filter((recipe) => recipe['station'] === id)))]]),
  ];
}

/** Entries of any file whose "traits" record names this trait (actions, rules, ambitions, memories…). */
function trait(ctx: CatalogContext, entry: Entry): Block[] {
  const id = str(entry, 'id');
  const inList = (data: unknown, path: string, prefix: string): string => links(ctx, prefix, ids(list(data, path).filter((other) => positiveKeys(other['traits']).includes(id))));
  const inRecord = (data: unknown, path: string, prefix: string): string => {
    const record = at(data, path);
    if (!isRecord(record)) return '';
    return links(ctx, prefix, Object.entries(record).filter(([, value]) => isRecord(value) && positiveKeys(value['traits']).includes(id)).map(([key]) => key));
  };
  return lines(ctx, 'heading.influences', [
    ['rel.actions', inList(ctx.raw.humans, 'actions', 'action')],
    ['rel.property', inList(ctx.raw.groups, 'property', 'propriete')],
    ['rel.inheritance', inList(ctx.raw.groups, 'inheritance', 'heritage')],
    ['rel.strategies', inList(ctx.raw.groups, 'strategies', 'strategie')],
    ['rel.ambitions', inRecord(ctx.raw.social, 'ambitions.kinds', 'ambition')],
    ['rel.memories', inRecord(ctx.raw.social, 'memories.kinds', 'souvenir')],
  ]);
}

function skill(ctx: CatalogContext, entry: Entry): Block[] {
  const id = str(entry, 'id');
  const found = list(ctx.raw.knowledge, 'knowledge').filter((k) => isRecord(k['discovery']) && k['discovery']['skill'] === id);
  return lines(ctx, 'heading.usedFor', [
    ['rel.recipes', links(ctx, 'recette', ids(recipes(ctx).filter((recipe) => recipe['skill'] === id)))],
    ['rel.discovers', links(ctx, 'savoir', ids(found))],
  ]);
}

function action(ctx: CatalogContext, entry: Entry): Block[] {
  const id = str(entry, 'id');
  const values = list(ctx.raw.ideas, 'values').filter((value) => positiveKeys(value['actions']).includes(id));
  return lines(ctx, 'heading.influences', [
    ['rel.considerations', parts(entry, 'considerations').map((c) => str(c, 'input')).join(', ')],
    ['rel.traits', links(ctx, 'trait', positiveKeys(entry['traits']))],
    ['rel.values', links(ctx, 'valeur', ids(values))],
  ]);
}

function regime(ctx: CatalogContext, entry: Entry): Block[] {
  return lines(ctx, 'heading.requires', [
    ['rel.requiresSituation', factorTexts(ctx, strings(entry['requires']))],
    ['rel.favoredBy', factorNames(ctx, entry)],
  ]);
}

function groupRule(ctx: CatalogContext, entry: Entry): Block[] {
  return lines(ctx, 'heading.influences', [
    ['rel.traits', links(ctx, 'trait', positiveKeys(entry['traits']))],
    ['rel.favoredBy', factorNames(ctx, entry)],
  ]);
}

function value(ctx: CatalogContext, entry: Entry): Block[] {
  return lines(ctx, 'heading.influences', [['rel.actions', links(ctx, 'action', positiveKeys(entry['actions']))]]);
}

function feeling(ctx: CatalogContext, entry: Entry): Block[] {
  const emotion = str(entry, 'emotion');
  return lines(ctx, 'heading.influences', [
    ['rel.emotion', emotion ? links(ctx, 'emotion', [emotion]) : ''],
    ['rel.traits', links(ctx, 'trait', positiveKeys(entry['traits']))],
  ]);
}

const RELATIONS: Record<string, (ctx: CatalogContext, entry: Entry) => Block[]> = {
  animal,
  plante: plant,
  biome,
  ressource: resource,
  savoir: knowledge,
  recette: recipe,
  objet: item,
  batiment: building,
  trait,
  competence: skill,
  action,
  regime,
  propriete: groupRule,
  heritage: groupRule,
  strategie: groupRule,
  valeur: value,
  souvenir: feeling,
  ambition: feeling,
};

/** The "links" part of a generated page (empty for kinds without links). */
export function relationsOf(ctx: CatalogContext, prefix: string, entry: Entry): Block[] {
  return RELATIONS[prefix]?.(ctx, entry) ?? [];
}
