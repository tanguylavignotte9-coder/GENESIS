import type { Roster } from '../../shared/messages';
import { el, Overlay, personLink } from './overlay';

/** Generations shown above and below the person at the centre of the tree. */
const ANCESTOR_GENERATIONS = 3;
const DESCENDANT_GENERATIONS = 4;
/** Lineages listed in the overview (the largest first). */
const LINEAGES_SHOWN = 40;
/** The open tree follows births and deaths, redrawn at most this often. */
const REFRESH_MS = 3000;

/**
 * Family tree (T): several generations around a person, navigable (a click on a name centres the
 * tree on them), with the dead (†) and the lineages that died out; an overview of the founders'
 * lineages, with how many of their descendants live.
 */
export class GenealogyPanel {
  private readonly overlay: Overlay;
  private roster: Roster | null = null;
  private root = -1;
  private children = new Map<number, number[]>();
  private childrenOf: Roster | null = null;
  private renderedAt = 0;
  private readonly search: HTMLInputElement;
  private readonly content: HTMLElement;

  constructor(
    bar: HTMLElement,
    private readonly onSheet: (person: number) => void,
    private readonly defaultPerson: () => number,
  ) {
    this.overlay = new Overlay(bar, 'Généalogie', 't', 'Arbre généalogique', 'genealogy');
    this.search = document.createElement('input');
    this.search.type = 'search';
    this.search.placeholder = 'Chercher une personne par son nom';
    this.search.spellcheck = false;
    this.search.className = 'tool-search';
    this.search.addEventListener('input', () => this.render());
    this.content = el('div', '');
    this.overlay.body.append(this.search, this.content);
    this.overlay.onOpen = () => {
      if (this.root < 0) this.root = this.defaultPerson();
      this.render();
    };
  }

  setRoster(roster: Roster): void {
    this.roster = roster;
    // The roster comes every game day: the open tree is redrawn at most every few seconds.
    const now = performance.now();
    if (this.overlay.isOpen && now - this.renderedAt > REFRESH_MS) this.render();
  }

  /** Opens the tree centred on a person. */
  show(person: number): void {
    this.root = person;
    if (!this.overlay.isOpen) this.overlay.open();
    else this.render();
  }

  private kids(person: number): number[] {
    const roster = this.roster!;
    if (this.childrenOf !== roster) {
      this.childrenOf = roster;
      this.children = new Map();
      for (let p = 0; p < roster.names.length; p++) {
        for (const parent of [roster.mother[p]!, roster.father[p]!]) {
          if (parent < 0) continue;
          const list = this.children.get(parent) ?? [];
          if (!list.includes(p)) list.push(p);
          this.children.set(parent, list);
        }
      }
    }
    return this.children.get(person) ?? [];
  }

  /** Living descendants of a person (all generations). */
  private livingDescendants(person: number, seen = new Set<number>()): number {
    let n = 0;
    for (const child of this.kids(person)) {
      if (seen.has(child)) continue;
      seen.add(child);
      if (this.roster!.alive[child] === 1) n++;
      n += this.livingDescendants(child, seen);
    }
    return n;
  }

  private render(): void {
    this.renderedAt = performance.now();
    const roster = this.roster;
    this.content.replaceChildren();
    if (!roster) return;
    const query = this.search.value.trim().toLowerCase();
    if (query) {
      this.renderSearch(query);
      return;
    }
    if (this.root < 0 || this.root >= roster.names.length) this.root = this.defaultPerson();
    if (this.root >= 0) this.renderTree(this.root);
    this.renderLineages();
  }

  private renderSearch(query: string): void {
    const roster = this.roster!;
    const found: number[] = [];
    for (let p = 0; p < roster.names.length && found.length < 30; p++) if (roster.names[p]!.toLowerCase().includes(query)) found.push(p);
    if (found.length === 0) this.content.append(el('div', 'muted', 'Personne de ce nom.'));
    for (const person of found) {
      const row = el('div', 'tree-row');
      row.append(this.nameOf(person, () => {
        this.search.value = '';
        this.show(person);
      }));
      this.content.append(row);
    }
  }

  /** A name with its life: † for the dead, the age of the living; a click centres the tree on them. */
  private nameOf(person: number, onClick?: () => void): HTMLElement {
    const roster = this.roster!;
    const wrap = el('span', 'tree-person');
    const dead = roster.alive[person] !== 1;
    const link = personLink(roster.names[person] ?? '?', onClick ?? (() => this.show(person)), dead ? 'tree-dead' : '');
    link.title = 'Centrer l’arbre sur cette personne (double-clic : sa fiche)';
    link.addEventListener('dblclick', () => this.onSheet(person));
    wrap.append(link);
    const age = Math.floor(roster.ageYears[person] ?? 0);
    wrap.append(el('span', 'muted', dead ? ` † à ${age} an${age > 1 ? 's' : ''}` : ` ${roster.female[person] ? '♀' : '♂'} ${age} an${age > 1 ? 's' : ''}`));
    return wrap;
  }

  private renderTree(root: number): void {
    const roster = this.roster!;
    const box = el('div', 'tree');
    // Ancestors, generation by generation (the eldest first).
    let generation = [root];
    const ancestors: number[][] = [];
    for (let g = 0; g < ANCESTOR_GENERATIONS; g++) {
      const parents = generation.flatMap((p) => [roster.father[p]!, roster.mother[p]!]).filter((p) => p >= 0);
      if (parents.length === 0) break;
      ancestors.unshift(parents);
      generation = parents;
    }
    const labels = ['Arrière-grands-parents', 'Grands-parents', 'Parents'];
    ancestors.forEach((row, k) => {
      const line = el('div', 'tree-generation');
      line.append(el('div', 'tree-label', labels[labels.length - ancestors.length + k] ?? 'Aïeux'));
      const names = el('div', 'tree-names');
      for (const person of row) names.append(this.nameOf(person));
      line.append(names);
      box.append(line);
    });
    // The person, their partner and their brothers and sisters.
    const self = el('div', 'tree-generation tree-self');
    self.append(el('div', 'tree-label', 'Personne'));
    const names = el('div', 'tree-names');
    const me = this.nameOf(root);
    me.classList.add('tree-root');
    names.append(me);
    const spouse = roster.spouse[root]!;
    if (spouse >= 0) {
      names.append(el('span', 'muted', ' · en couple avec '), this.nameOf(spouse));
    }
    const siblings = new Set<number>();
    for (const parent of [roster.mother[root]!, roster.father[root]!]) if (parent >= 0) for (const child of this.kids(parent)) if (child !== root) siblings.add(child);
    if (siblings.size > 0) {
      const row = el('div', 'tree-siblings muted', 'Frères et sœurs : ');
      for (const s of [...siblings].sort((a, b) => a - b)) row.append(this.nameOf(s), document.createTextNode(' '));
      names.append(row);
    }
    self.append(names);
    box.append(self);
    // Descendants, as a nested list (each branch marked when it died out).
    const descent = el('div', 'tree-descent');
    descent.append(el('div', 'tree-label', 'Descendance'));
    const list = this.descendants(root, 1);
    descent.append(list ?? el('div', 'muted', 'Aucun enfant.'));
    box.append(descent);
    const living = this.livingDescendants(root);
    box.append(el('div', 'muted', living > 0 ? `${living} descendant(s) en vie.` : roster.alive[root] === 1 ? 'Aucun descendant en vie.' : 'Lignée éteinte : ni elle ni ses descendants ne vivent plus.'));
    this.content.append(box);
  }

  private descendants(person: number, depth: number): HTMLElement | null {
    const kids = this.kids(person);
    if (kids.length === 0 || depth > DESCENDANT_GENERATIONS) return null;
    const list = el('ul', 'tree-list');
    for (const child of kids.sort((a, b) => a - b)) {
      const item = el('li', '');
      item.append(this.nameOf(child));
      if (this.roster!.alive[child] !== 1 && this.livingDescendants(child) === 0 && this.kids(child).length > 0) item.append(el('span', 'tree-extinct', ' lignée éteinte'));
      const sub = this.descendants(child, depth + 1);
      if (sub) item.append(sub);
      else if (depth === DESCENDANT_GENERATIONS && this.kids(child).length > 0) item.append(el('span', 'muted', ` (+ ${this.kids(child).length} enfant(s), cliquer pour descendre)`));
      list.append(item);
    }
    return list;
  }

  /** The lineages of the founders (people without known parents): living descendants, or died out. */
  private renderLineages(): void {
    const roster = this.roster!;
    const founders: { person: number; living: number }[] = [];
    for (let p = 0; p < roster.names.length; p++) {
      if (roster.mother[p]! >= 0 || roster.father[p]! >= 0 || this.kids(p).length === 0) continue;
      // A couple of founders is one lineage: counted once, from the woman (or the man alone).
      const partner = this.kids(p).map((c) => (roster.mother[c] === p ? roster.father[c]! : roster.mother[c]!)).find((q) => q >= 0);
      if (roster.female[p] !== 1 && partner !== undefined && roster.mother[partner]! < 0 && roster.father[partner]! < 0) continue;
      founders.push({ person: p, living: this.livingDescendants(p) });
    }
    founders.sort((a, b) => b.living - a.living || a.person - b.person);
    const box = el('div', 'tree-lineages');
    const extinct = founders.filter((f) => f.living === 0 && roster.alive[f.person] !== 1).length;
    box.append(el('div', 'stats-title', `Lignées des fondateurs (${founders.length}, dont ${extinct} éteinte${extinct > 1 ? 's' : ''})`));
    for (const founder of founders.slice(0, LINEAGES_SHOWN)) {
      const row = el('div', 'tree-row');
      row.append(this.nameOf(founder.person));
      row.append(el('span', founder.living > 0 ? 'muted' : 'tree-extinct', founder.living > 0 ? ` — ${founder.living} descendant(s) en vie` : roster.alive[founder.person] === 1 ? ' — aucun descendant en vie' : ' — lignée éteinte'));
      box.append(row);
    }
    this.content.append(box);
  }
}
