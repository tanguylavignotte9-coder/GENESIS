import type { LifeTables, PersonDetails, Roster } from '../../shared/messages';
import { itemText } from './building-lines';

const fr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const PERCENT = 100;
const DEATH_CAUSES = ['', 'faim', 'soif', 'froid', 'attaque d’un prédateur'];

/** French words for the inputs that explain a decision ("Va boire — soif 72 %"). */
const REASONS: Record<string, { label: string; percent: boolean }> = {
  hunger: { label: 'faim', percent: true },
  thirst: { label: 'soif', percent: true },
  fatigue: { label: 'fatigue', percent: true },
  cold: { label: 'froid', percent: true },
  danger: { label: 'danger', percent: true },
  night: { label: 'il fait nuit', percent: false },
  day: { label: 'il fait jour', percent: false },
  fireLow: { label: 'le feu baisse', percent: false },
  load: { label: 'charge portée', percent: true },
  depositUrge: { label: 'charge à rapporter', percent: true },
  stockLow: { label: 'réserves du camp à remplir', percent: true },
  woodLow: { label: 'bois du camp à remplir', percent: true },
  buildNeed: { label: 'le camp a besoin d’un bâtiment', percent: false },
  craftNeed: { label: 'il manque des objets au camp', percent: false },
  isolation: { label: 'loin des autres', percent: false },
  awayFromCamp: { label: 'loin du camp', percent: false },
  always: { label: 'rien d’urgent', percent: false },
};

const NEEDS: { key: keyof PersonDetails['needs']; label: string }[] = [
  { key: 'hunger', label: 'Faim' },
  { key: 'thirst', label: 'Soif' },
  { key: 'fatigue', label: 'Fatigue' },
  { key: 'cold', label: 'Froid' },
  { key: 'danger', label: 'Danger' },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function bar(label: string, value: number, kind: 'need' | 'good'): HTMLElement {
  const row = el('div', 'bar-row');
  const fill = el('div', `bar-fill ${kind}`);
  fill.style.width = `${Math.max(0, Math.min(PERCENT, value))}%`;
  const track = el('div', 'bar-track');
  track.append(fill);
  row.append(el('span', 'bar-label', label), track, el('span', 'bar-value', `${fr.format(value)} %`));
  return row;
}

/** One line of the reason: "Va boire — soif 72 %". */
export function reasonText(label: string, reason: string, value: number): string {
  const words = REASONS[reason];
  if (!words) return label;
  return words.percent ? `${label} — ${words.label} ${fr.format(value * PERCENT)} %` : `${label} — ${words.label}`;
}

/** Character sheet: identity, family, traits, needs, inventory, current action and why. */
export class PersonSheet {
  person = -1;

  constructor(
    private readonly panel: HTMLElement,
    private readonly body: HTMLElement,
    closeButton: HTMLButtonElement,
    private readonly followButton: HTMLButtonElement,
    private readonly onClose: () => void,
  ) {
    closeButton.addEventListener('click', () => this.close());
  }

  open(person: number): void {
    this.person = person;
    this.panel.hidden = false;
  }

  close(): void {
    this.person = -1;
    this.panel.hidden = true;
    this.onClose();
  }

  get isOpen(): boolean {
    return this.person >= 0;
  }

  onFollow(handler: () => void): void {
    this.followButton.addEventListener('click', () => {
      this.followButton.blur();
      handler();
    });
  }

  render(details: PersonDetails, roster: Roster, tables: LifeTables): void {
    if (details.person !== this.person) return;
    const p = details.person;
    const female = roster.female[p] === 1;
    const age = Math.floor(roster.ageYears[p]!);
    const nodes: HTMLElement[] = [];
    const title = el('div', 'sheet-title', roster.names[p] ?? '?');
    nodes.push(title, el('div', 'sheet-sub', `${female ? 'Femme' : 'Homme'}, ${age} an${age > 1 ? 's' : ''}`));
    if (!details.alive) nodes.push(el('div', 'sheet-dead', `Mort${female ? 'e' : ''} (${DEATH_CAUSES[details.deathCause] ?? '?'})`));

    const family: string[] = [];
    const name = (q: number): string => roster.names[q] ?? '?';
    if (roster.spouse[p]! >= 0) family.push(`${female ? 'Époux' : 'Épouse'} : ${name(roster.spouse[p]!)}`);
    if (roster.mother[p]! >= 0) family.push(`Mère : ${name(roster.mother[p]!)}`);
    if (roster.father[p]! >= 0) family.push(`Père : ${name(roster.father[p]!)}`);
    const children = roster.names.flatMap((_, q) => (roster.mother[q] === p || roster.father[q] === p ? [name(q)] : []));
    if (children.length) family.push(`Enfants : ${children.join(', ')}`);
    nodes.push(el('div', 'sheet-section', 'Famille'), el('div', 'sheet-text', family.join(' · ') || 'Sans famille proche'));

    if (details.alive) {
      const action = roster.actionLabels[details.action] ?? '?';
      nodes.push(el('div', 'sheet-section', 'En ce moment'), el('div', 'sheet-action', reasonText(action, details.reason, details.reasonValue)));
      if (details.work) nodes.push(el('div', 'sheet-text', details.work));
      const top = el('ol', 'sheet-top');
      for (const choice of details.top) top.append(el('li', '', `${roster.actionNames[choice.action] ?? '?'} (score ${choice.score.toFixed(2)})`));
      nodes.push(el('div', 'sheet-note', 'Meilleures options à la dernière décision :'), top);
    }

    nodes.push(el('div', 'sheet-section', 'Besoins'));
    for (const need of NEEDS) nodes.push(bar(need.label, details.needs[need.key], 'need'));
    nodes.push(bar('Santé', details.health, 'good'));

    nodes.push(el('div', 'sheet-section', 'Caractère'));
    roster.traitNames.forEach((trait, t) => nodes.push(bar(trait, (details.traits[t] ?? 0) * PERCENT, 'good')));

    const trade = details.trade >= 0 ? (female ? roster.professionsFemale : roster.professions)[details.trade] : undefined;
    nodes.push(el('div', 'sheet-section', 'Métier'), el('div', 'sheet-text', trade ?? 'Aucun : fait un peu de tout'));
    nodes.push(el('div', 'sheet-section', 'Compétences'));
    const skills = roster.skillNames.flatMap((name, k) => ((details.practice[k] ?? 0) > 0 ? [{ name, k }] : []));
    if (skills.length === 0) nodes.push(el('div', 'sheet-text muted', 'Pas encore de pratique'));
    for (const { name, k } of skills) {
      const row = bar(name, (details.skills[k] ?? 0) * PERCENT, 'good');
      row.title = `${fr.format(details.practice[k] ?? 0)} h de pratique`;
      nodes.push(row);
    }

    nodes.push(el('div', 'sheet-section', `Porte (charge ${fr.format(details.load * PERCENT)} % de ${fr.format(details.carryCapacity)})`));
    if (details.carried.length === 0) nodes.push(el('div', 'sheet-text muted', 'Rien'));
    else {
      const list = el('ul', 'sheet-list');
      for (const line of details.carried) list.append(el('li', '', itemText(line, tables)));
      nodes.push(list);
    }
    nodes.push(
      el('div', 'sheet-section', 'Sait'),
      el('div', 'sheet-text', details.knowledge.map((k) => roster.knowledgeNames[k]).join(', ')),
      el('div', 'sheet-section', 'Se souvient'),
      el('div', 'sheet-text', `${details.rememberedWater} point(s) d’eau, ${details.rememberedFood} coin(s) de cueillette`),
      el('div', 'sheet-text muted', `Ressenti : ${fr.format(details.feltCelsius)} °C · ${roster.weatherNames[details.weather] ?? ''}`),
    );
    this.body.replaceChildren(...nodes);
  }
}
