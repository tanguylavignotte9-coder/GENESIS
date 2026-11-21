import type { IdeasSystem } from './ideas-system';
import { Family } from './idea';
import { ENVIRONMENTS } from './params';
import { needOf, surveyCamp } from './knowledge';

/** A knowledge, a recipe or a building, for the knowledge tree (view K). */
export interface TreeNode {
  /** "k:pottery", "r:make_spear", "b:hut". */
  id: string;
  kind: 'knowledge' | 'recipe' | 'building';
  name: string;
  /** Ids of the nodes it needs (for a building: any one of them). */
  requires: string[];
  /**
   * For the chosen tribe: known; being worked out by someone (pondering); its conditions are met
   * (prerequisites known and surroundings that allow it: ready); out of reach.
   */
  state: 'known' | 'pondering' | 'ready' | 'out';
  /** Lines that explain it (shown when it is clicked). */
  explain: string[];
  /** Who is working it out, and how far (0..100). */
  ponderers: { person: number; name: string; progress: number }[];
}

export interface KnowledgeTreeFacts {
  tribe: number;
  tribes: { id: number; name: string }[];
  nodes: TreeNode[];
}

interface Craft {
  id: string;
  name: string;
  knowledge: readonly string[];
  /** A building only a people with a faith builds (a sanctuary). */
  requiresReligion?: boolean;
}

const PERCENT = 100;

/**
 * The knowledge tree as seen from a tribe: what its members know, what some of them are working
 * out (and who), what is within their reach and what is not (and why). Read only: the display
 * never changes the simulation by looking.
 */
export function describeKnowledgeTree(sys: IdeasSystem, tribeId: number, recipes: readonly Craft[], buildings: readonly Craft[]): KnowledgeTreeFacts | null {
  const groups = sys.groups;
  if (!groups) return null;
  const tribes = groups.tribes();
  const tribe = tribes.find((t) => t.id === tribeId) ?? tribes[0];
  if (!tribe) return null;
  sys.displayRead = true;
  try {
    return read(sys, tribe.id, tribes.map((t) => ({ id: t.id, name: t.name })), recipes, buildings);
  } finally {
    sys.displayRead = false;
  }
}

function read(sys: IdeasSystem, tribeId: number, tribes: KnowledgeTreeFacts['tribes'], recipes: readonly Craft[], buildings: readonly Craft[]): KnowledgeTreeFacts {
  const tribe = sys.groups!.groups[tribeId]!;
  const h = sys.holdings;
  const people = sys.humans.people;
  const catalog = sys.catalog.knowledge;
  const members = tribe.members.filter((p) => p < h.count && people.alive[p] === 1);
  const holders = catalog.map((_, k) => members.filter((p) => h.knows(p, k)).length);
  const known = (k: number): boolean => holders[k]! > 0;
  const mask = sys.humans.camps[tribe.camp] ? surveyCamp(sys, tribe.camp) : 0;
  const skills = sys.humans.params.skills;
  const indexOf = new Map(catalog.map((item, k) => [item.id, k] as const));
  const nodes: TreeNode[] = catalog.map((item, k) => {
    const ponderers = members.filter((p) => h.ponder[p] === k).map((p) => ({ person: p, name: people.names[p] ?? '?', progress: Math.round(h.ponderProgress[p]! * PERCENT) }));
    const missing = item.requires.filter((id) => !known(indexOf.get(id) ?? -1));
    const envOk = item.discovery.environment.map((env) => ({ env, ok: (mask & (1 << ENVIRONMENTS.indexOf(env))) !== 0 }));
    const state: TreeNode['state'] = known(k) ? 'known' : ponderers.length > 0 ? 'pondering' : missing.length === 0 && envOk.every((e) => e.ok) ? 'ready' : 'out';
    const explain: string[] = [];
    if (known(k)) {
      explain.push(`Connu de ${holders[k]} membre${holders[k]! > 1 ? 's' : ''} de la tribu.`);
      const discovery = sys.ideas.find((idea) => idea.family === Family.Knowledge && idea.knowledge === k && idea.founder >= 0 && idea.tribe === tribe.id);
      if (discovery) explain.push(`Découvert ici par ${people.names[discovery.founder] ?? '?'}.`);
      else if (item.startsKnown) explain.push('Connu de tout temps.');
    }
    for (const p of ponderers) explain.push(`${p.name} y réfléchit (${p.progress} %).`);
    if (item.requires.length > 0) explain.push(`Prérequis : ${item.requires.map((id) => `${catalog[indexOf.get(id) ?? -1]?.name ?? id} ${missing.includes(id) ? '✗' : '✓'}`).join(', ')}.`);
    const need = members.length > 0 ? Math.max(...members.map((p) => needOf(sys, p, item.discovery.need))) : 0;
    explain.push(`Besoin qui y pousse : ${sys.params.needTexts[item.discovery.need]} (${Math.round(Math.min(1, need) * PERCENT)} % au plus fort dans la tribu).`);
    for (const { env, ok } of envOk) explain.push(`Milieu : ${sys.params.environmentTexts[env].replace(/^,\s*(et\s+)?/, '')} ${ok ? '✓' : '✗ (pas autour du camp)'}.`);
    const skill = skills[sys.skillOf[k]!];
    if (skill) explain.push(`On s’en approche en pratiquant : ${skill.name.toLowerCase()}.`);
    if (state === 'out') explain.push('Hors de portée pour l’instant.');
    else if (state === 'ready') explain.push('Les conditions sont réunies : quelqu’un de curieux, poussé par le besoin, peut s’y mettre.');
    return { id: `k:${item.id}`, kind: 'knowledge', name: item.name, requires: item.requires.map((id) => `k:${id}`), state, explain, ponderers };
  });
  const believers = members.some((p) => h.religion[p]! >= 0);
  const craftNode = (craft: Craft, kind: 'recipe' | 'building'): TreeNode => {
    const needs = craft.knowledge.filter((id) => id !== '');
    const faithOk = craft.requiresReligion !== true || believers;
    const ok = faithOk && (needs.length === 0 || needs.some((id) => known(indexOf.get(id) ?? -1)));
    const names = needs.map((id) => catalog[indexOf.get(id) ?? -1]?.name ?? id);
    const what = kind === 'recipe' ? 'Recette' : 'Bâtiment';
    const explain = [needs.length === 0 ? `${what} sans savoir requis.` : `${what} : il faut savoir ${names.join(' ou ')}.`];
    if (craft.requiresReligion) explain.push(`Il faut une religion partagée${faithOk ? ' ✓' : ' ✗ (personne n’a de religion dans la tribu)'}.`);
    explain.push(ok ? 'La tribu sait le faire.' : 'La tribu ne sait pas encore le faire.');
    return { id: `${kind === 'recipe' ? 'r' : 'b'}:${craft.id}`, kind, name: craft.name, requires: needs.map((id) => `k:${id}`), state: ok ? 'known' : 'out', explain, ponderers: [] };
  };
  for (const recipe of recipes) nodes.push(craftNode(recipe, 'recipe'));
  for (const building of buildings) nodes.push(craftNode(building, 'building'));
  return { tribe: tribeId, tribes, nodes };
}
