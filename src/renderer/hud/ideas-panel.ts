import type { IdeaFacts, IdeasFacts } from '../../shared/messages';

const REFRESH_MS = 1000;
/** Tabs of the panel: families of ideas (Family of the ideas system), then the named places. */
const TABS = [
  { family: 1, label: 'Cultures' },
  { family: 2, label: 'Langues' },
  { family: 3, label: 'Religions' },
  { family: 0, label: 'Savoirs' },
  { family: 4, label: 'Échanges' },
  { family: -1, label: 'Lieux' },
] as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * "Idées" panel: cultures, languages, religions, knowledge and goods of exchange — who carries
 * them, in which tribes, where they come from (who, when, why) — and the places peoples named.
 */
export class IdeasPanel {
  private facts: IdeasFacts | null = null;
  private lastRender = 0;
  private dirty = true;
  private tab = 1;

  constructor(
    private readonly panel: HTMLElement,
    private readonly toggle: HTMLButtonElement,
    private readonly body: HTMLElement,
    private readonly onPerson: (person: number) => void,
  ) {
    toggle.addEventListener('click', () => {
      toggle.blur();
      panel.hidden = !panel.hidden;
      this.dirty = true;
    });
  }

  setIdeas(facts: IdeasFacts): void {
    this.facts = facts;
    this.dirty = true;
  }

  clear(): void {
    this.facts = null;
    this.body.replaceChildren();
  }

  update(now: number): void {
    if (this.panel.hidden || !this.facts || !this.dirty || now - this.lastRender < REFRESH_MS) return;
    this.lastRender = now;
    this.dirty = false;
    const tabs = el('div', 'ideas-tabs');
    for (const tab of TABS) {
      const count = tab.family < 0 ? this.facts.places.length : this.facts.ideas.filter((idea) => idea.family === tab.family && idea.alive).length;
      const button = el('button', tab.family === this.tab ? 'ideas-tab active' : 'ideas-tab', `${tab.label} (${count})`);
      button.type = 'button';
      button.addEventListener('click', () => {
        this.tab = tab.family;
        this.dirty = true;
        this.lastRender = 0;
      });
      tabs.append(button);
    }
    const nodes: HTMLElement[] = [tabs];
    if (this.tab < 0) nodes.push(...this.placeNodes(this.facts));
    else {
      const ideas = this.facts.ideas.filter((idea) => idea.family === this.tab).sort((a, b) => Number(b.alive) - Number(a.alive) || b.holders - a.holders || a.id - b.id);
      if (ideas.length === 0) nodes.push(el('div', 'sheet-text muted', this.tab === 3 ? 'Aucune religion n’est encore née.' : this.tab === 4 ? 'Aucun bien d’échange n’est encore accepté de tous.' : 'Rien pour l’instant.'));
      for (const idea of ideas) nodes.push(this.ideaNode(idea));
    }
    this.body.replaceChildren(...nodes);
  }

  private ideaNode(idea: IdeaFacts): HTMLElement {
    const box = el('div', idea.alive ? 'group-box idea-box' : 'group-box idea-box lost');
    const holders = idea.alive ? ` — ${idea.holders} porteur${idea.holders > 1 ? 's' : ''}` : ` — perdu${idea.endYear > 0 ? ` en l’an ${idea.endYear}` : ''}`;
    box.append(el('div', 'group-title', `${capitalize(idea.label)}${holders}`));
    const origin = el('div', 'sheet-text');
    origin.append(document.createTextNode('Origine : '));
    if (idea.founder >= 0) {
      const link = el('span', 'person-link', idea.founderName);
      link.addEventListener('click', () => this.onPerson(idea.founder));
      origin.append(link, document.createTextNode(` — ${idea.origin}`));
    } else origin.append(document.createTextNode(idea.origin));
    box.append(origin);
    if (idea.parent) box.append(el('div', 'sheet-text muted', `Issue de ${idea.parent}`));
    if (idea.tribes.length > 0) box.append(el('div', 'sheet-text muted', `Tribus : ${idea.tribes.join(', ')}`));
    if (idea.clergy.length > 0) {
      const clergy = el('div', 'sheet-text');
      clergy.append(document.createTextNode('Chamans et prêtres : '));
      idea.clergy.forEach((member, k) => {
        if (k > 0) clergy.append(document.createTextNode(', '));
        const link = el('span', 'person-link', member.name);
        link.addEventListener('click', () => this.onPerson(member.person));
        clergy.append(link);
      });
      box.append(clergy);
    }
    for (const line of idea.details) box.append(el('div', 'sheet-text muted', line));
    return box;
  }

  private placeNodes(facts: IdeasFacts): HTMLElement[] {
    if (facts.places.length === 0) return [el('div', 'sheet-text muted', 'Aucun lieu n’a encore de nom.')];
    const list = el('ul', 'sheet-list');
    for (const place of facts.places) list.append(el('li', '', `${place.name} (${place.kind}, nommé en ${place.language})`));
    return [list];
  }
}
