/**
 * Every page of the Wiki in one place: written pages (data/wiki), generated pages (the catalog,
 * rebuilt when the workshop's values change), one page per chapter (its table of contents) and the
 * live pages (« Ma partie », rebuilt when shown). Also the search and the variables cited.
 */
import { DataFileError } from '../../sim/core/data-validation';
import type { WorkshopVariable } from '../../sim/core/workshop';
import { label, type CatalogContext } from './catalog/context';
import { generateCatalog } from './catalog/generate';
import { SUMMARY_FILE, type WikiContent } from './content';
import { liveBox, livePages, type LiveContext, type LiveWorld } from './live';
import { blockTexts, parseInline, plainText } from './markup';
import { normalize, type Block, type WikiChapter, type WikiPage } from './model';
import { defaultVariables, rawFromVariables, variableId } from './values';

export interface SearchResult {
  page: WikiPage;
  score: number;
}

interface Indexed {
  page: WikiPage;
  title: string;
  keywords: string;
  text: string;
}

const RESULTS_MAX = 60;

export class WikiLibrary {
  private variablesById = new Map<string, WorkshopVariable>();
  /** Variables shown by a generated page ("fichier.json:clé"). */
  covered = new Set<string>();
  private generated: WikiPage[] = [];
  private fixed = new Map<string, WikiPage>();
  private index: Indexed[] | null = null;
  private readonly liveContext: LiveContext;
  /** The running world as the display knows it (null before the first world). */
  live: LiveWorld | null = null;

  constructor(
    readonly content: WikiContent,
    variables: readonly WorkshopVariable[] = defaultVariables(),
  ) {
    this.liveContext = {
      labels: content.labels,
      regimePage: (name) => this.pageByTitle('regime:', name),
      knowledgePage: (name) => this.pageByTitle('savoir:', name),
    };
    this.setVariables(variables);
  }

  /** New values from the workshop: the generated pages are rebuilt. */
  setVariables(variables: readonly WorkshopVariable[]): void {
    this.variablesById = new Map(variables.map((variable) => [variableId(variable.file, variable.key), variable]));
    const ctx: CatalogContext = { raw: rawFromVariables(variables), variables, labels: this.content.labels, titles: new Map(), covered: new Set() };
    this.covered = ctx.covered;
    this.generated = generateCatalog(ctx);
    this.fixed = new Map();
    for (const page of [...this.content.pages, ...this.generated]) this.fixed.set(page.id, page);
    for (const chapter of this.content.chapters) this.fixed.set(chapter.id, this.chapterPage(chapter));
    const known = new Set(this.content.chapters.map((chapter) => chapter.id));
    const missing = [...new Set([...this.generated, ...livePages(this.liveContext, null)].map((page) => page.chapter))].filter((id) => !known.has(id));
    if (missing.length > 0) throw new DataFileError(`wiki/${SUMMARY_FILE}`, missing.map((id) => `le chapitre « ${id} » des pages générées manque.`));
    this.index = null;
  }

  variable(file: string, key: string): WorkshopVariable | undefined {
    return this.variablesById.get(variableId(file, key));
  }

  get home(): string {
    return this.content.home;
  }

  /** A page by id (live pages are rebuilt from the running world), or null. */
  page(id: string): WikiPage | null {
    if (id.startsWith('partie')) return livePages(this.liveContext, this.live).find((page) => page.id === id) ?? null;
    return this.fixed.get(id) ?? null;
  }

  has(id: string): boolean {
    return this.fixed.has(id) || livePages(this.liveContext, null).some((page) => page.id === id);
  }

  title(id: string): string {
    return this.page(id)?.title ?? id;
  }

  /** The written page that explains a data file (the workshop's « en savoir plus »). */
  pageForDataFile(file: string): WikiPage | null {
    return this.content.pages.find((page) => page.dataFiles.includes(file)) ?? null;
  }

  /** The content of a « Dans ta partie » box. */
  liveBox(id: string): Block[] {
    return liveBox(this.liveContext, this.live, id);
  }

  label(key: string, values: Record<string, string> = {}): string {
    return label(this.liveContext, key, values);
  }

  /** Every page except chapter pages (written, generated, live). */
  allPages(): WikiPage[] {
    const chapters = new Set(this.content.chapters.map((chapter) => chapter.id));
    return [...[...this.fixed.values()].filter((page) => !chapters.has(page.id)), ...livePages(this.liveContext, this.live)];
  }

  /** The chapters of the index with their pages, in order. */
  chapters(): { chapter: WikiChapter; pages: WikiPage[] }[] {
    const pages = this.allPages();
    return [...this.content.chapters]
      .sort((a, b) => a.order - b.order)
      .map((chapter) => ({
        chapter,
        pages: pages.filter((page) => page.chapter === chapter.id).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'fr')),
      }));
  }

  /** Pages whose title, words or text contain every word of the query (best first). */
  search(query: string): SearchResult[] {
    const words = normalize(query).split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) return [];
    this.index ??= this.allPages().map((page) => ({
      page,
      title: normalize(page.title),
      keywords: normalize(`${page.keywords} ${page.summary}`),
      text: normalize(page.blocks.flatMap(blockTexts).map((text) => plainText(text, (id) => this.title(id))).join(' ')),
    }));
    const results: SearchResult[] = [];
    for (const item of this.index) {
      let score = 0;
      for (const word of words) {
        const found = (item.title.includes(word) ? 6 : 0) + (item.keywords.includes(word) ? 2 : 0) + (item.text.includes(word) ? 1 : 0);
        if (found === 0) {
          score = 0;
          break;
        }
        score += found;
      }
      if (score > 0) results.push({ page: item.page, score: score + (item.title === normalize(query) ? 10 : 0) });
    }
    return results.sort((a, b) => b.score - a.score || a.page.title.localeCompare(b.page.title, 'fr')).slice(0, RESULTS_MAX);
  }

  private chapterPage(chapter: WikiChapter): WikiPage {
    return { id: chapter.id, title: chapter.title, chapter: '', order: chapter.order, summary: chapter.summary, keywords: '', blocks: [{ kind: 'paragraph', text: chapter.summary }] };
  }

  private pageByTitle(prefix: string, name: string): string | null {
    const wanted = normalize(name);
    for (const page of this.generated) if (page.id.startsWith(prefix) && normalize(page.title) === wanted) return page.id;
    return null;
  }
}

/** Every link and variable cited by a list of blocks (for the coverage test and the checks). */
export function references(blocks: readonly Block[]): { links: string[]; variables: { file: string; key: string }[] } {
  const links: string[] = [];
  const variables: { file: string; key: string }[] = [];
  for (const block of blocks) {
    if (block.kind === 'actions') for (const action of block.actions) if (action.kind === 'page') links.push(action.page);
    for (const text of blockTexts(block)) {
      for (const segment of parseInline(text)) {
        if (segment.kind === 'link') links.push(segment.page);
        else if (segment.kind === 'var') variables.push({ file: segment.file, key: segment.key });
      }
    }
  }
  return { links, variables };
}
