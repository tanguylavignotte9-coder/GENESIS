import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DataFileError } from '../../src/sim/core/data-validation';
import { DATA_FILES, defaultRawData } from '../../src/sim/core/game-data';
import { buildCatalog } from '../../src/sim/core/variables';
import { parseWikiFiles, type WikiFile } from '../../src/renderer/wiki/content';
import { HELP_PAGES } from '../../src/renderer/wiki/help-targets';
import { references, WikiLibrary } from '../../src/renderer/wiki/library';
import { LIVE_BOXES, type LiveWorld } from '../../src/renderer/wiki/live';
import { parseBody, parseInline } from '../../src/renderer/wiki/markup';
import type { Block } from '../../src/renderer/wiki/model';
import { formatVariable } from '../../src/renderer/wiki/values';
import type { GroupFacts, IdeaFacts } from '../../src/shared/messages';

const WIKI_DIR = join(__dirname, '..', '..', 'data', 'wiki');
const SYSTEMS_DIR = join(__dirname, '..', '..', 'src', 'sim', 'systems');

function wikiFiles(): WikiFile[] {
  return readdirSync(WIKI_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({ name, content: JSON.parse(readFileSync(join(WIKI_DIR, name), 'utf8')) as unknown }));
}

const content = parseWikiFiles(wikiFiles());
const library = new WikiLibrary(content);

function tribe(id: number, name: string): GroupFacts {
  return {
    id, level: 0, levelName: 'Tribu', parent: -1, name, regime: 'Bande égalitaire', access: 'Prestige et consensus', leaders: [{ person: 0, name: 'Aruk', title: 'meneur' }],
    legitimacy: 60, discontent: 10, members: 30, adults: 20, property: 'Tout en commun', inheritance: 'Aux enfants', strategy: 'Vivre au jour le jour', campX: 10, campY: 12,
    known: [{ group: 1 - id, name: 'autre', opinion: 0, allied: false, status: '', relation: { war: id === 0, truce: false, tribute: 0 } }], exile: false, culture: 5, language: 6, religion: -1, foundedDay: 0, founder: 'Aruk', children: [],
  };
}

function idea(id: number, family: number, label: string): IdeaFacts {
  return { id, family, label, alive: true, holders: 12, tribes: ['la tribu des Tamuki'], founder: -1, founderName: '', day: 0, year: 1, endYear: 0, origin: 'depuis toujours', parent: '', details: [], clergy: [] };
}

const WORLD: LiveWorld = {
  date: 'Jour 1 · Printemps · An 3',
  humans: 60,
  groups: { groups: [tribe(0, 'la tribu des Tamuki'), tribe(1, 'la tribu des Soran')], ended: [{ name: 'la tribu des Haha', day: 40 }] },
  ideas: { ideas: [idea(5, 1, 'la culture Soran'), idea(6, 2, 'le tamuk'), idea(7, 0, 'Cueillette'), idea(8, 3, 'le culte d’Aruk')], places: [] },
  animals: [{ id: 'wolf', name: 'Loup', count: 12 }],
  plants: [{ id: 'oak', name: 'Chêne', count: 4000 }],
  focusTribe: 1,
};

function allBlocks(): { page: string; blocks: Block[] }[] {
  const out = library.allPages().map((page) => ({ page: page.id, blocks: page.blocks }));
  for (const chapter of content.chapters) out.push({ page: chapter.id, blocks: library.page(chapter.id)!.blocks });
  library.live = WORLD;
  for (const page of library.allPages().filter((p) => p.chapter === 'ma-partie')) out.push({ page: `${page.id} (monde)`, blocks: page.blocks });
  for (const box of LIVE_BOXES) out.push({ page: `encadré ${box}`, blocks: library.liveBox(box) });
  library.live = null;
  return out;
}

describe('Wiki markup', () => {
  it('reads links, variables and bold', () => {
    expect(parseInline('Voir [[animal:wolf|le loup]] : {var:animals.json:needs.regenPerDay} **vite**')).toEqual([
      { kind: 'text', text: 'Voir ' },
      { kind: 'link', page: 'animal:wolf', text: 'le loup' },
      { kind: 'text', text: ' : ' },
      { kind: 'var', file: 'animals.json', key: 'needs.regenPerDay' },
      { kind: 'text', text: ' ' },
      { kind: 'bold', text: 'vite' },
    ]);
  });

  it('reads headings, lists, notes and live boxes', () => {
    expect(parseBody(['## Titre', 'Texte', '- a', '- b', '> note', '{live:tribus}'])).toEqual([
      { kind: 'heading', text: 'Titre' },
      { kind: 'paragraph', text: 'Texte' },
      { kind: 'list', items: ['a', 'b'] },
      { kind: 'note', text: 'note' },
      { kind: 'live', id: 'tribus' },
    ]);
  });

  it('writes values with their unit', () => {
    expect(formatVariable({ unit: 'tuiles' }, 2.5)).toBe('2,5 tuiles');
    expect(formatVariable({ unit: 'probabilité' }, 0.35)).toBe('35 %');
    expect(formatVariable({ unit: 'oui / non' }, true)).toBe('oui');
  });
});

describe('Wiki files', () => {
  it('an invalid file is refused with a French message naming it', () => {
    const files = wikiFiles();
    const broken = [...files.filter((file) => file.name !== 'monde.json'), { name: 'monde.json', content: { pages: [{ id: 'monde', title: 3 }] } }];
    expect(() => parseWikiFiles(broken)).toThrow(DataFileError);
    expect(() => parseWikiFiles(broken)).toThrow(/wiki\/monde\.json.*\n.*doit être un texte/);
  });

  it('a page under an unknown chapter is refused', () => {
    const files = [...wikiFiles(), { name: 'z.json', content: { pages: [{ id: 'z', title: 'Z', chapter: 'nulle-part', summary: '', body: ['x'] }] } }];
    expect(() => parseWikiFiles(files)).toThrow(/chapitre « nulle-part »/);
  });
});

describe('Wiki coverage', () => {
  it('every system of src/sim/systems has a written page', () => {
    const covered = new Set(content.pages.flatMap((page) => page.systems));
    const systems = readdirSync(SYSTEMS_DIR);
    expect(systems.filter((system) => !covered.has(system))).toEqual([]);
  });

  it('every data file of the workshop is explained by a written page (its « en savoir plus »)', () => {
    const covered = new Set(content.pages.flatMap((page) => page.dataFiles));
    expect(DATA_FILES.map((info) => info.file).filter((file) => !covered.has(file))).toEqual([]);
  });

  it('every variable of the workshop is documented and shown by a generated page', () => {
    const defaults = defaultRawData();
    const missing = buildCatalog(defaults, defaults).filter((v) => !v.label || !v.help || !v.unit || !library.covered.has(`${v.file}:${v.key}`));
    expect(missing.map((v) => `${v.file}:${v.key}`)).toEqual([]);
  });

  it('every link leads to a page and every cited variable exists', () => {
    const broken: string[] = [];
    for (const { page, blocks } of allBlocks()) {
      const found = references(blocks);
      for (const link of found.links) if (!library.has(link)) broken.push(`${page} → lien [[${link}]]`);
      for (const variable of found.variables) if (!library.variable(variable.file, variable.key)) broken.push(`${page} → variable ${variable.file}:${variable.key}`);
    }
    expect(broken).toEqual([]);
  });

  it('every « Dans ta partie » box of a written page exists', () => {
    const used = content.pages.flatMap((page) => page.blocks.filter((block) => block.kind === 'live').map((block) => (block.kind === 'live' ? block.id : '')));
    expect(used.filter((id) => !(LIVE_BOXES as readonly string[]).includes(id))).toEqual([]);
    expect(used.length).toBeGreaterThan(0);
  });

  it('every « ? » button opens an existing page', () => {
    expect(Object.values(HELP_PAGES).filter((page) => !library.has(page))).toEqual([]);
  });
});

describe('Wiki pages', () => {
  it('a generated page lists its properties and links (the wolf)', () => {
    const wolf = library.page('animal:wolf')!;
    expect(wolf.title).toBe('Loup');
    const found = references(wolf.blocks);
    expect(found.links).toContain('animal:deer');
    expect(found.variables).toContainEqual({ file: 'animals.json', key: 'species.wolf.hungerPerDay' });
  });

  it('a knowledge page says what it needs and what it unlocks', () => {
    const hunting = references(library.page('savoir:hunting')!.blocks);
    expect(hunting.links).toContain('savoir:stone_knapping');
    expect(hunting.links.some((link) => link.startsWith('recette:'))).toBe(true);
  });

  it('values follow the workshop', () => {
    const defaults = defaultRawData();
    const variables = buildCatalog(defaults, defaults).map((v) => (v.file === 'animals.json' && v.key === 'species.wolf.name' ? { ...v, value: 'Grand loup' } : v));
    const changed = new WikiLibrary(content, variables);
    expect(changed.page('animal:wolf')!.title).toBe('Grand loup');
  });

  it('live pages read the running world', () => {
    library.live = WORLD;
    const tribes = library.page('partie:tribus')!;
    const actions = tribes.blocks.filter((block) => block.kind === 'actions');
    expect(actions.length).toBe(2);
    expect(references(tribes.blocks).links).toContain('regime:band');
    expect(library.liveBox('regime')[0]).toMatchObject({ kind: 'paragraph' });
    expect(JSON.stringify(library.liveBox('regime'))).toContain('Soran');
    library.live = null;
    expect(library.page('partie:tribus')!.blocks.some((block) => block.kind === 'actions')).toBe(false);
  });

  it('the search finds pages by their words', () => {
    expect(library.search('loup').map((result) => result.page.id)).toContain('animal:wolf');
    expect(library.search('zzzqqq')).toEqual([]);
  });
});
