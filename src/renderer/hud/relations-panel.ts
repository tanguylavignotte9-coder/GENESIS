import type { GroupsFacts, PersonDetails, Roster } from '../../shared/messages';
import { el, Overlay } from './overlay';

const SVG = 'http://www.w3.org/2000/svg';
const WIDTH = 560;
const HEIGHT = 420;
const RING = 165;
const NODE = 22;
/** Affection beyond which a tie counts as friendship, below which as rivalry. */
const FRIEND_ABOVE = 20;
const RIVAL_BELOW = -15;

/** Kinds of ties, with their colour (legend). */
const TIES = {
  family: { color: '#6aa2ea', label: 'famille' },
  love: { color: '#e889c0', label: 'amour' },
  friend: { color: '#6cc070', label: 'affection' },
  rival: { color: '#e07060', label: 'rivalité' },
  plain: { color: '#7d8796', label: 'connaissance' },
} as const;
const TRIBE_TIES = {
  alliance: { color: '#6cc070', label: 'alliance' },
  war: { color: '#e05050', label: 'guerre' },
  truce: { color: '#c0c0c0', label: 'trêve' },
  tribute: { color: '#e0b040', label: 'tribut (vers qui reçoit)' },
  known: { color: '#4a5260', label: 'se connaissent' },
} as const;

function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/**
 * Relations map (R): a graph of the ties of the person whose sheet is open (family, love,
 * affection, rivalry), and a graph of the tribes (alliances, wars, truces, tributes).
 */
export class RelationsPanel {
  private readonly overlay: Overlay;
  private mode: 'people' | 'tribes' = 'people';
  private details: PersonDetails | null = null;
  private roster: Roster | null = null;
  private groups: GroupsFacts | null = null;
  private readonly tabs: HTMLElement;
  private readonly content: HTMLElement;
  private renderedAt = 0;

  constructor(
    bar: HTMLElement,
    private readonly onPerson: (person: number) => void,
  ) {
    this.overlay = new Overlay(bar, 'Relations', 'r', 'Carte des relations entre personnes et entre tribus', 'relations');
    this.tabs = el('div', 'ideas-tabs');
    for (const [mode, label] of [
      ['people', 'Entre personnes'],
      ['tribes', 'Entre tribus'],
    ] as const) {
      const tab = el('button', 'ideas-tab', label) as HTMLButtonElement;
      tab.type = 'button';
      tab.addEventListener('click', () => {
        this.mode = mode;
        this.render();
      });
      this.tabs.append(tab);
    }
    this.content = el('div', '');
    this.overlay.body.append(this.tabs, this.content);
    this.overlay.onOpen = () => this.render();
  }

  get isOpen(): boolean {
    return this.overlay.isOpen;
  }

  setPerson(details: PersonDetails, roster: Roster): void {
    this.details = details;
    this.roster = roster;
    this.refresh();
  }

  setGroups(groups: GroupsFacts): void {
    this.groups = groups;
    this.refresh();
  }

  /** Opens the graph of a person's ties (their sheet must be open: it brings the details). */
  showPeople(): void {
    this.mode = 'people';
    if (!this.overlay.isOpen) this.overlay.open();
    else this.render();
  }

  private refresh(): void {
    const now = performance.now();
    if (this.overlay.isOpen && now - this.renderedAt > 1000) this.render();
  }

  private render(): void {
    this.renderedAt = performance.now();
    [...this.tabs.children].forEach((tab, k) => tab.classList.toggle('active', (k === 0) === (this.mode === 'people')));
    this.content.replaceChildren();
    if (this.mode === 'people') this.renderPeople();
    else this.renderTribes();
  }

  private legend(entries: readonly { color: string; label: string }[]): HTMLElement {
    const legend = el('div', 'relation-legend');
    for (const entry of entries) {
      const item = el('span', 'relation-legend-item');
      const swatch = el('span', 'relation-swatch');
      swatch.style.background = entry.color;
      item.append(swatch, document.createTextNode(entry.label));
      legend.append(item);
    }
    return legend;
  }

  private renderPeople(): void {
    const details = this.details;
    const roster = this.roster;
    if (!details || !roster) {
      this.content.append(el('div', 'muted', 'Ouvrez la fiche d’une personne (clic sur elle) : ses liens s’affichent ici.'));
      return;
    }
    const person = details.person;
    const nodes = new Map<number, { kind: keyof typeof TIES; strength: number; label: string }>();
    const kin = new Set<number>();
    for (const parent of [roster.mother[person]!, roster.father[person]!]) if (parent >= 0) kin.add(parent);
    for (let p = 0; p < roster.names.length; p++) if (roster.mother[p] === person || roster.father[p] === person) kin.add(p);
    for (const relation of details.social.relations) {
      const love = relation.person === details.spouse;
      const kind: keyof typeof TIES = love ? 'love' : kin.has(relation.person) ? 'family' : relation.affection >= FRIEND_ABOVE ? 'friend' : relation.affection <= RIVAL_BELOW ? 'rival' : 'plain';
      nodes.set(relation.person, { kind, strength: Math.abs(relation.affection), label: relation.tie });
    }
    if (details.spouse >= 0 && !nodes.has(details.spouse)) nodes.set(details.spouse, { kind: 'love', strength: 50, label: 'conjoint' });
    for (const k of kin) if (!nodes.has(k) && nodes.size < 16) nodes.set(k, { kind: 'family', strength: 30, label: roster.mother[person] === k ? 'mère' : roster.father[person] === k ? 'père' : 'enfant' });
    this.content.append(el('div', 'muted', `Liens de ${roster.names[person] ?? '?'} (clic sur un nom : sa fiche).`));
    const graph = svg('svg', { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'relation-svg' });
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    const list = [...nodes.entries()];
    list.forEach(([other, tie], k) => {
      const angle = (2 * Math.PI * k) / Math.max(1, list.length) - Math.PI / 2;
      const x = cx + Math.cos(angle) * RING;
      const y = cy + Math.sin(angle) * RING * 0.85;
      graph.append(svg('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: TIES[tie.kind].color, 'stroke-width': 1 + Math.min(6, tie.strength / 15), 'stroke-opacity': 0.85 }));
      this.node(graph, x, y, roster.names[other] ?? '?', tie.label, roster.alive[other] === 1, () => this.onPerson(other));
    });
    this.node(graph, cx, cy, roster.names[person] ?? '?', '', roster.alive[person] === 1, () => this.onPerson(person), true);
    this.content.append(graph, this.legend(Object.values(TIES)));
  }

  private node(graph: SVGElement, x: number, y: number, name: string, sub: string, alive: boolean, onClick: () => void, center = false): void {
    const group = svg('g', { class: 'relation-node' });
    group.append(svg('circle', { cx: x, cy: y, r: center ? NODE * 1.2 : NODE * 0.55, fill: center ? '#2c3a52' : '#1d2433', stroke: alive ? '#d8dde6' : '#6b7280', 'stroke-dasharray': alive ? '' : '3 2' }));
    const label = svg('text', { x, y: y + (center ? 5 : -NODE * 0.7), 'text-anchor': 'middle', class: 'relation-name' });
    label.textContent = alive ? name : `${name} †`;
    group.append(label);
    if (sub) {
      const tie = svg('text', { x, y: y + NODE * 1.05, 'text-anchor': 'middle', class: 'relation-tie-label' });
      tie.textContent = sub;
      group.append(tie);
    }
    group.addEventListener('click', onClick);
    graph.append(group);
  }

  private renderTribes(): void {
    const groups = this.groups;
    const tribes = (groups?.groups ?? []).filter((g) => g.level === 0 && !g.exile);
    if (tribes.length === 0) {
      this.content.append(el('div', 'muted', 'Aucune tribu.'));
      return;
    }
    const graph = svg('svg', { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'relation-svg' });
    const position = new Map<number, { x: number; y: number }>();
    tribes.forEach((tribe, k) => {
      const angle = (2 * Math.PI * k) / tribes.length - Math.PI / 2;
      const r = tribes.length === 1 ? 0 : RING;
      position.set(tribe.id, { x: WIDTH / 2 + Math.cos(angle) * r, y: HEIGHT / 2 + Math.sin(angle) * r * 0.85 });
    });
    const drawn = new Set<string>();
    for (const tribe of tribes) {
      for (const known of tribe.known) {
        const a = position.get(tribe.id);
        const b = position.get(known.group);
        const key = [Math.min(tribe.id, known.group), Math.max(tribe.id, known.group)].join(':');
        if (!a || !b || drawn.has(key)) continue;
        drawn.add(key);
        const r = known.relation;
        const kind: keyof typeof TRIBE_TIES = r.war ? 'war' : r.tribute !== 0 ? 'tribute' : r.truce ? 'truce' : known.allied ? 'alliance' : 'known';
        graph.append(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: TRIBE_TIES[kind].color, 'stroke-width': kind === 'known' ? 1 : 3, 'stroke-dasharray': kind === 'truce' ? '6 4' : '' }));
        if (kind === 'tribute') {
          // The tribute flows from the payer to who receives it: a dot near the receiver.
          const to = r.tribute === 1 ? b : a;
          const from = r.tribute === 1 ? a : b;
          graph.append(svg('circle', { cx: from.x + (to.x - from.x) * 0.8, cy: from.y + (to.y - from.y) * 0.8, r: 5, fill: TRIBE_TIES.tribute.color }));
        }
      }
    }
    for (const tribe of tribes) {
      const p = position.get(tribe.id)!;
      const leader = tribe.leaders[0];
      this.node(graph, p.x, p.y, tribe.name.replace(/^la tribu des /, ''), `${tribe.members} pers.`, true, () => {
        if (leader) this.onPerson(leader.person);
      });
    }
    this.content.append(el('div', 'muted', 'Clic sur une tribu : la fiche de son chef.'), graph, this.legend(Object.values(TRIBE_TIES)));
  }
}
