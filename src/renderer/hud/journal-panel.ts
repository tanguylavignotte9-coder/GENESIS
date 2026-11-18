import type { EventPlace } from '../../sim/core/journal';
import type { JournalEntry } from '../../shared/messages';

/** Above this many entries, the oldest ones are no longer shown (they stay in the simulation). */
const MAX_SHOWN = 500;

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

/**
 * Journal panel: events from the most recent to the oldest. Each entry shows its date, its text
 * and what caused it; clicking it centers the camera on its place.
 */
export class JournalPanel {
  private readonly entries = new Map<number, JournalEntry>();

  constructor(
    private readonly panel: HTMLElement,
    private readonly toggle: HTMLButtonElement,
    private readonly list: HTMLElement,
    private readonly onSelect: (place: EventPlace) => void,
    private readonly onPerson: (person: number) => void = () => undefined,
    /** Name of a person (to make it clickable in the texts). */
    private readonly nameOf: (person: number) => string = () => '',
  ) {
    toggle.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
      this.renderToggle();
    });
    this.renderToggle();
  }

  clear(): void {
    this.entries.clear();
    this.list.replaceChildren(this.emptyMessage());
    this.renderToggle();
  }

  add(entries: readonly JournalEntry[]): void {
    if (this.entries.size === 0) this.list.replaceChildren();
    for (const entry of entries) {
      this.entries.set(entry.id, entry);
      this.list.prepend(this.renderEntry(entry));
    }
    while (this.list.childElementCount > MAX_SHOWN) this.list.lastElementChild?.remove();
    this.renderToggle();
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
      why.className = 'journal-cause';
      why.textContent = `Cause : ${cause.text} (${cause.date})`;
      item.append(why);
    }
    const place = entry.place;
    if (place) {
      item.classList.add('clickable');
      item.title = `Voir ${place.label} sur la carte`;
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
    item.textContent = 'Aucun événement pour l’instant.';
    return item;
  }

  private renderToggle(): void {
    const collapsed = this.panel.classList.contains('collapsed');
    this.toggle.textContent = `${collapsed ? '▸' : '▾'} Journal (${this.entries.size})`;
  }
}
