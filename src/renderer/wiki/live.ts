/**
 * Live pages (« Ma partie ») and « Dans ta partie » boxes: what exists in the running world —
 * tribes and their regime, cultures, languages, religions, known knowledge, living species — with
 * links to the generated pages, the map and the journal. Built only when a page is shown (or on
 * demand), never at every frame.
 */
import type { GroupFacts, GroupsFacts, IdeaFacts, IdeasFacts } from '../../shared/messages';
import { capitalize, label } from './catalog/context';
import type { Labels } from './content';
import type { Block, WikiAction, WikiPage } from './model';

/** What the display knows of the running world. */
export interface LiveWorld {
  date: string;
  humans: number;
  groups: GroupsFacts | null;
  ideas: IdeasFacts | null;
  /** Living animals and plants per species (name and count), in the order of the data files. */
  animals: { id: string; name: string; count: number }[];
  plants: { id: string; name: string; count: number }[];
  /** Tribe of the person whose sheet is open (-1: none, the first tribe is used). */
  focusTribe: number;
}

export interface LiveContext {
  labels: Labels;
  /** Generated page of a regime from its displayed name, of a knowledge from its name (null if none). */
  regimePage: (name: string) => string | null;
  knowledgePage: (name: string) => string | null;
}

/** Families of ideas (as in the ideas system). */
const FAMILY = { knowledge: 0, culture: 1, language: 2, religion: 3, token: 4 } as const;

export const LIVE_PAGES = ['partie', 'partie:tribus', 'partie:idees', 'partie:savoirs', 'partie:especes'] as const;
export const LIVE_BOXES = ['population', 'tribus', 'regime', 'cultures', 'langues', 'religions', 'savoirs', 'especes', 'relations', 'echanges'] as const;
export const LIVE_CHAPTER = 'ma-partie';

function tribes(world: LiveWorld): GroupFacts[] {
  return (world.groups?.groups ?? []).filter((group) => group.level === 0 && !group.exile);
}

function focus(world: LiveWorld): GroupFacts | null {
  const all = tribes(world);
  return all.find((tribe) => tribe.id === world.focusTribe) ?? all[0] ?? null;
}

function ideas(world: LiveWorld, family: number): IdeaFacts[] {
  return (world.ideas?.ideas ?? []).filter((idea) => idea.family === family && idea.alive);
}

function ideaLabel(world: LiveWorld, id: number): string {
  return id < 0 ? '—' : (world.ideas?.ideas.find((idea) => idea.id === id)?.label ?? '—');
}

function noWorld(ctx: LiveContext): Block[] {
  return [{ kind: 'paragraph', text: label(ctx, 'live.noWorld') }];
}

function regimeText(ctx: LiveContext, tribe: GroupFacts): string {
  const page = ctx.regimePage(tribe.regime);
  return page ? `[[${page}|${tribe.regime}]]` : tribe.regime;
}

function tribeActions(ctx: LiveContext, tribe: GroupFacts): WikiAction[] {
  const actions: WikiAction[] = [];
  if (tribe.campX >= 0) actions.push({ kind: 'map', label: label(ctx, 'live.onMap'), x: tribe.campX, y: tribe.campY });
  actions.push({ kind: 'journal', label: label(ctx, 'live.inJournal'), tribe: tribe.id, search: '' });
  return actions;
}

function tribeBlocks(ctx: LiveContext, world: LiveWorld, tribe: GroupFacts): Block[] {
  const leaders = tribe.leaders.map((leader) => `${leader.name} (${leader.title})`).join(', ') || '—';
  return [
    { kind: 'heading', text: capitalize(tribe.name) },
    {
      kind: 'list',
      items: [
        `**${label(ctx, 'live.regime')}** ${regimeText(ctx, tribe)} · ${tribe.access}`,
        `**${label(ctx, 'live.leaders')}** ${leaders}`,
        `**${label(ctx, 'live.members')}** ${tribe.members} (${label(ctx, 'live.adults', { n: String(tribe.adults) })})`,
        `**${label(ctx, 'live.legitimacy')}** ${Math.round(tribe.legitimacy)} · **${label(ctx, 'live.discontent')}** ${Math.round(tribe.discontent)}`,
        `**${label(ctx, 'live.ideas')}** ${ideaLabel(world, tribe.culture)} · ${ideaLabel(world, tribe.language)} · ${ideaLabel(world, tribe.religion)}`,
        `**${label(ctx, 'live.rules')}** ${tribe.property} · ${tribe.inheritance} · ${tribe.strategy}`,
      ],
    },
    { kind: 'actions', actions: tribeActions(ctx, tribe) },
  ];
}

function ideaList(ctx: LiveContext, world: LiveWorld, family: number, link: (idea: IdeaFacts) => string): Block[] {
  const found = ideas(world, family);
  if (found.length === 0) return [{ kind: 'paragraph', text: label(ctx, `live.none.${family}`) }];
  return [
    {
      kind: 'table',
      head: [label(ctx, 'live.col.name'), label(ctx, 'live.col.holders'), label(ctx, 'live.col.tribes'), label(ctx, 'live.col.origin')],
      rows: found.map((idea) => [link(idea), String(idea.holders), idea.tribes.join(', ') || '—', idea.origin || '—']),
    },
  ];
}

function plainIdea(idea: IdeaFacts): string {
  return capitalize(idea.label);
}

function knowledgeIdea(ctx: LiveContext): (idea: IdeaFacts) => string {
  return (idea) => {
    const page = ctx.knowledgePage(idea.label);
    return page ? `[[${page}|${idea.label}]]` : idea.label;
  };
}

function speciesTable(ctx: LiveContext, rows: LiveWorld['animals'], prefix: string): Block {
  return {
    kind: 'table',
    head: [label(ctx, 'live.col.species'), label(ctx, 'live.col.count')],
    rows: rows.map((row) => [`[[${prefix}:${row.id}|${row.name}]]`, row.count > 0 ? row.count.toLocaleString('fr-FR').replace(/ | /g, ' ') : label(ctx, 'live.extinct')]),
  };
}

function relations(ctx: LiveContext, world: LiveWorld): Block[] {
  const items: string[] = [];
  for (const tribe of tribes(world)) {
    for (const other of tribe.known) {
      if (other.group < tribe.id && tribes(world).some((t) => t.id === other.group)) continue;
      const key = other.relation.war ? 'live.war' : other.relation.tribute !== 0 ? 'live.tribute' : other.relation.truce ? 'live.truce' : other.allied ? 'live.alliance' : '';
      if (key) items.push(label(ctx, key, { a: tribe.name, b: other.name }));
    }
  }
  return items.length > 0 ? [{ kind: 'list', items }] : [{ kind: 'paragraph', text: label(ctx, 'live.peace') }];
}

/** Content of a « Dans ta partie » box. */
export function liveBox(ctx: LiveContext, world: LiveWorld | null, id: string): Block[] {
  if (!world || !world.groups) return noWorld(ctx);
  switch (id) {
    case 'population':
      return [{ kind: 'paragraph', text: label(ctx, 'live.populationLine', { date: world.date, n: String(world.humans), tribus: String(tribes(world).length) }) }];
    case 'tribus':
      return [{ kind: 'list', items: tribes(world).map((tribe) => `${capitalize(tribe.name)} : ${tribe.members} · ${regimeText(ctx, tribe)}`) }, { kind: 'paragraph', text: '[[partie:tribus]]' }];
    case 'regime': {
      const tribe = focus(world);
      if (!tribe) return [{ kind: 'paragraph', text: label(ctx, 'live.noTribe') }];
      return [{ kind: 'paragraph', text: label(ctx, 'live.regimeLine', { tribu: tribe.name, regime: regimeText(ctx, tribe), acces: tribe.access, legitimite: String(Math.round(tribe.legitimacy)), mecontentement: String(Math.round(tribe.discontent)) }) }, { kind: 'actions', actions: tribeActions(ctx, tribe) }];
    }
    case 'cultures':
      return ideaList(ctx, world, FAMILY.culture, plainIdea);
    case 'langues':
      return ideaList(ctx, world, FAMILY.language, plainIdea);
    case 'religions':
      return ideaList(ctx, world, FAMILY.religion, plainIdea);
    case 'echanges':
      return ideaList(ctx, world, FAMILY.token, plainIdea);
    case 'savoirs':
      return [{ kind: 'paragraph', text: ideas(world, FAMILY.knowledge).map(knowledgeIdea(ctx)).join(' · ') || label(ctx, 'live.none.0') }, { kind: 'paragraph', text: '[[partie:savoirs]]' }];
    case 'especes':
      return [speciesTable(ctx, world.animals, 'animal')];
    case 'relations':
      return relations(ctx, world);
    default:
      return [{ kind: 'paragraph', text: label(ctx, 'live.unknownBox', { id }) }];
  }
}

function pageBlocks(ctx: LiveContext, world: LiveWorld | null, id: string): Block[] {
  if (!world || !world.groups) return noWorld(ctx);
  switch (id) {
    case 'partie':
      return [
        { kind: 'paragraph', text: label(ctx, 'live.populationLine', { date: world.date, n: String(world.humans), tribus: String(tribes(world).length) }) },
        { kind: 'list', items: ['[[partie:tribus]]', '[[partie:idees]]', '[[partie:savoirs]]', '[[partie:especes]]'] },
        { kind: 'heading', text: label(ctx, 'live.relationsTitle') },
        ...relations(ctx, world),
        ...((world.groups.ended.length > 0 ? [{ kind: 'paragraph', text: label(ctx, 'live.ended', { noms: world.groups.ended.map((tribe) => tribe.name).join(', ') }) }] : []) as Block[]),
      ];
    case 'partie:tribus': {
      const all = tribes(world);
      return all.length === 0 ? [{ kind: 'paragraph', text: label(ctx, 'live.noTribe') }] : all.flatMap((tribe) => tribeBlocks(ctx, world, tribe));
    }
    case 'partie:idees':
      return [
        { kind: 'heading', text: label(ctx, 'live.cultures') },
        ...ideaList(ctx, world, FAMILY.culture, plainIdea),
        { kind: 'heading', text: label(ctx, 'live.languages') },
        ...ideaList(ctx, world, FAMILY.language, plainIdea),
        { kind: 'heading', text: label(ctx, 'live.religions') },
        ...ideaList(ctx, world, FAMILY.religion, plainIdea),
        { kind: 'heading', text: label(ctx, 'live.tokens') },
        ...ideaList(ctx, world, FAMILY.token, plainIdea),
      ];
    case 'partie:savoirs':
      return ideaList(ctx, world, FAMILY.knowledge, knowledgeIdea(ctx));
    case 'partie:especes':
      return [
        { kind: 'heading', text: label(ctx, 'live.animals') },
        speciesTable(ctx, world.animals, 'animal'),
        { kind: 'heading', text: label(ctx, 'live.plants') },
        speciesTable(ctx, world.plants, 'plante'),
      ];
    default:
      return [];
  }
}

/** The live pages, as they are now (their content is rebuilt each time a page is shown). */
export function livePages(ctx: LiveContext, world: LiveWorld | null): WikiPage[] {
  return LIVE_PAGES.map((id, order) => ({
    id,
    title: label(ctx, `live.title.${id}`),
    chapter: LIVE_CHAPTER,
    order,
    summary: label(ctx, `live.summary.${id}`),
    blocks: [{ kind: 'note', text: label(ctx, 'live.refreshNote') } as Block, ...pageBlocks(ctx, world, id)],
    keywords: '',
  }));
}
