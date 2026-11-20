import { REASONS } from '../individuals/social/params';
import { relationReasons } from '../individuals/social/texts';
import type { ConflictSystem } from './conflict-system';
import { ExpeditionState } from './state';

/** What a character sheet shows of violence: a crippling wound, victims, personal enemies, a mission. */
export interface PersonConflictFacts {
  crippled: string;
  victims: { person: number; name: string }[];
  enemies: { person: number; name: string; why: string }[];
  mission: string;
}

const HOSTILE = new Set<number>([REASONS.indexOf('murdered'), REASONS.indexOf('enemy'), REASONS.indexOf('assaulted')]);

export function describePersonConflict(sys: ConflictSystem, person: number): PersonConflictFacts {
  const { humans } = sys;
  const people = humans.people;
  const state = humans.life.state;
  const crippled = state.crippled[person] === 1 ? (sys.journal.get(state.crippledEvent[person]!)?.text ?? 'Estropié par une blessure') : '';
  const victims = (sys.kills.get(person) ?? []).map((victim) => ({ person: victim, name: people.names[victim] ?? '?' }));
  const enemies: PersonConflictFacts['enemies'] = [];
  const social = humans.social.state;
  for (let slot = person * social.relationSlots; slot < (person + 1) * social.relationSlots; slot++) {
    const other = social.relOther[slot]!;
    if (other < 0 || social.affection[slot]! >= 0) continue;
    let hostile = false;
    for (let r = 0; r < 3; r++) if (HOSTILE.has(social.reasonCode[slot * 3 + r]!)) hostile = true;
    if (!hostile) continue;
    const why = relationReasons(humans.social, slot, true).map((reason) => reason.text).filter(Boolean).join(', ');
    enemies.push({ person: other, name: people.names[other] ?? '?', why });
  }
  let mission = '';
  const expedition = sys.expeditions[sys.mission[person] ?? -1];
  if (expedition && expedition.state !== ExpeditionState.Done) {
    const verb = expedition.state === ExpeditionState.Gathering ? 'se rassemble pour' : expedition.state === ExpeditionState.Marching ? 'marche' : 'revient d’';
    mission = `${expedition.kind === 'war' ? 'Troupe de guerre' : 'Raid'} contre ${sys.nameOf(expedition.target)} : ${verb}${expedition.state === ExpeditionState.Marching ? ' vers l’ennemi' : expedition.state === ExpeditionState.Gathering ? ' partir' : 'une expédition'} (moral ${Math.round(sys.morale[person]!)})`;
  }
  const envoy = sys.envoys[sys.envoyOf[person] ?? -1];
  if (envoy && envoy.stage < 2) mission = `Émissaire auprès de ${sys.nameOf(envoy.to)} (offre de ${envoy.offer === 'peace' ? 'paix' : envoy.offer === 'truce' ? 'trêve' : 'tribut'})`;
  return { crippled, victims, enemies, mission };
}

/** How a tribe stands with another, in words, for the Groups panel ("en guerre depuis 3 ans", "paie un tribut"). */
export function relationStatus(sys: ConflictSystem, tribe: number, other: number): string {
  const relation = sys.findRelation(tribe, other);
  if (!relation) return '';
  const yearDays = sys.humans.life.yearDays;
  const parts: string[] = [];
  if (relation.state === 'war') parts.push(`en guerre depuis ${Math.max(0, Math.round((sys.day - relation.since) / yearDays))} an(s)`);
  else if (relation.state === 'truce') parts.push(`trêve (encore ${Math.max(0, relation.until - sys.day)} jours)`);
  if (relation.tributePayer >= 0) parts.push(relation.tributePayer === sys.side(relation, tribe) ? 'lui paie un tribut' : 'reçoit son tribut');
  const betrayed = relation.betrayals[1 - sys.side(relation, tribe)]!;
  if (betrayed > 0) parts.push(`trahie ${betrayed} fois par elle`);
  if (parts.length === 0 && relation.wars > 0) parts.push('en paix');
  return parts.join(', ');
}

/** Recent battles for the map (where, and how many game hours ago). */
export function recentBattles(sys: ConflictSystem, ticksPerHour: number, hours: number): { x: number; y: number; age: number }[] {
  return sys.battles.map((mark) => ({ x: mark.x, y: mark.y, age: (sys.tick - mark.tick) / ticksPerHour })).filter((mark) => mark.age <= hours);
}
