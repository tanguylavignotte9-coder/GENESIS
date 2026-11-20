import type { AnimalDetails, LifeTables } from '../../shared/messages';
import { animalLines } from './life-lines';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Small sheet of an animal (clicked on the map): what it is and does, and its brain. */
export class AnimalSheet {
  uid = -1;
  /** Requests of this sheet carry ids from this base (the hover tooltip uses small ids). */
  static readonly REQUEST_BASE = 1_000_000_000;
  private request = AnimalSheet.REQUEST_BASE;

  constructor(
    private readonly panel: HTMLElement,
    private readonly body: HTMLElement,
    closeButton: HTMLButtonElement,
    brainButton: HTMLButtonElement,
    onBrain: (uid: number) => void,
  ) {
    closeButton.addEventListener('click', () => this.close());
    brainButton.addEventListener('click', () => {
      brainButton.blur();
      if (this.uid >= 0) onBrain(this.uid);
    });
  }

  open(uid: number): void {
    this.uid = uid;
    this.panel.hidden = false;
    this.body.replaceChildren(el('div', 'sheet-text muted', 'Chargement…'));
  }

  close(): void {
    this.uid = -1;
    this.panel.hidden = true;
  }

  get isOpen(): boolean {
    return this.uid >= 0;
  }

  nextRequest(): number {
    return ++this.request;
  }

  owns(requestId: number): boolean {
    return requestId > AnimalSheet.REQUEST_BASE;
  }

  render(animal: AnimalDetails | null, life: LifeTables, daysPerYear: number): void {
    if (!animal) {
      this.body.replaceChildren(el('div', 'sheet-text muted', 'Cet animal n’est plus là.'));
      return;
    }
    const [first, ...rest] = animalLines(animal, life, daysPerYear);
    this.body.replaceChildren(el('div', 'sheet-title', first ?? ''), ...rest.map((line) => el('div', 'sheet-text', line)));
  }
}
