import type { PersonDetails, Roster } from '../../shared/messages';

const PERCENT = 100;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** A clickable name ("Ka", "Lo †"). */
export function personLink(person: number, roster: Roster, onPerson: (person: number) => void, dead = false): HTMLElement {
  const link = el('span', 'person-link', (roster.names[person] ?? '?') + (dead ? ' †' : ''));
  link.addEventListener('click', () => onPerson(person));
  return link;
}

/** A line of text with clickable names: parts are strings or people. */
function line(parts: (string | number)[], roster: Roster, onPerson: (person: number) => void, className = 'sheet-text'): HTMLElement {
  const node = el('div', className);
  for (const part of parts) node.append(typeof part === 'number' ? personLink(part, roster, onPerson) : document.createTextNode(part));
  return node;
}

/** Health, disease, pregnancy, nursing and who takes care of a child, in plain French. */
export function lifeLines(details: PersonDetails, roster: Roster, onPerson: (person: number) => void): HTMLElement[] {
  const life = details.life;
  const female = roster.female[details.person] === 1;
  const e = female ? 'e' : '';
  const lines: HTMLElement[] = [];
  if (!details.alive) return lines;
  if (life.disease) {
    const days = life.disease.days <= 0 ? 'depuis aujourd’hui' : `depuis ${life.disease.days} jour${life.disease.days > 1 ? 's' : ''}`;
    const parts: (string | number)[] = [`Malade : ${life.disease.name}, ${days}`];
    if (life.disease.source >= 0) parts.push(', attrapée auprès de ', life.disease.source);
    if (life.disease.epidemic) parts.push(' (épidémie)');
    lines.push(line(parts, roster, onPerson, 'sheet-text sheet-warning'));
  } else lines.push(el('div', 'sheet-text', `En bonne santé`));
  lines.push(el('div', 'sheet-text muted', `Forces : ${Math.round(life.vigor * PERCENT)} % de celles d’un adulte dans la force de l’âge`));
  if (life.pregnancy) {
    const parts: (string | number)[] = [`Enceinte depuis ${life.pregnancy.days} jour(s) sur ${life.pregnancy.total}`];
    if (life.pregnancy.father >= 0) parts.push(' (père : ', life.pregnancy.father, ')');
    lines.push(line(parts, roster, onPerson));
  }
  if (life.nursing) lines.push(el('div', 'sheet-text', 'Allaite son enfant'));
  if (life.carriedBy >= 0) lines.push(line([`Porté${e} par `, life.carriedBy], roster, onPerson));
  if (life.nursedBy >= 0) lines.push(line([`Allaité${e} par `, life.nursedBy], roster, onPerson));
  // Raised by one's mother goes without saying; anyone else is worth telling.
  const byMother = life.guardian === roster.mother[details.person] && !life.adopted;
  if (life.guardian >= 0 && !byMother) lines.push(line([life.adopted ? `Recueilli${e} et élevé${e} par ` : `Élevé${e} par `, life.guardian], roster, onPerson));
  else if (life.orphan) lines.push(el('div', 'sheet-text sheet-warning', `Orphelin${e} : personne ne l’a encore recueilli${e}`));
  return lines;
}

/** Children of a person in the roster. */
function childrenOf(person: number, roster: Roster): number[] {
  const children: number[] = [];
  for (let q = 0; q < roster.names.length; q++) if (roster.mother[q] === person || roster.father[q] === person) children.push(q);
  return children;
}

/** Brothers and sisters (sharing at least one parent). */
function siblingsOf(person: number, roster: Roster): number[] {
  const mother = roster.mother[person]!;
  const father = roster.father[person]!;
  const siblings: number[] = [];
  for (let q = 0; q < roster.names.length; q++) {
    if (q === person) continue;
    if ((mother >= 0 && roster.mother[q] === mother) || (father >= 0 && roster.father[q] === father)) siblings.push(q);
  }
  return siblings;
}

/** One person in the tree: name (clickable), age; the dead are marked. */
function chip(person: number, roster: Roster, alive: (person: number) => boolean, onPerson: (person: number) => void, self = false): HTMLElement {
  const node = el('span', self ? 'tree-chip self' : alive(person) ? 'tree-chip' : 'tree-chip dead');
  const age = Math.floor(roster.ageYears[person] ?? 0);
  node.textContent = `${roster.names[person] ?? '?'}${alive(person) ? '' : ' †'}`;
  node.append(el('small', '', ` ${age} an${age > 1 ? 's' : ''}`));
  node.title = 'Ouvrir sa fiche';
  if (!self) node.addEventListener('click', () => onPerson(person));
  return node;
}

function row(label: string, people: number[], render: (person: number) => HTMLElement, extra: HTMLElement[] = []): HTMLElement {
  const node = el('div', 'tree-row');
  node.append(el('span', 'tree-label', label));
  const chips = el('div', 'tree-chips');
  for (const person of people) chips.append(render(person));
  chips.append(...extra);
  if (people.length === 0 && extra.length === 0) chips.append(el('span', 'muted', '—'));
  node.append(chips);
  return node;
}

/**
 * A small family tree over three generations: parents, the person with partner and brothers and
 * sisters, then children. Every name opens that person's sheet.
 */
export function familyTree(person: number, spouse: number, roster: Roster, onPerson: (person: number) => void): HTMLElement {
  const isAlive = (q: number): boolean => roster.alive[q] === 1;
  const render = (q: number): HTMLElement => chip(q, roster, isAlive, onPerson, q === person);
  const tree = el('div', 'family-tree');
  const parents = [roster.mother[person]!, roster.father[person]!].filter((q) => q >= 0);
  tree.append(row('Parents', parents, render));
  const middle = [person, ...(spouse >= 0 ? [spouse] : [])];
  const siblings = siblingsOf(person, roster);
  tree.append(row(spouse >= 0 ? 'En couple' : roster.female[person] === 1 ? 'Elle' : 'Lui', middle, render));
  tree.append(row('Frères et sœurs', siblings, render));
  tree.append(row('Enfants', childrenOf(person, roster), render));
  return tree;
}
