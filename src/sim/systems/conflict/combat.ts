import type { ConflictSystem } from './conflict-system';
import { CONFLICT_EVENTS } from './texts';

/**
 * The fight (simple model, v1): strength (vigour, health, experience of the hunt), weapon (the best
 * one carried, or taken from the camp's stock), armour, walls, fighting at home, numbers and above
 * all morale: a fighter flees well before being killed, and a troop breaks once enough of its own
 * have fled or fallen. Every blow goes through the common interaction mechanism: the individuals
 * apply the wound (health, crippling) or the death (journal), the conflict system only aims.
 */

const FULL = 100;

export interface Fighter {
  person: number;
  strength: number;
  /** Factor of the blows received (armour, walls). */
  guard: number;
  morale: number;
  ranged: boolean;
  state: 'fighting' | 'fled' | 'down';
}

export interface BattleResult {
  /** 0: the first side (attackers) wins, 1: the second side, -1: nobody broke. */
  winner: number;
  killed: number[][];
  wounded: number[][];
  fled: number[][];
  /** Fleeing losers caught alive. */
  captured: number[];
}

/** Best weapon factor among what the person carries (1 for bare hands); `stock`: weapons left in the camp's stock. */
function weaponOf(sys: ConflictSystem, person: number, stock: Map<number, number>): { factor: number; ranged: boolean } {
  const { production } = sys.humans;
  const weapons = sys.params.combat.weapons;
  const bow = production.catalog.itemIndex.get('bow');
  let best = 1;
  let bestItem = -1;
  for (const [id, factor] of Object.entries(weapons)) {
    const item = production.catalog.itemIndex.get(id);
    if (item === undefined || factor <= best) continue;
    if (production.hasItem(person, item)) {
      best = factor;
      bestItem = item;
    }
  }
  // Someone without a weapon takes one from the camp's stock, if any is left.
  if (bestItem < 0) {
    for (const [item, count] of [...stock.entries()].sort((a, b) => a[0] - b[0])) {
      if (count <= 0) continue;
      const id = production.catalog.items[item]!.id;
      const factor = weapons[id] ?? 1;
      if (factor <= best) continue;
      best = factor;
      bestItem = item;
    }
    if (bestItem >= 0) stock.set(bestItem, stock.get(bestItem)! - 1);
  }
  return { factor: best, ranged: bestItem >= 0 && bestItem === bow };
}

/** Weapons held in a camp's common stock (item → count). */
export function stockWeapons(sys: ConflictSystem, camp: number): Map<number, number> {
  const { production } = sys.humans;
  const out = new Map<number, number>();
  if (camp < 0 || !production.camps[camp]) return out;
  const stock = production.stockOf(camp);
  for (const id of Object.keys(sys.params.combat.weapons)) {
    const item = production.catalog.itemIndex.get(id);
    if (item === undefined) continue;
    const count = Math.floor(stock.count(item) + 1e-9);
    if (count > 0) out.set(item, count);
  }
  return out;
}

/** How hard a person hits: vigour (age, illness, a crippling wound), health, the hunter's experience, the weapon. */
export function strengthOf(sys: ConflictSystem, person: number, weapon: number): number {
  const humans = sys.humans;
  const hunting = humans.params.skills.findIndex((skill) => skill.id === 'hunting');
  const skill = hunting >= 0 ? humans.people.skill(person, hunting) : 0;
  return humans.life.vigor(person) * (humans.people.health[person]! / FULL) * (1 + sys.params.combat.skillWeight * skill) * weapon;
}

/** Part of the blows that gets through the person's clothing. */
function armorOf(sys: ConflictSystem, person: number): number {
  const { production } = sys.humans;
  let best = 1;
  for (const [id, factor] of Object.entries(sys.params.combat.armor)) {
    const item = production.catalog.itemIndex.get(id);
    if (item !== undefined && factor < best && production.hasItem(person, item)) best = factor;
  }
  return best;
}

/** A fighter's starting morale: the courage of their culture, their temper and their prudence. */
export function moraleOf(sys: ConflictSystem, person: number, bonus: number): number {
  const c = sys.params.combat;
  const social = sys.humans.social;
  const bravery = sys.ideas.personValue(person, 'bravery');
  return c.startMorale + c.braveryMorale * (2 * bravery - 1) + c.temperMorale * (2 * social.trait(person, 'temper') - 1) - c.prudenceMorale * (2 * social.trait(person, 'prudence') - 1) + bonus;
}

/** The fighters of one side, ready. `defense`: walls of the camp they defend (1 none), `home`: fighting at home. */
export function muster(sys: ConflictSystem, people: readonly number[], camp: number, defense: number, home: boolean, moraleBonus = 0): Fighter[] {
  const stock = stockWeapons(sys, camp);
  const c = sys.params.combat;
  return people.map((person) => {
    const weapon = weaponOf(sys, person, stock);
    return {
      person,
      strength: strengthOf(sys, person, weapon.factor) * (home ? c.homeBonus : 1),
      guard: armorOf(sys, person) / defense,
      morale: moraleOf(sys, person, moraleBonus),
      ranged: weapon.ranged,
      state: 'fighting',
    };
  });
}

/**
 * A battle between two sides: an opening volley of the archers, then assaults where each fighter
 * may strike a foe; wounds and losses shake morale, a fighter whose morale breaks flees, and a side
 * breaks once enough have fled or fallen. The pursuit kills or captures some wounded fugitives.
 */
export function battle(sys: ConflictSystem, sides: [Fighter[], Fighter[]], context: [string, string], causes: readonly number[], capture: boolean): BattleResult {
  const c = sys.params.combat;
  const rng = sys.rng;
  const result: BattleResult = { winner: -1, killed: [[], []], wounded: [[], []], fled: [[], []], captured: [] };
  const active = (side: number): Fighter[] => sides[side]!.filter((f) => f.state === 'fighting' && sys.humans.people.alive[f.person] === 1);
  const shake = (side: number, amount: number): void => {
    const size = Math.max(1, sides[side]!.length);
    for (const f of sides[side]!) if (f.state === 'fighting') f.morale -= (amount * 10) / Math.max(10, size);
  };
  const strike = (attacker: Fighter, side: number): void => {
    const foes = active(1 - side);
    if (foes.length === 0) return;
    const target = foes[Math.floor(rng.nextFloat() * foes.length)]!;
    if (rng.nextFloat() >= c.hitChance) return;
    const damage = c.blowDamage * attacker.strength * target.guard * (0.5 + rng.nextFloat());
    const outcome = sys.humans.interactions.attack({
      attacker: { kind: 'human', id: attacker.person },
      target: { kind: 'human', id: target.person },
      damage,
      attackerName: sys.humans.people.names[attacker.person]!,
      tick: sys.tick,
      motive: 'fight',
      context: context[side]!,
      causes,
    });
    if (outcome.killed) {
      target.state = 'down';
      result.killed[1 - side]!.push(target.person);
      sys.noteKill(attacker.person, target.person);
      shake(1 - side, c.lossMorale);
      shake(side, -c.winMorale);
    } else if ((outcome.damage ?? 0) > 0) {
      target.morale -= c.woundMorale;
      if (!result.wounded[1 - side]!.includes(target.person)) result.wounded[1 - side]!.push(target.person);
    }
  };
  for (let round = 0; round <= c.rounds && result.winner < 0; round++) {
    // Round 0: only those who shoot from afar (bows); then everyone, in turn.
    const order: [Fighter, number][] = [];
    const longest = Math.max(sides[0].length, sides[1].length);
    for (let k = 0; k < longest; k++) {
      for (const side of [0, 1]) {
        const f = sides[side]![k];
        if (f && f.state === 'fighting' && (round > 0 || f.ranged)) order.push([f, side]);
      }
    }
    for (const [fighter, side] of order) if (fighter.state === 'fighting' && sys.humans.people.alive[fighter.person] === 1) strike(fighter, side);
    // Morale: who breaks flees; a side breaks when enough have fled or fallen.
    for (const side of [0, 1]) {
      for (const f of sides[side]!) {
        if (f.state !== 'fighting') continue;
        if (sys.humans.people.alive[f.person] !== 1) f.state = 'down';
        else if (f.morale < c.fleeMorale) {
          f.state = 'fled';
          result.fled[side]!.push(f.person);
          shake(side, c.lossMorale / 2);
          shake(1 - side, -c.winMorale / 2);
        }
      }
    }
    for (const side of [0, 1]) {
      const gone = sides[side]!.filter((f) => f.state !== 'fighting').length;
      if (sides[side]!.length === 0 || gone >= c.routShare * sides[side]!.length) {
        for (const f of sides[side]!) {
          if (f.state !== 'fighting') continue;
          f.state = 'fled';
          result.fled[side]!.push(f.person);
        }
        result.winner = 1 - side;
        break;
      }
    }
  }
  if (result.winner >= 0) pursue(sys, sides, result, context, causes, capture);
  return result;
}

/** The winners chase the wounded fugitives: some are killed, some caught alive. */
function pursue(sys: ConflictSystem, sides: [Fighter[], Fighter[]], result: BattleResult, context: [string, string], causes: readonly number[], capture: boolean): void {
  const c = sys.params.combat;
  const loser = 1 - result.winner;
  const chasers = sides[result.winner]!.filter((f) => f.state === 'fighting' && sys.humans.people.alive[f.person] === 1);
  if (chasers.length === 0) return;
  for (const f of sides[loser]!) {
    if (f.state !== 'fled' || sys.humans.people.alive[f.person] !== 1 || !result.wounded[loser]!.includes(f.person)) continue;
    if (sys.rng.nextFloat() >= c.pursuitKill) continue;
    if (capture && sys.rng.nextFloat() < c.captureChance) {
      result.captured.push(f.person);
      continue;
    }
    const chaser = chasers[Math.floor(sys.rng.nextFloat() * chasers.length)]!;
    const outcome = sys.humans.interactions.attack({
      attacker: { kind: 'human', id: chaser.person },
      target: { kind: 'human', id: f.person },
      damage: sys.humans.people.health[f.person]! + 1,
      attackerName: sys.humans.people.names[chaser.person]!,
      tick: sys.tick,
      motive: 'fight',
      context: `${context[result.winner]} en fuyant`,
      causes,
    });
    if (outcome.killed) {
      f.state = 'down';
      result.killed[loser]!.push(f.person);
      sys.noteKill(chaser.person, f.person);
    }
  }
}

/** A short count of a battle's toll ("3 morts et 2 blessés chez les Ka, 1 blessé chez les Mo"). */
export function toll(result: BattleResult, names: [string, string]): string {
  const part = (side: number): string => {
    const dead = result.killed[side]!.length;
    const hurt = result.wounded[side]!.filter((p) => !result.killed[side]!.includes(p)).length;
    const bits = [dead > 0 ? `${dead} mort${dead > 1 ? 's' : ''}` : '', hurt > 0 ? `${hurt} blessé${hurt > 1 ? 's' : ''}` : ''].filter(Boolean);
    return bits.length > 0 ? `${bits.join(' et ')} chez ${names[side]}` : `aucune perte chez ${names[side]}`;
  };
  const captives = result.captured.length > 0 ? `, ${result.captured.length} captif${result.captured.length > 1 ? 's' : ''}` : '';
  return `${part(0)}, ${part(1)}${captives}`;
}

export { CONFLICT_EVENTS };
