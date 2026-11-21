import type { GroupsFacts, IdeasFacts } from '../../shared/messages';
import { ideaColor, tribeColorCss } from '../art/tribe';
import { POLITICAL_LAYERS, type PoliticalLayer } from '../map/political-layer';
import { el, Overlay } from './overlay';

const RINGS = ['territory', 'culture', 'language', 'religion'] as const;

function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Political view (P): which layers the map shows, and what each colour means. */
export class PoliticalPanel {
  private readonly overlay: Overlay;
  private groups: GroupsFacts | null = null;
  private ideas: IdeasFacts | null = null;
  private readonly legend: HTMLElement;
  private renderedAt = 0;

  constructor(bar: HTMLElement, private readonly layer: PoliticalLayer) {
    this.overlay = new Overlay(bar, 'Politique', 'p', 'Vue politique : calques de la carte', 'political');
    const checks = el('div', 'political-checks');
    for (const option of POLITICAL_LAYERS) {
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = option.id === 'territory' || option.id === 'ties';
      layer.toggle(option.id, false);
      box.addEventListener('change', () => {
        layer.toggle(option.id, box.checked && this.overlay.isOpen);
        this.render();
      });
      label.append(box, document.createTextNode(` ${option.label}`));
      checks.append(label);
    }
    this.legend = el('div', '');
    this.overlay.body.append(el('div', 'muted', 'Les calques restent sur la carte tant que cette fenêtre est ouverte.'), checks, this.legend);
    this.overlay.onOpen = () => {
      this.apply(true);
      this.render();
    };
    // Closing the window hides the layers (the map goes back to normal).
    const root = this.overlay.root;
    new MutationObserver(() => this.apply(!root.hidden)).observe(root, { attributes: true, attributeFilter: ['hidden'] });
  }

  private apply(open: boolean): void {
    const boxes = this.overlay.body.querySelectorAll<HTMLInputElement>('.political-checks input');
    boxes.forEach((box, k) => this.layer.toggle(POLITICAL_LAYERS[k]!.id, open && box.checked));
  }

  setGroups(groups: GroupsFacts): void {
    this.groups = groups;
    this.refresh();
  }

  setIdeas(ideas: IdeasFacts): void {
    this.ideas = ideas;
    this.refresh();
  }

  private refresh(): void {
    const now = performance.now();
    if (this.overlay.isOpen && now - this.renderedAt > 2000) this.render();
  }

  private render(): void {
    this.renderedAt = performance.now();
    this.legend.replaceChildren();
    const tribes = (this.groups?.groups ?? []).filter((g) => g.level === 0);
    const label = (id: number): string => this.ideas?.ideas.find((idea) => idea.id === id)?.label ?? '—';
    const table = document.createElement('table');
    table.className = 'political-table';
    const head = document.createElement('tr');
    for (const title of ['Tribu', 'Culture', 'Langue', 'Religion', 'Relations']) head.append(el('th', '', title));
    table.append(head);
    for (const tribe of tribes) {
      const row = document.createElement('tr');
      const name = el('td', '');
      const swatch = el('span', 'relation-swatch');
      swatch.style.background = tribeColorCss(tribe.id);
      name.append(swatch, document.createTextNode(tribe.exile ? `${tribe.name} (camp d’exilé)` : tribe.name));
      row.append(name);
      for (const ring of ['culture', 'language', 'religion'] as const) {
        const cell = el('td', '');
        const id = tribe[ring];
        if (id >= 0) {
          const dot = el('span', 'relation-swatch');
          dot.style.background = css(ideaColor(id * 4 + RINGS.indexOf(ring)));
          cell.append(dot);
        }
        cell.append(document.createTextNode(id >= 0 ? label(id) : '—'));
        row.append(cell);
      }
      const ties = tribe.known
        .map((k) => (k.relation.war ? `guerre avec ${k.name}` : k.relation.tribute === 1 ? `tribut à ${k.name}` : k.relation.tribute === -1 ? `tribut de ${k.name}` : k.relation.truce ? `trêve avec ${k.name}` : k.allied ? `alliée à ${k.name}` : ''))
        .filter((text) => text !== '');
      row.append(el('td', 'muted', ties.join(' · ') || '—'));
      table.append(row);
    }
    this.legend.append(table, el('div', 'muted', 'Sur la carte : disque de la couleur de la tribu (territoire), anneaux de la culture, de la langue et de la religion ; traits verts (alliance), rouges (guerre), dorés (tribut), pointillés gris (trêve).'));
  }
}
