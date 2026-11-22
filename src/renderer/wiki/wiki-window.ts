/**
 * The Wiki window (F1 or H): an index by chapters, a search over the whole Wiki, links between
 * pages, a back button and a home page. Pages that read the running world are rebuilt when they
 * are opened or when « Actualiser » is pressed, never at every frame.
 */
import type { WorkshopVariable } from '../../sim/core/workshop';
import type { WikiLibrary } from './library';
import { LIVE_CHAPTER } from './live';
import type { WikiAction, WikiPage } from './model';
import { inline, renderBlock, type RenderHooks } from './render';

export interface WikiHost {
  /** Asks the simulation for the workshop's values (answered by setVariables). */
  requestVariables: () => void;
  /** Gathers what the display knows of the running world (before a live page is shown). */
  refreshLive: () => void;
  action: (action: WikiAction) => void;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

const HISTORY_MAX = 100;

export class WikiWindow {
  private readonly root: HTMLElement;
  private readonly nav: HTMLElement;
  private readonly content: HTMLElement;
  private readonly search: HTMLInputElement;
  private readonly back: HTMLButtonElement;
  private readonly refresh: HTMLButtonElement;
  private readonly button: HTMLButtonElement;
  private readonly history: string[] = [];
  private current = '';
  private readonly hooks: RenderHooks;
  /** Chapters unfolded in the index. */
  private readonly unfolded = new Set<string>();
  /** Values received while the Wiki was closed (applied when it opens). */
  private pendingVariables: readonly WorkshopVariable[] | null = null;

  constructor(
    private readonly library: WikiLibrary,
    toolbar: HTMLElement,
    private readonly host: WikiHost,
  ) {
    this.hooks = { openPage: (id) => this.open(id), action: (action) => this.runAction(action) };
    this.root = node('section', 'wiki');
    this.root.id = 'wiki';
    this.root.hidden = true;
    const header = node('header', 'wiki-header');
    const home = this.headerButton('⌂', library.label('window.home'), () => this.open(library.home));
    this.back = this.headerButton('←', library.label('window.back'), () => this.goBack());
    this.refresh = this.headerButton('↻', library.label('window.refresh'), () => this.show(this.current, true));
    const title = node('h2', '', library.label('window.title'));
    this.search = node('input', 'wiki-search');
    this.search.type = 'search';
    this.search.placeholder = library.label('window.search');
    this.search.spellcheck = false;
    this.search.addEventListener('input', () => this.renderNav());
    const close = this.headerButton('✕', library.label('window.close'), () => this.close());
    header.append(home, this.back, title, this.search, this.refresh, close);
    this.nav = node('nav', 'wiki-nav');
    this.content = node('article', 'wiki-content');
    const body = node('div', 'wiki-body');
    body.append(this.nav, this.content);
    this.root.append(header, body);
    document.body.append(this.root);

    this.button = node('button', 'tool-button', library.label('window.button'));
    this.button.type = 'button';
    this.button.title = library.label('window.buttonHint');
    this.button.addEventListener('click', () => {
      this.button.blur();
      this.toggle();
    });
    toolbar.append(this.button);
    window.addEventListener('keydown', (event) => {
      if (event.code === 'F1') {
        event.preventDefault();
        this.toggle();
        return;
      }
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement;
      if (typing || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key.toLowerCase() === 'h') this.toggle();
      else if (event.code === 'Escape' && this.isOpen) this.close();
      else if (event.code === 'Backspace' && this.isOpen) this.goBack();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open(this.current || this.library.home);
  }

  /** Opens the Wiki on a page (the « ? » buttons call this). */
  open(id: string): void {
    const wasOpen = this.isOpen;
    this.root.hidden = false;
    this.button.classList.add('active');
    if (!wasOpen) {
      this.applyVariables();
      this.host.requestVariables();
    }
    if (this.current && this.current !== id && wasOpen) {
      this.history.push(this.current);
      if (this.history.length > HISTORY_MAX) this.history.shift();
    }
    this.show(id, true);
  }

  close(): void {
    this.root.hidden = true;
    this.button.classList.remove('active');
  }

  pageForDataFile(file: string): WikiPage | null {
    return this.library.pageForDataFile(file);
  }

  /** New values from the workshop: the pages are rebuilt (now if the Wiki is open, else when it opens). */
  setVariables(variables: readonly WorkshopVariable[]): void {
    this.pendingVariables = variables;
    if (this.isOpen) {
      this.applyVariables();
      this.show(this.current, false);
    }
  }

  private applyVariables(): void {
    if (!this.pendingVariables) return;
    this.library.setVariables(this.pendingVariables);
    this.pendingVariables = null;
  }

  private goBack(): void {
    const previous = this.history.pop();
    if (previous !== undefined) this.show(previous, true);
  }

  private headerButton(text: string, hint: string, onClick: () => void): HTMLButtonElement {
    const button = node('button', 'wiki-header-button', text);
    button.type = 'button';
    button.title = hint;
    button.addEventListener('click', () => {
      button.blur();
      onClick();
    });
    return button;
  }

  private runAction(action: WikiAction): void {
    this.close();
    this.host.action(action);
  }

  /** Draws a page; `toTop` scrolls to its beginning. Live content is gathered again first. */
  private show(id: string, toTop: boolean): void {
    const page = this.library.page(id) ?? this.library.page(this.library.home);
    if (!page) return;
    if (page.chapter === LIVE_CHAPTER || page.blocks.some((block) => block.kind === 'live')) this.host.refreshLive();
    const fresh = this.library.page(page.id) ?? page;
    this.current = fresh.id;
    const scroll = this.content.scrollTop;
    this.content.replaceChildren(...this.pageNodes(fresh));
    this.content.scrollTop = toTop ? 0 : scroll;
    this.back.disabled = this.history.length === 0;
    this.refresh.hidden = !(fresh.chapter === LIVE_CHAPTER || fresh.blocks.some((block) => block.kind === 'live'));
    if (fresh.chapter) this.unfolded.add(fresh.chapter);
    this.renderNav();
  }

  private pageNodes(page: WikiPage): HTMLElement[] {
    const nodes: HTMLElement[] = [];
    const chapter = this.library.content.chapters.find((c) => c.id === page.chapter);
    if (chapter) {
      const crumb = node('div', 'wiki-crumb');
      crumb.append(...inline(this.library, `[[${chapter.id}]]`, this.hooks));
      nodes.push(crumb);
    }
    nodes.push(node('h1', 'wiki-title', page.title));
    for (const block of page.blocks) nodes.push(renderBlock(this.library, block, this.hooks));
    // A chapter page lists its pages.
    const own = this.library.chapters().find((entry) => entry.chapter.id === page.id);
    if (own) {
      const list = node('ul', 'wiki-list wiki-toc');
      for (const child of own.pages) {
        const li = node('li');
        li.append(...inline(this.library, `[[${child.id}]]`, this.hooks), node('span', 'wiki-muted', ` — ${child.summary}`));
        list.append(li);
      }
      nodes.push(list);
    }
    return nodes;
  }

  private renderNav(): void {
    const query = this.search.value.trim();
    const nodes: HTMLElement[] = [];
    if (query !== '') {
      const results = this.library.search(query);
      nodes.push(node('div', 'wiki-muted', this.library.label('window.results', { n: String(results.length) })));
      for (const result of results) nodes.push(this.navLink(result.page, true));
    } else {
      for (const { chapter, pages } of this.library.chapters()) {
        if (pages.length === 0) continue;
        const details = node('details', 'wiki-chapter');
        details.open = this.unfolded.has(chapter.id);
        const summary = node('summary', '', chapter.title);
        details.append(summary);
        details.addEventListener('toggle', () => {
          if (details.open) {
            this.unfolded.add(chapter.id);
            if (details.childElementCount === 1) details.append(...pages.map((page) => this.navLink(page, false)));
          } else this.unfolded.delete(chapter.id);
        });
        if (details.open) details.append(...pages.map((page) => this.navLink(page, false)));
        nodes.push(details);
      }
    }
    this.nav.replaceChildren(...nodes);
  }

  private navLink(page: WikiPage, withSummary: boolean): HTMLElement {
    const link = node('a', `wiki-nav-link${page.id === this.current ? ' active' : ''}`, page.title);
    link.href = '#';
    link.title = page.summary;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      this.open(page.id);
    });
    if (!withSummary) return link;
    const box = node('div', 'wiki-result');
    box.append(link, node('div', 'wiki-muted', page.summary));
    return box;
  }
}

/** A « ? » button that opens the Wiki on a page. */
export function helpButton(wiki: { open: (id: string) => void }, page: string, hint: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'help-button';
  button.textContent = '?';
  button.title = hint;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    button.blur();
    wiki.open(page);
  });
  return button;
}
