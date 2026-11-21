import type { Group } from '../groups/group';
import { deciders } from '../groups/decisions';
import { BuildState } from '../production/buildings';
import { battle, moraleOf, muster, toll, type BattleResult } from './combat';
import type { ConflictSystem } from './conflict-system';
import { Expedition, ExpeditionState, type TribeRelation } from './state';
import { CONFLICT_EVENTS, listNames, placeAt, plural, publish } from './texts';

const FULL = 100;
const HOURS_PER_DAY = 24;
/** Reserves (in days of food) under which a tribe feels hungry. */
const LEAN_DAYS = 10;
/** Approval a captive starts with for the victors' leaders. */
const CAPTIVE_APPROVAL = 15;
/** Opinion lost by a tribe that is raided, and by the raiders' victims' allies. */
const RAIDED_OPINION = 40;

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Adults of a tribe able to fight now. */
export function fightersOf(sys: ConflictSystem, tribe: Group): number[] {
  return tribe.members.filter((p) => sys.isFighter(p) && sys.mission[p]! < 0 && sys.envoyOf[p]! < 0);
}

/** Days of food a tribe holds for its members. */
function foodDays(sys: ConflictSystem, tribe: Group): number {
  const production = sys.humans.production;
  if (tribe.camp < 0 || !production.camps[tribe.camp]) return 0;
  return production.stockFood(tribe.camp) / Math.max(1e-6, production.body.dailyFood * Math.max(1, tribe.members.length));
}

function distanceBetween(sys: ConflictSystem, a: Group, b: Group): number {
  const ca = sys.humans.camps[a.camp];
  const cb = sys.humans.camps[b.camp];
  if (!ca || !cb) return Infinity;
  if (sys.humans.world.landmasses.idOf[ca.center] !== sys.humans.world.landmasses.idOf[cb.center]) return Infinity;
  return Math.hypot(ca.centerX - cb.centerX, ca.centerY - cb.centerY);
}

interface Motive {
  other: Group;
  raid: number;
  war: number;
  reasons: string[];
  /** Raiding them would break a truce, an alliance or a tribute. */
  betrays: string;
}

/** Why a tribe would attack another, and how likely, as its leader sees it. */
function motiveAgainst(sys: ConflictSystem, tribe: Group, other: Group, opinion: number, allied: boolean): Motive | null {
  const { params, humans } = sys;
  const r = params.raid;
  if (!other.alive || other.camp < 0 || distanceBetween(sys, tribe, other) > r.maxTiles) return null;
  const leader = tribe.leaders[0]!;
  const social = humans.social;
  const reasons: string[] = [];
  const days = foodDays(sys, tribe);
  const hunger = clamp01(Math.max(sys.ideas.recentHunger(tribe.camp), 1 - days / LEAN_DAYS));
  const theirs = foodDays(sys, other) * Math.max(1, other.members.length) / Math.max(1, tribe.members.length);
  const envy = clamp01((theirs - days) / Math.max(1, theirs));
  const ambition = Math.max(0, 2 * social.trait(leader, 'ambition') - 1);
  const hatred = clamp01(-opinion / FULL);
  const mine = fightersOf(sys, tribe).length;
  const ratio = mine / Math.max(1, other.members.filter((p) => sys.isFighter(p)).length);
  const strength = Math.min(2, ratio) ** params.war.strengthEffect;
  const bravery = sys.ideas.groupValue(tribe, 'bravery');
  const prudence = social.trait(leader, 'prudence');
  if (hunger > 0.3) reasons.push(hunger > 0.7 ? 'la faim tenaille la tribu' : 'les réserves s’épuisent');
  if (envy > 0.3) reasons.push(`les réserves de ${other.name} font envie`);
  if (ambition > 0.3) reasons.push(`${humans.people.names[leader]} cherche du prestige`);
  if (hatred > 0.3) reasons.push(`la haine envers ${other.name}`);
  let raid = r.baseChance * (1 + r.hungerEffect * hunger + r.envyEffect * envy + r.prestigeEffect * ambition + r.hatredEffect * hatred) * strength * (0.5 + bravery) * (1.5 - prudence);
  const relation = sys.findRelation(tribe.id, other.id);
  const truce = relation?.state === 'truce';
  const tribute = relation !== undefined && relation.tributePayer >= 0;
  const betrays = allied ? 'son alliance' : truce ? 'la trêve' : tribute ? 'le traité de tribut' : '';
  if (betrays) raid *= 0.1;
  let war = 0;
  if (opinion < params.war.hatredOpinion && !allied) {
    const faiths = tribe.religion >= 0 && other.religion >= 0 && tribe.religion !== other.religion;
    if (faiths) reasons.push('ils ne prient pas les mêmes dieux');
    const piety = sys.ideas.piety(leader);
    war = params.war.declareChance * (1 + params.war.religionEffect * (faiths ? piety : 0) + params.war.ambitionEffect * ambition + params.war.strengthEffect * (ratio - 1)) * hatred * (0.5 + bravery) * (1.5 - prudence);
    if (betrays) war *= 0.2;
  }
  return { other, raid: Math.max(0, raid), war: Math.max(0, war), reasons, betrays };
}

/**
 * Every few days, each tribe's leaders consider attacking a tribe they know: hunger, envy of
 * richer neighbours, the chief's thirst for prestige, hatred, a different faith and the balance of
 * forces weigh; a war under way sends its war parties. The decision follows the regime.
 */
export function warDecisions(sys: ConflictSystem): void {
  const { params, groups } = sys;
  for (const tribe of groups.tribes()) {
    if ((sys.day + tribe.id) % params.raid.everyDays !== 0 || tribe.leaders.length === 0 || tribe.camp < 0) continue;
    if (sys.expeditions.some((x) => x.tribe === tribe.id && x.state !== ExpeditionState.Done)) continue;
    if (fightersOf(sys, tribe).length < params.raid.minParty) continue;
    // A war under way: the next war party.
    let waged = false;
    for (const relation of sys.relations.values()) {
      if (relation.state !== 'war' || (relation.a !== tribe.id && relation.b !== tribe.id)) continue;
      const side = sys.side(relation, tribe.id);
      const enemy = sys.tribe(side === 0 ? relation.b : relation.a);
      if (!enemy || sys.day - relation.lastExpedition[side]! < params.war.raidEveryDays || relation.weariness[side]! >= params.war.peaceWeariness) continue;
      launch(sys, tribe, enemy, 'war', 'la guerre continue', [relation.event]);
      waged = true;
      break;
    }
    if (waged) continue;
    const motives: Motive[] = [];
    for (const [otherId, view] of [...tribe.known.entries()].sort((a, b) => a[0] - b[0])) {
      const other = groups.groups[otherId];
      if (!other || sys.atWar(tribe.id, otherId)) continue;
      const motive = motiveAgainst(sys, tribe, other, view.opinion, view.allied);
      if (motive) motives.push(motive);
    }
    if (motives.length === 0) continue;
    const best = motives.reduce((a, b) => (b.raid + b.war > a.raid + a.war ? b : a));
    const roll = sys.rng.nextFloat();
    const kind = roll < best.war ? 'war' : roll < best.war + best.raid ? 'raid' : null;
    const wants = (p: number): boolean => {
      const social = sys.humans.social;
      return sys.humans.people.hunger[p]! > 50 || social.trait(p, 'temper') > 0.6 || social.trait(p, 'ambition') > 0.65;
    };
    const decided = kind !== null && groups.decideFor(tribe, wants);
    groups.noteDecision(tribe, {
      day: sys.day,
      title: `Attaquer ${best.other.name} ?`,
      chosen: !decided ? 0 : kind === 'raid' ? 1 : 2,
      options: [
        { name: 'Rester en paix', score: Math.max(0, 1 - best.raid - best.war), reasons: [kind !== null && !decided ? 'les autres ne suivent pas' : 'rien ne pousse assez à la violence'] },
        { name: `Razzier ${best.other.name}`, score: best.raid, reasons: best.reasons.length > 0 ? best.reasons : ['envie ordinaire de butin'] },
        { name: `Déclarer la guerre à ${best.other.name}`, score: best.war, reasons: best.war > 0 ? best.reasons : ['pas assez de haine pour une guerre'] },
      ],
      decidedBy: deciders(groups, tribe),
      note: best.betrays ? `ce serait trahir ${best.betrays}` : '',
    });
    if (!decided || kind === null) continue;
    const reason = listNames(best.reasons.length > 0 ? best.reasons : ['le goût du butin']);
    if (best.betrays) betray(sys, tribe, best.other, best.betrays, reason);
    launch(sys, tribe, best.other, kind, reason, [tribe.leaderEvent]);
  }
}

/** A tribe breaks its word (a truce, an alliance, a tribute): never forgotten. */
export function betray(sys: ConflictSystem, tribe: Group, other: Group, accord: string, reason: string): void {
  const relation = sys.relation(tribe.id, other.id);
  const side = sys.side(relation, tribe.id);
  relation.betrayals[side] = relation.betrayals[side]! + 1;
  relation.tributePayer = -1;
  if (relation.state === 'truce') relation.state = 'peace';
  sys.groups.setAllied(tribe, other, false);
  sys.groups.shiftOpinion(other, tribe, -sys.params.diplomacy.betrayalOpinion);
  sys.counts.betrayals++;
  const camp = sys.humans.camps[tribe.camp];
  publish(sys, CONFLICT_EVENTS.betrayal, sys.params.texts.betrayal, { tribu: tribe.name, accord, cible: other.name, raison: reason }, camp ? placeAt(sys, camp.centerX, camp.centerY) : null, tribe.leaders, [relation.event], { other: other.id }, [tribe.id, other.id]);
}

/** A war party forms: the leader calls fighters, each decides whether to answer (obedience, character). */
function launch(sys: ConflictSystem, tribe: Group, target: Group, kind: 'raid' | 'war', reason: string, causes: readonly number[]): void {
  const { params, humans, groups } = sys;
  const people = humans.people;
  const social = humans.social;
  const relation = sys.relation(tribe.id, target.id);
  const side = sys.side(relation, tribe.id);
  const fighters = fightersOf(sys, tribe).sort((a, b) => humans.life.vigor(b) - humans.life.vigor(a) || a - b);
  const wanted = Math.max(params.raid.minParty, Math.round(fighters.length * Math.min(1, params.raid.partyShare * (kind === 'war' ? 1.6 : 1))));
  const leader = tribe.leaders.find((p) => sys.isFighter(p)) ?? fighters[0]!;
  const called = [leader, ...fighters.filter((p) => p !== leader)].slice(0, wanted);
  const members: number[] = [];
  for (const p of called) {
    const bravery = sys.ideas.personValue(p, 'bravery');
    const chance = p === leader ? 1 : params.raid.joinChance * (groups.obeys[p] === 1 ? 1 : 0.4) * Math.max(0, 1 + (social.trait(p, 'temper') - 0.5) - (social.trait(p, 'prudence') - 0.5)) * (0.5 + bravery);
    if (sys.rng.nextFloat() < chance) members.push(p);
  }
  if (members.length < params.raid.minParty) return;
  let event: number;
  const camp = humans.camps[tribe.camp]!;
  const place = placeAt(sys, camp.centerX, camp.centerY);
  if (kind === 'war' && relation.state !== 'war') {
    relation.state = 'war';
    relation.since = sys.day;
    relation.weariness[0] = 0;
    relation.weariness[1] = 0;
    relation.wars++;
    sys.counts.wars++;
    event = publish(sys, CONFLICT_EVENTS.war, params.texts.warDeclared, { tribu: tribe.name, cible: target.name, raison: reason }, place, [leader], causes, { other: target.id }, [tribe.id, target.id]);
    relation.event = event;
    groups.shiftOpinion(target, tribe, -RAIDED_OPINION);
  } else {
    if (kind === 'raid') sys.counts.raids++;
    event = publish(sys, CONFLICT_EVENTS.raid, kind === 'war' ? params.texts.warParty : params.texts.raidDecided, { tribu: tribe.name, cible: target.name, raison: reason, chef: people.names[leader]!, n: String(members.length) }, place, [leader], causes, { other: target.id }, [tribe.id, target.id]);
  }
  const expedition = new Expedition(sys.expeditions.length, kind, tribe.id, target.id, leader, sys.day, event);
  sys.expeditions.push(expedition);
  // Each fighter takes a few days of food from the common stock: a war party lives on its provisions.
  const rations = humans.production.body.dailyFood * params.raid.rationDays;
  for (const p of members) {
    expedition.members.push(p);
    sys.mission[p] = expedition.id;
    sys.morale[p] = moraleOf(sys, p, 0);
    humans.production.takeRations(p, rations);
  }
  relation.lastExpedition[side] = sys.day;
}

/** Every hour: war parties gather, march (morale wears, some desert), fight when they reach the enemy, come back. */
export function expeditionsHour(sys: ConflictSystem): void {
  const { params, humans } = sys;
  const people = humans.people;
  for (const expedition of sys.expeditions) {
    if (expedition.state === ExpeditionState.Done) continue;
    expedition.hours++;
    for (const p of expedition.members) if (people.alive[p] !== 1) sys.release(p);
    const active = expedition.members.filter((p) => people.alive[p] === 1 && sys.mission[p] === expedition.id);
    const target = sys.tribe(expedition.target);
    if (active.length === 0) {
      expedition.state = ExpeditionState.Done;
      continue;
    }
    if ((!target || target.camp < 0) && expedition.state < ExpeditionState.Returning) expedition.state = ExpeditionState.Returning;
    switch (expedition.state) {
      case ExpeditionState.Gathering:
        if (expedition.hours >= params.raid.gatherHours) expedition.state = ExpeditionState.Marching;
        break;
      case ExpeditionState.Marching: {
        march(sys, expedition, active);
        const center = sys.campCenter(expedition.target);
        if (center < 0) break;
        const cx = (center % humans.size) + 0.5;
        const cy = Math.floor(center / humans.size) + 0.5;
        const still = expedition.members.filter((p) => people.alive[p] === 1 && sys.mission[p] === expedition.id);
        const there = still.filter((p) => people.distanceTo(p, cx, cy) <= params.raid.battleTiles);
        if (still.length > 0 && there.length * 2 >= still.length) fightAt(sys, expedition, there);
        else if (sys.day - expedition.day > params.raid.giveUpDays) expedition.state = ExpeditionState.Returning;
        break;
      }
      case ExpeditionState.Returning:
        for (const p of active) {
          const home = sys.groups.tribeOf(p);
          const camp = home ? humans.camps[home.camp] : undefined;
          if (!camp || camp.distanceTo(people.x[p]!, people.y[p]!) <= humans.params.tribe.campRadius + 1) sys.release(p);
        }
        if (expedition.members.every((p) => sys.mission[p] !== expedition.id)) {
          expedition.state = ExpeditionState.Done;
          tellDeserters(sys, expedition);
        }
        break;
    }
  }
}

/** On the march, morale wears with the days and with hunger; a fighter whose morale breaks goes home. */
function march(sys: ConflictSystem, expedition: Expedition, active: readonly number[]): void {
  const { params, humans } = sys;
  for (const p of active) {
    const loss = (params.raid.marchMoraleLoss / HOURS_PER_DAY) * (1 + humans.people.hunger[p]! / FULL + humans.people.fatigue[p]! / FULL);
    sys.morale[p] = sys.morale[p]! - loss;
    if (p !== expedition.leader && sys.morale[p]! < params.combat.fleeMorale) {
      sys.release(p);
      expedition.deserters.push(p);
      sys.counts.deserters++;
    }
  }
}

function tellDeserters(sys: ConflictSystem, expedition: Expedition): void {
  const n = expedition.deserters.length;
  if (n === 0) return;
  const tribe = sys.groups.groups[expedition.tribe]!;
  publish(sys, CONFLICT_EVENTS.deserted, sys.params.texts.deserted, { n: String(n), s: plural(n), nt: n > 1 ? 'nt' : '', tribu: tribe.name, cible: sys.nameOf(expedition.target), raison: 'la marche est longue, la faim et la peur l’emportent' }, null, expedition.deserters, [expedition.event], { expedition: expedition.id }, [tribe.id]);
  expedition.deserters.length = 0;
}

/** The party reaches the enemy camp: battle with those who are there to defend it, then plunder, captives, conquest. */
function fightAt(sys: ConflictSystem, expedition: Expedition, attackers: number[]): void {
  const { params, humans, groups } = sys;
  const people = humans.people;
  const tribe = sys.tribe(expedition.tribe);
  const target = sys.tribe(expedition.target);
  expedition.state = ExpeditionState.Returning;
  expedition.fought = true;
  if (!tribe || !target || target.camp < 0) return;
  const camp = humans.camps[target.camp]!;
  const place = placeAt(sys, camp.centerX, camp.centerY);
  const relation = sys.relation(tribe.id, target.id);
  const side = sys.side(relation, tribe.id);
  const reach = 2 * humans.params.tribe.campRadius + params.raid.battleTiles;
  const defenders = target.members.filter((p) => people.alive[p] === 1 && !humans.life.isChild(p) && people.ageYears[p]! < 65 && people.health[p]! > 25 && camp.distanceTo(people.x[p]!, people.y[p]!) <= reach);
  sys.counts.battles++;
  sys.noteBattle(camp.centerX, camp.centerY, tribe.id, target.id);
  if (expedition.unaware) publish(sys, CONFLICT_EVENTS.tooLate, params.texts.tooLate, { tribu: tribe.name, accord: expedition.unaware, cible: target.name }, place, [expedition.leader], [expedition.event], {}, [tribe.id, target.id]);
  const causes = [expedition.event];
  if (defenders.length === 0) {
    const goods = humans.production.shareStock(target.camp, tribe.camp, params.raid.lootShare);
    groups.shiftOpinion(target, tribe, -RAIDED_OPINION);
    publish(sys, CONFLICT_EVENTS.battle, params.texts.battleDefense, { attaquants: tribe.name, cible: target.name }, place, attackers, causes, { attackers: tribe.id, defenders: target.id, loot: goods.join(', ') }, [tribe.id, target.id]);
    return;
  }
  let defense = 1;
  for (const building of humans.production.campBuildings(target.camp)) {
    if (building.state !== BuildState.Done) continue;
    const id = humans.production.typeOf(building).def.id;
    defense = Math.max(defense, params.combat.defenses[id] ?? 1);
  }
  const sides = [muster(sys, attackers, tribe.camp, 1, false), muster(sys, defenders, target.camp, defense, true)] as [ReturnType<typeof muster>, ReturnType<typeof muster>];
  // The march wore the attackers' morale.
  for (const f of sides[0]) f.morale = Math.min(f.morale, sys.morale[f.person]!);
  sys.currentFight = 'battle';
  const result = battle(sys, sides, [`en attaquant ${target.name}`, `en défendant son camp contre ${tribe.name}`], causes, true);
  afterBattle(sys, expedition, tribe, target, relation, side, result, place, defense > 1);
}

function afterBattle(sys: ConflictSystem, expedition: Expedition, tribe: Group, target: Group, relation: TribeRelation, side: number, result: BattleResult, place: ReturnType<typeof placeAt>, walls: boolean): void {
  const { params, humans, groups } = sys;
  const people = humans.people;
  const names: [string, string] = [tribe.name, target.name];
  let issue: string;
  // The winners take their captives home, whoever they are.
  const captors = result.winner === 0 ? tribe : target;
  const captives = result.winner === 0 ? target : tribe;
  for (const p of result.captured) groups.capture(p, captors, CAPTIVE_APPROVAL);
  sys.counts.captives += result.captured.length;
  if (result.winner === 0) {
    const goods = humans.production.shareStock(target.camp, tribe.camp, params.raid.lootShare);
    issue = `${capitalize(tribe.name)} l’emporte et pille les réserves (${goods.length > 0 ? goods.slice(0, 4).join(', ').toLowerCase() : 'presque rien'})`;
  } else if (result.winner === 1) issue = `${capitalize(target.name)} repousse les assaillants${walls ? ' derrière ses remparts' : ''}`;
  else issue = 'Personne ne cède, chacun se retire';
  const event = publish(sys, CONFLICT_EVENTS.battle, params.texts.battle, { cible: target.name, attaquants: tribe.name, defenseurs: target.name, issue, bilan: `${toll(result, names)}` }, place, [expedition.leader, ...target.leaders], [expedition.event], { attackers: tribe.id, defenders: target.id, winner: result.winner }, [tribe.id, target.id]);
  if (result.captured.length > 0) publish(sys, CONFLICT_EVENTS.captives, params.texts.captives, { tribu: capitalize(captors.name), n: String(result.captured.length), s: plural(result.captured.length), cible: captives.name, noms: listNames(result.captured.map((p) => people.names[p]!)) }, place, result.captured, [event], {}, [tribe.id, target.id]);
  // War weariness: losses for the size of each tribe.
  const losses = [result.killed[0]!.length, result.killed[1]!.length + result.captured.length];
  relation.weariness[side] = relation.weariness[side]! + (losses[0]! * params.war.wearinessPerLoss * FULL) / Math.max(10, tribe.members.length);
  relation.weariness[1 - side] = relation.weariness[1 - side]! + (losses[1]! * params.war.wearinessPerLoss * FULL) / Math.max(10, target.members.length);
  groups.shiftOpinion(target, tribe, -RAIDED_OPINION);
  tellDeserters(sys, expedition);
  if (result.winner === 0) considerConquest(sys, expedition, tribe, target, relation, event);
}

/**
 * After a victory in a war, a crushed enemy may be annexed: its people become a clan of the victors.
 * A tribe left without adults collapses: its children are taken in by the victors.
 */
function considerConquest(sys: ConflictSystem, expedition: Expedition, tribe: Group, target: Group, relation: TribeRelation, battle: number): void {
  const { params, groups, humans } = sys;
  const adults = target.members.filter((p) => !humans.life.isChild(p) && humans.people.alive[p] === 1);
  const remaining = target.members.filter((p) => sys.isFighter(p)).length;
  const victors = expedition.members.filter((p) => humans.people.alive[p] === 1).length;
  if (adults.length === 0) {
    const event = publish(sys, CONFLICT_EVENTS.collapse, params.texts.collapse, { tribu: capitalize(target.name), issue: `ses enfants sont recueillis par ${tribe.name}` }, null, [], [battle], { into: tribe.id }, [target.id, tribe.id]);
    groups.conquer(target, tribe, event);
    relation.state = 'peace';
    return;
  }
  if (expedition.kind !== 'war' || remaining * params.war.conquestRatio > victors) return;
  const leader = tribe.leaders[0] ?? -1;
  if (leader < 0 || humans.social.trait(leader, 'ambition') < 0.4) return;
  sys.counts.conquests++;
  const event = publish(sys, CONFLICT_EVENTS.conquest, params.texts.conquest, { tribu: capitalize(tribe.name), cible: target.name, raison: `il ne leur reste que ${remaining} combattant${remaining > 1 ? 's' : ''}` }, null, [leader], [battle, relation.event], { into: tribe.id }, [tribe.id, target.id]);
  groups.conquer(target, tribe, event);
  relation.state = 'peace';
  relation.tributePayer = -1;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export { HOURS_PER_DAY };
