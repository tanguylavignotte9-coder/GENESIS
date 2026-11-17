import type { FromSimMessage } from '../shared/messages';

const numberFormat = new Intl.NumberFormat('fr-FR');

/** Minimal HUD: shows the seed and the simulation tick, or an error. */
export function renderHud(element: HTMLElement, message: FromSimMessage): void {
  if (message.type === 'error') {
    element.classList.add('error');
    element.textContent = `Erreur de la simulation :\n${message.message}`;
    return;
  }
  element.classList.remove('error');
  element.textContent = `GENESIS · graine ${message.seed} · tic ${numberFormat.format(message.tick)}`;
}
