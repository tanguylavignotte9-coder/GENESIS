import type { JournalEntry, Roster } from '../../shared/messages';
import { el, Overlay, personLink } from './overlay';

/** How long a notification stays on screen. */
const TOAST_MS = 9000;
const TOASTS_SHOWN = 4;
const HISTORY = 40;

/** The events of a life worth a notification, and how to say them. */
function noticeOf(entry: JournalEntry, person: number, roster: Roster): string | null {
  const name = roster.names[person] ?? '?';
  const female = roster.female[person] === 1;
  switch (entry.type) {
    case 'life.birth': {
      const child = entry.people[0];
      if (child === person || child === undefined) return null;
      return `${name} a eu un enfant : ${roster.names[child] ?? '?'}.`;
    }
    case 'humans.death':
      return entry.people[0] === person ? `${name} est mort${female ? 'e' : ''}. ${entry.text}` : null;
    case 'life.crippled':
      return entry.people[0] === person ? entry.text : null;
    case 'groups.leader':
    case 'groups.succession':
    case 'groups.overthrown':
    case 'groups.contested':
      return `Pouvoir : ${entry.text}`;
    default:
      // A wound (a fight, a predator, an animal that fought back).
      if (/bless/.test(entry.text)) return `Blessure : ${entry.text}`;
      return null;
  }
}

/**
 * Followed people (F): favourites marked from their sheet (kept for this world in the browser
 * storage), and notifications of their lives (a child born, a wound, power taken, death).
 */
export class Favorites {
  private readonly overlay: Overlay;
  private favorites = new Set<number>();
  private seed = '';
  private roster: Roster | null = null;
  private readonly history: { person: number; text: string; date: string }[] = [];
  private readonly toasts: HTMLElement;
  private readonly list: HTMLElement;
  private readonly log: HTMLElement;
  onChange: () => void = () => undefined;

  constructor(
    bar: HTMLElement,
    private readonly onPerson: (person: number) => void,
  ) {
    this.overlay = new Overlay(bar, 'Suivis', 'f', 'Personnages suivis et leurs nouvelles', 'favorites');
    this.list = el('div', '');
    this.log = el('div', '');
    this.overlay.body.append(el('div', 'muted', 'Marquez une personne avec ☆ dans sa fiche pour la suivre : vous serez prévenu de la naissance de ses enfants, de ses blessures, de ses prises de pouvoir et de sa mort.'), this.list, el('div', 'stats-title', 'Dernières nouvelles'), this.log);
    this.overlay.onOpen = () => this.render();
    this.toasts = el('div', 'toasts');
    document.body.append(this.toasts);
  }

  /** A new world (or a save): its own favourites. */
  setWorld(seed: number): void {
    this.seed = String(seed);
    this.favorites = new Set(this.read());
    this.history.length = 0;
    this.toasts.replaceChildren();
    this.render();
  }

  setRoster(roster: Roster): void {
    this.roster = roster;
  }

  has(person: number): boolean {
    return this.favorites.has(person);
  }

  toggle(person: number): void {
    if (this.favorites.has(person)) this.favorites.delete(person);
    else this.favorites.add(person);
    this.write();
    this.render();
    this.onChange();
  }

  /** New journal events: those of the favourites' lives become notifications. */
  onEntries(entries: readonly JournalEntry[]): void {
    const roster = this.roster;
    if (!roster || this.favorites.size === 0) return;
    let changed = false;
    for (const entry of entries) {
      for (const person of entry.people) {
        if (!this.favorites.has(person)) continue;
        const text = noticeOf(entry, person, roster);
        if (!text) continue;
        this.history.unshift({ person, text, date: entry.date });
        this.toast(person, text);
        changed = true;
        break;
      }
    }
    if (this.history.length > HISTORY) this.history.length = HISTORY;
    if (changed && this.overlay.isOpen) this.render();
  }

  private toast(person: number, text: string): void {
    const toast = el('div', 'panel toast', text);
    toast.title = 'Ouvrir sa fiche';
    toast.addEventListener('click', () => {
      this.onPerson(person);
      toast.remove();
    });
    this.toasts.prepend(toast);
    while (this.toasts.childElementCount > TOASTS_SHOWN) this.toasts.lastElementChild?.remove();
    setTimeout(() => toast.remove(), TOAST_MS);
  }

  private render(): void {
    this.list.replaceChildren();
    this.log.replaceChildren();
    const roster = this.roster;
    if (this.favorites.size === 0) this.list.append(el('div', 'muted', 'Personne n’est suivi pour l’instant.'));
    for (const person of [...this.favorites].sort((a, b) => a - b)) {
      const row = el('div', 'tree-row');
      const alive = roster ? roster.alive[person] === 1 : true;
      row.append(personLink(roster?.names[person] ?? `#${person}`, () => this.onPerson(person), alive ? '' : 'tree-dead'));
      if (roster) row.append(el('span', 'muted', alive ? ` ${Math.floor(roster.ageYears[person] ?? 0)} ans` : ' †'));
      const remove = el('button', 'tool-mini', 'ne plus suivre') as HTMLButtonElement;
      remove.type = 'button';
      remove.addEventListener('click', () => this.toggle(person));
      row.append(remove);
      this.list.append(row);
    }
    if (this.history.length === 0) this.log.append(el('div', 'muted', 'Aucune nouvelle.'));
    for (const item of this.history) {
      const row = el('div', 'tree-row');
      row.append(el('span', 'muted', `${item.date} — `), personLink(item.text, () => this.onPerson(item.person)));
      this.log.append(row);
    }
  }

  private key(): string {
    return `genesis.favorites.${this.seed}`;
  }

  private read(): number[] {
    try {
      const raw = window.localStorage.getItem(this.key());
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((value): value is number => Number.isInteger(value)) : [];
    } catch {
      return [];
    }
  }

  private write(): void {
    try {
      window.localStorage.setItem(this.key(), JSON.stringify([...this.favorites]));
    } catch {
      // No storage (private window): the favourites last as long as the session.
    }
  }
}
