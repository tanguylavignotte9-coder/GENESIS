import type { BuildingDetails, LifeTables } from '../../shared/messages';
import { buildingName, factLines, itemText, stateText } from './building-lines';

const fr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Panel of a building: function, state, builders, residents, and the content of the common stock. */
export class BuildingPanel {
  building = -1;

  constructor(
    private readonly panel: HTMLElement,
    private readonly body: HTMLElement,
    closeButton: HTMLButtonElement,
    private readonly onClose: () => void,
  ) {
    closeButton.addEventListener('click', () => this.close());
  }

  open(building: number): void {
    this.building = building;
    this.panel.hidden = false;
  }

  close(): void {
    this.building = -1;
    this.panel.hidden = true;
    this.onClose();
  }

  get isOpen(): boolean {
    return this.building >= 0;
  }

  render(details: BuildingDetails, tables: LifeTables): void {
    if (details.building !== this.building) return;
    const nodes: HTMLElement[] = [el('div', 'sheet-title', buildingName(details, tables)), el('div', 'sheet-sub', stateText(details))];
    nodes.push(el('div', 'sheet-section', 'Fonction'), el('div', 'sheet-text', details.description));
    const facts = factLines(details);
    if (facts.length > 0) {
      nodes.push(el('div', 'sheet-section', details.state === 0 ? 'Avancement' : 'État'));
      for (const fact of facts) nodes.push(el('div', 'sheet-text', fact));
    }
    if (details.builders.length > 0) nodes.push(el('div', 'sheet-section', 'Bâti par'), el('div', 'sheet-text', details.builders.join(', ')));
    if (details.residents.length > 0) nodes.push(el('div', 'sheet-section', 'Habitants'), el('div', 'sheet-text', details.residents.join(', ')));
    if (details.stock) {
      const capacity = details.capacity > 0 ? ` — à l’abri : ${fr.format(details.capacity)} de charge en nourriture` : ' — en tas à l’air libre (les bêtes et la pluie l’abîment plus vite)';
      nodes.push(el('div', 'sheet-section', 'Stock commun du camp'), el('div', 'sheet-note', `Biens communs de la tribu${capacity}`));
      const list = el('ul', 'sheet-list');
      const stock = [...details.stock].sort((a, b) => b.qty - a.qty);
      for (const line of stock) list.append(el('li', '', itemText(line, tables)));
      nodes.push(stock.length > 0 ? list : el('div', 'sheet-text muted', 'Vide'));
    }
    this.body.replaceChildren(...nodes);
  }
}
