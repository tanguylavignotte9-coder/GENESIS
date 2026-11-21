import { feel } from '../individuals/social/relations';
import { pairReasons } from '../individuals/social/texts';
import type { ConflictSystem } from './conflict-system';
import { CONFLICT_EVENTS, e, il, placeOfPerson, publish } from './texts';

const FULL = 100;
const ANGER = 2;

/**
 * Quarrels that turn to blows. Each quarrel since the last step may degenerate according to the
 * anger of the one who struck first, their temper, their prudence, their hunger and how much they
 * dislike each other. They exchange a few blows (through the interactions: wounds, crippling,
 * sometimes death); the one beaten bears a lasting grudge.
 */
export function brawls(sys: ConflictSystem): void {
  const log = sys.humans.social.quarrelLog;
  if (log.length === 0) return;
  const pairs = log.splice(0, log.length);
  for (let k = 0; k + 1 < pairs.length; k += 2) {
    const a = pairs[k]!;
    const b = pairs[k + 1]!;
    // Each of the two may be the one who loses their temper.
    if (!fight(sys, a, b)) fight(sys, b, a);
  }
}

/** Does `a` hit `b`? Then the fight: true if blows were exchanged. */
function fight(sys: ConflictSystem, a: number, b: number): boolean {
  const { humans, params } = sys;
  const people = humans.people;
  const social = humans.social;
  const p = params.brawl;
  if (people.alive[a] !== 1 || people.alive[b] !== 1 || humans.life.isChild(a) || humans.life.isChild(b)) return false;
  const anger = social.state.emotion(a, ANGER) / p.angerScale;
  const affection = social.affectionFor(a, b);
  const chance =
    p.escalateChance *
    Math.min(1, anger) *
    Math.max(0, 1 + p.temperEffect * (2 * social.trait(a, 'temper') - 1)) *
    (1 + (p.grudgeEffect * Math.max(0, -affection)) / FULL) *
    Math.max(0, 1 - p.prudenceEffect * (social.trait(a, 'prudence') - 0.5)) *
    (1 + (p.hungerEffect * people.hunger[a]!) / FULL) *
    // Hitting a parent, a child or one's partner is much rarer.
    (social.kinOf(a, b) !== 0 ? 0.3 : 1);
  if (chance <= 0 || sys.rng.nextFloat() >= chance) return false;
  sys.counts.brawls++;
  sys.currentFight = 'brawl';
  const reasons = pairReasons(social, a, b, true);
  const reason = reasons.text;
  const causes = reasons.causes;
  const context = `au cours d’une rixe (${reason})`;
  // A few blows each, until one gives up or falls.
  let hurtA = 0;
  let hurtB = 0;
  for (let blow = 0; blow < p.blows && people.alive[a] === 1 && people.alive[b] === 1; blow++) {
    for (const [hitter, target] of [
      [a, b],
      [b, a],
    ] as const) {
      if (people.alive[hitter] !== 1 || people.alive[target] !== 1) continue;
      if (sys.rng.nextFloat() >= sys.params.combat.hitChance) continue;
      const heavy = sys.rng.nextFloat() < p.heavyBlowChance ? p.heavyBlowFactor : 1;
      const damage = p.fistDamage * heavy * humans.life.strength(hitter) * (0.5 + sys.rng.nextFloat());
      const outcome = humans.interactions.attack({ attacker: { kind: 'human', id: hitter }, target: { kind: 'human', id: target }, damage, attackerName: people.names[hitter]!, tick: sys.tick, motive: 'fight', context, causes });
      if (target === a) hurtA += outcome.damage ?? 0;
      else hurtB += outcome.damage ?? 0;
      if (outcome.killed) {
        sys.counts.murders++;
        sys.noteKill(hitter, target);
        return true;
      }
    }
    // The one more hurt gives up.
    if (Math.max(hurtA, hurtB) > p.fistDamage * 2) break;
  }
  // A fight trains the body (of those still standing).
  for (const fighter of [a, b]) if (people.alive[fighter] === 1) humans.life.train(fighter, 1, humans.life.params.strength.fightWeight);
  // Grudges: one does not forget who hit them.
  for (const [victim, hitter, hurt] of [
    [b, a, hurtB],
    [a, b, hurtA],
  ] as const) {
    if (people.alive[victim] !== 1 || hurt <= 0) continue;
    feel(social, victim, hitter, { affection: -p.assaultTrust, trust: -p.assaultTrust, respect: 0 }, 'assaulted');
  }
  const bilan =
    hurtA <= 0 && hurtB <= 0
      ? 'on les sépare avant qu’il y ait des blessés'
      : `${hurtB >= hurtA ? people.names[b] : people.names[a]} est blessé${e(sys, hurtB >= hurtA ? b : a)}`;
  publish(sys, CONFLICT_EVENTS.brawl, params.texts.brawl, { a: people.names[a]!, b: people.names[b]!, raison: reason, bilan }, placeOfPerson(sys, a), [a, b], causes, { a, b });
  return true;
}

/**
 * A murder inside a tribe: the group decides, by its regime, whether to drive out the murderer.
 * Those who loved the victim, or who dislike the murderer, want the exile; a chief decides alone
 * (and spares his own kin), a council by majority, a band together.
 */
export function judgeMurder(sys: ConflictSystem, killer: number, victim: number, death: number): void {
  const { humans, groups, params } = sys;
  const people = humans.people;
  if (people.alive[killer] !== 1) return;
  const tribe = groups.tribeOf(killer);
  if (!tribe || groups.tribeOf(victim) !== tribe) return;
  const social = humans.social;
  const close = (p: number): boolean => social.kinOf(p, victim) !== 0 || social.affectionFor(p, victim) >= social.params.relations.friendAffection;
  const wants = (p: number): boolean => p !== killer && social.kinOf(p, killer) === 0 && (close(p) || social.affectionFor(p, killer) < params.brawl.exileHostility);
  const leader = tribe.leaders[0] ?? -1;
  const exiled = groups.decideFor(tribe, wants);
  const vars = { nom: people.names[killer]!, victime: people.names[victim]!, groupe: tribe.name, er: people.female[killer] === 1 ? 'ère' : 'er', il: il(sys, killer) };
  if (!exiled) {
    const why = leader >= 0 && social.kinOf(leader, killer) !== 0 ? `${people.names[leader]} protège les siens` : 'les siens l’ont défendu' + e(sys, killer);
    publish(sys, CONFLICT_EVENTS.spared, params.texts.spared, { ...vars, raison: why }, placeOfPerson(sys, killer), [killer, victim], [death], { killer, victim }, [tribe.id]);
    return;
  }
  const decision = tribe.leaders.length === 1 && leader >= 0 ? `sur décision de ${people.names[leader]}` : 'les siens le décident ensemble';
  const place = placeOfPerson(sys, killer);
  const destination = groups.exile(killer, death);
  publish(sys, CONFLICT_EVENTS.exile, params.texts.exile, { ...vars, decision, destination: destination || 'reste malgré tout aux abords du camp' }, place, [killer, victim], [death], { killer, victim }, [tribe.id]);
  sys.counts.exiles++;
}
