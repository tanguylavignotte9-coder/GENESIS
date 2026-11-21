/**
 * A window of the spectator's tools (genealogy, relations, followed people, help): a title, a close
 * button, a body, opened by its button in the toolbar or by its key. Only one is open at a time
 * on the left of the screen (opening one closes the others).
 */
const OPEN = new Set<Overlay>();

export class Overlay {
  readonly root: HTMLElement;
  readonly body: HTMLElement;
  private readonly title: HTMLElement;
  private readonly button: HTMLButtonElement;
  onOpen: () => void = () => undefined;

  /** `key`: the letter that opens it (lower case). */
  constructor(bar: HTMLElement, label: string, key: string, hint: string, className = '') {
    this.root = document.createElement('section');
    this.root.className = `panel tool-window ${className}`.trim();
    this.root.hidden = true;
    const header = document.createElement('div');
    header.className = 'overlay-header';
    this.title = document.createElement('div');
    this.title.className = 'sheet-title';
    this.title.textContent = label;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tool-close';
    close.textContent = '✕';
    close.title = 'Fermer (Échap)';
    close.addEventListener('click', () => this.close());
    header.append(this.title, close);
    this.body = document.createElement('div');
    this.body.className = 'tool-body';
    this.root.append(header, this.body);
    document.body.append(this.root);
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'tool-button';
    this.button.textContent = label;
    this.button.title = `${hint} (${key.toUpperCase()})`;
    this.button.addEventListener('click', (event) => {
      (event.currentTarget as HTMLButtonElement).blur();
      this.toggle();
    });
    bar.append(this.button);
    window.addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.ctrlKey || event.altKey || event.metaKey) return;
      // The character typed (not the physical key): the same letter on AZERTY and QWERTY keyboards.
      if (event.key.toLowerCase() === key) this.toggle();
      else if (event.code === 'Escape' && this.isOpen) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  setTitle(text: string): void {
    this.title.textContent = text;
  }

  open(): void {
    for (const other of OPEN) if (other !== this) other.close();
    OPEN.add(this);
    this.root.hidden = false;
    this.button.classList.add('active');
    this.onOpen();
  }

  close(): void {
    OPEN.delete(this);
    this.root.hidden = true;
    this.button.classList.remove('active');
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }
}

/** A small element with a class and a text. */
export function el(tag: string, className: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** A clickable name (opens the person's sheet, or what `onClick` does). */
export function personLink(name: string, onClick: () => void, extraClass = ''): HTMLElement {
  const link = el('span', `person-link ${extraClass}`.trim(), name);
  link.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return link;
}
