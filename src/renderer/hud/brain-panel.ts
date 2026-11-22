import type { BrainFacts, BrainOption } from '../../sim/core/brain-facts';

/**
 * Visual brain (step 10.5): the decision of the watched person or animal drawn as a network. Left,
 * what it feels and knows; right, its possible actions with their score; links green when they push,
 * red when they hold back, wider when stronger. Below, the detail of every score and the last
 * decisions with the reason of each change. Updated live (pause the game to examine it).
 */

const SVG = 'http://www.w3.org/2000/svg';
const ROW = 22;
const GROUP_GAP = 14;
const WIDTH = 760;
const LEFT_X = 8;
const LEFT_W = 230;
const RIGHT_X = 520;
const RIGHT_W = 232;
const PERCENT = 100;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

const STATE_TEXT: Record<BrainOption['state'], string> = { chosen: 'choisi', possible: 'possible', failed: 'voulu mais impossible', blocked: 'ne s’applique pas' };

export class BrainPanel {
  /** What is watched ('none' when closed). */
  kind: 'human' | 'animal' | 'none' = 'none';
  id = -1;
  private readonly openDetails = new Set<string>();
  private hovered: string | null = null;
  private last: BrainFacts | null = null;

  constructor(
    private readonly panel: HTMLElement,
    private readonly title: HTMLElement,
    private readonly body: HTMLElement,
    closeButton: HTMLButtonElement,
    private readonly onWatch: (kind: 'human' | 'animal' | 'none', id: number) => void,
  ) {
    closeButton.addEventListener('click', () => this.close());
  }

  open(kind: 'human' | 'animal', id: number): void {
    this.kind = kind;
    this.id = id;
    this.last = null;
    this.openDetails.clear();
    this.panel.hidden = false;
    this.title.textContent = 'Cerveau…';
    this.body.replaceChildren(el('div', 'sheet-text muted', 'Chargement…'));
    this.onWatch(kind, id);
  }

  close(): void {
    if (this.kind === 'none') return;
    this.kind = 'none';
    this.panel.hidden = true;
    this.onWatch('none', -1);
  }

  receive(brain: BrainFacts): void {
    if (brain.kind !== this.kind || brain.id !== this.id) return;
    this.last = brain;
    this.render(brain);
  }

  private render(brain: BrainFacts): void {
    this.title.textContent = `Cerveau de ${brain.name}${brain.doing ? ` — ${brain.doing.toLowerCase()}` : ''}`;
    const nodes: HTMLElement[] = [];
    if (brain.when) nodes.push(el('div', 'sheet-text muted', `Dernière décision : ${brain.when} · mise à jour en direct (mettez le jeu en pause pour examiner)`));
    if (brain.note) nodes.push(el('div', 'sheet-text muted', brain.note));
    if (brain.options.length > 0) nodes.push(this.network(brain), this.details(brain));
    nodes.push(el('div', 'sheet-section', 'Dernières décisions'));
    if (brain.history.length === 0) nodes.push(el('div', 'sheet-text muted', 'Aucune encore'));
    const list = el('ol', 'brain-history');
    for (const line of brain.history) list.append(el('li', '', `${line.when} — ${line.text}`));
    nodes.push(list);
    this.body.replaceChildren(...nodes);
  }

  /** The network: inputs on the left (by group), actions on the right (by score), links between. */
  private network(brain: BrainFacts): HTMLElement {
    const box = el('div', 'brain-network');
    const left = new Map<string, number>();
    const groups = [...new Set(brain.nodes.map((node) => node.group))];
    let y = 8;
    const labels: SVGElement[] = [];
    for (const group of groups) {
      labels.push(text(LEFT_X, y + 10, group.toUpperCase(), 'brain-group'));
      y += 16;
      for (const node of brain.nodes.filter((n) => n.group === group)) {
        left.set(node.id, y + ROW / 2);
        labels.push(svg('rect', { x: LEFT_X, y: y + 2, width: LEFT_W, height: ROW - 4, rx: 4, class: 'brain-node' }));
        if (node.value >= 0) labels.push(svg('rect', { x: LEFT_X, y: y + 2, width: Math.max(1, LEFT_W * Math.min(1, node.value)), height: ROW - 4, rx: 4, class: 'brain-node-fill' }));
        labels.push(text(LEFT_X + 6, y + ROW / 2 + 4, node.value >= 0 ? `${node.label} ${Math.round(node.value * PERCENT)} %` : node.label, 'brain-label'));
        y += ROW;
      }
      y += GROUP_GAP;
    }
    const options = [...brain.options].sort((a, b) => b.score - a.score);
    const best = Math.max(1e-9, ...options.map((option) => option.score));
    const right = new Map<string, number>();
    const rightHeight = options.length * (ROW + 6);
    let ry = Math.max(8, (y - rightHeight) / 2);
    for (const option of options) {
      right.set(option.id, ry + ROW / 2);
      labels.push(svg('rect', { x: RIGHT_X, y: ry + 2, width: RIGHT_W, height: ROW - 4, rx: 4, class: `brain-option ${option.state}`, 'data-option': option.id }));
      labels.push(svg('rect', { x: RIGHT_X, y: ry + 2, width: Math.max(1, (RIGHT_W * option.score) / best), height: ROW - 4, rx: 4, class: 'brain-option-fill' }));
      labels.push(text(RIGHT_X + 6, ry + ROW / 2 + 4, `${option.label} — ${option.score.toFixed(2).replace('.', ',')}`, 'brain-label'));
      ry += ROW + 6;
    }
    const height = Math.max(y, ry) + 8;
    const root = svg('svg', { width: WIDTH, height, viewBox: `0 0 ${WIDTH} ${height}`, class: 'brain-svg' });
    const links = svg('g', {});
    for (const link of brain.links) {
      const y1 = left.get(link.from);
      const y2 = right.get(link.to);
      if (y1 === undefined || y2 === undefined) continue;
      const x1 = LEFT_X + LEFT_W;
      const x2 = RIGHT_X;
      const mid = (x1 + x2) / 2;
      const path = svg('path', {
        d: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`,
        class: `brain-link ${link.push ? 'push' : 'hold'}${this.hovered && this.hovered !== link.to ? ' dim' : ''}`,
        'stroke-width': (0.8 + 5 * link.strength).toFixed(1),
      });
      path.append(svg('title', {}));
      path.lastChild!.textContent = `${link.push ? 'Pousse' : 'Freine'} (force ${Math.round(link.strength * PERCENT)} %)`;
      links.append(path);
    }
    root.append(links, ...labels);
    root.addEventListener('mouseover', (event) => {
      const target = (event.target as Element).getAttribute('data-option');
      if (target !== this.hovered && target) {
        this.hovered = target;
        if (this.last) this.render(this.last);
      }
    });
    root.addEventListener('mouseleave', () => {
      this.hovered = null;
      if (this.last) this.render(this.last);
    });
    box.append(root, el('div', 'sheet-text muted', 'Légende des couleurs : bouton « ? » en haut de cette fenêtre.'));
    return box;
  }

  /** Why each action has its score ("pourquoi cueillir", "pourquoi pas le bois"). */
  private details(brain: BrainFacts): HTMLElement {
    const box = el('div', 'brain-details');
    box.append(el('div', 'sheet-section', 'Le détail des scores'));
    const options = [...brain.options].sort((a, b) => b.score - a.score);
    for (const option of options) {
      const details = el('details', `brain-why ${option.state}`);
      details.open = this.openDetails.has(option.id) || option.state === 'chosen';
      details.addEventListener('toggle', () => (details.open ? this.openDetails.add(option.id) : this.openDetails.delete(option.id)));
      const verb = option.state === 'chosen' ? 'Pourquoi' : 'Pourquoi pas';
      details.append(el('summary', '', `${verb} « ${option.label} » — score ${option.score.toFixed(2).replace('.', ',')} (${STATE_TEXT[option.state]})`));
      const list = el('ul', 'sheet-list');
      for (const line of option.why) list.append(el('li', '', line));
      details.append(list);
      box.append(details);
    }
    return box;
  }
}

function text(x: number, y: number, content: string, className: string): SVGTextElement {
  const node = svg('text', { x, y, class: className });
  node.textContent = content;
  return node;
}
