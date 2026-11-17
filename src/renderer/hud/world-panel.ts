import { isValidSeed } from '../../sim/core/rng';

const fr = new Intl.NumberFormat('fr-FR');
const MS_PER_SECOND = 1000;
const secondsFormat = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export interface WorldInfo {
  seed: number;
  generationMs: number;
  riverCount: number;
  lakeCount: number;
}

/**
 * Top HUD: world summary + seed field + "Nouveau monde" button + loading message.
 */
export class WorldPanel {
  private info: WorldInfo | null = null;

  constructor(
    private readonly summary: HTMLElement,
    private readonly form: HTMLFormElement,
    private readonly seedInput: HTMLInputElement,
    private readonly button: HTMLButtonElement,
    private readonly formError: HTMLElement,
    private readonly loading: HTMLElement,
    onNewWorld: (seed: number) => void,
  ) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const seed = this.readSeed();
      if (seed !== null) onNewWorld(seed);
    });
  }

  setGenerating(seed: number): void {
    this.loading.hidden = false;
    this.button.disabled = true;
    this.seedInput.value = String(seed);
    this.summary.textContent = `GENESIS · graine ${seed}`;
  }

  setWorld(info: WorldInfo): void {
    this.info = info;
    this.loading.hidden = true;
    this.button.disabled = false;
    this.render();
  }

  showError(message: string): void {
    this.loading.hidden = true;
    this.button.disabled = false;
    this.summary.classList.add('error');
    this.summary.textContent = `Erreur de la simulation :\n${message}`;
  }

  private render(): void {
    if (!this.info) return;
    const { seed, generationMs, riverCount, lakeCount } = this.info;
    this.summary.classList.remove('error');
    this.summary.textContent =
      `GENESIS · graine ${seed} · monde généré en ${secondsFormat.format(generationMs / MS_PER_SECOND)} s\n` +
      `${fr.format(riverCount)} rivières · ${fr.format(lakeCount)} lacs`;
  }

  /** Empty field = random seed. Returns null (and shows a message) if the text is not a valid seed. */
  private readSeed(): number | null {
    const text = this.seedInput.value.trim();
    this.formError.hidden = true;
    if (text === '') return randomSeed();
    const seed = Number(text);
    if (/^\d+$/.test(text) && isValidSeed(seed)) return seed;
    this.formError.textContent = 'La graine doit être un nombre entier entre 0 et 4 294 967 295 (ou laissez vide pour une graine au hasard).';
    this.formError.hidden = false;
    return null;
  }
}

/** A random seed (randomness is allowed here, outside the simulation). */
export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}
