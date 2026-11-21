import type { EventPlace } from '../../sim/core/journal';
import type { JournalEntry } from '../../shared/messages';

/** Above this many entries, the oldest matching ones are no longer shown (they stay in memory). */
const MAX_SHOWN = 500;
/** How far back a chain of causes is followed. */
const CHAIN_DEPTH = 12;

/** Kinds of events for the filter, by the beginning of their type. */
const CATEGORIES: readonly { id: string; label: string; prefixes: readonly string[] }[] = [
  { id: 'life', label: 'Naissances, morts, santé', prefixes: ['life.', 'humans.death'] },
  { id: 'social', label: 'Vie sociale', prefixes: ['social.'] },
  { id: 'groups', label: 'Pouvoir et groupes', prefixes: ['groups.'] },
  { id: 'conflict', label: 'Conflits et diplomatie', prefixes: ['conflict.'] },
  { id: 'ideas', label: 'Idées : savoirs, cultures, religions', prefixes: ['ideas.'] },
  { id: 'work', label: 'Travail, bâtiments, élevage', prefixes: ['production.', 'humans.settlement', 'humans.campMoved', 'camp.'] },
  { id: 'nature', label: 'Faune, flore et climat', prefixes: ['fauna.', 'flora.', 'climate.', 'world.'] },
];

function categoryOf(type: string): string {
  for (const category of CATEGORIES) if (category.prefixes.some((prefix) => type.startsWith(prefix))) return category.id;
  return 'other';
}

/** Position of `word` in `text` as a whole word (not inside another name), or -1. */
function findWord(text: string, word: string): number {
  let from = 0;
  while (from <= text.length) {
    const at = text.indexOf(word, from);
    if (at < 0) return -1;
    const before = at === 0 ? '' : text[at - 1]!;
    const after = text[at + word.length] ?? '';
    if (!/[\p{L}]/u.test(before) && !/[\p{L}]/u.test(after)) return at;
    from = at + 1;
  }
  return -1;
}

interface Filters {
  tribe: number;
  person: number;
  category: string;
  fromYear: number;
  toYear: number;
  search: string;
}

/**
 * Journal panel: events from the most recent to the oldest, filtered by tribe, person, kind of
 * event and period, with a text search. Each entry shows its date, its text and its causes; a
 * click on a cause shows the whole chain of causes (each one clickable in turn). Clicking an
 * entry centres the camera on its place; clicking a name opens the person's sheet.
 */
export class JournalPanel {
  private readonly entries = new Map<number, JournalEntry>();
  /** Ids in arrival order (oldest first). */
  private readonly order: number[] = [];
  private filters: Filters = { tribe: -1, person: -1, category: '', fromYear: 0, toYear: 0, search: '' };
  private chain = -1;
  private daysPerYear = 40;
  private tribeNames = new Map<number, string>();
  private tribeKey = '';
  private readonly bar: HTMLElement;
  private readonly tribeSelect: HTMLSelectElement;
  private readonly categorySelect: HTMLSelectElement;
  private readonly fromInput: HTMLInputElement;
  private readonly toInput: HTMLInputElement;
  private readonly searchInput: HTMLInputElement;
  private readonly personChip: HTMLElement;
  private renderPending = false;

  constructor(
    private readonly panel: HTMLElement,
    private readonly toggle: HTMLButtonElement,
    private readonly list: HTMLElement,
    private readonly onSelect: (place: EventPlace) => void,
    private readonly onPerson: (person: number) => void = () => undefined,
    /** Name of a person (to make it clickable in the texts). */
    private readonly nameOf: (person: number) => string = () => '',
    /** The person whose sheet is open (-1 none), for the « this person » filter. */
    private readonly currentPerson: () => number = () => -1,
  ) {
    toggle.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
      this.renderToggle();
    });
    this.bar = document.createElement('div');
    this.bar.className = 'journal-filters';
    this.searchInput = this.input('search', 'Rechercher…');
    this.tribeSelect = document.createElement('select');
    this.tribeSelect.title = 'Seulement les événements d’une tribu';
    this.categorySelect = document.createElement('select');
    this.categorySelect.title = 'Seulement un type d’événement';
    this.categorySelect.append(new Option('Tous les événements', ''), ...CATEGORIES.map((c) => new Option(c.label, c.id)), new Option('Autres', 'other'));
    this.fromInput = this.input('number', 'de l’an');
    this.toInput = this.input('number', 'à l’an');
    this.fromInput.min = '1';
    this.toInput.min = '1';
    this.personChip = document.createElement('span');
    this.personChip.className = 'journal-person';
    const personButton = document.createElement('button');
    personButton.type = 'button';
    personButton.textContent = 'Personne ouverte';
    personButton.title = 'Seulement les événements de la personne dont la fiche est ouverte';
    personButton.addEventListener('click', () => {
      this.filters.person = this.filters.person >= 0 ? -1 : this.currentPerson();
      this.render();
    });
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'Tout voir';
    reset.title = 'Enlever tous les filtres';
    reset.addEventListener('click', () => {
      this.filters = { tribe: -1, person: -1, category: '', fromYear: 0, toYear: 0, search: '' };
      this.searchInput.value = '';
      this.fromInput.value = '';
      this.toInput.value = '';
      this.tribeSelect.value = '-1';
      this.categorySelect.value = '';
      this.chain = -1;
      this.render();
    });
    const period = document.createElement('span');
    period.className = 'journal-period';
    period.append(this.fromInput, this.toInput);
    this.bar.append(this.searchInput, this.tribeSelect, this.categorySelect, period, personButton, this.personChip, reset);
    list.before(this.bar);
    const changed = (): void => {
      this.filters.search = this.searchInput.value.trim().toLowerCase();
      this.filters.tribe = Number(this.tribeSelect.value);
      this.filters.category = this.categorySelect.value;
      this.filters.fromYear = Number(this.fromInput.value) || 0;
      this.filters.toYear = Number(this.toInput.value) || 0;
      this.chain = -1;
      this.render();
    };
    for (const control of [this.searchInput, this.fromInput, this.toInput]) control.addEventListener('input', changed);
    for (const control of [this.tribeSelect, this.categorySelect]) control.addEventListener('change', changed);
    this.setTribes([]);
    this.renderToggle();
  }

  private input(type: string, placeholder: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = type;
    input.placeholder = placeholder;
    input.spellcheck = false;
    return input;
  }

  setDaysPerYear(days: number): void {
    this.daysPerYear = Math.max(1, days);
  }

  /** The tribes the filter offers (living ones, and the names of those already seen). */
  setTribes(tribes: readonly { id: number; name: string }[]): void {
    for (const tribe of tribes) this.tribeNames.set(tribe.id, tribe.name);
    const sorted = [...this.tribeNames.entries()].sort((a, b) => a[0] - b[0]);
    const key = sorted.map(([id, name]) => `${id}:${name}`).join('|');
    if (key === this.tribeKey && this.tribeSelect.options.length > 0) return;
    this.tribeKey = key;
    const value = this.tribeSelect.value || '-1';
    this.tribeSelect.replaceChildren(new Option('Toutes les tribus', '-1'), ...sorted.map(([id, name]) => new Option(name, String(id))));
    this.tribeSelect.value = value;
  }

  clear(): void {
    this.entries.clear();
    this.order.length = 0;
    this.tribeNames.clear();
    this.tribeKey = '';
    this.chain = -1;
    this.setTribes([]);
    this.list.replaceChildren(this.emptyMessage());
    this.renderToggle();
  }

  add(entries: readonly JournalEntry[]): void {
    for (const entry of entries) {
      if (!this.entries.has(entry.id)) this.order.push(entry.id);
      this.entries.set(entry.id, entry);
    }
    if (this.chain >= 0) {
      this.renderToggle();
      return;
    }
    // Unfiltered, new entries are simply put on top; with filters, the list is rebuilt soon.
    if (!this.filtering()) {
      if (this.list.firstElementChild?.classList.contains('journal-empty')) this.list.replaceChildren();
      for (const entry of entries) this.list.prepend(this.renderEntry(entry));
      while (this.list.childElementCount > MAX_SHOWN) this.list.lastElementChild?.remove();
    } else this.scheduleRender();
    this.renderToggle();
  }

  /** Shows the chain of causes of an event (the event, what caused it, what caused that…). */
  showChain(id: number): void {
    this.chain = id;
    this.panel.classList.remove('collapsed');
    this.render();
  }

  private filtering(): boolean {
    const f = this.filters;
    return f.tribe >= 0 || f.person >= 0 || f.category !== '' || f.fromYear > 0 || f.toYear > 0 || f.search !== '';
  }

  private matches(entry: JournalEntry): boolean {
    const f = this.filters;
    if (f.tribe >= 0 && !entry.tribes.includes(f.tribe)) return false;
    if (f.person >= 0 && !entry.people.includes(f.person)) return false;
    if (f.category && categoryOf(entry.type) !== f.category) return false;
    const year = Math.floor(entry.day / this.daysPerYear) + 1;
    if (f.fromYear > 0 && year < f.fromYear) return false;
    if (f.toYear > 0 && year > f.toYear) return false;
    if (f.search && !entry.text.toLowerCase().includes(f.search) && !entry.date.toLowerCase().includes(f.search)) return false;
    return true;
  }

  private scheduleRender(): void {
    if (this.renderPending) return;
    this.renderPending = true;
    setTimeout(() => {
      this.renderPending = false;
      this.render();
    }, 400);
  }

  private render(): void {
    const name = this.filters.person >= 0 ? this.nameOf(this.filters.person) : '';
    this.personChip.textContent = name ? `de ${name}` : '';
    this.list.replaceChildren();
    if (this.chain >= 0) {
      this.renderChain();
      this.renderToggle();
      return;
    }
    let shown = 0;
    for (let k = this.order.length - 1; k >= 0 && shown < MAX_SHOWN; k--) {
      const entry = this.entries.get(this.order[k]!)!;
      if (!this.matches(entry)) continue;
      this.list.append(this.renderEntry(entry));
      shown++;
    }
    if (shown === 0) this.list.append(this.emptyMessage());
    this.renderToggle();
  }

  private renderChain(): void {
    const head = document.createElement('li');
    head.className = 'journal-chain-head';
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = '← Retour au journal';
    back.addEventListener('click', () => {
      this.chain = -1;
      this.render();
    });
    head.append(back, document.createTextNode(' Chaîne des causes, de l’événement à ses origines :'));
    this.list.append(head);
    const seen = new Set<number>();
    let level = [this.chain];
    for (let depth = 0; depth < CHAIN_DEPTH && level.length > 0; depth++) {
      const next: number[] = [];
      for (const id of level) {
        if (seen.has(id)) continue;
        seen.add(id);
        const entry = this.entries.get(id);
        if (!entry) continue;
        const item = this.renderEntry(entry);
        item.style.marginLeft = `${Math.min(depth, 8) * 10}px`;
        if (depth > 0) item.classList.add('journal-chain-cause');
        this.list.append(item);
        next.push(...entry.causes);
      }
      level = next;
    }
  }

  private renderEntry(entry: JournalEntry): HTMLElement {
    const item = document.createElement('li');
    const date = document.createElement('div');
    date.className = 'journal-date';
    date.textContent = entry.date;
    const text = document.createElement('div');
    text.append(...this.withPeople(entry.text, entry.people));
    item.append(date, text);
    for (const causeId of entry.causes) {
      const cause = this.entries.get(causeId);
      if (!cause) continue;
      const why = document.createElement('div');
      why.className = 'journal-cause clickable';
      why.textContent = `Cause : ${cause.text} (${cause.date})`;
      why.title = 'Remonter la chaîne des causes';
      why.addEventListener('click', (event) => {
        event.stopPropagation();
        this.showChain(causeId);
      });
      item.append(why);
    }
    const place = entry.place;
    if (place) {
      item.classList.add('clickable');
      item.title = `Voir ${place.label || 'le lieu'} sur la carte`;
      item.addEventListener('click', () => this.onSelect(place));
    }
    return item;
  }

  /** The text, with the names of the people concerned turned into links to their sheet. */
  private withPeople(text: string, people: readonly number[]): Node[] {
    const names = people.map((person) => ({ person, name: this.nameOf(person) })).filter((entry) => entry.name !== '');
    if (names.length === 0) return [document.createTextNode(text)];
    const nodes: Node[] = [];
    let rest = text;
    while (rest !== '') {
      let first = -1;
      let found: { person: number; name: string } | null = null;
      for (const entry of names) {
        const at = findWord(rest, entry.name);
        if (at >= 0 && (first < 0 || at < first)) {
          first = at;
          found = entry;
        }
      }
      if (!found) {
        nodes.push(document.createTextNode(rest));
        break;
      }
      if (first > 0) nodes.push(document.createTextNode(rest.slice(0, first)));
      const link = document.createElement('span');
      link.className = 'person-link';
      link.textContent = found.name;
      link.title = 'Ouvrir sa fiche';
      const person = found.person;
      link.addEventListener('click', (event) => {
        event.stopPropagation();
        this.onPerson(person);
      });
      nodes.push(link);
      rest = rest.slice(first + found.name.length);
    }
    return nodes;
  }

  private emptyMessage(): HTMLElement {
    const item = document.createElement('li');
    item.className = 'journal-empty';
    item.textContent = this.entries.size === 0 ? 'Aucun événement pour l’instant.' : 'Aucun événement ne correspond aux filtres.';
    return item;
  }

  private renderToggle(): void {
    const collapsed = this.panel.classList.contains('collapsed');
    this.bar.hidden = collapsed;
    const filtered = this.filtering() || this.chain >= 0 ? ' · filtré' : '';
    this.toggle.textContent = `${collapsed ? '▸' : '▾'} Journal (${this.entries.size})${filtered}`;
  }
}
