import type { GroupFacts, GroupsFacts } from '../../shared/messages';
import { tribeColorCss } from '../art/tribe';

const REFRESH_MS = 1000;
const PERCENT = 100;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** A small gauge (legitimacy, discontent). */
function gauge(label: string, value: number, kind: 'good' | 'bad'): HTMLElement {
  const row = el('div', 'group-gauge');
  row.append(el('span', 'group-gauge-label', `${label} ${Math.round(value)}`));
  const bar = el('span', 'group-gauge-bar');
  const fill = el('span', `group-gauge-fill ${kind}`);
  fill.style.width = `${Math.max(0, Math.min(PERCENT, value))}%`;
  bar.append(fill);
  row.append(bar);
  return row;
}

/**
 * "Groupes" panel: every tribe with its clans and households — regime and how one reaches power,
 * leaders (clickable), legitimacy, discontent, members, rules in force, strategy, other tribes known.
 */
export class GroupsPanel {
  private facts: GroupsFacts | null = null;
  private lastRender = 0;
  private dirty = true;
  /** Households are shown only for the groups the player opened. */
  private readonly opened = new Set<number>();

  constructor(
    private readonly panel: HTMLElement,
    private readonly toggle: HTMLButtonElement,
    private readonly body: HTMLElement,
    private readonly onPerson: (person: number) => void,
    private readonly onPlace: (x: number, y: number) => void,
  ) {
    toggle.addEventListener('click', () => {
      toggle.blur();
      panel.hidden = !panel.hidden;
      this.dirty = true;
    });
  }

  setGroups(facts: GroupsFacts): void {
    this.facts = facts;
    this.dirty = true;
    const tribes = facts.groups.filter((group) => group.level === 0).length;
    this.toggle.textContent = `Groupes (${tribes} tribu${tribes > 1 ? 's' : ''})`;
  }

  clear(): void {
    this.facts = null;
    this.opened.clear();
    this.body.replaceChildren();
  }

  update(now: number): void {
    if (this.panel.hidden || !this.facts || !this.dirty || now - this.lastRender < REFRESH_MS) return;
    this.lastRender = now;
    this.dirty = false;
    const byId = new Map(this.facts.groups.map((group) => [group.id, group]));
    const nodes: HTMLElement[] = [];
    for (const tribe of this.facts.groups.filter((group) => group.level === 0)) nodes.push(this.groupNode(tribe, byId));
    if (this.facts.ended.length > 0) nodes.push(el('div', 'sheet-text muted', `Tribus disparues : ${this.facts.ended.map((tribe) => tribe.name).join(', ')}`));
    this.body.replaceChildren(...nodes);
  }

  private groupNode(group: GroupFacts, byId: Map<number, GroupFacts>): HTMLElement {
    const box = el('div', `group-box level-${group.level}`);
    const title = el('div', 'group-title');
    if (group.level === 0) title.style.color = tribeColorCss(group.id);
    title.textContent = `${group.levelName} · ${group.name.charAt(0).toUpperCase()}${group.name.slice(1)} — ${group.members} membre${group.members > 1 ? 's' : ''} (${group.adults} adulte${group.adults > 1 ? 's' : ''})`;
    if (group.level === 0 && group.campX >= 0) {
      title.classList.add('clickable');
      title.title = 'Centrer la carte sur le camp';
      title.addEventListener('click', () => this.onPlace(group.campX, group.campY));
    }
    box.append(title);
    box.append(el('div', 'sheet-text', `${group.regime} (accès au pouvoir : ${group.access.toLowerCase()})`));
    const leaders = el('div', 'sheet-text');
    leaders.append(document.createTextNode(group.leaders.length > 1 ? 'Dirigeants : ' : 'Dirigeant : '));
    if (group.leaders.length === 0) leaders.append(document.createTextNode('aucun pour l’instant'));
    group.leaders.forEach((leader, k) => {
      if (k > 0) leaders.append(document.createTextNode(', '));
      const link = el('span', 'person-link', `${leader.name} (${leader.title})`);
      link.addEventListener('click', () => this.onPerson(leader.person));
      leaders.append(link);
    });
    box.append(leaders);
    if (group.level < 2) {
      box.append(gauge('Légitimité', group.legitimacy, 'good'), gauge('Mécontentement', group.discontent, 'bad'));
    }
    if (group.level === 0) {
      box.append(el('div', 'sheet-text muted', `Propriété : ${group.property} · Héritage : ${group.inheritance.toLowerCase()} · Stratégie : ${group.strategy.toLowerCase()}`));
      if (group.known.length > 0) {
        const known = group.known.map((other) => `${other.name} (${other.allied ? 'alliée, ' : ''}opinion ${Math.round(other.opinion)})`).join(', ');
        box.append(el('div', 'sheet-text muted', `Connaît : ${known}`));
      }
    }
    const children = group.children.map((id) => byId.get(id)).filter((child): child is GroupFacts => child !== undefined);
    const clans = children.filter((child) => child.level === 1);
    const families = children.filter((child) => child.level === 2);
    for (const clan of clans) box.append(this.groupNode(clan, byId));
    if (families.length > 0) {
      const open = this.opened.has(group.id);
      const toggle = el('div', 'group-families clickable', `${open ? '▾' : '▸'} ${families.length} famille${families.length > 1 ? 's' : ''}${group.level === 0 ? ' sans clan' : ''}`);
      toggle.addEventListener('click', () => {
        if (open) this.opened.delete(group.id);
        else this.opened.add(group.id);
        this.dirty = true;
        this.lastRender = 0;
      });
      box.append(toggle);
      if (open) for (const family of families) box.append(this.groupNode(family, byId));
    }
    return box;
  }
}
