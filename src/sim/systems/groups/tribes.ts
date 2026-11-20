import { direction, nearWater } from '../individuals/camp-move';
import type { Group } from './group';
import type { GroupsSystem } from './groups-system';
import { meanApproval } from './ambitions';
import { designateLeaders } from './leaders';
import { capitalize, chooseRules, syncClan } from './membership';
import { feeling, groupFactors, bestRegime, recentSufferings } from './power';
import { LEVEL_COUNT } from './params';
import { GROUP_EVENTS, nameOf, placeOf, publishGroupEvent } from './texts';
import { groupName } from './texts';
import { decide } from './moves';

const FULL = 100;
/** Tries to find a place for a new camp (technical). */
const SITE_TRIES = 16;

/**
 * A clan leaves its tribe and founds a tribe of its own: it settles elsewhere (or stays where it is
 * when it refuses to follow the tribe), taking its members and, unless everything is held in
 * common, its share of the reserves. Returns false if the clan is too small or finds no place.
 */
export function scission(sys: GroupsSystem, tribe: Group, clan: Group, reason: string, causes: readonly number[], stay = false): boolean {
  const { params, humans } = sys;
  const s = params.scission;
  const members = [...clan.members];
  const adults = members.filter((person) => sys.isAdult(person));
  if (members.length < s.minMembers || adults.length < s.minAdults || members.length >= tribe.members.length) return false;
  const camp = humans.camps[tribe.camp];
  if (!camp) return false;
  const destination = stay ? camp.center : newSite(sys, tribe, clan);
  if (destination < 0) return false;
  const leader = clan.leaders[0] ?? adults[0]!;
  const common = params.property[tribe.property]?.id === 'common';
  const newName = groupName(params.nameTemplates[0]!, nameOf(sys, leader));
  const dx = (destination % humans.size) - camp.centerX;
  const dy = Math.floor(destination / humans.size) - camp.centerY;
  const event = publishGroupEvent(
    sys,
    GROUP_EVENTS.scission,
    stay ? params.texts.scissionStay : params.texts.scission,
    {
      clan: capitalize(clan.name),
      tribu: tribe.name,
      raison: reason,
      membres: String(members.length),
      nouvelle: newName,
      distance: String(Math.round(Math.sqrt(dx * dx + dy * dy))),
      direction: direction(dx, dy),
      biens: common ? params.causeTexts.goodsCommon : params.causeTexts.goodsShared,
    },
    tribe,
    [leader, ...tribe.leaders],
    causes,
    { from: tribe.id, clan: clan.id },
  );
  const share = members.length / tribe.members.length;
  const created = sys.addGroup(0, -1, leader, clan.regime, event);
  created.camp = humans.foundCamp(destination, members, event);
  if (!common) humans.production.shareStock(tribe.camp, created.camp, share);
  clan.parent = created.id;
  for (const person of members) {
    sys.setMember(person, created);
    syncClan(sys, person);
  }
  created.members = members;
  tribe.members = tribe.members.filter((person) => !members.includes(person));
  tribe.leaders = tribe.leaders.filter((person) => !members.includes(person));
  created.property = tribe.property;
  created.inheritance = tribe.inheritance;
  created.regime = bestRegime(sys, created, groupFactors(sys, created));
  designateLeaders(sys, created, [event], true);
  chooseRules(sys, created, groupFactors(sys, created));
  const opinion = params.contact.scissionOpinion;
  created.known.set(tribe.id, { opinion, since: sys.day, allied: false });
  tribe.known.set(created.id, { opinion, since: sys.day, allied: false });
  for (const [other, view] of tribe.known) if (other !== created.id) created.known.set(other, { ...view, allied: false });
  return true;
}

/** A place for a new camp: where its members found food far away, or toward open land, near water, away from other camps. */
function newSite(sys: GroupsSystem, tribe: Group, clan: Group): number {
  const { humans, params, rng } = sys;
  const camp = humans.camps[tribe.camp]!;
  const [near, far] = params.scission.distanceTiles;
  const size = humans.size;
  const candidates: number[] = [];
  for (const person of clan.members) if (humans.people.farFood[person]! >= 0) candidates.push(humans.people.farFood[person]!);
  for (let k = 0; k < SITE_TRIES; k++) {
    const distance = rng.nextRange(near, far);
    const dx = rng.nextRange(-1, 1);
    const dy = rng.nextRange(-1, 1);
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const x = Math.round(camp.centerX + (dx / length) * distance);
    const y = Math.round(camp.centerY + (dy / length) * distance);
    if (x >= 0 && y >= 0 && x < size && y < size) candidates.push(y * size + x);
  }
  for (const tile of candidates) {
    const x = tile % size;
    const y = Math.floor(tile / size);
    const d = Math.sqrt((x - camp.centerX) ** 2 + (y - camp.centerY) ** 2);
    if (d < near || d > far * 2) continue;
    const site = nearWater(humans, tile, params.scission.waterMaxTiles);
    if (site < 0 || !reachable(sys, camp.center, site)) continue;
    const crowded = sys.tribes().some((other) => {
      const theirs = humans.camps[other.camp];
      return theirs !== undefined && Math.sqrt(((site % size) - theirs.centerX) ** 2 + (Math.floor(site / size) - theirs.centerY) ** 2) < near;
    });
    if (!crowded) return site;
  }
  return -1;
}

/** Can people walk from one tile to the other (same landmass)? */
function reachable(sys: GroupsSystem, from: number, to: number): boolean {
  const landmass = sys.humans.world.landmasses;
  return landmass.idOf[from] === landmass.idOf[to];
}

/** Tribes whose members come within sight of each other get to know each other. Opinions follow the relations. */
export function meetOtherTribes(sys: GroupsSystem): void {
  const tribes = sys.tribes();
  if (tribes.length < 2) return;
  const { humans, params } = sys;
  for (const tribe of tribes) {
    for (const person of tribe.members) {
      humans.grid.forEachNear(humans.people.px[person]!, humans.people.py[person]!, params.contact.meetTiles, (other) => {
        if (humans.people.alive[other] === 0 || other >= sys.grievance.length) return;
        const theirs = sys.tribeOf(other);
        if (!theirs || theirs === tribe || tribe.known.has(theirs.id)) return;
        meet(sys, tribe, theirs, person, other);
      });
    }
  }
  for (const tribe of tribes) {
    for (const [otherId, view] of tribe.known) {
      const other = sys.groups[otherId]!;
      if (!other.alive) continue;
      const target = tribeOpinion(sys, tribe, other) + (view.allied ? params.contact.allianceOpinion / 2 : 0);
      view.opinion += params.contact.opinionRate * (target - view.opinion);
    }
  }
}

function meet(sys: GroupsSystem, a: Group, b: Group, p: number, q: number): void {
  a.known.set(b.id, { opinion: 0, since: sys.day, allied: false });
  b.known.set(a.id, { opinion: 0, since: sys.day, allied: false });
  const place = placeOf(sys, a);
  publishGroupEvent(sys, GROUP_EVENTS.contact, sys.params.texts.contact, { a: capitalize(a.name), b: b.name, lieu: place?.label ?? '' }, a, [p, q], [], { other: b.id });
}

/** What a tribe's adults feel, on average, for the members of another tribe they know (−100..100). */
function tribeOpinion(sys: GroupsSystem, tribe: Group, other: Group): number {
  let sum = 0;
  let count = 0;
  const state = sys.humans.social.state;
  for (const person of sys.adults(tribe)) {
    for (let s = person * state.relationSlots; s < (person + 1) * state.relationSlots; s++) {
      const known = state.relOther[s]!;
      if (known < 0 || known >= sys.grievance.length || sys.member[known * LEVEL_COUNT] !== other.id) continue;
      sum += state.affection[s]!;
      count++;
    }
  }
  return count > 0 ? Math.max(-FULL, Math.min(FULL, sum / count)) : 0;
}

/** On a tribe's political day: alliances, a small tribe in hardship joining a bigger one, members leaving for another tribe. */
export function tribeRelations(sys: GroupsSystem, tribe: Group): void {
  const { params, rng } = sys;
  const c = params.contact;
  for (const [otherId, view] of tribe.known) {
    const other = sys.groups[otherId]!;
    const back = other.known.get(tribe.id);
    if (!other.alive || !back || view.allied || view.opinion < c.allianceOpinion || back.opinion < c.allianceOpinion) continue;
    if (rng.nextFloat() >= c.allianceChance || !decide(sys, tribe, () => true)) continue;
    view.allied = true;
    back.allied = true;
    publishGroupEvent(sys, GROUP_EVENTS.alliance, params.texts.alliance, { a: capitalize(tribe.name), b: other.name, raison: params.causeTexts.opinion }, tribe, [...tribe.leaders, ...other.leaders], [tribe.leaderEvent, other.leaderEvent], { other: other.id });
  }
  if (considerFusion(sys, tribe)) return;
  considerBetrayals(sys, tribe);
}

/** A small tribe in hardship joins a bigger one it thinks well of: it becomes one of its clans. */
function considerFusion(sys: GroupsSystem, tribe: Group): boolean {
  const { params, rng, humans } = sys;
  const f = params.fusion;
  if (tribe.members.length > f.maxMembers || recentSufferings(sys, tribe) < f.sufferingDeaths) return false;
  let host: Group | null = null;
  let best = f.minOpinion;
  for (const [otherId, view] of tribe.known) {
    const other = sys.groups[otherId]!;
    if (!other.alive || other.camp < 0 || other.members.length < f.sizeRatio * tribe.members.length || view.opinion < best) continue;
    best = view.opinion;
    host = other;
  }
  if (!host || rng.nextFloat() >= f.chance || !decide(sys, tribe, () => true)) return false;
  const members = [...tribe.members];
  const leader = tribe.leaders[0] ?? members[0]!;
  const event = publishGroupEvent(
    sys,
    GROUP_EVENTS.fusion,
    params.texts.fusion,
    { petite: capitalize(tribe.name), grande: host.name, raison: params.causeTexts.smallAndSuffering, membres: String(members.length) },
    tribe,
    [leader, ...host.leaders],
    [...tribe.sufferings.slice(-3).map((s) => s.event), tribe.leaderEvent],
    { into: host.id },
  );
  const oldCamp = tribe.camp;
  for (const person of members) humans.joinCamp(person, host.camp);
  humans.production.mergeCamp(oldCamp, host.camp, members.length, event);
  // The tribe becomes a clan of its host; its own clans dissolve into it.
  const clan = sys.addGroup(1, host.id, leader, tribe.regime, event);
  for (const group of sys.groups) {
    if (!group.alive) continue;
    if (group.level === 1 && group.parent === tribe.id) sys.endGroup(group, event);
  }
  for (const group of sys.groups) {
    if (group.alive && group.level === 2 && (group.parent === tribe.id || !sys.groups[group.parent]?.alive) && group.members.some((person) => members.includes(person))) group.parent = clan.id;
  }
  sys.endGroup(tribe, event);
  for (const person of members) {
    sys.setMember(person, host);
    syncClan(sys, person);
  }
  clan.members = members;
  host.members.push(...members);
  designateLeaders(sys, clan, [event], true);
  return true;
}

/** An adult who rejects their leaders and is attached to someone of another tribe may go and live there. */
function considerBetrayals(sys: GroupsSystem, tribe: Group): void {
  const { params, rng, humans, people } = sys;
  const b = params.betrayal;
  if (tribe.known.size === 0) return;
  for (const person of sys.adults(tribe)) {
    if (sys.isLeader(person, tribe) || people.spouse[person]! >= 0 || sys.approval[person * LEVEL_COUNT]! >= b.approvalBelow) continue;
    if (sys.humans.life.state.guardian.some((guardian, child) => guardian === person && people.alive[child] === 1)) continue;
    let bestOther = -1;
    let bestTribe: Group | null = null;
    let bestAffection = b.minAffection;
    for (const [otherId] of tribe.known) {
      const other = sys.groups[otherId]!;
      if (!other.alive || other.camp < 0) continue;
      for (const q of other.members) {
        const affection = feeling(sys, person, q, 'affection');
        if (affection >= bestAffection) {
          bestAffection = affection;
          bestOther = q;
          bestTribe = other;
        }
      }
    }
    if (!bestTribe || rng.nextFloat() >= b.chance) continue;
    const ties = params.causeTexts.ties.replace('{nom}', nameOf(sys, bestOther));
    publishGroupEvent(sys, GROUP_EVENTS.betrayal, params.texts.betrayal, { nom: nameOf(sys, person), ancien: tribe.name, nouveau: bestTribe.name, raison: `${params.causeTexts.rejected}, ${ties}` }, tribe, [person, bestOther], [tribe.leaderEvent], { into: bestTribe.id });
    humans.joinCamp(person, bestTribe.camp);
    sys.setMember(person, bestTribe);
    sys.clearMember(person, 1);
    sys.clearMember(person, 2);
    tribe.members = tribe.members.filter((member) => member !== person);
    bestTribe.members.push(person);
  }
}
