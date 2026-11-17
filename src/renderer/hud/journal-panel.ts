import type { EventPlace } from '../../sim/core/journal';
import type { JournalEntry } from '../../shared/messages';

/** Above this many entries, the oldest ones are no longer shown (they stay in the simulation). */
const MAX_SHOWN = 500;

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
    text.textContent = entry.text;
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
