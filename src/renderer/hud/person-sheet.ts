import type { LifeTables, PersonDetails, Roster } from '../../shared/messages';
import { itemText } from './building-lines';
import { familyTree, lifeLines } from './family-tree';

const fr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const PERCENT = 100;
const DEATH_CAUSES = ['', 'faim', 'soif', 'froid', 'attaque d’un prédateur', 'vieillesse', 'maladie', 'en couches', 'tué au combat'];
const STAGES = { baby: 'bébé', child: 'enfant', adult: 'adulte', elder: 'ancien' } as const;

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
  threatNearCamp: { label: 'un prédateur rôde près du camp', percent: false },
  always: { label: 'rien d’urgent', percent: false },
  loneliness: { label: 'solitude', percent: true },
  joy: { label: 'joie', percent: true },
  sadness: { label: 'tristesse', percent: true },
  anger: { label: 'colère', percent: true },
  fear: { label: 'peur', percent: true },
  jealousy: { label: 'jalousie', percent: true },
  consolable: { label: 'quelqu’un de triste à côté', percent: false },
  suitor: { label: 'quelqu’un lui plaît', percent: false },
  needyNear: { label: 'quelqu’un a faim à côté', percent: false },
  wantsEsteem: { label: 'veut regagner l’estime de quelqu’un', percent: false },
  infant: { label: 'trop petit pour marcher', percent: false },
  guardianAway: { label: 'loin de son parent', percent: true },
  playmates: { label: 'des enfants jouent à côté', percent: false },
  sick: { label: 'malade', percent: false },
};

const NEEDS: { key: keyof PersonDetails['needs']; label: string }[] = [
  { key: 'hunger', label: 'Faim' },
  { key: 'thirst', label: 'Soif' },
  { key: 'fatigue', label: 'Fatigue' },
  { key: 'cold', label: 'Froid' },
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

/** Ideas: knowledge (taught by whom), culture and values, languages, faith, good of exchange. */
function ideaNodes(details: PersonDetails): HTMLElement[] {
  const ideas = details.ideas;
  const nodes: HTMLElement[] = [el('div', 'sheet-section', 'Sait')];
  if (!ideas) return nodes;
  const known = el('ul', 'sheet-list');
  for (const line of ideas.knowledge) known.append(el('li', '', `${line.name} (${line.origin})`));
  nodes.push(known);
  if (ideas.learning.length > 0) nodes.push(el('div', 'sheet-text muted', `Apprend : ${ideas.learning.map((line) => `${line.name} ${line.progress} %`).join(', ')}`));
  const pondering = ideas.pondering;
  if (pondering) {
    nodes.push(el('div', 'sheet-section', `Réfléchit à : ${pondering.knowledge.toLowerCase()}`));
    nodes.push(bar(`Progression (depuis ${fr.format(pondering.days)} j)`, Math.round(pondering.progress * PERCENT), 'good'));
    const conditions = el('ul', 'sheet-list');
    for (const condition of pondering.conditions) {
      const value = condition.value >= 0 ? ` (${fr.format(condition.value * PERCENT)} %)` : '';
      conditions.append(el('li', condition.ok ? '' : 'muted', `${condition.ok ? '✓' : '✗'} ${condition.label}${value}`));
    }
    nodes.push(conditions);
  }
  nodes.push(el('div', 'sheet-section', `Culture : ${ideas.culture || 'aucune'}`));
  for (const value of ideas.values) {
    const row = bar(value.name, value.value, 'good');
    row.title = value.meaning;
    nodes.push(row);
  }
  nodes.push(el('div', 'sheet-section', 'Langues'), el('div', 'sheet-text', ideas.languages.map((line) => `${line.name} (${line.fluency} %)`).join(', ') || 'aucune'));
  nodes.push(el('div', 'sheet-section', 'Croyances'));
  nodes.push(ideas.religion ? bar(ideas.religion, ideas.piety, 'good') : el('div', 'sheet-text', 'Sans religion'));
  if (ideas.faithNote) nodes.push(el('div', 'sheet-text muted', ideas.faithNote.charAt(0).toUpperCase() + ideas.faithNote.slice(1)));
  if (ideas.token) nodes.push(el('div', 'sheet-text muted', `Accepte en paiement : ${ideas.token.toLowerCase()} (confiance ${ideas.tokenTrust} %)`));
  return nodes;
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
    private readonly onPerson: (person: number) => void = () => undefined,
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
    const stage = STAGES[details.life.stage];
    const born = details.life.born ? ` · né${female ? 'e' : ''} le ${details.life.born}` : '';
    nodes.push(title, el('div', 'sheet-sub', `${female ? 'Femme' : 'Homme'}, ${age} an${age > 1 ? 's' : ''} (${stage})${born}`));
    if (!details.alive) {
      const when = details.life.died ? `, ${details.life.died}` : '';
      nodes.push(el('div', 'sheet-dead', `Mort${female ? 'e' : ''} (${DEATH_CAUSES[details.deathCause] ?? '?'})${when}`));
    }

    nodes.push(el('div', 'sheet-section', 'Santé et vie'));
    for (const line of lifeLines(details, roster, this.onPerson)) nodes.push(line);
    nodes.push(el('div', 'sheet-section', 'Famille'), familyTree(p, details.spouse, roster, this.onPerson));

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
    // Safety: it falls while a predator is in sight, and comes back once the danger is gone.
    nodes.push(bar('Sécurité', PERCENT - details.needs.danger, 'good'));
    nodes.push(bar(details.social.loneliness.name, details.social.loneliness.value, 'need'));
    nodes.push(bar('Santé', details.health, 'good'));
    nodes.push(...this.groupNodes(details));
    nodes.push(...this.socialNodes(details, female));

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
    nodes.push(...this.conflictNodes(details));
    nodes.push(...ideaNodes(details));
    nodes.push(
      el('div', 'sheet-section', 'Se souvient'),
      el('div', 'sheet-text', `${details.rememberedWater} point(s) d’eau, ${details.rememberedFood} coin(s) de cueillette`),
      el('div', 'sheet-text muted', `Ressenti : ${fr.format(details.feltCelsius)} °C · ${roster.weatherNames[details.weather] ?? ''}`),
    );
    this.body.replaceChildren(...nodes);
  }

  /** Wounds of war, victims, personal enemies, a war party or an embassy. */
  private conflictNodes(details: PersonDetails): HTMLElement[] {
    const facts = details.conflict;
    if (!facts.crippled && facts.victims.length === 0 && facts.enemies.length === 0 && !facts.mission) return [];
    const nodes: HTMLElement[] = [el('div', 'sheet-section', 'Violence et guerre')];
    if (facts.mission) nodes.push(el('div', 'sheet-text', facts.mission));
    if (facts.crippled) nodes.push(el('div', 'sheet-text', facts.crippled));
    const people = (label: string, list: { person: number; name: string; why?: string }[]): void => {
      if (list.length === 0) return;
      const line = el('div', 'sheet-text');
      line.append(document.createTextNode(label));
      list.forEach((entry, k) => {
        if (k > 0) line.append(document.createTextNode(', '));
        const link = el('span', 'person-link', entry.name);
        link.addEventListener('click', () => this.onPerson(entry.person));
        line.append(link);
        if (entry.why) line.append(document.createTextNode(` (${entry.why})`));
      });
      nodes.push(line);
    };
    people('A tué : ', facts.victims);
    people('Ennemis : ', facts.enemies);
    return nodes;
  }

  /** Tribe, clan and household: the role in each, the support for its leaders, the duty given. */
  private groupNodes(details: PersonDetails): HTMLElement[] {
    const groups = details.groups;
    const nodes: HTMLElement[] = [el('div', 'sheet-section', 'Groupes')];
    if (groups.levels.length === 0) nodes.push(el('div', 'sheet-text muted', 'Aucun'));
    for (const line of groups.levels) {
      nodes.push(el('div', 'sheet-text', `${line.levelName} : ${line.name} — ${line.role} (soutien aux dirigeants ${Math.round(line.support)})`));
    }
    if (details.alive && groups.duty) nodes.push(el('div', 'sheet-text', `Obligation : ${groups.duty}${groups.obeys ? '' : ' (n’obéit pas)'}`));
    else if (details.alive && !groups.obeys) nodes.push(el('div', 'sheet-text muted', 'N’obéit pas à ses dirigeants'));
    return nodes;
  }

  /** Emotions, ambitions, relations (with their reasons), marking memories and important news. */
  private socialNodes(details: PersonDetails, female: boolean): HTMLElement[] {
    const social = details.social;
    const nodes: HTMLElement[] = [el('div', 'sheet-section', 'Émotions')];
    const felt = social.emotions.filter((emotion) => emotion.value >= 1);
    if (felt.length === 0) nodes.push(el('div', 'sheet-text muted', 'Calme'));
    for (const emotion of felt) nodes.push(bar(emotion.name, emotion.value, 'need'));
    nodes.push(el('div', 'sheet-section', 'Ambitions'), el('div', 'sheet-text', social.ambitions.join(' · ') || 'Aucune pour l’instant'));
    nodes.push(el('div', 'sheet-section', 'Relations'));
    if (social.relations.length === 0) nodes.push(el('div', 'sheet-text muted', 'Personne'));
    const list = el('ul', 'sheet-relations');
    for (const relation of social.relations) {
      const item = el('li');
      const who = el('span', 'person-link', relation.name);
      who.addEventListener('click', () => this.onPerson(relation.person));
      const values = el(
        'span',
        relation.affection < 0 ? 'relation-values negative' : 'relation-values',
        `affection ${fr.format(relation.affection)} · confiance ${fr.format(relation.trust)} · respect ${fr.format(relation.respect)}`,
      );
      item.append(who, el('span', 'relation-tie', ` (${relation.tie})`), el('br'), values);
      if (relation.reasons.length) item.append(el('div', 'relation-reasons', relation.reasons.join(' ; ')));
      list.append(item);
    }
    nodes.push(list);
    nodes.push(el('div', 'sheet-section', 'Souvenirs marquants'));
    if (social.memories.length === 0) nodes.push(el('div', 'sheet-text muted', 'Aucun'));
    const memories = el('ul', 'sheet-list');
    for (const memory of social.memories) memories.append(el('li', '', `${memory.text} (${memory.date})`));
    nodes.push(memories, el('div', 'sheet-section', female ? 'Ce qu’elle sait d’important' : 'Ce qu’il sait d’important'));
    if (social.news.length === 0) nodes.push(el('div', 'sheet-text muted', 'Rien de particulier'));
    const news = el('ul', 'sheet-list');
    for (const line of social.news) news.append(el('li', '', line));
    nodes.push(news);
    return nodes;
  }
}
