import type { GovernanceFacts } from '../../sim/systems/groups/governance';

/**
 * Visual governance (step 10.5), opened from the Groups panel: the collective decisions of a tribe's
 * leaders (options weighed, what weighed, why the others were set aside), the map of support (each
 * clan and each adult coloured by their support, with their reasons) and the main sources of
 * discontent. Updated about once a second while open.
 */

const PERCENT = 100;
const REFRESH_MS = 1000;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Red (no support) → yellow → green (full support). */
export function supportColor(support: number): string {
  const hue = Math.max(0, Math.min(120, (support / PERCENT) * 120));
  return `hsl(${hue}, 60%, 42%)`;
}

export class GovernancePanel {
  tribe = -1;
  private lastAsk = 0;
  private selected = -1;
  private last: GovernanceFacts | null = null;
  /** Decisions the player unfolded (kept across refreshes). */
  private readonly unfolded = new Set<string>();

  constructor(
    private readonly panel: HTMLElement,
    private readonly title: HTMLElement,
    private readonly body: HTMLElement,
    closeButton: HTMLButtonElement,
    private readonly ask: (tribe: number) => void,
    private readonly onPerson: (person: number) => void,
    private readonly dayLabel: (day: number) => string,
  ) {
    closeButton.addEventListener('click', () => this.close());
  }

  open(tribe: number): void {
    this.tribe = tribe;
    this.selected = -1;
    this.panel.hidden = false;
    this.title.textContent = 'Gouvernance…';
    this.lastAsk = 0;
  }

  close(): void {
    this.tribe = -1;
    this.panel.hidden = true;
  }

  update(now: number): void {
    if (this.tribe < 0 || now - this.lastAsk < REFRESH_MS) return;
    this.lastAsk = now;
    this.ask(this.tribe);
  }

  receive(facts: GovernanceFacts | null): void {
    if (this.tribe < 0) return;
    if (!facts || facts.tribe !== this.tribe) {
      if (!facts) this.body.replaceChildren(el('div', 'sheet-text muted', 'Cette tribu n’existe plus.'));
      return;
    }
    this.last = facts;
    this.render(facts);
  }

  private render(facts: GovernanceFacts): void {
    this.title.textContent = `Gouvernance de ${facts.name}`;
    const nodes: HTMLElement[] = [
      el('div', 'sheet-text', `${facts.regime} · dirigeants : ${facts.leaders || 'aucun'} · légitimité ${facts.legitimacy} · mécontentement ${facts.discontent}`),
      el('div', 'sheet-section', 'Carte du soutien'),
    ];
    const clans = el('div', 'gov-clans');
    for (const clan of facts.clans) {
      const box = el('div', 'gov-clan', `${clan.name} (${clan.members}) : ${clan.support}`);
      box.style.background = supportColor(clan.support);
      box.title = clan.leader ? `Chef de clan : ${clan.leader}` : '';
      clans.append(box);
    }
    if (facts.clans.length === 0) clans.append(el('div', 'sheet-text muted', 'Pas de clans'));
    nodes.push(clans);
    const grid = el('div', 'gov-members');
    for (const member of facts.members) {
      const chip = el('span', `gov-member${member.person === this.selected ? ' selected' : ''}`, member.name);
      chip.style.background = supportColor(member.support);
      chip.title = `${member.name} (${member.clan}) — soutien ${member.support}\n${member.reasons.join('\n')}`;
      chip.addEventListener('click', () => {
        this.selected = member.person === this.selected ? -1 : member.person;
        if (this.last) this.render(this.last);
      });
      grid.append(chip);
    }
    nodes.push(grid, el('div', 'sheet-text muted', 'Rouge : ne soutient pas les dirigeants · vert : les soutient. Cliquez sur quelqu’un pour voir ses raisons.'));
    const chosen = facts.members.find((member) => member.person === this.selected);
    if (chosen) {
      const who = el('div', 'sheet-text');
      const link = el('span', 'person-link', chosen.name);
      link.addEventListener('click', () => this.onPerson(chosen.person));
      who.append(link, document.createTextNode(` (${chosen.clan}) — soutien ${chosen.support}`));
      const list = el('ul', 'sheet-list');
      for (const reason of chosen.reasons) list.append(el('li', '', reason));
      nodes.push(who, list);
    }
    nodes.push(el('div', 'sheet-section', 'Grandes sources de mécontentement'));
    if (facts.discontentSources.length === 0) nodes.push(el('div', 'sheet-text muted', 'Aucune en ce moment'));
    for (const source of facts.discontentSources) {
      const row = el('div', 'group-gauge');
      row.append(el('span', 'group-gauge-label', `${source.label} — ${source.weight} %`));
      const bar = el('span', 'group-gauge-bar');
      const fill = el('span', 'group-gauge-fill bad');
      fill.style.width = `${source.weight}%`;
      bar.append(fill);
      row.append(bar);
      nodes.push(row);
    }
    nodes.push(el('div', 'sheet-section', 'Décisions collectives'));
    if (facts.decisions.length === 0) nodes.push(el('div', 'sheet-text muted', 'Aucune encore'));
    for (const decision of facts.decisions) {
      const details = el('details', 'gov-decision');
      const key = `${decision.title}:${decision.day}`;
      details.open = this.unfolded.has(key);
      details.addEventListener('toggle', () => (details.open ? this.unfolded.add(key) : this.unfolded.delete(key)));
      const option = decision.options[decision.chosen];
      details.append(el('summary', '', `${decision.date || this.dayLabel(decision.day)} — ${decision.title} : ${option?.name ?? '?'} (décidé par ${decision.decidedBy})`));
      const best = Math.max(1e-9, ...decision.options.map((o) => Math.abs(o.score)));
      decision.options.forEach((o, index) => {
        const line = el('div', `gov-option${index === decision.chosen ? ' chosen' : ''}`);
        line.append(el('div', '', `${index === decision.chosen ? '✔ ' : '✗ '}${o.name} — ${o.score.toFixed(2).replace('.', ',')}`));
        const bar = el('span', 'group-gauge-bar');
        const fill = el('span', `group-gauge-fill ${index === decision.chosen ? 'good' : 'bad'}`);
        fill.style.width = `${Math.max(0, (o.score / best) * PERCENT)}%`;
        bar.append(fill);
        line.append(bar);
        if (o.reasons.length > 0) {
          const list = el('ul', 'sheet-list');
          for (const reason of o.reasons) list.append(el('li', '', reason));
          line.append(list);
        }
        details.append(line);
      });
      if (decision.note) details.append(el('div', 'sheet-text muted', decision.note));
      nodes.push(details);
    }
    this.body.replaceChildren(...nodes);
  }
}
