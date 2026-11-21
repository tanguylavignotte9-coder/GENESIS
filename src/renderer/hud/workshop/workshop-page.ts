import type { VariableValue } from '../../../sim/core/variables';
import type { WorkshopVariable } from '../../../sim/core/workshop';
import type { WorkshopSnapshot } from '../../../shared/messages';
import { variableRow, type RowActions } from './variable-row';

/** Search results shown at most (the list stays fast). */
const MAX_RESULTS = 250;

export interface WorkshopRequests {
  get(): void;
  set(file: string, key: string, value: VariableValue): void;
  reset(file: string, key: string): void;
  resetAll(): void;
}

export interface WorkshopElements {
  page: HTMLElement;
  close: HTMLButtonElement;
  search: HTMLInputElement;
  nav: HTMLElement;
  list: HTMLElement;
  status: HTMLElement;
  message: HTMLElement;
  resetAll: HTMLButtonElement;
}

/** Lower case without accents, for the search. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The variables workshop page: every variable grouped by system then file, a word search, a control
 * per variable, resets and the name of the active preset. Values are validated by the simulation.
 */
export class WorkshopPage {
  private snapshot: WorkshopSnapshot | null = null;
  private file = '';
  private query = '';
  private searchIndex: string[] = [];
  /** Sections unfolded by the spectator (file + section); all are folded at first. */
  private readonly openSections = new Set<string>();
  private readonly actions: RowActions;

  constructor(
    private readonly ui: WorkshopElements,
    private readonly requests: WorkshopRequests,
  ) {
    ui.close.addEventListener('click', () => this.close());
    ui.search.addEventListener('input', () => {
      this.query = normalize(ui.search.value.trim());
      this.renderList(true);
    });
    ui.resetAll.addEventListener('click', () => {
      if (window.confirm('Remettre toutes les variables à leur valeur par défaut ?')) requests.resetAll();
    });
    window.addEventListener('keydown', (event) => {
      if (event.code === 'F2') {
        event.preventDefault();
        this.toggle();
      } else if (event.code === 'Escape' && this.isOpen) this.close();
    });
    this.actions = {
      set: (variable, value) => requests.set(variable.file, variable.key, value),
      reset: (variable) => requests.reset(variable.file, variable.key),
      refuse: (message) => this.showMessages([message], false),
    };
  }

  get isOpen(): boolean {
    return !this.ui.page.hidden;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    this.ui.page.hidden = false;
    document.body.classList.add('page-open');
    this.requests.get();
  }

  close(): void {
    this.ui.page.hidden = true;
    document.body.classList.remove('page-open');
  }

  /** A new state from the simulation (after any change). */
  receive(snapshot: WorkshopSnapshot): void {
    this.snapshot = snapshot;
    this.searchIndex = snapshot.variables.map((v) => normalize(`${v.label} ${v.help} ${v.section} ${v.key} ${v.file} ${v.system}`));
    if (!snapshot.variables.some((v) => v.file === this.file)) this.file = snapshot.variables[0]?.file ?? '';
    this.renderStatus();
    this.renderNav();
    this.renderList(false);
    if (snapshot.messages.length > 0) this.showMessages(snapshot.messages, snapshot.ok);
  }

  showMessages(messages: readonly string[], ok: boolean): void {
    this.ui.message.hidden = messages.length === 0;
    this.ui.message.className = ok ? 'workshop-message' : 'workshop-message error';
    this.ui.message.textContent = messages.join('\n');
  }

  private renderStatus(): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    const changed = snapshot.variables.filter((v) => v.value !== v.defaultValue).length;
    const waiting = snapshot.variables.filter((v) => v.worldValue !== undefined).length;
    const name = snapshot.presetName ? `Préréglage actif : « ${snapshot.presetName} »${snapshot.modified ? ' (modifié)' : ''}` : changed > 0 ? 'Préréglage actif : aucun (valeurs personnalisées)' : 'Préréglage actif : aucun (valeurs par défaut)';
    const parts = [name, `${changed} variable${changed > 1 ? 's' : ''} modifiée${changed > 1 ? 's' : ''}`];
    if (waiting > 0) parts.push(`${waiting} en attente du prochain monde`);
    this.ui.status.textContent = parts.join(' · ');
  }

  private renderNav(): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    const files = new Map<string, { system: string; count: number; changed: number }>();
    for (const v of snapshot.variables) {
      const entry = files.get(v.file) ?? { system: v.system, count: 0, changed: 0 };
      entry.count++;
      if (v.value !== v.defaultValue) entry.changed++;
      files.set(v.file, entry);
    }
    const nodes: HTMLElement[] = [];
    let system = '';
    for (const [file, entry] of files) {
      if (entry.system !== system) {
        system = entry.system;
        nodes.push(el('div', 'workshop-system', system));
      }
      const button = el('button', `workshop-file${file === this.file && this.query === '' ? ' active' : ''}`);
      button.type = 'button';
      button.append(document.createTextNode(file), el('span', 'workshop-count', entry.changed > 0 ? `${entry.changed} / ${entry.count}` : String(entry.count)));
      button.addEventListener('click', () => {
        this.file = file;
        this.query = '';
        this.ui.search.value = '';
        this.renderNav();
        this.renderList(true);
      });
      nodes.push(button);
    }
    this.ui.nav.replaceChildren(...nodes);
  }

  private renderList(toTop: boolean): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    const scroll = this.ui.list.scrollTop;
    const searching = this.query !== '';
    let shown: WorkshopVariable[];
    if (searching) {
      const words = this.query.split(/\s+/);
      shown = snapshot.variables.filter((_, k) => words.every((word) => this.searchIndex[k]!.includes(word)));
    } else shown = snapshot.variables.filter((v) => v.file === this.file);
    const nodes: HTMLElement[] = [];
    if (searching) {
      nodes.push(el('div', 'workshop-results', `${shown.length} résultat${shown.length > 1 ? 's' : ''}${shown.length > MAX_RESULTS ? ` (les ${MAX_RESULTS} premiers sont affichés)` : ''}`));
      for (const variable of shown.slice(0, MAX_RESULTS)) nodes.push(variableRow(variable, this.actions, true));
    } else nodes.push(...this.sections(shown));
    if (shown.length === 0) nodes.push(el('div', 'workshop-results', 'Aucune variable ne correspond à cette recherche.'));
    this.ui.list.replaceChildren(...nodes);
    this.ui.list.scrollTop = toTop ? 0 : scroll;
  }

  /** The sections of a file, each folded or unfolded (folded at first), and a button to unfold them all. */
  private sections(shown: readonly WorkshopVariable[]): HTMLElement[] {
    const groups = new Map<string, WorkshopVariable[]>();
    for (const variable of shown) {
      const list = groups.get(variable.section) ?? [];
      list.push(variable);
      groups.set(variable.section, list);
    }
    const keyOf = (section: string): string => `${this.file}\u0000${section}`;
    const allOpen = [...groups.keys()].every((section) => this.openSections.has(keyOf(section)));
    const toggleAll = el('button', 'workshop-unfold', allOpen ? 'Tout replier' : 'Tout déplier');
    toggleAll.type = 'button';
    toggleAll.addEventListener('click', () => {
      const unfold = ![...groups.keys()].every((section) => this.openSections.has(keyOf(section)));
      for (const section of groups.keys()) {
        if (!unfold) this.openSections.delete(keyOf(section));
        else this.openSections.add(keyOf(section));
      }
      this.renderList(false);
    });
    const nodes: HTMLElement[] = [toggleAll];
    for (const [section, variables] of groups) {
      const details = el('details', 'workshop-fold');
      details.open = this.openSections.has(keyOf(section));
      const changed = variables.filter((v) => v.value !== v.defaultValue).length;
      const summary = el('summary', 'workshop-section', section === '' ? 'Général' : section);
      summary.append(el('span', 'workshop-count', changed > 0 ? `${changed} / ${variables.length}` : String(variables.length)));
      details.append(summary);
      // Rows are built only when the section is open (a long file stays quick to show).
      const fill = (): void => {
        if (details.childElementCount === 1) details.append(...variables.map((variable) => variableRow(variable, this.actions, false)));
      };
      if (details.open) fill();
      details.addEventListener('toggle', () => {
        if (details.open) {
          this.openSections.add(keyOf(section));
          fill();
        } else this.openSections.delete(keyOf(section));
        toggleAll.textContent = [...groups.keys()].every((s) => this.openSections.has(keyOf(s))) ? 'Tout replier' : 'Tout déplier';
      });
      nodes.push(details);
    }
    return nodes;
  }
}
