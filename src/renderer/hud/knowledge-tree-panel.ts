import type { KnowledgeTreeFacts, TreeNode } from '../../shared/messages';
import { el, Overlay, personLink } from './overlay';

const SVG = 'http://www.w3.org/2000/svg';
const COLUMN = 200;
const NODE_W = 168;
const NODE_H = 22;
const ROW = 30;
const PAD = 10;
const REFRESH_MS = 2000;

const STATES: Record<TreeNode['state'], { label: string; className: string }> = {
  known: { label: 'connu', className: 'known' },
  pondering: { label: 'en cours de découverte', className: 'pondering' },
  ready: { label: 'conditions réunies', className: 'ready' },
  out: { label: 'hors de portée', className: 'out' },
};
const KINDS: Record<TreeNode['kind'], string> = { knowledge: 'Savoir', recipe: 'Recette', building: 'Bâtiment' };

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

/**
 * Knowledge tree (K): knowledge, recipes and buildings linked to what they need. For the chosen
 * tribe, each is known, being worked out (by whom), within reach (conditions met) or out of reach;
 * a click explains it.
 */
export class KnowledgeTreePanel {
  private readonly overlay: Overlay;
  private readonly select: HTMLSelectElement;
  private readonly legend: HTMLElement;
  private readonly graph: HTMLElement;
  private readonly detail: HTMLElement;
  private tree: KnowledgeTreeFacts | null = null;
  private tribe = -1;
  private chosen = '';
  private requestedAt = 0;

  constructor(
    bar: HTMLElement,
    private readonly request: (tribe: number) => void,
    private readonly onPerson: (person: number) => void,
  ) {
    this.overlay = new Overlay(bar, 'Savoirs', 'k', 'Arbre des savoirs, recettes et bâtiments', 'knowledge-tree');
    this.select = document.createElement('select');
    this.select.addEventListener('change', () => {
      this.tribe = Number(this.select.value);
      this.ask();
    });
    this.legend = el('div', 'tree-legend');
    for (const state of Object.values(STATES)) this.legend.append(el('span', `tree-key ${state.className}`, state.label));
    this.detail = el('div', 'tree-detail muted', 'Cliquez un élément pour savoir pourquoi il est connu, en cours ou hors de portée.');
    this.graph = el('div', 'tree-graph');
    const top = el('div', 'tree-top');
    top.append(el('span', '', 'Tribu : '), this.select);
    this.overlay.body.append(top, this.legend, this.detail, this.graph);
    this.overlay.onOpen = () => this.ask();
  }

  /** Called a few times per second: while open, the tree is asked for again every few seconds. */
  tick(now: number): void {
    if (this.overlay.isOpen && now - this.requestedAt > REFRESH_MS) this.ask();
  }

  private ask(): void {
    this.requestedAt = performance.now();
    this.request(this.tribe);
  }

  receive(tree: KnowledgeTreeFacts | null): void {
    this.tree = tree;
    if (!tree) {
      this.graph.replaceChildren(el('div', 'muted', 'Aucune tribu.'));
      return;
    }
    this.tribe = tree.tribe;
    this.select.replaceChildren(
      ...tree.tribes.map((tribe) => {
        const option = document.createElement('option');
        option.value = String(tribe.id);
        option.textContent = tribe.name;
        option.selected = tribe.id === tree.tribe;
        return option;
      }),
    );
    this.draw(tree);
    this.explain();
  }

  /** Columns: a node stands one column right of what it needs (knowledge chains give the depth). */
  private layout(tree: KnowledgeTreeFacts): Map<string, { x: number; y: number }> {
    const byId = new Map(tree.nodes.map((node) => [node.id, node] as const));
    const depth = new Map<string, number>();
    const depthOf = (id: string, seen: Set<string>): number => {
      const cached = depth.get(id);
      if (cached !== undefined) return cached;
      const node = byId.get(id);
      if (!node || seen.has(id)) return 0;
      seen.add(id);
      const d = node.requires.length === 0 ? 0 : 1 + Math.max(...node.requires.map((r) => depthOf(r, seen)));
      depth.set(id, d);
      return d;
    };
    const columns: TreeNode[][] = [];
    for (const node of tree.nodes) {
      const d = depthOf(node.id, new Set());
      (columns[d] ??= []).push(node);
    }
    const order: Record<TreeNode['kind'], number> = { knowledge: 0, building: 1, recipe: 2 };
    const at = new Map<string, { x: number; y: number }>();
    columns.forEach((column, c) => {
      column.sort((a, b) => order[a.kind] - order[b.kind]);
      column.forEach((node, r) => at.set(node.id, { x: PAD + c * COLUMN, y: PAD + r * ROW }));
    });
    return at;
  }

  private draw(tree: KnowledgeTreeFacts): void {
    const at = this.layout(tree);
    let width = 0;
    let height = 0;
    for (const spot of at.values()) {
      width = Math.max(width, spot.x + NODE_W + PAD);
      height = Math.max(height, spot.y + NODE_H + PAD);
    }
    const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, class: 'tree-svg' });
    const links = svg('g', { class: 'tree-links' });
    const boxes = svg('g', {});
    for (const node of tree.nodes) {
      const to = at.get(node.id)!;
      for (const need of node.requires) {
        const from = at.get(need);
        if (!from) continue;
        const x1 = from.x + NODE_W;
        const y1 = from.y + NODE_H / 2;
        const x2 = to.x;
        const y2 = to.y + NODE_H / 2;
        const bend = (x2 - x1) / 2;
        const highlighted = this.chosen === node.id || this.chosen === need;
        links.append(svg('path', { d: `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`, class: `tree-link${highlighted ? ' chosen' : ''}` }));
      }
      const group = svg('g', { class: `tree-node ${STATES[node.state].className} ${node.kind}${this.chosen === node.id ? ' chosen' : ''}`, transform: `translate(${to.x},${to.y})` });
      group.append(svg('rect', { width: NODE_W, height: NODE_H, rx: node.kind === 'knowledge' ? 4 : 10 }));
      const label = svg('text', { x: 8, y: NODE_H / 2 + 4 });
      const mark = node.kind === 'building' ? '⌂ ' : node.kind === 'recipe' ? '· ' : '';
      const progress = node.ponderers.length > 0 ? ` (${Math.max(...node.ponderers.map((p) => p.progress))} %)` : '';
      label.textContent = `${mark}${node.name}${progress}`;
      group.append(label);
      const title = svg('title', {});
      title.textContent = `${KINDS[node.kind]} : ${node.name} — ${STATES[node.state].label}`;
      group.append(title);
      group.addEventListener('click', () => {
        this.chosen = node.id;
        this.draw(tree);
        this.explain();
      });
      boxes.append(group);
    }
    root.append(links, boxes);
    this.graph.replaceChildren(root);
  }

  /** The clicked node: what it is, its state for the tribe and why, who works on it, what it opens. */
  private explain(): void {
    const node = this.tree?.nodes.find((n) => n.id === this.chosen);
    if (!node || !this.tree) return;
    const opens = this.tree.nodes.filter((n) => n.requires.includes(node.id)).map((n) => n.name);
    const nodes: HTMLElement[] = [el('div', 'sheet-section', `${KINDS[node.kind]} : ${node.name} — ${STATES[node.state].label}`)];
    for (const line of node.explain) nodes.push(el('div', 'sheet-text', line));
    if (node.ponderers.length > 0) {
      const who = el('div', 'sheet-text', 'En cours : ');
      node.ponderers.forEach((p, k) => {
        if (k > 0) who.append(document.createTextNode(', '));
        who.append(personLink(p.name, () => this.onPerson(p.person)), document.createTextNode(` ${p.progress} %`));
      });
      nodes.push(who);
    }
    if (opens.length > 0) nodes.push(el('div', 'sheet-text muted', `Ouvre : ${opens.join(', ')}.`));
    this.detail.className = 'tree-detail';
    this.detail.replaceChildren(...nodes);
  }
}
